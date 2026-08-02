// Thin wrapper over Meta's Graph API Send endpoint — no SDK dependency,
// same pattern as lib/modules/payments/razorpay.ts (a single fetch call,
// throws on a non-2xx response). Base URL is overridable via
// META_GRAPH_API_BASE_URL so tests can point it at a local stand-in
// instead of the real graph.facebook.com.
const GRAPH_API_BASE_URL = process.env.META_GRAPH_API_BASE_URL || "https://graph.facebook.com";
const GRAPH_API_VERSION = "v21.0";

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
  const url = `${GRAPH_API_BASE_URL}/${GRAPH_API_VERSION}/me/messages?access_token=${encodeURIComponent(params.pageAccessToken)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { comment_id: params.commentId },
      message: { text: params.text },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Meta private reply failed (${response.status}): ${detail}`);
  }

  return response.json();
}
