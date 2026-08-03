import { createHmac } from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ingestCommentEvent,
  isInstagramWebhookPayload,
  verifySignature,
  verifySubscriptionChallenge,
  type InstagramWebhookPayload,
} from "../webhook-handler";
import { prisma } from "@/lib/prisma";
import { cleanupTestConversionLog } from "@/lib/test-support/db-fixtures";

const ORIGINAL_APP_SECRET = process.env.META_APP_SECRET;
const ORIGINAL_VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN;

describe("verifySignature", () => {
  before(() => {
    process.env.META_APP_SECRET = "test-app-secret";
  });
  after(() => {
    process.env.META_APP_SECRET = ORIGINAL_APP_SECRET;
  });

  function sign(body: string, secret = "test-app-secret"): string {
    return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  }

  it("accepts a correctly signed body", () => {
    const body = JSON.stringify({ hello: "world" });
    assert.equal(verifySignature(body, sign(body)), true);
  });

  it("rejects a body signed with the wrong secret", () => {
    const body = JSON.stringify({ hello: "world" });
    assert.equal(verifySignature(body, sign(body, "wrong-secret")), false);
  });

  it("rejects a tampered body against a signature for the original body", () => {
    const original = JSON.stringify({ hello: "world" });
    const tampered = JSON.stringify({ hello: "mallory" });
    assert.equal(verifySignature(tampered, sign(original)), false);
  });

  it("rejects a missing signature header", () => {
    assert.equal(verifySignature("{}", null), false);
  });

  it("rejects a malformed scheme (sha1 instead of sha256)", () => {
    const body = "{}";
    const badScheme = "sha1=" + createHmac("sha256", "test-app-secret").update(body).digest("hex");
    assert.equal(verifySignature(body, badScheme), false);
  });

  it("rejects when META_APP_SECRET is not configured", () => {
    delete process.env.META_APP_SECRET;
    try {
      assert.equal(verifySignature("{}", "sha256=abc"), false);
    } finally {
      process.env.META_APP_SECRET = "test-app-secret";
    }
  });
});

describe("verifySubscriptionChallenge", () => {
  before(() => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
  });
  after(() => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = ORIGINAL_VERIFY_TOKEN;
  });

  it("accepts subscribe mode with the correct token", () => {
    assert.equal(verifySubscriptionChallenge("subscribe", "test-verify-token"), true);
  });

  it("rejects the wrong token", () => {
    assert.equal(verifySubscriptionChallenge("subscribe", "wrong-token"), false);
  });

  it("rejects a non-subscribe mode", () => {
    assert.equal(verifySubscriptionChallenge("unsubscribe", "test-verify-token"), false);
  });

  it("rejects a null mode or token", () => {
    assert.equal(verifySubscriptionChallenge(null, "test-verify-token"), false);
    assert.equal(verifySubscriptionChallenge("subscribe", null), false);
  });
});

describe("isInstagramWebhookPayload", () => {
  it("accepts a well-formed payload", () => {
    assert.equal(isInstagramWebhookPayload({ object: "instagram", entry: [] }), true);
  });

  it("rejects a payload with the wrong object type", () => {
    assert.equal(isInstagramWebhookPayload({ object: "page", entry: [] }), false);
  });

  it("rejects a payload with a non-array entry", () => {
    assert.equal(isInstagramWebhookPayload({ object: "instagram", entry: "nope" }), false);
  });

  it("rejects null/undefined/primitives", () => {
    assert.equal(isInstagramWebhookPayload(null), false);
    assert.equal(isInstagramWebhookPayload(undefined), false);
    assert.equal(isInstagramWebhookPayload("instagram"), false);
  });
});

describe("ingestCommentEvent", () => {
  const createdIds: string[] = [];
  after(async () => {
    for (const id of createdIds) await cleanupTestConversionLog(id);
  });

  function payloadFor(commentId: string, text = "hello"): InstagramWebhookPayload {
    return {
      object: "instagram",
      entry: [
        {
          id: "entry-1",
          time: Date.now(),
          changes: [
            {
              field: "comments",
              value: { id: commentId, text, from: { id: "ig-user-1", username: "tester" }, media: { id: "media-1" } },
            },
          ],
        },
      ],
    };
  }

  it("persists a valid comment change as a PENDING ConversionLog row", async () => {
    const commentId = `wh-test-${Date.now()}-a`;
    const result = await ingestCommentEvent(payloadFor(commentId));
    createdIds.push(...result.persistedIds);

    assert.equal(result.persisted, 1);
    assert.equal(result.duplicates, 0);
    assert.equal(result.skipped, 0);

    const row = await prisma.conversionLog.findUnique({ where: { commentId } });
    assert.ok(row, "expected the row to exist");
    assert.equal(row?.status, "PENDING");
    assert.equal(row?.commentText, "hello");
  });

  it("dedups a redelivered commentId instead of erroring", async () => {
    const commentId = `wh-test-${Date.now()}-b`;
    const first = await ingestCommentEvent(payloadFor(commentId));
    createdIds.push(...first.persistedIds);
    assert.equal(first.persisted, 1);

    const second = await ingestCommentEvent(payloadFor(commentId));
    assert.equal(second.persisted, 0);
    assert.equal(second.duplicates, 1);

    const count = await prisma.conversionLog.count({ where: { commentId } });
    assert.equal(count, 1, "redelivery must not create a second row");
  });

  it("skips a change whose field is not 'comments'", async () => {
    const payload: InstagramWebhookPayload = {
      object: "instagram",
      entry: [{ id: "entry-2", changes: [{ field: "likes", value: { id: "irrelevant" } }] }],
    };
    const result = await ingestCommentEvent(payload);
    assert.equal(result.persisted, 0);
    assert.equal(result.skipped, 1);
  });

  it("skips a comments change with no comment id", async () => {
    const payload: InstagramWebhookPayload = {
      object: "instagram",
      entry: [{ id: "entry-3", changes: [{ field: "comments", value: { text: "no id here" } }] }],
    };
    const result = await ingestCommentEvent(payload);
    assert.equal(result.persisted, 0);
    assert.equal(result.skipped, 1);
  });
});
