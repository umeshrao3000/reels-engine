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
    assert.equal(first.acquired, true);

    const second = await acquireCronLock(60_000, new Date(), lockId);
    assert.equal(second.acquired, false, "an already-held lock must not be acquired again");

    await releaseCronLock(first.token!, lockId);
  });

  it("release lets a subsequent acquire succeed", async () => {
    const lockId = randomUUID();
    const first = await acquireCronLock(60_000, new Date(), lockId);
    await releaseCronLock(first.token!, lockId);

    const reacquired = await acquireCronLock(60_000, new Date(), lockId);
    assert.equal(reacquired.acquired, true);

    await releaseCronLock(reacquired.token!, lockId);
  });

  it("of many concurrent acquire attempts, exactly one succeeds", async () => {
    const lockId = randomUUID();

    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => acquireCronLock(60_000, new Date(), lockId))
    );
    const successes = attempts.filter((a) => a.acquired).length;
    assert.equal(successes, 1, "exactly one concurrent acquire must win");

    const winner = attempts.find((a) => a.acquired)!;
    await releaseCronLock(winner.token!, lockId);
  });

  it("an expired lock (past its TTL) can be reclaimed with a new token", async () => {
    const lockId = randomUUID();
    const now = new Date();
    // Acquire with a TTL that's already in the past — simulates a crashed
    // cron invocation that never released its lock.
    const first = await acquireCronLock(-1000, now, lockId);
    assert.equal(first.acquired, true);

    const reclaimed = await acquireCronLock(60_000, new Date(now.getTime() + 1), lockId);
    assert.equal(reclaimed.acquired, true, "an expired lock must be reclaimable");
    assert.notEqual(reclaimed.token, first.token, "reclaiming must assign a fresh token");

    await releaseCronLock(reclaimed.token!, lockId);
  });

  it("releasing with the wrong token is a no-op and leaves the lock held", async () => {
    const lockId = randomUUID();
    const acquired = await acquireCronLock(60_000, new Date(), lockId);
    assert.equal(acquired.acquired, true);

    const releasedWithWrongToken = await releaseCronLock(randomUUID(), lockId);
    assert.equal(releasedWithWrongToken, false);

    // The lock is still held — a fresh acquire attempt must fail.
    const second = await acquireCronLock(60_000, new Date(), lockId);
    assert.equal(second.acquired, false);

    await releaseCronLock(acquired.token!, lockId);
  });

  it(
    "a previous holder's late release must never clear a lock reacquired by another worker " +
      "(A acquires, A's lease expires, B acquires with a new token, A releases late, B's lock remains held)",
    async () => {
      const lockId = randomUUID();
      const t0 = new Date();

      // 1. Worker A acquires with a short-lived lease.
      const a = await acquireCronLock(1000, t0, lockId);
      assert.equal(a.acquired, true);

      // 2. A's lease expires.
      const t1 = new Date(t0.getTime() + 2000);

      // 3. Worker B acquires — the lease is expired, so this legitimately
      // succeeds, with a brand-new token.
      const b = await acquireCronLock(60_000, t1, lockId);
      assert.equal(b.acquired, true);
      assert.notEqual(b.token, a.token);

      // 4. A, unaware its lease already expired, releases late using its
      // own (now stale) token.
      const releasedByStaleA = await releaseCronLock(a.token!, lockId);
      assert.equal(releasedByStaleA, false, "A's stale release must not succeed");

      // 5. B's lock must still be held — a third acquire attempt fails,
      // and the row's ownerToken is still B's.
      const c = await acquireCronLock(60_000, new Date(t1.getTime() + 1), lockId);
      assert.equal(c.acquired, false, "B's lock must still be held after A's stale release");

      const row = await prisma.cronLock.findUniqueOrThrow({ where: { id: lockId } });
      assert.equal(row.ownerToken, b.token);

      await releaseCronLock(b.token!, lockId);
    }
  );

  it("readable lock state persists lockedAt/lockedUntil/ownerToken on its row", async () => {
    const lockId = randomUUID();
    const acquired = await acquireCronLock(60_000, new Date(), lockId);
    const row = await prisma.cronLock.findUniqueOrThrow({ where: { id: lockId } });
    assert.ok(row.lockedAt);
    assert.ok(row.lockedUntil);
    assert.equal(row.ownerToken, acquired.token);
    await releaseCronLock(acquired.token!, lockId);
  });
});
