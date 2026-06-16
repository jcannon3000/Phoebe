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

// 4 verses per chunk matches the psalm cadence. Lesson verses are
// usually denser than psalm verses, so this lands at "one screen of
// reading" per slide rather than three sentences.
const LESSON_VERSES_PER_CHUNK = 4;

export type LessonKind =
  | "first_morning"
  | "second_morning"
  | "gospel_morning"
  | "first_evening"
  | "gospel_evening"
  | "devotion_morning"
  | "devotion_evening";

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
};

const LESSON_EYEBROW: Record<LessonKind, string> = {
  first_morning: "THE FIRST LESSON",
  second_morning: "THE SECOND LESSON",
  gospel_morning: "THE GOSPEL",
  first_evening: "THE FIRST LESSON",
  gospel_evening: "THE GOSPEL",
  devotion_morning: "A READING FROM SCRIPTURE",
  devotion_evening: "A READING FROM SCRIPTURE",
};

const LESSON_EMOJI: Record<LessonKind, string> = {
  first_morning: "📜",
  second_morning: "📜",
  gospel_morning: "✝️",
  first_evening: "📜",
  gospel_evening: "✝️",
  devotion_morning: "📜",
  devotion_evening: "📜",
};

const READING_NOTE_BIBLE =
  "Read this passage in your own Bible or preferred translation.";
const LESSON_BODY_PROMPT_FALLBACK =
  "Open your Bible, or read this passage online.";

/**
 * Group consecutive verses into N-per-chunk slices. Stable across
 * chapter boundaries — a chapter transition mid-passage doesn't
 * reset the chunk position; the renderer surfaces the chapter via
 * the verse marker (e.g. "15:1") when it changes.
 */
function chunkVerses(verses: LessonVerse[], n: number): LessonVerse[][] {
  if (n <= 0) return [verses];
  const chunks: LessonVerse[][] = [];
  for (let i = 0; i < verses.length; i += n) {
    chunks.push(verses.slice(i, i + n));
  }
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
): Slide[] {
  const trimmed = reference?.trim() ?? "";
  if (!trimmed || /^-+$/.test(trimmed)) return [];

  const subtitle = LESSON_SUBTITLE[kind];
  const eyebrow = LESSON_EYEBROW[kind];
  const emoji = LESSON_EMOJI[kind];
  const readUrl = bibleGatewayUrl(trimmed);

  // Try to pull the actual verse text from the bundled WEB data. Falls
  // back to a single reference-only slide when the book isn't locally
  // available (deuterocanon).
  const verses = lookupLessonVerses(trimmed);

  // Title slide either way — the same big-headline experience as the
  // psalm_title slide, so even the fallback path gets a title card
  // before the body.
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
    },
  };

  if (!verses || verses.length === 0) {
    // Fallback — book not in local data (e.g. Wisdom, Sirach). Emit
    // the title card + a single reference-only "open your bible"
    // slide so the reader still gets a deliberate breath into the
    // lesson and a tap-out to read it online if they want.
    return [
      titleSlide,
      {
        id: idGen(),
        type: "lesson",
        emoji,
        eyebrow,
        title: trimmed,
        content: LESSON_BODY_PROMPT_FALLBACK,
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: null,
        isScrollable: false,
        scrollHint: null,
        metadata: {
          reference: trimmed,
          readUrl,
          readingNote: READING_NOTE_BIBLE,
          lessonKind: kind,
        },
      },
    ];
  }

  // Chunk verses + emit one slide per chunk. The verses array is
  // stamped onto each slide's metadata so the renderer can lay them
  // out as numbered rows (verse number left, text right) without
  // re-parsing a string blob.
  const chunks = chunkVerses(verses, LESSON_VERSES_PER_CHUNK);
  const slides: Slide[] = [titleSlide];
  chunks.forEach((chunk, i) => {
    slides.push({
      id: idGen(),
      type: "lesson_verses",
      emoji,
      eyebrow,
      title: trimmed,
      // Plain-text rendering for any client that doesn't read the
      // verses metadata — a fallback only, the renderer prefers the
      // structured array.
      content: chunk.map((v) => `${v.verse} ${v.text}`).join("\n"),
      isCallAndResponse: false,
      callAndResponseLines: null,
      bcpReference: null,
      isScrollable: false,
      scrollHint: null,
      metadata: {
        reference: trimmed,
        readUrl,
        lessonKind: kind,
        lessonChunkIndex: i,
        lessonChunkTotal: chunks.length,
        // The structured verses are what the renderer renders. Each
        // entry: { chapter, verse, text }. Chapter is included so a
        // multi-chapter lesson (e.g. "Wisdom 14:27-15:3") can display
        // a "15:1" marker at the chapter transition rather than
        // re-numbering from 1 silently.
        verses: chunk,
      },
    });
  });

  return slides;
}
