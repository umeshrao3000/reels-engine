// Bounded so a single bulk paste can't produce an unbounded keyword array —
// trigger-matcher.ts compiles one regex per keyword per incoming comment,
// so an unbounded list is a real cost, not just a UI nuisance.
export const MAX_KEYWORD_LENGTH = 100;
export const MAX_KEYWORDS_PER_CAMPAIGN = 500;

/**
 * Single place keyword normalization happens for Keyword Management: split
 * on comma or newline, trim, lowercase, drop empties, dedupe, drop
 * anything longer than MAX_KEYWORD_LENGTH — preserving the "stored
 * lowercase" contract services/trigger-matcher.ts already relies on
 * (Milestone 3), and the exact normalization the campaign create/edit
 * routes used before Keyword Management existed.
 */
export function normalizeKeywordList(raw: string): { values: string[]; rejectedTooLong: string[] } {
  const seen = new Set<string>();
  const rejectedTooLong: string[] = [];
  for (const part of raw.split(/[,\n]+/)) {
    const keyword = part.trim().toLowerCase();
    if (!keyword) continue;
    if (keyword.length > MAX_KEYWORD_LENGTH) {
      rejectedTooLong.push(keyword);
      continue;
    }
    seen.add(keyword);
  }
  return { values: [...seen], rejectedTooLong };
}

export function normalizeKeywordValue(raw: string): string {
  return raw.trim().toLowerCase();
}
