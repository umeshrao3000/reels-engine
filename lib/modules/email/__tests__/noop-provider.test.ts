import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { NoOpEmailProvider } from "../noop-provider";

describe("NoOpEmailProvider", () => {
  it("never throws — password reset must fail gracefully with no provider configured", async () => {
    const provider = new NoOpEmailProvider();
    await assert.doesNotReject(() =>
      provider.sendPasswordReset({ to: "customer@example.com", url: "https://example.com/reset?token=abc123" })
    );
  });

  it("logs that a reset was requested, but never logs the reset URL/token", async () => {
    const originalWarn = console.warn;
    const calls: unknown[][] = [];
    console.warn = mock.fn((...args: unknown[]) => {
      calls.push(args);
    });

    try {
      const provider = new NoOpEmailProvider();
      const sensitiveUrl = "https://example.com/reset?token=super-secret-live-token";
      await provider.sendPasswordReset({ to: "customer@example.com", url: sensitiveUrl });

      assert.equal(calls.length, 1, "expected exactly one warn log line");
      const logged = String(calls[0][0]);
      assert.match(logged, /customer@example\.com/);
      assert.doesNotMatch(logged, /super-secret-live-token/, "the live reset token must never be logged");
      assert.doesNotMatch(logged, /reset\?token=/, "the reset URL must never be logged");
    } finally {
      console.warn = originalWarn;
    }
  });
});
