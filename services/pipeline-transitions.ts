import { prisma } from "@/lib/prisma";
import type { PipelineStage } from "@prisma/client";
import { MetaApiError } from "@/lib/modules/meta/meta-api-error";
import { MAX_RETRY_ATTEMPTS, computeBackoffMs } from "./reliability-constants";

// Shared by private-reply.ts and public-reply.ts: what happens to a claimed
// (DM_SENDING/PUBLIC_REPLYING) row when the Meta send call fails, based on
// the failure's MetaApiError classification. One state machine, used
// identically by both stages, so there is exactly one place this policy is
// implemented.

export type SendFailureOutcome = "account_blocked" | "retry_pending" | "dead_letter" | "delivery_uncertain";

export async function resolveSendFailure(params: {
  conversionLogId: string;
  stage: PipelineStage;
  currentRetryCount: number;
  metaError: MetaApiError;
}): Promise<SendFailureOutcome> {
  const { conversionLogId, stage, currentRetryCount, metaError } = params;

  const shared = {
    pendingStage: stage,
    errorMessage: metaError.message,
    lastFailureClassification: metaError.classification,
    lastMetaErrorStatus: metaError.httpStatus ?? null,
    lastMetaErrorCode: metaError.metaErrorCode ?? null,
    lastMetaErrorSubcode: metaError.metaErrorSubcode ?? null,
    claimExpiresAt: null,
    retryCount: { increment: 1 },
  };

  // Ambiguous: no HTTP response was ever received, so we cannot tell
  // whether Meta already processed the send. Never auto-resent — surfaced
  // for manual review only (resending here risks a real duplicate).
  if (metaError.classification === "AMBIGUOUS") {
    await prisma.conversionLog.update({
      where: { id: conversionLogId },
      data: { ...shared, status: "DELIVERY_UNCERTAIN", nextRetryAt: null },
    });
    return "delivery_uncertain";
  }

  // Permanent: Meta rejected the request outright (bad params, invalid
  // recipient, policy violation). Retrying would get the same answer.
  if (metaError.classification === "PERMANENT") {
    await prisma.conversionLog.update({
      where: { id: conversionLogId },
      data: { ...shared, status: "DEAD_LETTER", nextRetryAt: null },
    });
    return "dead_letter";
  }

  // Auth: the account's token is confirmed invalid/expired. The row is
  // recoverable (not dead), not on a timer — resumed once the account
  // reconnects (see services/recovery.ts). Flipping SocialAccount.status
  // to TOKEN_EXPIRED is the caller's job, since it's account-scoped, not
  // row-scoped.
  if (metaError.classification === "AUTH") {
    await prisma.conversionLog.update({
      where: { id: conversionLogId },
      data: { ...shared, status: "ACCOUNT_BLOCKED", nextRetryAt: null },
    });
    return "account_blocked";
  }

  // Transient: bounded retry with exponential backoff, then dead-letter.
  const attempt = currentRetryCount + 1;
  if (attempt >= MAX_RETRY_ATTEMPTS) {
    await prisma.conversionLog.update({
      where: { id: conversionLogId },
      data: { ...shared, status: "DEAD_LETTER", nextRetryAt: null },
    });
    return "dead_letter";
  }

  await prisma.conversionLog.update({
    where: { id: conversionLogId },
    data: { ...shared, status: "RETRY_PENDING", nextRetryAt: new Date(Date.now() + computeBackoffMs(attempt)) },
  });
  return "retry_pending";
}
