/**
 * The spirituals this person has sat with, most recent first.
 *
 * Same shape and same reasoning as lib/iconHistory.ts and lib/visioHistory.ts:
 * device-local on purpose (it's a record of praying, not an account object,
 * and the practice is guest-allowed), read defensively, capped small.
 *
 * `line` is the line they chose to carry away. It is kept because it is the
 * one part of the practice that is theirs rather than the day's — the closing
 * card shows it back, and a song returned to months later shows what they held
 * onto last time.
 */

const KEY = "phoebe:spirituals-history";
const CAP = 30;

export type SpiritualSat = {
  /** The song's number in the book. */
  number: number;
  /** Local ISO day (en-CA), matching every other rhythm surface. */
  ymd: string;
  /** The line they sat with, if they chose one. */
  line?: string;
};

export function getSpiritualsHistory(): SpiritualSat[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SpiritualSat =>
        !!v && typeof v === "object" &&
        typeof (v as SpiritualSat).number === "number" &&
        typeof (v as SpiritualSat).ymd === "string",
    );
  } catch {
    return [];
  }
}

/** Record a completed sitting. Returning to a song moves it to the front
 *  rather than duplicating it — "recent" is about the song, not the sitting. */
export function recordSpiritualSat(number: number, ymd: string, line?: string): void {
  try {
    const rest = getSpiritualsHistory().filter((v) => v.number !== number);
    localStorage.setItem(KEY, JSON.stringify([{ number, ymd, line }, ...rest].slice(0, CAP)));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/** The line carried away from this song last time, if there was one. */
export function lastLineFor(number: number): string | null {
  return getSpiritualsHistory().find((v) => v.number === number)?.line ?? null;
}
