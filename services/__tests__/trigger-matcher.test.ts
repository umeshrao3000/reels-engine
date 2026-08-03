import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { matchConversionLog } from "../trigger-matcher";
import { prisma } from "@/lib/prisma";
import {
  cleanupTestConversionLog,
  cleanupTestLead,
  cleanupTestSocialAccount,
  createTestCampaign,
  createTestConversionLog,
  createTestSocialAccount,
} from "@/lib/test-support/db-fixtures";

describe("matchConversionLog", () => {
  const socialAccountIds: string[] = [];
  const conversionLogIds: string[] = [];
  const leadUserIds: string[] = [];

  after(async () => {
    for (const id of conversionLogIds) await cleanupTestConversionLog(id);
    for (const userId of leadUserIds) await cleanupTestLead(userId);
    for (const id of socialAccountIds) await cleanupTestSocialAccount(id); // cascades campaigns/keywords
  });

  it("matches a comment containing an active keyword, sets MATCHED, and upserts a Lead", async () => {
    const account = await createTestSocialAccount();
    socialAccountIds.push(account.id);
    const campaign = await createTestCampaign(account.id, { triggerKeywords: ["deal", "sale"] });
    const igUserId = `match-user-${Date.now()}`;
    leadUserIds.push(igUserId);
    const log = await createTestConversionLog({
      commentText: "any deal here?",
      mediaId: campaign.instagramMediaId,
      instagramUserId: igUserId,
    });
    conversionLogIds.push(log.id);

    const result = await matchConversionLog(log.id);

    assert.equal(result.outcome, "matched");
    assert.equal(result.matchedKeyword, "deal");
    assert.equal(result.campaignId, campaign.id);

    const updated = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(updated.status, "MATCHED");
    assert.equal(updated.matchedKeyword, "deal");

    const lead = await prisma.lead.findUnique({ where: { instagramUserId: igUserId } });
    assert.ok(lead, "expected a Lead to be created on match");
  });

  it("does not match on a word-boundary near-miss ('dealer' must not match keyword 'deal')", async () => {
    const account = await createTestSocialAccount();
    socialAccountIds.push(account.id);
    const campaign = await createTestCampaign(account.id, { triggerKeywords: ["deal"] });
    const log = await createTestConversionLog({
      commentText: "ask the dealer about it",
      mediaId: campaign.instagramMediaId,
    });
    conversionLogIds.push(log.id);

    const result = await matchConversionLog(log.id);

    assert.equal(result.outcome, "skipped_no_keyword");
    const updated = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(updated.status, "SKIPPED");
    assert.equal(updated.matchedKeyword, null);
  });

  it("skips with skipped_no_campaign when no campaign targets the comment's media id", async () => {
    const log = await createTestConversionLog({
      commentText: "any deal here?",
      mediaId: `unmatched-media-${Date.now()}`,
    });
    conversionLogIds.push(log.id);

    const result = await matchConversionLog(log.id);

    assert.equal(result.outcome, "skipped_no_campaign");
  });

  it("ignores an inactive campaign (isActive: false) for the same media id", async () => {
    const account = await createTestSocialAccount();
    socialAccountIds.push(account.id);
    const campaign = await createTestCampaign(account.id, { triggerKeywords: ["deal"], isActive: false });
    const log = await createTestConversionLog({
      commentText: "any deal here?",
      mediaId: campaign.instagramMediaId,
    });
    conversionLogIds.push(log.id);

    const result = await matchConversionLog(log.id);

    assert.equal(result.outcome, "skipped_no_campaign");
  });

  it("is idempotent: a row not still PENDING is left untouched and returns already_processed", async () => {
    const account = await createTestSocialAccount();
    socialAccountIds.push(account.id);
    const campaign = await createTestCampaign(account.id, { triggerKeywords: ["deal"] });
    const log = await createTestConversionLog({
      commentText: "any deal here?",
      mediaId: campaign.instagramMediaId,
      status: "SUCCESS",
    });
    conversionLogIds.push(log.id);

    const result = await matchConversionLog(log.id);

    assert.equal(result.outcome, "already_processed");
    const unchanged = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(unchanged.status, "SUCCESS", "status must not be overwritten");
  });

  it("picks the first matching keyword when multiple campaigns target the same media id (oldest campaign first)", async () => {
    const account = await createTestSocialAccount();
    socialAccountIds.push(account.id);
    const mediaId = `shared-media-${Date.now()}`;
    const older = await createTestCampaign(account.id, { instagramMediaId: mediaId, triggerKeywords: ["deal"] });
    await new Promise((r) => setTimeout(r, 10));
    await createTestCampaign(account.id, { instagramMediaId: mediaId, triggerKeywords: ["deal"] });

    const log = await createTestConversionLog({ commentText: "any deal here?", mediaId });
    conversionLogIds.push(log.id);

    const result = await matchConversionLog(log.id);

    assert.equal(result.outcome, "matched");
    assert.equal(result.campaignId, older.id, "expected the older (first-created) campaign to win");
  });
});
