import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import {
  createTestSocialAccount,
  createTestCampaign,
  createTestConversionLog,
  cleanupTestSocialAccount,
} from "@/lib/test-support/db-fixtures";
import {
  MockMetaServer,
  metaSuccessPublicReply,
  metaPermanentBadRequest,
} from "@/lib/test-support/mock-meta-server";
import { sendPublicReply } from "../public-reply";

// Phase A (Automation Reliability): same atomic-claim rewrite and test
// approach as private-reply.test.ts — see that file's doc comment. Kept
// deliberately lighter here since the claim/classification state machine
// itself (services/pipeline-transitions.ts) is already covered in depth
// there; this file's job is to prove public-reply.ts wires it correctly,
// not to re-derive every classification branch a second time.

const mockMeta = new MockMetaServer(() => metaSuccessPublicReply());

let socialAccountId: string;
let campaignId: string;

before(async () => {
  const url = await mockMeta.start();
  process.env.META_GRAPH_API_BASE_URL = url;
});

after(async () => {
  await mockMeta.stop();
});

beforeEach(async () => {
  const account = await createTestSocialAccount();
  socialAccountId = account.id;
  const campaign = await createTestCampaign(socialAccountId);
  campaignId = campaign.id;
  mockMeta.setHandler(() => metaSuccessPublicReply());
});

afterEach(async () => {
  await cleanupTestSocialAccount(socialAccountId);
});

describe("sendPublicReply — atomic claim under concurrency", () => {
  it("two concurrent workers on the same row: exactly one Meta call, exactly one 'sent'", async () => {
    const log = await createTestConversionLog({ campaignId, status: "DM_SENT" });

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPublicReply();
    });

    const [a, b] = await Promise.all([sendPublicReply(log.id), sendPublicReply(log.id)]);

    const outcomes = [a.outcome, b.outcome].sort();
    assert.deepEqual(outcomes, ["not_claimed", "sent"]);
    assert.equal(requestCount, 1, "Meta must be called exactly once, not twice");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "PUBLIC_REPLIED");
  });

  it("the claim loser exits without ever reaching the Meta call", async () => {
    const log = await createTestConversionLog({ campaignId, status: "DM_SENT" });

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPublicReply();
    });

    const winner = await sendPublicReply(log.id);
    assert.equal(winner.outcome, "sent");

    const loser = await sendPublicReply(log.id);
    assert.equal(loser.outcome, "not_claimed");
    assert.equal(requestCount, 1);
  });

  it("captures Meta's reply id on success", async () => {
    mockMeta.setHandler(() => metaSuccessPublicReply("reply.captured-456"));
    const log = await createTestConversionLog({ campaignId, status: "DM_SENT" });

    const result = await sendPublicReply(log.id);
    assert.equal(result.outcome, "sent");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.publicReplyId, "reply.captured-456");
    assert.ok(row.publicRepliedAt);
  });

  it("only claims DM_SENT rows or a due retry — not a MATCHED row that hasn't had a DM sent yet", async () => {
    const log = await createTestConversionLog({ campaignId, status: "MATCHED" });
    const result = await sendPublicReply(log.id);
    assert.equal(result.outcome, "not_claimed");
  });
});

describe("sendPublicReply — failure classification", () => {
  it("a permanent failure dead-letters", async () => {
    mockMeta.setHandler(() => metaPermanentBadRequest);
    const log = await createTestConversionLog({ campaignId, status: "DM_SENT" });

    const result = await sendPublicReply(log.id);
    assert.equal(result.outcome, "dead_letter");

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "DEAD_LETTER");
    assert.equal(row.pendingStage, "PUBLIC_REPLY");
  });
});

describe("sendPublicReply — account enforcement", () => {
  it("a disconnected account makes zero Meta calls", async () => {
    await prisma.socialAccount.update({ where: { id: socialAccountId }, data: { status: "DISCONNECTED" } });
    const log = await createTestConversionLog({ campaignId, status: "DM_SENT" });

    let requestCount = 0;
    mockMeta.setHandler(() => {
      requestCount += 1;
      return metaSuccessPublicReply();
    });

    const result = await sendPublicReply(log.id);
    assert.equal(result.outcome, "account_blocked");
    assert.equal(requestCount, 0);

    const row = await prisma.conversionLog.findUniqueOrThrow({ where: { id: log.id } });
    assert.equal(row.status, "ACCOUNT_BLOCKED");
    assert.equal(row.pendingStage, "PUBLIC_REPLY");
  });
});
