import type { DeliveryStatus } from "@prisma/client";

// Presentation-only derivation over fields the pipeline already writes
// (ConversionLog.status/dmSentAt/publicRepliedAt) — makes no decisions,
// duplicates no business logic, just labels what already happened for the
// Monitoring page.

type ConversionLogSummary = {
  status: DeliveryStatus;
  dmSentAt: Date | null;
  publicRepliedAt: Date | null;
};

export function dmStatusLabel(log: ConversionLogSummary): string {
  if (log.dmSentAt) return "Sent";
  if (log.status === "FAILED") return "Failed";
  if (log.status === "PENDING" || log.status === "MATCHED") return "Pending";
  return "—";
}

export function publicReplyStatusLabel(log: ConversionLogSummary): string {
  if (log.publicRepliedAt) return "Sent";
  if (log.status === "FAILED" && log.dmSentAt) return "Failed";
  if (log.status === "DM_SENT") return "Pending";
  return "—";
}

export function tokenExpiryStatus(
  tokenExpiresAt: Date | null
): { level: "ok" | "warning" | "expired" | "unknown"; message: string } {
  if (!tokenExpiresAt) return { level: "unknown", message: "No expiry recorded" };

  const daysLeft = Math.floor((tokenExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return { level: "expired", message: `Expired ${Math.abs(daysLeft)}d ago` };
  if (daysLeft <= 7) return { level: "warning", message: `Expires in ${daysLeft}d` };
  return { level: "ok", message: `Expires in ${daysLeft}d` };
}
