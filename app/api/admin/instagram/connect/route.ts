import { NextResponse } from "next/server";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";
import { createOAuthState, OAUTH_STATE_COOKIE } from "@/lib/modules/meta/oauth-state";
import { buildAuthorizeUrl, InstagramOAuthNotConfiguredError } from "@/lib/modules/meta/instagram-oauth";

// Starts the Instagram Login OAuth flow — admin-gated (this app connects
// its own Instagram Business account(s), not a public signup flow).
export async function GET() {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const state = createOAuthState();
  if (!state) {
    return NextResponse.json(
      { error: "OAuth state signing is not configured on this environment." },
      { status: 503 }
    );
  }

  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl(state);
  } catch (err) {
    if (err instanceof InstagramOAuthNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
