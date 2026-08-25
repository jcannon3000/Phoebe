/**
 * The artworks this reader has looked at, most recent first.
 *
 * Two jobs, and the second is the reason it exists at all:
 *
 *  1. The closing beat shows them back — a small gallery of what they've been
 *     looking at lately, tappable to return to any of them. (Owner: "show the
 *     pictures they looked at recently, and they can click into them, kinda
 *     like the audio divina.")
 *
 *  2. It keeps the practice FRESH. Owner: "make sure that it's gonna be
 *     different every time, like, it's a newsletter." Lectionary matching
 *     alone can't promise that — Holy Week appoints the same Passion narrative
 *     several days running, and the same handful of paintings match it — so
 *     visioSelect subtracts what's already here before it chooses. With 233
 *     works and a 60-deep memory, a daily reader goes two months without a
 *     repeat, and longer than that in practice because the lectionary keeps
 *     moving them around the collection.
 *
 * Device-local on purpose: it's a reading history, not a record of prayer, and
 * the practice is guest-allowed — there's no account to hang it on.
 */

const KEY = "phoebe:visio-history";
/** Deep enough that a daily reader doesn't loop; short enough to stay small. */
const CAP = 60;

export type VisioSeen = { id: number; ymd: string };

export function getVisioHistory(): VisioSeen[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Written by an older shape, hand-edited, or half-written — read
    // defensively rather than letting one bad row throw on every open.
    return parsed.filter(
      (v): v is VisioSeen =>
        !!v && typeof v === "object" &&
        typeof (v as VisioSeen).id === "number" &&
        typeof (v as VisioSeen).ymd === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Record today's artwork.
 *
 * Keyed by DAY as well as id: today's entry is what pins the choice, so
 * re-opening the practice at lunchtime returns the same painting rather than
 * choosing a fresh one (see visioSelect.chooseArtwork). Re-recording the same
 * day is idempotent.
 */
export function recordVisioSeen(id: number, ymd: string): void {
  try {
    const rest = getVisioHistory().filter((v) => v.ymd !== ymd && v.id !== id);
    localStorage.setItem(KEY, JSON.stringify([{ id, ymd }, ...rest].slice(0, CAP)));
  } catch { /* private mode, quota — the practice works without a memory */ }
}
