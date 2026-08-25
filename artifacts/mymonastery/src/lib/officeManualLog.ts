import { apiRequest } from "@/lib/queryClient";
import { swellHaptic } from "@/lib/swellHaptic";
import { clearOfficeReminderNotifications } from "@/lib/officeReminders";
import { getSideLevel } from "@/lib/officePrefs";
import type { PrayerSurface } from "@/hooks/usePrayerSession";
import { markRecentCompletion } from "@/lib/recentCompletion";
import { PRACTICE_SYNC_FAILED_EVENT } from "@/lib/practiceCompletion";

// Manual "I prayed it" logging for the offices — for people praying Morning
// or Evening Prayer straight from their physical Book of Common Prayer rather
// than the in-app deck. It's pure accountability: a one-tap way to mark the
// office prayed so it counts toward Daily progress + the streak, without ever
// opening the page-number guide.
//
// Mirrors lib/practiceCompletion.ts: an instant per-device localStorage flag
// (so the anchor flips immediately and works offline) PLUS a best-effort
// server prayer-session write (so it syncs across devices + survives a cache
// purge). useRhythmState ORs the local flag with the server office-history.

export const OFFICE_DONE_EVENT = "phoebe:office-done";

function todayKey(): string {
  return new Date().toLocaleDateString("en-CA");
}

function flagKey(mode: string): string {
  // Same key shape the office viewer writes (phoebe:office-completed:<mode>:<day>),
  // so useRhythmState.officeLocalDone(["morning"…]) / (["evening"…]) picks it up.
  return `phoebe:office-completed:${mode}:${todayKey()}`;
}

// ── Undoing a day's office ──────────────────────────────────────────────────
// Owner: "make sure I can click the check mark on the offices to undo them."
// Every other rhythm card already toggles (see practiceCompletion's skip
// stamp); the offices were a one-way stamp, so a mis-tap — or a session you
// bailed out of that still counted — stuck until midnight.
//
// Two parts, because "done" for an office is an OR across many signals: the
// local flag, the server's office history, and per-level read stamps (FDD,
// psalms, the Examen…). Clearing the local flag alone would leave the server
// history to light it straight back up on the next refetch.
//
//   1. Remove the local completed flags for this side's modes.
//   2. Leave a tombstone that masks the NON-local signals for the rest of the
//      day.
//
// The tombstone deliberately does NOT mask the local flag. That's what makes
// this recoverable without teaching every writer of that flag about undo: pray
// the office again, any surface writes the flag, and the card completes again
// on the spot.
const UNDO_PREFIX = "phoebe:office-undone:";
const SIDE_MODES: Record<OfficeUndoSide, string[]> = {
  morning: ["morning", "morning-devotion"],
  evening: ["evening", "early-evening-devotion"],
  compline: ["compline"],
};
export type OfficeUndoSide = "morning" | "evening" | "compline";

export function isOfficeUndoneToday(side: OfficeUndoSide): boolean {
  try { return localStorage.getItem(UNDO_PREFIX + side) === todayKey(); } catch { return false; }
}

/**
 * `onlyMode` un-ticks exactly ONE practice on this side, rather than the
 * whole side.
 *
 * SIDE_MODES casts a deliberately wide net — a side's anchor can complete as
 * either the office OR the devotion flag depending on its level, and undo has
 * to clear whichever one it actually used. That was fine when a side held one
 * practice. It stopped being fine once a side could hold TWO: tapping the ✓ on
 * the SECOND practice's card called undoOfficeToday(side), which wiped both
 * flags and left the anchor un-done too — the mirror image of the
 * "logged the wrong practice" bug already fixed on the write side.
 *
 * Same reasoning as extraModesFor/anchorModesFor in useRhythmState: with two
 * practices on one side, each control has to name the mode it owns.
 */
export function undoOfficeToday(side: OfficeUndoSide, onlyMode?: string): void {
  try {
    const modes = onlyMode ? [onlyMode] : SIDE_MODES[side];
    for (const mode of modes) {
      localStorage.removeItem(`phoebe:office-completed:${mode}:${todayKey()}`);
    }
    // The tombstone masks the non-local (server) signals for the rest of the
    // day, and it is per-SIDE — so it only applies to a whole-side undo. A
    // single-practice undo would otherwise silently mask the OTHER practice's
    // server completion too, which is the very thing onlyMode exists to avoid.
    if (!onlyMode) localStorage.setItem(UNDO_PREFIX + side, todayKey());
    window.dispatchEvent(new Event(OFFICE_DONE_EVENT));
  } catch { /* private mode / quota — non-fatal */ }
}

/** True if this office has already been logged/prayed today (local flag). */
export function isOfficeLoggedToday(mode: string): boolean {
  try { return localStorage.getItem(flagKey(mode)) !== null; } catch { return false; }
}

/** Mark a full office prayed from the physical book: flip the instant local
 *  flag, notify the rhythm, and POST a completed prayer-session. The
 *  morning-prayer / evening-prayer surfaces bypass the 5s session floor, so a
 *  nominal duration still credits office-history + the streak. */
/**
 * `mode` is which office was actually prayed; it defaults to the side, which is
 * the same thing whenever the side's practice IS the full office.
 *
 * It stopped being the same thing when a side gained a SECOND practice. The
 * completion flag is keyed by MODE — "morning" for the office,
 * "morning-devotion" for the devotion — and crediting the side unconditionally
 * meant praying the devotion on Venite ticked the anchor and left the devotion
 * card untouched. Reported as: "I had Devotion as a second morning practice …
 * it also wasn't logging." It was logging; it was logging the other practice.
 */
/**
 * The server-side surface a MODE actually completes as.
 *
 * Reported: "when I logged my secondary practice, it saved properly on my
 * phone, but on web it shows I did my main practice." The LOCAL flag was
 * already keyed by mode (see markOfficeBookComplete's own note on that fix),
 * but the SERVER write below still computed `surface` from the SIDE alone —
 * so a devotion prayed as a second practice correctly flipped the phone's
 * devotion card, while the /api/prayer-sessions row it posted said
 * "morning-prayer" regardless. Web reads that server row, not the phone's
 * localStorage flag, so it showed the ANCHOR as prayed — the exact
 * two-devices-disagree bug reported.
 *
 * Only compline/devotion have their OWN PrayerSurface value; anything else
 * (the full office itself, or a mode with no dedicated surface — e.g.
 * creation-morning/evening) falls back to the side's own office surface,
 * same as before this fix for every case that isn't a second practice.
 */
function surfaceForMode(side: "morning" | "evening", mode: string): PrayerSurface {
  if (mode === "compline") return "compline";
  if (mode === "morning-devotion") return "morning-devotion";
  if (mode === "early-evening-devotion") return "early-evening-devotion";
  return side === "morning" ? "morning-prayer" : "evening-prayer";
}

export function markOfficeBookComplete(
  side: "morning" | "evening",
  mode: string = side,
  /**
   * Which CARD to play the completion moment on. Defaults to the side, which
   * is the anchor's card key.
   *
   * Reported: praying the Devotion as a second morning practice "shows the
   * animation for completing Morning Prayer." The flag was going to the right
   * place by then, but this stamp still named the side — so the home pinned
   * the ANCHOR card in Next, ticked it, and slid it down to Done while the
   * card that had actually been prayed sat there unremarked.
   */
  cardKey: string = side,
): void {
  const surface: PrayerSurface = surfaceForMode(side, mode);
  const wasAlreadyLogged = isOfficeLoggedToday(mode);
  try {
    localStorage.setItem(flagKey(mode), "1");
    // A deliberate re-log outranks an earlier undo today.
    localStorage.removeItem(UNDO_PREFIX + side);
    window.dispatchEvent(new Event(OFFICE_DONE_EVENT));
    if (!wasAlreadyLogged) markRecentCompletion(cardKey);
  } catch { /* private mode / quota — non-fatal */ }
  // A fresh office log (from the book) → the swell haptic.
  if (!wasAlreadyLogged) swellHaptic();
  // The office is done → clear any delivered reminder push so the morning/evening
  // prayer notification disappears. No-op on web; the native shell's
  // phoebe:clear-notifications handler removes matching delivered pushes.
  /**
   * …but only when what was just prayed IS this side's anchor.
   *
   * The devotion mode is shared: it's what a side's SECOND practice runs as
   * when the anchor is the full office. Clearing unconditionally meant praying
   * your additional practice swept the lock-screen reminder for the office you
   * had NOT prayed. Mirrors sessionCountsForAnchor in the server's bellSender,
   * which was suppressing the same reminder for the same reason.
   */
  const devotionMode = side === "morning" ? "morning-devotion" : "early-evening-devotion";
  const isSecondPractice = mode === devotionMode && getSideLevel(side) === "office";
  if (!isSecondPractice) clearOfficeReminderNotifications();
  const now = new Date();
  // This POST is the ENTIRE cross-device record of the office. The local flag
  // above credits the logging device no matter what, so a dropped request was
  // invisible: the phone showed the practice kept and the web never learned it
  // happened. Reported as "Devotion keeps not staying logged on web" — the
  // devotion was logged, on one device only. Same one-retry + visible-failure
  // treatment lib/practiceCompletion.ts already gives its own sync, for the
  // same reason.
  const payload = {
    surface,
    durationSeconds: 60,
    // High enough to clear the "actually prayed an office" (>=3 slides) filter.
    slidesCompleted: 99,
    completed: true,
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
  };
  const post = () => apiRequest("POST", "/api/prayer-sessions", payload);
  post().catch(() => {
    setTimeout(() => {
      post().catch((err) => {
        console.error(`[officeManualLog] sync failed for "${surface}" after retry:`, err);
        try {
          window.dispatchEvent(new CustomEvent(PRACTICE_SYNC_FAILED_EVENT, { detail: { section: surface } }));
        } catch { /* non-fatal */ }
      });
    }, 3000);
  });
}
