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
