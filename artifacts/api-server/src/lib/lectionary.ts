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
