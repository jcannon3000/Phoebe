// Content-safety layer for public, unmoderated user text (prayer requests
// today; reusable for any future free-text UGC surface). Two independent
// checks:
//
//   scanForCrisisLanguage — a keyword/pattern pass over new prayer-request
//   text. This is ONE layer, not the whole safety plan: pattern matching
//   catches direct, plainly-worded disclosures and WILL miss oblique or
//   sarcastic ones — that's an expected property of this approach, not a
//   bug to chase. It exists to trigger an immediate, automatic response
//   (crisis resources shown to the poster, an auto-flag into the
//   moderation queue) without waiting on a human to notice — it does NOT
//   block the post. Someone in crisis should never be told their words
//   aren't allowed; they should be met with resources and still be heard.
//   The standing crisis-resources line on the compose screen itself
//   (prayer-request-new.tsx) is the layer that doesn't depend on this
//   scan catching anything at all.
//
//   stripLinks — prayer requests aren't a place for URLs (phishing,
//   spam, unmoderated outbound links in a public garden). Strips any
//   http(s):// or www.-prefixed link from the text server-side — this is
//   enforcement, not just client-side hinting, so a hand-crafted POST
//   can't bypass it.

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
 *  diagnosis — see the module comment above for what this is and isn't. */
export function scanForCrisisLanguage(text: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => new RegExp(`\\b${pattern}\\b`, "i").test(text));
}

const URL_SOURCE = "(?:https?:\\/\\/|www\\.)\\S+";

/** Removes any http(s):// or www.-prefixed link from the text, collapsing
 *  the whitespace left behind. Returns the cleaned text and whether
 *  anything was actually removed, so the caller can tell the poster. */
export function stripLinks(text: string): { text: string; hadLinks: boolean } {
  const re = new RegExp(URL_SOURCE, "gi");
  if (!re.test(text)) return { text, hadLinks: false };
  const cleaned = text
    .replace(new RegExp(URL_SOURCE, "gi"), "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return { text: cleaned, hadLinks: true };
}
