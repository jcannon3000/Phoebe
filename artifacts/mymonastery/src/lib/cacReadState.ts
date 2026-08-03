import { apiRequest } from "@/lib/queryClient";
import { getSideLevel } from "@/lib/officePrefs";
import { markRecentCompletion } from "@/lib/recentCompletion";

// Does this side's rhythm actually prescribe `level`? Psalms and PACT credit a
// side's OFFICE when they're that side's chosen prayer — but they're also
// readable on their own, and crediting then made the office card read "Prayed"
// for an office the user never opened (owner's call: only credit when it IS
// that side's anchor). The local practice flag is still stamped either way, so
// the reading is never lost; only the office-crediting session POST is gated.
function sideIsSetTo(side: "morning" | "evening", level: string): boolean {
  try { return getSideLevel(side) === level; } catch { return false; }
}

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
// `cardKey` is the home card this tracker completes — stamped on the day's
// FIRST mark so the home can play that card's completion moment.
function makeDailyReadTracker(storageKey: string, eventName: string, syncRead: (ymd: string) => void, cardKey?: string) {
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
      // Sync only on the day's FIRST mark. markRead can fire repeatedly for one
      // practice — paging past the end of a deck re-runs finish(), and several
      // surfaces mark on both completion and playback — and the psalms tracker's
      // sync INSERTs a prayer_session, so an unguarded re-mark writes duplicate
      // rows (observed: six POSTs from one sitting). The server already has the
      // day stamped after the first call, so skipping is correct for the
      // reflection trackers too, just less chatty.
      const alreadySyncedToday = this.getLastReadDay() === ymd;
      try {
        localStorage.setItem(storageKey, ymd);
        window.dispatchEvent(new Event(eventName));
      } catch {
        /* private mode / quota — non-fatal */
      }
      if (alreadySyncedToday) return;
      if (cardKey) markRecentCompletion(cardKey);
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
  "reflect-cac",
);
const fddTracker = makeDailyReadTracker(
  "phoebe:fdd:last-read-day", "phoebe:fdd-read",
  (ymd) => { void apiRequest("POST", "/api/reflections/read", { source: "fdd", ymd }).catch(() => { /* best effort */ }); },
  "reflect-fdd",
);
const ssjeTracker = makeDailyReadTracker(
  "phoebe:ssje:last-read-day", "phoebe:ssje-read",
  (ymd) => { void apiRequest("POST", "/api/reflections/read", { source: "ssje", ymd }).catch(() => { /* best effort */ }); },
  "reflect-ssje",
);
// Praying the Psalms — the done tracker for the psalms office form.
// SIDE-SCOPED: morning and evening psalms are tracked separately, so praying the
// morning psalms doesn't mark the evening side done (a user can have psalms on
// both). Both fire the same event so every listener refreshes.
export const PSALMS_READ_EVENT = "phoebe:psalms-read";

/** Psalms USED TO BE local-only — the tracker was built with a no-op sync while
 *  the CAC/FDD/SSJE trackers beside it POSTed. Since guestSeed seeds psalms into
 *  both sides, that made the DEFAULT practice the one that recorded nothing:
 *  a month of morning + evening psalms left zero rows on the server, so streak,
 *  office history, the weekly grid and the parish rollup were all empty, the
 *  reminder cron never learned the user had prayed, and everything vanished on
 *  reinstall. (2026-07-21 data audit.)
 *
 *  Psalms is one of the three BCP forms a side can take (office / devotion /
 *  psalms), so it credits that side's office. We deliberately reuse the DEVOTION
 *  surfaces rather than minting `morning-psalms`: those four surfaces are the
 *  ones every existing rollup already agrees on (office-history-week, the office
 *  streak, practice-week, walkProgress), so this counts everywhere with no server
 *  change and without adding a sixth surface set that disagrees with the other
 *  five. Which form was actually prayed stays recorded in the routine's per-side
 *  level. Mirrors markOfficeBookComplete in lib/officeManualLog.ts. */
function syncPsalmsSession(side: "morning" | "evening"): void {
  // Only when Psalms IS this side's prayer — see sideIsSetTo above.
  if (!sideIsSetTo(side, "psalms")) return;
  const now = new Date();
  void apiRequest("POST", "/api/prayer-sessions", {
    surface: side === "morning" ? "morning-devotion" : "early-evening-devotion",
    durationSeconds: 60,
    // Clears the "actually prayed an office" (>=3 slides) filter the community
    // rollups apply.
    slidesCompleted: 99,
    completed: true,
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
  }).catch(() => { /* best effort — the local flag already credited it today */ });
}

const psalmsTrackerMorning = makeDailyReadTracker("phoebe:psalms:morning:last-read-day", PSALMS_READ_EVENT, () => syncPsalmsSession("morning"), "morning");
const psalmsTrackerEvening = makeDailyReadTracker("phoebe:psalms:evening:last-read-day", PSALMS_READ_EVENT, () => syncPsalmsSession("evening"), "evening");
const psalmsTrackerFor = (side: "morning" | "evening") => (side === "evening" ? psalmsTrackerEvening : psalmsTrackerMorning);
export function hasPrayedPsalmsToday(side: "morning" | "evening" = "morning"): boolean { return psalmsTrackerFor(side).hasReadToday(); }
export function markPsalmsPrayed(side: "morning" | "evening" = "morning"): void { psalmsTrackerFor(side).markRead(); }

// Simple Guided Prayer (Praise / Confession / Thanksgiving / Supplication) —
// same shape as Psalms above: a per-side alternative to the BCP office, so
// morning and evening are tracked independently (a user can pray it on one
// side, both, or neither). Reuses the devotion surfaces for rollup credit
// (office-history-week, streak, practice-week, the parish rollup) — same
// reasoning as syncPsalmsSession: those surfaces are what every existing
// rollup already agrees on, so this counts everywhere with no server change.
export const GUIDED_PRAYER_READ_EVENT = "phoebe:guided-prayer-read";
function syncGuidedPrayerSession(side: "morning" | "evening"): void {
  // Only when Simple Guided Prayer IS this side's prayer — see sideIsSetTo.
  if (!sideIsSetTo(side, "guided-prayer")) return;
  const now = new Date();
  void apiRequest("POST", "/api/prayer-sessions", {
    surface: side === "morning" ? "morning-devotion" : "early-evening-devotion",
    durationSeconds: 60,
    slidesCompleted: 99,
    completed: true,
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
  }).catch(() => { /* best effort — the local flag already credited it today */ });
}
const guidedPrayerTrackerMorning = makeDailyReadTracker("phoebe:guided-prayer:morning:last-read-day", GUIDED_PRAYER_READ_EVENT, () => syncGuidedPrayerSession("morning"), "morning");
const guidedPrayerTrackerEvening = makeDailyReadTracker("phoebe:guided-prayer:evening:last-read-day", GUIDED_PRAYER_READ_EVENT, () => syncGuidedPrayerSession("evening"), "evening");
const guidedPrayerTrackerFor = (side: "morning" | "evening") => (side === "evening" ? guidedPrayerTrackerEvening : guidedPrayerTrackerMorning);
export function hasPrayedGuidedPrayerToday(side: "morning" | "evening" = "morning"): boolean { return guidedPrayerTrackerFor(side).hasReadToday(); }
export function markGuidedPrayerPrayed(side: "morning" | "evening" = "morning"): void { guidedPrayerTrackerFor(side).markRead(); }

// A side's own "Create your own" practice (level "custom", named via
// officePrefs.getSideCustomName) — same shape as Simple Guided Prayer above,
// just a plain tap-to-mark-done instead of a slideshow.
export const CUSTOM_PRAYER_READ_EVENT = "phoebe:custom-prayer-read";
function syncCustomPrayerSession(side: "morning" | "evening"): void {
  // Only when this side's own practice IS this side's prayer — see sideIsSetTo.
  if (!sideIsSetTo(side, "custom")) return;
  const now = new Date();
  void apiRequest("POST", "/api/prayer-sessions", {
    surface: side === "morning" ? "morning-devotion" : "early-evening-devotion",
    durationSeconds: 60,
    slidesCompleted: 99,
    completed: true,
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
  }).catch(() => { /* best effort — the local flag already credited it today */ });
}
const customPrayerTrackerMorning = makeDailyReadTracker("phoebe:custom-prayer:morning:last-read-day", CUSTOM_PRAYER_READ_EVENT, () => syncCustomPrayerSession("morning"), "morning");
const customPrayerTrackerEvening = makeDailyReadTracker("phoebe:custom-prayer:evening:last-read-day", CUSTOM_PRAYER_READ_EVENT, () => syncCustomPrayerSession("evening"), "evening");
const customPrayerTrackerFor = (side: "morning" | "evening") => (side === "evening" ? customPrayerTrackerEvening : customPrayerTrackerMorning);
export function hasPrayedCustomToday(side: "morning" | "evening" = "morning"): boolean { return customPrayerTrackerFor(side).hasReadToday(); }
export function markCustomPrayed(side: "morning" | "evening" = "morning"): void { customPrayerTrackerFor(side).markRead(); }

// Forward Day by Day USED AS a side's prayer — the office slot, not the
// reflection card. Same shape as Psalms / Simple Guided Prayer above and for the
// same reason: FDD's global read-flag (`fddTracker` below) is ONE key, so a
// single read lit the reflection card AND both offices at once. These per-side
// keys are separate from that global one — reading FDD as a reflection still
// stamps only the reflection; taking FDD AS this side's prayer stamps this side.
export const FDD_PRAYED_EVENT = "phoebe:fdd-prayed";
function syncFddSession(side: "morning" | "evening"): void {
  // Only when Forward Day by Day IS this side's prayer — see sideIsSetTo above.
  if (!sideIsSetTo(side, "fdd")) return;
  const now = new Date();
  void apiRequest("POST", "/api/prayer-sessions", {
    surface: side === "morning" ? "morning-devotion" : "early-evening-devotion",
    durationSeconds: 60,
    slidesCompleted: 99,
    completed: true,
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
  }).catch(() => { /* best effort — the local flag already credited it today */ });
}
const fddTrackerMorning = makeDailyReadTracker("phoebe:fdd:morning:last-read-day", FDD_PRAYED_EVENT, () => syncFddSession("morning"), "morning");
const fddTrackerEvening = makeDailyReadTracker("phoebe:fdd:evening:last-read-day", FDD_PRAYED_EVENT, () => syncFddSession("evening"), "evening");
const fddTrackerFor = (side: "morning" | "evening") => (side === "evening" ? fddTrackerEvening : fddTrackerMorning);
export function hasPrayedFddToday(side: "morning" | "evening" = "morning"): boolean { return fddTrackerFor(side).hasReadToday(); }
export function markFddPrayed(side: "morning" | "evening" = "morning"): void { fddTrackerFor(side).markRead(); }

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
// `side` is passed ONLY when the reader arrived here as that side's PRAYER (the
// Morning/Evening card → /begin-prayer → the home FDD slot). It additionally
// stamps that side's day-flag (and, gated on the side really being set to fdd,
// POSTs the office-crediting session). Omit it on the plain reflection card so a
// reflection read never ticks an office dot.
export function recordFddOpened(opts?: { flagReturn?: boolean; side?: "morning" | "evening" }): void {
  markFddRead();
  if (opts?.side) markFddPrayed(opts.side);
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
