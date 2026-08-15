import { apiRequest } from "@/lib/queryClient";

// Per-intention "prayed today" tracking — distinct from `answered` (a
// permanent resolution) and from the old single practice_completion
// "prayer-list" flag (a manual all-or-nothing check-off). Backs the
// Prayer List routine card's "X out of Y prayers have been prayed" line.
// Server enforces ownership; these are best-effort fire-and-forget from
// the caller's point of view (PrayThrough advances regardless).

function todayLocalISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

// Fired after either call settles (success or failure — the routine card
// should re-check regardless) so useRhythmState's intentions query
// refetches without a full reload. Same "dispatch a shared event" pattern
// PRACTICE_DONE_EVENT uses elsewhere.
export const INTENTION_PRAYED_EVENT = "phoebe:intention-prayed";

function notify(): void {
  try { window.dispatchEvent(new Event(INTENTION_PRAYED_EVENT)); } catch { /* non-fatal */ }
}

export function markIntentionPrayedToday(intentionId: number): void {
  apiRequest("POST", `/api/prayer-intentions/${intentionId}/pray`, { ymd: todayLocalISO() })
    .catch((err) => console.warn("[intentionsPrayed] mark failed:", err))
    .finally(notify);
}

export function unmarkIntentionPrayedToday(intentionId: number): void {
  apiRequest("DELETE", `/api/prayer-intentions/${intentionId}/pray`, { ymd: todayLocalISO() })
    .catch((err) => console.warn("[intentionsPrayed] unmark failed:", err))
    .finally(notify);
}
