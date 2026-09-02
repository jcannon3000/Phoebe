/**
 * The icons this person has prayed with, most recent first.
 *
 * Owner: "the final card shows their recent icons they've done — the most
 * recent three." Same shape and same reasoning as lib/visioHistory.ts:
 * device-local on purpose (it's a record of looking, not an account object,
 * and the practice is guest-allowed), read defensively, capped small.
 *
 * Unlike Visio's history this one has no selection to poison — the icon is
 * always CHOSEN BY THE PERSON, never by the day — so there is no "must never
 * feed selection" rule to keep here. It only feeds the closing cards.
 */

const KEY = "phoebe:icon-history";
const CAP = 30;

export type IconPrayed = {
  id: number;
  ymd: string;
  /**
   * How many times this icon has been prayed with.
   *
   * Added because recordIconPrayed DE-DUPLICATES — re-praying an icon moves it
   * to the front rather than appending — so the history had no way to answer
   * "which do I return to most", which is exactly what the owner asked the
   * second week-door to show. Optional, and read as 1 when absent, so entries
   * written before this field keep working rather than counting as zero.
   */
  count?: number;
};

export function getIconHistory(): IconPrayed[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is IconPrayed =>
        !!v && typeof v === "object" &&
        typeof (v as IconPrayed).id === "number" &&
        typeof (v as IconPrayed).ymd === "string",
    );
  } catch {
    return [];
  }
}

/** Record a completed icon prayer. Re-praying an icon moves it to the front
 *  rather than duplicating it — "recent" is about the icon, not the sitting. */
export function recordIconPrayed(id: number, ymd: string): void {
  try {
    const all = getIconHistory();
    const prior = all.find((v) => v.id === id);
    const rest = all.filter((v) => v.id !== id);
    // Carry the count forward and add one. An entry from before `count`
    // existed counts as the single sitting it represents, not as zero.
    const count = (prior?.count ?? (prior ? 1 : 0)) + 1;
    localStorage.setItem(KEY, JSON.stringify([{ id, ymd, count }, ...rest].slice(0, CAP)));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/**
 * The icon most recently prayed with — the history is newest-first, so this is
 * simply the head.
 *
 * NOT the same question as iconWeek's lastWeekIconId(), which answers "what was
 * pinned to LAST WEEK'S Sunday". That is a weekly-rhythm answer, and using it
 * for "the one you sat with last" is what made the door name an icon the reader
 * had not just prayed (owner: "first it goes through an icon, then that icon is
 * not the one that it says was the last one").
 */
export function lastIconPrayed(): IconPrayed | null {
  return getIconHistory()[0] ?? null;
}

/**
 * The icon returned to most often, ignoring `excludeId` so the two week doors
 * never name the same work twice.
 *
 * Ties break toward the more recent, since the history is newest-first and
 * reduce keeps the first strict maximum. Returns null when nothing has been
 * prayed more than once — "you return to this one most" is a claim, and one
 * sitting does not support it.
 */
export function mostFrequentIcon(excludeId?: number): IconPrayed | null {
  const pool = getIconHistory().filter((v) => v.id !== excludeId && (v.count ?? 1) > 1);
  if (pool.length === 0) return null;
  return pool.reduce((best, v) => ((v.count ?? 1) > (best.count ?? 1) ? v : best), pool[0]!);
}

/**
 * A PHYSICAL icon — one the person prays with in their own space, away from
 * the app (owner: "as if it's a physical icon they're using in their physical
 * space… they're doing it away from the Phoebe app"). Logging-first, the way
 * Audio Divina treats music: the app records that the prayer happened and WHO
 * the icon is of, nothing more. Named entries, not catalogue ids — their icon
 * isn't in any catalogue.
 */
const PHYSICAL_KEY = "phoebe:icon-physical-log";

export type PhysicalIconLog = { name: string; ymd: string };

export function getPhysicalIconLogs(): PhysicalIconLog[] {
  try {
    const raw = localStorage.getItem(PHYSICAL_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is PhysicalIconLog =>
        !!v && typeof v === "object" &&
        typeof (v as PhysicalIconLog).name === "string" &&
        typeof (v as PhysicalIconLog).ymd === "string",
    );
  } catch {
    return [];
  }
}

/** Re-logging the same icon (case-insensitively) moves it to the front with
 *  today's date — the previous-logs list is "your icons", not a diary. */
export function recordPhysicalIcon(name: string, ymd: string): void {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return;
  try {
    const rest = getPhysicalIconLogs().filter((v) => v.name.toLowerCase() !== clean.toLowerCase());
    localStorage.setItem(PHYSICAL_KEY, JSON.stringify([{ name: clean, ymd }, ...rest].slice(0, CAP)));
  } catch {
    /* private mode / quota — non-fatal */
  }
}
