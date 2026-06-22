/**
 * Compline Assembler — BCP 1979, pp. 127-135.
 *
 * Compline is the church's prayer at the close of day — the final hour
 * of the monastic round, short and contemplative. Phoebe surfaces it as
 * the third Daily Office option alongside Morning Prayer and Evening
 * Prayer; the Daily Devotions cover the abbreviated forms.
 *
 * Shape (one continuous slide deck):
 *   intro → opening dialogue
 *         → confession + absolution (opt-out via bcpShowConfession,
 *           same pref the full Office uses)
 *         → versicle "O God, make speed…" + Gloria
 *         → appointed Psalm (day-of-week rotation among the four BCP
 *           options: 4, 31:1-5, 91, 134) with title + verses + Gloria
 *         → short lesson (day-of-week rotation among the four BCP
 *           short readings: Jer 14:9 / Matt 11:28-30 / Heb 13:20-21 /
 *           1 Pet 5:8-9)
 *         → "Into your hands, O Lord, I commend my spirit" versicle
 *         → Lord's Prayer (contemporary form)
 *         → Collect — "Visit this place, O Lord…" (the BCP's most-prayed
 *           Compline collect; the three alternates are left for a
 *           future picker)
 *         → seasonal antiphon ("Guide us waking…" / Easter alleluia)
 *         → Nunc Dimittis (Song of Simeon) — Compline's only canticle
 *         → antiphon repeated (the BCP shape — antiphon brackets the
 *           canticle on either side)
 *         → "Let us bless the Lord" / "Thanks be to God"
 *         → final blessing
 *
 * Texts: All Compline content is embedded as constants below. The four
 * appointed psalms come from the existing bcp_texts seed (psalm_4,
 * psalm_31, psalm_91, psalm_134 are all present). The lessons are
 * 1–3 verses each — short enough to render as a single slide with the
 * text inline, no lectionary lookup / no scripture chunking needed.
 *
 * No per-day cache: assembly is one psalm SELECT plus a handful of
 * string operations. Cheaper than the cache machinery would be.
 */

import { eq } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { getOfficeDay } from "./liturgicalCalendar";
import {
  parsePsalmRef,
  splitPsalmIntoChunks,
  sliceVersesByRange,
  psalmEyebrow,
} from "./psalmRange";
import { applyConfessionPref } from "./assembleMorningPrayer";
import type { Slide, CallAndResponseLine, OfficeDayInfo } from "./assembleMorningPrayer";
import { TITLES, EYEBROWS, PRAYERS, pick, type Locale } from "./officeI18n";

// ── slide helper (same shape used by the other assemblers) ──────────────────

function slide(
  id: string,
  type: Slide["type"],
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

// ── Embedded BCP texts ──────────────────────────────────────────────────────

// Compline's confession is shorter than MP/EP's (BCP p. 127, "Almighty
// God, our heavenly Father" rather than "Most merciful God"). Embedded
// here so this file is self-contained and a future copy edit doesn't
// have to thread through the bcp_texts seed.
const COMPLINE_CONFESSION =
  "Almighty God, our heavenly Father:\nWe have sinned against you,\nthrough our own fault,\nin thought, and word, and deed,\nand in what we have left undone.\nFor the sake of your Son our Lord Jesus Christ,\nforgive us all our offenses;\nand grant that we may serve you in newness of life,\nto the glory of your Name. Amen.";

// Lay form of the absolution — same convention as MP/EP. The BCP
// rubric on p. 128 permits a lay person to substitute "us" / "our" for
// "you" / "your" so the absolution reads as a prayer FOR forgiveness
// rather than a priestly declaration of it.
const COMPLINE_ABSOLUTION =
  "May the Almighty God grant us forgiveness of all our sins, and the grace and comfort of the Holy Spirit. Amen.";

// Contemporary form — matches the lords_prayer_contemporary text the
// other assemblers render. Embedded inline so this file doesn't drag
// in a new bcp_texts dependency.
const LORDS_PRAYER_CONTEMPORARY =
  "Our Father in heaven,\nhallowed be your Name,\nyour kingdom come,\nyour will be done,\non earth as in heaven.\nGive us today our daily bread.\nForgive us our sins,\nas we forgive those who sin against us.\nSave us from the time of trial,\nand deliver us from evil.\nFor the kingdom, the power, and the glory are yours,\nnow and for ever. Amen.";

// "Visit this place, O Lord…" — the BCP's most-prayed Compline collect.
// The three alternates (Be our light / Look down / Be present) are
// equally appointed; a future picker can let the user choose. For now
// we render the one almost everyone prays.
const COMPLINE_COLLECT_VISIT =
  "Visit this place, O Lord, and drive far from it all snares of the enemy; let your holy angels dwell with us to preserve us in peace; and let your blessing be upon us always; through Jesus Christ our Lord. Amen.";

// Antiphon repeated either side of the Nunc Dimittis (BCP p. 134).
// During Easter season the antiphon swaps to the alleluia variant —
// `liturgicalDay.useAlleluia` from getOfficeDay() carries the same
// signal the other offices use.
const COMPLINE_ANTIPHON_STANDARD =
  "Guide us waking, O Lord, and guard us sleeping; that awake we may watch with Christ, and asleep we may rest in peace.";
const COMPLINE_ANTIPHON_EASTER =
  "Alleluia. Alleluia. Alleluia.";

// Nunc Dimittis (Canticle 17 / Luke 2:29-32) — Compline's only
// canticle. Contemporary form, BCP p. 135.
const NUNC_DIMITTIS =
  "Lord, you now have set your servant free *\n  to go in peace as you have promised;\nFor these eyes of mine have seen the Savior, *\n  whom you have prepared for all the world to see:\nA Light to enlighten the nations, *\n  and the glory of your people Israel.\n\nGlory to the Father, and to the Son, and to the Holy Spirit: *\n  as it was in the beginning, is now, and will be for ever. Amen.";

const FINAL_BLESSING =
  "The almighty and merciful Lord,\nFather, Son, and Holy Spirit,\nbless us and keep us. Amen.";

// ── Day-of-week rotation (psalm + lesson) ───────────────────────────────────
//
// BCP rubric (p. 131): "One or more of the following Psalms is sung
// or said." (p. 132): "One of the following, or some other suitable
// passage of Scripture." We rotate among the four BCP-appointed
// psalms and the four BCP-appointed lessons so a weekly Compline
// practice doesn't feel repetitive — each weekday gets a different
// pairing, and the cycle resets each Sunday.

interface ComplineLesson {
  // Reference for the title slide eyebrow + the title-card body.
  ref: string;
  // The full short reading, embedded since each is 1–3 verses and we
  // don't need scripture chunking. NRSV text.
  text: string;
}

interface ComplineDay {
  // Raw psalm reference — feeds parsePsalmRef which understands
  // "31:1-5" verse-range slicing.
  psalmRef: string;
  lesson: ComplineLesson;
}

const LESSON_JEREMIAH: ComplineLesson = {
  ref: "Jeremiah 14:9",
  text: "Yet you, O Lord, are in the midst of us, and we are called by your Name; do not forsake us, O Lord our God.",
};
const LESSON_MATTHEW: ComplineLesson = {
  ref: "Matthew 11:28-30",
  text: "Come to me, all you that are weary and are carrying heavy burdens, and I will give you rest. Take my yoke upon you, and learn from me; for I am gentle and humble in heart, and you will find rest for your souls. For my yoke is easy, and my burden is light.",
};
const LESSON_HEBREWS: ComplineLesson = {
  ref: "Hebrews 13:20-21",
  text: "May the God of peace, who brought again from the dead our Lord Jesus, the great shepherd of the sheep, by the blood of the eternal covenant, make you perfect in every good work to do his will, working in you that which is well-pleasing in his sight; through Jesus Christ, to whom be glory for ever and ever. Amen.",
};
const LESSON_1_PETER: ComplineLesson = {
  ref: "1 Peter 5:8-9",
  text: "Be sober, be watchful. Your adversary the devil prowls around, looking for someone to devour. Resist him, steadfast in your faith.",
};

// 0 = Sunday … 6 = Saturday. Pairings chosen so the Friday pair
// (Psalm 31:1-5 + 1 Pet 5:8-9 — "into your hands" + "be sober, be
// watchful") falls on the day Compline's heart-text fits the
// liturgical mood, and Sunday gets the resurrection blessing of
// Heb 13:20-21.
const COMPLINE_BY_DOW: Record<number, ComplineDay> = {
  0: { psalmRef: "91", lesson: LESSON_HEBREWS },
  1: { psalmRef: "4", lesson: LESSON_1_PETER },
  2: { psalmRef: "134", lesson: LESSON_JEREMIAH },
  3: { psalmRef: "91", lesson: LESSON_MATTHEW },
  4: { psalmRef: "4", lesson: LESSON_HEBREWS },
  5: { psalmRef: "31:1-5", lesson: LESSON_1_PETER },
  6: { psalmRef: "134", lesson: LESSON_MATTHEW },
};

// ── Main assembly ───────────────────────────────────────────────────────────

export async function assembleCompline(
  date: Date,
  userId: number,
  locale: Locale = "en",
): Promise<{
  slides: Slide[];
  officeDay: OfficeDayInfo;
}> {
  const liturgicalDay = getOfficeDay(date);
  const dow = date.getDay();
  const today = COMPLINE_BY_DOW[dow]!;
  const psalmRef = parsePsalmRef(today.psalmRef) ?? {
    number: 4,
    range: null,
    raw: "4",
  };

  // ── Locale-resolved strings ────────────────────────────────────────
  // Pull each user-visible string through pick(locale, …) so the same
  // assembler emits English or Spanish slides depending on the
  // caller's request. Spanish text comes from officeI18n.ts (sourced
  // from El Libro de Oración Común). Psalm body still loads from
  // bcp_texts in whatever the row's language is — those rows are
  // currently English-only; a future seed pass will add Spanish.
  const T = {
    introTitle: pick(locale, TITLES.compline),
    introEyebrow: pick(locale, TITLES.before_you_begin),
    introBody:
      locale === "es"
        ? "Las Completas son la oración de la Iglesia al cierre del día — la última hora del oficio monástico, guardada por siglos como un modo de entregar el día a Dios. Ora en un lugar tranquilo; suelta el día."
        : "Compline is the Church's prayer at the close of day — the last hour of the monastic round, kept for centuries as a way to hand the day to God. Pray it in a quiet place; let the day go.",
    eyebrowOpening: pick(locale, EYEBROWS.opening),
    eyebrowConfession: pick(locale, EYEBROWS.confession_of_sin),
    eyebrowAbsolution: pick(locale, EYEBROWS.absolution),
    eyebrowVersicle: pick(locale, EYEBROWS.versicle),
    eyebrowLesson: pick(locale, EYEBROWS.the_lesson),
    eyebrowLordsPrayer: pick(locale, EYEBROWS.the_lords_prayer),
    eyebrowCollect: pick(locale, EYEBROWS.the_collect),
    eyebrowAntiphon: pick(locale, EYEBROWS.antiphon),
    eyebrowClosing: pick(locale, EYEBROWS.closing),
    eyebrowBlessing: pick(locale, EYEBROWS.blessing),
    nuncDimittisTitle: pick(locale, TITLES.song_of_simeon),
    nuncDimittisEyebrow: locale === "es" ? "NUNC DIMITTIS · LUCAS 2:29-32" : "NUNC DIMITTIS · LUKE 2:29-32",
    scrollHint: pick(locale, PRAYERS.scroll_hint_continue),
    confessionBody: pick(locale, PRAYERS.confession_compline),
    absolutionBody: pick(locale, PRAYERS.absolution_compline_lay),
    lordsPrayer: pick(locale, PRAYERS.lords_prayer_contemporary),
    collectVisit: pick(locale, PRAYERS.compline_collect_visit),
    antiphonStandard: pick(locale, PRAYERS.compline_antiphon_standard),
    antiphonEaster: pick(locale, PRAYERS.compline_antiphon_easter),
    nuncDimittis: pick(locale, PRAYERS.nunc_dimittis),
    finalBlessing: pick(locale, PRAYERS.compline_final_blessing),
    gloriaPatri: pick(locale, PRAYERS.gloria_patri),
    // Open-dialogue + into-your-hands + closing versicle call-and-
    // response lines.
    openDialogue: [
      { off: pick(locale, PRAYERS.compline_opening_1_off), peo: pick(locale, PRAYERS.compline_opening_1_peo) },
      { off: pick(locale, PRAYERS.compline_opening_2_off), peo: pick(locale, PRAYERS.compline_opening_2_peo) },
    ],
    intoYourHands: [
      { off: pick(locale, PRAYERS.compline_into_your_hands_1_off), peo: pick(locale, PRAYERS.compline_into_your_hands_1_peo) },
      { off: pick(locale, PRAYERS.compline_into_your_hands_2_off), peo: pick(locale, PRAYERS.compline_into_your_hands_2_peo) },
    ],
    letUsBlessOfficiant: pick(locale, PRAYERS.compline_let_us_bless_off),
    letUsBlessPeople: pick(locale, PRAYERS.compline_let_us_bless_peo),
    versicleMakeSpeed: {
      off: pick(locale, PRAYERS.versicle_o_god),
      peo: pick(locale, PRAYERS.versicle_o_lord),
    },
    alleluia: pick(locale, PRAYERS.alleluia),
    lessonByRef: {
      "Jeremiah 14:9": pick(locale, PRAYERS.lesson_jeremiah_14_9),
      "Matthew 11:28-30": pick(locale, PRAYERS.lesson_matthew_11_28_30),
      "Hebrews 13:20-21": pick(locale, PRAYERS.lesson_hebrews_13_20_21),
      "1 Peter 5:8-9": pick(locale, PRAYERS.lesson_1_peter_5_8_9),
    } as Record<string, string>,
  };

  // Fetch the appointed psalm body. A missing row is unlikely (the
  // four Compline psalms are all in the existing seed) but we render
  // a "[Psalm N — see BCP Psalter]" placeholder rather than blow up
  // the whole office if it ever happens.
  const [psalmRow] = await db
    .select()
    .from(bcpTextsTable)
    .where(eq(bcpTextsTable.textKey, `psalm_${psalmRef.number}`))
    .limit(1);

  const slides: Slide[] = [];
  let idx = 0;
  const id = () => `compline_slide_${idx++}`;

  // 0. Threshold intro — short framing slide before the office begins.
  slides.push(
    slide(id(), "office_intro", "🌌", T.introEyebrow, T.introBody, {
      title: T.introTitle,
    }),
  );

  // 1. Opening dialogue — BCP p. 127. Two versicle pairs that frame
  //    the night ahead before the confession is invited.
  slides.push(
    slide(id(), "invitatory", "🌙", T.eyebrowOpening, "", {
      isCallAndResponse: true,
      callAndResponseLines: [
        { speaker: "officiant", text: T.openDialogue[0]!.off },
        { speaker: "people", text: T.openDialogue[0]!.peo },
        { speaker: "officiant", text: T.openDialogue[1]!.off },
        { speaker: "people", text: T.openDialogue[1]!.peo },
      ],
      bcpReference: "BCP p. 127",
    }),
  );

  // 2. Confession (BCP p. 127) + Absolution (BCP p. 128). Default ON
  //    (shares bcpShowConfession with MP/EP). applyConfessionPref at the
  //    end drops both slides if the user has opted out. The confession
  //    ("Almighty God our heavenly Father…") sits at the foot of p. 127;
  //    p. 128 opens with the absolution ("May the Almighty God grant…").
  slides.push(
    slide(id(), "confession", "🙏🏽", T.eyebrowConfession, T.confessionBody, {
      bcpReference: "BCP p. 127",
      isScrollable: true,
      scrollHint: T.scrollHint,
    }),
  );
  slides.push(
    slide(id(), "absolution", "🕊️", T.eyebrowAbsolution, T.absolutionBody, {
      bcpReference: "BCP p. 128",
    }),
  );

  // 3. Opening versicle — BCP p. 128. The familiar "O God, make
  //    speed" pair + Gloria. Easter season appends Alleluia.
  const openingVersicleLines: CallAndResponseLine[] = [
    { speaker: "officiant", text: T.versicleMakeSpeed.off },
    { speaker: "people", text: T.versicleMakeSpeed.peo },
    { speaker: "both", text: T.gloriaPatri },
  ];
  if (liturgicalDay.useAlleluia) {
    openingVersicleLines.push({ speaker: "both", text: T.alleluia });
  }
  slides.push(
    slide(id(), "invitatory", "🔔", T.eyebrowVersicle, "", {
      isCallAndResponse: true,
      callAndResponseLines: openingVersicleLines,
      bcpReference: "BCP p. 128",
    }),
  );

  // 4. Psalm — title card, 4-verse chunks, Gloria. Same liturgical
  //    block shape the full Office uses, so the renderer behaves
  //    identically. Verse-range psalms (e.g. 31:1-5) get sliced.
  const psalmEyebrowText = psalmEyebrow(psalmRef);
  const psalmBody = psalmRow?.content
    ? (psalmRef.range
        ? sliceVersesByRange(psalmRow.content, psalmRef.range)
        : psalmRow.content)
    : null;

  slides.push(
    slide(id(), "psalm_title", "📖", psalmEyebrowText, "", {
      title: psalmRow?.title ?? null,
      bcpReference: psalmRow?.bcpReference ?? null,
      metadata: {
        psalmNumber: psalmRef.number,
        psalmRange: psalmRef.range,
        psalmRef: psalmRef.raw,
        fromLectionary: false,
        compline: true,
      },
    }),
  );

  const chunks = psalmBody ? splitPsalmIntoChunks(psalmBody, 4) : [
    `[Psalm ${psalmRef.raw} — see BCP Psalter]`,
  ];
  chunks.forEach((chunk, i) => {
    slides.push(
      slide(id(), "psalm", "📖", psalmEyebrowText, chunk, {
        title: psalmRow?.title ?? null,
        bcpReference: psalmRow?.bcpReference ?? null,
        metadata: {
          psalmNumber: psalmRef.number,
          psalmRange: psalmRef.range,
          psalmRef: psalmRef.raw,
          fromLectionary: false,
          compline: true,
          psalmChunkIndex: i,
          psalmChunkTotal: chunks.length,
        },
      }),
    );
  });

  slides.push(
    slide(id(), "psalm_gloria", "📖", psalmEyebrowText, T.gloriaPatri, {
      title: psalmRow?.title ?? null,
      bcpReference: psalmRow?.bcpReference ?? null,
      metadata: {
        psalmNumber: psalmRef.number,
        psalmRange: psalmRef.range,
        psalmRef: psalmRef.raw,
        fromLectionary: false,
        compline: true,
      },
    }),
  );

  // 5. Short lesson — BCP p. 132. One of the four appointed Compline
  //    readings, embedded inline (1–3 verses each, no chunking
  //    needed). Title slide + body slide, mirroring the shape of the
  //    full Office's lesson_title + lesson_verses pattern.
  const lessonBody = T.lessonByRef[today.lesson.ref] ?? today.lesson.text;
  slides.push(
    slide(id(), "lesson_title", "📖", T.eyebrowLesson, "", {
      title: today.lesson.ref,
      bcpReference: "BCP p. 132",
      metadata: { compline: true, lessonRef: today.lesson.ref },
    }),
  );
  slides.push(
    slide(id(), "lesson", "📖", today.lesson.ref.toUpperCase(), lessonBody, {
      title: today.lesson.ref,
      bcpReference: "BCP p. 132",
      isScrollable: true,
      scrollHint: T.scrollHint,
      metadata: { compline: true, lessonRef: today.lesson.ref },
    }),
  );

  // 6. "Into your hands" — BCP p. 132. The heart-versicle of
  //    Compline. Two paired exchanges, plus a third closing line.
  slides.push(
    slide(id(), "suffrages", "🌙", T.eyebrowVersicle, "", {
      isCallAndResponse: true,
      callAndResponseLines: [
        { speaker: "officiant", text: T.intoYourHands[0]!.off },
        { speaker: "people", text: T.intoYourHands[0]!.peo },
        { speaker: "officiant", text: T.intoYourHands[1]!.off },
        { speaker: "people", text: T.intoYourHands[1]!.peo },
      ],
      bcpReference: "BCP p. 132",
    }),
  );

  // 7. Lord's Prayer — contemporary form, matching the rest of
  //    Phoebe's offices.
  slides.push(
    slide(id(), "lords_prayer", "🙏🏽", T.eyebrowLordsPrayer, T.lordsPrayer, {
      bcpReference: "BCP p. 132",
    }),
  );

  // 8. Collect — "Visit this place" (BCP p. 133). The other three
  //    Compline collects are equally appointed; a future picker can
  //    let the user choose.
  slides.push(
    slide(id(), "collect", "🌿", T.eyebrowCollect, T.collectVisit, {
      bcpReference: "BCP p. 133",
    }),
  );

  // 9. Antiphon — the BCP shape sandwiches the Nunc Dimittis between
  //    two repetitions of the antiphon. Easter swaps in the alleluia
  //    variant; everywhere else uses the standard "Guide us waking".
  const antiphonText = liturgicalDay.useAlleluia
    ? T.antiphonEaster
    : T.antiphonStandard;

  slides.push(
    slide(id(), "antiphon", "🕊️", T.eyebrowAntiphon, antiphonText, {
      bcpReference: "BCP p. 134",
    }),
  );

  // 10. Nunc Dimittis (Canticle 17 / Luke 2:29-32) — Compline's only
  //     canticle. Title + body slides.
  slides.push(
    slide(id(), "canticle_title", "🌌", "NUNC DIMITTIS", "", {
      title: T.nuncDimittisTitle,
      bcpReference: "BCP p. 135",
    }),
  );
  slides.push(
    slide(id(), "canticle", "🌌", T.nuncDimittisEyebrow, T.nuncDimittis, {
      title: T.nuncDimittisTitle,
      bcpReference: "BCP p. 135",
      isScrollable: true,
      scrollHint: T.scrollHint,
    }),
  );

  // 11. Antiphon repeated — closes the canticle the way the BCP does.
  slides.push(
    slide(id(), "antiphon", "🕊️", T.eyebrowAntiphon, antiphonText, {
      bcpReference: "BCP p. 134",
    }),
  );

  // 12. Closing versicle — "Let us bless the Lord."
  slides.push(
    slide(id(), "invitatory", "🌙", T.eyebrowClosing, "", {
      isCallAndResponse: true,
      callAndResponseLines: [
        { speaker: "officiant", text: T.letUsBlessOfficiant },
        { speaker: "people", text: T.letUsBlessPeople },
      ],
      bcpReference: "BCP p. 135",
    }),
  );

  // 13. Final blessing — closes the office.
  slides.push(
    slide(id(), "closing", "🌌", T.eyebrowBlessing, T.finalBlessing, {
      bcpReference: "BCP p. 135",
    }),
  );

  // Apply the per-user confession preference. Compline shares the
  // bcpShowConfession column with MP/EP — now defaulting TRUE, so the
  // penitential opening shows unless the user explicitly turned it off.
  const slidesForUser = await applyConfessionPref(slides, userId);

  const officeDay: OfficeDayInfo = {
    season: liturgicalDay.season,
    liturgicalYear: liturgicalDay.liturgicalYear,
    sundayLabel: liturgicalDay.sundayLabel,
    weekdayLabel: liturgicalDay.weekdayLabel,
    properNumber: liturgicalDay.properNumber,
    feastName: liturgicalDay.feastName,
    isMajorFeast: liturgicalDay.isMajorFeast,
    useAlleluia: liturgicalDay.useAlleluia,
    totalSlides: slidesForUser.length,
  };

  return { slides: slidesForUser, officeDay };
}
