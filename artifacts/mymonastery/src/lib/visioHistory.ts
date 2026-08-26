/**
 * The artworks this reader has looked at, most recent first.
 *
 * ONE job: the closing beat shows them back — a small gallery of what they've
 * been looking at lately, tappable to return to any of them. (Owner: "show the
 * pictures they looked at recently, and they can click into them, kinda like
 * the audio divina.")
 *
 * IT DOES NOT FEED SELECTION, AND MUST NEVER AGAIN. An earlier version
 * subtracted this history inside chooseArtwork so tomorrow would "land
 * somewhere new" — which quietly made the day's image PERSONAL, when the
 * owner's rule is that everyone praying Visio on a given day sees the SAME
 * work. chooseArtwork is now a pure function of (date, appointed lessons);
 * day-to-day freshness comes from the date's ordinal walking a repeated
 * reading through its matches, and "same all day" falls out because there is
 * no state to drift. This header used to describe the subtracted design as
 * current — precisely the comment-rot that invites the third rewiring (it has
 * been removed twice already). If you're here to make tomorrow's picture
 * depend on what THIS device has seen: don't.
 *
 * Device-local on purpose: it's a reading history, not a record of prayer, and
 * the practice is guest-allowed — there's no account to hang it on.
 */

const KEY = "phoebe:visio-history";
/** Deep enough that a daily reader doesn't loop; short enough to stay small. */
const CAP = 60;

/** `felt` — up to three emoji for what the looking felt like, optional. The
 *  same wordless log Audio Divina keeps; device-local, like the rest of this. */
export type VisioSeen = { id: number; ymd: string; felt?: string };

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
    // `felt` is optional and was added later — entries written before it
    // simply don't carry one, which is why it isn't part of the guard.
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
    const prior = getVisioHistory();
    // Keep anything already felt about this day's work: the record is written
    // on arrival, the emoji is added at the close, and re-recording must not
    // wipe it.
    const kept = prior.find((v) => v.ymd === ymd && v.id === id)?.felt;
    const rest = prior.filter((v) => v.ymd !== ymd && v.id !== id);
    localStorage.setItem(KEY, JSON.stringify([{ id, ymd, ...(kept ? { felt: kept } : {}) }, ...rest].slice(0, CAP)));
  } catch { /* private mode, quota — the practice works without a memory */ }
}

/** Up to three emoji for what today's looking felt like. Written at the close
 *  of the deck, onto the entry recordVisioSeen already made. */
export function recordVisioFelt(ymd: string, felt: string): void {
  try {
    const all = getVisioHistory();
    const i = all.findIndex((v) => v.ymd === ymd);
    if (i < 0) return;
    const next = [...all];
    next[i] = felt ? { ...next[i]!, felt } : { id: next[i]!.id, ymd: next[i]!.ymd };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* non-fatal */ }
}
