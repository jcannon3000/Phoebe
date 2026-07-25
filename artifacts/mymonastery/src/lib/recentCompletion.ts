// A single shared "something on the rhythm was just completed" timestamp.
//
// Owner report: cards on the home rhythm jump straight from Next to Done with
// no visible transition, because the underlying state (localStorage flags,
// server rows) is already final by the time the user navigates back from the
// practice page — there's nothing left to animate BY THEN. Rather than thread
// a "just completed" flag through every practice's own tracker, every
// completion marker stamps this one shared key; DailyProgressBody checks it
// once on mount and, if the stamp is fresh, holds the Done section's entrance
// animation for a beat so the reveal actually plays once the user is back.
const KEY = "phoebe:recent-completion-at";

/** Call from a completion marker the moment a practice is freshly finished. */
export function markRecentCompletion(): void {
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* non-fatal */ }
}

/** True if some practice completed within the last `windowMs` (default 15s —
 *  comfortably longer than the walk back from a practice page to Home). */
export function wasRecentlyCompleted(windowMs = 15_000): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < windowMs;
  } catch {
    return false;
  }
}
