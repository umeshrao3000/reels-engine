import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createAdminSessionToken } from "@/lib/modules/admin/session";
import { createTestSocialAccount, cleanupTestSocialAccount } from "@/lib/test-support/db-fixtures";
import { API_TEST_BASE_URL, startApiTestServer, stopApiTestServer } from "./support/server";

// Node-native tests for the actual campaign/keyword API routes
// (app/api/admin/campaigns/**), exercised over real HTTP against the real
// built app and a real Postgres instance — no mocking of the routes, auth,
// or database. See test/api/support/server.ts for why this can't be done
// via direct handler import.

let socialAccountId: string;
let adminCookie: string;
let createdCampaignId: string;

before(async () => {
  await startApiTestServer();

  const account = await createTestSocialAccount();
  socialAccountId = account.id;

  const token = createAdminSessionToken();
  assert.ok(token, "ADMIN_SESSION_SECRET must be set for API-route tests to create a valid session");
  adminCookie = `admin_session=${token}`;
});

after(async () => {
  if (createdCampaignId) {
    await prisma.campaign.delete({ where: { id: createdCampaignId } }).catch(() => {});
  }
  await cleanupTestSocialAccount(socialAccountId);
  await stopApiTestServer();
});

function campaignPayload(overrides: Partial<Record<string, unknown>> = {}) {
  const suffix = randomUUID();
  return {
    name: `API Test Campaign ${suffix.slice(0, 8)}`,
    socialAccountId,
    instagramMediaId: `api-test-media-${suffix}`,
    initialKeywords: `apitest${suffix.slice(0, 8)}`,
    dmTemplate: "Thanks for your interest!",
    publicReplyTemplate: "Check your DMs!",
    ...overrides,
  };
}

describe("POST /api/admin/campaigns", () => {
  it("rejects unauthorized campaign creation", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/admin/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campaignPayload()),
    });
    assert.equal(res.status, 401);
  });

  it("rejects an invalid campaign payload even when authenticated", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/admin/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ name: "" }),
    });
    assert.equal(res.status, 400);
  });

  it("creates a campaign when authenticated with a valid payload", async () => {
    const payload = campaignPayload();
    const res = await fetch(`${API_TEST_BASE_URL}/api/admin/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify(payload),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.id);
    createdCampaignId = body.id;

    const row = await prisma.campaign.findUnique({ where: { id: body.id } });
    assert.ok(row, "campaign should actually exist in the database");
    assert.equal(row?.name, payload.name);
  });
});

describe("keyword routes", () => {
  it("rejects unauthorized keyword add", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/admin/campaigns/${createdCampaignId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: "newkeyword" }),
    });
    assert.equal(res.status, 401);
  });

  it("rejects unauthorized keyword update", async () => {
    const res = await fetch(
      `${API_TEST_BASE_URL}/api/admin/campaigns/${createdCampaignId}/keywords/nonexistent-id`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }
    );
    assert.equal(res.status, 401);
  });

  it("rejects unauthorized keyword delete", async () => {
    const res = await fetch(
      `${API_TEST_BASE_URL}/api/admin/campaigns/${createdCampaignId}/keywords/nonexistent-id`,
      { method: "DELETE" }
    );
    assert.equal(res.status, 401);
  });

  it("handles a nonexistent campaign on keyword add", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/admin/campaigns/nonexistent-campaign-id/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ keywords: "newkeyword" }),
    });
    assert.equal(res.status, 404);
  });

  it("handles a nonexistent keyword on update and delete", async () => {
    const patchRes = await fetch(
      `${API_TEST_BASE_URL}/api/admin/campaigns/${createdCampaignId}/keywords/nonexistent-keyword-id`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ isActive: false }),
      }
    );
    assert.equal(patchRes.status, 404);

    const deleteRes = await fetch(
      `${API_TEST_BASE_URL}/api/admin/campaigns/${createdCampaignId}/keywords/nonexistent-keyword-id`,
      { method: "DELETE", headers: { Cookie: adminCookie } }
    );
    assert.equal(deleteRes.status, 404);
  });

  it("adds, updates, and deletes a keyword when authenticated", async () => {
    const value = `apikw${randomUUID().slice(0, 8)}`;

    const addRes = await fetch(`${API_TEST_BASE_URL}/api/admin/campaigns/${createdCampaignId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ keywords: value }),
    });
    assert.equal(addRes.status, 200);

    const created = await prisma.keyword.findFirst({ where: { campaignId: createdCampaignId, value } });
    assert.ok(created, "keyword should actually exist in the database after add");

    const patchRes = await fetch(
      `${API_TEST_BASE_URL}/api/admin/campaigns/${createdCampaignId}/keywords/${created!.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ isActive: false }),
      }
    );
    assert.equal(patchRes.status, 200);

    const updated = await prisma.keyword.findUnique({ where: { id: created!.id } });
    assert.equal(updated?.isActive, false);

    const deleteRes = await fetch(
      `${API_TEST_BASE_URL}/api/admin/campaigns/${createdCampaignId}/keywords/${created!.id}`,
      { method: "DELETE", headers: { Cookie: adminCookie } }
    );
    assert.equal(deleteRes.status, 200);

    const deleted = await prisma.keyword.findUnique({ where: { id: created!.id } });
    assert.equal(deleted, null);
  });
});
