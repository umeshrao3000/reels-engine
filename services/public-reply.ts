import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { sendInstagramPublicReply } from "@/lib/modules/meta/graph-client";

// Single responsibility (per REELS_ENGINE_V1_BLUEPRINT.md Section 1 & 6):
// posts the campaign's publicReplyTemplate as a public reply on a single
// DM_SENT ConversionLog's comment, then records the outcome. Acts on
// DM_SENT rather than MATCHED — DeliveryStatus's pipeline order
// (PENDING -> MATCHED -> DM_SENT -> PUBLIC_REPLIED -> SUCCESS) reads as
// "public reply follows a successful private reply," so this only touches
// rows private-reply.ts has already sent a DM for, never racing it on the
// same MATCHED row. Not wired to a scheduler — same caveat as
// matchPendingConversionLogs / sendPendingPrivateReplies.

export type PublicReplyOutcome = "sent" | "failed" | "not_ready";

export type PublicReplyResult = {
  conversionLogId: string;
  outcome: PublicReplyOutcome;
  error?: string;
};

async function markFailed(conversionLogId: string, errorMessage: string): Promise<void> {
  await prisma.conversionLog.update({
    where: { id: conversionLogId },
    data: {
      status: "FAILED",
      errorMessage,
      retryCount: { increment: 1 },
    },
  });
}

/**
 * Sends a single DM_SENT row's public reply. Idempotent: a row not
 * currently DM_SENT (not yet sent a DM, or already publicly replied/failed
 * by an earlier run) is left untouched rather than re-sent.
 */
export async function sendPublicReply(conversionLogId: string): Promise<PublicReplyResult> {
  const log = await prisma.conversionLog.findUniqueOrThrow({
    where: { id: conversionLogId },
    include: { campaign: { include: { socialAccount: true } } },
  });

  if (log.status !== "DM_SENT") {
    logger.info("public_reply.not_ready", { conversionLogId, status: log.status });
    return { conversionLogId, outcome: "not_ready" };
  }

  // A DM_SENT row was MATCHED (and therefore has a campaign) before
  // private-reply.ts sent it — this is a defensive guard against that
  // invariant being violated, not an expected path.
  if (!log.campaign) {
    const error = "DM_SENT row has no linked campaign";
    await markFailed(log.id, error);
    logger.warn("public_reply.failed", { conversionLogId, error });
    return { conversionLogId, outcome: "failed", error };
  }

  try {
    await sendInstagramPublicReply({
      commentId: log.commentId,
      text: log.campaign.publicReplyTemplate,
      pageAccessToken: log.campaign.socialAccount.pageAccessToken,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error sending public reply";
    await markFailed(log.id, error);
    logger.warn("public_reply.failed", { conversionLogId, error });
    return { conversionLogId, outcome: "failed", error };
  }

  await prisma.conversionLog.update({
    where: { id: log.id },
    data: { status: "PUBLIC_REPLIED", publicRepliedAt: new Date() },
  });
  logger.info("public_reply.sent", { conversionLogId, campaignId: log.campaign.id });
  return { conversionLogId, outcome: "sent" };
}

/**
 * Batch entry point over every still-DM_SENT row, oldest first. Not a queue
 * consumer or scheduler in its own right (no polling, no retries, no
 * backoff) — same non-scheduler caveat as sendPendingPrivateReplies.
 */
export async function sendPendingPublicReplies(limit = 50): Promise<PublicReplyResult[]> {
  const pending = await prisma.conversionLog.findMany({
    where: { status: "DM_SENT" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results: PublicReplyResult[] = [];
  for (const { id } of pending) {
    results.push(await sendPublicReply(id));
  }
  return results;
}
