/**
 * Morning Prayer Assembly Service
 *
 * Assembles the complete 1979 Episcopal BCP Morning Prayer Rite II
 * for a given date as a Slide[] array. Shared daily cache means the
 * first user bears assembly cost; every user after gets it in ~5ms.
 */

import { eq, inArray } from "drizzle-orm";
import { OFFICE_CACHE_SCHEMA_VERSION, cachedSchemaVersion, stampSchemaVersion } from "./officeCacheVersion";
import { expandKeysForRite, riteKeyCandidates, type Rite } from "./officeRite";
import {
  db,
  bcpTextsTable,
  morningPrayerCacheTable,
  usersTable,
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
  splitCanticleIntoChunks,
} from "./psalmRange";
import { buildIntercessionSlides } from "./assembleIntercessions";
import { buildLessonSlides } from "./assembleLesson";
import { EYEBROWS, PRAYERS, TITLES, pick, type Locale } from "./officeI18n";
// Lessons render as references only (e.g. "John 2:1-7") — readers
// open scripture in their own bible/app. No scripture-text lookup.

// ── Types ────────────────────────────────────────────────────────────────────

export type SlideType =
  // Intro / threshold slide shown before the office begins.
  // (A Forward Day by Day audio meditation used to be injected here as a
  // "fdd_meditation" slide before the Creed. It was dropped — the daily
  // reflection is no longer an in-office slide; FDD lives in the "Listen"
  // read-along and as a post-office reflection pill instead.)
  | "office_intro"
  | "opening"
  | "opening_sentence"
  | "confession"
  | "absolution"
  | "invitatory"
  | "invitatory_psalm"
  | "psalm_title"
  | "psalm"
  | "psalm_gloria"
  // Antiphon on its own slide — the antiphon appointed "with the Invitatory
  // Psalm" (BCP p. 80) is now a standalone slide before AND after the
  // psalm body, with the Gloria sitting between the verses and the closing
  // antiphon so the doxology seals the psalm before the antiphon repeats.
  | "antiphon"
  | "lesson"
  // Title slide for a lesson — big "Romans 14:1-12" headline +
  // "The First Lesson Appointed For This Morning" subtitle. Mirrors
  // the psalm_title pattern; the verses follow on lesson_verses slides.
  | "lesson_title"
  // Chunked numbered-verse slide for a lesson, matching the psalm
  // verse layout — verse number on the left, body on the right.
  | "lesson_verses"
  | "canticle_title"
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

// Map bcp_texts text_keys → PRAYERS i18n keys. When locale=es the
// MP / EP assemblers look up the Spanish translation here instead of
// fetching from bcp_texts, which is English-only today. Any key not
// in this map keeps using bcp_texts (so the Psalter, canticles,
// collects of the day, and opening sentences fall through to their
// seeded English content until a future Spanish seed pass).
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
  // Canticles — the most-prayed ones get Spanish text. Anything not
  // listed here falls back to the English bcp_texts row (8+ canticle
  // rows are seeded; only the ones below have LOC translations
  // available so far).
  canticle_15: "canticle_15",
  canticle_16: "canticle_16",
  canticle_18: "canticle_18",
  canticle_19: "canticle_19",
  canticle_20: "canticle_20",
  canticle_21: "canticle_21",
  // Opening sentences — coverage of the most-cited per season. Other
  // seeded sentences (~30 rows) keep their English content until a
  // dedicated Spanish seed pass lands.
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

// Push a canticle onto the slide list — single slide if it's short
// enough (≤4 verses), otherwise a "Canticle N" title slide followed
// by 4-verse chunked verse slides. Same shape as the psalm chunking
// so the UI rhythm reads as one pattern across the office.
function pushCanticle(
  slidesArr: Slide[],
  args: {
    id: () => string;
    canticleKey: string;
    text: string;
    emoji: string;
    title: string | null;
    bcpReference: string | null;
  },
): void {
  const { id, canticleKey, text, emoji, title, bcpReference } = args;
  const eyebrow = `CANTICLE · ${(title ?? canticleKey).toUpperCase()}`;
  const numMatch = canticleKey.match(/canticle_(\d+)/);
  const headlineNum = numMatch ? `Canticle ${numMatch[1]}` : (title ?? "Canticle");

  const { verses, chunks } = splitCanticleIntoChunks(text, 4);

  // Every canticle — short or long — opens with its "Canticle N"
  // title slide so the rhythm matches the psalm title slides. (It
  // used to be emitted only for long canticles, which meant a short
  // second canticle jumped straight into its verses with no title.)
  slidesArr.push(
    slide(id(), "canticle_title", emoji, eyebrow, "", {
      title,
      bcpReference,
      isScrollable: false,
      scrollHint: null,
      metadata: { canticleKey, canticleHeadline: headlineNum },
    }),
  );

  if (verses <= 4) {
    // Short canticle — single body slide after the title.
    slidesArr.push(
      slide(id(), "canticle", emoji, eyebrow, text, {
        title,
        bcpReference,
      }),
    );
    return;
  }

  // Long canticle: verse-chunk slides after the title.
  chunks.forEach((chunk, i) => {
    slidesArr.push(
      slide(id(), "canticle", emoji, eyebrow, chunk, {
        title,
        bcpReference,
        isScrollable: false,
        scrollHint: null,
        metadata: {
          canticleKey,
          canticleChunkIndex: i,
          canticleChunkTotal: chunks.length,
        },
      }),
    );
  });
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
export function pickSuffragesKey(weekInSeason: number): string {
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

export const CONCLUDING_BLESSINGS: Array<{ ref: string; text: string }> = [
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

// Prayer for Mission — BCP MP pp. 100–101 appoints three options.
// Phoebe rotates between them by day-of-year so a daily reader hears all
// three across a typical week (same cadence as the concluding blessing).
const MP_PRAYER_FOR_MISSION_KEYS = ["prayer_mission_1", "prayer_mission_2", "prayer_mission_3"];
export function pickPrayerForMissionKey(date: Date): string {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86_400_000);
  return MP_PRAYER_FOR_MISSION_KEYS[day % MP_PRAYER_FOR_MISSION_KEYS.length];
}

// ── Invitatory rotation ─────────────────────────────────────────────────────────
//
// BCP 1979, Morning Prayer Rite II (pp. 80-83): after "Lord, open our
// lips" the office uses "one of the Invitatory Psalms, Venite or
// Jubilate." In Easter Week the Pascha Nostrum ("Christ our Passover")
// is said *in place of* an Invitatory Psalm, and it "may also be used
// daily until the Day of Pentecost."
//
// The old logic pinned exactly ONE invitatory per season — Pascha
// Nostrum every single day of Eastertide, but ALSO Jubilate every day
// of Lent and Venite every other day of the year, so the Venite and
// Jubilate never rotated at all. Now:
//
//   • All of Eastertide (Easter Day → the Day of Pentecost): Pascha
//     Nostrum, "Christ our Passover." The rubric requires it in Easter
//     Week (it stands in place of the Invitatory Psalm) and says it
//     "may also be used daily until the Day of Pentecost" — by product
//     direction we keep it the whole season so Easter reads as Easter.
//   • Every other day of the year: rotate Venite / Jubilate. The BCP
//     leaves this choice free ("one of the Invitatory Psalms, Venite or
//     Jubilate"), so we alternate deterministically by day-of-year —
//     the same for everyone praying a given date, and cache-safe.
//
// If the day's own appointed psalm already IS Psalm 95 (Venite) or 100
// (Jubilate), that option drops out so the office never prays the same
// psalm twice in one sitting.
export type InvitatoryKey = "venite" | "jubilate" | "pascha_nostrum";

export function pickInvitatoryKey(
  liturgicalDay: { season: string },
  date: Date,
  appointedPsalmNumbers: number[],
): InvitatoryKey {
  // All of Eastertide — Pascha Nostrum.
  if (liturgicalDay.season === "easter") {
    return "pascha_nostrum";
  }

  // Every other season: rotate Venite / Jubilate.
  let pool: InvitatoryKey[] = ["venite", "jubilate"];

  // Don't double up on a psalm already appointed for the day.
  if (appointedPsalmNumbers.includes(95)) pool = pool.filter((k) => k !== "venite");
  if (appointedPsalmNumbers.includes(100)) pool = pool.filter((k) => k !== "jubilate");
  if (pool.length === 0) pool = ["venite"]; // both appointed (vanishingly rare) — fall back

  // Day-of-year rotation — same cadence + math as pickConcludingBlessing.
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86_400_000);
  return pool[dayOfYear % pool.length];
}

// ── Main Assembly ─────────────────────────────────────────────────────────────

export async function assembleMorningPrayer(
  date: Date,
  userId: number,
  locale: Locale = "en",
  confessionOverride?: boolean,
  /** Rite I / Rite II. Inert until content exists — see lib/officeRite.ts. */
  rite: Rite = "II",
): Promise<{
  slides: Slide[];
  officeDay: OfficeDayInfo;
  fromCache: boolean;
}> {
  const cacheDate = startOfDay(date);
  const cacheDateStr = cacheDate.toISOString().slice(0, 10);
  // Cache is keyed by the morning_prayer_cache.cache_date DATE column
  // — Postgres DATE can't accept a "_es"-suffixed string, so we can't
  // smuggle the locale into the key without a schema change. Until a
  // compound unique on (cache_date, locale) lands, skip the cache
  // entirely for non-English locales: re-assemble on every request
  // for those users (correct, just slower than English; no emergency
  // fallback). English is unchanged — same cache hits, same speed.
  //
  // RITE is the same problem with the same answer. A Rite I office and a Rite
  // II office on the same DATE would collide on that one-column key and serve
  // each other's text — a far worse failure than a slow assembly — so Rite I
  // skips the cache too until that compound key lands. (Rite II is unchanged:
  // same cache hits, same speed, which is everyone today.)
  const cacheEnabled = locale === "en" && rite === "II";

  // 1. Check cache
  const cached = cacheEnabled
    ? await db
        .select()
        .from(morningPrayerCacheTable)
        .where(eq(morningPrayerCacheTable.cacheDate, cacheDateStr))
        .limit(1)
    : [];

  if (cached.length > 0) {
    const row = cached[0];
    const cachedSlides = row.slidesJson as Slide[];
    // A row whose STRUCTURE predates the current schema — fall through to a
    // fresh assembly instead of serving it. See officeCacheVersion.ts.
    if (cachedSchemaVersion(cachedSlides) === OFFICE_CACHE_SCHEMA_VERSION) {
      // Splice the per-user intercessions slide in BEFORE general
      // thanksgiving — the cached slides don't include it (caching it
      // would cross-contaminate users with each other's prayer lists).
      const withIntercessions = await injectIntercessions(cachedSlides, userId, cacheDate);
      // Per-user: hide the Confession + Absolution unless the user opted in.
      const slides = await applyConfessionPref(withIntercessions, userId, confessionOverride);
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
  }

  // 2. Assemble
  const liturgicalDay = getOfficeDay(date);
  const { psalms, lesson1, lesson2, lesson3 } = getLectionaryReadings(liturgicalDay);
  const { afterOT, afterNT } = getCanticles(liturgicalDay);

  // Parse appointed psalms up front — we keep both the bare number
  // (used to look up the seeded psalm row) and the optional verse
  // range, so partial appointments like "119:1-24" or "37:19-42" can
  // be sliced down before rendering. The invitatory picker also reads
  // the numbers to avoid doubling a psalm already appointed today.
  const appointedPsalms = psalms
    .map(parsePsalmRef)
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Determine text keys needed
  const openingSentenceKey = pickOpeningSentenceKey(
    liturgicalDay.season,
    date.getDate(),
  );

  const invitPsalmKey = pickInvitatoryKey(
    liturgicalDay,
    date,
    appointedPsalms.map((p) => p.number),
  );

  const suffragesKey = pickSuffragesKey(liturgicalDay.weekInSeason);
  const prayerForMissionKey = pickPrayerForMissionKey(date);
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
    prayerForMissionKey,
    "general_thanksgiving",
  ];

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
      // Rite I variants ride along in the SAME query as the Rite II keys, so
      // localized()'s fallback resolves without a second round trip.
      .where(inArray(bcpTextsTable.textKey, expandKeysForRite(keysNeeded, rite))),
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

  // Locale-aware override for embedded prayers. When locale=es we
  // serve the Spanish constant from officeI18n (sourced from El
  // Libro de Oración Común); otherwise the existing bcp_texts lookup
  // is unchanged. Psalter / canticles / collects of the day / opening
  // sentences stay on bcp_texts in either locale — those rows are
  // English-only today; a Spanish seed pass will add Spanish bodies.
  function localized(key: string): string {
    // RITE first: a Rite I variant, where one has been seeded, wins over the
    // Rite II original. Falls through to the locale logic below when there
    // isn't one, so an unseeded Rite I text renders contemporary rather than
    // as a missing-text placeholder — see lib/officeRite.ts on why that
    // fallback is what makes the content shippable one category at a time.
    if (rite === "I") {
      for (const candidate of riteKeyCandidates(key, rite)) {
        if (texts[candidate]?.content) return texts[candidate]!.content;
      }
    }
    if (locale !== "es") return getText(key);
    const esKey = SPANISH_OVERRIDES[key];
    if (esKey) return pick(locale, PRAYERS[esKey]);
    return getText(key);
  }

  // ── Build slide array ──────────────────────────────────────────────────────

  const slides: Slide[] = [];
  let idx = 0;
  const id = () => `slide_${idx++}`;

  // SLIDE 0: Office intro — names the liturgy and the tradition it
  // belongs to, so the user crosses a threshold before the opening
  // sentence rather than landing cold in the middle of a rite.
  slides.push(
    slide(
      id(),
      "office_intro",
      "🕊️",
      locale === "es" ? "Antes de comenzar" : "Before you begin",
      locale === "es"
        ? "Por siglos la Iglesia ha rezado el Oficio Diario — salmos, Escritura y oración en las bisagras de la mañana y de la tarde. Monjes y laicos por igual han guardado este ritmo, dejando que un patrón fijo dé estabilidad a los días corrientes. Te unes a una oración que la Iglesia nunca ha dejado de rezar."
        : "For centuries the Church has prayed the Daily Office — psalms, Scripture, and prayer at the hinges of the morning and evening. Monks and laypeople alike have kept this rhythm, letting a fixed pattern bring stability to ordinary days. You are joining a prayer the Church has never stopped praying.",
      { title: pick(locale, TITLES.morning_prayer) },
    ),
  );

  // SLIDE 1: Opening Sentence (the Opening Acclamation slot per user
  // direction). The earlier first slide was a Phoebe-specific date
  // label ("Wednesday in 4 Easter") — that information already lives
  // in the chrome's reference label, so the office begins with the
  // BCP's actual first element: the seasonal Opening Sentence.
  slides.push(
    slide(id(), "opening_sentence", "📖", pick(locale, EYEBROWS.opening_sentence), localized(openingSentenceKey), {
      bcpReference: "BCP p. 75",
    }),
  );

  // SLIDE 3: Confession, then SLIDE 4: Absolution — two slides.
  // The confession is the people's prayer; the absolution is the
  // priest's declaration of forgiveness in reply. Per user direction
  // they're separate cards so each beat lands on its own.
  slides.push(
    slide(id(), "confession", "🙏🏽", pick(locale, EYEBROWS.confession_of_sin), localized("confession_text").trim(), {
      bcpReference: "BCP p. 79",
      metadata: { prompt: locale === "es" ? "Pausa. Trae lo que llevas. 🌿" : "Pause. Bring what you carry. 🌿" },
    }),
  );
  slides.push(
    slide(id(), "absolution", "🕊️", pick(locale, EYEBROWS.absolution), localized("confession_absolution").trim(), {
      bcpReference: "BCP p. 80",
    }),
  );

  // SLIDE 5: Invitatory versicle
  const invitatoryLines: CallAndResponseLine[] = [
    { speaker: "officiant", text: pick(locale, PRAYERS.versicle_open_lips_off) },
    { speaker: "people", text: pick(locale, PRAYERS.versicle_open_lips_peo) },
    { speaker: "both", text: pick(locale, PRAYERS.gloria_patri) },
  ];
  if (liturgicalDay.useAlleluia) {
    invitatoryLines.push({ speaker: "both", text: pick(locale, PRAYERS.alleluia) });
  }

  slides.push(
    slide(id(), "invitatory", "🔔", pick(locale, EYEBROWS.invitatory), "", {
      isCallAndResponse: true,
      callAndResponseLines: invitatoryLines,
      bcpReference: "BCP p. 80",
    }),
  );

  // SLIDES 6+: Invitatory Psalm — title slide + 4-verse chunked verse
  // slides, matching the appointed-psalm treatment introduced in commit
  // e4eb38f. The seasonal antiphon (when present) bookends the verses
  // per BCP rubric p. 80 ("the Antiphon may be sung or said before,
  // and after, the Invitatory Psalm"): we prepend it to the first
  // chunk and append it to the last so the reader gets it at both
  // ends without needing a separate slide.
  // Section title / eyebrow = the PSALM NUMBER, not the Latin name (the
  // Latin "Venite" / "Jubilate" still leads the big headline below). Pascha
  // Nostrum is a set of anthems, not a numbered psalm, so it keeps its name.
  const invitPsalmEyebrows: Record<string, string> = {
    venite: "PSALM 95",
    jubilate: "PSALM 100",
    pascha_nostrum: "PASCHA NOSTRUM",
  };
  const invitPsalmHeadlines: Record<string, string> = {
    venite: "Venite",
    jubilate: "Jubilate",
    pascha_nostrum: "Pascha Nostrum",
  };
  const invitPsalmRefs: Record<string, string> = {
    venite: "BCP p. 82",
    jubilate: "BCP p. 82",
    pascha_nostrum: "BCP p. 83",
  };

  // antiphon_none seeds an empty content; the placeholder check also
  // catches missed-seed cases ("[antiphon_xxx — see BCP]"). The antiphon
  // is appointed "with the Invitatory Psalm" (BCP p. 80) — Venite or
  // Jubilate — so it's suppressed for Pascha Nostrum, which is a set of
  // anthems carrying its own alleluias, not a psalm that takes one.
  const antiphonText = getText(liturgicalDay.antiphonKey);
  const hasAntiphon =
    invitPsalmKey !== "pascha_nostrum" &&
    !!antiphonText &&
    antiphonText.trim().length > 0 &&
    !antiphonText.startsWith("[");
  const psalmBody = getText(invitPsalmKey);
  const invitEyebrow = invitPsalmEyebrows[invitPsalmKey] ?? "PSALM 95";
  const invitHeadline = invitPsalmHeadlines[invitPsalmKey] ?? "Venite";
  const invitBcpRef = invitPsalmRefs[invitPsalmKey] ?? "BCP p. 82";

  // Title slide — big "Venite" / "Jubilate" / "Pascha Nostrum"
  // headline, mirrors the psalm_title pattern. The renderer reads
  // metadata.invitatory to swap the subtitle from "The Psalm Appointed
  // …" to "The Invitatory Psalm".
  slides.push(
    slide(id(), "psalm_title", "🎶", invitEyebrow, "", {
      bcpReference: invitBcpRef,
      isScrollable: false,
      scrollHint: null,
      metadata: {
        invitatory: true,
        invitPsalmKey,
        psalmHeadline: invitHeadline,
      },
    }),
  );

  // Opening antiphon — its own slide BEFORE the verses, per BCP rubric
  // p. 80. Standalone so the verses read clean (no "ANTIPHON" header
  // riding above the first chunk) and the rhythm reads: antiphon → psalm
  // verses → Gloria → antiphon.
  if (hasAntiphon) {
    slides.push(
      slide(id(), "antiphon", "🎶", pick(locale, EYEBROWS.antiphon), antiphonText, {
        bcpReference: invitBcpRef,
        isScrollable: false,
        scrollHint: null,
        metadata: { invitatory: true, invitPsalmKey, antiphonPosition: "open" },
      }),
    );
  }

  // Chunk the body. Invitatory text in bcp_texts uses canticle-shape
  // (no numeric verse markers — non-indented line + indented
  // continuation), so splitCanticleIntoChunks is the right splitter.
  // 4 verses per chunk matches the appointed-psalm cadence.
  const { chunks: invitChunks } = splitCanticleIntoChunks(psalmBody, 4);
  invitChunks.forEach((chunk, i) => {
    slides.push(
      slide(id(), "invitatory_psalm", "🎶", invitEyebrow, chunk, {
        bcpReference: invitBcpRef,
        isScrollable: false,
        scrollHint: null,
        metadata: {
          invitatory: true,
          invitPsalmKey,
          psalmHeadline: invitHeadline,
          invitatoryChunkIndex: i,
          invitatoryChunkTotal: invitChunks.length,
        },
      }),
    );
  });
  // Gloria Patri — its own slide, sealing the invitatory psalm BEFORE
  // the closing antiphon. Skipped for Pascha Nostrum since the paschal
  // anthem doesn't end with the standard doxology.
  if (invitPsalmKey !== "pascha_nostrum") {
    const invitGloriaPatri =
      "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";
    slides.push(
      slide(id(), "psalm_gloria", "🎶", invitEyebrow, invitGloriaPatri, {
        bcpReference: invitBcpRef,
        isScrollable: false,
        scrollHint: null,
        metadata: {
          invitatory: true,
          invitPsalmKey,
        },
      }),
    );
  }
  // Closing antiphon — its own slide AFTER the Gloria. Together with the
  // opening antiphon it bookends the invitatory: antiphon → verses →
  // Gloria → antiphon.
  if (hasAntiphon) {
    slides.push(
      slide(id(), "antiphon", "🎶", pick(locale, EYEBROWS.antiphon), antiphonText, {
        bcpReference: invitBcpRef,
        isScrollable: false,
        scrollHint: null,
        metadata: { invitatory: true, invitPsalmKey, antiphonPosition: "close" },
      }),
    );
  }

  // SLIDES 7+: Appointed Psalms
  // Render the appointed psalms as ONE liturgical block: a single
  // combined title slide ("Psalms 75 & 76"), then verse chunks for
  // each psalm in sequence (no breaks, no per-psalm titles, no
  // Gloria between psalms), then a single Gloria Patri at the very
  // end appended to the last chunk so it reads as the seal of the
  // whole reading rather than a per-psalm flourish.
  const gloriaPatri =
    "Glory to the Father, and to the Son, and to the Holy Spirit: as it was in the beginning, is now, and will be for ever. Amen.";

  if (appointedPsalms.length > 0) {
    // Combined eyebrow + headline. With one psalm we render exactly
    // as before ("PSALM 75" / "Psalm 75"); with multiple we use the
    // plural ("PSALMS 75 & 76" / "Psalms 75 & 76").
    const combinedEyebrow = appointedPsalms.length === 1
      ? psalmEyebrow(appointedPsalms[0])
      : `PSALMS ${appointedPsalms.map((p) => p.range ? `${p.number}:${p.range[0]}-${p.range[1]}` : `${p.number}`).join(" & ")}`;
    // Title chooses the first psalm's emoji + title text. The combined
    // headline is built into the `title` so the renderer's title slide
    // shows the full "Psalms 75 & 76" line.
    const firstPsalm = appointedPsalms[0];
    const firstData = texts[`psalm_${firstPsalm.number}`];
    const combinedTitle = appointedPsalms.length === 1
      ? (firstData?.title ?? null)
      : `Psalms ${appointedPsalms.map((p) => `${p.number}`).join(" & ")}`;

    slides.push(
      slide(id(), "psalm_title", PSALM_EMOJI[firstPsalm.number] ?? "📖", combinedEyebrow, "", {
        title: combinedTitle,
        // Psalter page of the first appointed psalm — the physical-book
        // guide reads this off the title slide. (EP's psalm slides
        // already carry it; MP historically dropped it.)
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

    // Build the full chunk list across every appointed psalm so we
    // can pin the Gloria onto the final chunk (no matter which
    // psalm it lands on).
    type Chunk = { content: string; psalmRef: typeof appointedPsalms[number] };
    const allChunks: Chunk[] = [];
    for (const psalmRef of appointedPsalms) {
      const psalmData = texts[`psalm_${psalmRef.number}`];
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
      const psalmData = texts[`psalm_${psalmNum}`];
      slides.push(
        slide(id(), "psalm", PSALM_EMOJI[psalmNum] ?? "📖", eyebrow, c.content, {
          title: psalmData?.title ?? null,
          bcpReference: psalmData?.bcpReference ?? null,
          isScrollable: false,
          scrollHint: null,
          metadata: {
            ...(psalmData?.metadata ?? {}),
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
    // reading (matches the invitatory's standalone Doxology card). One
    // Gloria for the appointed portion is permitted by the BCP rubric
    // (the Gloria "may be sung or said at the end of each Psalm or at
    // the end of the whole Portion" — BCP p. 141 / p. 583).
    const combinedTitleEyebrow = appointedPsalms.length === 1
      ? psalmEyebrow(appointedPsalms[0])
      : combinedEyebrow;
    slides.push(
      slide(id(), "psalm_gloria", "🎶", combinedTitleEyebrow, gloriaPatri, {
        isScrollable: false,
        scrollHint: null,
        metadata: { appointed: true },
      }),
    );
  }

  // BCP marks empty lesson slots with dashes ("----------") on major
  // feasts where only some readings are appointed (e.g. Easter Day
  // Y2 has the OT + Gospel but no Epistle). Treat dashes / blanks as
  // "no lesson today" and skip the slide rather than rendering a
  // broken "SECOND LESSON" titled "----------".
  const isLessonPresent = (l: string | null | undefined): boolean =>
    !!l && l.trim().length > 0 && !/^-+$/.test(l.trim());

  // First Lesson — OT. The lesson now renders as a title slide +
  // chunked numbered-verse slides (matching the psalm treatment) when
  // the local Bible JSON has the book; deuterocanonical readings fall
  // back to a single reference-only "open your bible" card.
  if (isLessonPresent(lesson1)) {
    for (const s of buildLessonSlides(lesson1, "first_morning", id)) {
      slides.push(s);
    }
  }

  // Canticle after OT.
  const afterOTData = texts[afterOT];
  pushCanticle(slides, {
    id,
    canticleKey: afterOT,
    text: localized(afterOT),
    emoji: CANTICLE_EMOJI[afterOT] ?? "🌟",
    title: afterOTData?.title ?? null,
    bcpReference: afterOTData?.bcpReference ?? null,
  });

  // Second Lesson — Epistle (the new layout: MP shows OT + Epistle,
  // EP shows Gospel only). Skipped on feast days where the BCP
  // appoints no Epistle at MP.
  //
  // The SAME day's Gospel (lesson3, which Evening Prayer reads as its own
  // lesson) rides along as an optional extra on this slide — see
  // buildLessonSlides' extraMetadata param and the "Read Gospel" button it
  // powers client-side. Owner: "the Gospel is what the evening prayer shows" —
  // confirming lesson3 (not a fresh lookup) is the right source.
  if (isLessonPresent(lesson2)) {
    const gospelTrimmed = (lesson3 ?? "").trim();
    const gospelExtra = isLessonPresent(gospelTrimmed)
      ? { gospelReference: gospelTrimmed, gospelReadUrl: bibleGatewayUrl(gospelTrimmed) }
      : undefined;
    for (const s of buildLessonSlides(lesson2, "second_morning", id, gospelExtra)) {
      slides.push(s);
    }
  }

  // Canticle after NT
  const afterNTData = texts[afterNT];
  pushCanticle(slides, {
    id,
    canticleKey: afterNT,
    text: localized(afterNT),
    emoji: CANTICLE_EMOJI[afterNT] ?? "🌟",
    title: afterNTData?.title ?? null,
    bcpReference: afterNTData?.bcpReference ?? null,
  });

  // Creed — split into two slides at the third article ("I believe
  // in the Holy Spirit…"). Slide 1 is the Father + the Son; slide 2
  // is the Holy Spirit and the Church. Falls back to one slide if
  // the split phrase isn't found.
  const mpCreed = localized("apostles_creed");
  const mpCreedSplit = mpCreed.indexOf("I believe in the Holy Spirit");
  const mpCreed1 = mpCreedSplit > 0 ? mpCreed.slice(0, mpCreedSplit).trimEnd() : mpCreed;
  const mpCreed2 = mpCreedSplit > 0 ? mpCreed.slice(mpCreedSplit).trimStart() : "";
  slides.push(
    slide(id(), "creed", "✝️", pick(locale, EYEBROWS.apostles_creed), mpCreed1, {
      bcpReference: "BCP p. 96",
      metadata: { prompt: "We say together what we believe." },
    }),
  );
  if (mpCreed2) {
    slides.push(
      slide(id(), "creed", "✝️", "THE APOSTLES' CREED", mpCreed2, {
        bcpReference: "BCP p. 96",
      }),
    );
  }

  // Lord's Prayer
  slides.push(
    slide(id(), "lords_prayer", "🙏🏽", pick(locale, EYEBROWS.the_lords_prayer), localized("lords_prayer_contemporary"), {
      bcpReference: "BCP p. 97",
    }),
  );

  // Suffrages. BCP p. 97 prints BOTH sets (A and B) side by side and leaves
  // the choice to whoever is officiating — pickSuffragesKey's alternation is
  // Phoebe's own default, not a rubric. Owner: "we could have a toggle
  // between A and B at the top, like the toggle between Forward [Movement]
  // and Church of England on the podcast" — so both texts ride along in
  // metadata (cheap: both are already resolvable via localized()), and the
  // client renders a real toggle instead of only ever showing the pick.
  const suffrageText = localized(suffragesKey);
  const suffrageLabel = suffragesKey === "suffrages_a" ? "A" : "B";
  const suffragesAltKey = suffragesKey === "suffrages_a" ? "suffrages_b" : "suffrages_a";
  const suffragesAltText = localized(suffragesAltKey);
  slides.push(
    slide(id(), "suffrages", "🕊️", `${pick(locale, EYEBROWS.suffrages)} ${suffrageLabel}`, suffrageText, {
      bcpReference: "BCP p. 97",
      isCallAndResponse: true,
      callAndResponseLines: parseSuffrages(suffrageText),
      metadata: {
        suffragesSelected: suffrageLabel,
        suffragesOptions: {
          [suffrageLabel]: { text: suffrageText, lines: parseSuffrages(suffrageText) },
          [suffragesAltKey === "suffrages_a" ? "A" : "B"]: { text: suffragesAltText, lines: parseSuffrages(suffragesAltText) },
        },
      },
    }),
  );

  // Collect of the Day — the BCP rubric (p. 98) says "one or more of the
  // following Collects, the Collect of the Day being first." Phoebe
  // surfaces the proper Collect of the Day to satisfy the "one or more"
  // minimum; the other collects (for Grace, Renewal of Life, etc.) are
  // intentionally not surfaced to keep the closing prayer single and
  // focused. A Prayer for Mission follows below as the BCP appoints.
  const collectData = texts[liturgicalDay.collectKey];
  slides.push(
    slide(id(), "collect", "📅", pick(locale, EYEBROWS.the_collect_of_the_day), getText(liturgicalDay.collectKey), {
      title: liturgicalDay.sundayLabel,
      bcpReference: collectData?.bcpReference ?? "BCP p. 211",
    }),
  );

  // A Prayer for Mission — BCP MP pp. 100–101. Three options are
  // appointed; we rotate by day-of-year so a daily reader hears all
  // three across the week (same cadence as the concluding blessing).
  const prayerForMissionData = texts[prayerForMissionKey];
  slides.push(
    slide(id(), "prayer_for_mission", "🌍", pick(locale, EYEBROWS.prayer_for_mission), localized(prayerForMissionKey), {
      bcpReference: prayerForMissionData?.bcpReference ?? "BCP p. 100",
    }),
  );

  // General Thanksgiving — split into two slides at its second
  // movement. Slide 1 is the thanksgiving itself (creation,
  // preservation, the blessings of this life, redemption); slide 2
  // is the petition that flows from it ("And, we pray, give us such
  // an awareness…"). Falls back to one slide if the phrase is absent.
  const mpGt = localized("general_thanksgiving");
  const mpGtSplit = mpGt.indexOf("And, we pray, give us such an awareness");
  const mpGt1 = mpGtSplit > 0 ? mpGt.slice(0, mpGtSplit).trimEnd() : mpGt;
  const mpGt2 = mpGtSplit > 0 ? mpGt.slice(mpGtSplit).trimStart() : "";
  slides.push(
    slide(id(), "general_thanksgiving", "🌾", pick(locale, EYEBROWS.general_thanksgiving), mpGt1, {
      bcpReference: "BCP p. 101",
      metadata: { prompt: "This is often said aloud together." },
    }),
  );
  if (mpGt2) {
    slides.push(
      slide(id(), "general_thanksgiving", "🌾", pick(locale, EYEBROWS.general_thanksgiving), mpGt2, {
        bcpReference: "BCP p. 101",
      }),
    );
  }

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
  //    Skip caching for non-English locales — see cacheEnabled
  //    comment above for the schema-key explanation.
  if (cacheEnabled) {
    try {
      await db
        .insert(morningPrayerCacheTable)
        .values({
          cacheDate: cacheDateStr,
          liturgicalYear: liturgicalDay.liturgicalYear,
          liturgicalSeason: liturgicalDay.season,
          properNumber: liturgicalDay.properNumber,
          feastName: liturgicalDay.feastName,
          slidesJson: stampSchemaVersion(slides) as unknown as Record<string, unknown>[],
          assembledByUserId: userId,
        })
        // A stale-schema row falls through to here on every request until
        // ONE of them wins this race and overwrites it with the current
        // shape — onConflictDoUpdate, not onConflictDoNothing, so that
        // actually happens instead of leaving the old row in place forever.
        .onConflictDoUpdate({
          target: morningPrayerCacheTable.cacheDate,
          set: {
            slidesJson: stampSchemaVersion(slides) as unknown as Record<string, unknown>[],
            liturgicalYear: liturgicalDay.liturgicalYear,
            liturgicalSeason: liturgicalDay.season,
            properNumber: liturgicalDay.properNumber,
            feastName: liturgicalDay.feastName,
            assembledByUserId: userId,
          },
        });
    } catch (err) {
      console.error("Failed to cache morning prayer:", err);
    }
  }

  // Per-user intercessions slide — built fresh, never cached.
  const withIntercessions = await injectIntercessions(slides, userId, cacheDate);
  // Per-user: hide the Confession + Absolution unless the user opted in.
  const slidesForUser = await applyConfessionPref(withIntercessions, userId, confessionOverride);

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
    // `injectIntercessions` has no id-counter in scope, but the
    // original slides are slide_0..slide_(N-1), so slide_N is a
    // collision-free id consistent with the rest (EP/Devotion build
    // their portal the same way).
    id: `slide_${slides.length}`,
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

// Drop the Confession of Sin + Absolution slides if the user opted out.
// Default for `bcp_show_confession` is TRUE; with it on the office runs
// in BCP order: Opening Sentence → Confession → Absolution → Invitatory
// (BCP p. 115–117 for EP, p. 75–80 for MP). Users who'd rather skip
// the penitential rite can flip the toggle off in Settings (PUT
// /api/me/office-prefs { showConfession: false }) and the office then
// runs Opening Sentence → Invitatory.
//
// Applied per-user AFTER the cache step, so the canonical cached deck
// remains the same for everyone — only the slices a user sees differ.
export async function applyConfessionPref(slides: Slide[], userId: number, override?: boolean): Promise<Slide[]> {
  let show: boolean;
  if (override !== undefined) {
    // Per-side override from the office fetch (?confession=1|0) — the
    // Morning/Evening split lets each side carry its own confession choice.
    show = override;
  } else {
    const [u] = await db
      .select({ showConfession: usersTable.bcpShowConfession })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    show = !!u?.showConfession;
  }
  if (show) return slides;
  return slides.filter((s) => s.type !== "confession" && s.type !== "absolution");
}
