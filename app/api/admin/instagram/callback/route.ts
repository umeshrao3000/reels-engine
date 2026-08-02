import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { encrypt } from "@/lib/crypto";
import { isRequestFromAdmin } from "@/lib/modules/admin/session";
import { isOAuthStateValid, OAUTH_STATE_COOKIE } from "@/lib/modules/meta/oauth-state";
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

// The OAuth redirect target. Verifies CSRF state, then runs the full
// code -> short-lived token -> long-lived token -> account info ->
// webhook subscription -> encrypt -> upsert sequence.
export async function GET(request: Request) {
  if (!(await isRequestFromAdmin())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const cookieState = (await cookies()).get(OAUTH_STATE_COOKIE)?.value;

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
