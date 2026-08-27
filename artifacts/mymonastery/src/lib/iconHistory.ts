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

export type IconPrayed = { id: number; ymd: string };

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
    const rest = getIconHistory().filter((v) => v.id !== id);
    localStorage.setItem(KEY, JSON.stringify([{ id, ymd }, ...rest].slice(0, CAP)));
  } catch {
    /* private mode / quota — non-fatal */
  }
}
