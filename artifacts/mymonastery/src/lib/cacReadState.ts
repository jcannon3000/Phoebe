import { apiRequest } from "@/lib/queryClient";
import { swellHaptic } from "@/lib/swellHaptic";

// Tracks whether the user has tapped a daily-reflection link today,
// so surfaces that link to it (the dashboard module + the Morning
// Prayer closing pill) can flip their label between "Read" and
// "Read again."
//
// Storage is localStorage for instant, offline-safe per-device state, AND a
// best-effort server write on each read so the state syncs across devices —
// the daily-progress "Reflect" anchor reads the server side back, so a read
// on mobile shows on web and vice versa. CAC writes to cac_reads (which also
// powers community read-presence); FDD/SSJE write to reflection_reads.
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
function makeDailyReadTracker(storageKey: string, eventName: string, syncRead: (ymd: string) => void) {
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
    /** Stamp today as read locally + notify listeners, and best-effort sync to
     *  the server so the read shows up on the user's other devices too. */
    markRead(): void {
      const ymd = todayLocalISO();
      const wasAlreadyRead = this.hasReadToday();
      try {
        localStorage.setItem(storageKey, ymd);
        window.dispatchEvent(new Event(eventName));
      } catch {
        /* private mode / quota — non-fatal */
      }
      // A fresh reflection read → the swell haptic.
      if (!wasAlreadyRead) swellHaptic();
      // Fire-and-forget; an unauthenticated/offline call just no-ops.
      try { syncRead(ymd); } catch { /* best effort */ }
    },
    /** Event name to subscribe to for hot updates from other surfaces. */
    eventName,
  };
}

const cacTracker = makeDailyReadTracker(
  "phoebe:cac:last-read-day", "phoebe:cac-read",
  (ymd) => { void apiRequest("POST", "/api/cac/read", { ymd }).catch(() => { /* best effort */ }); },
);
const fddTracker = makeDailyReadTracker(
  "phoebe:fdd:last-read-day", "phoebe:fdd-read",
  (ymd) => { void apiRequest("POST", "/api/reflections/read", { source: "fdd", ymd }).catch(() => { /* best effort */ }); },
);
const ssjeTracker = makeDailyReadTracker(
  "phoebe:ssje:last-read-day", "phoebe:ssje-read",
  (ymd) => { void apiRequest("POST", "/api/reflections/read", { source: "ssje", ymd }).catch(() => { /* best effort */ }); },
);

// ── CAC Daily Reflection (Center for Action & Contemplation) ──
// /api/cac/today on the server 302-redirects to today's permalink with
// a 9 AM ET publish-day cache in front; we always link via that route
// rather than directly at cac.org/daily-meditations/.
export const CAC_TODAY_URL = "https://withphoebe.app/api/cac/today";
export const CAC_READ_EVENT = cacTracker.eventName;
export function getCacReadDay(): string | null { return cacTracker.getLastReadDay(); }
export function hasReadCacToday(): boolean { return cacTracker.hasReadToday(); }
export function markCacRead(): void { cacTracker.markRead(); }

// ── Return-to-reflection redirect (shared by all three sources) ──
// When a daily reflection is opened from a surface that should send the reader
// to an in-app reflection page on their way back (the home cards), we stash the
// destination path here. ReflectionReturnRedirect (mounted globally) consumes it
// once when the WebView becomes visible again — i.e. the in-app browser is
// dismissed — and navigates there. Opt-in per call (flagReturn) so a surface
// that's ALREADY on a reflection page (e.g. the reader's own "Open" button)
// doesn't bounce the reader on return.
export const REFLECTION_RETURN_KEY = "phoebe:reflection-return";
function flagReflectionReturn(path: string): void {
  try { sessionStorage.setItem(REFLECTION_RETURN_KEY, path); } catch { /* private mode / quota */ }
}

// Record opening today's CAC reflection: flip the local "read" state (which
// also syncs to cac_reads server-side via markRead, powering community
// read-presence) and — when opened from a surface that should redirect on
// return (the home card) — stash the return path the redirect watches.
export function recordCacOpened(opts?: { flagReturn?: boolean }): void {
  markCacRead();
  if (opts?.flagReturn) flagReflectionReturn("/reflect/cac");
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
// Opened from the home card → mark read + (when flagged) stash the return path
// so coming back from the browser lands on the FDD journey page (/reflect/fdd
// — read-aloud + sit), matching CAC's return to its companion page. Was the
// inline reader (/menu/reflections/fdd), which just re-showed what they'd read.
export function recordFddOpened(opts?: { flagReturn?: boolean }): void {
  markFddRead();
  if (opts?.flagReturn) flagReflectionReturn("/reflect/fdd");
}

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
// Opened from the home card → mark read + (when flagged) stash the return path
// so coming back from the browser lands on the in-app reflection reader.
export function recordSsjeOpened(opts?: { flagReturn?: boolean }): void {
  markSsjeRead();
  if (opts?.flagReturn) flagReflectionReturn("/menu/reflections/ssje");
}
