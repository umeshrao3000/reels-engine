import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Single responsibility (per REELS_ENGINE_V1_BLUEPRINT.md Section 1 & 6):
// this file verifies the Meta subscription handshake and the request
// signature, persists inbound comment events, and dispatches them to the
// processing queue. It does not match keywords or send replies — that's
// trigger-matcher.ts / private-reply.ts / public-reply.ts (Milestones 3+).

type InstagramWebhookValue = {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string; media_product_type?: string };
};

type InstagramWebhookChange = {
  field: string;
  value?: InstagramWebhookValue;
};

type InstagramWebhookEntry = {
  id: string;
  time?: number;
  changes?: InstagramWebhookChange[];
};

export type InstagramWebhookPayload = {
  object: string;
  entry: InstagramWebhookEntry[];
};

export function isInstagramWebhookPayload(payload: unknown): payload is InstagramWebhookPayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return candidate.object === "instagram" && Array.isArray(candidate.entry);
}

/**
 * Meta's GET subscription handshake: confirm hub.mode === "subscribe" and
 * hub.verify_token matches the token configured in the Meta App Dashboard.
 */
export function verifySubscriptionChallenge(mode: string | null, token: string | null): boolean {
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expectedToken || !mode || !token || mode !== "subscribe") return false;

  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expectedToken);
  if (tokenBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(tokenBuf, expectedBuf);
}

/**
 * Verifies X-Hub-Signature-256: "sha256=<hex HMAC-SHA256 of the raw body,
 * keyed by the Meta App Secret>". Caller must pass the raw, unparsed body —
 * re-serializing the parsed JSON would not reproduce Meta's signature.
 */
export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signatureHeader) return false;

  const [scheme, providedHex] = signatureHeader.split("=");
  if (scheme !== "sha256" || !providedHex) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expectedHex);
  const providedBuf = Buffer.from(providedHex);
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

export type IngestResult = {
  persisted: number;
  duplicates: number;
  skipped: number;
};

/**
 * Persists every "comments" change as a ConversionLog row (status: PENDING
 * by schema default) and dispatches it to the processing queue. Non-comment
 * fields and changes missing a comment id are skipped, not fatal — one bad
 * change in a batch shouldn't drop the rest of a valid delivery.
 *
 * commentId's DB-level unique constraint is the actual dedup guarantee
 * (catches Meta's documented webhook redelivery behavior); a P2002 here is
 * treated as a duplicate, not an error.
 */
export async function ingestCommentEvent(payload: InstagramWebhookPayload): Promise<IngestResult> {
  const result: IngestResult = { persisted: 0, duplicates: 0, skipped: 0 };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") {
        result.skipped += 1;
        continue;
      }

      const commentId = change.value?.id;
      if (!commentId) {
        result.skipped += 1;
        logger.warn("webhook.comment.missing_id", { entryId: entry.id });
        continue;
      }

      try {
        const log = await prisma.conversionLog.create({
          data: {
            commentId,
            commentText: change.value?.text ?? null,
            instagramUserId: change.value?.from?.id ?? null,
            rawPayload: change.value as Prisma.InputJsonValue,
          },
        });
        result.persisted += 1;
        dispatchProcessing(log.id);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          result.duplicates += 1;
          continue;
        }
        throw err;
      }
    }
  }

  return result;
}

/**
 * Hands a persisted event off to processing. V1 uses a DB-backed queue
 * (REELS_ENGINE_V1_BLUEPRINT.md Section 10) — the ConversionLog row created
 * above, sitting at its default PENDING status, already *is* the queue
 * entry. There is no separate consumer yet: trigger-matcher.ts (Milestone 3)
 * is what will actually pick up PENDING rows via a Vercel Cron tick. This
 * call is an observability hook for now, kept as its own step so that wiring
 * in the real consumer later doesn't change webhook-handler.ts's shape.
 */
function dispatchProcessing(conversionLogId: string): void {
  logger.info("webhook.dispatch.queued", { conversionLogId });
}
