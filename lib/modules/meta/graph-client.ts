// Thin wrapper over Meta's Graph API Send endpoint — no SDK dependency,
// same pattern as lib/modules/payments/razorpay.ts (a single fetch call).
// Base URL is overridable via META_GRAPH_API_BASE_URL so tests can point it
// at a local stand-in.
//
// Host is graph.instagram.com (Instagram Login), not graph.facebook.com —
// per the OAuth Architecture decision: this product connects Instagram
// Business accounts directly (Instagram Login), not via a linked Facebook
// Page (Facebook Login for Business), so tokens obtained by
// lib/modules/meta/instagram-oauth.ts are Instagram User access tokens,
// valid only against the graph.instagram.com host. Same env var as
// instagram-oauth.ts's graph-hosted calls — one override point for "the
// Graph API host" across both messaging and OAuth.
//
// Phase A (Automation Reliability): every failure is thrown as a
// MetaApiError, never a plain Error — see meta-api-error.ts for why
// "no HTTP response received" (AMBIGUOUS) is handled distinctly from
// "Meta responded with a failure status."
import { classifyHttpFailure, classifyNetworkFailure } from "./meta-api-error";

// Read lazily (per call), not captured in a module-level const: tests point
// this at a local stand-in server after the module has already loaded, and
// a const captured at import time would never see that override.
function graphApiBaseUrl(): string {
  return process.env.META_GRAPH_API_BASE_URL || "https://graph.instagram.com";
}
const GRAPH_API_VERSION = "v21.0";

// A send call that hangs forever would otherwise hold its claim (Phase A:
// services/reliability-constants.ts's CLAIM_LEASE_MS) for the full lease
// before a stale-claim sweep could ever resolve it. This timeout aborts
// first — the resulting AbortError is thrown by fetch() itself and lands
// in the same catch-and-classify path as any other network failure
// (AMBIGUOUS: we still can't tell whether Meta received the request).
const REQUEST_TIMEOUT_MS = 15_000;

export type SendPrivateReplyResponse = {
  recipient_id: string;
  message_id: string;
};

/**
 * Sends a private reply (DM) to whoever left a given Instagram comment.
 * Uses the Send API's private-reply addressing: the recipient is keyed by
 * `comment_id`, not a user id — https://developers.facebook.com/docs/instagram-platform/private-replies/
 */
export async function sendInstagramPrivateReply(params: {
  commentId: string;
  text: string;
  pageAccessToken: string;
}): Promise<SendPrivateReplyResponse> {
  const url = `${graphApiBaseUrl()}/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(params.pageAccessToken)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { comment_id: params.commentId },
        message: { text: params.text },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw classifyNetworkFailure(err);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw classifyHttpFailure(response.status, detail);
  }

  return response.json();
}

export type SendPublicReplyResponse = {
  id: string;
};

/**
 * Posts a public reply on a given Instagram comment — a new, visible
 * comment on the same media, distinct from the private-reply Send API
 * above. https://developers.facebook.com/docs/marketing-api/reference/instagram-comment/replies
 */
export async function sendInstagramPublicReply(params: {
  commentId: string;
  text: string;
  pageAccessToken: string;
}): Promise<SendPublicReplyResponse> {
  const url = `${graphApiBaseUrl()}/${GRAPH_API_VERSION}/${encodeURIComponent(params.commentId)}/replies?access_token=${encodeURIComponent(params.pageAccessToken)}&message=${encodeURIComponent(params.text)}`;

  let response: Response;
  try {
    response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw classifyNetworkFailure(err);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw classifyHttpFailure(response.status, detail);
  }

  return response.json();
}
