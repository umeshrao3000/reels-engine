import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { createTestSocialAccount, cleanupTestSocialAccount } from "@/lib/test-support/db-fixtures";
import { API_TEST_BASE_URL, startApiTestServer, stopApiTestServer } from "./support/server";

// Node-native tests for the actual customer-facing campaign/keyword/
// Instagram routes (app/api/customer/**), exercised over real HTTP against
// the real built app and a real Postgres instance — the same pattern as
// campaign-keyword-routes.test.ts (admin) and auth-routes.test.ts, and for
// the same reasons (real cookies/session, real origin/rate-limit checks).
//
// This file's actual purpose (MR-3.2, Single Organization Ownership):
// prove cross-organization isolation end to end, not just that the routes
// work. Two real customers sign up (two real organizations, auto-created
// by the signup hook); everything below asserts organization B can never
// read, list, or mutate organization A's data through these routes — a
// 404, indistinguishable from the resource not existing at all, not a
// 403 that would confirm it exists.

const createdUserIds: string[] = [];
const socialAccountIds: string[] = [];

let orgACookie: string;
let orgBCookie: string;
let orgASocialAccountId: string;
let orgACampaignId: string;

before(async () => {
  await startApiTestServer();

  async function signUpCustomer(label: string): Promise<string> {
    const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
    const email = `mr3.2-${label}-${randomUUID()}@example.com`;
    const res = await fetch(`${API_TEST_BASE_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: API_TEST_BASE_URL, "X-Forwarded-For": ip },
      body: JSON.stringify({ name: `MR-3.2 ${label}`, email, password: "correct-horse-battery-staple" }),
    });
    assert.equal(res.status, 200, `sign-up for ${label} must succeed`);
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
    assert.ok(cookie.length > 0, `sign-up for ${label} must set a session cookie`);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdUserIds.push(user.id);
    return cookie;
  }

  orgACookie = await signUpCustomer("org-a");
  orgBCookie = await signUpCustomer("org-b");

  const orgAOrganization = await prisma.organization.findFirstOrThrow({
    where: { ownerUserId: { in: createdUserIds }, owner: { email: { contains: "org-a" } } },
  });

  const account = await createTestSocialAccount({ organizationId: orgAOrganization.id });
  orgASocialAccountId = account.id;
  socialAccountIds.push(account.id);

  const campaign = await prisma.campaign.create({
    data: {
      socialAccountId: account.id,
      instagramMediaId: `mr3.2-media-${randomUUID()}`,
      name: "Org A's Campaign",
      triggerKeywords: ["deal"],
      dmTemplate: "Thanks!",
      publicReplyTemplate: "Check your DMs!",
      keywords: { create: [{ value: "deal" }] },
    },
  });
  orgACampaignId = campaign.id;
});

after(async () => {
  for (const id of socialAccountIds) await cleanupTestSocialAccount(id); // cascades campaigns/keywords
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {}); // cascades organizations
  }
  await stopApiTestServer();
});

describe("GET /api/customer/campaigns — cross-organization isolation", () => {
  it("org A sees its own campaign", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/campaigns`, {
      headers: { Cookie: orgACookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.campaigns.some((c: { id: string }) => c.id === orgACampaignId));
  });

  it("org B does not see org A's campaign", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/campaigns`, {
      headers: { Cookie: orgBCookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(
      !body.campaigns.some((c: { id: string }) => c.id === orgACampaignId),
      "org B's campaign list must never include org A's campaign"
    );
  });

  it("an unauthenticated request is rejected", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/campaigns`);
    assert.equal(res.status, 401);
  });
});

describe("PATCH/DELETE /api/customer/campaigns/[id] — cross-organization isolation", () => {
  it("org B gets 404 (not 403) patching org A's campaign", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/campaigns/${orgACampaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: orgBCookie },
      body: JSON.stringify({ name: "Hijacked" }),
    });
    assert.equal(res.status, 404, "cross-org access must read as not-found, not forbidden");

    const untouched = await prisma.campaign.findUniqueOrThrow({ where: { id: orgACampaignId } });
    assert.equal(untouched.name, "Org A's Campaign", "org B's failed patch must not have changed anything");
  });

  it("org B gets 404 deleting org A's campaign, and it is not deleted", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/campaigns/${orgACampaignId}`, {
      method: "DELETE",
      headers: { Cookie: orgBCookie },
    });
    assert.equal(res.status, 404);

    const stillExists = await prisma.campaign.findUnique({ where: { id: orgACampaignId } });
    assert.ok(stillExists, "org B's failed delete must not have removed org A's campaign");
  });

  it("org A can patch its own campaign", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/campaigns/${orgACampaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: orgACookie },
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.isActive, false);

    // restore for the remaining tests in this file
    await prisma.campaign.update({ where: { id: orgACampaignId }, data: { isActive: true } });
  });
});

describe("POST /api/customer/campaigns — cannot create against another organization's account", () => {
  it("org B gets 404 creating a campaign against org A's social account", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: orgBCookie },
      body: JSON.stringify({
        name: "Should Not Exist",
        socialAccountId: orgASocialAccountId,
        instagramMediaId: `mr3.2-hijack-${randomUUID()}`,
        initialKeywords: "hijack",
        dmTemplate: "x",
        publicReplyTemplate: "x",
      }),
    });
    assert.equal(res.status, 404);

    const count = await prisma.campaign.count({ where: { name: "Should Not Exist" } });
    assert.equal(count, 0, "no campaign must have been created against another organization's account");
  });
});

describe("POST /api/customer/campaigns/[id]/keywords — cross-organization isolation", () => {
  it("org B gets 404 adding keywords to org A's campaign", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/campaigns/${orgACampaignId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: orgBCookie },
      body: JSON.stringify({ keywords: "hijacked-keyword" }),
    });
    assert.equal(res.status, 404);

    const found = await prisma.keyword.findFirst({ where: { campaignId: orgACampaignId, value: "hijacked-keyword" } });
    assert.equal(found, null, "org B must not be able to add a keyword to org A's campaign");
  });

  it("org A can add a keyword to its own campaign", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/campaigns/${orgACampaignId}/keywords`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: orgACookie },
      body: JSON.stringify({ keywords: "promo" }),
    });
    assert.equal(res.status, 200);
  });
});

describe("POST /api/customer/instagram/[id]/disconnect — cross-organization isolation", () => {
  it("org B gets 404 disconnecting org A's social account, which stays ACTIVE", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/instagram/${orgASocialAccountId}/disconnect`, {
      method: "POST",
      headers: { Cookie: orgBCookie },
    });
    assert.equal(res.status, 404);

    const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: orgASocialAccountId } });
    assert.equal(account.status, "ACTIVE", "org B's failed disconnect must not affect org A's account");
  });

  it("an unauthenticated disconnect request is rejected", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/customer/instagram/${orgASocialAccountId}/disconnect`, {
      method: "POST",
    });
    assert.equal(res.status, 401);
  });
});
