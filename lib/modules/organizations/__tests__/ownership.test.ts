import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createTestCampaign, createTestSocialAccount, cleanupTestSocialAccount } from "@/lib/test-support/db-fixtures";
import { assertCampaignOwnership, assertSocialAccountOwnership } from "../ownership";

describe("assertSocialAccountOwnership / assertCampaignOwnership", () => {
  const userIds: string[] = [];
  const socialAccountIds: string[] = [];
  after(async () => {
    for (const id of socialAccountIds) await cleanupTestSocialAccount(id); // cascades campaigns
    for (const id of userIds) await prisma.user.delete({ where: { id } }).catch(() => {}); // cascades organization
  });

  async function freshOrganization() {
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: { id: `test-user-${suffix}`, name: "Ownership Test", email: `ownership-${suffix}@example.com` },
    });
    userIds.push(user.id);
    const organization = await prisma.organization.create({
      data: { ownerUserId: user.id, name: "Test Org" },
    });
    return organization;
  }

  it("assertSocialAccountOwnership returns the account when it belongs to the organization", async () => {
    const org = await freshOrganization();
    const account = await createTestSocialAccount({ organizationId: org.id });
    socialAccountIds.push(account.id);

    const result = await assertSocialAccountOwnership(org.id, account.id);
    assert.ok(result);
    assert.equal(result!.id, account.id);
  });

  it("assertSocialAccountOwnership returns null for another organization's account (cross-org isolation)", async () => {
    const orgA = await freshOrganization();
    const orgB = await freshOrganization();
    const accountOwnedByA = await createTestSocialAccount({ organizationId: orgA.id });
    socialAccountIds.push(accountOwnedByA.id);

    const result = await assertSocialAccountOwnership(orgB.id, accountOwnedByA.id);
    assert.equal(result, null, "an organization must never see another organization's social account");
  });

  it("assertSocialAccountOwnership returns null for an unowned (legacy admin) account", async () => {
    const org = await freshOrganization();
    const unownedAccount = await createTestSocialAccount(); // no organizationId — an admin-connected account
    socialAccountIds.push(unownedAccount.id);

    const result = await assertSocialAccountOwnership(org.id, unownedAccount.id);
    assert.equal(result, null, "a customer organization must never be able to claim an unowned admin account");
  });

  it("assertCampaignOwnership returns the campaign when its social account belongs to the organization", async () => {
    const org = await freshOrganization();
    const account = await createTestSocialAccount({ organizationId: org.id });
    socialAccountIds.push(account.id);
    const campaign = await createTestCampaign(account.id);

    const result = await assertCampaignOwnership(org.id, campaign.id);
    assert.ok(result);
    assert.equal(result!.id, campaign.id);
  });

  it("assertCampaignOwnership returns null for another organization's campaign (cross-org isolation)", async () => {
    const orgA = await freshOrganization();
    const orgB = await freshOrganization();
    const accountOwnedByA = await createTestSocialAccount({ organizationId: orgA.id });
    socialAccountIds.push(accountOwnedByA.id);
    const campaignOwnedByA = await createTestCampaign(accountOwnedByA.id);

    const result = await assertCampaignOwnership(orgB.id, campaignOwnedByA.id);
    assert.equal(result, null, "an organization must never see another organization's campaign");
  });

  it("assertCampaignOwnership returns null for a legacy admin-owned campaign", async () => {
    const org = await freshOrganization();
    const unownedAccount = await createTestSocialAccount(); // admin-connected, no organization
    socialAccountIds.push(unownedAccount.id);
    const legacyCampaign = await createTestCampaign(unownedAccount.id);

    const result = await assertCampaignOwnership(org.id, legacyCampaign.id);
    assert.equal(result, null);
  });
});
