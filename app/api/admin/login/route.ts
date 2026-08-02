import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken,
  isPasscodeCorrect,
} from "@/lib/modules/admin/session";
import { checkRateLimit, getClientIp } from "@/lib/modules/security/rate-limit";

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    `admin-login:${getClientIp(request)}`,
    LOGIN_ATTEMPT_LIMIT,
    LOGIN_ATTEMPT_WINDOW_MS
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  let body: { passcode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const passcode = body.passcode;
  if (typeof passcode !== "string" || passcode.length === 0) {
    return NextResponse.json({ error: "Passcode is required." }, { status: 400 });
  }

  if (!isPasscodeCorrect(passcode)) {
    return NextResponse.json({ error: "Incorrect passcode." }, { status: 401 });
  }

  const token = createAdminSessionToken();
  if (!token) {
    return NextResponse.json(
      { error: "Admin login is not configured on this environment." },
      { status: 503 }
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
