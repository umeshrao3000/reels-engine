import { createHmac, randomUUID } from "node:crypto";
import type { APIRequestContext } from "@playwright/test";
import { test, expect } from "./support/fixtures";
import { prisma } from "../lib/prisma";

// Golden path: admin login -> campaign create -> keyword add/disable ->
// verify matching changes. Exercises the real pipeline end to end via a
// genuinely HMAC-signed webhook request (the same construction Meta uses),
// not a mock — and confirms the Monitoring page reflects the outcome,
// proving keyword enable/disable actually changes matching behavior, not
// just UI state.

const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE;
const META_APP_SECRET = process.env.META_APP_SECRET;

// Fails closed, not skips: a missing admin passcode or webhook secret means
// this suite cannot exercise the real auth/signing paths it exists to
// verify, so silently skipping would be a false green. CI must supply
// explicit test-only placeholder values (see .github/workflows/ci.yml).
if (!ADMIN_PASSCODE || !META_APP_SECRET) {
  throw new Error(
    "ADMIN_PASSCODE and META_APP_SECRET must be set to run the automation golden path — refusing to skip."
  );
}

function signWebhookBody(rawBody: string): string {
  return "sha256=" + createHmac("sha256", META_APP_SECRET!).update(rawBody).digest("hex");
}

async function postSignedComment(
  request: APIRequestContext,
  baseURL: string,
  opts: { commentId: string; text: string; mediaId: string }
) {
  const payload = {
    object: "instagram",
    entry: [
      {
        id: "e2e-entry",
        time: Date.now(),
        changes: [
          {
            field: "comments",
            value: {
              id: opts.commentId,
              text: opts.text,
              from: { id: "e2e-ig-user", username: "e2e_tester" },
              media: { id: opts.mediaId },
            },
          },
        ],
      },
    ],
  };
  const raw = JSON.stringify(payload);
  return request.post(`${baseURL}/api/webhooks/instagram`, {
    headers: { "Content-Type": "application/json", "x-hub-signature-256": signWebhookBody(raw) },
    data: raw,
  });
}

test.describe("automation golden path", () => {
  const runId = randomUUID().slice(0, 8);
  const mediaId = `e2e-media-${runId}`;
  const campaignName = `E2E Campaign ${runId}`;
  const initialKeyword = `e2edeal${runId}`;
  const secondKeyword = `e2esale${runId}`;
  let socialAccountId: string;

  test.beforeAll(async () => {
    const account = await prisma.socialAccount.create({
      data: {
        instagramBusinessId: `e2e-ig-biz-${runId}`,
        pageAccessToken: `e2e-placeholder-token-${runId}`,
        instagramUsername: `e2e_account_${runId}`,
        status: "ACTIVE",
      },
    });
    socialAccountId = account.id;
  });

  test.afterAll(async () => {
    await prisma.socialAccount.delete({ where: { id: socialAccountId } }).catch(() => {});
  });

  test("admin can log in, create a campaign, and manage its keywords, then matching reflects enable/disable state", async ({
    page,
    request,
    baseURL,
  }) => {
    // 1. Admin login
    await page.goto("/ops/login");
    await page.locator('input[type="password"]').fill(ADMIN_PASSCODE!);
    await page.getByRole("button", { name: "Enter" }).click();
    await page.waitForURL("**/ops/projects");

    // 2. Create campaign with an initial keyword
    await page.goto("/ops/campaigns/new");
    await page.getByLabel("Campaign name").fill(campaignName);
    await page.getByLabel("Instagram account").selectOption({ label: `e2e_account_${runId}` });
    await page.getByLabel("Target Reel ID").fill(mediaId);
    await page.getByLabel(/Initial keywords/).fill(initialKeyword);
    await page.getByLabel("DM template").fill("Thanks for your interest!");
    await page.getByLabel("Public reply template").fill("Check your DMs!");
    await page.getByRole("button", { name: "Create Campaign" }).click();
    await page.waitForURL("**/ops/campaigns");
    await expect(page.getByText(campaignName)).toBeVisible();

    // 3. Open the campaign, add a second keyword via Keyword Management
    await page.getByText(campaignName).click();
    await page.waitForURL("**/ops/campaigns/*");
    await expect(page.getByRole("heading", { name: /Keyword Management/ })).toBeVisible();
    await page.getByLabel(/Add keywords/).fill(secondKeyword);
    await page.getByRole("button", { name: "Add Keywords" }).click();
    await expect(page.locator("li", { hasText: secondKeyword })).toBeVisible();

    // 4. A comment containing the still-active initial keyword matches
    const firstCommentId = `e2e-comment-${runId}-a`;
    const firstResponse = await postSignedComment(request, baseURL!, {
      commentId: firstCommentId,
      text: `any ${initialKeyword} here?`,
      mediaId,
    });
    expect(firstResponse.status()).toBe(200);

    await expect(async () => {
      const row = await prisma.conversionLog.findUnique({ where: { commentId: firstCommentId } });
      expect(row?.matchedKeyword).toBe(initialKeyword);
    }).toPass({ timeout: 10_000 });

    // 5. Disable the initial keyword
    await page.reload();
    await page
      .locator("li", { hasText: initialKeyword })
      .getByRole("button", { name: "Disable" })
      .click();
    await expect(page.locator("li", { hasText: initialKeyword }).getByRole("button", { name: "Enable" })).toBeVisible();

    // 6. The exact same keyword text no longer matches once disabled
    const secondCommentId = `e2e-comment-${runId}-b`;
    const secondResponse = await postSignedComment(request, baseURL!, {
      commentId: secondCommentId,
      text: `any ${initialKeyword} here?`,
      mediaId,
    });
    expect(secondResponse.status()).toBe(200);

    await expect(async () => {
      const row = await prisma.conversionLog.findUnique({ where: { commentId: secondCommentId } });
      expect(row?.status).toBe("SKIPPED");
      expect(row?.matchedKeyword).toBeNull();
    }).toPass({ timeout: 10_000 });

    // 7. The still-active second keyword continues to match
    const thirdCommentId = `e2e-comment-${runId}-c`;
    const thirdResponse = await postSignedComment(request, baseURL!, {
      commentId: thirdCommentId,
      text: `check this ${secondKeyword} out`,
      mediaId,
    });
    expect(thirdResponse.status()).toBe(200);

    await expect(async () => {
      const row = await prisma.conversionLog.findUnique({ where: { commentId: thirdCommentId } });
      expect(row?.matchedKeyword).toBe(secondKeyword);
    }).toPass({ timeout: 10_000 });

    // 8. The Monitoring page reflects all three outcomes for a real admin to see
    await page.goto(`/ops/monitoring?instagramUser=e2e-ig-user`);
    await expect(page.getByText(initialKeyword).first()).toBeVisible();
    await expect(page.getByText(secondKeyword).first()).toBeVisible();
    // Scoped to a table cell, not the Status filter <select>'s <option> (same text, hidden).
    await expect(page.locator("td.font-mono", { hasText: "SKIPPED" }).first()).toBeVisible();

    // Cleanup this run's ConversionLog rows (SocialAccount cascade in afterAll handles the rest).
    await prisma.conversionLog.deleteMany({
      where: { commentId: { in: [firstCommentId, secondCommentId, thirdCommentId] } },
    });
  });
});
