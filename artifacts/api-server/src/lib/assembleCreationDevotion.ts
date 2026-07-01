/**
 * Season of Creation — a creation-focused Daily Devotion.
 *
 * A short office built on the two-week creation Psalter (seasonOfCreation.ts),
 * wrapped in the creation-themed texts the Season of Creation guide supplies
 * (Opening Sentence, Confession, Invitatory + Creation Gloria, Antiphon,
 * Suffrages, Concluding Sentence). Psalm bodies come from the public-domain
 * 1979 BCP Psalter seeded in bcp_texts; everything else is public-domain or the
 * guide's gift-licensed compositions (attributed on the slide metadata).
 *
 * Shape mirrors assembleDevotion.ts so the client's OfficeViewer renders it
 * with the same Slide schema.
 */

import { inArray } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { sliceVersesByRange, splitPsalmIntoChunks } from "./psalmRange";
import { getSeason } from "./liturgicalCalendar";
import { buildLessonSlides } from "./assembleLesson";
import type { Slide, CallAndResponseLine, OfficeDayInfo } from "./assembleMorningPrayer";
import {
  creationCyclePosition,
  creationPsalmRefs,
  CREATION_ATTRIBUTION,
  CREATION_OPENING_SENTENCES,
  CREATION_CONFESSION_INVITE,
  CREATION_CONFESSION,
  CREATION_INVITATORY,
  CREATION_GLORIA,
  CREATION_ANTIPHONS,
  CREATION_SUFFRAGES,
  GLORIA_PATRI,
  CREATION_LORDS_PRAYER,
  type CreationSide,
} from "./seasonOfCreation";
import {
  creationCollectFor,
  creationReadingFor,
  creationBlessingFor,
  creationQuoteFor,
  creationOfficeSeq,
} from "./creationLibrary";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function slide(
  id: string,
  type: Slide["type"],
  emoji: string,
  eyebrow: string,
  content: string,
  overrides: Partial<Slide> = {},
): Slide {
  return {
    id, type, emoji, eyebrow,
    title: null, content,
    isCallAndResponse: false, callAndResponseLines: null,
    bcpReference: null, isScrollable: false, scrollHint: null,
    metadata: {}, ...overrides,
  };
}

// Parse a creation psalm ref ("148" | "19:1-6" | "90:1-2, 16-17" | "…45c") into
// its psalm number + inclusive verse ranges (null = whole psalm). Sub-verse
// letters ("45c") collapse to the whole verse.
function parseRef(ref: string): { number: number; ranges: Array<[number, number]> | null; raw: string } {
  const [numPart, versePart] = ref.split(":");
  const number = parseInt(numPart.trim(), 10);
  if (!versePart) return { number, ranges: null, raw: ref };
  const ranges: Array<[number, number]> = [];
  for (const seg of versePart.split(",")) {
    const s = seg.trim().replace(/[a-z]+/gi, "");
    const m = s.match(/^(\d+)-(\d+)$/);
    if (m) ranges.push([parseInt(m[1], 10), parseInt(m[2], 10)]);
    else if (/^\d+$/.test(s)) ranges.push([parseInt(s, 10), parseInt(s, 10)]);
  }
  return { number, ranges: ranges.length ? ranges : null, raw: ref };
}

function eyebrowFor(ref: string): string {
  return `PSALM ${ref}`.toUpperCase();
}

export async function assembleCreationDevotion(
  date: Date,
  _userId: number,
  side: CreationSide,
): Promise<{ slides: Slide[]; officeDay: OfficeDayInfo }> {
  const { week, weekday } = creationCyclePosition(date);
  const refs = creationPsalmRefs(date, side).map(parseRef);

  // One query for every psalm body this office needs.
  const psalmKeys = Array.from(new Set(refs.map((r) => `psalm_${r.number}`)));
  const rows = psalmKeys.length
    ? await db.select().from(bcpTextsTable).where(inArray(bcpTextsTable.textKey, psalmKeys))
    : [];
  const rowByKey: Record<string, (typeof rows)[number]> = {};
  for (const row of rows) rowByKey[row.textKey] = row;

  const slides: Slide[] = [];
  let idx = 0;
  const id = () => `creation_${side}_${idx++}`;

  const isMorning = side === "morning";
  // Deterministic per-office variety for the rotating (Scripture) texts.
  const pick = (len: number) => (weekday * 2 + (isMorning ? 0 : 1)) % len;
  const seq = creationOfficeSeq(date, side);

  // 0. Intro — names the practice + its source.
  slides.push(
    slide(id(), "office_intro", "🌱", "A creation-focused devotion",
      "Prayer with creation — the psalms and prayers drawn from the Episcopal Season of Creation guide, opening with the Co-Breathe breath.",
      { title: isMorning ? "Creation Prayer · Morning" : "Creation Prayer · Evening" }),
  );

  // 0b. The Collect — the devotion opens with the day's collect from the creation
  //     care lectionary (rotates through the fortnight; paired to the psalms).
  const collect = creationCollectFor(date);
  slides.push(
    slide(id(), "collect", "🌿", "THE COLLECT", collect.text, {
      title: collect.title,
      bcpReference: collect.attribution ?? CREATION_ATTRIBUTION,
      isScrollable: true,
      metadata: { source: "season_of_creation_guide", collectTitle: collect.title },
    }),
  );

  // 1. Opening Sentence (Scripture).
  const os = CREATION_OPENING_SENTENCES[pick(CREATION_OPENING_SENTENCES.length)];
  slides.push(
    slide(id(), "opening_sentence", isMorning ? "🌅" : "🌆", "OPENING SENTENCE", os.text, { bcpReference: os.ref }),
  );

  // 2. Confession (guide composition).
  slides.push(
    slide(id(), "confession", "🍂", "CONFESSION OF SIN", CREATION_CONFESSION, {
      isCallAndResponse: false,
      isScrollable: true,
      scrollHint: CREATION_CONFESSION_INVITE,
      bcpReference: CREATION_ATTRIBUTION,
      metadata: { source: "season_of_creation_guide" },
    }),
  );

  // 3. Invitatory — versicle (adapts Ps 118:24) + the Creation Gloria.
  const invLines: CallAndResponseLine[] = [
    { speaker: "officiant", text: CREATION_INVITATORY.officiant },
    { speaker: "people", text: CREATION_INVITATORY.people },
    { speaker: "both", text: CREATION_GLORIA },
  ];
  slides.push(
    slide(id(), "invitatory", "🔔", "INVITATORY", "", {
      isCallAndResponse: true, callAndResponseLines: invLines,
      bcpReference: CREATION_ATTRIBUTION, metadata: { source: "season_of_creation_guide" },
    }),
  );

  // 4. Antiphon for Creation (guide composition).
  slides.push(
    slide(id(), "antiphon", "🌿", "ANTIPHON", CREATION_ANTIPHONS[pick(CREATION_ANTIPHONS.length)], {
      bcpReference: CREATION_ATTRIBUTION, metadata: { source: "season_of_creation_guide" },
    }),
  );

  // 5. The Psalms — the appointed creation Psalter for this office.
  const combinedTitle = refs.length === 1
    ? (rowByKey[`psalm_${refs[0].number}`]?.title ?? `Psalm ${refs[0].number}`)
    : `Psalms ${refs.map((r) => r.number).join(" & ")}`;
  const combinedEyebrow = refs.length === 1 ? eyebrowFor(refs[0].raw) : `PSALMS ${refs.map((r) => r.raw).join(" & ")}`.toUpperCase();
  slides.push(
    slide(id(), "psalm_title", "📖", combinedEyebrow, "", {
      title: combinedTitle,
      bcpReference: rowByKey[`psalm_${refs[0].number}`]?.bcpReference ?? null,
      metadata: { psalmRef: refs.map((r) => r.raw).join(" & "), combined: refs.length > 1 },
    }),
  );

  for (const ref of refs) {
    const row = rowByKey[`psalm_${ref.number}`] ?? null;
    let content: string | null = null;
    if (row) {
      content = ref.ranges
        ? ref.ranges.map((r) => sliceVersesByRange(row.content, r)).filter(Boolean).join("\n")
        : row.content;
    }
    const eyebrow = eyebrowFor(ref.raw);
    if (content && content.trim().length > 0) {
      for (const chunk of splitPsalmIntoChunks(content, 4)) {
        slides.push(
          slide(id(), "psalm", "📖", eyebrow, chunk, {
            title: row?.title ?? null,
            bcpReference: row?.bcpReference ?? null,
            metadata: { psalmNumber: ref.number, psalmRef: ref.raw },
          }),
        );
      }
    } else {
      slides.push(
        slide(id(), "psalm", "📖", eyebrow, `[Psalm ${ref.raw} — see the BCP Psalter]`, {
          metadata: { psalmNumber: ref.number, psalmRef: ref.raw, missing: true },
        }),
      );
    }
  }

  // Gloria Patri seals the psalmody.
  slides.push(
    slide(id(), "psalm_gloria", "📖", combinedEyebrow, GLORIA_PATRI, { title: combinedTitle }),
  );

  // 5b. The Reading — in place of the Gospel/NT reading, a creation Scripture
  //     from the guide's Readings for Creation (rotates through the fortnight).
  const reading = creationReadingFor(seq);
  for (const s of buildLessonSlides(reading.ref, isMorning ? "devotion_morning" : "devotion_evening", id)) {
    slides.push(s);
  }

  // 6. Suffrages with Creation (guide composition).
  const suffLines: CallAndResponseLine[] = [];
  for (const s of CREATION_SUFFRAGES) {
    suffLines.push({ speaker: "officiant", text: s.v });
    suffLines.push({ speaker: "people", text: s.r });
  }
  slides.push(
    slide(id(), "suffrages", "🙏🏽", "SUFFRAGES", "", {
      isCallAndResponse: true, callAndResponseLines: suffLines,
      bcpReference: CREATION_ATTRIBUTION, metadata: { source: "season_of_creation_guide" },
    }),
  );

  // 7. The Lord's Prayer.
  slides.push(
    slide(id(), "lords_prayer", "🙏🏽", "THE LORD'S PRAYER", CREATION_LORDS_PRAYER, { bcpReference: "BCP p. 97" }),
  );

  // 8. Words on Creation — a rotating quote from the tradition (the guide offers
  //    these as short readings).
  const quote = creationQuoteFor(seq);
  slides.push(
    slide(id(), "collect", "🍃", "WORDS ON CREATION", quote.text, {
      bcpReference: quote.source ? `${quote.author} · ${quote.source}` : quote.author,
      isScrollable: true,
      metadata: { source: "season_of_creation_guide", quoteAuthor: quote.author },
    }),
  );

  // 9. Closing Prayer & Blessing — rotates through the guide's closing
  //    blessings (pp. 59–60).
  const blessing = creationBlessingFor(seq);
  slides.push(
    slide(id(), "closing", "🍃", "A BLESSING", blessing.text, {
      bcpReference: blessing.attribution ?? CREATION_ATTRIBUTION,
      isScrollable: true,
      metadata: { source: "season_of_creation_guide" },
    }),
  );

  const officeDay: OfficeDayInfo = {
    season: getSeason(date),
    liturgicalYear: date.getFullYear(),
    sundayLabel: "",
    weekdayLabel: `${WEEKDAYS[weekday]} · Week ${week}`,
    properNumber: null,
    feastName: null,
    isMajorFeast: false,
    useAlleluia: false,
    totalSlides: slides.length,
  };

  return { slides, officeDay };
}
