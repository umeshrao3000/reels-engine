// Typed Meta API failure, replacing the previous generic-Error-plus-message-
// string-matching approach. Every caller of graph-client.ts/instagram-oauth.ts
// gets one of two failure shapes, never a plain Error:
//
// - An HTTP response WAS received: classify from the status code and, when
//   present, Meta's structured `{ error: { code, error_subcode, message } }`
//   body. We know exactly what happened.
// - No HTTP response was received at all (fetch itself threw — timeout,
//   DNS failure, connection reset, abort): classified AMBIGUOUS. `fetch`
//   gives no portable way to tell "never left this machine" from "sent, but
//   the response was lost," so we cannot safely assume either — callers
//   must treat this as an unconfirmed outcome, never a safe-to-retry one.

export type MetaErrorClassification = "TRANSIENT" | "PERMANENT" | "AUTH" | "AMBIGUOUS";

export type MetaApiErrorParams = {
  message: string;
  classification: MetaErrorClassification;
  httpStatus?: number;
  metaErrorCode?: number;
  metaErrorSubcode?: number;
};

export class MetaApiError extends Error {
  readonly classification: MetaErrorClassification;
  readonly httpStatus?: number;
  readonly metaErrorCode?: number;
  readonly metaErrorSubcode?: number;

  constructor(params: MetaApiErrorParams) {
    super(params.message);
    this.name = "MetaApiError";
    this.classification = params.classification;
    this.httpStatus = params.httpStatus;
    this.metaErrorCode = params.metaErrorCode;
    this.metaErrorSubcode = params.metaErrorSubcode;
  }
}

// Meta's OAuthException code — the canonical "this access token is invalid,
// expired, or was revoked" signal, independent of HTTP status (Meta
// sometimes returns these with a 400, not just 401). See:
// https://developers.facebook.com/docs/graph-api/guides/error-handling/
//
// Not used for 403 in general: Meta also returns 403 for permission/policy
// rejections that have nothing to do with the token being invalid (e.g.
// missing a required permission, messaging-policy violations). Treating
// every 403 as AUTH would wrongly flip a healthy, still-valid-token
// account to TOKEN_EXPIRED over an unrelated permission problem — only a
// confirmed token-invalid signal (401, or one of these codes regardless of
// status) is AUTH.
const AUTH_ERROR_CODES = new Set([190]);

type MetaErrorBody = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
  };
};

function parseMetaErrorBody(raw: string): MetaErrorBody | undefined {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as MetaErrorBody) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Classifies a non-2xx HTTP response from Meta. `rawBody` is the raw
 * response text (already consumed by the caller) — parsed defensively,
 * since a non-JSON error body must not throw here.
 */
export function classifyHttpFailure(status: number, rawBody: string): MetaApiError {
  const parsed = parseMetaErrorBody(rawBody);
  const code = parsed?.error?.code;
  const subcode = parsed?.error?.error_subcode;
  const message = parsed?.error?.message || `Meta API request failed (${status}): ${rawBody.slice(0, 500)}`;

  let classification: MetaErrorClassification;
  if (status === 401 || (code !== undefined && AUTH_ERROR_CODES.has(code))) {
    // Confirmed token failure: either the standard "unauthorized" status,
    // or a structured token-invalid/expired code Meta returns regardless
    // of status (including on a 403).
    classification = "AUTH";
  } else if (status === 429 || status >= 500) {
    classification = "TRANSIENT";
  } else {
    // Includes a 403 without a token-invalid code — a permission or
    // policy rejection, not a token problem. Also 400/404/etc.
    classification = "PERMANENT";
  }

  return new MetaApiError({
    message,
    classification,
    httpStatus: status,
    metaErrorCode: code,
    metaErrorSubcode: subcode,
  });
}

/**
 * Classifies a failure where no HTTP response was ever received (the
 * `fetch()` call itself threw). Always AMBIGUOUS — see module doc comment.
 */
export function classifyNetworkFailure(err: unknown): MetaApiError {
  const message = err instanceof Error ? err.message : "Unknown network error contacting Meta";
  return new MetaApiError({ message, classification: "AMBIGUOUS" });
}
