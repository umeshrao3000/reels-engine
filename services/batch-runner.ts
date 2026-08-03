// Phase A (Automation Reliability): shared per-item deadline enforcement
// for every ConversionLog batch stage (matcher, private-reply,
// public-reply, finalize). A deadline checked only once before an entire
// batch starts can't stop the batch itself from running arbitrarily long
// once under way — e.g. up to `limit` sequential Meta calls each allowed
// their own request timeout. Checking before *every* item instead means
// the batch stops starting new work as soon as the deadline passes,
// bounding total overrun to at most one in-flight item's own timeout.

export type BatchOutcome<T> = { results: T[]; skippedByDeadline: number };

/**
 * Runs `process` over `candidates` in order, stopping (without starting
 * `process` on the next item) once `deadline` (an epoch-ms timestamp) has
 * passed. `deadline` is optional — omit it to process every candidate
 * unconditionally (e.g. in tests that don't care about timing).
 */
export async function runBatchWithDeadline<Id, T>(
  candidates: Id[],
  deadline: number | undefined,
  process: (id: Id) => Promise<T>
): Promise<BatchOutcome<T>> {
  const results: T[] = [];
  for (const id of candidates) {
    if (deadline !== undefined && Date.now() >= deadline) break;
    results.push(await process(id));
  }
  return { results, skippedByDeadline: candidates.length - results.length };
}
