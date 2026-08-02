import { matchConversionLog } from "@/services/trigger-matcher";
import { sendPrivateReply } from "@/services/private-reply";
import { sendPublicReply } from "@/services/public-reply";
import { finalizeConversion } from "@/services/conversion-finalizer";

// Coordinates the pipeline for a single persisted ConversionLog row:
// match -> private reply -> public reply -> finalize. Deliberately thin —
// it owns no business logic of its own. Each stage's own service already
// decides what happened and records it (status, errorMessage, retryCount,
// dmSentAt, publicRepliedAt); this file only decides whether to proceed to
// the next stage or stop, based on what that stage reported. Persisting the
// event (webhook -> ConversionLog row) happens in webhook-handler.ts before
// this is ever called — this orchestrator starts at "match" and ends at
// "SUCCESS", per Milestone 6's scope.

export type PipelineOutcome =
  | "success"
  | "no_match"
  | "private_reply_failed"
  | "public_reply_failed"
  | "already_processed";

export type PipelineResult = {
  conversionLogId: string;
  outcome: PipelineOutcome;
};

/**
 * Runs one ConversionLog row through match -> private reply -> public
 * reply -> finalize, stopping at the first stage that doesn't succeed.
 * Idempotent by inheritance: every stage already guards on its own
 * required input status, so re-running this on an already-processed row
 * stops immediately at whichever stage's guard first rejects it — no
 * separate idempotency check is implemented here.
 */
export async function runPipeline(conversionLogId: string): Promise<PipelineResult> {
  const matchResult = await matchConversionLog(conversionLogId);
  if (matchResult.outcome === "already_processed") {
    return { conversionLogId, outcome: "already_processed" };
  }
  if (matchResult.outcome !== "matched") {
    return { conversionLogId, outcome: "no_match" };
  }

  const privateReplyResult = await sendPrivateReply(conversionLogId);
  if (privateReplyResult.outcome !== "sent") {
    return { conversionLogId, outcome: "private_reply_failed" };
  }

  const publicReplyResult = await sendPublicReply(conversionLogId);
  if (publicReplyResult.outcome !== "sent") {
    return { conversionLogId, outcome: "public_reply_failed" };
  }

  await finalizeConversion(conversionLogId);
  return { conversionLogId, outcome: "success" };
}
