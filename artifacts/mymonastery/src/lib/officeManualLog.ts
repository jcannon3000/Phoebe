import { apiRequest } from "@/lib/queryClient";
import type { PrayerSurface } from "@/hooks/usePrayerSession";

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

function flagKey(side: "morning" | "evening"): string {
  // Same key shape the office viewer writes (phoebe:office-completed:<mode>:<day>),
  // so useRhythmState.officeLocalDone(["morning"…]) / (["evening"…]) picks it up.
  return `phoebe:office-completed:${side}:${todayKey()}`;
}

/** True if this office has already been logged/prayed today (local flag). */
export function isOfficeLoggedToday(side: "morning" | "evening"): boolean {
  try { return localStorage.getItem(flagKey(side)) !== null; } catch { return false; }
}

/** Mark a full office prayed from the physical book: flip the instant local
 *  flag, notify the rhythm, and POST a completed prayer-session. The
 *  morning-prayer / evening-prayer surfaces bypass the 5s session floor, so a
 *  nominal duration still credits office-history + the streak. */
export function markOfficeBookComplete(side: "morning" | "evening"): void {
  const surface: PrayerSurface = side === "morning" ? "morning-prayer" : "evening-prayer";
  try {
    localStorage.setItem(flagKey(side), "1");
    window.dispatchEvent(new Event(OFFICE_DONE_EVENT));
  } catch { /* private mode / quota — non-fatal */ }
  const now = new Date();
  void apiRequest("POST", "/api/prayer-sessions", {
    surface,
    durationSeconds: 60,
    // High enough to clear the "actually prayed an office" (>=3 slides) filter.
    slidesCompleted: 99,
    completed: true,
    startedAt: now.toISOString(),
    endedAt: now.toISOString(),
  }).catch(() => { /* best effort — the local flag already credited it */ });
}
