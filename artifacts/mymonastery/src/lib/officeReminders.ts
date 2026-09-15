// Clearing delivered office-reminder pushes from the iOS notification center.
//
// A morning/evening prayer reminder is delivered with one of these APN
// thread-ids depending on which sender fired it:
//   • "bell"                  — the general morning bell / evening nudge
//   • "parish-office-morning" — the user's own morning office reminder
//   • "parish-office-evening" — the user's own evening office reminder
//
// Once the user has actually prayed, that lock-screen banner has done its job
// and shouldn't linger. Every surface that completes prayer for the day
// (the office deck, the slideshow, the one-tap "I prayed it" log) calls this so
// the notification disappears. Keeping the thread list in ONE place is the
// point: it used to be copy-pasted per surface, and a stale copy in the
// slideshow only cleared "bell" — so completing prayer there left the real
// office reminder sitting on the lock screen.
//
// ONLY THE SIDE THAT WAS PRAYED (audit, 2026-09-14). This used to clear BOTH
// sides' threads from every surface, "a stray evening reminder shouldn't
// survive a morning office". While the native matcher never matched, that did
// nothing; once clearing worked (b2db2970), praying the morning at 6:30 PM
// took the still-undone evening's reminder with it. Now a caller that knows
// the side clears that side's threads, and every call also asks the reminder
// watcher (lib/widgetSync) to look again. The watcher reads the one
// completion computation, so it catches whatever the caller couldn't name.
// The native shell listens for `phoebe:clear-notifications` and removes any
// delivered push whose thread-id matches; no-op on web, idempotent if the
// notification was already dismissed.
const SIDE_REMINDER_THREADS = {
  morning: ["parish-office-morning", "bell"],
  evening: ["parish-office-evening", "bell"],
} as const;

export function clearOfficeReminderNotifications(side?: "morning" | "evening" | null): void {
  for (const threadId of side ? SIDE_REMINDER_THREADS[side] : []) {
    try {
      window.dispatchEvent(new CustomEvent("phoebe:clear-notifications", { detail: { threadId } }));
    } catch {
      /* non-fatal — web build has no listener; the OS drops the push later */
    }
  }
  try { window.dispatchEvent(new Event("phoebe:reminders-recheck")); } catch { /* non-fatal */ }
}
