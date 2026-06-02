import { apiRequest } from "@/lib/queryClient";

// Tracks whether the user has tapped a daily-reflection link today,
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
// align to a publisher's publish-day rollover — the publisher handles
// "what's today's content" on their side. For the label, local-day
// is what feels like "today" to the reader.
//
// Three daily-reflection sources share this module:
//   • CAC Daily Reflection (Center for Action & Contemplation)
//   • Forward Day by Day (Forward Movement)
//   • SSJE Reflections (Society of Saint John the Evangelist —
//     "Brother, Give Us a Word")
// Each gets its own storage key + custom event so the dashboard
// cards don't ghost-update each other when only one is tapped.

// Today's local date as YYYY-MM-DD. Format is en-CA — that locale
// renders ISO-style 2024-05-26 instead of US 5/26/2024, so the
// strings compare correctly without any parsing.
function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Factory: returns a tiny tracker tied to one localStorage key + one
// custom event. Keeps the per-source surfaces honest without a
// second copy of the same logic.
function makeDailyReadTracker(storageKey: string, eventName: string) {
  return {
    /** "YYYY-MM-DD" of the last tap, or null. Returns null on storage errors. */
    getLastReadDay(): string | null {
      try {
        const v = localStorage.getItem(storageKey);
        if (typeof v !== "string") return null;
        // Defensive: only return values that look like an ISO date so a
        // corrupted key doesn't poison the comparison below.
        return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      } catch {
        return null;
      }
    },
    /** True if the user tapped this reflection today (local timezone). */
    hasReadToday(): boolean {
      return this.getLastReadDay() === todayLocalISO();
    },
    /** Stamp today as read + notify listeners (so cards flip without remount). */
    markRead(): void {
      try {
        localStorage.setItem(storageKey, todayLocalISO());
        window.dispatchEvent(new Event(eventName));
      } catch {
        /* private mode / quota — non-fatal */
      }
    },
    /** Event name to subscribe to for hot updates from other surfaces. */
    eventName,
  };
}

const cacTracker = makeDailyReadTracker("phoebe:cac:last-read-day", "phoebe:cac-read");
const fddTracker = makeDailyReadTracker("phoebe:fdd:last-read-day", "phoebe:fdd-read");
const ssjeTracker = makeDailyReadTracker("phoebe:ssje:last-read-day", "phoebe:ssje-read");

// ── CAC Daily Reflection (Center for Action & Contemplation) ──
// /api/cac/today on the server 302-redirects to today's permalink with
// a 9 AM ET publish-day cache in front; we always link via that route
// rather than directly at cac.org/daily-meditations/.
export const CAC_TODAY_URL = "https://withphoebe.app/api/cac/today";
export const CAC_READ_EVENT = cacTracker.eventName;
export function getCacReadDay(): string | null { return cacTracker.getLastReadDay(); }
export function hasReadCacToday(): boolean { return cacTracker.hasReadToday(); }
export function markCacRead(): void { cacTracker.markRead(); }

// Session flag set when CAC is opened from the home card, so the global
// return-redirect can take the reader to /reflect/cac when they come back.
export const CAC_JUST_READ_KEY = "phoebe:cac-just-read";

// Record opening today's CAC reflection: flip the local "read" state, log it
// server-side for the community read-presence (best-effort), and — when opened
// from a surface that should redirect on return (the home card) — drop the
// session flag the return-redirect watches.
export function recordCacOpened(opts?: { flagReturn?: boolean }): void {
  markCacRead();
  try {
    void apiRequest("POST", "/api/cac/read", { ymd: todayLocalISO() }).catch(() => { /* best effort */ });
    if (opts?.flagReturn) sessionStorage.setItem(CAC_JUST_READ_KEY, "1");
  } catch { /* best effort */ }
}

// ── Forward Day by Day (Forward Movement) ──
// FDD's prayer.forwardmovement.org/fdd is an SPA that loads today's
// reading client-side from its own backend, so the same URL every day
// resolves to "today" — no server route needed on our side.
export const FDD_TODAY_URL = "https://prayer.forwardmovement.org/fdd";
export const FDD_READ_EVENT = fddTracker.eventName;
export function getFddReadDay(): string | null { return fddTracker.getLastReadDay(); }
export function hasReadFddToday(): boolean { return fddTracker.hasReadToday(); }
export function markFddRead(): void { fddTracker.markRead(); }

// ── SSJE Reflections (Society of Saint John the Evangelist) ──
// SSJE's daily "Word" reflection from the Cambridge MA Episcopal
// monastery. The page itself loads today's word client-side, so the
// same URL every day resolves to "today" — matching FDD's pattern.
// No server-side route on our end.
export const SSJE_TODAY_URL = "https://www.ssje.org/word/";
export const SSJE_READ_EVENT = ssjeTracker.eventName;
export function getSsjeReadDay(): string | null { return ssjeTracker.getLastReadDay(); }
export function hasReadSsjeToday(): boolean { return ssjeTracker.hasReadToday(); }
export function markSsjeRead(): void { ssjeTracker.markRead(); }
