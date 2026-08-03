import { createHmac } from "node:crypto";
import { before, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createAdminSessionToken,
  isAdminSessionValid,
  isPasscodeCorrect,
} from "../session";

const ORIGINAL_PASSCODE = process.env.ADMIN_PASSCODE;
const ORIGINAL_SECRET = process.env.ADMIN_SESSION_SECRET;

describe("isPasscodeCorrect", () => {
  before(() => {
    process.env.ADMIN_PASSCODE = "correct-horse-battery-staple";
  });

  it("accepts the exact configured passcode", () => {
    assert.equal(isPasscodeCorrect("correct-horse-battery-staple"), true);
  });

  it("rejects a wrong passcode", () => {
    assert.equal(isPasscodeCorrect("wrong-passcode"), false);
  });

  it("rejects a candidate of a different length without throwing", () => {
    assert.equal(isPasscodeCorrect("x"), false);
    assert.equal(isPasscodeCorrect("correct-horse-battery-staple-but-longer"), false);
  });

  it("rejects everything when ADMIN_PASSCODE is not configured", () => {
    delete process.env.ADMIN_PASSCODE;
    try {
      assert.equal(isPasscodeCorrect("anything"), false);
      assert.equal(isPasscodeCorrect(""), false);
    } finally {
      process.env.ADMIN_PASSCODE = "correct-horse-battery-staple";
    }
  });

  it("rejects an empty candidate against a real passcode", () => {
    assert.equal(isPasscodeCorrect(""), false);
  });
});

describe("createAdminSessionToken / isAdminSessionValid", () => {
  before(() => {
    process.env.ADMIN_SESSION_SECRET = "test-session-secret";
  });

  it("round-trips: a freshly created token validates", () => {
    const token = createAdminSessionToken();
    assert.ok(token, "expected a token to be created");
    assert.equal(isAdminSessionValid(token), true);
  });

  it("rejects a token with a tampered signature", () => {
    const token = createAdminSessionToken();
    assert.ok(token);
    const [expiresAt] = token!.split(".");
    const tampered = `${expiresAt}.0000000000000000000000000000000000000000000000000000000000000000`;
    assert.equal(isAdminSessionValid(tampered), false);
  });

  it("rejects a token signed under a different secret", () => {
    const token = createAdminSessionToken();
    assert.ok(token);
    process.env.ADMIN_SESSION_SECRET = "a-different-secret";
    try {
      assert.equal(isAdminSessionValid(token), false);
    } finally {
      process.env.ADMIN_SESSION_SECRET = "test-session-secret";
    }
  });

  it("rejects an expired token", () => {
    // Hand-construct a token with an expiry in the past, signed correctly,
    // to prove expiry is actually enforced and not just format-checked.
    const pastExpiry = Date.now() - 1000;
    const signature = createHmac("sha256", "test-session-secret").update(String(pastExpiry)).digest("hex");
    const expiredToken = `${pastExpiry}.${signature}`;
    assert.equal(isAdminSessionValid(expiredToken), false);
  });

  it("rejects a malformed token (missing signature segment)", () => {
    assert.equal(isAdminSessionValid("12345"), false);
  });

  it("rejects null/undefined", () => {
    assert.equal(isAdminSessionValid(null), false);
    assert.equal(isAdminSessionValid(undefined), false);
  });

  it("createAdminSessionToken returns null and isAdminSessionValid rejects everything when ADMIN_SESSION_SECRET is unset", () => {
    delete process.env.ADMIN_SESSION_SECRET;
    try {
      assert.equal(createAdminSessionToken(), null);
      assert.equal(isAdminSessionValid("anything.at-all"), false);
    } finally {
      process.env.ADMIN_SESSION_SECRET = "test-session-secret";
    }
  });
});

describe("test module env restoration", () => {
  it("restores original env vars for other test files", () => {
    process.env.ADMIN_PASSCODE = ORIGINAL_PASSCODE;
    process.env.ADMIN_SESSION_SECRET = ORIGINAL_SECRET;
    assert.ok(true);
  });
});
