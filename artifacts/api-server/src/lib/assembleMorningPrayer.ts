/**
 * Morning Prayer Assembly Service
 *
 * Assembles the complete 1979 Episcopal BCP Morning Prayer Rite II
 * for a given date as a Slide[] array. Shared daily cache means the
 * first user bears assembly cost; every user after gets it in ~5ms.
 */

import { eq, inArray } from "drizzle-orm";
import {
  db,
  bcpTextsTable,
  morningPrayerCacheTable,
} from "@workspace/db";
import { getOfficeDay } from "./liturgicalCalendar";
import { getCanticles } from "./canticleSelector";
import { getLectionaryReadings } from "./lectionary";
import { bibleGatewayUrl } from "./bibleGatewayUrl";
import {
  parsePsalmRef,
  sliceVersesByRange,
  psalmEyebrow,
  splitPsalmIntoChunks,
} from "./psalmRange";
import { buildIntercessionSlides } from "./assembleIntercessions";
// Lessons render as references only (e.g. "John 2:1-7") — readers
// open scripture in their own bible/app. No scripture-text lookup.

// ── Types ────────────────────────────────────────────────────────────────────

export type SlideType =
  | "opening"
  | "opening_sentence"
  | "confession"
  | "absolution"
  | "invitatory"
  | "invitatory_psalm"
  | "psalm_title"
  | "psalm"
  | "lesson"
  | "canticle"
  | "creed"
  | "lords_prayer"
  | "suffrages"
  | "collect"
  | "prayer_for_mission"
  | "intercessions"
  | "intercessions_portal"
  | "general_thanksgiving"
  | "closing";

export interface CallAndResponseLine {
  speaker: "officiant" | "people" | "both";
  text: string;
}

export interface Slide {
  id: string;
  type: SlideType;
  emoji: string;
  eyebrow: string;
  title: string | null;
  content: string;
  isCallAndResponse: boolean;
  callAndResponseLines: CallAndResponseLine[] | null;
  bcpReference: string | null;
  isScrollable: boolean;
  scrollHint: string | null;
  metadata: Record<string, unknown>;
}

export interface OfficeDayInfo {
  season: string;
  liturgicalYear: number;
  sundayLabel: string;
  weekdayLabel: string;
  properNumber: number | null;
  feastName: string | null;
  isMajorFeast: boolean;
  useAlleluia: boolean;
  totalSlides: number;
}

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
const PRAISE_PSALMS = [
  8, 19, 29, 33, 47, 65, 66, 67, 68, 96, 98, 100, 103, 104, 111, 113, 117,
  135, 136, 145, 146, 147, 148, 149, 150,
];
const LAMENT_PSALMS = [
  6, 13, 22, 31, 38, 42, 44, 51, 55, 74, 77, 79, 80, 85, 86, 88, 90, 102,
  130, 137, 143,
];
const CONFIDENCE_PSALMS = [11, 16, 23, 27, 46, 62, 71, 91, 121, 125, 131];
const THANKSGIVING_PSALMS = [9, 18, 30, 34, 40, 92, 107, 116, 118, 138];
const ROYAL_PSALMS = [2, 20, 21, 45, 72, 89, 101, 110, 132, 144];
const WISDOM_PSALMS = [1, 15, 24, 37, 49, 73, 112, 119, 127, 128, 133];

PRAISE_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "🌟"));
LAMENT_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "💧"));
CONFIDENCE_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "🏔️"));
THANKSGIVING_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "🌾"));
ROYAL_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "👑"));
WISDOM_PSALMS.forEach((n) => (PSALM_EMOJI[n] = "🌿"));

// Body shown on lesson slides. The title carries the reference
// ("1 Thess. 5:12-28"); the body would otherwise repeat that same
// reference, which read as a placeholder. Soft prompt instead.
const LESSON_PROMPT = "Open your Bible, or read this passage online.";

const CANTICLE_EMOJI: Record<string, string> = {
  canticle_8: "🌊",
  canticle_9: "💧",
  canticle_10: "🔍",
  canticle_11: "✨",
  canticle_12: "🌍",
  canticle_13: "🌟",
  canticle_14: "🙏🏽",
  canticle_16: "🌅",
  canticle_18: "🕊️",
  canticle_19: "🌸",
  canticle_20: "✨",
  canticle_21: "🌟",
};

const SEASON_LABELS: Record<string, string> = {
  advent: "Advent 🕯️",
  christmas: "Christmas 🌟",
  epiphany: "Epiphany ✨",
  lent: "Lent 🌿",
  holy_week: "Holy Week ✝️",
  easter: "Eastertide 🌸",
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
    } else {
      // continuation of previous line or standalone
      if (lines.length > 0) {
        lines[lines.length - 1].text += " " + line;
      }
    }
  }
  return lines;
}

/** Pick which opening sentence to use (rotate by day of month) */
function pickOpeningSentenceKey(
  season: string,
  dayOfMonth: number,
): string {
  const seasonMap: Record<string, { prefix: string; count: number }> = {
    advent: { prefix: "opening_sentence_advent_", count: 3 },
    christmas: { prefix: "opening_sentence_christmas_", count: 2 },
    epiphany: { prefix: "opening_sentence_epiphany_", count: 3 },
    lent: { prefix: "opening_sentence_lent_", count: 5 },
    holy_week: { prefix: "opening_sentence_holyweek_", count: 2 },
    easter: { prefix: "opening_sentence_easter_", count: 5 },
    season_after_pentecost: {
      prefix: "opening_sentence_anytime_",
      count: 7,
    },
  };
  const entry = seasonMap[season] ?? { prefix: "opening_sentence_anytime_", count: 7 };
  const index = (dayOfMonth % entry.count) + 1;
  return `${entry.prefix}${index}`;
}

/** Pick which suffrages set to use (A or B, alternate by week) */
function pickSuffragesKey(weekInSeason: number): string {
  return weekInSeason % 2 === 1 ? "suffrages_a" : "suffrages_b";
}

// ── Closing rubric helpers ────────────────────────────────────────────────────
//
// BCP MP p. 102 / EP p. 126: after the Lord's Prayer + Suffrages +
// Collect of the Day + intercessions + General Thanksgiving, the office
// closes with the versicle "Let us bless the Lord. / Thanks be to God."
// (with "Alleluia, alleluia." appended from Easter Day through the Day
// of Pentecost), followed by ONE of three scriptural blessings:
//
//   • 2 Corinthians 13:14 — "The grace of our Lord Jesus Christ…"
//   • Romans 15:13         — "May the God of hope fill us…"
//   • Ephesians 3:20–21    — "Glory to God whose power…"
//
// We rotate the blessing by date-within-year so a daily reader sees all
// three across a typical week. Phoebe is a lay surface, so the wording
// uses "us" (matching the BCP text on p. 102 — these blessings are
// already in first-person plural).

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
  // Day-of-year mod 3 cycles deterministically over the calendar — same
  // blessing for everyone praying on the same date, three-day cadence.
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return CONCLUDING_BLESSINGS[day % CONCLUDING_BLESSINGS.length];
}

// ── Main Assembly ─────────────────────────────────────────────────────────────

export async function assembleMorningPrayer(
  date: Date,
  userId: number,
): Promise<{
  slides: Slide[];
  officeDay: OfficeDayInfo;
  fromCache: boolean;
}> {
  const cacheDate = startOfDay(date);
  const cacheDateStr = cacheDate.toISOString().slice(0, 10);

  // 1. Check cache
  const cached = await db
    .select()
    .from(morningPrayerCacheTable)
    .where(eq(morningPrayerCacheTable.cacheDate, cacheDateStr))
    .limit(1);

  if (cached.length > 0) {
    const row = cached[0];
    const cachedSlides = row.slidesJson as Slide[];
    // Splice the per-user intercessions slide in BEFORE general
    // thanksgiving — the cached slides don't include it (caching it
    // would cross-contaminate users with each other's prayer lists).
    const slides = await injectIntercessions(cachedSlides, userId, cacheDate);
    // Derive officeDay fresh from the date instead of fishing fields
    // out of slide[0]'s metadata. The cached opening slide is gone now
    // (the office begins with the Opening Sentence), so the metadata
    // carrier is gone too — but `getOfficeDay(date)` is deterministic
    // and cheap, so we just recompute on every cache hit and trust it.
    const liturgicalDay = getOfficeDay(date);
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
    return { slides, officeDay, fromCache: true };
  }

  // 2. Assemble
  const liturgicalDay = getOfficeDay(date);
  const { psalms, lesson1, lesson2 } = getLectionaryReadings(liturgicalDay);
  const { afterOT, afterNT } = getCanticles(liturgicalDay);

  // Determine text keys needed
  const openingSentenceKey = pickOpeningSentenceKey(
    liturgicalDay.season,
    date.getDate(),
  );

  let invitPsalmKey: string;
  if (liturgicalDay.invitatorySeason === "easter") {
    invitPsalmKey = "pascha_nostrum";
  } else if (
    liturgicalDay.invitatorySeason === "lent" ||
    liturgicalDay.invitatorySeason === "holy_week"
  ) {
    invitPsalmKey = "jubilate";
  } else {
    invitPsalmKey = "venite";
  }

  const suffragesKey = pickSuffragesKey(liturgicalDay.weekInSeason);
  const keysNeeded = [
    openingSentenceKey,
    "confession_text",
    "confession_absolution",
    invitPsalmKey,
    liturgicalDay.antiphonKey,
    afterOT,
    afterNT,
    "apostles_creed",
    "lords_prayer_contemporary",
    suffragesKey,
    liturgicalDay.collectKey,
    "general_thanksgiving",
  ];

  // Parse appointed psalms — we keep both the bare number (used to
  // look up the seeded psalm row) and the optional verse range, so
  // partial-psalm appointments like "119:1-24" or "37:19-42" can be
  // sliced down before rendering rather than dumping all 176 verses.
  const appointedPsalms = psalms
    .map(parsePsalmRef)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  const psalmKeys = [
    ...new Set([
      invitPsalmKey === "venite"
        ? "psalm_95"
        : invitPsalmKey === "jubilate"
          ? "psalm_100"
          : null,
      ...appointedPsalms.map((p) => `psalm_${p.number}`),
    ].filter(Boolean)),
  ] as string[];

  // Fetch BCP texts (collects, canticles, psalms, etc.). Lessons are
  // rendered as references only — no Bible-text fetch here.
  const [bcpRows, psalmRows] = await Promise.all([
    db
      .select()
      .from(bcpTextsTable)
      .where(inArray(bcpTextsTable.textKey, keysNeeded)),
    db
      .select()
      .from(bcpTextsTable)
      .where(inArray(bcpTextsTable.textKey, psalmKeys)),
  ]);

  // Build lookup map
  const texts: Record<string, { content: string; title: string; bcpReference: string | null; metadata: Record<string, unknown> }> = {};
  for (const row of [...bcpRows, ...psalmRows]) {
    texts[row.textKey] = {
      content: row.content,
      title: row.title,
      bcpReference: row.bcpReference ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
    };
  }

  function getText(key: string): string {
    return texts[key]?.content ?? `[${key} — see BCP]`;
  }

  // ── Build slide array ──────────────────────────────────────────────────────

  const slides: Slide[] = [];
  let idx = 0;
  const id = () => `slide_${idx++}`;

  // SLIDE 1: Opening Sentence (the Opening Acclamation slot per user
  // direction). The earlier first slide was a Phoebe-specific date
  // label ("Wednesday in 4 Easter") — that information already lives
  // in the chrome's reference label, so the office begins with the
  // BCP's actual first element: the seasonal Opening Sentence.
  slides.push(
    slide(id(), "opening_sentence", "📖", "OPENING SENTENCE", getText(openingSentenceKey), {
      bcpReference: "BCP p. 75",
    }),
  );

  // SLIDE 3: Confession + Absolution (one slide). The two BCP
  // beats read as one liturgical motion — confess, then receive
  // forgiveness — and splitting them into two cards added a tap
  // between them that broke the rhythm. Joined with a blank line
  // so the renderer's pre-wrap paragraph keeps the visual break.
  const confessionPlusAbsolution =
    getText("confession_text").trimEnd()
    + "\n\n"
    + getText("confession_absolution").trimStart();
  slides.push(
    slide(id(), "confession", "🙏🏽", "CONFESSION OF SIN", confessionPlusAbsolution, {
      bcpReference: "BCP p. 79",
      metadata: { prompt: "Pause. Bring what you carry. 🌿" },
    }),
  );

  // SLIDE 5: Invitatory versicle
  const invitatoryLines: CallAndResponseLine[] = [
    { speaker: "officiant", text: "Lord, open our lips." },
    { speaker: "people", text: "And our mouth shall proclaim your praise." },
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
      bcpReference: "BCP p. 80",
    }),
  );

  // SLIDE 6: Invitatory Psalm (with seasonal antiphon bookending it
  // when present). Per user direction the antiphon no longer gets its
  // own slide; instead it appears at the top of the invitatory psalm
  // slide (said before the psalm) and again at the bottom (said
  // after), matching the BCP rubric on p. 80 ("the Antiphon may be
  // sung or said before, and after, the Invitatory Psalm").
  const invitPsalmTitles: Record<string, string> = {
    venite: "VENITE · PSALM 95",
    jubilate: "JUBILATE · PSALM 100",
    pascha_nostrum: "PASCHA NOSTRUM",
  };
  const invitPsalmRefs: Record<string, string> = {
    venite: "BCP p. 82",
    jubilate: "BCP p. 82",
    pascha_nostrum: "BCP p. 83",
  };

  // antiphon_none seeds an empty content; the placeholder check also
  // catches missed-seed cases ("[antiphon_xxx — see BCP]").
  const antiphonText = getText(liturgicalDay.antiphonKey);
  const hasAntiphon = !!antiphonText && antiphonText.trim().length > 0 && !antiphonText.startsWith("[");
  const psalmBody = getText(invitPsalmKey);
  const invitPsalmContent = hasAntiphon
    ? `${antiphonText}\n\n${psalmBody}\n\n${antiphonText}`
    : psalmBody;

  slides.push(
    slide(id(), "invitatory_psalm", "🎶", invitPsalmTitles[invitPsalmKey] ?? "VENITE", invitPsalmContent, {
      bcpReference: invitPsalmRefs[invitPsalmKey] ?? "BCP p. 82",
      isScrollable: true,
      scrollHint: "↓ continue · tap when ready",
    }),
  );

  // SLIDES 7+: Appointed Psalms
  const gloriaPatri =
    "\nGlory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";

  for (const psalmRef of appointedPsalms) {
    const { number: psalmNum, range } = psalmRef;
    const psalmKey = `psalm_${psalmNum}`;
    const psalmData = texts[psalmKey];
    // Slice the seeded full psalm down to the appointed verse range
    // (when one is given). The Gloria Patri is appended to the LAST
    // chunk only (see chunk loop below), so a partial reading still
    // closes with the doxology like the full psalm would.
    const sliced =
      psalmData && range
        ? sliceVersesByRange(psalmData.content, range)
        : psalmData?.content;
    const eyebrow = psalmEyebrow(psalmRef);

    // Title slide — mirrors the intercessions_portal pattern. Renders
    // as a single big "Psalm 72" / "Psalm 119:73-96" headline so the
    // reader can settle into the psalm before the verses start. The
    // client recognises this type and renders title-only.
    slides.push(
      slide(id(), "psalm_title", PSALM_EMOJI[psalmNum] ?? "📖", eyebrow, "", {
        title: psalmData?.title ?? null,
        isScrollable: false,
        scrollHint: null,
        metadata: {
          psalmNumber: psalmNum,
          psalmRange: range,
          psalmRef: psalmRef.raw,
        },
      }),
    );

    // Verse chunks — 4 verses per slide, centered vertically. The
    // Gloria Patri is appended to whichever chunk lands last so the
    // doxology still closes the psalm.
    if (sliced) {
      const chunks = splitPsalmIntoChunks(sliced, 4);
      const lastIdx = chunks.length - 1;
      chunks.forEach((chunk, i) => {
        const content = i === lastIdx ? chunk + gloriaPatri : chunk;
        slides.push(
          slide(id(), "psalm", PSALM_EMOJI[psalmNum] ?? "📖", eyebrow, content, {
            title: psalmData?.title ?? null,
            isScrollable: false,
            scrollHint: null,
            metadata: {
              ...(psalmData?.metadata ?? {}),
              psalmNumber: psalmNum,
              psalmRange: range,
              psalmRef: psalmRef.raw,
              psalmChunkIndex: i,
              psalmChunkTotal: chunks.length,
            },
          }),
        );
      });
    } else {
      // Psalm row missing — single placeholder slide.
      slides.push(
        slide(
          id(),
          "psalm",
          PSALM_EMOJI[psalmNum] ?? "📖",
          eyebrow,
          `[Psalm ${psalmRef.raw} — see BCP Psalter]${gloriaPatri}`,
          {
            title: psalmData?.title ?? null,
            isScrollable: false,
            scrollHint: null,
            metadata: {
              psalmNumber: psalmNum,
              psalmRange: range,
              psalmRef: psalmRef.raw,
            },
          },
        ),
      );
    }
  }

  // BCP marks empty lesson slots with dashes ("----------") on major
  // feasts where only some readings are appointed (e.g. Easter Day
  // Y2 has the OT + Gospel but no Epistle). Treat dashes / blanks as
  // "no lesson today" and skip the slide rather than rendering a
  // broken "SECOND LESSON" titled "----------".
  const isLessonPresent = (l: string | null | undefined): boolean =>
    !!l && l.trim().length > 0 && !/^-+$/.test(l.trim());

  // First Lesson — OT. Title is the reference (e.g. "Isa. 55:1-11");
  // body is a soft prompt to open the passage rather than echoing
  // the same reference again. Phoebe doesn't ship scripture text —
  // readers go to their own bible/app.
  if (isLessonPresent(lesson1)) {
    slides.push(
      slide(id(), "lesson", "📜", "FIRST LESSON", LESSON_PROMPT, {
        title: lesson1,
        isScrollable: false,
        scrollHint: null,
        metadata: { reference: lesson1, readUrl: bibleGatewayUrl(lesson1) },
      }),
    );
  }

  // Canticle after OT.
  const afterOTData = texts[afterOT];
  slides.push(
    slide(
      id(),
      "canticle",
      CANTICLE_EMOJI[afterOT] ?? "🌟",
      `CANTICLE · ${(afterOTData?.title ?? afterOT).toUpperCase()}`,
      getText(afterOT),
      {
        bcpReference: afterOTData?.bcpReference ?? null,
      },
    ),
  );

  // Second Lesson — Epistle (the new layout: MP shows OT + Epistle,
  // EP shows Gospel only). Skipped on feast days where the BCP
  // appoints no Epistle at MP.
  if (isLessonPresent(lesson2)) {
    slides.push(
      slide(id(), "lesson", "✉️", "SECOND LESSON", LESSON_PROMPT, {
        title: lesson2,
        isScrollable: false,
        scrollHint: null,
        metadata: { reference: lesson2, readUrl: bibleGatewayUrl(lesson2) },
      }),
    );
  }

  // Canticle after NT
  const afterNTData = texts[afterNT];
  slides.push(
    slide(
      id(),
      "canticle",
      CANTICLE_EMOJI[afterNT] ?? "🌟",
      `CANTICLE · ${(afterNTData?.title ?? afterNT).toUpperCase()}`,
      getText(afterNT),
      {
        bcpReference: afterNTData?.bcpReference ?? null,
      },
    ),
  );

  // Creed
  slides.push(
    slide(id(), "creed", "✝️", "THE APOSTLES' CREED", getText("apostles_creed"), {
      bcpReference: "BCP p. 96",
      metadata: { prompt: "We say together what we believe." },
    }),
  );

  // Lord's Prayer
  slides.push(
    slide(id(), "lords_prayer", "🙏🏽", "THE LORD'S PRAYER", getText("lords_prayer_contemporary"), {
      bcpReference: "BCP p. 97",
    }),
  );

  // Suffrages
  const suffrageText = getText(suffragesKey);
  const suffrageLabel = suffragesKey === "suffrages_a" ? "A" : "B";
  slides.push(
    slide(id(), "suffrages", "🕊️", `THE PRAYERS · SUFFRAGES ${suffrageLabel}`, suffrageText, {
      bcpReference: "BCP p. 97",
      isCallAndResponse: true,
      callAndResponseLines: parseSuffrages(suffrageText),
    }),
  );

  // Collect of the Day — the single closing collect. The BCP allows
  // additional collects ("A Collect for Grace", "A Prayer for
  // Mission", etc.) at this point in the office, but per user
  // direction Phoebe surfaces only the proper Collect of the Day so
  // the office stays a single, focused closing prayer.
  const collectData = texts[liturgicalDay.collectKey];
  slides.push(
    slide(id(), "collect", "📅", "COLLECT OF THE DAY", getText(liturgicalDay.collectKey), {
      title: liturgicalDay.sundayLabel,
      bcpReference: collectData?.bcpReference ?? "BCP p. 211",
    }),
  );

  // General Thanksgiving
  slides.push(
    slide(id(), "general_thanksgiving", "🌾", "THE GENERAL THANKSGIVING", getText("general_thanksgiving"), {
      bcpReference: "BCP p. 101",
      metadata: { prompt: "This is often said aloud together." },
    }),
  );

  // Concluding versicle — "Let us bless the Lord. / Thanks be to God."
  // From Easter Day through the Day of Pentecost the BCP appends
  // "Alleluia, alleluia." to both lines; the season's `useAlleluia`
  // flag matches that window.
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
      bcpReference: "BCP p. 102",
    }),
  );

  // Concluding blessing — one of three scriptural blessings (BCP p.
  // 102), rotated by date so a daily reader hears all three across a
  // typical week. Phoebe is a lay surface — the blessings are already
  // in first-person plural, so no pronoun substitution needed.
  const blessing = pickConcludingBlessing(date);
  slides.push(
    slide(id(), "collect", "🙏🏽", "A CONCLUDING BLESSING", blessing.text, {
      title: blessing.ref,
      bcpReference: "BCP p. 102",
    }),
  );

  // (Closing slide removed — the trailing "CLOSING / Morning
  // Prayer" beat just echoed the top bar and made the user tap one
  // more empty card to finish. The General Thanksgiving / final
  // blessing now closes the office; the bottom pill's "Done" button
  // signals the end.)

  // 3. Cache result — store WITHOUT the intercessions slide, since
  //    that slide is per-user. We splice the user's intercessions in
  //    after caching, so cache hits and cache misses both end up with
  //    the canonical liturgy + the requesting user's named asks.
  try {
    await db
      .insert(morningPrayerCacheTable)
      .values({
        cacheDate: cacheDateStr,
        liturgicalYear: liturgicalDay.liturgicalYear,
        liturgicalSeason: liturgicalDay.season,
        properNumber: liturgicalDay.properNumber,
        feastName: liturgicalDay.feastName,
        slidesJson: slides as unknown as Record<string, unknown>[],
        assembledByUserId: userId,
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("Failed to cache morning prayer:", err);
  }

  // Per-user intercessions slide — built fresh, never cached.
  const slidesWithIntercessions = await injectIntercessions(slides, userId, cacheDate);

  const officeDay: OfficeDayInfo = {
    season: liturgicalDay.season,
    liturgicalYear: liturgicalDay.liturgicalYear,
    sundayLabel: liturgicalDay.sundayLabel,
    weekdayLabel: liturgicalDay.weekdayLabel,
    properNumber: liturgicalDay.properNumber,
    feastName: liturgicalDay.feastName,
    isMajorFeast: liturgicalDay.isMajorFeast,
    useAlleluia: liturgicalDay.useAlleluia,
    totalSlides: slidesWithIntercessions.length,
  };

  return { slides: slidesWithIntercessions, officeDay, fromCache: false };
}

// Inject the intercessions slide into a slide array between Prayer for
// Mission and General Thanksgiving. Used by both the cache-hit path
// and the post-assembly path so callers don't have to think about
// where to splice. If the helper returns null (no intercessions to
// surface for this user) the original array is returned unchanged.
async function injectIntercessions(
  slides: Slide[],
  userId: number,
  cacheDate: Date,
): Promise<Slide[]> {
  // The office no longer renders per-person intercession slides
  // inline. When the user reaches this point, we hand off to the
  // /prayer-mode slideshow (so Daily Office and personal prayer
  // share one rhythm) and return to the office for the General
  // Thanksgiving + final blessing afterward. The handoff is driven
  // by a single placeholder slide (type "intercessions_portal");
  // the client redirects when it lands on that slide. We still
  // build the intercession list to know whether there's anything
  // to pray for — if not, we skip the portal entirely so an empty
  // prayer-mode session doesn't pop up.
  const intercessionSlides = await buildIntercessionSlides(userId, cacheDate);
  if (intercessionSlides.length === 0) return slides;
  const portalSlide: Slide = {
    id: "intercessions_portal",
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
    metadata: { intercessionCount: intercessionSlides.length },
  };
  // Splice immediately before the first general_thanksgiving slide.
  // Mirrors the original BCP rubric ("Authorized intercessions and
  // thanksgivings may follow" before the General Thanksgiving). If
  // general_thanksgiving is missing, append before "closing"; if
  // both are missing, append at the end.
  const insertBefore = slides.findIndex(s =>
    s.type === "general_thanksgiving" || s.type === "closing"
  );
  if (insertBefore === -1) return [...slides, portalSlide];
  return [
    ...slides.slice(0, insertBefore),
    portalSlide,
    ...slides.slice(insertBefore),
  ];
}
