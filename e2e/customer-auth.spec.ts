import { test, expect } from "./support/fixtures";

// MR-3.1 (Beta SaaS Build Program): customer sign-up → session persists →
// log out → log back in, plus the forgot-password request path — the
// entire scope of this milestone, exercised through a real browser against
// the real app, real Postgres, and better-auth's real routes (no mocking).

function uniqueEmail(): string {
  return `e2e-customer-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test.describe("customer sign-up, session, and log out/in", () => {
  test("a new customer can sign up, sees their signed-in account, and can log out and back in", async ({
    page,
  }) => {
    const email = uniqueEmail();
    const password = "correct-horse-battery-staple";

    await page.goto("/signup");
    await page.getByPlaceholder("Name").fill("E2E Customer");
    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText("You're signed in")).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // Session persists across a fresh navigation, not just client-side state.
    await page.reload();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // /account must not be reachable anymore now that the session is gone.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByPlaceholder("Email").fill(email);
    await page.getByPlaceholder("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(email)).toBeVisible();
  });
});

test.describe("forgot password (NoOpEmailProvider)", () => {
  test("requesting a reset always shows the same generic confirmation, without erroring", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByPlaceholder("Email").fill(uniqueEmail());
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText("Check your email")).toBeVisible();
    await expect(page.getByText(/If an account exists for/)).toBeVisible();
  });
});
