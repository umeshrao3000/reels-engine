/**
 * Normalizes raw Instagram comment text for keyword matching: lowercase,
 * trimmed, internal whitespace collapsed to single spaces. Matching itself
 * (word-boundary keyword lookup) lives in services/trigger-matcher.ts.
 */
export function normalizeCommentText(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().trim().replace(/\s+/g, " ");
}
