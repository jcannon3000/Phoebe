/**
 * Lesson slide builder.
 *
 * Per user direction Phoebe doesn't ship scripture text in the slide
 * rotation — readers tap the "Read on Bible.com" pill to read the
 * passage in their bible app of choice. This helper just emits a
 * single reference card per lesson with the bible.com URL stamped
 * in metadata so the renderer's existing pill picks it up.
 *
 * (Earlier this file emitted a title card + chunked numbered-verse
 * slides à la the psalm treatment, but the user wanted the bible.com
 * button back and the verse text out of the slideshow. The lesson_title
 * / lesson_verses slide types in MorningPrayer/types.ts are kept around
 * so the renderer code paths still type-check, but no slide of those
 * types is currently emitted.)
 */

import { bibleGatewayUrl } from "./bibleGatewayUrl";
import type { Slide } from "./assembleMorningPrayer";

export type LessonKind =
  | "first_morning"
  | "second_morning"
  | "gospel_morning"
  | "first_evening"
  | "gospel_evening"
  | "devotion_morning"
  | "devotion_evening";

const LESSON_EYEBROW: Record<LessonKind, string> = {
  first_morning: "FIRST LESSON",
  second_morning: "SECOND LESSON",
  gospel_morning: "THE GOSPEL",
  first_evening: "FIRST LESSON",
  gospel_evening: "THE GOSPEL",
  devotion_morning: "A READING FROM SCRIPTURE",
  devotion_evening: "A READING FROM SCRIPTURE",
};

const LESSON_EMOJI: Record<LessonKind, string> = {
  first_morning: "📜",
  second_morning: "✉️",
  gospel_morning: "✝️",
  first_evening: "📜",
  gospel_evening: "✝️",
  devotion_morning: "📜",
  devotion_evening: "📜",
};

const LESSON_BODY_PROMPT =
  "Open your Bible, or read this passage online.";

export function buildLessonSlides(
  reference: string,
  kind: LessonKind,
  idGen: () => string,
): Slide[] {
  const trimmed = reference?.trim() ?? "";
  if (!trimmed || /^-+$/.test(trimmed)) return [];

  const eyebrow = LESSON_EYEBROW[kind];
  const emoji = LESSON_EMOJI[kind];
  const readUrl = bibleGatewayUrl(trimmed);

  return [
    {
      id: idGen(),
      type: "lesson",
      emoji,
      eyebrow,
      title: trimmed,
      content: LESSON_BODY_PROMPT,
      isCallAndResponse: false,
      callAndResponseLines: null,
      bcpReference: null,
      isScrollable: false,
      scrollHint: null,
      metadata: {
        reference: trimmed,
        readUrl,
        readingNote: "Read this passage in your own Bible or preferred translation.",
        lessonKind: kind,
      },
    },
  ];
}
