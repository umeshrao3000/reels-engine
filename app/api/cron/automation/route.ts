import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { matchPendingConversionLogs } from "@/services/trigger-matcher";
import { sendPendingPrivateReplies } from "@/services/private-reply";
import { sendPendingPublicReplies } from "@/services/public-reply";
import { finalizePendingConversions } from "@/services/conversion-finalizer";
import { recoverStaleClaims, resumeAccountBlockedRows } from "@/services/recovery";
import { refreshExpiringTokens } from "@/services/token-refresh-sweep";
import { acquireCronLock, releaseCronLock } from "@/services/cron-lock";
import { CRON_LOCK_TTL_MS, CRON_TIME_BUDGET_MS, CRON_BATCH_LIMIT } from "@/services/reliability-constants";

// Phase A (Automation Reliability): the single scheduled entry point that
// drives every batch/recovery function the pipeline services expose —
// previously all fully written but called from nowhere (per
// docs/MARKET_READINESS_MASTER_PLAN.md's MR-3 section). Runs, in order:
//
//  1. Stale-claim recovery   — must run before anything else touches
//     DM_SENDING/PUBLIC_REPLYING rows, so a crashed worker's claim is
//     resolved to DELIVERY_UNCERTAIN before a retry sweep could otherwise
//     mistake it for something eligible.
//  2. Account-blocked resume — before fresh sends, so a just-reconnected
//     account's backlog is eligible again this same tick.
//  3. Matcher / private-reply / public-reply / finalize — one bounded
//     batch each. Retry-due rows are included automatically: the claim
//     inside sendPrivateReply/sendPublicReply accepts either a fresh
//     MATCHED/DM_SENT row or a due RETRY_PENDING row for that stage, so
//     there is no separate "retry-due" entry point to call.
//  4. Token-refresh sweep    — independent of ConversionLog state.
//
// vercel.json currently schedules this once daily (Vercel's Hobby plan
// rejects any cron more frequent than daily — a tighter interval was
// attempted and rejected at deploy time). Correctness doesn't depend on
// cadence — retryCount/nextRetryAt/claim leases all work regardless of how
// often this fires — but recovery latency does: on Hobby, a transient
// failure or a reconnect isn't resumed until the next day's tick, not
// within minutes. Tighten to every few minutes once on a plan that allows
// it.
//
// Protected by a shared secret (fail-closed: unset CRON_SECRET means
// nobody is authorized, not "anyone is") and a DB-backed lock so an
// overlapping invocation (a slow run still active when the next scheduled
// tick fires) is a safe no-op, not a second set of workers racing the
// first.

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed: unconfigured means no request is authorized

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return false;

  const provided = header.slice("Bearer ".length);
  const providedBuf = Buffer.from(provided);
  const secretBuf = Buffer.from(secret);
  if (providedBuf.length !== secretBuf.length) return false;

  return timingSafeEqual(providedBuf, secretBuf);
}

function countOutcomes(results: { outcome: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
  }
  return counts;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    logger.warn("cron.automation.unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Shared deadline, threaded into every batch call below — each one
  // checks it before starting its *next* item, not just once before the
  // whole batch. Without that, a single stale "start of batch" check
  // can't stop e.g. 25 sequential 15s-timeout Meta requests from running
  // one after another once the batch has already begun.
  const deadline = Date.now() + CRON_TIME_BUDGET_MS;
  const lock = await acquireCronLock(CRON_LOCK_TTL_MS);
  if (!lock.acquired) {
    logger.info("cron.automation.skipped_overlap");
    return NextResponse.json({ ok: true, skipped: true, reason: "already running" });
  }

  // Structured, count-only summary — no comment text, tokens, or raw
  // webhook payloads, per the operational-visibility requirement.
  const summary: Record<string, unknown> = {};

  try {
    summary.staleClaimsRecovered = await recoverStaleClaims();
    summary.accountBlockedResumed = await resumeAccountBlockedRows();

    const matched = await matchPendingConversionLogs(CRON_BATCH_LIMIT, deadline);
    summary.matched = countOutcomes(matched.results);
    summary.matchedSkippedByDeadline = matched.skippedByDeadline;

    // Includes both freshly-MATCHED rows and due RETRY_PENDING rows for
    // this stage — see module doc comment above.
    const privateReply = await sendPendingPrivateReplies(CRON_BATCH_LIMIT, deadline);
    summary.privateReply = countOutcomes(privateReply.results);
    summary.privateReplySkippedByDeadline = privateReply.skippedByDeadline;

    const publicReply = await sendPendingPublicReplies(CRON_BATCH_LIMIT, deadline);
    summary.publicReply = countOutcomes(publicReply.results);
    summary.publicReplySkippedByDeadline = publicReply.skippedByDeadline;

    const finalized = await finalizePendingConversions(CRON_BATCH_LIMIT, deadline);
    summary.finalized = countOutcomes(finalized.results);
    summary.finalizedSkippedByDeadline = finalized.skippedByDeadline;

    const tokenRefresh = await refreshExpiringTokens(new Date(), deadline);
    summary.tokenRefresh = tokenRefresh;

    logger.info("cron.automation.completed", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    logger.error("cron.automation.unexpected_error", {
      error: err instanceof Error ? err.message : "Unknown error",
      partialSummary: summary,
    });
    return NextResponse.json({ ok: false, error: "Internal error during automation cron run." }, { status: 500 });
  } finally {
    await releaseCronLock(lock.token);
  }
}
