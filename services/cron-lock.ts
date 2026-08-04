import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Phase A (Automation Reliability): a single-row lock so an overlapping
// cron invocation (a slow run still in flight when the next scheduled tick
// fires) never processes the same batch concurrently. A dedicated table
// row rather than a Postgres advisory lock — Prisma's pooled connections
// don't guarantee the acquire and release of a session-scoped advisory
// lock happen on the same underlying connection, so this uses the same
// atomic conditional-update pattern as every other claim in this
// milestone instead.
//
// Ownership token: release must never clear a lock it doesn't actually
// hold. Without a token, this sequence is a real bug — worker A acquires,
// A's lease expires, worker B acquires (the row is legitimately
// reclaimable once expired), A finally wakes up and calls release: a
// token-less release would clear B's still-valid lock by id alone, since
// it has no way to tell "I'm not the current holder." Each acquisition
// gets a fresh random token; release only succeeds if the row's
// ownerToken still matches the token the caller was given.

const DEFAULT_LOCK_ID = "automation";

export type AcquireResult = { acquired: true; token: string } | { acquired: false; token: null };

/**
 * Attempts to acquire the lock. `ttlMs` bounds how long a lease is honored
 * if its holder never releases it (e.g. a crashed cron invocation) —
 * after that, the next attempt can reclaim it with a new token. `lockId`
 * defaults to the one production lock the cron route uses; tests pass a
 * distinct id so concurrent test files never contend over the same row.
 */
export async function acquireCronLock(
  ttlMs: number,
  now: Date = new Date(),
  lockId: string = DEFAULT_LOCK_ID
): Promise<AcquireResult> {
  const lockedUntil = new Date(now.getTime() + ttlMs);
  const token = randomUUID();

  // Ensure the row exists, created in an *unlocked* state — the
  // conditional updateMany below is the only step that actually acquires
  // the lock. Creating it already-locked here would make a lock's very
  // first-ever acquisition attempt fail its own claim check right after
  // creating the row.
  //
  // On the row's very first creation, multiple concurrent callers can race
  // this upsert's insert branch; the loser gets a unique-constraint error
  // rather than Prisma silently falling back to its update branch. That's
  // fine — it only means another caller already created the (unlocked)
  // row, which is exactly the state this call wants, so it's safe to swallow.
  try {
    await prisma.cronLock.upsert({
      where: { id: lockId },
      create: { id: lockId, lockedAt: null, lockedUntil: null, ownerToken: null },
      update: {},
    });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      throw err;
    }
  }

  const claimed = await prisma.cronLock.updateMany({
    where: { id: lockId, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedAt: now, lockedUntil, ownerToken: token },
  });

  if (claimed.count !== 1) return { acquired: false, token: null };
  return { acquired: true, token };
}

/**
 * Releases the lock, but only if `token` matches the row's current
 * ownerToken — a stale release from an expired-and-reclaimed holder is a
 * safe no-op, not a way to clear someone else's active lock. Returns
 * whether this call actually released it.
 */
export async function releaseCronLock(token: string, lockId: string = DEFAULT_LOCK_ID): Promise<boolean> {
  const released = await prisma.cronLock.updateMany({
    where: { id: lockId, ownerToken: token },
    data: { lockedUntil: null, ownerToken: null },
  });
  return released.count === 1;
}
