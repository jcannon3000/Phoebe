// Client-side mirror of api-server/src/lib/contentSafety.ts's
// scanForCrisisLanguage — used ONLY to decide whether to show the 988
// warning live as someone types (owner: "I don't want the 988 call line
// below the field always, just that if a scan detects concerning language
// it comes up with a warning"). The server-side scan in contentSafety.ts
// remains the authoritative check (auto-flag into moderation, the
// post-create notice) — this copy exists purely for instant UI feedback
// and must be kept in sync with the server's pattern list by hand.
const CRISIS_PATTERNS: readonly string[] = [
  "kill(ing)?\\s+myself",
  "want(ed)?\\s+to\\s+die",
  "wish(ed)?\\s+I\\s+(was|were)\\s+dead",
  "end(ing)?\\s+(it all|my life)",
  "suicid\\w*",
  "self[\\s-]?harm\\w*",
  "hurt(ing)?\\s+myself",
  "cut(ting)?\\s+myself",
  "no reason to live",
  "can'?t go on",
  "better off (dead|without me)",
  "don'?t want to (be here|live) (any\\s?more)",
  "want(ed)?\\s+to\\s+disappear",
  "not\\s+safe\\s+(with|around)\\s+myself",
];

/** True if the text matches any crisis-language pattern. A hit, not a
 *  diagnosis — same caveat as the server-side scan this mirrors. */
export function scanForCrisisLanguage(text: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => new RegExp(`\\b${pattern}\\b`, "i").test(text));
}
