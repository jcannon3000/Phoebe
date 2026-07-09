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
// Clearing BOTH sides regardless of which office was prayed is intentional: a
// stray evening reminder shouldn't survive a morning office and vice versa once
// the user has engaged with prayer for the day. The native shell listens for
// `phoebe:clear-notifications` and removes any delivered push whose thread-id
// matches; it's a no-op on web (no listener) and idempotent if the notification
// was already dismissed.
const OFFICE_REMINDER_THREADS = ["bell", "parish-office-morning", "parish-office-evening"] as const;

export function clearOfficeReminderNotifications(): void {
  for (const threadId of OFFICE_REMINDER_THREADS) {
    try {
      window.dispatchEvent(new CustomEvent("phoebe:clear-notifications", { detail: { threadId } }));
    } catch {
      /* non-fatal — web build has no listener; the OS drops the push later */
    }
  }
}
