import { randomUUID } from "node:crypto";
import { test, expect } from "./support/fixtures";
import { prisma } from "../lib/prisma";

// MR-3.2 (Single Organization Ownership): a real customer, through the
// real browser UI, connects an Instagram account (simulated by seeding
// the SocialAccount row directly — real Meta OAuth can't run in CI),
// creates a campaign, manages its keywords, and — the actual point of
// this milestone — a second, independent customer never sees any of it.

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function signUpAndGetOrganization(page: import("@playwright/test").Page, name: string, email: string) {
  await page.goto("/signup");
  await page.getByPlaceholder("Name").fill(name);
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account$/);

  const organization = await prisma.organization.findFirstOrThrow({
    where: { owner: { email } },
  });
  return organization;
}

test.describe("customer workspace: campaign lifecycle and cross-organization isolation", () => {
  const runId = randomUUID().slice(0, 8);
  const customerAEmail = uniqueEmail("workspace-a");
  const customerBEmail = uniqueEmail("workspace-b");
  const campaignName = `E2E Workspace Campaign ${runId}`;
  const mediaId = `e2e-workspace-media-${runId}`;

  let socialAccountId: string;
  const userIds: string[] = [];

  test.afterAll(async () => {
    if (socialAccountId) await prisma.socialAccount.delete({ where: { id: socialAccountId } }).catch(() => {});
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
    }
  });

  test("a customer connects Instagram, creates a campaign, manages keywords, and a second customer sees none of it", async ({
    page,
  }) => {
    // 1. Customer A signs up — the signup hook auto-creates their organization.
    const orgA = await signUpAndGetOrganization(page, "E2E Workspace Customer A", customerAEmail);
    const userA = await prisma.user.findUniqueOrThrow({ where: { email: customerAEmail } });
    userIds.push(userA.id);

    // 2. Simulate a connected Instagram account for org A (real Meta OAuth
    // can't run in CI — the connect/callback flow itself is covered by
    // app/api/customer/instagram/** and its P2002/state-cookie logic
    // directly, not re-exercised here).
    const account = await prisma.socialAccount.create({
      data: {
        instagramBusinessId: `e2e-workspace-ig-biz-${runId}`,
        pageAccessToken: `e2e-placeholder-token-${runId}`,
        instagramUsername: `e2e_workspace_account_${runId}`,
        status: "ACTIVE",
        organizationId: orgA.id,
      },
    });
    socialAccountId = account.id;

    await page.goto("/dashboard/instagram");
    await expect(page.getByText(`e2e_workspace_account_${runId}`)).toBeVisible();

    // 3. Create a campaign through the real UI, scoped to org A.
    await page.goto("/dashboard/campaigns/new");
    await page.getByLabel("Campaign name").fill(campaignName);
    await page.getByLabel("Instagram account").selectOption({ label: `e2e_workspace_account_${runId}` });
    await page.getByLabel("Target Reel ID").fill(mediaId);
    await page.getByLabel(/Initial keywords/).fill(`e2eworkspacedeal${runId}`);
    await page.getByLabel("DM template").fill("Thanks for your interest!");
    await page.getByLabel("Public reply template").fill("Check your DMs!");
    await page.getByRole("button", { name: "Create Campaign" }).click();
    await page.waitForURL("**/dashboard/campaigns");
    await expect(page.getByText(campaignName)).toBeVisible();

    // 4. Open it and manage keywords via the real UI.
    await page.getByText(campaignName).click();
    await page.waitForURL("**/dashboard/campaigns/*");
    await expect(page.getByRole("heading", { name: /Keyword Management/ })).toBeVisible();
    const secondKeyword = `e2eworkspacesale${runId}`;
    await page.getByLabel(/Add keywords/).fill(secondKeyword);
    await page.getByRole("button", { name: "Add Keywords" }).click();
    await expect(page.locator("li", { hasText: secondKeyword })).toBeVisible();

    // 5. Sign out, then a second, independent customer signs up.
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signUpAndGetOrganization(page, "E2E Workspace Customer B", customerBEmail);
    const userB = await prisma.user.findUniqueOrThrow({ where: { email: customerBEmail } });
    userIds.push(userB.id);

    // 6. The actual point of this milestone: customer B's workspace shows
    // none of customer A's data — no campaign, no Instagram account.
    await page.goto("/dashboard/campaigns");
    await expect(page.getByText(campaignName)).not.toBeVisible();
    await expect(page.getByText("No campaigns yet.")).toBeVisible();

    await page.goto("/dashboard/instagram");
    await expect(page.getByText(`e2e_workspace_account_${runId}`)).not.toBeVisible();
    await expect(page.getByText("No accounts connected yet.")).toBeVisible();
  });
});
