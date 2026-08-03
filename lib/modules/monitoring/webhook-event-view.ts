import type { Prisma } from "@prisma/client";

// Read-only view helpers for the Monitoring page. Deliberately not imported
// from services/trigger-matcher.ts (which has its own private, near-identical
// extractMediaId/extractUsername) — this milestone is explicitly scoped to
// not modify the Automation Engine, so Monitoring gets its own small, pure
// copies rather than exporting anything from that file. Both read the same
// ConversionLog.rawPayload shape webhook-handler.ts already persists.

export function extractMediaIdFromRawPayload(rawPayload: Prisma.JsonValue | null): string | undefined {
  if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) return undefined;
  const media = (rawPayload as Record<string, unknown>).media;
  if (!media || typeof media !== "object" || Array.isArray(media)) return undefined;
  const id = (media as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

// Every ConversionLog row persisted today came from a webhook "comments"
// change — services/webhook-handler.ts's ingestCommentEvent only persists
// changes where change.field === "comments" (anything else is counted as
// skipped and never written to the DB), and the field itself isn't stored
// on the row. So "comment" is the correct, honest value for every existing
// row, not a placeholder — this stays accurate unless the webhook handler
// is later extended to persist other event types.
export function eventTypeLabel(): string {
  return "comment";
}
