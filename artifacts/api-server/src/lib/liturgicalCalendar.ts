/**
 * Liturgical Calendar Engine for the 1979 Episcopal BCP
 *
 * Computes liturgical season, year, collect key, antiphon key,
 * and all metadata needed to assemble the Daily Office for any date.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export type LiturgicalSeason =
  | "advent"
  | "christmas"
  | "epiphany"
  | "lent"
  | "holy_week"
  | "easter"
  | "season_after_pentecost";

export interface LiturgicalDay {
  date: Date;
  liturgicalYear: 1 | 2;
  season: LiturgicalSeason;
  weekInSeason: number;
  dayOfWeek: number; // 0=Sunday … 6=Saturday
  properNumber: number | null; // 1-29, season_after_pentecost only
  isFeast: boolean;
  feastName: string | null;
  isMajorFeast: boolean;
  collectKey: string;
  antiphonKey: string;
  invitatorySeason: string;
  lectionaryWeekKey: string;
  // BCP "Eve of …" entries (Ascension Eve, Pentecost Eve, Trinity Eve)
  // are evening-only overrides — Morning Prayer on those calendar days
  // belongs to the regular weekday entry, since the Eve is liturgically
  // the first Evensong of the upcoming feast. When today is an Eve we
  // store the override key here; otherwise null. The morning office
  // ignores this field; the evening office uses it in preference to
  // `lectionaryWeekKey`.
  eveLectionaryKey: string | null;
  sundayLabel: string;
  weekdayLabel: string;
  useAlleluia: boolean;
  // Proper Daily Office readings when today is a (possibly transferred) major
  // Holy Day; null on ordinary days (the weekday cycle via lectionaryWeekKey).
  holyDayReadings: HolyDayReadings | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000,
  );
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Easter (Anonymous Gregorian) ───────────────────────────────────────────────

export function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// ── Advent 1 ───────────────────────────────────────────────────────────────────

export function computeAdvent1(year: number): Date {
  // Sunday on or before Dec 3
  const dec3 = new Date(year, 11, 3);
  const dow = dec3.getDay();
  return addDays(dec3, -dow); // roll back to Sunday
}

// ── Liturgical Year (1 or 2) ───────────────────────────────────────────────────

export function getLiturgicalYear(date: Date): 1 | 2 {
  const d = startOfDay(date);
  const year = d.getFullYear();

  // Find most recent Advent 1 on or before this date
  let advent1 = computeAdvent1(year);
  if (advent1 > d) {
    advent1 = computeAdvent1(year - 1);
  }

  // The church year that starts on this Advent 1 runs into the NEXT civil year.
  // Year One: that next civil year is odd.
  // Year Two: that next civil year is even.
  const nextCivilYear = advent1.getFullYear() + 1;
  return nextCivilYear % 2 === 1 ? 1 : 2;
}

// ── Season ─────────────────────────────────────────────────────────────────────

export function getSeason(date: Date): LiturgicalSeason {
  const d = startOfDay(date);
  const year = d.getFullYear();

  const easter = computeEaster(year);
  const ashWednesday = addDays(easter, -46);
  const palmSunday = addDays(easter, -7);
  const holySaturday = addDays(easter, -1);
  const pentecost = addDays(easter, 49);

  // Check if we're in the Advent/Christmas zone that spans the year boundary
  const advent1ThisYear = computeAdvent1(year);

  // Holy Week: Palm Sunday through Holy Saturday
  if (d >= palmSunday && d <= holySaturday) return "holy_week";

  // Lent: Ash Wednesday through day before Palm Sunday
  if (d >= ashWednesday && d < palmSunday) return "lent";

  // Easter: Easter Day through day before Pentecost (Pentecost itself is included in Easter season)
  // Actually Pentecost is the last day of the Easter season
  if (d >= easter && d <= pentecost) return "easter";

  // Season after Pentecost: day after Pentecost through day before Advent 1
  if (d > pentecost && d < advent1ThisYear) return "season_after_pentecost";

  // Advent: Advent 1 through Dec 24
  if (d >= advent1ThisYear && d.getMonth() === 11 && d.getDate() < 25) return "advent";

  // Christmas: Dec 25 through Jan 5
  if (d.getMonth() === 11 && d.getDate() >= 25) return "christmas";
  if (d.getMonth() === 0 && d.getDate() <= 5) return "christmas";

  // Epiphany: Jan 6 through day before Ash Wednesday
  if (d.getMonth() === 0 && d.getDate() >= 6 && d < ashWednesday) return "epiphany";
  if (d.getMonth() >= 1 && d < ashWednesday) return "epiphany";

  // If before Epiphany in January (Jan 1-5), it's Christmas
  if (d.getMonth() === 0 && d.getDate() <= 5) return "christmas";

  // Fallback: if we haven't matched anything (shouldn't happen), check for
  // early-year season_after_pentecost scenario (won't happen with correct logic)
  // or late-year advent
  const advent1PrevYear = computeAdvent1(year - 1);
  if (d >= advent1PrevYear && d.getMonth() < 11) {
    // We're between last year's Advent and this year's dates
    // Jan 1-5 = christmas (handled above)
    // Jan 6+ before Ash Wednesday = epiphany (handled above)
  }

  return "season_after_pentecost";
}

// ── Proper Number ──────────────────────────────────────────────────────────────

const PROPER_ANCHOR_DATES: Array<[number, number]> = [
  // [month (0-indexed), day] — the Sunday closest to this date gets this Proper
  [4, 11],  // Proper 1
  [4, 18],  // Proper 2
  [4, 25],  // Proper 3
  [5, 1],   // Proper 4
  [5, 8],   // Proper 5
  [5, 15],  // Proper 6
  [5, 22],  // Proper 7
  [5, 29],  // Proper 8
  [6, 6],   // Proper 9
  [6, 13],  // Proper 10
  [6, 20],  // Proper 11
  [6, 27],  // Proper 12
  [7, 3],   // Proper 13
  [7, 10],  // Proper 14
  [7, 17],  // Proper 15
  [7, 24],  // Proper 16
  [7, 31],  // Proper 17
  [8, 7],   // Proper 18
  [8, 14],  // Proper 19
  [8, 21],  // Proper 20
  [8, 28],  // Proper 21
  [9, 5],   // Proper 22
  [9, 12],  // Proper 23
  [9, 19],  // Proper 24
  [9, 26],  // Proper 25
  [10, 2],  // Proper 26
  [10, 9],  // Proper 27
  [10, 16], // Proper 28
  [10, 23], // Proper 29
];

export function getProperNumber(date: Date): number | null {
  const d = startOfDay(date);
  if (getSeason(d) !== "season_after_pentecost") return null;

  const year = d.getFullYear();
  const advent1 = computeAdvent1(year);

  // Find the most recent Sunday on or before this date
  const dow = d.getDay();
  const sunday = dow === 0 ? d : addDays(d, -dow);

  // Last Sunday before Advent 1 is always Proper 29
  const lastSundayBeforeAdvent = addDays(advent1, -advent1.getDay() || -7);
  if (
    sunday.getTime() === startOfDay(lastSundayBeforeAdvent).getTime()
  ) {
    return 29;
  }

  // Find which Proper this Sunday is closest to
  let bestProper = 1;
  let bestDist = Infinity;
  for (let i = 0; i < PROPER_ANCHOR_DATES.length; i++) {
    const [m, day] = PROPER_ANCHOR_DATES[i];
    const anchor = new Date(year, m, day);
    const dist = Math.abs(daysBetween(anchor, sunday));
    if (dist < bestDist) {
      bestDist = dist;
      bestProper = i + 1;
    }
  }

  return bestProper;
}

// ── Week in Season ─────────────────────────────────────────────────────────────

function getWeekInSeason(date: Date, season: LiturgicalSeason): number {
  const d = startOfDay(date);
  const year = d.getFullYear();

  switch (season) {
    case "advent": {
      const advent1 = computeAdvent1(year);
      return Math.floor(daysBetween(advent1, d) / 7) + 1;
    }
    case "christmas": {
      const christmas =
        d.getMonth() === 11
          ? new Date(year, 11, 25)
          : new Date(year - 1, 11, 25);
      return Math.floor(daysBetween(christmas, d) / 7) + 1;
    }
    case "epiphany": {
      const epiphany = new Date(year, 0, 6);
      return Math.floor(daysBetween(epiphany, d) / 7) + 1;
    }
    case "lent": {
      const easter = computeEaster(year);
      const ashWed = addDays(easter, -46);
      return Math.floor(daysBetween(ashWed, d) / 7) + 1;
    }
    case "holy_week":
      return 1;
    case "easter": {
      const easter = computeEaster(year);
      return Math.floor(daysBetween(easter, d) / 7) + 1;
    }
    case "season_after_pentecost": {
      const easter = computeEaster(year);
      const pentecost = addDays(easter, 49);
      return Math.floor(daysBetween(pentecost, d) / 7) + 1;
    }
  }
}

// ── Fixed Feasts ───────────────────────────────────────────────────────────────

interface FeastInfo {
  name: string;
  isMajor: boolean;
  collectKey: string;
}

function getFixedFeast(date: Date): FeastInfo | null {
  const m = date.getMonth();
  const d = date.getDate();

  const feasts: Record<string, FeastInfo> = {
    "0-1": {
      name: "The Holy Name",
      isMajor: true,
      collectKey: "collect_holy_name",
    },
    "0-6": {
      name: "The Epiphany",
      isMajor: true,
      collectKey: "collect_epiphany",
    },
    "1-2": {
      name: "The Presentation",
      isMajor: true,
      collectKey: "collect_presentation",
    },
    "2-25": {
      name: "The Annunciation",
      isMajor: true,
      collectKey: "collect_annunciation",
    },
    "4-31": {
      name: "The Visitation",
      isMajor: true,
      collectKey: "collect_visitation",
    },
    "5-24": {
      name: "The Nativity of Saint John the Baptist",
      isMajor: true,
      collectKey: "collect_nativity_baptist",
    },
    "6-22": {
      name: "Saint Mary Magdalene",
      isMajor: false,
      collectKey: "collect_mary_magdalene",
    },
    "7-6": {
      name: "The Transfiguration",
      isMajor: true,
      collectKey: "collect_transfiguration",
    },
    "7-15": {
      name: "Saint Mary the Virgin",
      isMajor: true,
      collectKey: "collect_saint_mary",
    },
    "8-14": {
      name: "Holy Cross Day",
      isMajor: true,
      collectKey: "collect_holy_cross",
    },
    "8-21": {
      name: "Saint Matthew",
      isMajor: false,
      collectKey: "collect_saint_matthew",
    },
    "8-29": {
      name: "Saint Michael and All Angels",
      isMajor: true,
      collectKey: "collect_michaelmas",
    },
    "9-18": {
      name: "Saint Luke",
      isMajor: false,
      collectKey: "collect_saint_luke",
    },
    "9-28": {
      name: "Saint Simon and Saint Jude",
      isMajor: false,
      collectKey: "collect_simon_jude",
    },
    "10-1": {
      name: "All Saints' Day",
      isMajor: true,
      collectKey: "collect_all_saints",
    },
    "10-30": {
      name: "Saint Andrew",
      isMajor: false,
      collectKey: "collect_saint_andrew",
    },
    "11-21": {
      name: "Saint Thomas",
      isMajor: false,
      collectKey: "collect_saint_thomas",
    },
    "11-25": {
      name: "Christmas Day",
      isMajor: true,
      collectKey: "collect_christmas_1",
    },
    "11-26": {
      name: "Saint Stephen",
      isMajor: false,
      collectKey: "collect_saint_stephen",
    },
    "11-27": {
      name: "Saint John",
      isMajor: false,
      collectKey: "collect_saint_john",
    },
    "11-28": {
      name: "The Holy Innocents",
      isMajor: false,
      collectKey: "collect_holy_innocents",
    },
  };

  return feasts[`${m}-${d}`] ?? null;
}

// ── Feast precedence & transfer (BCP pp. 15-18) ───────────────────────────────
//
// A Major Feast on a fixed date can be outranked by the day it falls on, and is
// then transferred to the next open day — e.g. the Visitation (May 31) moves to
// June 1 in a year when May 31 is Trinity Sunday. Principal Feasts and the days
// of Holy Week and Easter Week displace every sanctoral feast; the privileged
// Sundays of Advent/Lent/Easter displace even the Feasts of our Lord; ordinary
// Sundays displace the saints' feasts but not the Feasts of our Lord.

function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

// Movable Principal Feasts — the only Principal Feasts that can share a fixed
// sanctoral feast's calendar date (and so displace it). The fixed Principal
// Feasts (Christmas, Epiphany, All Saints) already sit in the feast table, so a
// would-be transfer onto them is caught by the "already a Major Feast" guard.
function isMovablePrincipalFeast(date: Date): boolean {
  const easter = computeEaster(date.getFullYear());
  return isSameDay(date, easter)              // Easter Day
    || isSameDay(date, addDays(easter, 39))   // Ascension Day
    || isSameDay(date, addDays(easter, 49))   // The Day of Pentecost
    || isSameDay(date, addDays(easter, 56));  // Trinity Sunday
}

// Feasts of our Lord keep an ordinary Sunday; the other Major Feasts give way.
const FEASTS_OF_OUR_LORD = new Set<string>([
  "collect_holy_name", "collect_epiphany", "collect_presentation",
  "collect_annunciation", "collect_visitation", "collect_transfiguration",
  "collect_holy_cross",
]);
// The three fixed Principal Feasts are never displaced from their own day.
const FIXED_PRINCIPAL_FEASTS = new Set<string>([
  "collect_christmas_1", "collect_epiphany", "collect_all_saints",
]);

// Holy Week or Easter Week — feasts there defer to the week after Easter 2.
function isHolyOrEasterWeek(date: Date): boolean {
  if (getSeason(date) === "holy_week") return true;
  const easter = computeEaster(date.getFullYear());
  return date >= startOfDay(easter) && date <= startOfDay(addDays(easter, 6));
}

// Is `feast` displaced from its own native `date` by a higher observance?
function isFeastDisplaced(feast: FeastInfo, date: Date): boolean {
  if (FIXED_PRINCIPAL_FEASTS.has(feast.collectKey)) return false; // never displaced
  if (isMovablePrincipalFeast(date)) return true;
  if (isHolyOrEasterWeek(date)) return true;
  if (date.getDay() === 0) {
    const season = getSeason(date);
    if (season === "advent" || season === "lent" || season === "easter") return true;
    return !FEASTS_OF_OUR_LORD.has(feast.collectKey);
  }
  return false;
}

// Can a transferred feast land on `date`? Never onto a Sunday, a movable
// Principal Feast, Holy/Easter Week, or a day already claimed by a Major Feast.
function isOpenForTransfer(date: Date): boolean {
  if (date.getDay() === 0) return false;
  if (isMovablePrincipalFeast(date)) return false;
  if (isHolyOrEasterWeek(date)) return false;
  return !getFixedFeast(date)?.isMajor;
}

function firstOpenDayAfter(from: Date): Date {
  let d = addDays(from, 1);
  for (let i = 0; i < 40 && !isOpenForTransfer(d); i++) d = addDays(d, 1);
  return d;
}

// The Major Feast actually OBSERVED on `date`, honoring transfers: a feast
// displaced from an earlier date whose first open day is today wins; otherwise
// today's native feast, unless it is itself displaced. Minor feasts ride along
// unchanged (they only yield to a Major Feast transferred onto their day).
export function getObservedFeast(date: Date): FeastInfo | null {
  const d = startOfDay(date);
  for (let back = 1; back <= 35; back++) {
    const src = addDays(d, -back);
    const f = getFixedFeast(src);
    if (f?.isMajor && isFeastDisplaced(f, src) && isSameDay(firstOpenDayAfter(src), d)) {
      return f;
    }
  }
  const native = getFixedFeast(d);
  if (native?.isMajor && isFeastDisplaced(native, d)) return null;
  return native;
}

// ── Holy Days lectionary (BCP Daily Office, pp. 996-1000) ─────────────────────
//
// Proper Daily Office readings for the sanctoral Major Feasts — fixed every year
// (unlike the 2-year weekday cycle). Morning Prayer shows both MP lessons; our
// Evening Prayer renders one lesson, so it serves the second EP lesson (the New
// Testament / gospel one). Christmas, Holy Name, and the Epiphany are NOT here:
// they are seasonal day-by-day entries the date-keyed weekday lectionary already
// covers. Where the BCP gives an EP alternative (St. Mary, St. Michael) the
// first option is used.
export interface HolyDayReadings {
  mpPsalms: string[];
  mpLesson1: string;
  mpLesson2: string;
  epPsalms: string[];
  epLesson1: string; // the BCP's first EP lesson (kept for the record)
  epLesson2: string; // the EP lesson our single-lesson Evening Prayer renders
}

const HOLY_DAY_READINGS: Record<string, HolyDayReadings> = {
  collect_presentation: {
    mpPsalms: ["42", "43"], mpLesson1: "1 Sam. 2:1-10", mpLesson2: "John 8:31-36",
    epPsalms: ["48", "87"], epLesson1: "Hag. 2:1-9", epLesson2: "1 John 3:1-8",
  },
  collect_annunciation: {
    mpPsalms: ["85", "87"], mpLesson1: "Isa. 52:7-12", mpLesson2: "Heb. 2:5-10",
    epPsalms: ["110:1-5(6-7)", "132"], epLesson1: "Wisd. 9:1-12", epLesson2: "John 1:9-14",
  },
  collect_visitation: {
    mpPsalms: ["72"], mpLesson1: "1 Sam. 1:1-20", mpLesson2: "Heb. 3:1-6",
    epPsalms: ["146", "147"], epLesson1: "Zech. 2:10-13", epLesson2: "John 3:25-30",
  },
  collect_nativity_baptist: {
    mpPsalms: ["82", "98"], mpLesson1: "Mal. 3:1-5", mpLesson2: "John 3:22-30",
    epPsalms: ["80"], epLesson1: "Mal. 4:1-6", epLesson2: "Matt. 11:2-19",
  },
  collect_transfiguration: {
    mpPsalms: ["2", "24"], mpLesson1: "Exod. 24:12-18", mpLesson2: "2 Cor. 4:1-6",
    epPsalms: ["72"], epLesson1: "Dan. 7:9-10, 13-14", epLesson2: "John 12:27-36a",
  },
  collect_saint_mary: {
    mpPsalms: ["113", "115"], mpLesson1: "1 Sam. 2:1-10", mpLesson2: "John 2:1-12",
    epPsalms: ["45"], epLesson1: "Jer. 31:1-14", epLesson2: "John 19:23-27",
  },
  collect_holy_cross: {
    mpPsalms: ["66"], mpLesson1: "Num. 21:4-9", mpLesson2: "John 3:11-17",
    epPsalms: ["118"], epLesson1: "Gen. 3:1-15", epLesson2: "1 Pet. 3:17-22",
  },
  collect_michaelmas: {
    mpPsalms: ["8", "148"], mpLesson1: "Job 38:1-7", mpLesson2: "Heb. 1:1-14",
    epPsalms: ["34", "150"], epLesson1: "Dan. 12:1-3", epLesson2: "Mark 13:21-27",
  },
  collect_all_saints: {
    mpPsalms: ["111", "112"], mpLesson1: "2 Esdras 2:42-47", mpLesson2: "Heb. 11:32-12:2",
    epPsalms: ["148", "150"], epLesson1: "Wisd. 5:1-5, 14-16", epLesson2: "Rev. 21:1-4, 22-22:5",
  },
};

// ── Collect Key ────────────────────────────────────────────────────────────────

function getCollectKey(
  season: LiturgicalSeason,
  weekInSeason: number,
  dayOfWeek: number,
  properNumber: number | null,
  feast: FeastInfo | null,
  date: Date,
): string {
  // Major feasts override
  if (feast?.isMajor) return feast.collectKey;

  // Find the governing Sunday's collect
  switch (season) {
    case "advent":
      return `collect_advent_${Math.min(weekInSeason, 4)}`;
    case "christmas":
      return weekInSeason <= 1
        ? "collect_christmas_1"
        : "collect_christmas_2";
    case "epiphany": {
      if (weekInSeason === 1 && dayOfWeek === 0) return "collect_epiphany_1";
      // Last Sunday after Epiphany
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const ashWed = addDays(easter, -46);
      const lastEpiphanySun = addDays(ashWed, -(ashWed.getDay() || 7));
      if (dayOfWeek === 0 && startOfDay(date).getTime() === startOfDay(lastEpiphanySun).getTime()) {
        return "collect_last_epiphany";
      }
      return `collect_epiphany_${Math.min(weekInSeason, 8)}`;
    }
    case "lent": {
      // Ash Wednesday
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const ashWed = addDays(easter, -46);
      if (startOfDay(date).getTime() === startOfDay(ashWed).getTime()) {
        return "collect_ash_wednesday";
      }
      return `collect_lent_${Math.min(weekInSeason, 5)}`;
    }
    case "holy_week": {
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const palmSun = addDays(easter, -7);
      const diff = daysBetween(palmSun, date);
      if (diff === 0) return "collect_palm_sunday";
      if (diff === 1) return "collect_monday_holy_week";
      if (diff === 2) return "collect_tuesday_holy_week";
      if (diff === 3) return "collect_wednesday_holy_week";
      if (diff === 4) return "collect_maundy_thursday";
      if (diff === 5) return "collect_good_friday";
      if (diff === 6) return "collect_holy_saturday";
      return "collect_palm_sunday";
    }
    case "easter": {
      if (weekInSeason === 1 && dayOfWeek === 0) return "collect_easter_day";
      // Ascension Day: Easter + 39 days (always a Thursday)
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const ascension = addDays(easter, 39);
      if (startOfDay(date).getTime() === startOfDay(ascension).getTime()) {
        return "collect_ascension";
      }
      // Day of Pentecost
      const pentecost = addDays(easter, 49);
      if (startOfDay(date).getTime() === startOfDay(pentecost).getTime()) {
        return "collect_pentecost";
      }
      return `collect_easter_${Math.min(weekInSeason, 7)}`;
    }
    case "season_after_pentecost": {
      // Trinity Sunday: first Sunday after Pentecost
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const pentecost = addDays(easter, 49);
      const trinitySun = addDays(pentecost, 7 - (pentecost.getDay() || 7));
      // Actually Trinity Sunday = the Sunday after Pentecost
      // Pentecost is always a Sunday, so Trinity Sunday = Pentecost + 7
      const trinitySunday = addDays(pentecost, 7);
      if (
        dayOfWeek === 0 &&
        startOfDay(date).getTime() === startOfDay(trinitySunday).getTime()
      ) {
        return "collect_trinity_sunday";
      }
      if (properNumber) return `collect_proper_${properNumber}`;
      return "collect_proper_1";
    }
  }
}

// ── Antiphon Key ───────────────────────────────────────────────────────────────

function getAntiphonKey(season: LiturgicalSeason, date: Date): string {
  switch (season) {
    case "advent":
      return "antiphon_advent";
    case "christmas":
      return "antiphon_christmas";
    case "epiphany":
      return "antiphon_epiphany";
    case "lent":
      return "antiphon_lent";
    case "holy_week":
      // antiphon_holyweek is seeded but was never reached — Holy Week
      // fell through to the Lent antiphon. Route it to its own text.
      return "antiphon_holyweek";
    case "easter": {
      // Check if Ascension or after
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const ascension = addDays(easter, 39);
      const pentecost = addDays(easter, 49);
      if (date >= pentecost) return "antiphon_pentecost";
      if (date >= ascension) return "antiphon_ascension";
      return "antiphon_easter";
    }
    case "season_after_pentecost": {
      // Trinity Sunday uses antiphon_trinity
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const pentecost = addDays(easter, 49);
      const trinitySunday = addDays(pentecost, 7);
      if (
        date.getDay() === 0 &&
        startOfDay(date).getTime() === startOfDay(trinitySunday).getTime()
      ) {
        return "antiphon_trinity";
      }
      return "antiphon_anytime";
    }
  }
}

// ── Invitatory Season ──────────────────────────────────────────────────────────

function getInvitatorySeason(season: LiturgicalSeason): string {
  switch (season) {
    case "easter":
      return "easter";
    case "lent":
      return "lent";
    case "holy_week":
      return "holy_week";
    case "advent":
      return "advent";
    case "christmas":
      return "christmas";
    case "epiphany":
      return "epiphany";
    case "season_after_pentecost":
      return "default";
  }
}

// ── Lectionary Week Key ────────────────────────────────────────────────────────

function getLectionaryWeekKey(
  date: Date,
  season: LiturgicalSeason,
  weekInSeason: number,
  dayOfWeek: number,
  properNumber: number | null,
): string {
  const dayName = DAY_KEYS[dayOfWeek];

  // ── Fixed-date and movable-feast overrides ──
  // The lectionary file has dedicated entries for the Twelve Days of
  // Christmas (by date), Ash Wednesday, Pentecost (Eve and Day),
  // Trinity (Eve and Day), Ascension Eve, and the Last Week after
  // Epiphany — keys not produced by the regular weekly pattern.
  // Sundays in the Christmas range still defer to christmas_<n>_sunday
  // since those drive the Sunday cycle independent of the calendar
  // date.
  const m = date.getMonth();
  const dom = date.getDate();
  const year = date.getFullYear();
  const sameDay = (a: Date, b: Date) =>
    startOfDay(a).getTime() === startOfDay(b).getTime();

  // Christmas Day (Dec 25) always uses its proper, even on a Sunday.
  if (m === 11 && dom === 25) return "christmas_dec25";
  // Holy Name (Jan 1) always uses its proper.
  if (m === 0 && dom === 1) return "christmas_jan1";
  // Other Christmas-octave days: Sundays use the christmas_<n>_sunday
  // cycle; weekdays use the date-keyed entry.
  if (m === 11 && dom >= 26 && dom <= 31 && dayOfWeek !== 0) {
    return `christmas_dec${dom}`;
  }
  if (m === 0 && dom >= 2 && dom <= 5 && dayOfWeek !== 0) {
    return `christmas_jan${dom}`;
  }

  // Easter-relative special days
  const easter = computeEaster(year);
  const ashWed = addDays(easter, -46);
  const ascensionDay = addDays(easter, 39); // 40th day of Easter (Thu)
  const ascensionEve = addDays(ascensionDay, -1);
  const pentecost = addDays(easter, 49);
  const pentecostEve = addDays(pentecost, -1);
  const trinitySunday = addDays(pentecost, 7);
  const trinityEve = addDays(trinitySunday, -1);

  if (sameDay(date, ashWed)) return "ash_wednesday";
  if (sameDay(date, pentecost)) return "pentecost";
  if (sameDay(date, trinitySunday)) return "trinity_sunday";
  // Note: ascension_eve / pentecost_eve / trinity_eve are evening-only
  // overrides — see getEveLectionaryKey below. Falling through here
  // means the weekday entry (e.g. easter_6_wednesday) handles morning.

  // Last Week after the Epiphany — the lectionary covers Sun/Mon/Tue
  // before Ash Wed, then Thu/Fri/Sat after Ash Wed (the days between
  // Ash Wednesday and the First Sunday in Lent), all under the
  // `epiphany_last_<day>` key. Ash Wed itself is handled above.
  const lastEpiphanySunday = addDays(ashWed, -((ashWed.getDay() || 7)));
  const lastEpiphanyEnd = addDays(ashWed, 3); // Saturday after Ash Wed
  if (date >= startOfDay(lastEpiphanySunday) && date <= startOfDay(lastEpiphanyEnd)) {
    return `epiphany_last_${dayName}`;
  }

  switch (season) {
    case "advent":
      return `advent_${weekInSeason}_${dayName}`;
    case "christmas":
      return `christmas_${weekInSeason}_${dayName}`;
    case "epiphany":
      return `epiphany_${weekInSeason}_${dayName}`;
    case "lent":
      return `lent_${weekInSeason}_${dayName}`;
    case "holy_week":
      return `holyweek_${dayName}`;
    case "easter":
      return `easter_${weekInSeason}_${dayName}`;
    case "season_after_pentecost":
      return `proper_${properNumber ?? 1}_${dayName}`;
  }
}

// ── Eve Lectionary Key (evening-only override) ────────────────────────────────
//
// "Eve of …" entries in the BCP 1979 Daily Office Lectionary refer to
// the evening office (First Evensong) of the day before a holy day, not
// to the full 24-hour day. Morning Prayer on those calendar dates uses
// the regular weekday entry (e.g. Wed in Easter 6 for May 13, 2026,
// which serves Psalm 119:97-120). Only Evening Prayer should pull from
// the eve entry. Returns the eve key when today is such a date, else
// null. The morning office never touches this; the evening office
// prefers it over the weekday key.
function getEveLectionaryKey(date: Date): string | null {
  const year = date.getFullYear();
  const easter = computeEaster(year);
  const ascensionDay = addDays(easter, 39);
  const ascensionEve = addDays(ascensionDay, -1);
  const pentecost = addDays(easter, 49);
  const pentecostEve = addDays(pentecost, -1);
  const trinitySunday = addDays(pentecost, 7);
  const trinityEve = addDays(trinitySunday, -1);
  const sameDay = (a: Date, b: Date) =>
    startOfDay(a).getTime() === startOfDay(b).getTime();

  if (sameDay(date, ascensionEve)) return "ascension_eve";
  if (sameDay(date, pentecostEve)) return "pentecost_eve";
  if (sameDay(date, trinityEve)) return "trinity_eve";
  return null;
}

// ── Labels ─────────────────────────────────────────────────────────────────────

function getSundayLabel(
  season: LiturgicalSeason,
  weekInSeason: number,
  properNumber: number | null,
  feast: FeastInfo | null,
  date: Date,
): string {
  if (feast?.isMajor) return feast.name;

  switch (season) {
    case "advent":
      return `The ${ordinal(weekInSeason)} Sunday of Advent`;
    case "christmas":
      return weekInSeason === 1
        ? "Christmas Day"
        : `The ${ordinal(weekInSeason)} Sunday after Christmas`;
    case "epiphany": {
      if (weekInSeason === 1) return "The First Sunday after the Epiphany";
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const ashWed = addDays(easter, -46);
      const lastSun = addDays(ashWed, -(ashWed.getDay() || 7));
      if (startOfDay(date).getTime() === startOfDay(lastSun).getTime()) {
        return "The Last Sunday after the Epiphany";
      }
      return `The ${ordinal(weekInSeason)} Sunday after the Epiphany`;
    }
    case "lent":
      return weekInSeason === 1
        ? "The First Sunday in Lent"
        : `The ${ordinal(weekInSeason)} Sunday in Lent`;
    case "holy_week":
      return "Palm Sunday";
    case "easter": {
      if (weekInSeason === 1) return "Easter Day";
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const pentecost = addDays(easter, 49);
      if (startOfDay(date).getTime() === startOfDay(pentecost).getTime()) {
        return "The Day of Pentecost";
      }
      return `The ${ordinal(weekInSeason)} Sunday of Easter`;
    }
    case "season_after_pentecost": {
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const pentecost = addDays(easter, 49);
      const trinitySunday = addDays(pentecost, 7);
      if (startOfDay(date).getTime() === startOfDay(trinitySunday).getTime()) {
        return "Trinity Sunday";
      }
      if (properNumber) return `Proper ${properNumber}`;
      return "Season after Pentecost";
    }
  }
}

function getWeekdayLabel(
  season: LiturgicalSeason,
  weekInSeason: number,
  dayOfWeek: number,
  properNumber: number | null,
  feast: FeastInfo | null,
  date: Date,
): string {
  if (feast) return feast.name;

  const dayName = DAY_NAMES[dayOfWeek];

  if (dayOfWeek === 0) {
    return getSundayLabel(season, weekInSeason, properNumber, null, date);
  }

  switch (season) {
    case "advent":
      return `${dayName} in the ${ordinal(weekInSeason)} Week of Advent`;
    case "christmas":
      return `${dayName} after Christmas`;
    case "epiphany":
      return `${dayName} in the ${ordinal(weekInSeason)} Week after the Epiphany`;
    case "lent": {
      // Check for Ash Wednesday
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const ashWed = addDays(easter, -46);
      if (startOfDay(date).getTime() === startOfDay(ashWed).getTime()) {
        return "Ash Wednesday";
      }
      return `${dayName} in the ${ordinal(weekInSeason)} Week of Lent`;
    }
    case "holy_week": {
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const palmSun = addDays(easter, -7);
      const diff = daysBetween(palmSun, date);
      if (diff === 4) return "Maundy Thursday";
      if (diff === 5) return "Good Friday";
      if (diff === 6) return "Holy Saturday";
      return `${dayName} in Holy Week`;
    }
    case "easter": {
      const year = date.getFullYear();
      const easter = computeEaster(year);
      const ascension = addDays(easter, 39);
      if (startOfDay(date).getTime() === startOfDay(ascension).getTime()) {
        return "Ascension Day";
      }
      return `${dayName} in the ${ordinal(weekInSeason)} Week of Easter`;
    }
    case "season_after_pentecost": {
      if (properNumber) {
        return `${dayName} · Proper ${properNumber}`;
      }
      return `${dayName} after Pentecost`;
    }
  }
}

// ── Main Entry Point ───────────────────────────────────────────────────────────

export function getOfficeDay(date: Date): LiturgicalDay {
  const d = startOfDay(date);
  const dayOfWeek = d.getDay();
  const season = getSeason(d);
  const weekInSeason = getWeekInSeason(d, season);
  const properNumber = getProperNumber(d);
  const feast = getObservedFeast(d);
  const holyDayReadings = feast ? HOLY_DAY_READINGS[feast.collectKey] ?? null : null;
  const liturgicalYear = getLiturgicalYear(d);
  const collectKey = getCollectKey(
    season,
    weekInSeason,
    dayOfWeek,
    properNumber,
    feast,
    d,
  );
  const antiphonKey = getAntiphonKey(season, d);
  const invitatorySeason = getInvitatorySeason(season);
  const lectionaryWeekKey = getLectionaryWeekKey(
    d,
    season,
    weekInSeason,
    dayOfWeek,
    properNumber,
  );
  const eveLectionaryKey = getEveLectionaryKey(d);
  const sundayLabel = getSundayLabel(
    season,
    weekInSeason,
    properNumber,
    feast,
    d,
  );
  const weekdayLabel = getWeekdayLabel(
    season,
    weekInSeason,
    dayOfWeek,
    properNumber,
    feast,
    d,
  );
  const useAlleluia = season !== "lent" && season !== "holy_week";

  return {
    date: d,
    liturgicalYear,
    season,
    weekInSeason,
    dayOfWeek,
    properNumber,
    isFeast: feast !== null,
    feastName: feast?.name ?? null,
    isMajorFeast: feast?.isMajor ?? false,
    collectKey,
    antiphonKey,
    invitatorySeason,
    lectionaryWeekKey,
    eveLectionaryKey,
    sundayLabel,
    weekdayLabel,
    useAlleluia,
    holyDayReadings,
  };
}
