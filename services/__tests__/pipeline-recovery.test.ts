import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  createTestSocialAccount,
  createTestCampaign,
  createTestConversionLog,
  cleanupTestSocialAccount,
} from "@/lib/test-support/db-fixtures";
import { MockMetaServer, metaSuccessPrivateReply, metaSuccessPublicReply, metaTransient5xx } from "@/lib/test-support/mock-meta-server";
import { matchConversionLog } from "../trigger-matcher";
import { sendPrivateReply } from "../private-reply";
import { sendPublicReply } from "../public-reply";
import { finalizeConversion } from "../conversion-finalizer";
import { recoverStaleClaims } from "../recovery";

// Phase A (Automation Reliability): end-to-end proof that a row can
// survive a mid-pipeline interruption and still reach a correct terminal
// state — either full success after a transient hiccup, or a safe
// DELIVERY_UNCERTAIN (never a silent resend) after a genuine crash.

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
  const campaign = await createTestCampaign(socialAccountId, { triggerKeywords: ["recoverme"] });
  campaignId = campaign.id;
});

afterEach(async () => {
  await cleanupTestSocialAccount(socialAccountId);
});

describe("full pipeline recovery after interruption", () => {
  it("a crashed worker's claim resolves to DELIVERY_UNCERTAIN and is never silently resent, even after the retry-due window passes", async () => {
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });

    // Simulate a worker that claimed the row and then crashed before
    // recording any outcome — the exact scenario a real timeout/OOM/deploy
    // kill produces. We do this by claiming directly (bypassing
    // sendPrivateReply, which would also make the — successful, in this
    // test — Meta call) with a lease that's already expired.
    await prisma.conversionLog.update({
      where: { id: log.id },
      data: { status: "DM_SENDING", claimExpiresAt: new Date(Date.now() - 1000) },
    });

    // recoverStaleClaims is a global sweep (correct production behavior);
    // a concurrently-running test file's own eligible rows may be swept in
    // the same call, so assert a lower bound, not an exact count — the
    // row identity checked below is what actually proves this test's row
    // was recovered.
    const recovered = await recoverStaleClaims();
    assert.ok(recovered >= 1);

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPrivateReply();
    });

    // Even long after "recovery," the row must never be picked up again —
    // DELIVERY_UNCERTAIN is a manual-review terminal state, not a retry
    // state, no matter how much time passes.
    const attempted = await sendPrivateReply(log.id);
    assert.equal(attempted.outcome, "not_claimed");
    assert.equal(requestCount, 0);

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DELIVERY_UNCERTAIN");
  });

  it("a transient interruption during the private-reply stage recovers via retry and completes the full pipeline to SUCCESS", async () => {
    const log = await createTestConversionLog({
      campaignId,
      commentText: "please recoverme now",
      mediaId: (await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } })).instagramMediaId,
      status: "PENDING",
    });

    // Stage 1: match.
    const matchResult = await matchConversionLog(log.id);
    assert.equal(matchResult.outcome, "matched");

    // Stage 2: private reply fails transiently first (simulating a Meta
    // blip during the original attempt).
    mockMeta.setHandler(() => metaTransient5xx);
    const firstAttempt = await sendPrivateReply(log.id);
    assert.equal(firstAttempt.outcome, "retry_pending");

    // The cron retry-due sweep would find this row once nextRetryAt has
    // passed — simulate that passage of time directly.
    await prisma.conversionLog.update({ where: { id: log.id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });

    // Stage 2, retried: succeeds this time.
    mockMeta.setHandler(() => metaSuccessPrivateReply());
    const retried = await sendPrivateReply(log.id);
    assert.equal(retried.outcome, "sent");

    // Stage 3: public reply.
    mockMeta.setHandler(() => metaSuccessPublicReply());
    const publicResult = await sendPublicReply(log.id);
    assert.equal(publicResult.outcome, "sent");

    // Stage 4: finalize.
    const finalizeResult = await finalizeConversion(log.id);
    assert.equal(finalizeResult.outcome, "success");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "SUCCESS");
    assert.equal(row.retryCount, 1, "the one transient retry should be reflected in retryCount");
    assert.ok(row.privateReplyMessageId);
    assert.ok(row.publicReplyId);
  });
});
