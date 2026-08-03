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
  | "already_processed"
  // Phase A: a stage stopped without erroring — these are legitimate
  // waypoints (a scheduled retry, a resumable account block, an ambiguous
  // outcome pending manual review, or a genuine dead letter), not
  // generic "failed" states. The cron route's retry/recovery sweeps are
  // what move a row past any of these; runPipeline itself only ever runs
  // a row's *first* pass (from the webhook's inline dispatch).
  | "retry_pending"
  | "account_blocked"
  | "delivery_uncertain"
  | "dead_letter";

export type PipelineResult = {
  conversionLogId: string;
  outcome: PipelineOutcome;
};

/**
 * Runs one ConversionLog row through match -> private reply -> public
 * reply -> finalize, stopping at the first stage that doesn't succeed.
 * Idempotent by inheritance: every stage already guards on its own
 * required input status (via an atomic claim/conditional update — Phase A),
 * so re-running this on an already-processed or already-claimed row stops
 * immediately at whichever stage's guard first rejects it — no separate
 * idempotency check is implemented here.
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
  if (privateReplyResult.outcome === "not_claimed") {
    return { conversionLogId, outcome: "already_processed" };
  }
  if (privateReplyResult.outcome !== "sent") {
    return { conversionLogId, outcome: privateReplyResult.outcome };
  }

  const publicReplyResult = await sendPublicReply(conversionLogId);
  if (publicReplyResult.outcome === "not_claimed") {
    return { conversionLogId, outcome: "already_processed" };
  }
  if (publicReplyResult.outcome !== "sent") {
    return { conversionLogId, outcome: publicReplyResult.outcome };
  }

  await finalizeConversion(conversionLogId);
  return { conversionLogId, outcome: "success" };
}
