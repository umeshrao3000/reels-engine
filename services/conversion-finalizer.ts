import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { runBatchWithDeadline, type BatchOutcome } from "./batch-runner";

// Single responsibility (per REELS_ENGINE_V1_BLUEPRINT.md Section 1 & 6):
// closes the DeliveryStatus pipeline's last transition
// (PUBLIC_REPLIED -> SUCCESS). No external calls, no business decisions —
// just the terminal bookkeeping step once every prior stage has succeeded.

export type FinalizeOutcome = "success" | "not_ready";

export type FinalizeResult = {
  conversionLogId: string;
  outcome: FinalizeOutcome;
};

/**
 * Marks a PUBLIC_REPLIED row SUCCESS. Idempotent: a row not currently
 * PUBLIC_REPLIED (not yet there, or already finalized by an earlier run)
 * is left untouched.
 *
 * Phase A (Automation Reliability): uses a conditional `updateMany`
 * guarded on `status: "PUBLIC_REPLIED"` rather than a plain `update` — no
 * external side effect here, so this is only about making the read-check-
 * write itself race-free against a concurrent finalize of the same row,
 * for the same one-consistent-final-status reason as trigger-matcher.ts.
 */
export async function finalizeConversion(conversionLogId: string): Promise<FinalizeResult> {
  const log = await prisma.conversionLog.findUniqueOrThrow({ where: { id: conversionLogId } });

  if (log.status !== "PUBLIC_REPLIED") {
    logger.info("conversion.finalize.not_ready", { conversionLogId, status: log.status });
    return { conversionLogId, outcome: "not_ready" };
  }

  const claimed = await prisma.conversionLog.updateMany({
    where: { id: log.id, status: "PUBLIC_REPLIED" },
    data: { status: "SUCCESS" },
  });
  if (claimed.count === 0) {
    logger.info("conversion.finalize.not_ready", { conversionLogId, status: "already finalized" });
    return { conversionLogId, outcome: "not_ready" };
  }

  logger.info("conversion.finalize.success", { conversionLogId });
  return { conversionLogId, outcome: "success" };
}

/**
 * Batch entry point over every currently PUBLIC_REPLIED row, oldest first.
 * Called by the cron route. `deadline` (epoch ms), if given, is checked
 * before every item — see services/batch-runner.ts.
 */
export async function finalizePendingConversions(
  limit = 50,
  deadline?: number
): Promise<BatchOutcome<FinalizeResult>> {
  const pending = await prisma.conversionLog.findMany({
    where: { status: "PUBLIC_REPLIED" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  return runBatchWithDeadline(pending.map((row) => row.id), deadline, finalizeConversion);
}
