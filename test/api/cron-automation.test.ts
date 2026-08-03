import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { acquireCronLock, releaseCronLock } from "@/services/cron-lock";
import { API_TEST_BASE_URL, startApiTestServer, stopApiTestServer } from "./support/server";

// Phase A (Automation Reliability): the cron route is a genuine new
// unauthenticated-by-default network surface (anyone who can reach the
// deployed URL can hit it) — its auth must be tested over real HTTP
// against the real built route, not just unit-tested in isolation.

before(async () => {
  await startApiTestServer();
});

after(async () => {
  await stopApiTestServer();
});

describe("GET /api/cron/automation — authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/cron/automation`);
    assert.equal(res.status, 401);
  });

  it("rejects a request with the wrong secret", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/cron/automation`, {
      headers: { Authorization: "Bearer wrong-secret" },
    });
    assert.equal(res.status, 401);
  });

  it("accepts a request with the correct secret (CRON_SECRET, set by CI)", async () => {
    const secret = process.env.CRON_SECRET;
    assert.ok(secret, "CRON_SECRET must be set in the test environment for this test to mean anything");

    const res = await fetch(`${API_TEST_BASE_URL}/api/cron/automation`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.ok, true);
    // Structured, count-only summary — never raw payloads, comment text,
    // or tokens.
    assert.equal(typeof body.staleClaimsRecovered, "number");
    assert.equal(typeof body.accountBlockedResumed, "number");
    assert.ok(body.matched);
    assert.equal(typeof body.matchedSkippedByDeadline, "number");
    assert.ok(body.privateReply);
    assert.equal(typeof body.privateReplySkippedByDeadline, "number");
    assert.ok(body.publicReply);
    assert.equal(typeof body.publicReplySkippedByDeadline, "number");
    assert.ok(body.finalized);
    assert.equal(typeof body.finalizedSkippedByDeadline, "number");
    assert.ok(body.tokenRefresh);
    assert.equal(typeof body.tokenRefresh.skippedByDeadline, "number");
    assert.equal(JSON.stringify(body).includes(secret), false, "the response must never echo the secret back");
  });
});

describe("GET /api/cron/automation — overlap protection", () => {
  it("returns skipped:true when the lock is already held", async () => {
    const secret = process.env.CRON_SECRET!;

    // Directly pre-acquire the real production lock id ("automation", the
    // route's default) to deterministically simulate an in-flight run,
    // rather than relying on two real requests racing each other.
    const lock = await acquireCronLock(60_000);
    assert.equal(lock.acquired, true, "test setup: the lock must not already be held by something else");

    try {
      const res = await fetch(`${API_TEST_BASE_URL}/api/cron/automation`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.skipped, true);
    } finally {
      await releaseCronLock(lock.token!);
    }
  });

  it("two concurrent HTTP requests arriving while the lock is externally held both back off, none run", async () => {
    // Deliberately not "fire two real cron requests and hope they race
    // each other" — against a fast (near-empty-DB) run, request A can
    // finish and release its lock before request B's handler even starts,
    // making that kind of test flaky through no fault of the lock itself
    // (the lock's own exactly-one-winner guarantee is proven
    // deterministically, under real concurrency, in cron-lock.test.ts's
    // 8-way acquireCronLock test). This test instead holds the lock
    // externally for the whole request, so overlap is guaranteed rather
    // than hoped for, and proves the *route* consistently respects it
    // under concurrent HTTP load, not just a single request at a time.
    const secret = process.env.CRON_SECRET!;
    const lock = await acquireCronLock(60_000);
    assert.equal(lock.acquired, true, "test setup: the lock must not already be held by something else");

    try {
      const [a, b] = await Promise.all([
        fetch(`${API_TEST_BASE_URL}/api/cron/automation`, { headers: { Authorization: `Bearer ${secret}` } }),
        fetch(`${API_TEST_BASE_URL}/api/cron/automation`, { headers: { Authorization: `Bearer ${secret}` } }),
      ]);
      const [bodyA, bodyB] = await Promise.all([a.json(), b.json()]);

      assert.equal(bodyA.skipped, true);
      assert.equal(bodyB.skipped, true);
    } finally {
      await releaseCronLock(lock.token!);
    }
  });
});
