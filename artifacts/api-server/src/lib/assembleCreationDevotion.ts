/**
 * Creation Prayer — a creation-focused Daily Devotion.
 *
 * Order (per the Season of Creation guide's Daily Office, pp. 65–76):
 *   Morning: Opening Sentence · Invitatory (versicle + Creation Gloria) ·
 *     Antiphon · the appointed Psalms · Antiphon · Reading · Words on Creation ·
 *     Canticle (rotating: the creation canticles + BCP Canticle 12) · a Litany ·
 *     Suffrages · the Lord's Prayer · Intercession · the Collect · a Blessing.
 *   Evening: as Morning, but an Affirmation of Faith (rotating: the creation
 *     affirmations + the Nicene Creed) in place of the Canticle.
 *
 * All text is public domain (BCP / Scripture) or the guide's gift-licensed
 * compositions (attributed). Psalm bodies come from bcp_texts. Co-Breathe opens
 * the whole Creation Prayer (see pages/creation-devotion.tsx).
 */

import { inArray } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { sliceVersesByRange, splitPsalmIntoChunks } from "./psalmRange";
import { getSeason } from "./liturgicalCalendar";
import { buildLessonSlides } from "./assembleLesson";
import type { Slide, CallAndResponseLine, OfficeDayInfo } from "./assembleMorningPrayer";
import {
  creationCyclePosition,
  creationPsalmRefsFor,
  creationDayIndex,
  CREATION_ATTRIBUTION,
  CREATION_OPENING_SENTENCES,
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
  creationCanticleFor,
  creationAffirmationFor,
  creationLitanyFor,
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

// Parse a creation psalm ref ("148" | "19:1-6" | "90:1-2, 16-17" | "…45c").
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

const eyebrowFor = (ref: string) => `PSALM ${ref}`.toUpperCase();

export async function assembleCreationDevotion(
  date: Date,
  _userId: number,
  side: CreationSide,
  // `single` = the user prays Creation Prayer only ONCE a day → the four-week
  // combined Psalter (every morning + evening selection, one per day) so nothing
  // is missed. Two-a-day pray-ers (both sides) keep the two-week side-split.
  single: boolean = false,
): Promise<{ slides: Slide[]; officeDay: OfficeDayInfo }> {
  const { week, weekday } = creationCyclePosition(date);
  const refs = creationPsalmRefsFor(date, side, single).map(parseRef);
  const isMorning = side === "morning";
  // Rotating index for reading / canticle / affirmation / litany / quote / blessing.
  const seq = single ? creationDayIndex(date) : creationOfficeSeq(date, side);
  // A steadier index for the opening sentence + antiphon (per weekday + side).
  const pick = (len: number) => (weekday * 2 + (isMorning ? 0 : 1)) % len;

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
  const src = { source: "season_of_creation_guide" };

  // 1. Intro.
  slides.push(
    slide(id(), "office_intro", "🌱", "A creation-focused devotion",
      "Prayer with creation — the psalms and prayers of the Episcopal Season of Creation guide.",
      { title: isMorning ? "Creation Prayer · Morning" : "Creation Prayer · Evening" }),
  );

  // 2. Opening Sentence (Scripture).
  const os = CREATION_OPENING_SENTENCES[pick(CREATION_OPENING_SENTENCES.length)];
  slides.push(slide(id(), "opening_sentence", isMorning ? "🌅" : "🌆", "OPENING SENTENCE", os.text, { bcpReference: os.ref }));

  // 3. Invitatory — versicle + the Creation Gloria.
  slides.push(
    slide(id(), "invitatory", "🔔", "INVITATORY", "", {
      isCallAndResponse: true,
      callAndResponseLines: [
        { speaker: "officiant", text: CREATION_INVITATORY.officiant },
        { speaker: "people", text: CREATION_INVITATORY.people },
        { speaker: "both", text: CREATION_GLORIA },
      ],
      bcpReference: CREATION_ATTRIBUTION, metadata: src,
    }),
  );

  // 4. Antiphon — before the psalmody.
  const antiphon = CREATION_ANTIPHONS[pick(CREATION_ANTIPHONS.length)];
  slides.push(slide(id(), "antiphon", "🌿", "ANTIPHON", antiphon, { bcpReference: CREATION_ATTRIBUTION, metadata: src }));

  // 5. The Psalms.
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
    const content = row
      ? (ref.ranges ? ref.ranges.map((r) => sliceVersesByRange(row.content, r)).filter(Boolean).join("\n") : row.content)
      : null;
    if (content && content.trim().length > 0) {
      for (const chunk of splitPsalmIntoChunks(content, 4)) {
        slides.push(slide(id(), "psalm", "📖", eyebrowFor(ref.raw), chunk, {
          title: row?.title ?? null, bcpReference: row?.bcpReference ?? null,
          metadata: { psalmNumber: ref.number, psalmRef: ref.raw },
        }));
      }
    } else {
      slides.push(slide(id(), "psalm", "📖", eyebrowFor(ref.raw), `[Psalm ${ref.raw} — see the BCP Psalter]`, { metadata: { psalmNumber: ref.number, psalmRef: ref.raw, missing: true } }));
    }
  }
  slides.push(slide(id(), "psalm_gloria", "📖", combinedEyebrow, GLORIA_PATRI, { title: combinedTitle }));

  // 6. Antiphon — repeated after the psalmody.
  slides.push(slide(id(), "antiphon", "🌿", "ANTIPHON", antiphon, { bcpReference: CREATION_ATTRIBUTION, metadata: src }));

  // 7. The Reading — a creation Scripture (in place of the Gospel/NT reading).
  const reading = creationReadingFor(seq);
  for (const s of buildLessonSlides(reading.ref, isMorning ? "devotion_morning" : "devotion_evening", id)) slides.push(s);

  // 8. Words on Creation — a rotating quote (the guide offers these as short readings).
  const quote = creationQuoteFor(seq);
  slides.push(
    slide(id(), "collect", "🍃", "WORDS ON CREATION", quote.text, {
      bcpReference: quote.source ? `${quote.author} · ${quote.source}` : quote.author,
      isScrollable: true, metadata: { ...src, quoteAuthor: quote.author },
    }),
  );

  // 9. Canticle (Morning) / Affirmation of Faith (Evening) — both rotate.
  if (isMorning) {
    const canticle = creationCanticleFor(seq);
    slides.push(
      slide(id(), "canticle", "🎶", "CANTICLE", canticle.text, {
        title: canticle.title, bcpReference: canticle.attribution ?? CREATION_ATTRIBUTION,
        isScrollable: true, metadata: src,
      }),
    );
  } else {
    const aff = creationAffirmationFor(seq);
    slides.push(
      slide(id(), "creed", "✝️", "AFFIRMATION OF FAITH", aff.text, {
        title: aff.title, bcpReference: aff.attribution ?? CREATION_ATTRIBUTION,
        isScrollable: true, metadata: src,
      }),
    );
  }

  // 10. A Litany — rotating; concludes (with the Collect below) per the guide's rubric.
  const litany = creationLitanyFor(seq);
  const litanyLines: CallAndResponseLine[] = [];
  if (litany.intro) litanyLines.push({ speaker: "officiant", text: litany.intro });
  for (const l of litany.lines) {
    litanyLines.push({ speaker: "officiant", text: l.v });
    litanyLines.push({ speaker: "people", text: l.r });
  }
  slides.push(
    slide(id(), "suffrages", "🙏🏽", "A LITANY", "", {
      title: litany.title, isCallAndResponse: true, callAndResponseLines: litanyLines,
      isScrollable: true, bcpReference: CREATION_ATTRIBUTION, metadata: src,
    }),
  );

  // 11. The Lord's Prayer — first in "The Prayers" (BCP/guide order).
  slides.push(slide(id(), "lords_prayer", "🙏🏽", "THE LORD'S PRAYER", CREATION_LORDS_PRAYER, { bcpReference: "BCP p. 97" }));

  // 12. Suffrages with Creation — after the Lord's Prayer.
  const suffLines: CallAndResponseLine[] = [];
  for (const s of CREATION_SUFFRAGES) { suffLines.push({ speaker: "officiant", text: s.v }); suffLines.push({ speaker: "people", text: s.r }); }
  slides.push(slide(id(), "suffrages", "🙏🏽", "SUFFRAGES", "", { isCallAndResponse: true, callAndResponseLines: suffLines, bcpReference: CREATION_ATTRIBUTION, metadata: src }));

  // 13. Intercession — the Co-Breathe breath IS the intercession (the client
  //     opens it inline on this slide, on metadata.cobreathe): we breathe our
  //     prayers for creation.
  slides.push(
    slide(id(), "collect", "🌍", "INTERCESSION",
      "We breathe our prayers for creation — for the earth and all its creatures, for those on the front lines of the climate crisis, and for the will to act.",
      { metadata: { ...src, cobreathe: true } }),
  );

  // 14. The Collect — the day's collect from the creation care lectionary.
  const collect = creationCollectFor(date);
  slides.push(slide(id(), "collect", "🌿", "THE COLLECT", collect.text, { title: collect.title, bcpReference: collect.attribution ?? CREATION_ATTRIBUTION, isScrollable: true, metadata: { ...src, collectTitle: collect.title } }));

  // 15. A Blessing — rotating close.
  const blessing = creationBlessingFor(seq);
  slides.push(slide(id(), "closing", "🍃", "A BLESSING", blessing.text, { bcpReference: blessing.attribution ?? CREATION_ATTRIBUTION, isScrollable: true, metadata: src }));

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
