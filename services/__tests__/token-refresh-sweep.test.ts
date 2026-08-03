import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { createTestSocialAccount, cleanupTestSocialAccount } from "@/lib/test-support/db-fixtures";
import { MockMetaServer } from "@/lib/test-support/mock-meta-server";
import { refreshExpiringTokens } from "../token-refresh-sweep";

// Phase A (Automation Reliability): refreshLongLivedToken existed with no
// caller anywhere in the app — this sweep, and these tests, are the first
// time it's ever actually exercised end to end.

const mockMeta = new MockMetaServer(() => ({ status: 200, body: { access_token: "unused", expires_in: 5_184_000 } }));

let socialAccountId: string;

before(async () => {
  const url = await mockMeta.start();
  process.env.META_GRAPH_API_BASE_URL = url;
});

after(async () => {
  await mockMeta.stop();
});

afterEach(async () => {
  await cleanupTestSocialAccount(socialAccountId);
});

const NEAR_EXPIRY = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day out, inside the 3-day refresh window
const FAR_FROM_EXPIRY = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days out

describe("refreshExpiringTokens", () => {
  it("refreshes a connected, ACTIVE account nearing expiry: decrypts, calls Meta, re-encrypts, updates tokenExpiresAt", async () => {
    const account = await createTestSocialAccount({ pageAccessToken: "original-plaintext-token", tokenExpiresAt: NEAR_EXPIRY });
    socialAccountId = account.id;

    mockMeta.setHandler(() => ({
      status: 200,
      body: { access_token: "refreshed-plaintext-token", expires_in: 5_184_000 }, // 60 days
    }));

    const summary = await refreshExpiringTokens();
    assert.equal(summary.refreshed, 1);
    assert.equal(summary.markedExpired, 0);

    const updated = await prisma.socialAccount.findUniqueOrThrow({ where: { id: socialAccountId } });
    assert.equal(decrypt(updated.pageAccessToken), "refreshed-plaintext-token");
    assert.ok(updated.tokenExpiresAt! > NEAR_EXPIRY);
    assert.equal(updated.status, "ACTIVE");
  });

  it("does not touch an account whose token isn't near expiry", async () => {
    const account = await createTestSocialAccount({ tokenExpiresAt: FAR_FROM_EXPIRY });
    socialAccountId = account.id;

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return { status: 200, body: { access_token: "should-not-be-used", expires_in: 5_184_000 } };
    });

    const summary = await refreshExpiringTokens();
    assert.equal(summary.checked, 0);
    assert.equal(requestCount, 0);
  });

  it("a transient refresh failure leaves the account ACTIVE for the next sweep to retry", async () => {
    const account = await createTestSocialAccount({ tokenExpiresAt: NEAR_EXPIRY });
    socialAccountId = account.id;
    const originalToken = account.pageAccessToken;

    mockMeta.setHandler(() => ({ status: 503, body: { error: { message: "Service unavailable", code: 2 } } }));

    const summary = await refreshExpiringTokens();
    assert.equal(summary.skippedTransient, 1);
    assert.equal(summary.markedExpired, 0);

    const updated = await prisma.socialAccount.findUniqueOrThrow({ where: { id: socialAccountId } });
    assert.equal(updated.status, "ACTIVE");
    assert.equal(updated.pageAccessToken, originalToken, "token must be unchanged on a transient failure");
  });

  it("a confirmed auth failure marks the account TOKEN_EXPIRED", async () => {
    const account = await createTestSocialAccount({ tokenExpiresAt: NEAR_EXPIRY });
    socialAccountId = account.id;

    mockMeta.setHandler(() => ({
      status: 401,
      body: { error: { message: "Error validating access token", code: 190, error_subcode: 463 } },
    }));

    const summary = await refreshExpiringTokens();
    assert.equal(summary.markedExpired, 1);

    const updated = await prisma.socialAccount.findUniqueOrThrow({ where: { id: socialAccountId } });
    assert.equal(updated.status, "TOKEN_EXPIRED");
  });

  it("never touches a manually DISCONNECTED account, even if its token is expiring", async () => {
    const account = await createTestSocialAccount({ status: "DISCONNECTED", tokenExpiresAt: NEAR_EXPIRY });
    socialAccountId = account.id;

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return { status: 200, body: { access_token: "should-not-be-used", expires_in: 5_184_000 } };
    });

    const summary = await refreshExpiringTokens();
    assert.equal(summary.checked, 0);
    assert.equal(requestCount, 0);

    const updated = await prisma.socialAccount.findUniqueOrThrow({ where: { id: socialAccountId } });
    assert.equal(updated.status, "DISCONNECTED");
  });
});
