import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { decrypt } from "@/lib/crypto";
import { sendInstagramPrivateReply } from "@/lib/modules/meta/graph-client";
import { MetaApiError, classifyNetworkFailure } from "@/lib/modules/meta/meta-api-error";
import { resolveSendFailure } from "./pipeline-transitions";
import { CLAIM_LEASE_MS } from "./reliability-constants";

// Sends the campaign's dmTemplate as a private reply to a single row's
// comment, then records the outcome. Does not match keywords
// (trigger-matcher.ts already did that), does not send public replies
// (public-reply.ts).
//
// Phase A (Automation Reliability): the previous version read `status`,
// checked it in JS, then wrote the result — a check-then-act race where two
// concurrent calls for the same row could both pass the guard and both send
// a duplicate DM. This version atomically claims the row (MATCHED or a due
// RETRY_PENDING -> DM_SENDING) via a single conditional UPDATE before doing
// anything else: at most one caller's claim can ever succeed for a given
// row, so at most one caller ever reaches the Meta call.

export type PrivateReplyOutcome =
  | "sent"
  | "not_claimed"
  | "account_blocked"
  | "retry_pending"
  | "dead_letter"
  | "delivery_uncertain";

export type PrivateReplyResult = {
  conversionLogId: string;
  outcome: PrivateReplyOutcome;
  error?: string;
};

/**
 * Atomically claims a row for the private-reply stage. Succeeds only if the
 * row is still MATCHED, or is a RETRY_PENDING row whose retry is due and
 * was itself waiting on this same stage — the exact same entry point
 * serves both the fresh webhook path and the cron retry sweep, so the two
 * can never race each other on the same row. Returns false if another
 * caller already holds the claim (or the row was never eligible) — a safe,
 * expected no-op, not an error.
 */
async function claimForPrivateReply(conversionLogId: string): Promise<boolean> {
  const now = new Date();
  const result = await prisma.conversionLog.updateMany({
    where: {
      id: conversionLogId,
      OR: [
        { status: "MATCHED" },
        { status: "RETRY_PENDING", pendingStage: "PRIVATE_REPLY", nextRetryAt: { lte: now } },
      ],
    },
    data: {
      status: "DM_SENDING",
      claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
      lastAttemptAt: now,
    },
  });
  return result.count === 1;
}

export async function sendPrivateReply(conversionLogId: string): Promise<PrivateReplyResult> {
  const claimed = await claimForPrivateReply(conversionLogId);
  if (!claimed) {
    logger.info("private_reply.not_claimed", { conversionLogId });
    return { conversionLogId, outcome: "not_claimed" };
  }

  const log = await prisma.conversionLog.findUniqueOrThrow({
    where: { id: conversionLogId },
    include: { campaign: { include: { socialAccount: true } } },
  });

  // A DM_SENDING row is only ever reached via a claim from MATCHED or a
  // PRIVATE_REPLY-stage RETRY_PENDING, both of which always carry a
  // campaign — defensive guard against that invariant being violated, not
  // an expected path. Not retryable: a missing campaign won't fix itself.
  if (!log.campaign) {
    const error = "Claimed row has no linked campaign";
    await prisma.conversionLog.update({
      where: { id: log.id },
      data: {
        status: "DEAD_LETTER",
        pendingStage: "PRIVATE_REPLY",
        errorMessage: error,
        lastFailureClassification: "PERMANENT",
        claimExpiresAt: null,
        retryCount: { increment: 1 },
      },
    });
    logger.warn("private_reply.failed", { conversionLogId, error });
    return { conversionLogId, outcome: "dead_letter", error };
  }

  const { socialAccount } = log.campaign;

  // Account enforcement: both conditions required. A disconnected or
  // token-expired account must never reach the Meta call. Recoverable, not
  // a dead letter — services/recovery.ts resumes these once the account
  // reconnects.
  if (socialAccount.status !== "ACTIVE" || !socialAccount.isConnected) {
    const error = `Social account is not eligible to send (status=${socialAccount.status}, isConnected=${socialAccount.isConnected})`;
    await prisma.conversionLog.update({
      where: { id: log.id },
      data: {
        status: "ACCOUNT_BLOCKED",
        pendingStage: "PRIVATE_REPLY",
        errorMessage: error,
        claimExpiresAt: null,
      },
    });
    logger.info("private_reply.account_blocked", { conversionLogId, socialAccountId: socialAccount.id });
    return { conversionLogId, outcome: "account_blocked", error };
  }

  let pageAccessToken: string;
  try {
    pageAccessToken = decrypt(socialAccount.pageAccessToken);
  } catch (err) {
    // A malformed/undecryptable stored token is a data problem, not a Meta
    // failure or something a retry can fix.
    const error = err instanceof Error ? err.message : "Failed to decrypt stored access token";
    await prisma.conversionLog.update({
      where: { id: log.id },
      data: {
        status: "DEAD_LETTER",
        pendingStage: "PRIVATE_REPLY",
        errorMessage: error,
        lastFailureClassification: "PERMANENT",
        claimExpiresAt: null,
        retryCount: { increment: 1 },
      },
    });
    logger.error("private_reply.decrypt_failed", { conversionLogId, error });
    return { conversionLogId, outcome: "dead_letter", error };
  }

  try {
    const sendResult = await sendInstagramPrivateReply({
      commentId: log.commentId,
      text: log.campaign.dmTemplate,
      pageAccessToken,
    });

    await prisma.conversionLog.update({
      where: { id: log.id },
      data: {
        status: "DM_SENT",
        dmSentAt: new Date(),
        privateReplyMessageId: sendResult.message_id,
        claimExpiresAt: null,
        pendingStage: null,
        lastFailureClassification: null,
        errorMessage: null,
      },
    });
    logger.info("private_reply.sent", { conversionLogId, campaignId: log.campaign.id });
    return { conversionLogId, outcome: "sent" };
  } catch (err) {
    const metaError = err instanceof MetaApiError ? err : classifyNetworkFailure(err);

    if (metaError.classification === "AUTH") {
      await prisma.socialAccount.update({ where: { id: socialAccount.id }, data: { status: "TOKEN_EXPIRED" } });
    }

    const outcome = await resolveSendFailure({
      conversionLogId: log.id,
      stage: "PRIVATE_REPLY",
      currentRetryCount: log.retryCount,
      metaError,
    });

    logger.warn("private_reply.failed", {
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
 * first — freshly MATCHED rows and due RETRY_PENDING rows alike (the claim
 * inside sendPrivateReply is what actually decides eligibility; this is
 * just the candidate list). Called by the cron route
 * (app/api/cron/automation/route.ts); the caller is responsible for
 * bounding total runtime across all stages.
 */
export async function sendPendingPrivateReplies(limit = 50): Promise<PrivateReplyResult[]> {
  const now = new Date();
  const candidates = await prisma.conversionLog.findMany({
    where: {
      OR: [
        { status: "MATCHED" },
        { status: "RETRY_PENDING", pendingStage: "PRIVATE_REPLY", nextRetryAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results: PrivateReplyResult[] = [];
  for (const { id } of candidates) {
    results.push(await sendPrivateReply(id));
  }
  return results;
}
