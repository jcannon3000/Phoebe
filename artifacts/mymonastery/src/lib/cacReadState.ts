import { getQueryClient, apiRequest } from "@/lib/queryClient";
import { getSideLevel, getSideReflectionExplicit } from "@/lib/officePrefs";
import { markRecentCompletion } from "@/lib/recentCompletion";
import { undoOfficeToday, clearOfficeUndoToday } from "@/lib/officeManualLog";
import { clearOfficeReminderNotifications } from "@/lib/officeReminders";

// Does this side's rhythm actually prescribe `level`? Psalms and PACT credit a
// side's OFFICE when they're that side's chosen prayer — but they're also
// readable on their own, and crediting then made the office card read "Prayed"
// for an office the user never opened (owner's call: only credit when it IS
// that side's anchor). The local practice flag is still stamped either way, so
// the reading is never lost; only the office-crediting session POST is gated.
function sideIsSetTo(side: "morning" | "evening", level: string): boolean {
  try { return getSideLevel(side) === level; } catch { return false; }
}

// Owner: "if morning prayer is completed either in the checklist... there
// should be no more [morning] prayer notifications in my notification
// center." clearOfficeReminderNotifications() was only ever called from the
// BCP office deck itself + the manual book-log — so a side whose chosen
// prayer is Psalms, Simple Guided Prayer, a custom practice, or FDD (Psalms
// is the new-user MORNING DEFAULT) never cleared the reminder at all, even
// once fully prayed. Same sideIsSetTo gate the office-crediting POST above
// already uses, so reading e.g. Psalms as a mere reflection on a side where
// it ISN'T the chosen anchor doesn't clear a reminder for prayer that
// hasn't actually happened yet.
/**
 * This side's ANCHOR practice was just prayed — credit it properly.
 *
 * Two things have to happen, and only one of them used to:
 *
 *  1. Silence today's reminder for that side (what this always did).
 *
 *  2. LIFT TODAY'S UNDO. Un-logging a side writes a tombstone that masks every
 *     non-local completion signal for the rest of the day (see
 *     officeManualLog's undoOfficeToday). Praying the practice again has to
 *     clear it, or the side can never be marked done again until midnight —
 *     the card's own "completed ✓" pill reads the practice's own flag and goes
 *     green while the rhythm's `morningDone` stays masked, so the card sits in
 *     Next wearing a tick. Reported as: "I completed simple guided and it
 *     didn't go to done."
 *
 *     markCustomPrayed learned this once already, for Chapel ("I had chapel as
 *     done, then I just tapped the card and it jumped to Next, then I could
 *     not get it to mark as done") — and the lesson stayed in that one
 *     function while psalms, guided prayer, FDD, the readings and the three
 *     newsletters-as-anchor all kept the same hole. Fixing it HERE covers
 *     every one of them, and every one added later, because they all already
 *     call this.
 *
 * Both are gated on the practice actually BEING this side's anchor — reading
 * FDD as an add-on must not clear a deliberate undo of the morning office.
 */
function creditSideAnchor(side: "morning" | "evening", level: string): void {
  if (!sideIsSetTo(side, level)) return;
  clearOfficeUndoToday(side);
  clearOfficeReminderNotifications();
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
/** A stamp that looks like an ISO date, or null. Shared by both keys below. */
function readStamp(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function makeDailyReadTracker(storageKey: string, eventName: string, syncRead: (ymd: string) => void | Promise<unknown>, cardKey?: string) {
  // The day the SERVER has acknowledged, kept apart from the day the reader
  // tapped — see markRead's note on why conflating them lost reads.
  const syncedKey = `${storageKey}:synced`;
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
      /**
       * Sync only on the day's FIRST mark — but judged by whether the SERVER
       * has it, not by whether the local stamp is set.
       *
       * Those are different, and conflating them lost reads. The guard used to
       * be `getLastReadDay() === ymd`: the same key markRead is about to write.
       * So any path that stamped the day locally without a successful POST —
       * an offline read, a failed request (this call swallows its own errors),
       * a surface that marks on open as well as on finish — permanently
       * suppressed the sync for that day. The card said kept, and the server
       * never heard.
       *
       * Reported on the Dean's Commentary: "my streak was at 10 yesterday, I
       * did it again, and it's now at 10 again." The streak is computed
       * server-side from these rows, so a read that never lands can't move it,
       * however many times you read.
       *
       * Tracking the CONFIRMED day separately also makes the retry below
       * possible: a read stamped locally but never acknowledged stays pending
       * and is re-sent on the next app start or reconnect.
       */
      const alreadyConfirmed = readStamp(syncedKey) === ymd;
      try {
        localStorage.setItem(storageKey, ymd);
        window.dispatchEvent(new Event(eventName));
      } catch {
        /* private mode / quota — non-fatal */
      }
      if (alreadyConfirmed) return;
      if (cardKey) markRecentCompletion(cardKey);
      void this.syncPending();
    },
    /**
     * Send today's read if it hasn't been confirmed yet. Safe to call at any
     * time — it no-ops unless there is a local read the server hasn't
     * acknowledged. Called on every mark, and again on app start / reconnect.
     */
    async syncPending(): Promise<void> {
      const ymd = todayLocalISO();
      if (this.getLastReadDay() !== ymd) return;
      if (readStamp(syncedKey) === ymd) return;
      try {
        await syncRead(ymd);
        try { localStorage.setItem(syncedKey, ymd); } catch { /* non-fatal */ }
      } catch {
        // Offline, signed out, or a server hiccup — leave it pending so the
        // next flush tries again rather than losing the day.
      }
    },
    /** Clear today's mark (only if it's actually set today) + notify listeners
     *  — the undo half of markRead, for surfaces where re-tapping an
     *  already-done card should toggle it back off rather than no-op re-mark
     *  the same day. Local-only: there's no matching "un-sync" call, since the
     *  server-side session row this credited is a historical fact either way. */
    unmarkRead(): void {
      if (this.getLastReadDay() !== todayLocalISO()) return;
      try {
        localStorage.removeItem(storageKey);
        window.dispatchEvent(new Event(eventName));
      } catch {
        /* private mode / quota — non-fatal */
      }
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
const vtsTracker = makeDailyReadTracker(
  "phoebe:vts:last-read-day", "phoebe:vts-read",
  (ymd) => { void apiRequest("POST", "/api/reflections/read", { source: "vts", ymd }).catch(() => { /* best effort */ }); },
  "reflect-vts",
);

/**
 * FULLY unlog today's reflection read — the ✓ on a reflection card (owner:
 * every home card unlogs by its check). Three coordinated halves, mirroring
 * practiceCompletion's unmark:
 *   1. the local read stamp (tracker.unmarkRead) + its synced marker, so the
 *      pending-sync retry doesn't quietly re-mark the day;
 *   2. the server row (DELETE — /api/cac/read for CAC, /api/reflections/read
 *      for the rest), so other devices agree;
 *   3. THIS device's React-Query cache of /api/me/reflections-read — done is
 *      local || server, and a cache still carrying today's read kept the
 *      card in Done after both writes landed (the same stale-cache class the
 *      iOS unlog report exposed on practice-completion).
 */
export function unlogReflectionToday(source: "cac" | "fdd" | "ssje" | "vts"): void {
  const ymd = todayLocalISO();
  const tracker = source === "cac" ? cacTracker : source === "fdd" ? fddTracker : source === "ssje" ? ssjeTracker : vtsTracker;
  tracker.unmarkRead();
  try { localStorage.removeItem(`phoebe:${source}:last-read-day:synced`); } catch { /* non-fatal */ }
  const del = source === "cac"
    ? () => apiRequest("DELETE", "/api/cac/read", { ymd })
    : () => apiRequest("DELETE", "/api/reflections/read", { source, ymd });
  del().catch(() => { setTimeout(() => { del().catch(() => { /* offline — local already cleared */ }); }, 3000); });
  try {
    const qc = getQueryClient();
    qc?.setQueriesData({ queryKey: ["/api/me/reflections-read"] }, (old: unknown) => {
      const o = old as Record<string, boolean> | undefined;
      if (!o || typeof o !== "object") return old;
      return { ...o, [source]: false };
    });
    void qc?.invalidateQueries({ queryKey: ["/api/me/reflections-read"] });
  } catch { /* non-fatal */ }
}

/**
 * Re-send any read the server hasn't acknowledged yet.
 *
 * Owner: "every time the user reads it should log that, so we can see what
 * their streak is at." A read is stamped locally the instant it happens, but
 * the POST that the STREAK is computed from can fail — offline, a dropped
 * request, signed out at that moment — and markRead swallows its own errors.
 * Without this, that day was simply never recorded and the streak sat still
 * however many times the reader came back.
 *
 * Called on app start and whenever the device reconnects, alongside the
 * prayer-session outbox flush. Each tracker no-ops unless it has a read from
 * TODAY that hasn't been confirmed.
 */
export function retryPendingReflectionReads(): void {
  for (const t of [cacTracker, fddTracker, ssjeTracker, vtsTracker]) {
    void t.syncPending();
  }
}
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
export function markPsalmsPrayed(side: "morning" | "evening" = "morning"): void { psalmsTrackerFor(side).markRead(); creditSideAnchor(side, "psalms"); }

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
export function markGuidedPrayerPrayed(side: "morning" | "evening" = "morning"): void { guidedPrayerTrackerFor(side).markRead(); creditSideAnchor(side, "guided-prayer"); }

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
/**
 * Mark a "Create your own" side practice as prayed.
 *
 * Lifts today's undo tombstone as well as setting the stamp. unmarkCustomPrayed
 * writes that tombstone (it has to — see its note), and a side's done-state is
 * masked by it for the rest of the day, so without this a practice undone once
 * could never be marked done again. logOfficeToday clears the same keys inline
 * for every other level, on the same reasoning: a deliberate re-log outranks an
 * earlier undo.
 */
export function markCustomPrayed(side: "morning" | "evening" = "morning"): void {
  customPrayerTrackerFor(side).markRead();
  clearOfficeUndoToday(side);
  creditSideAnchor(side, "custom");
}
/**
 * Un-mark a "Create your own" side practice.
 *
 * Clearing the local stamp is not enough. markCustomPrayed ALSO posts a
 * prayer_session (syncCustomPrayerSession above), and a side's done-state is
 * the local flag OR the server's office history for today — so dropping only
 * the local half left the server still saying "kept", the card snapped
 * straight back to done, and the practice could not be un-logged at all.
 *
 * So it takes the same route every other level's undo takes: undoOfficeToday
 * writes a per-side TOMBSTONE that masks the server signal for the rest of the
 * day. (Reached from the card's ✓ and its confirm popup. The card BODY used
 * to call this too, as a toggle; owner asked for that to stop — an undo big
 * enough to hit by accident, with no confirmation, next to a ✓ that asks
 * first. See DailyProgressBody's card-body note.)
 */
export function unmarkCustomPrayed(side: "morning" | "evening" = "morning"): void {
  customPrayerTrackerFor(side).unmarkRead();
  undoOfficeToday(side);
}

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
export function markFddPrayed(side: "morning" | "evening" = "morning"): void { fddTrackerFor(side).markRead(); creditSideAnchor(side, "fdd"); }

/**
 * Any of the four reflection sources can serve as a side's actual ANCHOR
 * (the "Reflection" row in the customizer — see WayOfLoveRuleFlow.tsx's own
 * note on this) — not just Forward Day by Day, which is all this originally
 * supported. Owner: "audit especially how any newsletter can be an anchor
 * practice, make sure this works properly."
 *
 * Mirrors fddTrackerMorning/Evening exactly, one factory call per source, so
 * CAC/SSJE/VTS get the SAME separation FDD already had: reading one as a
 * plain reflection (the global tracker above) stamps only the reflection;
 * taking it AS this side's prayer stamps this side too, and posts its own
 * prayer-session row so office-history / streaks / cross-device sync all
 * see it — the exact thing that was missing (the "Reflection" row wrote
 * level "fdd" unconditionally regardless of which source was actually
 * chosen, so CAC/SSJE/VTS never credited anything as an anchor at all).
 *
 * The LEVEL stays the single string "fdd" for every source (a deliberate,
 * pre-existing sentinel meaning "a reflection is this side's anchor" — see
 * getSideLevel/OfficeLevel); WHICH source is a separate question these
 * trackers don't need to answer themselves, only the callers that already
 * know which source they're crediting.
 */
function syncCacSession(side: "morning" | "evening"): void {
  if (!sideIsSetTo(side, "fdd")) return;
  const now = new Date();
  void apiRequest("POST", "/api/prayer-sessions", {
    surface: side === "morning" ? "morning-devotion" : "early-evening-devotion",
    durationSeconds: 60, slidesCompleted: 99, completed: true,
    startedAt: now.toISOString(), endedAt: now.toISOString(),
  }).catch(() => { /* best effort — the local flag already credited it today */ });
}
export const CAC_PRAYED_EVENT = "phoebe:cac-prayed";
const cacTrackerMorning = makeDailyReadTracker("phoebe:cac:morning:last-read-day", CAC_PRAYED_EVENT, () => syncCacSession("morning"), "morning");
const cacTrackerEvening = makeDailyReadTracker("phoebe:cac:evening:last-read-day", CAC_PRAYED_EVENT, () => syncCacSession("evening"), "evening");
const cacTrackerFor = (side: "morning" | "evening") => (side === "evening" ? cacTrackerEvening : cacTrackerMorning);
export function hasPrayedCacToday(side: "morning" | "evening" = "morning"): boolean { return cacTrackerFor(side).hasReadToday(); }
export function markCacPrayed(side: "morning" | "evening" = "morning"): void { cacTrackerFor(side).markRead(); creditSideAnchor(side, "fdd"); }

function syncSsjeSession(side: "morning" | "evening"): void {
  if (!sideIsSetTo(side, "fdd")) return;
  const now = new Date();
  void apiRequest("POST", "/api/prayer-sessions", {
    surface: side === "morning" ? "morning-devotion" : "early-evening-devotion",
    durationSeconds: 60, slidesCompleted: 99, completed: true,
    startedAt: now.toISOString(), endedAt: now.toISOString(),
  }).catch(() => { /* best effort */ });
}
export const SSJE_PRAYED_EVENT = "phoebe:ssje-prayed";
const ssjeTrackerMorning = makeDailyReadTracker("phoebe:ssje:morning:last-read-day", SSJE_PRAYED_EVENT, () => syncSsjeSession("morning"), "morning");
const ssjeTrackerEvening = makeDailyReadTracker("phoebe:ssje:evening:last-read-day", SSJE_PRAYED_EVENT, () => syncSsjeSession("evening"), "evening");
const ssjeTrackerFor = (side: "morning" | "evening") => (side === "evening" ? ssjeTrackerEvening : ssjeTrackerMorning);
export function hasPrayedSsjeToday(side: "morning" | "evening" = "morning"): boolean { return ssjeTrackerFor(side).hasReadToday(); }
export function markSsjePrayed(side: "morning" | "evening" = "morning"): void { ssjeTrackerFor(side).markRead(); creditSideAnchor(side, "fdd"); }

function syncVtsSession(side: "morning" | "evening"): void {
  if (!sideIsSetTo(side, "fdd")) return;
  const now = new Date();
  void apiRequest("POST", "/api/prayer-sessions", {
    surface: side === "morning" ? "morning-devotion" : "early-evening-devotion",
    durationSeconds: 60, slidesCompleted: 99, completed: true,
    startedAt: now.toISOString(), endedAt: now.toISOString(),
  }).catch(() => { /* best effort */ });
}
export const VTS_PRAYED_EVENT = "phoebe:vts-prayed";
const vtsTrackerMorning = makeDailyReadTracker("phoebe:vts:morning:last-read-day", VTS_PRAYED_EVENT, () => syncVtsSession("morning"), "morning");
const vtsTrackerEvening = makeDailyReadTracker("phoebe:vts:evening:last-read-day", VTS_PRAYED_EVENT, () => syncVtsSession("evening"), "evening");
const vtsTrackerFor = (side: "morning" | "evening") => (side === "evening" ? vtsTrackerEvening : vtsTrackerMorning);
export function hasPrayedVtsToday(side: "morning" | "evening" = "morning"): boolean { return vtsTrackerFor(side).hasReadToday(); }
export function markVtsPrayed(side: "morning" | "evening" = "morning"): void { vtsTrackerFor(side).markRead(); creditSideAnchor(side, "fdd"); }

/**
 * Reading a newsletter ONCE should satisfy it once, wherever it appears.
 *
 * A source can be BOTH a side's anchor (level "fdd", named after the source by
 * sideOfficeTitle — so a CAC anchor's card reads "CAC Daily Meditation") and a
 * reflection card in the home layout. Picking Reflection as the morning anchor
 * in the customizer produces exactly that pairing by default, because the
 * side's reflection is set from the same newsletter list the card comes from.
 *
 * The two are tracked by DIFFERENT flags — hasReadCacToday() for the card,
 * hasPrayedCacToday(side) for the anchor — so the reader saw two cards with
 * the identical title and reading it cleared only one of them. Crossing the
 * credit here, at the two write points, keeps every reader of those flags
 * (cards, dots, weekly rows, the widget, the bell) consistent without anyone
 * having to know about the pairing.
 */
function sidesAnchoredTo(source: "cac" | "fdd" | "ssje" | "vts"): Array<"morning" | "evening"> {
  const out: Array<"morning" | "evening"> = [];
  for (const side of ["morning", "evening"] as const) {
    try {
      if (getSideLevel(side) !== "fdd") continue;
      if ((getSideReflectionExplicit(side) ?? "fdd") === source) out.push(side);
    } catch { /* storage unavailable — no cross-credit, never a throw */ }
  }
  return out;
}

/** The global "read it today" tracker for a source — the reflection CARD's flag. */
function readTrackerFor(source: "cac" | "fdd" | "ssje" | "vts") {
  return source === "cac" ? cacTracker : source === "ssje" ? ssjeTracker : source === "vts" ? vtsTracker : fddTracker;
}

/**
 * Mark a source read, and credit any side whose ANCHOR is that source.
 * Called from every mark*Read below rather than from the cards, so a read
 * from anywhere counts everywhere.
 */
function creditAnchorsFor(source: "cac" | "fdd" | "ssje" | "vts"): void {
  for (const side of sidesAnchoredTo(source)) {
    if (source === "cac") markCacPrayed(side);
    else if (source === "ssje") markSsjePrayed(side);
    else if (source === "vts") markVtsPrayed(side);
    else markFddPrayed(side);
  }
}

/** Which per-side tracker owns a given reflection source's anchor credit. */
export function hasPrayedReflectionToday(source: "cac" | "fdd" | "ssje" | "vts", side: "morning" | "evening" = "morning"): boolean {
  if (source === "cac") return hasPrayedCacToday(side);
  if (source === "ssje") return hasPrayedSsjeToday(side);
  if (source === "vts") return hasPrayedVtsToday(side);
  return hasPrayedFddToday(side);
}
export function markReflectionPrayed(source: "cac" | "fdd" | "ssje" | "vts", side: "morning" | "evening" = "morning"): void {
  // …and the card's own flag, so the anchor and the reflection card can't
  // disagree about a newsletter that was read once. Writing the tracker
  // directly (not mark*Read) keeps this one hop — mark*Read credits anchors,
  // which is the direction we're already coming from.
  try { readTrackerFor(source).markRead(); } catch { /* non-fatal */ }
  if (source === "cac") { markCacPrayed(side); return; }
  if (source === "ssje") { markSsjePrayed(side); return; }
  if (source === "vts") { markVtsPrayed(side); return; }
  markFddPrayed(side);
}

// Daily Scripture Readings (Forward Movement's daily-readings page) USED AS
// a side's prayer — same shape as FDD above, anchor-only (no separate
// reflection-newsletter concept — this practice is never offered as one of
// the CAC/FDD/SSJE/VTS reflection choices, it only exists as a side anchor).
export const READINGS_PRAYED_EVENT = "phoebe:readings-prayed";
function syncReadingsSession(side: "morning" | "evening"): void {
  // Only when Daily Scripture Readings IS this side's prayer — see sideIsSetTo above.
  if (!sideIsSetTo(side, "readings")) return;
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
const readingsTrackerMorning = makeDailyReadTracker("phoebe:readings:morning:last-read-day", READINGS_PRAYED_EVENT, () => syncReadingsSession("morning"), "morning");
const readingsTrackerEvening = makeDailyReadTracker("phoebe:readings:evening:last-read-day", READINGS_PRAYED_EVENT, () => syncReadingsSession("evening"), "evening");
const readingsTrackerFor = (side: "morning" | "evening") => (side === "evening" ? readingsTrackerEvening : readingsTrackerMorning);
export function hasPrayedReadingsToday(side: "morning" | "evening" = "morning"): boolean { return readingsTrackerFor(side).hasReadToday(); }
export function markReadingsPrayed(side: "morning" | "evening" = "morning"): void { readingsTrackerFor(side).markRead(); creditSideAnchor(side, "readings"); }

// Forward Movement's daily-readings page — a real page per calendar date
// (https://prayer.forwardmovement.org/daily-readings/YYYY-MM-DD), unlike
// FDD's single stable URL, so this is a function of "today" rather than a
// constant. Local calendar day, matching todayLocalISO's own convention.
export function getReadingsTodayUrl(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `https://prayer.forwardmovement.org/daily-readings/${ymd}`;
}

/** Open today's Daily Scripture Readings and credit this side's anchor once
 *  the reader actually closes it (matching recordFddOpened's shape). */
export function recordReadingsOpened(opts?: { side?: "morning" | "evening" }): void {
  if (opts?.side) markReadingsPrayed(opts.side);
}

// ── CAC Daily Reflection (Center for Action & Contemplation) ──
// /api/cac/today on the server 302-redirects to today's permalink with
// a 9 AM ET publish-day cache in front; we always link via that route
// rather than directly at cac.org/daily-meditations/.
export const CAC_TODAY_URL = "https://withphoebe.app/api/cac/today";
export const CAC_READ_EVENT = cacTracker.eventName;
export function getCacReadDay(): string | null { return cacTracker.getLastReadDay(); }
export function hasReadCacToday(): boolean { return cacTracker.hasReadToday(); }
export function markCacRead(): void { cacTracker.markRead(); creditAnchorsFor("cac"); }

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

// ── VTS Dean's Commentary (Virginia Theological Seminary) ──
// Same shape as CAC: VTS's blog has per-article permalinks (not a same-URL
// SPA like FDD/SSJE), so "today's" URL has to be resolved server-side —
// /api/vts/today 302-redirects to the newest post tagged Dean's Commentary
// (see api-server/src/routes/vts.ts). Read-state rides the shared
// reflection_reads table (like FDD/SSJE) rather than a bespoke table — no
// community read-presence/journal for this source, and (unlike CAC/FDD/SSJE)
// no dedicated /menu/reflections/vts reader page — VTS almost certainly sends
// X-Frame-Options like CAC does, so it opens externally same as CAC's own
// "Read" tap; there's just no multi-tab hub entry for it yet.
export const VTS_TODAY_URL = "https://withphoebe.app/api/vts/today";
export const VTS_READ_EVENT = vtsTracker.eventName;
export function getVtsReadDay(): string | null { return vtsTracker.getLastReadDay(); }
export function hasReadVtsToday(): boolean { return vtsTracker.hasReadToday(); }
/**
 * Mark today's Dean's Commentary read.
 *
 * NO-OP ON A WEEKEND. VTS publishes weekdays only, and /api/vts/today keeps
 * serving Friday's post through Saturday and Sunday — so reading it on a
 * weekend is re-reading Friday's piece, not a new day's. Stamping the weekend
 * as its own "day read" counted one commentary twice, which is how the streak
 * slide could report more days read than the publication had actually
 * published (11 read against 10 possible publishing days). The streak itself
 * already walks publishing days only; this keeps the underlying rows honest
 * too, rather than fixing it at the display layer.
 */
export function markVtsRead(): void {
  if (!isVtsPublishingDay()) return;
  vtsTracker.markRead();
  creditAnchorsFor("vts");
}
// VTS only publishes Dean's Commentary on weekdays — Saturday/Sunday there's
// nothing new (the server just keeps serving Friday's post). Rather than
// show a stale "today's reading" that isn't actually today's, the card and
// anchor hide entirely on the viewer's local weekend, same treatment NCMP's
// card gets for its own weekday-only broadcast (see getNcmpState).
export function isVtsPublishingDay(now: Date = new Date()): boolean {
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  return day !== 0 && day !== 6;
}
export function recordVtsOpened(): void { markVtsRead(); }

// ── Forward Day by Day (Forward Movement) ──
// FDD's prayer.forwardmovement.org/fdd is an SPA that loads today's
// reading client-side from its own backend, so the same URL every day
// resolves to "today" — no server route needed on our side.
export const FDD_TODAY_URL = "https://prayer.forwardmovement.org/fdd";
export const FDD_READ_EVENT = fddTracker.eventName;
export function getFddReadDay(): string | null { return fddTracker.getLastReadDay(); }
export function hasReadFddToday(): boolean { return fddTracker.hasReadToday(); }
export function markFddRead(): void { fddTracker.markRead(); creditAnchorsFor("fdd"); }
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
export function markSsjeRead(): void { ssjeTracker.markRead(); creditAnchorsFor("ssje"); }
// Opened from the home card → mark read + (when flagged) stash the return path
// so coming back from the browser lands on the in-app reflection reader.
export function recordSsjeOpened(opts?: { flagReturn?: boolean }): void {
  markSsjeRead();
  if (opts?.flagReturn) flagReflectionReturn("/menu/reflections/ssje");
}
