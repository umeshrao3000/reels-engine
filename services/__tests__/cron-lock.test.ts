import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, releaseCronLock } from "../cron-lock";

// Phase A (Automation Reliability): the cron route's overlap protection.
// Tested directly against the lock's atomic conditional-update logic
// (fast, deterministic) rather than only through real overlapping HTTP
// requests — see test/api/cron-automation.test.ts for the HTTP-level
// auth/skip-response coverage.
//
// Every test uses its own randomUUID lock id, not the real "automation"
// id the cron route uses in production — the lock is a genuine global
// singleton row by design, so sharing one id across concurrently-running
// test files (Node's test runner runs files in parallel) would make these
// assertions flaky through no fault of the lock logic itself.

describe("acquireCronLock / releaseCronLock", () => {
  it("a second acquire attempt fails while the lock is held", async () => {
    const lockId = randomUUID();
    const first = await acquireCronLock(60_000, new Date(), lockId);
    assert.equal(first, true);

    const second = await acquireCronLock(60_000, new Date(), lockId);
    assert.equal(second, false, "an already-held lock must not be acquired again");

    await releaseCronLock(lockId);
  });

  it("release lets a subsequent acquire succeed", async () => {
    const lockId = randomUUID();
    await acquireCronLock(60_000, new Date(), lockId);
    await releaseCronLock(lockId);

    const reacquired = await acquireCronLock(60_000, new Date(), lockId);
    assert.equal(reacquired, true);

    await releaseCronLock(lockId);
  });

  it("of many concurrent acquire attempts, exactly one succeeds", async () => {
    const lockId = randomUUID();

    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => acquireCronLock(60_000, new Date(), lockId))
    );
    const successes = attempts.filter(Boolean).length;
    assert.equal(successes, 1, "exactly one concurrent acquire must win");

    await releaseCronLock(lockId);
  });

  it("an expired lock (past its TTL) can be reclaimed without an explicit release", async () => {
    const lockId = randomUUID();
    const now = new Date();
    // Acquire with a TTL that's already in the past — simulates a crashed
    // cron invocation that never released its lock.
    const acquired = await acquireCronLock(-1000, now, lockId);
    assert.equal(acquired, true);

    const reclaimed = await acquireCronLock(60_000, new Date(now.getTime() + 1), lockId);
    assert.equal(reclaimed, true, "an expired lock must be reclaimable");

    await releaseCronLock(lockId);
  });

  it("readable lock state persists lockedAt/lockedUntil on its row", async () => {
    const lockId = randomUUID();
    await acquireCronLock(60_000, new Date(), lockId);
    const row = await prisma.cronLock.findUniqueOrThrow({ where: { id: lockId } });
    assert.ok(row.lockedAt);
    assert.ok(row.lockedUntil);
    await releaseCronLock(lockId);
  });
});
