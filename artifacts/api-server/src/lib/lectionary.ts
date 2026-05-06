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
}

export function getLectionaryReadings(
  officeDay: LiturgicalDay,
  office: "morning" | "evening" = "morning",
): LectionaryReadings {
  const key = officeDay.lectionaryWeekKey;
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
    };
  }

  const isYear1 = officeDay.liturgicalYear === 1;

  return {
    psalms: office === "evening" ? (entry.psalms_ep ?? entry.psalms_mp) : entry.psalms_mp,
    lesson1: isYear1 ? entry.lesson1_y1 : entry.lesson1_y2,
    lesson2: isYear1 ? entry.lesson2_y1 : entry.lesson2_y2,
    lesson3: isYear1 ? entry.lesson3_y1 : entry.lesson3_y2,
    weekKey: key,
  };
}
