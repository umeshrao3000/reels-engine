import type { ProjectStatus } from "@prisma/client";

// Admin-driven forward path once payment is confirmed. DRAFT->PAID is
// intentionally excluded — that transition only happens via verified
// payment (see /api/admin/payments/[id]), never through this control.
const ADMIN_STATUS_ORDER: ProjectStatus[] = [
  "PAID",
  "IN_PROGRESS",
  "QUALITY_CHECK",
  "COMPLETED",
  "DELIVERED",
];

export function nextAdminStatus(current: ProjectStatus): ProjectStatus | null {
  const index = ADMIN_STATUS_ORDER.indexOf(current);
  if (index === -1 || index === ADMIN_STATUS_ORDER.length - 1) return null;
  return ADMIN_STATUS_ORDER[index + 1];
}

export function isValidAdminTransition(from: ProjectStatus, to: ProjectStatus): boolean {
  return nextAdminStatus(from) === to;
}
