// Phase A (Automation Reliability): fixed, internal retry/claim policy.
// Not customer-facing configuration — a single conservative constant set
// for the beta, per the master plan's explicit exclusion of per-customer
// retry policy.

// How long a DM_SENDING/PUBLIC_REPLYING claim is valid before a stale-claim
// sweep considers the worker that took it dead. Generous relative to a
// single Meta Send API call so a slow-but-alive request is never preempted.
export const CLAIM_LEASE_MS = 2 * 60 * 1000; // 2 minutes

// A transient failure is retried up to this many times before the row is
// dead-lettered instead of scheduled again.
export const MAX_RETRY_ATTEMPTS = 5;

const RETRY_BASE_MS = 30 * 1000; // 30s
const RETRY_MAX_MS = 30 * 60 * 1000; // 30 minutes cap

/**
 * Exponential backoff, bounded. `attempt` is the 1-indexed retry attempt
 * number (i.e. the post-increment retryCount) — attempt 1 waits ~30s,
 * attempt 2 ~60s, doubling each time up to the 30-minute cap.
 */
export function computeBackoffMs(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), RETRY_MAX_MS);
}

// Token-refresh sweep: start attempting a refresh once a token is within
// this window of its recorded expiry. Long-lived Instagram tokens are
// valid ~60 days and refreshable any time before they expire, so a few
// days of runway comfortably survives a missed cron tick or two.
export const TOKEN_REFRESH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

// Cron route (app/api/cron/automation/route.ts) timing policy.
//
// CRON_TIME_BUDGET_MS bounds how long the route keeps *starting* new work;
// each batch stage checks it before every item, not just once at the
// start of the whole run, so the true worst-case wall time is the budget
// plus at most one in-flight item's own timeout per stage (graph-client.ts's
// REQUEST_TIMEOUT_MS, 15s) — a deadline check only stops new work from
// *starting*, it doesn't abort work already in flight.
//
// CRON_LOCK_TTL_MS must safely exceed that worst case, or a still-legitimately-
// running invocation could have its lock reclaimed out from under it. With 5
// sequential Meta-call-bearing stages (private-reply, public-reply, finalize
// has none, token-refresh) each able to overrun the budget by one item's
// worst case (~15s), worst-case total is budget + ~4*15s = ~105s — the 5
// minute TTL below leaves comfortable margin over that.
export const CRON_TIME_BUDGET_MS = 45 * 1000; // stay well under typical serverless function limits
export const CRON_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes — must exceed CRON_TIME_BUDGET_MS with margin
export const CRON_BATCH_LIMIT = 25;
