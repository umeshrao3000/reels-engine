import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { decrypt } from "@/lib/crypto";
import { sendInstagramPublicReply } from "@/lib/modules/meta/graph-client";
import { MetaApiError, classifyNetworkFailure } from "@/lib/modules/meta/meta-api-error";
import { resolveSendFailure } from "./pipeline-transitions";
import { CLAIM_LEASE_MS } from "./reliability-constants";

// Posts the campaign's publicReplyTemplate as a public reply on a single
// row's comment, then records the outcome. Acts on DM_SENT rather than
// MATCHED — DeliveryStatus's pipeline order (PENDING -> MATCHED -> DM_SENT
// -> PUBLIC_REPLIED -> SUCCESS) reads as "public reply follows a
// successful private reply," so this only touches rows private-reply.ts
// has already sent a DM for.
//
// Phase A (Automation Reliability): same atomic-claim rewrite as
// private-reply.ts, for the identical check-then-act race — see that
// file's doc comment and services/pipeline-transitions.ts for the shared
// failure-classification state machine.

export type PublicReplyOutcome =
  | "sent"
  | "not_claimed"
  | "account_blocked"
  | "retry_pending"
  | "dead_letter"
  | "delivery_uncertain";

export type PublicReplyResult = {
  conversionLogId: string;
  outcome: PublicReplyOutcome;
  error?: string;
};

/**
 * Atomically claims a row for the public-reply stage. Succeeds only if the
 * row is still DM_SENT, or is a RETRY_PENDING row whose retry is due and
 * was itself waiting on this same stage. See private-reply.ts's
 * claimForPrivateReply for the full rationale — identical pattern.
 */
async function claimForPublicReply(conversionLogId: string): Promise<boolean> {
  const now = new Date();
  const result = await prisma.conversionLog.updateMany({
    where: {
      id: conversionLogId,
      OR: [
        { status: "DM_SENT" },
        { status: "RETRY_PENDING", pendingStage: "PUBLIC_REPLY", nextRetryAt: { lte: now } },
      ],
    },
    data: {
      status: "PUBLIC_REPLYING",
      claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
      lastAttemptAt: now,
    },
  });
  return result.count === 1;
}

export async function sendPublicReply(conversionLogId: string): Promise<PublicReplyResult> {
  const claimed = await claimForPublicReply(conversionLogId);
  if (!claimed) {
    logger.info("public_reply.not_claimed", { conversionLogId });
    return { conversionLogId, outcome: "not_claimed" };
  }

  const log = await prisma.conversionLog.findUniqueOrThrow({
    where: { id: conversionLogId },
    include: { campaign: { include: { socialAccount: true } } },
  });

  // A DM_SENT row was MATCHED (and therefore has a campaign) before
  // private-reply.ts sent it — defensive guard against that invariant
  // being violated, not an expected path.
  if (!log.campaign) {
    const error = "Claimed row has no linked campaign";
    await prisma.conversionLog.update({
      where: { id: log.id },
      data: {
        status: "DEAD_LETTER",
        pendingStage: "PUBLIC_REPLY",
        errorMessage: error,
        lastFailureClassification: "PERMANENT",
        claimExpiresAt: null,
        retryCount: { increment: 1 },
      },
    });
    logger.warn("public_reply.failed", { conversionLogId, error });
    return { conversionLogId, outcome: "dead_letter", error };
  }

  const { socialAccount } = log.campaign;

  if (socialAccount.status !== "ACTIVE" || !socialAccount.isConnected) {
    const error = `Social account is not eligible to send (status=${socialAccount.status}, isConnected=${socialAccount.isConnected})`;
    await prisma.conversionLog.update({
      where: { id: log.id },
      data: {
        status: "ACCOUNT_BLOCKED",
        pendingStage: "PUBLIC_REPLY",
        errorMessage: error,
        claimExpiresAt: null,
      },
    });
    logger.info("public_reply.account_blocked", { conversionLogId, socialAccountId: socialAccount.id });
    return { conversionLogId, outcome: "account_blocked", error };
  }

  let pageAccessToken: string;
  try {
    pageAccessToken = decrypt(socialAccount.pageAccessToken);
  } catch (err) {
    const error = err instanceof Error ? err.message : "Failed to decrypt stored access token";
    await prisma.conversionLog.update({
      where: { id: log.id },
      data: {
        status: "DEAD_LETTER",
        pendingStage: "PUBLIC_REPLY",
        errorMessage: error,
        lastFailureClassification: "PERMANENT",
        claimExpiresAt: null,
        retryCount: { increment: 1 },
      },
    });
    logger.error("public_reply.decrypt_failed", { conversionLogId, error });
    return { conversionLogId, outcome: "dead_letter", error };
  }

  try {
    const sendResult = await sendInstagramPublicReply({
      commentId: log.commentId,
      text: log.campaign.publicReplyTemplate,
      pageAccessToken,
    });

    await prisma.conversionLog.update({
      where: { id: log.id },
      data: {
        status: "PUBLIC_REPLIED",
        publicRepliedAt: new Date(),
        publicReplyId: sendResult.id,
        claimExpiresAt: null,
        pendingStage: null,
        lastFailureClassification: null,
        errorMessage: null,
      },
    });
    logger.info("public_reply.sent", { conversionLogId, campaignId: log.campaign.id });
    return { conversionLogId, outcome: "sent" };
  } catch (err) {
    const metaError = err instanceof MetaApiError ? err : classifyNetworkFailure(err);

    if (metaError.classification === "AUTH") {
      await prisma.socialAccount.update({ where: { id: socialAccount.id }, data: { status: "TOKEN_EXPIRED" } });
    }

    const outcome = await resolveSendFailure({
      conversionLogId: log.id,
      stage: "PUBLIC_REPLY",
      currentRetryCount: log.retryCount,
      metaError,
    });

    logger.warn("public_reply.failed", {
      conversionLogId,
      error: metaError.message,
      classification: metaError.classification,
      outcome,
    });
    return { conversionLogId, outcome, error: metaError.message };
  }
}

/**
 * Batch entry point: every currently-eligible row for this stage, oldest
 * first — freshly DM_SENT rows and due RETRY_PENDING rows alike. Called by
 * the cron route; the caller bounds total runtime across all stages.
 */
export async function sendPendingPublicReplies(limit = 50): Promise<PublicReplyResult[]> {
  const now = new Date();
  const candidates = await prisma.conversionLog.findMany({
    where: {
      OR: [
        { status: "DM_SENT" },
        { status: "RETRY_PENDING", pendingStage: "PUBLIC_REPLY", nextRetryAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results: PublicReplyResult[] = [];
  for (const { id } of candidates) {
    results.push(await sendPublicReply(id));
  }
  return results;
}
