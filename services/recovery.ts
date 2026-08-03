import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Phase A (Automation Reliability): recovery sweeps run by the cron route
// (app/api/cron/automation/route.ts) on every tick, before any new sends
// are attempted.

/**
 * Finds DM_SENDING/PUBLIC_REPLYING rows whose claim lease has expired — a
 * worker claimed the row and then crashed, timed out, or was killed before
 * recording any outcome. We do not know whether the Meta call was ever
 * made, so these are never reverted to a resendable status (that would
 * risk a real duplicate send). They move to DELIVERY_UNCERTAIN for manual
 * review instead — the only safe response to a genuinely unknown outcome.
 */
export async function recoverStaleClaims(now: Date = new Date()): Promise<number> {
  const staleDm = await prisma.conversionLog.updateMany({
    where: { status: "DM_SENDING", claimExpiresAt: { lt: now } },
    data: {
      status: "DELIVERY_UNCERTAIN",
      pendingStage: "PRIVATE_REPLY",
      lastFailureClassification: "AMBIGUOUS",
      errorMessage: "Claim lease expired before an outcome was recorded (worker crash or timeout).",
      claimExpiresAt: null,
    },
  });

  const stalePublic = await prisma.conversionLog.updateMany({
    where: { status: "PUBLIC_REPLYING", claimExpiresAt: { lt: now } },
    data: {
      status: "DELIVERY_UNCERTAIN",
      pendingStage: "PUBLIC_REPLY",
      lastFailureClassification: "AMBIGUOUS",
      errorMessage: "Claim lease expired before an outcome was recorded (worker crash or timeout).",
      claimExpiresAt: null,
    },
  });

  const total = staleDm.count + stalePublic.count;
  if (total > 0) {
    logger.warn("recovery.stale_claims_recovered", { count: total, dm: staleDm.count, public: stalePublic.count });
  }
  return total;
}

/**
 * Finds ACCOUNT_BLOCKED rows whose owning SocialAccount has become
 * eligible again (ACTIVE + isConnected) since they were blocked, and
 * resumes them at the stage they were blocked at — never re-attempted
 * automatically on a timer, only in direct response to the account
 * actually being reconnected.
 */
export async function resumeAccountBlockedRows(): Promise<number> {
  const resumedPrivate = await prisma.conversionLog.updateMany({
    where: {
      status: "ACCOUNT_BLOCKED",
      pendingStage: "PRIVATE_REPLY",
      campaign: { socialAccount: { status: "ACTIVE", isConnected: true } },
    },
    data: {
      status: "MATCHED",
      pendingStage: null,
      lastFailureClassification: null,
      errorMessage: null,
    },
  });

  const resumedPublic = await prisma.conversionLog.updateMany({
    where: {
      status: "ACCOUNT_BLOCKED",
      pendingStage: "PUBLIC_REPLY",
      campaign: { socialAccount: { status: "ACTIVE", isConnected: true } },
    },
    data: {
      status: "DM_SENT",
      pendingStage: null,
      lastFailureClassification: null,
      errorMessage: null,
    },
  });

  const total = resumedPrivate.count + resumedPublic.count;
  if (total > 0) {
    logger.info("recovery.account_blocked_resumed", {
      count: total,
      privateReply: resumedPrivate.count,
      publicReply: resumedPublic.count,
    });
  }
  return total;
}
