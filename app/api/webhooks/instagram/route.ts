import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/modules/security/rate-limit";
import {
  ingestCommentEvent,
  isInstagramWebhookPayload,
  verifySignature,
  verifySubscriptionChallenge,
} from "@/services/webhook-handler";

// Meta doesn't publish a fixed per-IP webhook delivery rate, so this is a
// defensive ceiling (not a documented Meta limit) — generous enough not to
// throttle real delivery bursts, tight enough to blunt endpoint abuse from a
// single source, same "basic rate limiting" bar as the rest of the app.
const WEBHOOK_POST_LIMIT = 300;
const WEBHOOK_POST_WINDOW_MS = 60 * 1000;

// Meta's subscription verification handshake — confirms this endpoint back
// to the Meta App Dashboard when the webhook subscription is configured.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (!challenge || !verifySubscriptionChallenge(mode, token)) {
    logger.warn("webhook.verify.rejected", { mode });
    return new NextResponse("Forbidden", { status: 403 });
  }

  logger.info("webhook.verify.accepted");
  return new NextResponse(challenge, { status: 200 });
}

// Entry point for every inbound comment event. Order matters: verify the
// signature against the raw body, persist before acknowledging (so a lost
// ack still leaves Meta's redelivery able to find the row via dedup), only
// then respond 200 — per REELS_ENGINE_V1_BLUEPRINT.md Section 6 & 13.
export async function POST(request: Request) {
  const rateLimit = checkRateLimit(
    `webhook-instagram:${getClientIp(request)}`,
    WEBHOOK_POST_LIMIT,
    WEBHOOK_POST_WINDOW_MS
  );
  if (!rateLimit.allowed) {
    logger.warn("webhook.rate_limited");
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    logger.warn("webhook.signature.invalid");
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    logger.warn("webhook.payload.invalid_json");
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (!isInstagramWebhookPayload(payload)) {
    logger.warn("webhook.payload.malformed");
    return NextResponse.json({ error: "Malformed payload." }, { status: 400 });
  }

  // Deliberately not caught: a DB failure here must surface as a 500 so
  // Meta retries delivery, since without a persisted row dedup is impossible
  // on the next attempt (REELS_ENGINE_V1_BLUEPRINT.md Section 13).
  const result = await ingestCommentEvent(payload);
  logger.info("webhook.ingest.completed", result);

  return NextResponse.json({ ok: true });
}
