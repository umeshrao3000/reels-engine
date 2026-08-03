import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyHttpFailure, classifyNetworkFailure } from "../meta-api-error";

// Phase A correction: every HTTP 403 was previously classified AUTH,
// including permission/policy rejections that have nothing to do with the
// token being invalid — that would wrongly flip a healthy account to
// TOKEN_EXPIRED. Only 401, or a structured token-invalid/expired code
// (190) at any status, is AUTH.

describe("classifyHttpFailure", () => {
  it("401 is AUTH regardless of body", () => {
    const err = classifyHttpFailure(401, JSON.stringify({ error: { message: "invalid token" } }));
    assert.equal(err.classification, "AUTH");
  });

  it("401 with no parseable body is still AUTH", () => {
    const err = classifyHttpFailure(401, "not json");
    assert.equal(err.classification, "AUTH");
  });

  it("403 WITHOUT a token-invalid code is PERMANENT, not AUTH", () => {
    const err = classifyHttpFailure(
      403,
      JSON.stringify({ error: { message: "Permission denied", code: 200 } })
    );
    assert.equal(err.classification, "PERMANENT");
  });

  it("403 with no code at all is PERMANENT", () => {
    const err = classifyHttpFailure(403, JSON.stringify({ error: { message: "Forbidden" } }));
    assert.equal(err.classification, "PERMANENT");
  });

  it("403 WITH the confirmed token-invalid code (190) is AUTH", () => {
    const err = classifyHttpFailure(
      403,
      JSON.stringify({ error: { message: "Error validating access token", code: 190, error_subcode: 460 } })
    );
    assert.equal(err.classification, "AUTH");
    assert.equal(err.metaErrorCode, 190);
  });

  it("400 with the token-invalid code (190) is AUTH even though the status is neither 401 nor 403", () => {
    const err = classifyHttpFailure(400, JSON.stringify({ error: { message: "bad token", code: 190 } }));
    assert.equal(err.classification, "AUTH");
  });

  it("429 is TRANSIENT", () => {
    const err = classifyHttpFailure(429, JSON.stringify({ error: { message: "rate limited", code: 4 } }));
    assert.equal(err.classification, "TRANSIENT");
  });

  it("5xx is TRANSIENT", () => {
    const err = classifyHttpFailure(503, JSON.stringify({ error: { message: "unavailable" } }));
    assert.equal(err.classification, "TRANSIENT");
  });

  it("a generic 400 without any token code is PERMANENT", () => {
    const err = classifyHttpFailure(400, JSON.stringify({ error: { message: "Invalid parameter", code: 100 } }));
    assert.equal(err.classification, "PERMANENT");
  });

  it("captures httpStatus/metaErrorCode/metaErrorSubcode for downstream logging", () => {
    const err = classifyHttpFailure(
      403,
      JSON.stringify({ error: { message: "x", code: 190, error_subcode: 460 } })
    );
    assert.equal(err.httpStatus, 403);
    assert.equal(err.metaErrorCode, 190);
    assert.equal(err.metaErrorSubcode, 460);
  });
});

describe("classifyNetworkFailure", () => {
  it("is always AMBIGUOUS — no HTTP response means no way to know what Meta did", () => {
    const err = classifyNetworkFailure(new Error("fetch failed"));
    assert.equal(err.classification, "AMBIGUOUS");
  });
});
