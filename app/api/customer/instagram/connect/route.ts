import { NextResponse } from "next/server";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import { createCustomerOAuthState, CUSTOMER_OAUTH_STATE_COOKIE } from "@/lib/modules/meta/oauth-state";
import { buildAuthorizeUrl, InstagramOAuthNotConfiguredError } from "@/lib/modules/meta/instagram-oauth";

// MR-3.2 (Single Organization Ownership): starts the same Instagram Login
// OAuth flow as the admin connect route (app/api/admin/instagram/connect),
// but session-gated on the customer's own organization rather than
// ADMIN_PASSCODE, and stamped with a customer-scoped state (see
// oauth-state.ts) so the shared callback route knows which organization
// to attach the resulting SocialAccount to.
export async function GET() {
  const context = await getCustomerContext();
  if (!context) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const state = createCustomerOAuthState(context.organization.id);
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
  response.cookies.set(CUSTOMER_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
