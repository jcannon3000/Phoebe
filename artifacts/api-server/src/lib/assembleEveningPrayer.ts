/**
 * Evening Prayer Assembly Service
 *
 * Assembles the complete 1979 Episcopal BCP Evening Prayer Rite II
 * for a given date as a Slide[] array.
 *
 * Unlike Morning Prayer, lessons are NOT fetched — the user is told
 * the appointed reading and encouraged to read in their own translation.
 */

import { inArray } from "drizzle-orm";
import { db, bcpTextsTable } from "@workspace/db";
import { getOfficeDay } from "./liturgicalCalendar";
import { getEveningCanticles } from "./eveningCanticleSelector";
import { getLectionaryReadings } from "./lectionary";
import { bibleGatewayUrl } from "./bibleGatewayUrl";
import {
  parsePsalmRef,
  sliceVersesByRange,
  psalmEyebrow,
  splitPsalmIntoChunks,
  splitCanticleIntoChunks,
} from "./psalmRange";
import { EP_BCP_TEXTS } from "../data/bcpEveningPrayerTexts";
import { buildIntercessionSlides } from "./assembleIntercessions";
import { buildLessonSlides } from "./assembleLesson";
import type { Slide, SlideType, CallAndResponseLine, OfficeDayInfo } from "./assembleMorningPrayer";
import { applyConfessionPref } from "./assembleMorningPrayer";
import { EYEBROWS, PRAYERS, TITLES, pick, type Locale } from "./officeI18n";

// Locale override map for EP (mirror of the one in
// assembleMorningPrayer). When locale=es the assembler serves these
// Spanish constants instead of bcp_texts. Keys not present here fall
// through to the seeded English bcp_texts content (psalter, canticles,
// collects of the day, opening sentences are still English-only until
// a Spanish seed pass lands).
const SPANISH_OVERRIDES: Record<string, keyof typeof PRAYERS> = {
  confession_text: "confession_mp_ep",
  confession_absolution: "absolution_lay",
  apostles_creed: "apostles_creed",
  lords_prayer_contemporary: "lords_prayer_contemporary",
  suffrages_a: "suffrages_a",
  suffrages_b: "suffrages_b",
  general_thanksgiving: "general_thanksgiving",
  prayer_for_mission_1: "prayer_for_mission_1",
  prayer_for_mission_2: "prayer_for_mission_2",
  prayer_for_mission_3: "prayer_for_mission_3",
  phos_hilaron: "phos_hilaron",
  // Canticles — Magnificat (15) is the most-prayed EP canticle, but
  // the EP rubric allows any post-OT canticle to swap in, so cover
  // the full evening-eligible set we have Spanish text for.
  canticle_15: "canticle_15",
  canticle_16: "canticle_16",
  canticle_18: "canticle_18",
  canticle_19: "canticle_19",
  canticle_20: "canticle_20",
  canticle_21: "canticle_21",
  // Opening sentences — same set as MP. The seasonal opener at EP is
  // selected from the same bcp_texts rows, just keyed off the
  // evening sentinel set.
  opening_sentence_advent_1: "opening_sentence_advent_1",
  opening_sentence_advent_3: "opening_sentence_advent_3",
  opening_sentence_christmas_1: "opening_sentence_christmas_1",
  opening_sentence_epiphany_1: "opening_sentence_epiphany_1",
  opening_sentence_lent_1: "opening_sentence_lent_1",
  opening_sentence_easter_1: "opening_sentence_easter_1",
  opening_sentence_trinity_1: "opening_sentence_trinity_1",
  opening_sentence_anytime_4: "opening_sentence_anytime_4",
  opening_sentence_evening_1: "opening_sentence_evening_1",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

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

const PSALM_EMOJI: Record<number, string> = {};
const PRAISE_PSALMS = [8,19,29,33,47,65,66,67,68,96,98,100,103,104,111,113,117,135,136,145,146,147,148,149,150];
const LAMENT_PSALMS = [6,13,22,31,38,42,44,51,55,74,77,79,80,85,86,88,90,102,130,137,143];
const CONFIDENCE_PSALMS = [11,16,23,27,46,62,71,91,121,125,131];
const THANKSGIVING_PSALMS = [9,18,30,34,40,92,107,116,118,138];
PRAISE_PSALMS.forEach(n => (PSALM_EMOJI[n] = "🌟"));
LAMENT_PSALMS.forEach(n => (PSALM_EMOJI[n] = "💧"));
CONFIDENCE_PSALMS.forEach(n => (PSALM_EMOJI[n] = "🏔️"));
THANKSGIVING_PSALMS.forEach(n => (PSALM_EMOJI[n] = "🌾"));

// Body shown on lesson slides. Title carries the reference; body
// is a soft prompt to open the passage in your own bible.
const LESSON_PROMPT = "Open your Bible, or read this passage online.";

const CANTICLE_EMOJI: Record<string, string> = {
  canticle_8: "🌊", canticle_9: "💧", canticle_10: "🔍",
  canticle_11: "✨", canticle_12: "🌍", canticle_13: "🌟",
  canticle_14: "🙏🏽", canticle_15: "🌸", canticle_16: "🌅",
  canticle_17: "🕊️", canticle_18: "🕊️", canticle_19: "🌸",
  canticle_20: "✨", canticle_21: "🌟",
};

const SEASON_LABELS: Record<string, string> = {
  advent: "Advent 🕯️", christmas: "Christmas 🌟", epiphany: "Epiphany ✨",
  lent: "Lent 🌿", holy_week: "Holy Week ✝️", easter: "Eastertide 🌸",
  season_after_pentecost: "Season after Pentecost 🌳",
};

/** Parse suffrage text (V: / R: lines) into call-and-response lines */
function parseSuffrages(text: string): CallAndResponseLine[] {
  const lines: CallAndResponseLine[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("V.") || line.startsWith("V ")) {
      lines.push({ speaker: "officiant", text: line.replace(/^V\.?\s*/, "") });
    } else if (line.startsWith("R.") || line.startsWith("R ")) {
      lines.push({ speaker: "people", text: line.replace(/^R\.?\s*/, "") });
    } else if (lines.length > 0) {
      lines[lines.length - 1].text += " " + line;
    }
  }
  return lines;
}

/** Pick opening sentence (rotate by day of month) */
function pickOpeningSentenceKey(season: string, dayOfMonth: number): string {
  const seasonMap: Record<string, { prefix: string; count: number }> = {
    advent: { prefix: "opening_sentence_advent_", count: 3 },
    christmas: { prefix: "opening_sentence_christmas_", count: 2 },
    epiphany: { prefix: "opening_sentence_epiphany_", count: 3 },
    lent: { prefix: "opening_sentence_lent_", count: 5 },
    holy_week: { prefix: "opening_sentence_holyweek_", count: 2 },
    easter: { prefix: "opening_sentence_easter_", count: 5 },
    season_after_pentecost: { prefix: "opening_sentence_anytime_", count: 7 },
  };
  const entry = seasonMap[season] ?? { prefix: "opening_sentence_anytime_", count: 7 };
  const index = (dayOfMonth % entry.count) + 1;
  return `${entry.prefix}${index}`;
}

function pickSuffragesKey(weekInSeason: number): string {
  return weekInSeason % 2 === 1 ? "suffrages_a" : "suffrages_b";
}

// ── Closing rubric helpers ────────────────────────────────────────────────────
//
// BCP EP p. 126 closes with "Let us bless the Lord. / Thanks be to
// God." (with "Alleluia, alleluia." appended Easter Day → Day of
// Pentecost), then ONE of three scriptural blessings. Mirrors the MP
// closing on p. 102 — same three blessings, same rotation. Kept
// inline here so the EP assembler stays self-contained alongside its
// embedded BCP text constants.

const CONCLUDING_BLESSINGS: Array<{ ref: string; text: string }> = [
  {
    ref: "2 Corinthians 13:14",
    text: "The grace of our Lord Jesus Christ, and the love of God, and the fellowship of the Holy Spirit, be with us all evermore. Amen.",
  },
  {
    ref: "Romans 15:13",
    text: "May the God of hope fill us with all joy and peace in believing through the power of the Holy Spirit. Amen.",
  },
  {
    ref: "Ephesians 3:20–21",
    text: "Glory to God whose power, working in us, can do infinitely more than we can ask or imagine: Glory to him from generation to generation in the Church, and in Christ Jesus for ever and ever. Amen.",
  },
];

function pickConcludingBlessing(date: Date): { ref: string; text: string } {
  // Day-of-year mod 3 — same blessing across MP and EP on a given
  // date so the day reads as one liturgical thread.
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return CONCLUDING_BLESSINGS[day % CONCLUDING_BLESSINGS.length];
}

// Prayer for Mission — BCP EP p. 124 appoints three options. Rotate
// by day-of-year, matching the MP cadence and the concluding blessing.
const EP_PRAYER_FOR_MISSION_KEYS = ["prayer_mission_1", "prayer_mission_2", "prayer_mission_3"];
function pickPrayerForMissionKey(date: Date): string {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return EP_PRAYER_FOR_MISSION_KEYS[day % EP_PRAYER_FOR_MISSION_KEYS.length];
}

// All BCP texts now come from ../data/bcpEveningPrayerTexts.ts (EP_BCP_TEXTS)

// ── Main Assembly ────────────────────────────────────────────────────────────

export async function assembleEveningPrayer(
  date: Date,
  userId: number,
  locale: Locale = "en",
  confessionOverride?: boolean,
): Promise<{
  slides: Slide[];
  officeDay: OfficeDayInfo;
  fromCache: boolean;
}> {
  const liturgicalDay = getOfficeDay(date);
  const readings = getLectionaryReadings(liturgicalDay, "evening");
  // EP only renders one lesson now (the Gospel — see lesson3 below),
  // so the post-OT canticle slot is unused. Keep destructuring for
  // forward-compat but mark afterOT as deliberately ignored.
  const { afterOT: _afterOT, afterNT } = getEveningCanticles(liturgicalDay);
  void _afterOT;

  const openingSentenceKey = pickOpeningSentenceKey(liturgicalDay.season, date.getDate());
  const suffragesKey = pickSuffragesKey(liturgicalDay.weekInSeason);

  // Parse appointed psalms — keep both the bare number (used to look
  // up the seeded psalm row) and the optional verse range so we can
  // slice partial-psalm appointments like "119:73-96" before
  // rendering. EP previously only showed the reference; now we render
  // the full appointed text the same way Morning Prayer does.
  const appointedPsalms = readings.psalms
    .map(parsePsalmRef)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Pull psalm rows from bcp_texts (the same seeded source MP uses).
  // EP_BCP_TEXTS only carries canticles + invariant prayers, not the
  // 150 psalms — and not the ~150 seasonal collects either, so fetch
  // the Collect of the Day's row here too. (Before this, EP fell back
  // to collect_fallback — "A Collect for the Renewal of Life", a
  // MORNING collect — as the Collect of the Day on every day that
  // wasn't one of the four majors in the static map.)
  const psalmKeys = appointedPsalms.map((p) => `psalm_${p.number}`);
  const rowKeys = liturgicalDay.collectKey
    ? [...psalmKeys, liturgicalDay.collectKey]
    : psalmKeys;
  const psalmRows =
    rowKeys.length > 0
      ? await db
          .select()
          .from(bcpTextsTable)
          .where(inArray(bcpTextsTable.textKey, rowKeys))
      : [];
  const psalmTexts: Record<string, { content: string; title: string | null; bcpReference: string | null }> = {};
  for (const row of psalmRows) {
    psalmTexts[row.textKey] = {
      content: row.content,
      title: row.title ?? null,
      bcpReference: row.bcpReference ?? null,
    };
  }

  /** Look up a text from embedded data */
  function getText(key: string): string {
    return EP_BCP_TEXTS[key]?.content ?? "";
  }
  function getTextData(key: string) {
    return EP_BCP_TEXTS[key] ?? { content: "", title: key, bcpReference: "" };
  }
  // Locale-aware variant of getText — when locale=es and the key has
  // a SPANISH_OVERRIDES entry, return the Spanish constant; otherwise
  // fall through to the existing English EP_BCP_TEXTS lookup.
  function localized(key: string): string {
    if (locale !== "es") return getText(key);
    const esKey = SPANISH_OVERRIDES[key];
    if (esKey) return pick(locale, PRAYERS[esKey]);
    return getText(key);
  }

  // ── Build slides ────────────────────────────────────────────────────────────

  const slides: Slide[] = [];
  let idx = 0;
  const id = () => `ep_slide_${idx++}`;

  // 0. Office intro — names the liturgy and the tradition it belongs
  //    to, so the user crosses a threshold before the opening
  //    sentence rather than landing cold in the middle of a rite.
  slides.push(
    slide(
      id(),
      "office_intro",
      "🕊️",
      locale === "es" ? "Antes de comenzar" : "Before you begin",
      locale === "es"
        ? "Por siglos la Iglesia ha rezado el Oficio Diario — salmos, Escritura y oración en las bisagras de la mañana y de la tarde. Monjes y laicos por igual han guardado este ritmo, dejando que un patrón fijo dé estabilidad a los días corrientes. Te unes a una oración que la Iglesia nunca ha dejado de rezar."
        : "For centuries the Church has prayed the Daily Office — psalms, Scripture, and prayer at the hinges of the morning and evening. Monks and laypeople alike have kept this rhythm, letting a fixed pattern bring stability to ordinary days. You are joining a prayer the Church has never stopped praying.",
      { title: pick(locale, TITLES.evening_prayer) },
    ),
  );

  // 1. Opening Sentence (the Opening Acclamation slot per user
  //    direction). The earlier first slide was a Phoebe-specific
  //    date label — that information already lives in the chrome's
  //    reference label, so EP begins with the BCP's actual first
  //    element: the seasonal Opening Sentence.
  slides.push(
    slide(id(), "opening_sentence", "📖", pick(locale, EYEBROWS.opening_sentence), localized(openingSentenceKey), {
      bcpReference: "BCP p. 115",
    }),
  );

  // 3. Confession, then 4. Absolution — two slides. The confession
  // is the people's prayer; the absolution is the priest's
  // declaration of forgiveness in reply. Per user direction they're
  // separate cards so each beat lands on its own.
  slides.push(
    slide(id(), "confession", "🙏🏽", pick(locale, EYEBROWS.confession_of_sin), localized("confession_text").trim(), {
      bcpReference: "BCP p. 116",
      metadata: { prompt: locale === "es" ? "Pausa. Trae lo que llevas. 🌿" : "Pause. Bring what you carry. 🌿" },
    }),
  );
  slides.push(
    slide(id(), "absolution", "🕊️", pick(locale, EYEBROWS.absolution), localized("confession_absolution").trim(), {
      bcpReference: "BCP p. 117",
    }),
  );

  // 5. Invitatory — EP uses different versicle
  const invitatoryLines: CallAndResponseLine[] = [
    { speaker: "officiant", text: pick(locale, PRAYERS.versicle_evening_off) },
    { speaker: "people", text: pick(locale, PRAYERS.versicle_evening_peo) },
    { speaker: "both", text: pick(locale, PRAYERS.gloria_patri) },
  ];
  if (liturgicalDay.useAlleluia) {
    invitatoryLines.push({ speaker: "both", text: pick(locale, PRAYERS.alleluia) });
  }

  slides.push(
    slide(id(), "invitatory", "🔔", pick(locale, EYEBROWS.invitatory), "", {
      isCallAndResponse: true,
      callAndResponseLines: invitatoryLines,
      bcpReference: "BCP p. 117",
    }),
  );

  // 6. O Gracious Light (Phos hilaron) — unique to Evening Prayer
  const phosData = getTextData("phos_hilaron");
  slides.push(
    slide(id(), "invitatory_psalm", "🕯️", pick(locale, EYEBROWS.phos_hilaron), localized("phos_hilaron"), {
      bcpReference: phosData.bcpReference,
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
    }),
  );

  // 7. Appointed Psalms — render as one combined liturgical block
  // (matches Morning Prayer): single combined title slide ("Psalm
  // 23 & 27"), verse chunks for each psalm in sequence with no
  // breaks or per-psalm titles between, and a single Gloria Patri
  // pinned to the bottom-right of the LAST verse chunk. Reads as
  // one psalm-saying instead of N independent recitations.
  const epGloriaPatri =
    "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";

  if (appointedPsalms.length > 0) {
    const combinedEyebrow = appointedPsalms.length === 1
      ? psalmEyebrow(appointedPsalms[0])
      : `PSALMS ${appointedPsalms.map((p) => p.range ? `${p.number}:${p.range[0]}-${p.range[1]}` : `${p.number}`).join(" & ")}`;
    const firstPsalm = appointedPsalms[0];
    const firstData = psalmTexts[`psalm_${firstPsalm.number}`];
    const combinedTitle = appointedPsalms.length === 1
      ? (firstData?.title ?? null)
      : `Psalms ${appointedPsalms.map((p) => `${p.number}`).join(" & ")}`;

    slides.push(
      slide(id(), "psalm_title", PSALM_EMOJI[firstPsalm.number] ?? "📖", combinedEyebrow, "", {
        title: combinedTitle,
        bcpReference: firstData?.bcpReference ?? null,
        isScrollable: false,
        scrollHint: null,
        metadata: {
          psalmNumber: firstPsalm.number,
          psalmRange: firstPsalm.range,
          psalmRef: appointedPsalms.map((p) => p.raw).join(" & "),
          combined: appointedPsalms.length > 1,
        },
      }),
    );

    type Chunk = { content: string; psalmRef: typeof appointedPsalms[number] };
    const allChunks: Chunk[] = [];
    for (const psalmRef of appointedPsalms) {
      const psalmData = psalmTexts[`psalm_${psalmRef.number}`];
      const sliced =
        psalmData && psalmRef.range
          ? sliceVersesByRange(psalmData.content, psalmRef.range)
          : psalmData?.content;
      if (sliced) {
        const chunks = splitPsalmIntoChunks(sliced, 4);
        chunks.forEach((chunk) => allChunks.push({ content: chunk, psalmRef }));
      } else {
        allChunks.push({
          content: `[Psalm ${psalmRef.raw} — see BCP Psalter]`,
          psalmRef,
        });
      }
    }

    allChunks.forEach((c, i) => {
      const eyebrow = psalmEyebrow(c.psalmRef);
      const psalmNum = c.psalmRef.number;
      const psalmData = psalmTexts[`psalm_${psalmNum}`];
      slides.push(
        slide(id(), "psalm", PSALM_EMOJI[psalmNum] ?? "📖", eyebrow, c.content, {
          title: psalmData?.title ?? null,
          bcpReference: psalmData?.bcpReference ?? null,
          isScrollable: false,
          scrollHint: null,
          metadata: {
            psalmNumber: psalmNum,
            psalmRange: c.psalmRef.range,
            psalmRef: c.psalmRef.raw,
            psalmChunkIndex: i,
            psalmChunkTotal: allChunks.length,
          },
        }),
      );
    });

    // Gloria Patri — its own slide, sealing the whole appointed-psalms
    // reading (mirrors MP). One Gloria for the appointed portion is
    // permitted by the BCP rubric (Gloria "may be sung or said at the
    // end of each Psalm or at the end of the whole Portion").
    const combinedTitleEyebrow = appointedPsalms.length === 1
      ? psalmEyebrow(appointedPsalms[0])
      : combinedEyebrow;
    slides.push(
      slide(id(), "psalm_gloria", "🎶", combinedTitleEyebrow, epGloriaPatri, {
        isScrollable: false,
        scrollHint: null,
        metadata: { appointed: true },
      }),
    );
  }

  // 8. The Gospel — reference only.
  //
  // BCP Daily Office Lectionary appoints THREE readings per day per
  // year (OT, Epistle, Gospel). Per user direction the distribution
  // is "two readings at MP, the third at EP" regardless of the
  // year's Gospel-placement convention. So MP shows lesson1 (OT) +
  // lesson2 (Epistle), and EP shows lesson3 (Gospel) only — no
  // duplication of MP's lessons here. Earlier the server emitted
  // lesson1+lesson2 in EP too, which mirrored MP and read as a bug.
  //
  // "Eve of …" entries (Ascension Eve, Pentecost Eve, Trinity Eve)
  // are an exception: the BCP appoints only 2 lessons for First
  // Evensong (OT + NT), and the lectionary file stores them in
  // lesson1/lesson2 with lesson3 blank. On regular days the three
  // appointed lessons are SPLIT across MP (OT+Epistle) and EP
  // (Gospel); on Eves both eve lessons are FOR EP exclusively
  // (morning uses the regular weekday entry). For the single
  // EP-lesson slot we use lesson2 (NT) rather than lesson1 (OT)
  // since EP's normal lesson is its NT/Gospel counterpart.
  //
  // Gated on isEveOverride so the fallback does NOT fire on regular
  // days that happen to have lesson3 blank (e.g. Palm Sunday, which
  // appoints lesson1+lesson2 for MP only — falling back would
  // duplicate the Epistle MP just read).
  const lesson3Trimmed = (readings.lesson3 ?? "").trim();
  const hasLesson3 = lesson3Trimmed.length > 0 && !/^-+$/.test(lesson3Trimmed);
  const useEveFallback = !hasLesson3 && readings.isEveOverride;
  const lessonForEvening = hasLesson3
    ? readings.lesson3
    : useEveFallback
      ? readings.lesson2
      : "";
  // Eyebrow + emoji track the lesson actually being shown: the Gospel
  // cross on Gospel days, the scroll on Eve NT-fallback days.
  const lessonKindForEvening = hasLesson3 ? "gospel_evening" : "first_evening";
  // Title card + chunked numbered-verse slides — same shape as MP's
  // lessons. The reference-only fallback fires automatically inside
  // buildLessonSlides if the lesson happens to land on a deuteron-
  // ical pericope (rare, but defensible).
  for (const s of buildLessonSlides(lessonForEvening, lessonKindForEvening, id)) {
    slides.push(s);
  }

  // 9. Canticle after the Gospel — Magnificat or Nunc Dimittis depending
  // on day; we use the canticle the season selector returns for the
  // post-NT slot. The two-canticle pattern at EP (one between lessons,
  // one after the second) collapses to one when there's only one lesson.
  // Long canticles get a title slide + 4-verse-per-slide chunking;
  // short ones (≤4 verses, e.g. Nunc Dimittis) ship as a single slide.
  const afterNTData = getTextData(afterNT);
  const afterNTBody = localized(afterNT);
  const epEyebrow = afterNTData.title.toUpperCase();
  const epEmoji = CANTICLE_EMOJI[afterNT] ?? "🌟";
  const numMatch = afterNT.match(/canticle_(\d+)/);
  const epHeadlineNum = numMatch ? `Canticle ${numMatch[1]}` : afterNTData.title;
  const { verses: epVerseCount, chunks: epChunks } = splitCanticleIntoChunks(afterNTBody, 4);
  if (epVerseCount <= 4) {
    slides.push(
      slide(id(), "canticle", epEmoji, epEyebrow, afterNTBody, {
        title: afterNTData.title,
        bcpReference: afterNTData.bcpReference,
      }),
    );
  } else {
    slides.push(
      slide(id(), "canticle_title", epEmoji, epEyebrow, "", {
        title: afterNTData.title,
        bcpReference: afterNTData.bcpReference,
        metadata: { canticleKey: afterNT, canticleHeadline: epHeadlineNum },
      }),
    );
    epChunks.forEach((chunk, i) => {
      slides.push(
        slide(id(), "canticle", epEmoji, epEyebrow, chunk, {
          title: afterNTData.title,
          bcpReference: afterNTData.bcpReference,
          metadata: {
            canticleKey: afterNT,
            canticleChunkIndex: i,
            canticleChunkTotal: epChunks.length,
          },
        }),
      );
    });
  }

  // 12. The Apostles' Creed — split into two slides at the third
  // article ("I believe in the Holy Spirit…"). Slide 1 is the
  // Father + the Son; slide 2 is the Holy Spirit and the Church.
  const creedData = getTextData("apostles_creed");
  const creedBody = localized("apostles_creed");
  const epCreedSplitMarker = locale === "es" ? "Creo en el Espíritu Santo" : "I believe in the Holy Spirit";
  const epCreedSplit = creedBody.indexOf(epCreedSplitMarker);
  const epCreed1 = epCreedSplit > 0 ? creedBody.slice(0, epCreedSplit).trimEnd() : creedBody;
  const epCreed2 = epCreedSplit > 0 ? creedBody.slice(epCreedSplit).trimStart() : "";
  slides.push(
    slide(id(), "creed", "✝️", pick(locale, EYEBROWS.apostles_creed), epCreed1, {
      bcpReference: creedData.bcpReference,
      metadata: { prompt: locale === "es" ? "Decimos juntos lo que creemos." : "We say together what we believe." },
    }),
  );
  if (epCreed2) {
    slides.push(
      slide(id(), "creed", "✝️", pick(locale, EYEBROWS.apostles_creed), epCreed2, {
        bcpReference: creedData.bcpReference,
      }),
    );
  }

  // 13. The Lord's Prayer
  const lpData = getTextData("lords_prayer_contemporary");
  slides.push(
    slide(id(), "lords_prayer", "🙏🏽", pick(locale, EYEBROWS.the_lords_prayer), localized("lords_prayer_contemporary"), {
      bcpReference: lpData.bcpReference,
    }),
  );

  // 14. Suffrages
  const suffrageText = localized(suffragesKey);
  const suffrageData = getTextData(suffragesKey);
  slides.push(
    slide(id(), "suffrages", "🕊️", `${pick(locale, EYEBROWS.suffrages)} ${suffragesKey === "suffrages_a" ? "A" : "B"}`, suffrageText, {
      bcpReference: suffrageData.bcpReference,
      isCallAndResponse: true,
      callAndResponseLines: parseSuffrages(suffrageText),
    }),
  );

  // 15. Collect of the Day — satisfies the BCP rubric's "one or more
  // of the following Collects, the Collect of the Day being first."
  // A Prayer for Mission follows below as the BCP appoints.
  // DB row first (the seeded Collects of the Christian Year, with the
  // real text + page ref), then the static map's four majors, then the
  // generic fallback.
  const collectRow = psalmTexts[liturgicalDay.collectKey];
  const collectContent = collectRow?.content || getText(liturgicalDay.collectKey) || getText("collect_fallback");
  const collectRef = collectRow?.bcpReference || getTextData(liturgicalDay.collectKey).bcpReference || getTextData("collect_fallback").bcpReference;
  slides.push(
    slide(id(), "collect", "📅", pick(locale, EYEBROWS.the_collect_of_the_day), collectContent, {
      title: liturgicalDay.sundayLabel,
      bcpReference: collectRef,
    }),
  );

  // 15b. A Prayer for Mission — BCP EP p. 124. Three options, rotated
  // by day-of-year (same cadence as MP).
  const epPmKey = pickPrayerForMissionKey(date);
  const epPmData = getTextData(epPmKey);
  slides.push(
    slide(id(), "prayer_for_mission", "🌍", pick(locale, EYEBROWS.prayer_for_mission), localized(epPmKey), {
      bcpReference: epPmData.bcpReference || "BCP p. 124",
    }),
  );

  // 16. Intercessions handoff — the office no longer renders per-
  //     person intercession slides inline. Instead it emits a single
  //     "intercessions_portal" placeholder; the client recognises it
  //     and seamlessly transitions into /prayer-mode. The user prays
  //     through the same slideshow they get from the home screen and
  //     is returned here for the General Thanksgiving + final
  //     blessing. We only emit the portal if there's actually
  //     something to pray for.
  const epIntercessionSlides = await buildIntercessionSlides(userId, startOfDay(date));
  if (epIntercessionSlides.length > 0) {
    slides.push({
      id: id(),
      type: "intercessions_portal",
      emoji: "🙏🏽",
      eyebrow: "INTERCESSIONS",
      title: null,
      content: "Praying with your community…",
      isCallAndResponse: false,
      callAndResponseLines: null,
      bcpReference: null,
      isScrollable: false,
      scrollHint: null,
      metadata: { intercessionCount: epIntercessionSlides.length },
    });
  }

  // 17. General Thanksgiving — split into two slides at its second
  // movement. Slide 1 is the thanksgiving itself; slide 2 is the
  // petition that flows from it ("And, we pray, give us such an
  // awareness…"). Each half fits a card, so no scroll is needed.
  const gtData = getTextData("general_thanksgiving");
  const gtBody = localized("general_thanksgiving");
  const gtSplitMarker = locale === "es" ? "Y te suplicamos" : "And, we pray, give us such an awareness";
  const epGtSplit = gtBody.indexOf(gtSplitMarker);
  const epGt1 = epGtSplit > 0 ? gtBody.slice(0, epGtSplit).trimEnd() : gtBody;
  const epGt2 = epGtSplit > 0 ? gtBody.slice(epGtSplit).trimStart() : "";
  slides.push(
    slide(id(), "general_thanksgiving", "🌾", pick(locale, EYEBROWS.general_thanksgiving), epGt1, {
      bcpReference: gtData.bcpReference,
      metadata: { prompt: locale === "es" ? "Esto suele decirse en voz alta juntos." : "This is often said aloud together." },
    }),
  );
  if (epGt2) {
    slides.push(
      slide(id(), "general_thanksgiving", "🌾", pick(locale, EYEBROWS.general_thanksgiving), epGt2, {
        bcpReference: gtData.bcpReference,
      }),
    );
  }

  // 18. Concluding versicle — "Let us bless the Lord. / Thanks be to
  //     God." (with Alleluia from Easter Day through the Day of
  //     Pentecost). BCP p. 126.
  const concludingLines: CallAndResponseLine[] = liturgicalDay.useAlleluia
    ? [
        { speaker: "officiant", text: pick(locale, PRAYERS.dismissal_off_easter) },
        { speaker: "people", text: pick(locale, PRAYERS.dismissal_peo_easter) },
      ]
    : [
        { speaker: "officiant", text: pick(locale, PRAYERS.dismissal_off) },
        { speaker: "people", text: pick(locale, PRAYERS.dismissal_peo) },
      ];
  slides.push(
    slide(id(), "suffrages", "🔔", locale === "es" ? "BENDIGAMOS AL SEÑOR" : "LET US BLESS THE LORD", "", {
      isCallAndResponse: true,
      callAndResponseLines: concludingLines,
      bcpReference: "BCP p. 126",
    }),
  );

  // 19. Concluding blessing — one of three scriptural blessings
  //     (BCP p. 126), rotated by date. Same rotation as MP.
  const blessing = pickConcludingBlessing(date);
  slides.push(
    slide(id(), "collect", "🙏🏽", "A CONCLUDING BLESSING", blessing.text, {
      title: blessing.ref,
      bcpReference: "BCP p. 126",
    }),
  );

  // (Closing slide removed — the trailing "CLOSING / Evening
  // Prayer" beat just echoed the top bar and made the user tap
  // one more empty card to finish. The final blessing now closes
  // the office; the bottom pill's "Done" button signals the end.)

  // Per-user: hide the Confession + Absolution unless the user opted in.
  const slidesForUser = await applyConfessionPref(slides, userId, confessionOverride);

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

  return { slides: slidesForUser, officeDay, fromCache: false };
}
