// ─── Reminder timing arithmetic ─────────────────────────────────────────────
//
// The two pure predicates that decide WHEN a reminder fires, extracted from
// bellSender so they can be tested without dragging in the database, the push
// senders and the scheduler. Nothing here reads state or performs I/O: given a
// zone, a target and an instant, the answer is a function of its arguments.
//
// Extracted after a 6:30 AM reminder was reported arriving at 7:01. That turned
// out to be a write-path bug — the stored time was never 6:30 — but confirming
// it meant reading this arithmetic closely with nothing pinning it, and a
// daylight-saving off-by-one here would produce a report indistinguishable from
// that one. See reminderTiming.test.ts.

import { getCurrentTimeInTz } from "./tz";

/**
 * How long after the target minute a reminder may still be sent.
 *
 * The senders tick every 60 seconds, but a tick can be skipped (a previous
 * fan-out still in flight) or delayed (a slow run, a restart), so an exact
 * equality test would silently drop somebody's reminder for the day. The grace
 * window is what makes the tick a SAMPLING rate rather than the correctness
 * guarantee. Each sender's per-day sent-date column is what stops the window
 * from sending ten times.
 */
export const REMINDER_GRACE_MINUTES = 10;

/**
 * Is `now`, read as wall-clock time in `tz`, at or just after `targetHHMM`?
 *
 * Deliberately NOT an equality test on the minute — see the grace window above.
 * A negative delta means the target hasn't arrived yet in this zone, or the
 * local day has already wrapped past midnight; either way we don't fire, and in
 * the wrap case the sent-date is keyed to a new day anyway.
 */
export function isAtOrJustAfterMinute(
  tz: string,
  targetHHMM: string,
  now: Date,
  graceMinutes: number = REMINDER_GRACE_MINUTES,
): boolean {
  const [hStr, mStr] = targetHHMM.split(":");
  const target = parseInt(hStr ?? "", 10) * 60 + parseInt(mStr ?? "", 10);
  if (!Number.isFinite(target)) return false;
  const { hour, minute } = getCurrentTimeInTz(tz, now);
  const delta = hour * 60 + minute - target;
  return delta >= 0 && delta < graceMinutes;
}

/**
 * Add whole hours to a HH:MM string, clamped to 23:59.
 *
 * A follow-up that would roll past midnight simply never fires — the senders'
 * own cutoff-hour gates (noon for the morning follow-up, 10pm for the evening)
 * catch it before this does. Clamping rather than wrapping is what keeps a
 * "3 hours after your evening reminder" nudge from arriving the next morning.
 */
export function addHoursToHHMM(hhmm: string, hours: number): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr ?? "", 10) + hours;
  const hh = String(Math.min(23, Math.max(0, h))).padStart(2, "0");
  return `${hh}:${(mStr ?? "00").padStart(2, "0")}`;
}
