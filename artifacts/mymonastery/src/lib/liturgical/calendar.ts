// Liturgical calendar — main API.
//
// getDay(date) → LiturgicalDay for the day. Resolves in this order:
//   1. Movable feasts (Easter-derived: Ash Wed, Holy Week, Easter,
//      Ascension, Pentecost, Trinity)
//   2. Principal Feasts / Holy Days on fixed dates (BCP)
//   3. Lesser Feasts from LFF 2022 (loaded separately — see
//      lesser-feasts.ts, if present)
//   4. Sunday default (every Sunday is a feast of our Lord)
//   5. Ferial — season label under the calendar date

import type {
  LiturgicalDay,
  LiturgicalRank,
  LiturgicalColor,
  FixedFeastEntry,
} from "./types";
import { toYmd } from "./easter";
import { seasonInfo } from "./seasons";
import { movableFeastsForYear } from "./movable-feasts";
import { HOLY_DAYS, thanksgivingDay } from "./fixed-feasts";

// Optional registry populated by lesser-feasts.ts (lazy side-effect
// import). If the file isn't imported, LESSER_FEASTS stays empty —
// the app still works, just without the LFF commemorations.
export const LESSER_FEASTS_REGISTRY: FixedFeastEntry[] = [];
export function registerLesserFeasts(entries: FixedFeastEntry[]): void {
  LESSER_FEASTS_REGISTRY.push(...entries);
}

function fixedHitFor(date: Date): FixedFeastEntry | undefined {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return HOLY_DAYS.find(e => e.month === m && e.day === d);
}

function lesserHitFor(date: Date): FixedFeastEntry | undefined {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return LESSER_FEASTS_REGISTRY.find(e => e.month === m && e.day === d);
}

export interface GetDayOptions {
  // When false, Lesser Feasts are suppressed — only Principal Feasts,
  // Holy Days, Sundays, and seasons show. Some parishes and
  // individuals prefer this. Default: true.
  observeLesserFeasts?: boolean;
}

export function getDay(date: Date, opts: GetDayOptions = {}): LiturgicalDay {
  const { observeLesserFeasts = true } = opts;
  const season = seasonInfo(date);
  const ymd = toYmd(date);

  // 1. Movable feasts (Easter-derived)
  const movable = movableFeastsForYear(date.getFullYear()).get(ymd);
  if (movable) {
    return {
      ymd,
      rank: movable.rank,
      name: movable.name,
      color: movable.color,
      season: season.season,
      description: movable.description,
      collect: undefined,
    };
  }

  // Thanksgiving Day (4th Thursday of November) — movable by
  // date-within-month. Treat as a holy day.
  const thanks = thanksgivingDay(date.getFullYear());
  if (toYmd(thanks) === ymd) {
    return {
      ymd,
      rank: "holy_day",
      name: "Thanksgiving Day",
      color: "white",
      season: season.season,
      description:
        "A national day of thanksgiving. The BCP provides proper lessons and a collect for the day.",
    };
  }

  // 2. Fixed Holy Days (BCP)
  const holy = fixedHitFor(date);
  if (holy) {
    return {
      ymd,
      rank: holy.rank,
      name: holy.name,
      color: holy.color,
      season: season.season,
      description: holy.description,
      life: holy.life,
      collect: holy.collect,
    };
  }

  // 3. Lesser Feasts (optional per setting)
  if (observeLesserFeasts) {
    const lesser = lesserHitFor(date);
    if (lesser) {
      // Lesser Feasts are optional — the primary header stays as the
      // calendar date, with the commemoration rendered beneath. So we
      // report rank=ferial/sunday with a commemoration, NOT the feast
      // as the primary `name`.
      const base = sundayOrFerial(date, season);
      return {
        ...base,
        commemoration: lesser.name,
        // Keep the day's seasonal color — a Lesser Feast doesn't
        // override color in the header accent (optional commemoration).
        description: lesser.description,
        life: lesser.life,
      };
    }
  }

  // 4. Sunday default / 5. Ferial
  return sundayOrFerial(date, season);
}

function sundayOrFerial(
  date: Date,
  season: ReturnType<typeof seasonInfo>,
): LiturgicalDay {
  const ymd = toYmd(date);
  const rank: LiturgicalRank = season.isSunday ? "sunday" : "ferial";
  const color: LiturgicalColor = season.seasonalColor;
  return {
    ymd,
    rank,
    name: season.label || "",
    color,
    season: season.season,
  };
}

// Convenience — used by the setting-toggle reading a stored preference.
export const LESSER_FEASTS_PREF_KEY = "phoebe:observeLesserFeasts";

export function readLesserFeastsPref(): boolean {
  if (typeof window === "undefined") return true;
  const v = window.localStorage.getItem(LESSER_FEASTS_PREF_KEY);
  if (v === null) return true;
  return v === "true";
}

export function writeLesserFeastsPref(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LESSER_FEASTS_PREF_KEY, String(on));
}
