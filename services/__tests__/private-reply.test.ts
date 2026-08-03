import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  createTestSocialAccount,
  createTestCampaign,
  createTestConversionLog,
  cleanupTestSocialAccount,
} from "@/lib/test-support/db-fixtures";
import {
  MockMetaServer,
  metaSuccessPrivateReply,
  metaTransient5xx,
  metaPermanentBadRequest,
  metaAuthExpiredToken,
  metaPermissionForbidden,
  metaConfirmedTokenInvalid403,
} from "@/lib/test-support/mock-meta-server";
import { sendPrivateReply, sendPendingPrivateReplies } from "../private-reply";
import { MAX_RETRY_ATTEMPTS, computeBackoffMs } from "../reliability-constants";

// Phase A (Automation Reliability): sendPrivateReply previously had zero
// test coverage at all, despite being the exact file the confirmed
// duplicate-send race lived in. These tests exercise the real atomic-claim
// mechanism against a real Postgres row and a real (local, mocked) HTTP
// server — no stubbing of the claim logic itself.

const mockMeta = new MockMetaServer(() => metaSuccessPrivateReply());

let socialAccountId: string;
let campaignId: string;

before(async () => {
  const url = await mockMeta.start();
  process.env.META_GRAPH_API_BASE_URL = url;
});

after(async () => {
  await mockMeta.stop();
});

beforeEach(async () => {
  const account = await createTestSocialAccount();
  socialAccountId = account.id;
  const campaign = await createTestCampaign(socialAccountId);
  campaignId = campaign.id;
  mockMeta.setHandler(() => metaSuccessPrivateReply());
});

afterEach(async () => {
  await cleanupTestSocialAccount(socialAccountId);
});

describe("sendPrivateReply — atomic claim under concurrency", () => {
  it("two concurrent workers on the same row: exactly one Meta call, exactly one 'sent'", async () => {
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });

    const [a, b] = await Promise.all([sendPrivateReply(log.id), sendPrivateReply(log.id)]);

    const outcomes = [a.outcome, b.outcome].sort();
    assert.deepEqual(outcomes, ["not_claimed", "sent"]);
    assert.equal(requestCount, 1, "Meta must be called exactly once, not twice");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DM_SENT");
  });

  it("the claim loser exits without ever reaching the Meta call", async () => {
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });

    const winner = await sendPrivateReply(log.id);
    assert.equal(winner.outcome, "sent");
    assert.equal(requestCount, 1);

    // Row is now DM_SENT — a second call must not re-claim it at all.
    const loser = await sendPrivateReply(log.id);
    assert.equal(loser.outcome, "not_claimed");
    assert.equal(requestCount, 1, "the loser must not have made a second Meta call");
  });

  it("captures Meta's message id on success", async () => {
    mockMeta.setHandler(() => metaSuccessPrivateReply("mid.captured-123"));
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "sent");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.privateReplyMessageId, "mid.captured-123");
    assert.ok(row.dmSentAt);
  });
});

describe("sendPrivateReply — retry classification and backoff", () => {
  it("a transient failure schedules a retry with a bounded backoff", async () => {
    mockMeta.setHandler(() => metaTransient5xx);
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    const before = Date.now();
    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "retry_pending");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "RETRY_PENDING");
    assert.equal(row.pendingStage, "PRIVATE_REPLY");
    assert.equal(row.lastFailureClassification, "TRANSIENT");
    assert.equal(row.retryCount, 1);
    assert.ok(row.nextRetryAt);

    const expectedDelay = computeBackoffMs(1);
    const actualDelay = row.nextRetryAt!.getTime() - before;
    // Generous tolerance for test execution time, not the backoff formula.
    assert.ok(
      Math.abs(actualDelay - expectedDelay) < 2_000,
      `expected nextRetryAt ~${expectedDelay}ms out, got ${actualDelay}ms`
    );
  });

  it("does not re-claim a RETRY_PENDING row before nextRetryAt", async () => {
    mockMeta.setHandler(() => metaTransient5xx);
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });
    await sendPrivateReply(log.id); // -> RETRY_PENDING, nextRetryAt in the future

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });

    const tooSoon = await sendPrivateReply(log.id);
    assert.equal(tooSoon.outcome, "not_claimed");
    assert.equal(requestCount, 0, "a not-yet-due retry must not call Meta");
  });

  it("retries a due RETRY_PENDING row and can succeed on a later attempt", async () => {
    mockMeta.setHandler(() => metaTransient5xx);
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });
    await sendPrivateReply(log.id); // attempt 1 -> RETRY_PENDING

    // Simulate the backoff having elapsed (this is exactly what the cron
    // retry-due sweep would find on a later tick).
    await prisma.conversionLog.update({ where: { id: log.id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });

    mockMeta.setHandler(() => metaSuccessPrivateReply());
    const retried = await sendPrivateReply(log.id);
    assert.equal(retried.outcome, "sent");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DM_SENT");
  });

  it("exhausting MAX_RETRY_ATTEMPTS dead-letters instead of scheduling another retry", async () => {
    mockMeta.setHandler(() => metaTransient5xx);
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const result = await sendPrivateReply(log.id);
      if (attempt < MAX_RETRY_ATTEMPTS) {
        assert.equal(result.outcome, "retry_pending", `attempt ${attempt} should still be retryable`);
        await prisma.conversionLog.update({
          where: { id: log.id },
          data: { nextRetryAt: new Date(Date.now() - 1000) },
        });
      } else {
        assert.equal(result.outcome, "dead_letter", `attempt ${attempt} should exhaust retries`);
      }
    }

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DEAD_LETTER");
    assert.equal(row.retryCount, MAX_RETRY_ATTEMPTS);
    assert.equal(row.nextRetryAt, null);

    // And a dead letter is never picked up again.
    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });
    const finalAttempt = await sendPrivateReply(log.id);
    assert.equal(finalAttempt.outcome, "not_claimed");
    assert.equal(requestCount, 0);
  });

  it("backoff is bounded even for a very large attempt number", () => {
    const delay = computeBackoffMs(50);
    assert.ok(delay <= 30 * 60 * 1000, `expected the 30-minute cap, got ${delay}ms`);
    assert.ok(delay > 0);
  });

  it("a permanent failure dead-letters immediately, without consuming retry attempts", async () => {
    mockMeta.setHandler(() => metaPermanentBadRequest);
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "dead_letter");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DEAD_LETTER");
    assert.equal(row.lastFailureClassification, "PERMANENT");
  });

  it("an ambiguous (connection-reset) outcome becomes DELIVERY_UNCERTAIN and is never auto-resent", async () => {
    mockMeta.setHandler(() => "reset");
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "delivery_uncertain");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DELIVERY_UNCERTAIN");
    assert.equal(row.lastFailureClassification, "AMBIGUOUS");
    assert.equal(row.nextRetryAt, null, "an ambiguous outcome must not be scheduled for retry");

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });
    const again = await sendPrivateReply(log.id);
    assert.equal(again.outcome, "not_claimed");
    assert.equal(requestCount, 0, "DELIVERY_UNCERTAIN must never be silently retried");
  });

  it("a confirmed auth failure blocks the row and flips the account to TOKEN_EXPIRED", async () => {
    mockMeta.setHandler(() => metaAuthExpiredToken);
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "account_blocked");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "ACCOUNT_BLOCKED");
    assert.equal(row.lastFailureClassification, "AUTH");

    const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: socialAccountId } });
    assert.equal(account.status, "TOKEN_EXPIRED");
  });

  it("a 403 permission failure (no token-invalid code) dead-letters; the account stays ACTIVE", async () => {
    mockMeta.setHandler(() => metaPermissionForbidden);
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "dead_letter");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DEAD_LETTER");
    assert.equal(row.lastFailureClassification, "PERMANENT");

    const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: socialAccountId } });
    assert.equal(account.status, "ACTIVE", "a permission rejection must never be mistaken for a bad token");
  });

  it("a 403 WITH a confirmed token-invalid Meta code blocks the row and flips the account to TOKEN_EXPIRED", async () => {
    mockMeta.setHandler(() => metaConfirmedTokenInvalid403);
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "account_blocked");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "ACCOUNT_BLOCKED");
    assert.equal(row.lastFailureClassification, "AUTH");

    const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: socialAccountId } });
    assert.equal(account.status, "TOKEN_EXPIRED");
  });
});

describe("sendPrivateReply — account enforcement", () => {
  it("a disconnected account makes zero Meta calls", async () => {
    await prisma.socialAccount.update({ where: { id: socialAccountId }, data: { status: "DISCONNECTED" } });
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "account_blocked");
    assert.equal(requestCount, 0);

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "ACCOUNT_BLOCKED");
    assert.equal(row.pendingStage, "PRIVATE_REPLY");
  });

  it("a token-expired account makes zero Meta calls", async () => {
    await prisma.socialAccount.update({ where: { id: socialAccountId }, data: { status: "TOKEN_EXPIRED" } });
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "account_blocked");
    assert.equal(requestCount, 0);
  });

  it("isConnected: false makes zero Meta calls even if status is ACTIVE", async () => {
    await prisma.socialAccount.update({ where: { id: socialAccountId }, data: { isConnected: false } });
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "account_blocked");
    assert.equal(requestCount, 0);
  });
});

describe("sendPrivateReply — data-integrity edge cases", () => {
  it("an undecryptable stored token dead-letters without calling Meta", async () => {
    await prisma.socialAccount.update({
      where: { id: socialAccountId },
      data: { pageAccessToken: "not-a-valid-encrypted-value" },
    });
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });

    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "dead_letter");
    assert.equal(requestCount, 0);

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.lastFailureClassification, "PERMANENT");
  });

  it("a row that isn't MATCHED or a due retry is not claimed", async () => {
    const log = await createTestConversionLog({ campaignId, status: "PENDING" });
    const result = await sendPrivateReply(log.id);
    assert.equal(result.outcome, "not_claimed");
  });
});

describe("sendPendingPrivateReplies — per-item deadline enforcement", () => {
  it("stops claiming new rows once the deadline passes, against real (slow, mocked) Meta calls", async () => {
    const logs = await Promise.all([
      createTestConversionLog({ campaignId, status: "MATCHED" }),
      createTestConversionLog({ campaignId, status: "MATCHED" }),
      createTestConversionLog({ campaignId, status: "MATCHED" }),
    ]);

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return { status: 200, body: { recipient_id: "r", message_id: "m" }, delayMs: 250 };
    });

    // Deadline window is short enough that only the first (already
    // in-flight) item can complete before it passes — proves the batch
    // stops *starting* new claims, it doesn't need to abort in-flight work.
    const deadline = Date.now() + 80;
    const { results, skippedByDeadline } = await sendPendingPrivateReplies(10, deadline);

    assert.ok(results.length < logs.length, `expected fewer than ${logs.length} rows processed, got ${results.length}`);
    assert.equal(requestCount, results.length, "no Meta call should have been made for a skipped row");
    assert.ok(skippedByDeadline > 0);
    assert.equal(skippedByDeadline, logs.length - results.length);

    // The skipped rows are untouched — still MATCHED, eligible for the
    // next tick, not stuck or misclassified.
    const remaining = await prisma.conversionLog.findMany({
      where: { id: { in: logs.map((l) => l.id) }, status: "MATCHED" },
    });
    assert.equal(remaining.length, skippedByDeadline);
  });
});
