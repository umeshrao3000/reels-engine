import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { decrypt } from "@/lib/crypto";
import { sendInstagramPrivateReply } from "@/lib/modules/meta/graph-client";

// Single responsibility (per REELS_ENGINE_V1_BLUEPRINT.md Section 1 & 6):
// sends the campaign's dmTemplate as a private reply to a single MATCHED
// ConversionLog's comment, then records the outcome. Does not match
// keywords (trigger-matcher.ts already did that to reach MATCHED), does not
// send public replies (public-reply.ts, Milestone 5), and is not wired to a
// scheduler — see matchPendingConversionLogs's equivalent caveat.

export type PrivateReplyOutcome = "sent" | "failed" | "not_matched";

export type PrivateReplyResult = {
  conversionLogId: string;
  outcome: PrivateReplyOutcome;
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
 * Sends a single MATCHED row's DM. Idempotent: a row not currently MATCHED
 * (not yet matched, or already sent/failed by an earlier run) is left
 * untouched rather than re-sent.
 */
export async function sendPrivateReply(conversionLogId: string): Promise<PrivateReplyResult> {
  const log = await prisma.conversionLog.findUniqueOrThrow({
    where: { id: conversionLogId },
    include: { campaign: { include: { socialAccount: true } } },
  });

  if (log.status !== "MATCHED") {
    logger.info("private_reply.not_matched", { conversionLogId, status: log.status });
    return { conversionLogId, outcome: "not_matched" };
  }

  // trigger-matcher.ts only ever sets status: MATCHED alongside campaignId,
  // so a MATCHED row always has its campaign relation — this is a defensive
  // guard against that invariant being violated, not an expected path.
  if (!log.campaign) {
    const error = "MATCHED row has no linked campaign";
    await markFailed(log.id, error);
    logger.warn("private_reply.failed", { conversionLogId, error });
    return { conversionLogId, outcome: "failed", error };
  }

  try {
    await sendInstagramPrivateReply({
      commentId: log.commentId,
      text: log.campaign.dmTemplate,
      pageAccessToken: decrypt(log.campaign.socialAccount.pageAccessToken),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Unknown error sending private reply";
    await markFailed(log.id, error);
    logger.warn("private_reply.failed", { conversionLogId, error });
    return { conversionLogId, outcome: "failed", error };
  }

  await prisma.conversionLog.update({
    where: { id: log.id },
    data: { status: "DM_SENT", dmSentAt: new Date() },
  });
  logger.info("private_reply.sent", { conversionLogId, campaignId: log.campaign.id });
  return { conversionLogId, outcome: "sent" };
}

/**
 * Batch entry point over every still-MATCHED row, oldest first. Not a queue
 * consumer or scheduler in its own right (no polling, no retries, no
 * backoff) — matchPendingConversionLogs's equivalent caveat applies here
 * too, ready for a future Vercel Cron tick to call.
 */
export async function sendPendingPrivateReplies(limit = 50): Promise<PrivateReplyResult[]> {
  const pending = await prisma.conversionLog.findMany({
    where: { status: "MATCHED" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results: PrivateReplyResult[] = [];
  for (const { id } of pending) {
    results.push(await sendPrivateReply(id));
  }
  return results;
}
