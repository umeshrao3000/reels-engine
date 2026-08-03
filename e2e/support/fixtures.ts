import { test as base, expect } from "@playwright/test";

// Reusable browser-error capture: fails the test if the page throws an
// uncaught error or logs an error-level console message. Auto-applied to
// every test that imports `test` from this file — specs opt in simply by
// importing from here instead of "@playwright/test" directly.
//
// `allowedBrowserErrors` is a narrow, per-test escape hatch — not a way to
// silence real problems. Chromium logs any non-2xx fetch/XHR response as a
// "Failed to load resource" console.error, including ones a test
// deliberately triggers and asserts on (e.g. a golden-path 400 for invalid
// input). Use it only to name that exact, already-asserted status code.
export const test = base.extend<{ failOnBrowserErrors: void; allowedBrowserErrors: RegExp[] }>({
  allowedBrowserErrors: [[], { option: true }],
  failOnBrowserErrors: [
    async ({ page, allowedBrowserErrors }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
      });

      await use();

      const unexpected = errors.filter((error) => !allowedBrowserErrors.some((pattern) => pattern.test(error)));
      expect(unexpected, `Unexpected browser error(s):\n${unexpected.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
