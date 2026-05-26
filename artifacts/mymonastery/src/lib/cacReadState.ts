// Tracks whether the user has tapped the CAC Daily Reflection today,
// so surfaces that link to it (the dashboard module + the Morning
// Prayer closing pill) can flip their label between "Read" and
// "Read again."
//
// Storage is plain localStorage — per-device, not synced. That's the
// right grain here: "did I already open today's reflection from this
// phone?" is a UX nudge, not a piece of user state worth a server
// round-trip + a column. If the user opens the link from a different
// device, the second device will still say "Read" until they tap
// there too. We consider this acceptable.
//
// "Today" is computed in the user's LOCAL timezone. We don't try to
// align to CAC's 9 AM ET publish-day key — the server route handles
// that on its side (returns yesterday's permalink before the
// rollover). For the label, local-day is what feels like "today" to
// the reader.

const KEY = "phoebe:cac:last-read-day";

// Today's local date as YYYY-MM-DD. Format is en-CA — that locale
// renders ISO-style 2024-05-26 instead of US 5/26/2024, so the
// strings compare correctly without any parsing.
function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// "YYYY-MM-DD" the user last opened the CAC link, or null if never.
// Returns null on any storage error (Safari private-mode quirks).
export function getCacReadDay(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    if (typeof v !== "string") return null;
    // Defensive: only return values that look like an ISO date so a
    // corrupted key doesn't poison the comparison below.
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

// True if the user has tapped the CAC link today (local timezone).
export function hasReadCacToday(): boolean {
  return getCacReadDay() === todayLocalISO();
}

// Mark today's local date as "tapped." Call from any surface that
// links to today's CAC reflection so the next render flips to
// "Read again."
export function markCacRead(): void {
  try {
    localStorage.setItem(KEY, todayLocalISO());
    // Other components reading this state (the dashboard module, the
    // MP closing pill if the user double-back-navigates) won't see
    // the change without a re-render. Dispatch a custom event so
    // listeners can opt into hot updates.
    window.dispatchEvent(new Event("phoebe:cac-read"));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

// The public CAC URL — central constant so the home card, the MP
// closing pill, and any future surfaces all link to the same place.
// Goes through /api/cac/today on the server, which 302-redirects to
// today's permalink with the 9 AM ET publish-day cache in front.
export const CAC_TODAY_URL = "https://withphoebe.app/api/cac/today";
