/**
 * Lesson slide builder — turns a single lectionary reference (e.g.
 * "Romans 14:1-12" or "Wisdom 14:27-15:3") into the title-card +
 * chunked-verses slide shape the BCP Daily Office viewer renders.
 *
 * Mirrors the psalm_title + psalm chunked treatment so a lesson reads
 * the same way a psalm does — big reference headline first, then
 * numbered verses 4 at a time. The verse text comes from the bundled
 * World English Bible (WEB, public domain) via scriptureService, so
 * it's legal to show the full passage inline.
 *
 * Falls back to the original reference-only "open your bible" slide
 * (with the Read-online pill) when the local Bible JSON doesn't carry
 * the book — e.g. deuterocanonical readings (Wisdom, Sirach), which
 * aren't in the 66-book WEB data.
 */

import { lookupLessonVerses, type LessonVerse } from "./scriptureService";
import { bibleGatewayUrl } from "./bibleGatewayUrl";
import type { Slide } from "./assembleMorningPrayer";

// Pack whole verses onto a slide up to a CHARACTER BUDGET, then break at the
// verse boundary and continue on the next slide — so a slide never cuts a verse
// mid-sentence and long narrative verses don't overflow the page, while short
// verses still group several per slide (scripture prose reads continuously).
// Tuned to fit a phone page; a single over-budget verse still gets its own slide.
const LESSON_CHUNK_BUDGET_CHARS = 650;
// Reverted per request: lessons show the reference + a "Read in your Bible"
// prompt + an Open link (→ the external NRSV) rather than the inline WEB text.
// Flip to true to bring inline WEB readings back — the chunker + verse slides
// below still work; this is the single switch.
const INLINE_WEB_LESSONS = false;

export type LessonKind =
  | "first_morning"
  | "second_morning"
  | "gospel_morning"
  | "first_evening"
  | "gospel_evening"
  | "devotion_morning"
  | "devotion_evening"
  // The Sunday readings deck (RCL) — This Sunday's OT / Epistle / Gospel.
  | "ot_sunday"
  | "epistle_sunday"
  | "gospel_sunday";

// Subtitle copy for the title slide — mirrors how psalm_title's
// subtitle reads ("The Psalm Appointed For This Morning"). Stamped on
// the server so the title card is unambiguous (the client used to
// derive it from a fragile eyebrow-string check).
const LESSON_SUBTITLE: Record<LessonKind, string> = {
  first_morning: "The First Lesson Appointed For This Morning",
  second_morning: "The Second Lesson Appointed For This Morning",
  gospel_morning: "The Gospel Appointed For This Morning",
  first_evening: "The First Lesson Appointed For This Evening",
  gospel_evening: "The Gospel Appointed For This Evening",
  devotion_morning: "The Lesson Appointed For This Morning",
  devotion_evening: "The Lesson Appointed For This Evening",
  ot_sunday: "The Old Testament Reading Appointed For Sunday",
  epistle_sunday: "The Epistle Appointed For Sunday",
  gospel_sunday: "The Gospel Appointed For Sunday",
};

const LESSON_EYEBROW: Record<LessonKind, string> = {
  first_morning: "THE FIRST LESSON",
  second_morning: "THE SECOND LESSON",
  gospel_morning: "THE GOSPEL",
  first_evening: "THE FIRST LESSON",
  gospel_evening: "THE GOSPEL",
  devotion_morning: "A READING FROM SCRIPTURE",
  devotion_evening: "A READING FROM SCRIPTURE",
  ot_sunday: "THE OLD TESTAMENT",
  epistle_sunday: "THE EPISTLE",
  gospel_sunday: "THE GOSPEL",
};

const LESSON_EMOJI: Record<LessonKind, string> = {
  first_morning: "📜",
  second_morning: "📜",
  gospel_morning: "✝️",
  first_evening: "📜",
  gospel_evening: "✝️",
  devotion_morning: "📜",
  devotion_evening: "📜",
  ot_sunday: "📜",
  epistle_sunday: "📜",
  gospel_sunday: "✝️",
};

const READING_NOTE_BIBLE =
  "Read this passage in your own Bible or preferred translation.";
const LESSON_BODY_PROMPT_FALLBACK =
  "Open your Bible, or read this passage online.";

/**
 * Group consecutive verses into slides up to a CHARACTER BUDGET, breaking only
 * at whole-verse boundaries so a slide never cuts a verse mid-sentence. A lone
 * verse longer than the budget still gets its own slide (never an empty one).
 * Stable across chapter boundaries — a chapter transition mid-passage doesn't
 * reset the position; the renderer surfaces the chapter via the verse marker
 * (e.g. "15:1") when it changes.
 */
function chunkVerses(verses: LessonVerse[], budgetChars: number): LessonVerse[][] {
  if (budgetChars <= 0) return [verses];
  const chunks: LessonVerse[][] = [];
  let cur: LessonVerse[] = [];
  let len = 0;
  for (const v of verses) {
    const vLen = (v.text ?? "").length;
    // Break to a new slide when this verse would push it past the budget — but
    // only if the slide already holds a verse (a lone over-budget verse stays).
    if (cur.length > 0 && len + vLen > budgetChars) {
      chunks.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(v);
    len += vLen;
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

/**
 * Build the slides for a single lesson.
 *
 * `reference` is the raw lectionary string (e.g. "Romans 14:1-12").
 * `kind` controls subtitle + eyebrow copy.
 * `idGen` returns unique slide ids; we pass it in so each lesson's
 * slides slot cleanly into the calling assembler's id sequence.
 *
 * Returns an array of slides ready to push into the office's slide
 * list. Empty array if `reference` is itself empty / dashed-out
 * (callers already check `isLessonPresent` before invoking us, so
 * this is just defensive).
 */
export function buildLessonSlides(
  reference: string,
  kind: LessonKind,
  idGen: () => string,
  /**
   * Merged onto the title slide's metadata as-is.
   *
   * Its one caller today: Morning Prayer's Epistle slide, which carries the
   * SAME day's Gospel reference (gospelReadUrl/gospelReference) — the Daily
   * Office Lectionary appoints OT+Epistle at MP and the Gospel at EP, but
   * that's a LAYOUT choice (see assembleMorningPrayer.ts's own note on the
   * split), not a reason the Epistle slide can't point at it. Owner: "on the
   * Epistle title slide in Morning Prayer, have a button under it that says
   * Read Gospel."
   */
  extraMetadata?: Record<string, unknown>,
): Slide[] {
  const trimmed = reference?.trim() ?? "";
  if (!trimmed || /^-+$/.test(trimmed)) return [];

  const subtitle = LESSON_SUBTITLE[kind];
  const eyebrow = LESSON_EYEBROW[kind];
  const emoji = LESSON_EMOJI[kind];
  const readUrl = bibleGatewayUrl(trimmed);

  // One slide per lesson: a title card whose single "read" pill opens the full
  // passage EXTERNALLY on oremus (which renders the NRSV and handles
  // cross-chapter ranges in a single page). No inline WEB text, no follow-on
  // verse slides — per product direction.
  const titleSlide: Slide = {
    id: idGen(),
    type: "lesson_title",
    emoji,
    eyebrow,
    title: trimmed,
    content: "",
    isCallAndResponse: false,
    callAndResponseLines: null,
    bcpReference: null,
    isScrollable: false,
    scrollHint: null,
    metadata: {
      reference: trimmed,
      readUrl,
      lessonKind: kind,
      lessonSubtitle: subtitle,
      // No inline WEB text anymore — always false, so the client renders the
      // single external "Read in NRSV" (oremus) pill on this title slide.
      inlineWeb: false,
      ...extraMetadata,
    },
  };

  // The single title slide IS the whole lesson — the reader taps its pill to
  // read the passage on oremus. No fallback "open your Bible" slide, no inline
  // verse slides.
  return [titleSlide];
}
