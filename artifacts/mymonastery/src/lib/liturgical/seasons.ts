// Season / Sunday-week labeling. Given any date, produces:
//   - which liturgical season contains it
//   - the correct Sunday label if it IS a Sunday
//   - the "Nth week of Season" label for weekdays
//
// This is the workhorse for ferial days (no feast) — the header
// shows "Thursday, 23 April" on top of "The Third Week of Easter",
// and that second line comes from here.

import { computeEaster, addDays, dayDiff } from "./easter";
import type { LiturgicalSeason, LiturgicalColor } from "./types";

const ORDINAL_WORDS = [
  "",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
  "Eleventh",
  "Twelfth",
  "Thirteenth",
  "Fourteenth",
  "Fifteenth",
  "Sixteenth",
  "Seventeenth",
  "Eighteenth",
  "Nineteenth",
  "Twentieth",
  "Twenty-first",
  "Twenty-second",
  "Twenty-third",
  "Twenty-fourth",
  "Twenty-fifth",
  "Twenty-sixth",
  "Twenty-seventh",
  "Twenty-eighth",
  "Twenty-ninth",
  "Thirtieth",
];
function ordinal(n: number): string {
  if (n < 1) return "First";
  if (n < ORDINAL_WORDS.length) return ORDINAL_WORDS[n]!;
  return `${n}th`;
}

// Sunday is 0, Saturday is 6 — standard JS.
function isSunday(d: Date): boolean { return d.getDay() === 0; }

// Find the Sunday on or just before a given date. Used to anchor
// week calculations (e.g., "we're in the week that began on this
// Sunday").
export function sundayOnOrBefore(d: Date): Date {
  const diff = d.getDay(); // 0..6, how many days since Sunday
  return addDays(d, -diff);
}

// Advent 1 = Sunday closest to St. Andrew's Day (Nov 30), per the
// BCP. Equivalently, the 4th Sunday before Christmas.
export function adventOne(year: number): Date {
  const christmas = new Date(year, 11, 25); // Dec 25
  // Sunday on or before Christmas
  let sunday = sundayOnOrBefore(christmas);
  // Back up 3 more weeks → Advent 1
  return addDays(sunday, -21);
}

export interface LiturgicalYearAnchors {
  // All computed at local midnight.
  adventOneThisYear: Date;      // First Sunday of Advent (enters the NEW liturgical year)
  adventOnePrevYear: Date;      // Previous year's Advent 1 — what "year" we're currently IN
  christmasThisYear: Date;
  christmasPrevYear: Date;
  epiphanyThisYear: Date;       // Jan 6
  ashWednesdayThisYear: Date;   // Easter − 46
  palmSundayThisYear: Date;     // Easter − 7
  goodFridayThisYear: Date;     // Easter − 2
  holySaturdayThisYear: Date;   // Easter − 1
  easterThisYear: Date;
  easterPrevYear: Date;
  ascensionThisYear: Date;      // Easter + 39
  pentecostThisYear: Date;      // Easter + 49
  trinityThisYear: Date;        // Pentecost + 7
  // Last Sunday after Epiphany = the Sunday before Ash Wednesday.
  lastEpiphanyThisYear: Date;
  // Feast of Christ the King (Last Sunday after Pentecost) = Advent 1 − 7.
  christTheKingThisYear: Date;
}

export function yearAnchors(year: number): LiturgicalYearAnchors {
  const easter = computeEaster(year);
  const easterPrev = computeEaster(year - 1);
  const christmas = new Date(year, 11, 25);
  const christmasPrev = new Date(year - 1, 11, 25);
  const epiphany = new Date(year, 0, 6);
  const ashWed = addDays(easter, -46);
  const palmSun = addDays(easter, -7);
  const goodFri = addDays(easter, -2);
  const holySat = addDays(easter, -1);
  const ascension = addDays(easter, 39);
  const pentecost = addDays(easter, 49);
  const trinity = addDays(easter, 56);
  const adventThisYear = adventOne(year);
  const adventPrev = adventOne(year - 1);
  const lastEpiphany = addDays(ashWed, -3); // Sunday before Ash Wed (Ash Wed is Wednesday, so −3 days)
  const christTheKing = addDays(adventThisYear, -7);
  return {
    adventOneThisYear: adventThisYear,
    adventOnePrevYear: adventPrev,
    christmasThisYear: christmas,
    christmasPrevYear: christmasPrev,
    epiphanyThisYear: epiphany,
    ashWednesdayThisYear: ashWed,
    palmSundayThisYear: palmSun,
    goodFridayThisYear: goodFri,
    holySaturdayThisYear: holySat,
    easterThisYear: easter,
    easterPrevYear: easterPrev,
    ascensionThisYear: ascension,
    pentecostThisYear: pentecost,
    trinityThisYear: trinity,
    lastEpiphanyThisYear: lastEpiphany,
    christTheKingThisYear: christTheKing,
  };
}

export interface SeasonInfo {
  season: LiturgicalSeason;
  // Week of the season, 1-indexed. For Sundays this matches the
  // conventional count ("Third Sunday of Easter" = week 3). For
  // weekdays we report the week that the MOST RECENT Sunday opened.
  weekNumber: number;
  // Formatted label for ferial / non-feast weekdays. Examples:
  //   "The Third Week of Advent"
  //   "Easter Week"
  //   "The Second Sunday after Epiphany"
  //   "The Fifth Week after Pentecost"
  label: string;
  // Color associated with the season itself (a feast may override
  // this at the day level).
  seasonalColor: LiturgicalColor;
  // True iff this date is itself a Sunday. Callers use this to pick
  // "Sunday of" vs "Week of" phrasing.
  isSunday: boolean;
}

// Classify a date into its liturgical season and produce a label.
// The algorithm walks the boundaries of the year (Advent 1 → Epiphany
// → Ash Wed → Easter → Pentecost → Christ the King) and returns once
// it lands inside a range.
export function seasonInfo(date: Date): SeasonInfo {
  const year = date.getFullYear();

  // Figure out which liturgical year we're in. Advent 1 starts the
  // NEXT cycle, so if the date is ≥ this year's Advent 1, we're in
  // cycle (year+1); otherwise cycle (year).
  const thisAdvent = adventOne(year);
  const inNextCycle = date.getTime() >= thisAdvent.getTime();
  const cycleYear = inNextCycle ? year + 1 : year;

  // Anchors needed:
  //   - adventOne that OPENED our current cycle
  //   - Christmas of our current cycle (calendar year = cycleYear's
  //     Dec if cycle started in prev calendar year)
  //   - Epiphany of our current cycle (calendar year = cycleYear)
  //   - Easter of our current cycle (calendar year = cycleYear)
  //   - Next Advent 1 (end of current cycle)
  const adventStart = adventOne(cycleYear - 1); // opens this cycle
  const christmas = new Date(cycleYear - 1, 11, 25);
  const christmasThisJan = new Date(cycleYear, 0, 1); // marker for "Christmas season ends Jan 5"
  void christmasThisJan;
  const epiphany = new Date(cycleYear, 0, 6);
  const easter = computeEaster(cycleYear);
  const ashWed = addDays(easter, -46);
  const palmSun = addDays(easter, -7);
  const holySat = addDays(easter, -1);
  const pentecost = addDays(easter, 49);
  const trinity = addDays(easter, 56);
  const nextAdvent = adventOne(cycleYear);

  const isSun = isSunday(date);
  const t = (d: Date) => d.getTime();

  // ── ADVENT ────────────────────────────────────────────────
  // Advent 1 inclusive → Dec 24 inclusive. Dec 25 is Christmas.
  if (t(date) >= t(adventStart) && t(date) < t(christmas)) {
    const weekStart = sundayOnOrBefore(date);
    const weekNumber = Math.floor(dayDiff(weekStart, adventStart) / 7) + 1;
    const clamped = Math.max(1, Math.min(4, weekNumber));
    const label = isSun
      ? `The ${ordinal(clamped)} Sunday of Advent`
      : `The ${ordinal(clamped)} Week of Advent`;
    // Gaudete Sunday (Advent 3): rose is optional. We default to
    // violet for Advent; parish-level preference for rose can be a
    // future setting. Same story for Laetare (Lent 4).
    return { season: "advent", weekNumber: clamped, label, seasonalColor: "violet", isSunday: isSun };
  }

  // ── CHRISTMAS ─────────────────────────────────────────────
  // Dec 25 → Jan 5 inclusive (12 days). Epiphany on Jan 6 flips us.
  if (t(date) >= t(christmas) && t(date) < t(epiphany)) {
    const label = isSun ? "The First Sunday after Christmas" : "Christmas";
    // Special label for Dec 31 / Jan 1 — see fixed-feasts for the
    // Holy Name (Jan 1) treatment. Here we only render the season.
    return { season: "christmas", weekNumber: 1, label, seasonalColor: "white", isSunday: isSun };
  }

  // ── AFTER EPIPHANY (ordinary green) ───────────────────────
  // Jan 6 inclusive → Ash Wednesday exclusive.
  if (t(date) >= t(epiphany) && t(date) < t(ashWed)) {
    // The Last Sunday after Epiphany (Transfiguration in the
    // Episcopal calendar) is the Sunday just before Ash Wednesday —
    // we stamp a special label for that case.
    const lastEpi = addDays(ashWed, -3);
    if (isSun && t(date) === t(lastEpi)) {
      return {
        season: "epiphany",
        weekNumber: 0,
        label: "The Last Sunday after Epiphany",
        seasonalColor: "white", // Transfiguration is white
        isSunday: true,
      };
    }
    // First Sunday after Epiphany = Baptism of Our Lord. Bump to
    // the week count from there.
    const firstSun = sundayOnOrBefore(addDays(epiphany, 6)); // Sunday on/after Jan 6 (ish)
    // More precisely: "the First Sunday after the Epiphany" is the
    // Sunday in Jan 7–13. If Epiphany falls on a Sunday, that Sunday
    // is Epiphany itself; the next Sunday is "Second after Epiphany".
    let weekNumber: number;
    if (t(date) < t(firstSun)) {
      weekNumber = 0; // Pre-first-Sunday weekdays of the season
    } else {
      const weekStart = sundayOnOrBefore(date);
      weekNumber = Math.floor(dayDiff(weekStart, firstSun) / 7) + 1;
    }
    const label = weekNumber === 0
      ? "Epiphany"
      : isSun
        ? `The ${ordinal(weekNumber)} Sunday after Epiphany`
        : `The ${ordinal(weekNumber)} Week after Epiphany`;
    return { season: "epiphany", weekNumber, label, seasonalColor: "green", isSunday: isSun };
  }

  // ── LENT ──────────────────────────────────────────────────
  // Ash Wed inclusive → Palm Sunday exclusive.
  if (t(date) >= t(ashWed) && t(date) < t(palmSun)) {
    // Lent has 5 Sundays (Lent 1–5); Palm Sun is not "Lent 6". So we
    // anchor off Lent 1 (the Sunday after Ash Wed).
    const lent1 = addDays(ashWed, 4); // Ash Wed + 4 = Sunday (Sunday after Ash Wed)
    let weekNumber: number;
    if (t(date) < t(lent1)) {
      weekNumber = 0; // Ash Wed and its three following weekdays
    } else {
      const weekStart = sundayOnOrBefore(date);
      weekNumber = Math.floor(dayDiff(weekStart, lent1) / 7) + 1;
    }
    const clamped = Math.max(0, Math.min(5, weekNumber));
    const label = clamped === 0
      ? "Ash Wednesday"
      : isSun
        ? `The ${ordinal(clamped)} Sunday in Lent`
        : `The ${ordinal(clamped)} Week in Lent`;
    return { season: "lent", weekNumber: clamped, label, seasonalColor: "violet", isSunday: isSun };
  }

  // ── HOLY WEEK ─────────────────────────────────────────────
  // Palm Sunday inclusive → Holy Saturday inclusive.
  if (t(date) >= t(palmSun) && t(date) <= t(holySat)) {
    const names: Record<number, string> = {
      0: "Palm Sunday",
      1: "Monday in Holy Week",
      2: "Tuesday in Holy Week",
      3: "Wednesday in Holy Week",
      4: "Maundy Thursday",
      5: "Good Friday",
      6: "Holy Saturday",
    };
    const offset = dayDiff(date, palmSun);
    const label = names[offset] ?? "Holy Week";
    // Colors through the week: Palm Sunday red, M–W red, Maundy Thu
    // white, Good Fri black, Holy Sat unbleached.
    let color: LiturgicalColor = "red";
    if (offset === 4) color = "white";
    else if (offset === 5) color = "black";
    else if (offset === 6) color = "unbleached";
    return { season: "holy_week", weekNumber: 6, label, seasonalColor: color, isSunday: isSun };
  }

  // ── EASTER ────────────────────────────────────────────────
  // Easter Day inclusive → Pentecost exclusive.
  if (t(date) >= t(easter) && t(date) < t(pentecost)) {
    // Easter Octave: Easter Day + 7 days.
    const easterEnd = addDays(easter, 7);
    if (t(date) < t(easterEnd)) {
      const label = isSun ? "Easter Day" : "Easter Week";
      return { season: "easter", weekNumber: 1, label, seasonalColor: "white", isSunday: isSun };
    }
    // Easter 2 onward. "Second Sunday of Easter" = Easter + 7 days.
    const weekStart = sundayOnOrBefore(date);
    const weekNumber = Math.floor(dayDiff(weekStart, easter) / 7) + 1;
    // Ascension Day (Thursday of week 6 — Easter + 39) — we let
    // fixed-feasts surface the feast itself, but the label here
    // reports the Easter week number.
    const clamped = Math.max(2, Math.min(7, weekNumber));
    const label = isSun
      ? `The ${ordinal(clamped)} Sunday of Easter`
      : `The ${ordinal(clamped)} Week of Easter`;
    return { season: "easter", weekNumber: clamped, label, seasonalColor: "white", isSunday: isSun };
  }

  // ── PENTECOST (Ordinary after Pentecost) ──────────────────
  // Pentecost inclusive → Advent 1 exclusive.
  if (t(date) >= t(pentecost) && t(date) < t(nextAdvent)) {
    // Day of Pentecost → red. Weekdays immediately after Pentecost
    // are "Week of Pentecost". Trinity Sunday = Pentecost + 7.
    if (t(date) < t(trinity)) {
      if (isSun && t(date) === t(pentecost)) {
        return { season: "pentecost", weekNumber: 0, label: "The Day of Pentecost", seasonalColor: "red", isSunday: true };
      }
      return { season: "pentecost", weekNumber: 0, label: "The Week of Pentecost", seasonalColor: "red", isSunday: isSun };
    }
    // From Trinity Sunday onward, count Sundays/weeks "after Pentecost".
    //   Trinity Sunday      = "The First Sunday after Pentecost: Trinity Sunday"
    //   The following week  = "The Second Week after Pentecost"
    //   Following Sunday    = "The Second Sunday after Pentecost"
    // …
    // Christ the King = Last Sunday after Pentecost (Advent − 7 days).
    const christTheKing = addDays(nextAdvent, -7);
    if (isSun && t(date) === t(christTheKing)) {
      return {
        season: "pentecost",
        weekNumber: 999, // marker — UI can special-case
        label: "The Last Sunday after Pentecost: Christ the King",
        seasonalColor: "white", // Christ the King is white
        isSunday: true,
      };
    }
    const weekStart = sundayOnOrBefore(date);
    const weekNumber = Math.floor(dayDiff(weekStart, trinity) / 7) + 1;
    const label = weekNumber === 1 && isSun
      ? "Trinity Sunday"
      : isSun
        ? `The ${ordinal(weekNumber)} Sunday after Pentecost`
        : `The ${ordinal(weekNumber)} Week after Pentecost`;
    return { season: "pentecost", weekNumber, label, seasonalColor: "green", isSunday: isSun };
  }

  // Defensive fallback — shouldn't reach here if the anchors covered
  // the year, but if they don't, don't throw in the user's face.
  return {
    season: "ordinary",
    weekNumber: 1,
    label: "",
    seasonalColor: "green",
    isSunday: isSun,
  };
}
