import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runBatchWithDeadline } from "../batch-runner";
import { CRON_LOCK_TTL_MS, CRON_TIME_BUDGET_MS } from "../reliability-constants";

// Phase A correction: a deadline checked only once before an entire batch
// starts can't stop the batch itself from running long once under way.
// This file proves the shared per-item enforcement directly; see
// private-reply.test.ts for an end-to-end proof against a real (mocked)
// slow Meta call.

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("runBatchWithDeadline", () => {
  it("processes every candidate when no deadline is given", async () => {
    const { results, skippedByDeadline } = await runBatchWithDeadline([1, 2, 3], undefined, async (n) => n * 2);
    assert.deepEqual(results, [2, 4, 6]);
    assert.equal(skippedByDeadline, 0);
  });

  it("stops starting new items once the deadline has passed, mid-batch", async () => {
    const started: number[] = [];
    const deadline = Date.now() + 120;

    const { results, skippedByDeadline } = await runBatchWithDeadline(
      [1, 2, 3, 4, 5],
      deadline,
      async (n) => {
        started.push(n);
        await wait(100); // each item takes long enough that only ~1 fits before the deadline
        return n;
      }
    );

    assert.ok(results.length < 5, `expected fewer than 5 items to run, got ${results.length}`);
    assert.equal(started.length, results.length, "no item should start after the deadline check stops the loop");
    assert.equal(skippedByDeadline, 5 - results.length);
    assert.ok(skippedByDeadline > 0);
  });

  it("a deadline already in the past skips every candidate", async () => {
    let started = 0;
    const { results, skippedByDeadline } = await runBatchWithDeadline(
      [1, 2, 3],
      Date.now() - 1,
      async (n) => {
        started += 1;
        return n;
      }
    );
    assert.equal(results.length, 0);
    assert.equal(started, 0, "nothing should have started");
    assert.equal(skippedByDeadline, 3);
  });
});

describe("cron timing invariant", () => {
  it("the lock TTL safely exceeds the per-run time budget", () => {
    assert.ok(
      CRON_LOCK_TTL_MS > CRON_TIME_BUDGET_MS,
      `CRON_LOCK_TTL_MS (${CRON_LOCK_TTL_MS}) must exceed CRON_TIME_BUDGET_MS (${CRON_TIME_BUDGET_MS}) with margin, ` +
        "or a still-legitimately-running invocation could have its lock reclaimed out from under it"
    );
    // Margin large enough to absorb at least a few in-flight-item overruns
    // (a deadline check only stops *new* work, not work already started —
    // see graph-client.ts's REQUEST_TIMEOUT_MS).
    assert.ok(CRON_LOCK_TTL_MS - CRON_TIME_BUDGET_MS >= 60_000);
  });
});
