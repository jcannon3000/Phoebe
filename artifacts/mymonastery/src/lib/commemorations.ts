// ── Every commemoration, all year ───────────────────────────────────────────
//
// Owner, 2026-09-18: "Do we have a catalouge of the saint haigriophies?" …
// "like from the forward page could we scrape the names of those of all the
// commerations, then list them, and if someone clicks on one, then can open
// the reader view of the page even if its not the day?"
//
// NOTHING IS SCRAPED, because nothing needs to be. The app already holds both
// halves and they join on the date:
//   • the NAMES — lesser-feasts.ts (243) and fixed-feasts.ts (33), our own
//     calendar tables, already used for the feast line under the date;
//   • the PAGES — forwardMovementCalendar.ts, 277 dated slugs on
//     prayer.forwardmovement.org.
// Joined by month-day that covers 275 of their 277; the last two are named
// here by hand, below. A scrape would have added a fetch, a cache and a way
// to go stale, to arrive at a list we can derive for nothing.
//
// KEYED BY DATE, NOT BY NAME — the same reason forwardMovementCalendar gives:
// their titles and ours differ for the same day ("The Martyrs of Memphis" vs
// our longer listing), so a name match would miss exactly the entries a reader
// most wants.
//
// WHAT THIS HOLDS IS A NAME AND A DATE — both plain facts of the calendar. The
// lives and the collects stay where they are published: Forward Movement's
// pages carry them under permission from the Domestic and Foreign Missionary
// Society for Lesser Feasts and Fasts 2024, and that permission is theirs, not
// ours. So a tap opens THEIR page in the in-app reader, notice intact, exactly
// as the feast line under today's date already does. Nothing is copied.

import { LESSER_FEASTS } from "@/lib/liturgical/lesser-feasts";
import { HOLY_DAYS } from "@/lib/liturgical/fixed-feasts";
import { forwardMovementDates, forwardMovementUrlFor } from "@/lib/liturgical/forwardMovementCalendar";

export type Commemoration = {
  month: number;
  day: number;
  /** "January 17" — for the row and for searching by date. */
  when: string;
  name: string;
  /** The year(s) they died, where our table carries it. */
  life: string | null;
  /** A principal feast reads differently from a lesser feast in the list. */
  major: boolean;
  /** Forward Movement's page for this day. */
  url: string;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * The two days Forward Movement publishes that neither of our tables names.
 * Named here rather than left blank, because a row reading only "December 11"
 * tells a reader nothing about whether to open it.
 */
const EXTRA_NAMES: Record<string, string> = {
  "12-11": "Frederick Bingham Howden, Bishop",
  "8-26": "Simeon Bachos, the Ethiopian Eunuch",
};

let cache: Commemoration[] | null = null;

/** Every commemoration with a page to open, in calendar order. */
export function allCommemorations(): Commemoration[] {
  if (cache) return cache;
  const byDate = new Map<string, { name: string; life: string | null; major: boolean }>();
  // Lesser feasts first, then the holy days OVERWRITE them: where a day
  // carries both, the principal feast is the one the calendar keeps.
  for (const e of LESSER_FEASTS) {
    byDate.set(`${e.month}-${e.day}`, { name: e.name, life: e.life ?? null, major: false });
  }
  for (const e of HOLY_DAYS) {
    byDate.set(`${e.month}-${e.day}`, { name: e.name, life: e.life ?? null, major: true });
  }
  const out: Commemoration[] = [];
  for (const [month, day] of forwardMovementDates()) {
    const key = `${month}-${day}`;
    const url = forwardMovementUrlFor(month, day);
    if (!url) continue;
    const found = byDate.get(key);
    const name = found?.name ?? EXTRA_NAMES[key];
    // No name from any source: skip rather than show a bare date.
    if (!name) continue;
    out.push({
      month, day,
      when: `${MONTHS[month - 1]} ${day}`,
      name,
      life: found?.life ?? null,
      major: found?.major ?? false,
      url,
    });
  }
  cache = out;
  return out;
}

function norm(s: string): string {
  try { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  catch { return s.toLowerCase(); }
}

/** Search by name, by date ("march 17"), or by year. */
export function searchCommemorations(query: string): Commemoration[] {
  const all = allCommemorations();
  const q = norm(query.trim());
  if (!q) return all;
  const words = q.split(/\s+/).filter(Boolean);
  return all.filter((c) => {
    const hay = norm(`${c.name} ${c.when} ${c.life ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
}
