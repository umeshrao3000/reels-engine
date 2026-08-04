import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@/lib/prisma";
import { API_TEST_BASE_URL, startApiTestServer, stopApiTestServer } from "./support/server";

// Node-native tests for the real customer-auth routes
// (app/api/auth/[...all], better-auth), exercised over real HTTP against
// the real built app and a real Postgres instance — same pattern as
// campaign-keyword-routes.test.ts, and for the same reason: better-auth's
// handler reads/writes cookies via next/headers, which requires a real
// request scope.
//
// Two real, on-by-default better-auth protections this file works *with*,
// not around:
// - Origin check: state-changing requests need a same-origin `Origin`
//   header, exactly like a real browser sends automatically and Node's
//   plain `fetch()` does not — `authHeaders()` below adds it so these
//   tests behave like a real client, not so the check is weakened.
// - Rate limiting: 3 requests/10s on every /sign-up*, /sign-in*,
//   /change-password, /change-email path, keyed by client IP (real,
//   on by default in production — which this test server is, via
//   `next start`). Each `it()` below simulates a distinct real customer
//   with its own fake X-Forwarded-For, so this suite's many independent
//   scenarios don't trip each other's shared attacker-style budget the
//   way they legitimately would if they actually were the same IP
//   hammering the endpoint.

const createdUserIds: string[] = [];

before(async () => {
  await startApiTestServer();
});

after(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
  }
  await stopApiTestServer();
});

function testEmail(): string {
  return `mr3.1-test-${randomUUID()}@example.com`;
}

function fakeClientIp(): string {
  return `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
}

function authHeaders(clientIp: string): HeadersInit {
  return { "Content-Type": "application/json", Origin: API_TEST_BASE_URL, "X-Forwarded-For": clientIp };
}

/** Collapses every Set-Cookie header from a response into one Cookie header value, the way a browser would. */
function extractCookieHeader(res: Response): string {
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

async function signUp(clientIp: string, email: string, password = "correct-horse-battery-staple") {
  const res = await fetch(`${API_TEST_BASE_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: authHeaders(clientIp),
    body: JSON.stringify({ name: "MR-3.1 Test User", email, password }),
  });
  return res;
}

describe("POST /api/auth/sign-up/email", () => {
  it("creates a real User row with a hashed (not plaintext) password", async () => {
    const ip = fakeClientIp();
    const email = testEmail();
    const password = "correct-horse-battery-staple";
    const res = await signUp(ip, email, password);
    assert.equal(res.status, 200);

    const user = await prisma.user.findUnique({ where: { email }, include: { accounts: true } });
    assert.ok(user, "expected a User row to exist after sign-up");
    createdUserIds.push(user!.id);

    assert.equal(user!.accounts.length, 1);
    const storedPassword = user!.accounts[0].password;
    assert.ok(storedPassword, "expected the credential account to store a password hash");
    assert.notEqual(storedPassword, password, "password must never be stored in plaintext");
  });

  it("rejects a password shorter than the minimum length", async () => {
    const res = await signUp(fakeClientIp(), testEmail(), "short");
    assert.equal(res.status, 400);
  });

  it("does not allow signing up twice with the same email", async () => {
    const ip = fakeClientIp();
    const email = testEmail();
    const first = await signUp(ip, email);
    assert.equal(first.status, 200);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) createdUserIds.push(user.id);

    const second = await signUp(ip, email);
    assert.notEqual(second.status, 200);
  });
});

describe("POST /api/auth/sign-in/email + session management", () => {
  it("logs in with correct credentials and the session persists across requests", async () => {
    const ip = fakeClientIp();
    const email = testEmail();
    const password = "correct-horse-battery-staple";
    const signUpRes = await signUp(ip, email, password);
    assert.equal(signUpRes.status, 200);
    const user = await prisma.user.findUnique({ where: { email } });
    assert.ok(user);
    createdUserIds.push(user!.id);

    const signInRes = await fetch(`${API_TEST_BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: authHeaders(ip),
      body: JSON.stringify({ email, password }),
    });
    assert.equal(signInRes.status, 200);
    const cookie = extractCookieHeader(signInRes);
    assert.ok(cookie.length > 0, "expected sign-in to set a session cookie");

    const sessionRes = await fetch(`${API_TEST_BASE_URL}/api/auth/get-session`, {
      headers: { Cookie: cookie },
    });
    assert.equal(sessionRes.status, 200);
    const sessionBody = await sessionRes.json();
    assert.equal(sessionBody.user.email, email);

    const signOutRes = await fetch(`${API_TEST_BASE_URL}/api/auth/sign-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: API_TEST_BASE_URL, Cookie: cookie },
      body: "{}",
    });
    assert.equal(signOutRes.status, 200);

    const afterSignOutRes = await fetch(`${API_TEST_BASE_URL}/api/auth/get-session`, {
      headers: { Cookie: cookie },
    });
    const afterSignOutBody = await afterSignOutRes.json().catch(() => null);
    assert.ok(!afterSignOutBody?.user, "session must not still be valid after sign-out");
  });

  it("rejects sign-in with the wrong password", async () => {
    const ip = fakeClientIp();
    const email = testEmail();
    const signUpRes = await signUp(ip, email, "correct-horse-battery-staple");
    assert.equal(signUpRes.status, 200);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) createdUserIds.push(user.id);

    const res = await fetch(`${API_TEST_BASE_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: authHeaders(ip),
      body: JSON.stringify({ email, password: "wrong-password-entirely" }),
    });
    assert.equal(res.status, 401);
  });

  it("has no session for a request with no cookie at all", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/auth/get-session`);
    assert.equal(res.status, 200);
    const body = await res.json().catch(() => null);
    assert.ok(!body?.user);
  });
});

describe("POST /api/auth/request-password-reset (NoOpEmailProvider)", () => {
  it("fails gracefully — 200 — for a real registered email, without sending anything", async () => {
    const ip = fakeClientIp();
    const email = testEmail();
    const signUpRes = await signUp(ip, email);
    assert.equal(signUpRes.status, 200);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) createdUserIds.push(user.id);

    const res = await fetch(`${API_TEST_BASE_URL}/api/auth/request-password-reset`, {
      method: "POST",
      headers: authHeaders(ip),
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 200);
  });

  it("fails gracefully — 200, not 500 — for an email that was never registered (no enumeration)", async () => {
    const res = await fetch(`${API_TEST_BASE_URL}/api/auth/request-password-reset`, {
      method: "POST",
      headers: authHeaders(fakeClientIp()),
      body: JSON.stringify({ email: testEmail() }),
    });
    assert.equal(res.status, 200);
  });
});
