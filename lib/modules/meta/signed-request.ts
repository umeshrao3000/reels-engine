import { createHmac, timingSafeEqual } from "node:crypto";

// Parses Meta's "signed_request" format, used for the deauthorize and data
// deletion callbacks (distinct from the X-Hub-Signature-256 header used by
// the comment webhook — this is a self-contained signed payload, not a
// signature-over-a-separate-body). Format: "<base64url signature>.<base64url JSON payload>".

type SignedRequestPayload = {
  user_id?: string;
  algorithm?: string;
};

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

/**
 * Verifies and parses a signed_request. Returns the payload's user_id (the
 * Instagram-scoped account id) on success, or null if the signature is
 * missing, malformed, or doesn't match.
 */
export function parseSignedRequest(signedRequest: string, secret: string): string | null {
  const [signaturePart, payloadPart] = signedRequest.split(".");
  if (!signaturePart || !payloadPart) return null;

  const expectedSignature = createHmac("sha256", secret).update(payloadPart).digest();
  const providedSignature = base64UrlDecode(signaturePart);
  if (expectedSignature.length !== providedSignature.length) return null;
  if (!timingSafeEqual(expectedSignature, providedSignature)) return null;

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadPart).toString("utf8"));
  } catch {
    return null;
  }

  return typeof payload.user_id === "string" ? payload.user_id : null;
}
