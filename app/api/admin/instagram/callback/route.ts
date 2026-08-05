import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { encrypt } from "@/lib/crypto";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";
import { getCustomerContext } from "@/lib/modules/organizations/session";
import {
  isOAuthStateValid,
  OAUTH_STATE_COOKIE,
  readCustomerOAuthState,
  CUSTOMER_OAUTH_STATE_COOKIE,
} from "@/lib/modules/meta/oauth-state";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchAccountInfo,
  subscribeToWebhooks,
} from "@/lib/modules/meta/instagram-oauth";

function redirectWithStatus(request: Request, status: string): NextResponse {
  const url = new URL("/ops/social-accounts", request.url);
  url.searchParams.set("status", status);
  const response = NextResponse.redirect(url);
  response.cookies.delete(OAUTH_STATE_COOKIE);
  return response;
}

// MR-3.2 (Single Organization Ownership): Meta's app config has exactly
// one registered redirect_uri, so the customer-facing connect flow
// (app/api/customer/instagram/connect) necessarily lands here too, not on
// a separate route — there is nowhere else for it to go. Dispatched on
// whether the customer OAuth state cookie is present, checked before the
// admin branch runs; when it isn't, everything below behaves exactly as
// it did before this milestone (isRequestFromAdmin, OAUTH_STATE_COOKIE,
// /ops/social-accounts) — unchanged.
function redirectCustomerWithStatus(request: Request, status: string): NextResponse {
  const url = new URL("/dashboard/instagram", request.url);
  url.searchParams.set("status", status);
  const response = NextResponse.redirect(url);
  response.cookies.delete(CUSTOMER_OAUTH_STATE_COOKIE);
  return response;
}

async function handleCustomerCallback(request: Request, customerCookieState: string): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    logger.info("instagram.oauth.customer.denied", { error: oauthError });
    return redirectCustomerWithStatus(request, "denied");
  }

  const organizationId = readCustomerOAuthState(state, customerCookieState);
  if (!organizationId) {
    logger.warn("instagram.oauth.customer.invalid_state");
    return redirectCustomerWithStatus(request, "invalid_state");
  }

  // Defense-in-depth beyond the signed state itself: the initiating
  // customer must still be signed in to this organization when Meta
  // redirects back.
  const context = await getCustomerContext();
  if (!context || context.organization.id !== organizationId) {
    logger.warn("instagram.oauth.customer.session_mismatch");
    return redirectCustomerWithStatus(request, "invalid_state");
  }

  if (!code) {
    logger.warn("instagram.oauth.customer.missing_code");
    return redirectCustomerWithStatus(request, "missing_code");
  }

  let longLivedToken: string;
  let expiresIn: number;
  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    longLivedToken = longLived.access_token;
    expiresIn = longLived.expires_in;
  } catch (err) {
    logger.error("instagram.oauth.customer.token_exchange_failed", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return redirectCustomerWithStatus(request, "token_exchange_failed");
  }

  let accountId: string;
  let username: string;
  try {
    const account = await fetchAccountInfo(longLivedToken);
    accountId = account.user_id;
    username = account.username;
  } catch (err) {
    logger.error("instagram.oauth.customer.account_fetch_failed", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return redirectCustomerWithStatus(request, "account_fetch_failed");
  }

  // Cross-organization isolation: the real Instagram account owner could
  // in principle run this flow twice under two different organizations
  // (Meta only verifies they own the Instagram account, not which of our
  // organizations should get it). Reconnecting an account already owned
  // by THIS organization is a normal token refresh; touching a row owned
  // by a different organization — or one connected via the admin
  // surface — is rejected outright rather than silently reassigning
  // ownership or overwriting another tenant's live token.
  const existing = await prisma.socialAccount.findUnique({ where: { instagramBusinessId: accountId } });
  if (existing && existing.organizationId !== organizationId) {
    logger.warn("instagram.oauth.customer.account_conflict", {
      accountId,
      organizationId,
      existingOrganizationId: existing.organizationId,
    });
    return redirectCustomerWithStatus(request, "already_connected");
  }

  await prisma.socialAccount.upsert({
    where: { instagramBusinessId: accountId },
    create: {
      instagramBusinessId: accountId,
      instagramUsername: username,
      pageAccessToken: encrypt(longLivedToken),
      status: "ACTIVE",
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      organizationId,
    },
    update: {
      instagramUsername: username,
      pageAccessToken: encrypt(longLivedToken),
      status: "ACTIVE",
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    },
  });
  logger.info("instagram.oauth.customer.connected", { accountId, username, organizationId });

  try {
    await subscribeToWebhooks(longLivedToken);
  } catch (err) {
    logger.error("instagram.oauth.customer.subscribe_failed", {
      accountId,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return redirectCustomerWithStatus(request, "connected_subscribe_failed");
  }

  return redirectCustomerWithStatus(request, "connected");
}

// The OAuth redirect target. Verifies CSRF state, then runs the full
// code -> short-lived token -> long-lived token -> account info ->
// webhook subscription -> encrypt -> upsert sequence.
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const customerCookieState = cookieStore.get(CUSTOMER_OAUTH_STATE_COOKIE)?.value;
  if (customerCookieState) {
    return handleCustomerCallback(request, customerCookieState);
  }

  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const cookieState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;

  if (oauthError) {
    // The admin declined consent, or Meta rejected the request — a normal
    // outcome, not a bug. Nothing was persisted; nothing to clean up.
    logger.info("instagram.oauth.denied", { error: oauthError });
    return redirectWithStatus(request, "denied");
  }

  if (!isOAuthStateValid(state, cookieState)) {
    logger.warn("instagram.oauth.invalid_state");
    return redirectWithStatus(request, "invalid_state");
  }

  if (!code) {
    logger.warn("instagram.oauth.missing_code");
    return redirectWithStatus(request, "missing_code");
  }

  let longLivedToken: string;
  let expiresIn: number;
  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.access_token);
    longLivedToken = longLived.access_token;
    expiresIn = longLived.expires_in;
  } catch (err) {
    logger.error("instagram.oauth.token_exchange_failed", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return redirectWithStatus(request, "token_exchange_failed");
  }

  let accountId: string;
  let username: string;
  try {
    const account = await fetchAccountInfo(longLivedToken);
    accountId = account.user_id;
    username = account.username;
  } catch (err) {
    logger.error("instagram.oauth.account_fetch_failed", {
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return redirectWithStatus(request, "account_fetch_failed");
  }

  await prisma.socialAccount.upsert({
    where: { instagramBusinessId: accountId },
    create: {
      instagramBusinessId: accountId,
      instagramUsername: username,
      pageAccessToken: encrypt(longLivedToken),
      status: "ACTIVE",
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    },
    update: {
      instagramUsername: username,
      pageAccessToken: encrypt(longLivedToken),
      status: "ACTIVE",
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    },
  });
  logger.info("instagram.oauth.connected", { accountId, username });

  // A subscription failure means the token is valid and the account is
  // connected, but comment events won't arrive yet — worth surfacing
  // distinctly rather than forcing the whole consent flow to be redone
  // over what's usually a transient Meta-side issue.
  try {
    await subscribeToWebhooks(longLivedToken);
  } catch (err) {
    logger.error("instagram.oauth.subscribe_failed", {
      accountId,
      error: err instanceof Error ? err.message : "Unknown error",
    });
    return redirectWithStatus(request, "connected_subscribe_failed");
  }

  return redirectWithStatus(request, "connected");
}
