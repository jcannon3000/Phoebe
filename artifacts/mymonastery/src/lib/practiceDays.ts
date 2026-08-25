/**
 * Which days of the week a practice is kept on.
 *
 * A rule of life is not always the same seven days running. The seminary has
 * Chapel on weekdays and worship on Sunday; a community meal happens Tuesday
 * and Thursday; somebody keeps a long walk on Saturdays and nothing else.
 * Owner: "all routine cards can be specified as to what days of the week, or
 * that there is a different practice on other days of the week."
 *
 * This module answers the FIRST half — is this practice kept today — for any
 * card, by its card key. The second half (a DIFFERENT practice on other days)
 * lives in officePrefs' side day-rules, because it has to resolve to a level
 * rather than to a yes/no.
 *
 * ── The rule this must never break ──
 *
 * An off day is not a MISSED day. A practice you don't keep on Tuesday must
 * leave no card, no unfilled dot, and no gap in the weekly grid to feel bad
 * about — the same treatment customAnchors.anchorOnDay already gives a
 * weekday-scoped anchor, which is why this delegates to it rather than
 * restating the test. One rule, one place.
 *
 * ABSENT means every day, so nothing already saved changes meaning.
 */
import { anchorOnDay } from "./customAnchors";

/** JS weekday numbers, as `Date.getDay()` returns them. */
export const SUNDAY = 0, MONDAY = 1, SATURDAY = 6;
/** Mon–Fri, the common case. */
export const WEEKDAYS = [1, 2, 3, 4, 5];
/** Sat–Sun. */
export const WEEKEND = [0, 6];

export const PRACTICE_DAYS_KEY = "phoebe:practice-days";
export const PRACTICE_DAYS_EVENT = "phoebe:practice-days-changed";

/** Is a day-set kept on `date`? Empty or absent = every day. */
export function onDay(days: number[] | null | undefined, date: Date = new Date()): boolean {
  return anchorOnDay({ days: days ?? undefined }, date);
}

type DayMap = Record<string, number[]>;

function read(): DayMap {
  try {
    const raw = localStorage.getItem(PRACTICE_DAYS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: DayMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Read defensively: one malformed row shouldn't throw on every render,
      // and a day number outside 0–6 would silently never match.
      if (Array.isArray(v) && v.every((n) => typeof n === "number" && n >= 0 && n <= 6)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** The days this card is kept on, or null for every day. */
export function getPracticeDays(key: string): number[] | null {
  const v = read()[key];
  return v && v.length > 0 ? v : null;
}

/**
 * Set (or clear, with null) the days a card is kept on.
 *
 * A full week is stored as CLEARED rather than as [0..6]: "every day" is the
 * absence of a restriction, and writing it out would make an ordinary daily
 * practice look scheduled to every reader of this map.
 */
export function setPracticeDays(key: string, days: number[] | null): void {
  try {
    const map = read();
    const clean = days ? [...new Set(days.filter((n) => n >= 0 && n <= 6))].sort() : [];
    if (clean.length === 0 || clean.length === 7) delete map[key];
    else map[key] = clean;
    if (Object.keys(map).length === 0) localStorage.removeItem(PRACTICE_DAYS_KEY);
    else localStorage.setItem(PRACTICE_DAYS_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(PRACTICE_DAYS_EVENT));
  } catch { /* private mode — the practice just stays daily */ }
}

/** Is this card kept on `date`? Unscoped cards are kept every day. */
export function practiceOnDay(key: string, date: Date = new Date()): boolean {
  return onDay(getPracticeDays(key), date);
}

/** "Weekdays" · "Sat, Sun" · "Mon, Wed, Fri" — for the customizer and cards. */
const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function daysLabel(days: number[] | null | undefined): string | null {
  if (!days || days.length === 0 || days.length === 7) return null;
  const s = [...new Set(days)].sort();
  if (s.length === 5 && s.every((d) => d >= 1 && d <= 5)) return "Weekdays";
  if (s.length === 2 && s[0] === 0 && s[1] === 6) return "Weekends";
  // Sunday reads first in a week that starts on Sunday, which is how the
  // weekly grid already orders its columns.
  return s.map((d) => NAMES[d]).join(", ");
}
