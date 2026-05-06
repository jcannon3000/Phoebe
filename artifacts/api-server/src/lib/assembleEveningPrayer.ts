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
} from "./psalmRange";
import { EP_BCP_TEXTS } from "../data/bcpEveningPrayerTexts";
import { buildIntercessionSlides } from "./assembleIntercessions";
import type { Slide, SlideType, CallAndResponseLine, OfficeDayInfo } from "./assembleMorningPrayer";

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

// All BCP texts now come from ../data/bcpEveningPrayerTexts.ts (EP_BCP_TEXTS)

// ── Main Assembly ────────────────────────────────────────────────────────────

export async function assembleEveningPrayer(
  date: Date,
  userId: number,
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
  // 150 psalms.
  const psalmKeys = appointedPsalms.map((p) => `psalm_${p.number}`);
  const psalmRows =
    psalmKeys.length > 0
      ? await db
          .select()
          .from(bcpTextsTable)
          .where(inArray(bcpTextsTable.textKey, psalmKeys))
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

  // ── Build slides ────────────────────────────────────────────────────────────

  const slides: Slide[] = [];
  let idx = 0;
  const id = () => `ep_slide_${idx++}`;

  // 1. Opening Sentence (the Opening Acclamation slot per user
  //    direction). The earlier first slide was a Phoebe-specific
  //    date label — that information already lives in the chrome's
  //    reference label, so EP begins with the BCP's actual first
  //    element: the seasonal Opening Sentence.
  slides.push(
    slide(id(), "opening_sentence", "📖", "OPENING SENTENCE", getText(openingSentenceKey), {
      bcpReference: "BCP p. 115",
    }),
  );

  // 3. Confession
  slides.push(
    slide(id(), "confession", "🙏🏽", "CONFESSION OF SIN", getText("confession_text"), {
      bcpReference: "BCP p. 116",
      metadata: { prompt: "Pause. Bring what you carry. 🌿" },
    }),
  );

  // 4. Absolution
  slides.push(
    slide(id(), "absolution", "☀️", "ABSOLUTION", getText("confession_absolution"), {
      bcpReference: "BCP p. 117",
    }),
  );

  // 5. Invitatory — EP uses different versicle
  const invitatoryLines: CallAndResponseLine[] = [
    { speaker: "officiant", text: "O God, make speed to save us." },
    { speaker: "people", text: "O Lord, make haste to help us." },
    {
      speaker: "both",
      text: "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.",
    },
  ];
  if (liturgicalDay.useAlleluia) {
    invitatoryLines.push({ speaker: "both", text: "Alleluia." });
  }

  slides.push(
    slide(id(), "invitatory", "🔔", "INVITATORY", "", {
      isCallAndResponse: true,
      callAndResponseLines: invitatoryLines,
      bcpReference: "BCP p. 117",
    }),
  );

  // 6. O Gracious Light (Phos hilaron) — unique to Evening Prayer
  const phosData = getTextData("phos_hilaron");
  slides.push(
    slide(id(), "invitatory_psalm", "🕯️", "O GRACIOUS LIGHT", phosData.content, {
      bcpReference: phosData.bcpReference,
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
    }),
  );

  // 7. Appointed Psalms — full text, sliced to the appointed verse
  // range when the lectionary specifies one (e.g. "119:73-96").
  // Mirrors Morning Prayer's psalm rendering so EP isn't a second-
  // class surface that asks the reader to leave the office to find
  // the text.
  const epGloriaPatri =
    "\nGlory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";
  for (const psalmRef of appointedPsalms) {
    const { number: psalmNum, range } = psalmRef;
    const psalmKey = `psalm_${psalmNum}`;
    const psalmData = psalmTexts[psalmKey];
    const sliced =
      psalmData && range
        ? sliceVersesByRange(psalmData.content, range)
        : psalmData?.content;
    const content = sliced
      ? sliced + epGloriaPatri
      : `[Psalm ${psalmRef.raw} — see BCP Psalter]${epGloriaPatri}`;
    const eyebrow = psalmEyebrow(psalmRef);

    slides.push(
      slide(id(), "psalm", PSALM_EMOJI[psalmNum] ?? "📖", eyebrow, content, {
        title: psalmData?.title ?? null,
        bcpReference: psalmData?.bcpReference ?? null,
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
        metadata: {
          psalmNumber: psalmNum,
          psalmRange: range,
          psalmRef: psalmRef.raw,
        },
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
  const lesson3 = readings.lesson3;
  slides.push(
    slide(id(), "lesson", "✝️", "THE GOSPEL", LESSON_PROMPT, {
      title: lesson3,
      metadata: {
        reference: lesson3,
        readUrl: bibleGatewayUrl(lesson3),
        readingNote: "Read the Gospel in your own Bible or preferred translation.",
      },
    }),
  );

  // 9. Canticle after the Gospel — Magnificat or Nunc Dimittis depending
  // on day; we use the canticle the season selector returns for the
  // post-NT slot. The two-canticle pattern at EP (one between lessons,
  // one after the second) collapses to one when there's only one lesson.
  const afterNTData = getTextData(afterNT);
  slides.push(
    slide(id(), "canticle", CANTICLE_EMOJI[afterNT] ?? "🌟",
      afterNTData.title.toUpperCase(),
      afterNTData.content,
      {
        bcpReference: afterNTData.bcpReference,
        isScrollable: true,
        scrollHint: "↓ continue · tap when ready",
      },
    ),
  );

  // 12. The Apostles' Creed
  const creedData = getTextData("apostles_creed");
  slides.push(
    slide(id(), "creed", "✝️", creedData.title.toUpperCase(), creedData.content, {
      bcpReference: creedData.bcpReference,
      metadata: { prompt: "We say together what we believe." },
    }),
  );

  // 13. The Lord's Prayer
  const lpData = getTextData("lords_prayer_contemporary");
  slides.push(
    slide(id(), "lords_prayer", "🙏🏽", lpData.title.toUpperCase(), lpData.content, {
      bcpReference: lpData.bcpReference,
    }),
  );

  // 14. Suffrages
  const suffrageText = getText(suffragesKey);
  const suffrageData = getTextData(suffragesKey);
  slides.push(
    slide(id(), "suffrages", "🕊️", `SUFFRAGES ${suffragesKey === "suffrages_a" ? "A" : "B"}`, suffrageText, {
      bcpReference: suffrageData.bcpReference,
      isCallAndResponse: true,
      callAndResponseLines: parseSuffrages(suffrageText),
    }),
  );

  // 15. Collect of the Day
  const collectContent = getText(liturgicalDay.collectKey) || getText("collect_fallback");
  const collectRef = getTextData(liturgicalDay.collectKey).bcpReference || getTextData("collect_fallback").bcpReference;
  slides.push(
    slide(id(), "collect", "📅", "COLLECT OF THE DAY", collectContent, {
      title: liturgicalDay.sundayLabel,
      bcpReference: collectRef,
    }),
  );

  // 16. Per-item intercession slides — one card per request,
  //     prayers-for, circle intention, or today's subscribed-feed
  //     entry. Per user direction Phoebe collapses the closing-prayer
  //     block to a single Collect of the Day (above), then fans the
  //     intercessions out as the BCP rubric "Authorized intercessions
  //     and thanksgivings may follow" — one slide per intercession,
  //     mirroring the prayer-mode slideshow rhythm. The earlier
  //     "A Collect for Peace" + "A Collect for Aid against Perils" +
  //     "A Prayer for Mission" slides are gone.
  const intercessionSlides = await buildIntercessionSlides(userId, startOfDay(date));
  for (const s of intercessionSlides) slides.push(s);

  // 17. General Thanksgiving
  const gtData = getTextData("general_thanksgiving");
  slides.push(
    slide(id(), "general_thanksgiving", "🌾", gtData.title.toUpperCase(), gtData.content, {
      bcpReference: gtData.bcpReference,
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
      metadata: { prompt: "This is often said aloud together." },
    }),
  );

  // 18. Concluding versicle — "Let us bless the Lord. / Thanks be to
  //     God." (with Alleluia from Easter Day through the Day of
  //     Pentecost). BCP p. 126.
  const concludingLines: CallAndResponseLine[] = liturgicalDay.useAlleluia
    ? [
        { speaker: "officiant", text: "Let us bless the Lord. Alleluia, alleluia." },
        { speaker: "people", text: "Thanks be to God. Alleluia, alleluia." },
      ]
    : [
        { speaker: "officiant", text: "Let us bless the Lord." },
        { speaker: "people", text: "Thanks be to God." },
      ];
  slides.push(
    slide(id(), "suffrages", "🔔", "LET US BLESS THE LORD", "", {
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

  // 20. Closing
  slides.push(
    slide(id(), "closing", "🌙", "", "Evening Prayer", {
      metadata: { date: date.toISOString(), office: "evening" },
    }),
  );

  const officeDay: OfficeDayInfo = {
    season: liturgicalDay.season,
    liturgicalYear: liturgicalDay.liturgicalYear,
    sundayLabel: liturgicalDay.sundayLabel,
    weekdayLabel: liturgicalDay.weekdayLabel,
    properNumber: liturgicalDay.properNumber,
    feastName: liturgicalDay.feastName,
    isMajorFeast: liturgicalDay.isMajorFeast,
    useAlleluia: liturgicalDay.useAlleluia,
    totalSlides: slides.length,
  };

  return { slides, officeDay, fromCache: false };
}
