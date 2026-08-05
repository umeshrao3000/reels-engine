import { test, expect } from "./support/fixtures";

// Customer Experience Sprint: the "edit account/profile" piece of the
// customer journey — real browser, real better-auth /update-user and
// /change-password endpoints, no mocking.
//
// File-distinct X-Forwarded-For — see the identical comment in
// customer-auth.spec.ts. Split into separate tests (rather than one long
// flow) so each stays under better-auth's on-by-default 3-req/10s limit
// on /sign-up*, /sign-in*, and /change-password — a single test doing
// sign-up + two change-password attempts + sign-in would trip it.
test.use({ extraHTTPHeaders: { "X-Forwarded-For": "10.10.3.1" } });

function uniqueEmail(): string {
  return `e2e-settings-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.describe("customer settings", () => {
  test("a customer can update their name and change their password, and the new password works at login", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const originalPassword = "correct-horse-battery-staple";
    const newPassword = "new-correct-horse-battery-staple";

    await page.goto("/signup");
    await page.getByPlaceholder("Name").fill("Settings Test User");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(originalPassword);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // Navigate into the dashboard shell and out to Settings via the nav —
    // exercises "navigate customer workspace," not just a direct page load.
    await page.getByRole("link", { name: "Go to your workspace" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);

    // Update display name — not rate-limited, no budget concern.
    await page.getByLabel("Name").fill("Updated Name");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    // Email is shown, read-only.
    const emailInput = page.getByLabel("Email");
    await expect(emailInput).toHaveValue(email);
    await expect(emailInput).toBeDisabled();

    // Change password with the correct current password.
    await page.getByLabel("Current password").fill(originalPassword);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Password changed.")).toBeVisible();

    // The updated name persists across a reload.
    await page.reload();
    await expect(page.getByLabel("Name")).toHaveValue("Updated Name");

    // Log out, then log back in with the NEW password — proves the change
    // actually took effect against the real auth backend, not just the UI.
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(newPassword);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/account$/);
  });

  // Isolated in its own describe so the allowed-error scope below applies
  // to only this one test — see the identical pattern in landing-page.spec.ts.
  test.describe("wrong current password", () => {
    // The 400 below is the assertion this test exists to make, not a bug —
    // Chromium still logs it as a console.error the moment the fetch
    // resolves non-2xx. Allow exactly that.
    test.use({ allowedBrowserErrors: [/Failed to load resource.*400/] });

    test("changing the password with the wrong current password is rejected", async ({ page }) => {
      const email = uniqueEmail();
      const password = "correct-horse-battery-staple";

      await page.goto("/signup");
      await page.getByPlaceholder("Name").fill("Wrong Password Test");
      await page.getByPlaceholder("Email").fill(email);
      await page.getByPlaceholder("Password").fill(password);
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page).toHaveURL(/\/account$/);

      await page.goto("/dashboard/settings");
      await page.getByLabel("Current password").fill("totally-wrong-password");
      await page.getByLabel("New password", { exact: true }).fill("irrelevant-new-password");
      await page.getByLabel("Confirm new password").fill("irrelevant-new-password");
      await page.getByRole("button", { name: "Change password" }).click();

      await expect(page.getByText(/Couldn't change your password|Invalid/i)).toBeVisible();
    });
  });

  test("an unauthenticated visitor is redirected away from settings", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await expect(page).toHaveURL(/\/login$/);
  });
});
