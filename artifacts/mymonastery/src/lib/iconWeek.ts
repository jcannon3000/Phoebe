// The icon you sit with for a week.
//
// Owner: "the icon practice … in a Monday to Sunday week. They pick an icon to
// sit with, and once they choose it, that's the one that comes up." And on the
// first open of a new week: "the one they did last week, an option for the one
// they did last week — choose new one, continue, or a third one that's
// suggested based on the readings for Sunday."
//
// The week is MONDAY→SUNDAY, keyed to the Sunday it CLOSES on — the same
// convention and the same arithmetic as the Visio schedule, so a stored pick
// expires on the right day. Getting this wrong once already cost a whole
// schedule being a day out.

import { ICON_WEEK_SCHEDULE, type IconWeekPick } from "@/lib/iconSchedule";

const PICK_KEY = "phoebe:icon-week-pick";

export type StoredWeekPick = { sunday: string; id: number };

/** A date as YYYY-MM-DD in LOCAL terms — the day the calendar will read. */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The Sunday this week is walking TOWARD. A Sunday belongs to the week it
 * closes, so it maps to itself.
 *
 * LOCAL day parts on a local-noon date, deliberately: mixing UTC parts with a
 * local-parts reader is what put the Visio schedule a day out for everyone
 * west of Greenwich.
 */
export function weekSundayOf(now: Date = new Date()): string {
  const d = new Date(`${ymd(now)}T12:00:00`);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return ymd(d);
}

function readStored(): StoredWeekPick[] {
  try {
    const raw = localStorage.getItem(PICK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is StoredWeekPick =>
        !!p && typeof p.sunday === "string" && typeof p.id === "number",
    );
  } catch {
    return [];
  }
}

/**
 * Remember this week's icon.
 *
 * Keeps the last few weeks rather than only the current one, because "the one
 * you sat with last week" is itself one of the three doors — throwing the old
 * key away on every write would delete the very thing the first door offers.
 */
export function setWeekIcon(id: number, now: Date = new Date()): void {
  const sunday = weekSundayOf(now);
  const kept = readStored().filter((p) => p.sunday !== sunday).slice(0, 7);
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify([{ sunday, id }, ...kept]));
  } catch {
    /* private mode — the choice just won't outlive the visit */
  }
}

/** This week's chosen icon id, if they have chosen one. */
export function weekIconId(now: Date = new Date()): number | null {
  const sunday = weekSundayOf(now);
  return readStored().find((p) => p.sunday === sunday)?.id ?? null;
}

/**
 * LAST week's icon id — the "continue" door.
 *
 * Strictly the week before this one, not "the most recent stored pick": after
 * a month away, offering a January icon as "the one from last week" would be a
 * lie, and the door simply shouldn't appear.
 */
export function lastWeekIconId(now: Date = new Date()): number | null {
  const prev = new Date(`${ymd(now)}T12:00:00`);
  prev.setDate(prev.getDate() - 7);
  const sunday = weekSundayOf(prev);
  return readStored().find((p) => p.sunday === sunday)?.id ?? null;
}

/** The suggestion for this week, from the generated schedule. */
export function suggestedForWeek(now: Date = new Date()): IconWeekPick | null {
  return ICON_WEEK_SCHEDULE[weekSundayOf(now)] ?? null;
}

/**
 * Why the suggestion was made — SAID ONLY WHEN IT IS TRUE ENOUGH TO SAY.
 *
 * "day" is ACT's own liturgical-day tag and "gospel"/"nt" are real passage
 * matches; those are worth naming. "book" means the connection is a book name
 * and "any" means nothing lined up, and dressing either as a reason is the
 * overclaim the owner has already corrected once on Visio — shown an image
 * captioned with a passage that wasn't that week's, he said "if it is not
 * actually the passage from this week, dont have it say the verse." A weak
 * reason stated confidently is worse than no reason, and 24 of 100 weeks are
 * "book", so this is most of the difference.
 */
export function suggestionReason(pick: IconWeekPick | null): string | null {
  if (!pick) return null;
  if (pick.how === "day") return "Chosen for this Sunday";
  if (pick.how === "gospel") return pick.ref ? `Chosen for this Sunday's gospel · ${pick.ref}` : "Chosen for this Sunday's gospel";
  if (pick.how === "nt") return pick.ref ? `Chosen for this Sunday's reading · ${pick.ref}` : "Chosen for this Sunday's reading";
  return null;
}
