import { createHmac, timingSafeEqual } from "node:crypto";

// CSRF protection for the Instagram OAuth redirect — same signed-token
// pattern as lib/modules/admin/session.ts (no state table; a short-lived
// signed value is enough for a single-admin flow with no concurrent
// multi-user state to track).

export const OAUTH_STATE_COOKIE = "ig_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough to complete the consent screen

function getStateSecret(): string | null {
  const secret = process.env.OAUTH_STATE_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createOAuthState(): string | null {
  const secret = getStateSecret();
  if (!secret) return null;

  const expiresAt = Date.now() + STATE_TTL_MS;
  const nonce = createHmac("sha256", secret).update(String(Math.random())).digest("hex").slice(0, 16);
  const payload = `${expiresAt}.${nonce}`;
  const signature = sign(payload, secret);
  return `${payload}.${signature}`;
}

export function isOAuthStateValid(state: string | undefined | null, cookieValue: string | undefined | null): boolean {
  const secret = getStateSecret();
  if (!secret || !state || !cookieValue || state !== cookieValue) return false;

  const [expiresAtRaw, nonce, signature] = cookieValue.split(".");
  if (!expiresAtRaw || !nonce || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = sign(`${expiresAtRaw}.${nonce}`, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}

// MR-3.2 (Single Organization Ownership): the customer-facing Instagram
// connect flow (app/api/customer/instagram/connect) reuses this same
// signed-state mechanism, but under its own cookie name and payload shape
// carrying the initiating organizationId — Meta's app config has exactly
// one registered redirect_uri, so both the admin and customer flows land
// on the same callback route (app/api/admin/instagram/callback), which
// tells them apart by which of the two state cookies is present and
// valid. Fully additive: createOAuthState/isOAuthStateValid above and
// their cookie (OAUTH_STATE_COOKIE) are untouched, so the existing admin
// flow's behavior does not change.
export const CUSTOMER_OAUTH_STATE_COOKIE = "ig_oauth_state_customer";

// Domain separation: both schemes share OAUTH_STATE_SECRET and both sign a
// "number.string" payload, so without a distinguishing prefix a
// signature minted by createOAuthState (expiresAt.nonce) would also
// verify successfully as a customer state (expiresAt.organizationId) —
// confirmed by a red test during development, not a hypothetical. This
// prefix makes the signed bytes for the two schemes provably different,
// so a token minted for one can never be replayed as the other even
// though they share a secret.
const CUSTOMER_STATE_DOMAIN_TAG = "customer";

export function createCustomerOAuthState(organizationId: string): string | null {
  const secret = getStateSecret();
  if (!secret) return null;

  const expiresAt = Date.now() + STATE_TTL_MS;
  const payload = `${expiresAt}.${organizationId}`;
  const signature = sign(`${CUSTOMER_STATE_DOMAIN_TAG}.${payload}`, secret);
  return `${payload}.${signature}`;
}

/**
 * Returns the organizationId the state was minted for, or null if
 * invalid/expired/tampered. Unlike isOAuthStateValid above (a pre-existing,
 * separately-tracked gap — see docs/MARKET_READINESS_CHECKLIST.md's Meta
 * integration section), the state/cookie equality check here is
 * constant-time throughout, not just the final signature comparison —
 * written correctly from the start since this is new code, not a fix to
 * the untouched admin function.
 */
export function readCustomerOAuthState(
  state: string | undefined | null,
  cookieValue: string | undefined | null
): string | null {
  const secret = getStateSecret();
  if (!secret || !state || !cookieValue) return null;
  const stateBuf = Buffer.from(state);
  const cookieBuf = Buffer.from(cookieValue);
  if (stateBuf.length !== cookieBuf.length || !timingSafeEqual(stateBuf, cookieBuf)) return null;

  const [expiresAtRaw, organizationId, signature] = cookieValue.split(".");
  if (!expiresAtRaw || !organizationId || !signature) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const expected = sign(`${CUSTOMER_STATE_DOMAIN_TAG}.${expiresAtRaw}.${organizationId}`, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return null;

  return timingSafeEqual(expectedBuf, actualBuf) ? organizationId : null;
}
