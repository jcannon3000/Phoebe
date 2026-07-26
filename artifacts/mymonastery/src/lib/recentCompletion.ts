// Which rhythm card was JUST completed, so the home screen can play the
// completion moment instead of silently rendering the card already in Done.
//
// The problem this solves: a practice finishes on its own page, so by the time
// the user walks back to the home the state is already final — the card has
// simply teleported into Done with nothing to see. Recording the card's key
// (not just "something happened") lets the home pin that ONE card in Next,
// animate its CTA into a checkmark, and then move it down to Done while the
// user is watching.
//
// Keys match the card `key`s in DailyProgressBody's card list — "morning",
// "evening", "contemplation-morning", "examen", "reflect-fdd", "custom-<id>",
// and so on — so the home can match a stamp to exactly one card.

const KEY = "phoebe:recent-completion";

export type RecentCompletion = { key: string; at: number };

/** Call from a completion marker the moment a practice is freshly finished. */
export function markRecentCompletion(cardKey: string): void {
  if (!cardKey) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ key: cardKey, at: Date.now() }));
  } catch { /* private mode / quota — non-fatal */ }
}

/** The card completed within the last `windowMs`, or null. The window is
 *  generous enough to cover the walk back from a practice page but short
 *  enough that re-opening the app later never replays the moment. */
export function readRecentCompletion(windowMs = 20_000): RecentCompletion | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecentCompletion>;
    if (!parsed || typeof parsed.key !== "string" || typeof parsed.at !== "number") return null;
    const age = Date.now() - parsed.at;
    // Bound BOTH ends — a stamp written while the device clock was ahead would
    // otherwise sit in the future and replay the moment on every single load.
    if (age < 0 || age >= windowMs) return null;
    return { key: parsed.key, at: parsed.at };
  } catch {
    return null;
  }
}

/** Consume the stamp so the moment plays exactly once. */
export function clearRecentCompletion(): void {
  try { localStorage.removeItem(KEY); } catch { /* non-fatal */ }
}
