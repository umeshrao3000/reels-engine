import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { normalizeCommentText } from "@/utils/normalize-comment";
import { runBatchWithDeadline, type BatchOutcome } from "./batch-runner";

// Single responsibility (per REELS_ENGINE_V1_BLUEPRINT.md Section 1 & 6):
// matches a persisted ConversionLog row against the active Campaign(s) for
// its Reel, records the outcome, and upserts a Lead on match. Does not send
// DMs, does not send public replies, does not call any Meta API, and is not
// wired to a scheduler — that's private-reply.ts / public-reply.ts / the
// Vercel Cron consumer (Milestones 4+).

export type MatchOutcome = "matched" | "skipped_no_campaign" | "skipped_no_keyword" | "already_processed";

export type MatchResult = {
  conversionLogId: string;
  outcome: MatchOutcome;
  campaignId?: string;
  matchedKeyword?: string;
  leadId?: string;
};

function extractMediaId(rawPayload: Prisma.JsonValue | null): string | undefined {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return undefined;
  const media = (rawPayload as Record<string, unknown>).media;
  if (!media || typeof media !== "object" || Array.isArray(media)) return undefined;
  const id = (media as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

function extractUsername(rawPayload: Prisma.JsonValue | null): string | undefined {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return undefined;
  const from = (rawPayload as Record<string, unknown>).from;
  if (!from || typeof from !== "object" || Array.isArray(from)) return undefined;
  const username = (from as Record<string, unknown>).username;
  return typeof username === "string" ? username : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary match, not substring: a "deal" keyword must not fire on
// "dealer". Both sides are already lowercase by the time they get here.
function findMatchedKeyword(normalizedText: string, keywords: string[]): string | undefined {
  return keywords.find((keyword) => {
    if (!keyword) return false;
    return new RegExp(`\\b${escapeRegExp(keyword)}\\b`).test(normalizedText);
  });
}

/**
 * Matches a single persisted ConversionLog row. Idempotent: a row not still
 * at PENDING is assumed already processed (matched or skipped by an earlier
 * run) and is left untouched rather than re-matched.
 *
 * Phase A (Automation Reliability): the final status write is a
 * conditional `updateMany` guarded on `status: "PENDING"`, not a plain
 * `update`. Matching itself has no external side effect (Lead upsert is
 * already idempotent), so two concurrent calls computing the same result
 * twice is harmless — what must not happen is both calls *reporting*
 * "matched" and each triggering their own downstream private-reply send.
 * The conditional update ensures only the caller that actually flips
 * PENDING -> MATCHED/SKIPPED gets that outcome; a second, losing caller
 * sees `count === 0` and reports `already_processed` instead. No claim/
 * lease state is needed here — unlike private-reply.ts/public-reply.ts,
 * there's no external call in flight to protect against a crash mid-way.
 */
export async function matchConversionLog(conversionLogId: string): Promise<MatchResult> {
  const log = await prisma.conversionLog.findUniqueOrThrow({ where: { id: conversionLogId } });

  if (log.status !== "PENDING") {
    logger.info("trigger.match.already_processed", { conversionLogId, status: log.status });
    return { conversionLogId, outcome: "already_processed" };
  }

  const mediaId = extractMediaId(log.rawPayload);
  const campaigns = mediaId
    ? await prisma.campaign.findMany({
        where: { instagramMediaId: mediaId, isActive: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const normalizedText = normalizeCommentText(log.commentText);

  for (const campaign of campaigns) {
    const matchedKeyword = findMatchedKeyword(normalizedText, campaign.triggerKeywords);
    if (!matchedKeyword) continue;

    const lead = log.instagramUserId
      ? await prisma.lead.upsert({
          where: { instagramUserId: log.instagramUserId },
          create: {
            instagramUserId: log.instagramUserId,
            handle: extractUsername(log.rawPayload) ?? null,
          },
          update: {
            handle: extractUsername(log.rawPayload) ?? undefined,
            lastInteractedAt: new Date(),
          },
        })
      : null;

    const claimed = await prisma.conversionLog.updateMany({
      where: { id: log.id, status: "PENDING" },
      data: {
        campaignId: campaign.id,
        leadId: lead?.id,
        matchedKeyword,
        status: "MATCHED",
      },
    });
    if (claimed.count === 0) {
      logger.info("trigger.match.already_processed", { conversionLogId });
      return { conversionLogId, outcome: "already_processed" };
    }

    logger.info("trigger.match.matched", { conversionLogId, campaignId: campaign.id, matchedKeyword });
    return { conversionLogId, outcome: "matched", campaignId: campaign.id, matchedKeyword, leadId: lead?.id };
  }

  const outcome: MatchOutcome = campaigns.length === 0 ? "skipped_no_campaign" : "skipped_no_keyword";
  const claimed = await prisma.conversionLog.updateMany({
    where: { id: log.id, status: "PENDING" },
    data: { status: "SKIPPED" },
  });
  if (claimed.count === 0) {
    logger.info("trigger.match.already_processed", { conversionLogId });
    return { conversionLogId, outcome: "already_processed" };
  }
  logger.info("trigger.match.skipped", { conversionLogId, reason: outcome });
  return { conversionLogId, outcome };
}

/**
 * Batch entry point over every still-PENDING row, oldest first. Called by
 * the cron route. `deadline` (epoch ms), if given, is checked before each
 * row — matching has no external call, but the check is applied uniformly
 * across every batch stage so no stage can quietly run long regardless of
 * `limit`.
 */
export async function matchPendingConversionLogs(
  limit = 50,
  deadline?: number
): Promise<BatchOutcome<MatchResult>> {
  const pending = await prisma.conversionLog.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  return runBatchWithDeadline(pending.map((row) => row.id), deadline, matchConversionLog);
}
