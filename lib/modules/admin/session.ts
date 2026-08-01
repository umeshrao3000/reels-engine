import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

function getSessionSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Minimal passcode-gated admin session, designed to be swapped for real
 * auth + RBAC (Owner/Admin/Editor/Client) later without touching callers —
 * everything else in the app only ever calls isAdminSessionValid().
 */
export function createAdminSessionToken(): string | null {
  const secret = getSessionSecret();
  if (!secret) return null;

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = sign(String(expiresAt), secret);
  return `${expiresAt}.${signature}`;
}

export function isAdminSessionValid(token: string | undefined | null): boolean {
  const secret = getSessionSecret();
  if (!secret || !token) return false;

  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expected = sign(expiresAtRaw, secret);
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;

  return timingSafeEqual(expectedBuf, actualBuf);
}

export function isPasscodeCorrect(candidate: string): boolean {
  const passcode = process.env.ADMIN_PASSCODE;
  if (!passcode || passcode.length === 0) return false;

  const candidateBuf = Buffer.from(candidate);
  const passcodeBuf = Buffer.from(passcode);
  if (candidateBuf.length !== passcodeBuf.length) return false;

  return timingSafeEqual(candidateBuf, passcodeBuf);
}
