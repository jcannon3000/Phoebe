/**
 * Lectionary Service — 1979 Episcopal BCP Daily Office Lectionary
 *
 * Returns the appointed psalms and scripture lessons for any given
 * liturgical day from the two-year cycle.
 */

import { lectionary } from "../data/lectionary1979";
import type { LiturgicalDay } from "./liturgicalCalendar";

export interface LectionaryReadings {
  psalms: string[];       // Psalm numbers as strings, e.g. ["95", "100"]
  lesson1: string;        // OT
  lesson2: string;        // Epistle
  lesson3: string;        // Gospel
  weekKey: string;        // The key used for lookup
  // True when this office is being served from an "Eve of …" override
  // (Ascension Eve, Pentecost Eve, Trinity Eve). EP uses this to
  // decide whether to fall back to lesson2 when lesson3 is blank —
  // on eves lesson1+lesson2 are EXCLUSIVELY for EP, so falling back
  // is correct. On regular days where lesson3 is blank (e.g. Palm
  // Sunday), MP already shows both lessons; falling back would
  // duplicate the Epistle, so we skip the EP lesson entirely.
  isEveOverride: boolean;
}

export function getLectionaryReadings(
  officeDay: LiturgicalDay,
  office: "morning" | "evening" = "morning",
): LectionaryReadings {
  // "Eve of …" entries (Ascension Eve, Pentecost Eve, Trinity Eve) are
  // evening-only overrides — Morning Prayer on those dates uses the
  // regular weekday entry. eveLectionaryKey is non-null exactly on those
  // dates; we prefer it for evening, ignore it for morning.
  const isEveOverride = office === "evening" && !!officeDay.eveLectionaryKey;

  // Major Holy Days carry their own proper readings (BCP Daily Office Holy Days
  // table), which replace the weekday cycle. MP shows both lessons; our single-
  // lesson EP serves the second (NT/gospel) EP lesson via lesson3.
  if (officeDay.holyDayReadings && !isEveOverride) {
    const h = officeDay.holyDayReadings;
    return office === "evening"
      ? { psalms: h.epPsalms, lesson1: "", lesson2: "", lesson3: h.epLesson2, weekKey: "holy_day", isEveOverride: false }
      : { psalms: h.mpPsalms, lesson1: h.mpLesson1, lesson2: h.mpLesson2, lesson3: "", weekKey: "holy_day", isEveOverride: false };
  }

  const key = isEveOverride
    ? (officeDay.eveLectionaryKey as string)
    : officeDay.lectionaryWeekKey;
  const entry = lectionary[key];

  if (!entry) {
    // Fallback: when a lookup misses, hand back stable BCP-friendly
    // placeholders so the office still assembles. The OT/Epistle/Gospel
    // slots all need a reference each — picking three classic Pauline
    // and prophetic passages so the rendering doesn't crash.
    console.warn(`No lectionary entry for key: ${key}`);
    return {
      psalms: ["95"],
      lesson1: "Isaiah 55:1-11",
      lesson2: "Romans 8:1-11",
      lesson3: "John 14:1-14",
      weekKey: key,
      isEveOverride,
    };
  }

  const isYear1 = officeDay.liturgicalYear === 1;

  /**
   * THE PRINTED BOOK'S DASH RULES ARE NOT REFERENCES.
   *
   * The lectionary table transcribes the BCP faithfully, dashes and all: the
   * book prints a rule ("----------") where nothing separate is appointed —
   * Easter Day's middle lesson, and the evening psalms on days whose Evening
   * Prayer belongs to the eve of the feast that follows (December 31, January
   * 5). Transcribing them was right; SERVING them was not. They reached the
   * office as a lesson reference and a psalm number, so Easter Day asked
   * scripture lookup for a passage called "----------".
   *
   * A dash means absent, so treat it as absent: an empty lesson, which the
   * office already knows how to skip (Palm Sunday's blank third lesson takes
   * the same path), and evening psalms that fall back to the morning's rather
   * than rendering a rule as a psalm.
   */
  const isDash = (v: string | undefined | null): boolean => !!v && /^\s*-+\s*$/.test(v);
  const clean = (v: string | undefined): string => (isDash(v) ? "" : (v ?? ""));
  const psalmsRaw = office === "evening" ? (entry.psalms_ep ?? entry.psalms_mp) : entry.psalms_mp;
  const psalms = (psalmsRaw ?? []).filter((p) => !isDash(p));

  return {
    psalms: psalms.length > 0 ? psalms : (entry.psalms_mp ?? []).filter((p) => !isDash(p)),
    lesson1: clean(isYear1 ? entry.lesson1_y1 : entry.lesson1_y2),
    lesson2: clean(isYear1 ? entry.lesson2_y1 : entry.lesson2_y2),
    lesson3: clean(isYear1 ? entry.lesson3_y1 : entry.lesson3_y2),
    weekKey: key,
    isEveOverride,
  };
}

/**
 * WHICH TWO READINGS MORNING PRAYER SHOWS, and in which order.
 *
 * The prayer book appoints THREE readings a day — Old Testament, Epistle,
 * Gospel — and its rubric says that when the office is prayed twice, two are
 * read in the morning and one in the evening, the Old Testament first. Phoebe
 * leads with Morning Prayer, so the morning takes two of the three:
 *
 *   Year One   → Old Testament, then Epistle
 *   Year Two   → Old Testament, then Gospel
 *
 * The third is not shown in the office; it is handed back as `extra` so the
 * morning can offer it as an optional side reading, and so Evening Prayer can
 * read the one the morning did not (see assembleEveningPrayer).
 *
 * DAYS THAT APPOINT THEIR OWN MORNING READINGS ARE LEFT ALONE. A Major Holy
 * Day carries readings marked for Morning and Evening in the prayer book's own
 * table, and our data keeps that distinction (LiturgicalDay.holyDayReadings,
 * mpLesson1/mpLesson2/epLesson2) — getLectionaryReadings hands those straight
 * through with an empty third lesson. So an empty third reading means "this
 * day says what its morning is", and the pair is served as given, unswapped.
 * The same path covers ordinary days the book leaves a rule against, such as
 * Palm Sunday.
 */
/**
 * IS THIS REFERENCE A GOSPEL? By its book, which is the only thing that says.
 *
 * The weekday table keeps the three readings in fixed slots, so their names
 * are known by position. A day that appoints its OWN readings does not: the
 * prayer book's Holy Days table gives Morning and Evening two lessons each and
 * they are whatever they are — the Presentation reads John 8 in the morning
 * and 1 John 3 in the evening, and calling both "the Gospel" (as we did) is
 * wrong about one of them.
 *
 * "1 John" IS NOT JOHN. The numbered letters are epistles and the bare name is
 * the Gospel, which is the whole reason this is a function and not a substring
 * test.
 */
export function readingIsGospel(reference: string): boolean {
  const ref = (reference ?? "").trim();
  if (!ref) return false;
  // Strip a leading "The " and any numeral: "1 John" and "II John" are letters.
  if (/^(?:the\s+)?(?:[123]|i{1,3})\s/i.test(ref)) return false;
  return /^(?:the\s+)?(?:matt|mark|luke|john)/i.test(ref);
}

export type MorningLessonPlan = {
  /** Always the Old Testament, and always first. */
  first: string;
  /** Year One's Epistle, or Year Two's Gospel. */
  second: string;
  secondKind: "epistle" | "gospel";
  /** The one the morning does not read. Empty when the day appoints its own. */
  extra: string;
  extraKind: "epistle" | "gospel";
};

export function planMorningLessons(
  readings: Pick<LectionaryReadings, "lesson1" | "lesson2" | "lesson3">,
  lectionaryYear: 1 | 2,
): MorningLessonPlan {
  const ot = readings.lesson1 ?? "";
  const epistle = readings.lesson2 ?? "";
  const gospel = readings.lesson3 ?? "";

  // The day names its own morning (a Major Holy Day, or a day the book leaves
  // a rule against): take the pair as given rather than reaching for a third
  // reading that was never appointed.
  if (!gospel.trim()) {
    // Named by its book, not by its slot: a Major Holy Day's second morning
    // reading is a Gospel as often as a letter (the Presentation reads John 8,
    // the Annunciation Hebrews 2), and the slot cannot tell you which.
    return {
      first: ot,
      second: epistle,
      secondKind: readingIsGospel(epistle) ? "gospel" : "epistle",
      extra: "",
      extraKind: "gospel",
    };
  }

  /**
   * WHEN THE YEAR'S READING IS NOT THERE, READ THE OTHER ONE.
   *
   * Four days appoint no Epistle at all — 26, 27 and 28 December, and Easter
   * Day, where the book prints a rule instead. Without this, Year One would
   * have opened the office with a single reading on Christmas week's feasts
   * and offered the Gospel as a side note, which is not what the book
   * appoints: those days are Old Testament and Gospel, in both years.
   */
  if (lectionaryYear === 1 && !epistle.trim()) {
    return { first: ot, second: gospel, secondKind: "gospel", extra: "", extraKind: "epistle" };
  }

  return lectionaryYear === 1
    ? { first: ot, second: epistle, secondKind: "epistle", extra: gospel, extraKind: "gospel" }
    : { first: ot, second: gospel, secondKind: "gospel", extra: epistle, extraKind: "epistle" };
}

/**
 * WHICH ONE READING EVENING PRAYER SHOWS.
 *
 * The complement of planMorningLessons, and it has to be: the morning takes
 * two of the day's three, so the evening reads the one left over — the Gospel
 * in Year One, the Epistle in Year Two. Before the year rule the evening read
 * the Gospel every night, which was right while the morning always took Old
 * Testament and Epistle; after it, Year Two would have read the same Gospel
 * twice in a day and never opened the Epistle at all.
 *
 * Phoebe prays both offices, so this is not hypothetical — it is what somebody
 * reads tonight (owner, 2026-09-23: "Phoebe definetly has a evning parayer").
 *
 * TWO DAYS THIS DOES NOT DESCRIBE, both handled here:
 *  - An "Eve of …" (Ascension, Pentecost, Trinity) appoints only two lessons,
 *    for First Evensong alone, stored in lesson1/lesson2 with nothing third.
 *    The morning of those dates uses the ordinary weekday entry, so the
 *    evening takes lesson2 — its NT counterpart — and keeps the neutral name,
 *    since the book does not say whether it is Epistle or Gospel.
 *  - A day that appoints its own morning pair (a Major Holy Day, Palm Sunday)
 *    has nothing left for the evening in this table: reading lesson2 there
 *    would repeat what the morning has just read, so the evening shows none.
 */
export type EveningLessonPlan = {
  /** Empty when the day leaves the evening nothing of its own. */
  reference: string;
  kind: "gospel" | "epistle" | "unnamed";
};

export function planEveningLesson(
  readings: Pick<LectionaryReadings, "lesson2" | "lesson3" | "isEveOverride"> & { weekKey?: string },
  lectionaryYear: 1 | 2,
): EveningLessonPlan {
  const present = (v: string | undefined | null): boolean =>
    !!v && v.trim().length > 0 && !/^-+$/.test(v.trim());
  const epistle = readings.lesson2 ?? "";
  const gospel = readings.lesson3 ?? "";

  /**
   * A DAY WITH ITS OWN EVENING READINGS — a Major Holy Day. The table hands
   * them over through this same lesson3 slot (getLectionaryReadings turns
   * holyDayReadings.epLesson2 into it), and they are appointed FOR the evening,
   * so they are read whatever the year and whatever the morning did. Named by
   * their book, because they are as often a letter as a Gospel.
   */
  if (readings.weekKey === "holy_day") {
    return present(gospel)
      ? { reference: gospel, kind: readingIsGospel(gospel) ? "gospel" : "epistle" }
      : { reference: "", kind: "unnamed" };
  }

  if (!present(gospel)) {
    // First Evensong of an Eve: both its lessons belong to the evening.
    return readings.isEveOverride && present(epistle)
      ? { reference: epistle, kind: "unnamed" }
      : { reference: "", kind: "unnamed" };
  }

  /**
   * WHEN THE DAY APPOINTS NO EPISTLE the morning reads the Gospel in BOTH
   * years (see planMorningLessons), so there is nothing left for the evening —
   * 26, 27 and 28 December, and Easter Day. This mirrors that fallback
   * deliberately: without it Year One read the Gospel at both offices, the
   * same passage twice in a day, which is exactly what the split exists to
   * avoid.
   */
  if (!present(epistle)) return { reference: "", kind: "unnamed" };

  // Otherwise the evening reads whichever the morning did not: the Gospel in
  // Year One, the Epistle in Year Two.
  return lectionaryYear === 1
    ? { reference: gospel, kind: "gospel" }
    : { reference: epistle, kind: "epistle" };
}
