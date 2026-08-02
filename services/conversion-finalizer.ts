import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

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
 */
export async function finalizeConversion(conversionLogId: string): Promise<FinalizeResult> {
  const log = await prisma.conversionLog.findUniqueOrThrow({ where: { id: conversionLogId } });

  if (log.status !== "PUBLIC_REPLIED") {
    logger.info("conversion.finalize.not_ready", { conversionLogId, status: log.status });
    return { conversionLogId, outcome: "not_ready" };
  }

  await prisma.conversionLog.update({ where: { id: log.id }, data: { status: "SUCCESS" } });
  logger.info("conversion.finalize.success", { conversionLogId });
  return { conversionLogId, outcome: "success" };
}
