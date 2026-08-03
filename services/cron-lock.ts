import { prisma } from "@/lib/prisma";

// Phase A (Automation Reliability): a single-row lock so an overlapping
// cron invocation (a slow run still in flight when the next scheduled tick
// fires) never processes the same batch concurrently. A dedicated table
// row rather than a Postgres advisory lock — Prisma's pooled connections
// don't guarantee the acquire and release of a session-scoped advisory
// lock happen on the same underlying connection, so this uses the same
// atomic conditional-update pattern as every other claim in this
// milestone instead.

const DEFAULT_LOCK_ID = "automation";

/**
 * Attempts to acquire the lock, returning true only if this call actually
 * claimed it. `ttlMs` bounds how long a lock is honored if its holder
 * never releases it (e.g. a crashed cron invocation) — after that, the
 * next attempt can reclaim it. `lockId` defaults to the one production
 * lock the cron route uses; tests pass a distinct id so concurrent test
 * files never contend over the same row.
 */
export async function acquireCronLock(
  ttlMs: number,
  now: Date = new Date(),
  lockId: string = DEFAULT_LOCK_ID
): Promise<boolean> {
  const lockedUntil = new Date(now.getTime() + ttlMs);

  // Ensure the row exists, created in an *unlocked* state — the
  // conditional updateMany below is the only step that actually acquires
  // the lock. Creating it already-locked here would make a lock's very
  // first-ever acquisition attempt fail its own claim check right after
  // creating the row.
  await prisma.cronLock.upsert({
    where: { id: lockId },
    create: { id: lockId, lockedAt: null, lockedUntil: null },
    update: {},
  });

  const claimed = await prisma.cronLock.updateMany({
    where: { id: lockId, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedAt: now, lockedUntil },
  });
  return claimed.count === 1;
}

export async function releaseCronLock(lockId: string = DEFAULT_LOCK_ID): Promise<void> {
  await prisma.cronLock.updateMany({ where: { id: lockId }, data: { lockedUntil: null } });
}
