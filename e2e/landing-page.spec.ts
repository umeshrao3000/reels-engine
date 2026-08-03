import { test, expect } from "@playwright/test";

// Golden path: landing page CTAs. Covers the exact defects the Playwright
// forensic audit found and the follow-up PR fixed — every service button
// must be a real, connected link, never a dead placeholder.

test.describe("landing page — service buttons", () => {
  for (const label of ["Keywords", "Automation", "Monitoring"]) {
    test(`"${label}" button redirects an unauthenticated visitor to admin login`, async ({ page }) => {
      await page.goto("/");
      await page.locator(`a:has(> span:text-is("${label}"))`).first().click();
      await page.waitForURL("**/ops/login");
      await expect(page).toHaveURL(/\/ops\/login$/);
    });
  }

  test("header admin link navigates to /ops/login", async ({ page }) => {
    await page.goto("/");
    await page.locator('a[aria-label="Admin"]').click();
    await expect(page).toHaveURL(/\/ops\/login$/);
  });
});

test.describe("landing page — Upload Raw Reel golden path", () => {
  test("uploading a file creates a project and reaches the pay page", async ({ page }) => {
    await page.goto("/");

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.locator("text=Drag & drop your Reel or raw video").locator("..").click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "e2e-test-reel.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fake mp4 bytes for e2e test"),
    });

    await expect(page.getByText("e2e-test-reel.mp4")).toBeVisible();

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/projects") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Start Processing" }).click(),
    ]);
    expect(response.status()).toBe(201);

    await expect(page.getByText("Got it — one last step.")).toBeVisible();
    await page.getByRole("link", { name: "Continue to Payment" }).click();
    await expect(page).toHaveURL(/\/pay\//);
    await expect(page.getByRole("heading", { name: /Pay ₹\d+ to start your Reel Makeover/ })).toBeVisible();
  });
});

test.describe("landing page — Paste Reel Link golden path", () => {
  test("pasting a link creates a project and reaches the status page", async ({ page }) => {
    await page.goto("/");

    const linkInput = page.locator('input[type="url"]');
    await linkInput.fill("https://drive.google.com/file/d/e2e-test-id/view");
    await expect(page.getByText("Detected: Google Drive")).toBeVisible();

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/projects") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Start Processing" }).click(),
    ]);
    expect(response.status()).toBe(201);

    await expect(page.getByText("Got it — one last step.")).toBeVisible();
    await page.getByRole("link", { name: "Bookmark your status page" }).click();
    await expect(page).toHaveURL(/\/status\//);
  });

  test("an invalid link is rejected without creating a project", async ({ page }) => {
    await page.goto("/");

    const linkInput = page.locator('input[type="url"]');
    await linkInput.fill("not-a-valid-url-at-all");

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/projects") && r.request().method() === "POST"),
      page.getByRole("button", { name: "Start Processing" }).click(),
    ]);
    expect(response.status()).toBe(400);
    await expect(page.getByText("That doesn't look like a valid link.")).toBeVisible();
  });
});
