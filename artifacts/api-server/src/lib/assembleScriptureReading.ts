// ─── Daily Scripture Reading ────────────────────────────────────────────────
//
// Owner: "create a slideshow for daily scripture reading that first starts with
// the Psalms, and it lists the Psalm title, and then it goes into the Psalms
// that they'll be displayed in the office … let's just have all three. So do
// Old Testament … as the second slide, then epistle … as the next slide, and
// then gospel … as the next slide."
//
// So: the day's psalms said in full, exactly as the office says them, then the
// three lessons as title cards that open the passage in the reader.
//
// This is the READINGS practice, not an office. It borrows the office's own
// builders rather than restating them — buildLessonSlides for the lessons, the
// same psalm_title / psalm slide shapes and the same bcp_texts source for the
// psalter — so a fix to how a psalm chunks or how a lesson opens reaches this
// deck too. What it deliberately leaves out is everything that makes an office
// an office: no opening sentence, no confession, no canticles, no Gloria, no
// collects. A doxology seals a psalm that has been PRAYED; this is a reading.

import { inArray } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { getOfficeDay } from "./liturgicalCalendar";
import { getLectionaryReadings } from "./lectionary";
import { buildLessonSlides } from "./assembleLesson";
import { parsePsalmRef, sliceVersesByRange, splitPsalmIntoChunks, psalmEyebrow } from "./psalmRange";
import type { Slide, SlideType } from "./assembleMorningPrayer";

function slide(
  id: string,
  type: SlideType,
  emoji: string,
  eyebrow: string,
  content: string,
  overrides: Partial<Slide> = {},
): Slide {
  return {
    id,
    type,
    emoji,
    eyebrow,
    title: null,
    content,
    isCallAndResponse: false,
    callAndResponseLines: null,
    bcpReference: null,
    isScrollable: false,
    scrollHint: null,
    metadata: {},
    ...overrides,
  };
}

export async function assembleScriptureReading(date: Date): Promise<{ slides: Slide[]; dayInfo: unknown }> {
  const liturgicalDay = getOfficeDay(date);

  /**
   * ALL THREE LESSONS COME FROM THE MORNING TABLE.
   *
   * The Daily Office Lectionary appoints the Old Testament and Epistle at
   * Morning Prayer and the Gospel at Evening Prayer, but that is a LAYOUT
   * choice about where each is read — the morning entry carries all three
   * (lesson3 is the day's Gospel, which Evening Prayer then reads as its own).
   * Morning Prayer's Epistle slide already links lesson3 as "Read Gospel" on
   * exactly this reasoning. A reading practice isn't bound by where an office
   * puts each lesson, and the owner asked for all three in one sitting.
   */
  const { psalms, lesson1, lesson2, lesson3 } = getLectionaryReadings(liturgicalDay, "morning");

  const appointedPsalms = psalms
    .map((r) => parsePsalmRef(r))
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Same seeded source the offices read. NOT the PSALTER seed file, which
  // stops at Psalm 30 — a reading deck built on it would simply lose its psalm
  // for most of the psalter and show the "see BCP Psalter" placeholder instead.
  const psalmKeys = appointedPsalms.map((p) => `psalm_${p.number}`);
  const psalmRows = psalmKeys.length > 0
    ? await db.select().from(bcpTextsTable).where(inArray(bcpTextsTable.textKey, psalmKeys))
    : [];
  const psalmTexts: Record<string, { content: string; title: string | null; bcpReference: string | null }> = {};
  for (const row of psalmRows) {
    psalmTexts[row.textKey] = {
      content: row.content,
      title: row.title ?? null,
      bcpReference: row.bcpReference ?? null,
    };
  }

  const slides: Slide[] = [];
  let n = 0;
  const id = () => `scripture-${++n}`;

  // ── The psalms ────────────────────────────────────────────────────────────
  if (appointedPsalms.length > 0) {
    const first = appointedPsalms[0]!;
    const firstData = psalmTexts[`psalm_${first.number}`];
    const combinedEyebrow = appointedPsalms.length === 1
      ? psalmEyebrow(first)
      : `PSALMS ${appointedPsalms.map((p) => (p.range ? `${p.number}:${p.range[0]}-${p.range[1]}` : `${p.number}`)).join(" & ")}`;
    // The TITLE the owner asked to see is the psalm's Latin incipit — "Beatus
    // vir qui non abiit" — which is what the psalter carries as its name and
    // what the office's own title card shows.
    const combinedTitle = appointedPsalms.length === 1
      ? (firstData?.title ?? null)
      : `Psalms ${appointedPsalms.map((p) => `${p.number}`).join(" & ")}`;

    slides.push(
      slide(id(), "psalm_title", "📖", combinedEyebrow, "", {
        title: combinedTitle,
        bcpReference: firstData?.bcpReference ?? null,
        metadata: {
          psalmNumber: first.number,
          psalmRange: first.range,
          psalmRef: appointedPsalms.map((p) => p.raw).join(" & "),
          combined: appointedPsalms.length > 1,
          // The subtitle the office stamps names the office it belongs to;
          // this deck isn't one, so it says what it is.
          psalmSubtitle: "The Psalm Appointed For Today",
        },
      }),
    );

    type Chunk = { content: string; psalmRef: typeof appointedPsalms[number] };
    const allChunks: Chunk[] = [];
    for (const psalmRef of appointedPsalms) {
      const data = psalmTexts[`psalm_${psalmRef.number}`];
      const sliced = data && psalmRef.range ? sliceVersesByRange(data.content, psalmRef.range) : data?.content;
      if (sliced) {
        for (const chunk of splitPsalmIntoChunks(sliced, 4)) allChunks.push({ content: chunk, psalmRef });
      } else {
        // Same honest fallback the offices use rather than a blank slide.
        allChunks.push({ content: `[Psalm ${psalmRef.raw} — see BCP Psalter]`, psalmRef });
      }
    }
    allChunks.forEach((c, i) => {
      const data = psalmTexts[`psalm_${c.psalmRef.number}`];
      slides.push(
        slide(id(), "psalm", "📖", psalmEyebrow(c.psalmRef), c.content, {
          title: data?.title ?? null,
          bcpReference: data?.bcpReference ?? null,
          metadata: {
            psalmNumber: c.psalmRef.number,
            psalmRange: c.psalmRef.range,
            psalmRef: c.psalmRef.raw,
            psalmChunkIndex: i,
            psalmChunkTotal: allChunks.length,
          },
        }),
      );
    });
  }

  // ── The three lessons, in the order he asked for ──────────────────────────
  // buildLessonSlides returns nothing for an empty or dashed reference, so a
  // day the lectionary leaves blank simply has one fewer slide rather than a
  // card pointing at a passage called "----------".
  for (const s of buildLessonSlides(lesson1 ?? "", "first_morning", id)) slides.push(s);
  for (const s of buildLessonSlides(lesson2 ?? "", "second_morning", id)) slides.push(s);
  for (const s of buildLessonSlides(lesson3 ?? "", "gospel_morning", id)) slides.push(s);

  // Owner: a closing slide, rather than the deck simply ending on the
  // Gospel's title card the instant the reader dismisses. Also closes a
  // real bug this exposed — the native reader's own "return" step
  // (nextPastLessonReading in bcp-daily-office.tsx) had nothing to land on
  // past the final lesson, so it clamped back onto that same title slide,
  // which then re-rendered as if the Gospel had been shown a second time.
  // A real next slide fixes both.
  if (slides.length > 0) {
    slides.push(slide(id(), "closing", "🙏🏽", "", "Take a moment to bring what may be on your heart from the readings to prayer."));
  }

  return {
    slides,
    dayInfo: {
      date: date.toISOString().slice(0, 10),
      season: liturgicalDay.season,
      feastName: liturgicalDay.feastName,
    },
  };
}
