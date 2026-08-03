import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  createTestCampaign,
  createTestSocialAccount,
  cleanupTestSocialAccount,
} from "@/lib/test-support/db-fixtures";
import {
  DuplicateKeywordError,
  bulkAddKeywords,
  deleteKeyword,
  updateKeyword,
} from "../keyword-service";
import { MAX_KEYWORDS_PER_CAMPAIGN } from "../normalize";

describe("keyword-service", () => {
  const socialAccountIds: string[] = [];
  after(async () => {
    for (const id of socialAccountIds) await cleanupTestSocialAccount(id); // cascades campaigns/keywords
  });

  async function freshCampaign() {
    const account = await createTestSocialAccount();
    socialAccountIds.push(account.id);
    return createTestCampaign(account.id, { triggerKeywords: [] });
  }

  it("bulkAddKeywords creates rows and keeps Campaign.triggerKeywords in sync", async () => {
    const campaign = await freshCampaign();

    const result = await bulkAddKeywords(campaign.id, "Deal, BUY\n link, deal, , link");

    assert.deepEqual(result.created.sort(), ["buy", "deal", "link"]);
    assert.deepEqual(result.skipped, []);
    assert.deepEqual(result.rejectedTooLong, []);

    const updated = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.deepEqual([...updated.triggerKeywords].sort(), ["buy", "deal", "link"]);

    const rows = await prisma.keyword.findMany({ where: { campaignId: campaign.id } });
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.isActive));
  });

  it("bulkAddKeywords reports existing values as skipped, not errored, and doesn't duplicate them", async () => {
    const campaign = await freshCampaign();
    await bulkAddKeywords(campaign.id, "deal, buy");

    const second = await bulkAddKeywords(campaign.id, "deal, promo");

    assert.deepEqual(second.created, ["promo"]);
    assert.deepEqual(second.skipped, ["deal"]);

    const count = await prisma.keyword.count({ where: { campaignId: campaign.id, value: "deal" } });
    assert.equal(count, 1, "must not create a duplicate row for an already-existing value");
  });

  it("bulkAddKeywords enforces MAX_KEYWORDS_PER_CAMPAIGN", async () => {
    const campaign = await freshCampaign();
    const nearLimit = Array.from({ length: MAX_KEYWORDS_PER_CAMPAIGN - 1 }, (_, i) => `kw${i}`).join(",");
    await bulkAddKeywords(campaign.id, nearLimit);

    const result = await bulkAddKeywords(campaign.id, "one-more,two-more");

    assert.equal(result.created.length, 1, "only one slot should remain under the cap");
    assert.equal(result.rejectedLimitReached.length, 1);

    const count = await prisma.keyword.count({ where: { campaignId: campaign.id } });
    assert.equal(count, MAX_KEYWORDS_PER_CAMPAIGN);
  });

  it("updateKeyword normalizes a renamed value and re-syncs the cache", async () => {
    const campaign = await freshCampaign();
    await bulkAddKeywords(campaign.id, "link");
    const keyword = await prisma.keyword.findFirstOrThrow({ where: { campaignId: campaign.id, value: "link" } });

    const updated = await updateKeyword(campaign.id, keyword.id, { value: "  ClickTheLink  " });

    assert.equal(updated?.value, "clickthelink");
    const campaignAfter = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.deepEqual(campaignAfter.triggerKeywords, ["clickthelink"]);
  });

  it("updateKeyword rejects renaming to a value that already exists on the same campaign", async () => {
    const campaign = await freshCampaign();
    await bulkAddKeywords(campaign.id, "deal, buy");
    const buy = await prisma.keyword.findFirstOrThrow({ where: { campaignId: campaign.id, value: "buy" } });

    await assert.rejects(() => updateKeyword(campaign.id, buy.id, { value: "deal" }), DuplicateKeywordError);
  });

  it("updateKeyword toggling isActive removes/restores the keyword from the Campaign.triggerKeywords cache", async () => {
    const campaign = await freshCampaign();
    await bulkAddKeywords(campaign.id, "deal, buy");
    const deal = await prisma.keyword.findFirstOrThrow({ where: { campaignId: campaign.id, value: "deal" } });

    await updateKeyword(campaign.id, deal.id, { isActive: false });
    let campaignAfter = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.deepEqual(campaignAfter.triggerKeywords, ["buy"]);

    await updateKeyword(campaign.id, deal.id, { isActive: true });
    campaignAfter = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.deepEqual([...campaignAfter.triggerKeywords].sort(), ["buy", "deal"]);
  });

  it("updateKeyword returns null for a keyword that doesn't belong to the given campaign", async () => {
    const campaignA = await freshCampaign();
    const campaignB = await freshCampaign();
    await bulkAddKeywords(campaignA.id, "deal");
    const deal = await prisma.keyword.findFirstOrThrow({ where: { campaignId: campaignA.id, value: "deal" } });

    const result = await updateKeyword(campaignB.id, deal.id, { isActive: false });
    assert.equal(result, null);
  });

  it("deleteKeyword removes the row and re-syncs the cache", async () => {
    const campaign = await freshCampaign();
    await bulkAddKeywords(campaign.id, "deal, buy");
    const deal = await prisma.keyword.findFirstOrThrow({ where: { campaignId: campaign.id, value: "deal" } });

    const deleted = await deleteKeyword(campaign.id, deal.id);
    assert.equal(deleted, true);

    const stillThere = await prisma.keyword.findUnique({ where: { id: deal.id } });
    assert.equal(stillThere, null);
    const campaignAfter = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.deepEqual(campaignAfter.triggerKeywords, ["buy"]);
  });

  it("deleteKeyword returns false for a keyword that doesn't belong to the given campaign", async () => {
    const campaignA = await freshCampaign();
    const campaignB = await freshCampaign();
    await bulkAddKeywords(campaignA.id, "deal");
    const deal = await prisma.keyword.findFirstOrThrow({ where: { campaignId: campaignA.id, value: "deal" } });

    const result = await deleteKeyword(campaignB.id, deal.id);
    assert.equal(result, false);
  });
});
