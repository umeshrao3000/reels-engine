import { createHmac } from "node:crypto";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOAuthState, isOAuthStateValid, createCustomerOAuthState, readCustomerOAuthState } from "../oauth-state";

describe("createOAuthState / isOAuthStateValid", () => {
  before(() => {
    process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";
  });

  it("round-trips: a freshly created state validates against itself as both the query param and the cookie", () => {
    const state = createOAuthState();
    assert.ok(state, "expected a state value to be created");
    assert.equal(isOAuthStateValid(state, state), true);
  });

  it("rejects when the query-param state does not match the cookie value", () => {
    const state = createOAuthState();
    const other = createOAuthState();
    assert.ok(state && other && state !== other);
    assert.equal(isOAuthStateValid(state, other), false);
  });

  it("rejects a cookie value with a tampered signature", () => {
    const state = createOAuthState();
    assert.ok(state);
    const [expiresAt, nonce] = state!.split(".");
    const tampered = `${expiresAt}.${nonce}.0000000000000000000000000000000000000000000000000000000000000000`;
    assert.equal(isOAuthStateValid(tampered, tampered), false);
  });

  it("rejects a state signed under a different secret", () => {
    const state = createOAuthState();
    assert.ok(state);
    process.env.OAUTH_STATE_SECRET = "a-different-secret";
    try {
      assert.equal(isOAuthStateValid(state, state), false);
    } finally {
      process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";
    }
  });

  it("rejects an expired state", () => {
    const pastExpiry = Date.now() - 1000;
    const nonce = "0123456789abcdef";
    const payload = `${pastExpiry}.${nonce}`;
    const signature = createHmac("sha256", "test-oauth-state-secret").update(payload).digest("hex");
    const expired = `${payload}.${signature}`;
    assert.equal(isOAuthStateValid(expired, expired), false);
  });

  it("rejects a malformed cookie value (missing segments)", () => {
    assert.equal(isOAuthStateValid("not-enough-parts", "not-enough-parts"), false);
  });

  it("rejects null/undefined state or cookie value", () => {
    const state = createOAuthState();
    assert.equal(isOAuthStateValid(null, state), false);
    assert.equal(isOAuthStateValid(state, null), false);
    assert.equal(isOAuthStateValid(undefined, undefined), false);
  });

  it("createOAuthState returns null and isOAuthStateValid rejects everything when OAUTH_STATE_SECRET is unset", () => {
    delete process.env.OAUTH_STATE_SECRET;
    try {
      assert.equal(createOAuthState(), null);
      assert.equal(isOAuthStateValid("a.b.c", "a.b.c"), false);
    } finally {
      process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";
    }
  });
});

// MR-3.2 (Single Organization Ownership): the customer-facing variant used
// by the /dashboard Instagram connect flow — same signing mechanism, its
// own cookie/payload shape (see the module-level comment on
// createCustomerOAuthState), fully additive to the suite above.
describe("createCustomerOAuthState / readCustomerOAuthState", () => {
  before(() => {
    process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";
  });

  it("round-trips: a freshly created state returns the organizationId it was minted for", () => {
    const state = createCustomerOAuthState("org_test_123");
    assert.ok(state);
    assert.equal(readCustomerOAuthState(state, state), "org_test_123");
  });

  it("rejects when the query-param state does not match the cookie value", () => {
    const state = createCustomerOAuthState("org_a");
    const other = createCustomerOAuthState("org_b");
    assert.equal(readCustomerOAuthState(state, other), null);
  });

  it("rejects a tampered organizationId (signature no longer matches)", () => {
    const state = createCustomerOAuthState("org_real");
    assert.ok(state);
    const [expiresAt, , signature] = state!.split(".");
    const tampered = `${expiresAt}.org_attacker.${signature}`;
    assert.equal(readCustomerOAuthState(tampered, tampered), null);
  });

  it("rejects an expired state", () => {
    const pastExpiry = Date.now() - 1000;
    const payload = `${pastExpiry}.org_test`;
    const signature = createHmac("sha256", "test-oauth-state-secret").update(payload).digest("hex");
    const expired = `${payload}.${signature}`;
    assert.equal(readCustomerOAuthState(expired, expired), null);
  });

  it("never collides with the admin state's cookie/payload shape", () => {
    const adminState = createOAuthState();
    assert.ok(adminState);
    // The admin state has no organizationId segment — feeding it to the
    // customer reader must not accidentally validate.
    assert.equal(readCustomerOAuthState(adminState, adminState), null);
  });

  it("createCustomerOAuthState returns null and readCustomerOAuthState rejects everything when OAUTH_STATE_SECRET is unset", () => {
    delete process.env.OAUTH_STATE_SECRET;
    try {
      assert.equal(createCustomerOAuthState("org_x"), null);
      assert.equal(readCustomerOAuthState("a.b.c", "a.b.c"), null);
    } finally {
      process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";
    }
  });
});
