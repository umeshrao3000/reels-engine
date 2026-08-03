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
