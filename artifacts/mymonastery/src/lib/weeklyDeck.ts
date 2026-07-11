// Weekly-plan CONTENT shapes shared by the composer (SlideDeckEditor), the
// member deck player (WeeklyPlanDeck), and the checklist — the leader-authored
// kinds behind WEEKLY_PLAN_ENABLED. Word caps KEEP IN SYNC with the server
// sanitizer (api-server/src/lib/weeklyPayload.ts): they're chosen so one slide
// stays one screen at the office deck's serif size even at the 1.3× text-size
// pref (~75-word ceiling).

export type WeeklyDeckSlide =
  | { type: "teaching"; heading?: string; body: string }
  | { type: "scripture"; passage: string; citation: string }
  | { type: "question"; question: string }
  | { type: "prompt"; action: string; hint?: string }
  | { type: "song"; title: string; artist?: string; link?: string; note?: string }
  | { type: "reflection"; body: string };

export type WeeklySlideType = WeeklyDeckSlide["type"];

export type WeeklyEpisodeSnapshot = {
  title: string;
  showTitle: string | null;
  audioUrl: string;
  sourceUrl: string;
  imageUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
};

export type WeeklyItemPayload =
  | { slides: WeeklyDeckSlide[] }
  | { episode: WeeklyEpisodeSnapshot }
  | { pdfId: number; filename: string; pageCount: number | null; byteSize: number };

export const DECK_MAX_SLIDES = 7;

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

// Per-type authoring metadata — chip label, the eyebrow the player shows, the
// suggested word count (counter turns amber past it) and the hard cap (blocks
// save past it). Question is CHAR-capped: its form is one held question.
export const SLIDE_TYPES: Array<{
  type: WeeklySlideType;
  chip: string;
  eyebrow: string;
  suggested: number | null; // words
  hardWords: number | null;
}> = [
  { type: "teaching", chip: "Teaching", eyebrow: "Teaching", suggested: 70, hardWords: 90 },
  { type: "scripture", chip: "Scripture", eyebrow: "Scripture", suggested: 65, hardWords: 80 },
  { type: "question", chip: "Question", eyebrow: "A question to carry", suggested: null, hardWords: null },
  { type: "prompt", chip: "Prompt", eyebrow: "Try this", suggested: 35, hardWords: 50 },
  { type: "song", chip: "Song", eyebrow: "A song for the week", suggested: null, hardWords: null },
  { type: "reflection", chip: "Reflection", eyebrow: "Sit with this", suggested: 45, hardWords: 60 },
];

export const slideTypeMeta = (t: WeeklySlideType) => SLIDE_TYPES.find((s) => s.type === t)!;

/** The slide's main authored text (for counters + emptiness checks). */
export function slideMainText(s: WeeklyDeckSlide): string {
  switch (s.type) {
    case "teaching": return s.body;
    case "scripture": return s.passage;
    case "question": return s.question;
    case "prompt": return s.action;
    case "song": return s.title;
    case "reflection": return s.body;
  }
}

export function emptySlide(type: WeeklySlideType): WeeklyDeckSlide {
  switch (type) {
    case "teaching": return { type, body: "" };
    case "scripture": return { type, passage: "", citation: "" };
    case "question": return { type, question: "" };
    case "prompt": return { type, action: "" };
    case "song": return { type, title: "" };
    case "reflection": return { type, body: "" };
  }
}

/** Is the slide complete enough to keep at save time? */
export function slideIsKeepable(s: WeeklyDeckSlide): boolean {
  if (s.type === "scripture") return !!s.passage.trim() && !!s.citation.trim();
  return !!slideMainText(s).trim();
}

/** Over its hard cap? (Question/song are length-capped by their inputs.) */
export function slideOverCap(s: WeeklyDeckSlide): boolean {
  const meta = slideTypeMeta(s.type);
  if (meta.hardWords == null) return false;
  return wordCount(slideMainText(s)) > meta.hardWords;
}

/** "4 slides · about a minute" — the grace-first byline. */
export function deckByline(n: number): string {
  const mins = Math.max(1, Math.ceil(n / 4));
  return `${n} slide${n === 1 ? "" : "s"} · about ${mins === 1 ? "a minute" : `${mins} minutes`}`;
}

/** Sunday of the current local week (YYYY-MM-DD) — the plan's identity. ONE
 *  definition shared by the composer + checklist so they can never disagree
 *  about which Sunday a plan belongs to. */
export function thisWeekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toLocaleDateString("en-CA");
}
