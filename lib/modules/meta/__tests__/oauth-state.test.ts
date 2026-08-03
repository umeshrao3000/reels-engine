import { createHmac } from "node:crypto";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createOAuthState, isOAuthStateValid } from "../oauth-state";

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
