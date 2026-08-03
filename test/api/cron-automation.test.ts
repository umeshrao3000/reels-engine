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
    assert.ok(body.privateReply);
    assert.ok(body.publicReply);
    assert.ok(body.finalized);
    assert.ok(body.tokenRefresh);
    assert.equal(JSON.stringify(body).includes(secret), false, "the response must never echo the secret back");
  });
});

describe("GET /api/cron/automation — overlap protection", () => {
  it("returns skipped:true when the lock is already held", async () => {
    const secret = process.env.CRON_SECRET!;

    // Directly pre-acquire the real production lock id ("automation", the
    // route's default) to deterministically simulate an in-flight run,
    // rather than relying on two real requests racing each other.
    const acquired = await acquireCronLock(60_000);
    assert.equal(acquired, true, "test setup: the lock must not already be held by something else");

    try {
      const res = await fetch(`${API_TEST_BASE_URL}/api/cron/automation`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.skipped, true);
    } finally {
      await releaseCronLock();
    }
  });

  it("a genuinely concurrent pair of requests results in exactly one real run", async () => {
    const secret = process.env.CRON_SECRET!;
    await releaseCronLock(); // ensure a clean starting state

    const [a, b] = await Promise.all([
      fetch(`${API_TEST_BASE_URL}/api/cron/automation`, { headers: { Authorization: `Bearer ${secret}` } }),
      fetch(`${API_TEST_BASE_URL}/api/cron/automation`, { headers: { Authorization: `Bearer ${secret}` } }),
    ]);
    const [bodyA, bodyB] = await Promise.all([a.json(), b.json()]);

    const skippedCount = [bodyA, bodyB].filter((b) => b.skipped === true).length;
    const ranCount = [bodyA, bodyB].filter((b) => b.skipped !== true).length;
    assert.equal(skippedCount, 1, "exactly one of the two concurrent requests must be skipped as overlapping");
    assert.equal(ranCount, 1, "exactly one of the two concurrent requests must actually run");
  });
});
