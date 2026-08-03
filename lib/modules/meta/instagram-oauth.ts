// Instagram Login OAuth client — no SDK, same pattern as
// lib/modules/payments/razorpay.ts and lib/modules/meta/graph-client.ts.
//
// Two distinct hosts, per Meta's own separation for this flow:
// - api.instagram.com  — the authorize screen and the initial code exchange
// - graph.instagram.com — everything after (long-lived exchange, refresh,
//   account fetch, webhook subscription), same host graph-client.ts uses
//   for messaging/comment-reply calls.
//
// Instagram Login uses its own Instagram App ID/Secret pair (shown in the
// Meta App Dashboard's "Instagram > API setup with Instagram login"
// section), distinct from the top-level Meta App Secret already used for
// webhook signature verification (services/webhook-handler.ts) — hence
// separate env vars rather than reusing META_APP_SECRET.

import { classifyHttpFailure, classifyNetworkFailure } from "./meta-api-error";

const OAUTH_API_BASE_URL = process.env.INSTAGRAM_OAUTH_API_BASE_URL || "https://api.instagram.com";
// Read lazily (per call) — see graph-client.ts's identical comment.
function graphApiBaseUrl(): string {
  return process.env.META_GRAPH_API_BASE_URL || "https://graph.instagram.com";
}
const GRAPH_API_VERSION = "v21.0";

export class InstagramOAuthNotConfiguredError extends Error {
  constructor() {
    super("Instagram OAuth is not configured on this environment.");
    this.name = "InstagramOAuthNotConfiguredError";
  }
}

function requireConfig(): { appId: string; appSecret: string; redirectUri: string } {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI;
  if (!appId || !appSecret || !redirectUri) throw new InstagramOAuthNotConfiguredError();
  return { appId, appSecret, redirectUri };
}

const REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
];

export function buildAuthorizeUrl(state: string): string {
  const { appId, redirectUri } = requireConfig();
  const url = new URL(`${OAUTH_API_BASE_URL}/oauth/authorize`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", REQUIRED_SCOPES.join(","));
  url.searchParams.set("state", state);
  return url.toString();
}

type ShortLivedTokenResponse = {
  access_token: string;
  user_id: string;
};

export async function exchangeCodeForToken(code: string): Promise<ShortLivedTokenResponse> {
  const { appId, appSecret, redirectUri } = requireConfig();

  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(`${OAUTH_API_BASE_URL}/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Instagram code exchange failed (${response.status}): ${detail}`);
  }

  return response.json();
}

type LongLivedTokenResponse = {
  access_token: string;
  expires_in: number;
};

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedTokenResponse> {
  const { appSecret } = requireConfig();

  const url = new URL(`${graphApiBaseUrl()}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Instagram long-lived token exchange failed (${response.status}): ${detail}`);
  }

  return response.json();
}

/**
 * Refreshes a still-valid long-lived token for another ~60 days. Throws a
 * MetaApiError (Phase A) rather than a plain Error — the token-refresh
 * sweep (services/token-refresh-sweep.ts) needs the classification to
 * decide between "confirmed invalid, mark the account TOKEN_EXPIRED" and
 * "transient, leave ACTIVE and retry next sweep."
 */
export async function refreshLongLivedToken(currentToken: string): Promise<LongLivedTokenResponse> {
  const url = new URL(`${graphApiBaseUrl()}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", currentToken);

  let response: Response;
  try {
    response = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw classifyNetworkFailure(err);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw classifyHttpFailure(response.status, detail);
  }

  return response.json();
}

type AccountInfoResponse = {
  user_id: string;
  username: string;
};

export async function fetchAccountInfo(accessToken: string): Promise<AccountInfoResponse> {
  const url = new URL(`${graphApiBaseUrl()}/${GRAPH_API_VERSION}/me`);
  url.searchParams.set("fields", "user_id,username");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Instagram account fetch failed (${response.status}): ${detail}`);
  }

  return response.json();
}

/**
 * Activates webhook delivery for this specific account — the App
 * Dashboard's webhook config alone isn't enough; each connected account
 * must individually "install" the app via this call, or Meta never sends
 * comment events for it.
 */
export async function subscribeToWebhooks(accessToken: string): Promise<void> {
  const url = new URL(`${graphApiBaseUrl()}/${GRAPH_API_VERSION}/me/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "comments");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString(), { method: "POST" });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Instagram webhook subscription failed (${response.status}): ${detail}`);
  }
}
