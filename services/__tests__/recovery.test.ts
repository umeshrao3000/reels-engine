import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  createTestSocialAccount,
  createTestCampaign,
  createTestConversionLog,
  cleanupTestSocialAccount,
} from "@/lib/test-support/db-fixtures";
import { recoverStaleClaims, resumeAccountBlockedRows } from "../recovery";

// Phase A (Automation Reliability): recovery sweeps run by the cron route
// before any new sends are attempted on a given tick.
//
// These sweeps are deliberately global (every eligible row, not scoped to
// one account/campaign) — that's the correct real production behavior.
// It also means a concurrently-running test file (Node's test runner runs
// files in parallel) can legitimately have its own eligible rows swept up
// in the same count. So assertions here check *this test's row* directly
// rather than asserting an exact global return count, except where the
// count is a lower bound (at least our own row was moved).

let socialAccountId: string;
let campaignId: string;

beforeEach(async () => {
  const account = await createTestSocialAccount();
  socialAccountId = account.id;
  const campaign = await createTestCampaign(socialAccountId);
  campaignId = campaign.id;
});

afterEach(async () => {
  await cleanupTestSocialAccount(socialAccountId);
});

describe("recoverStaleClaims", () => {
  it("moves an expired DM_SENDING claim to DELIVERY_UNCERTAIN, never back to MATCHED", async () => {
    const log = await createTestConversionLog({
      campaignId,
      status: "DM_SENDING",
      claimExpiresAt: new Date(Date.now() - 1000), // already expired
    });

    const recovered = await recoverStaleClaims();
    assert.ok(recovered >= 1);

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DELIVERY_UNCERTAIN");
    assert.equal(row.pendingStage, "PRIVATE_REPLY");
    assert.equal(row.lastFailureClassification, "AMBIGUOUS");
    assert.equal(row.claimExpiresAt, null);
  });

  it("moves an expired PUBLIC_REPLYING claim to DELIVERY_UNCERTAIN", async () => {
    const log = await createTestConversionLog({
      campaignId,
      status: "PUBLIC_REPLYING",
      claimExpiresAt: new Date(Date.now() - 1000),
    });

    const recovered = await recoverStaleClaims();
    assert.ok(recovered >= 1);

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DELIVERY_UNCERTAIN");
    assert.equal(row.pendingStage, "PUBLIC_REPLY");
  });

  it("does not touch a claim that hasn't expired yet", async () => {
    const log = await createTestConversionLog({
      campaignId,
      status: "DM_SENDING",
      claimExpiresAt: new Date(Date.now() + 60_000), // still valid
    });

    await recoverStaleClaims();

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DM_SENDING");
  });

  it("does not touch rows outside DM_SENDING/PUBLIC_REPLYING", async () => {
    const log = await createTestConversionLog({ campaignId, status: "RETRY_PENDING", pendingStage: "PRIVATE_REPLY" });
    await recoverStaleClaims();

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "RETRY_PENDING");
  });
});

describe("resumeAccountBlockedRows", () => {
  it("resumes a PRIVATE_REPLY-blocked row to MATCHED once the account is ACTIVE + connected", async () => {
    const log = await createTestConversionLog({
      campaignId,
      status: "ACCOUNT_BLOCKED",
      pendingStage: "PRIVATE_REPLY",
    });

    // Account is already ACTIVE + isConnected (fixture default) — simulates
    // the moment right after a reconnect.
    const resumed = await resumeAccountBlockedRows();
    assert.ok(resumed >= 1);

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "MATCHED");
    assert.equal(row.pendingStage, null);
  });

  it("resumes a PUBLIC_REPLY-blocked row to DM_SENT once the account is reconnected", async () => {
    const log = await createTestConversionLog({
      campaignId,
      status: "ACCOUNT_BLOCKED",
      pendingStage: "PUBLIC_REPLY",
    });

    const resumed = await resumeAccountBlockedRows();
    assert.ok(resumed >= 1);

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DM_SENT");
  });

  it("does not resume a blocked row while the account is still disconnected", async () => {
    await prisma.socialAccount.update({ where: { id: socialAccountId }, data: { status: "DISCONNECTED" } });
    const log = await createTestConversionLog({
      campaignId,
      status: "ACCOUNT_BLOCKED",
      pendingStage: "PRIVATE_REPLY",
    });

    await resumeAccountBlockedRows();

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "ACCOUNT_BLOCKED");
  });
});
