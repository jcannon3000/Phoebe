// Clears the per-DEVICE "done today" flags that the app stamps in localStorage
// as the user prays through the day. These are device-scoped, not account-
// scoped, so they survive a fresh signup — which made a brand-new account
// inherit the visitor's pre-signup prayer ("Morning Psalms already prayed",
// "today's reflection read") and the home then hid those anchors as done.
//
// Call this on every successful account creation so a new account starts with
// a genuinely empty day. Logout has its own wipe — resetDeviceRuleForLogout
// (lib/guestSeed), run by useLogout and again at the next boot — which clears
// the day read trackers through isDailyReadStateKey (lib/cacReadState).

const PREFIXES = [
  "phoebe:office-completed",        // office/devotion finished today (per mode)
  "phoebe:office-done",
  "phoebe:slideshow-completed",     // prayer-list slideshow walked today
  "phoebe:practice-done",           // optional practices (gratitude/examen/listening/…)
  "phoebe:practice-skip",           // …and "Not today" for those same practices. A
                                    // visitor who skipped a card before signing up
                                    // handed the new account a day with that card
                                    // already gone — the opposite of the "genuinely
                                    // empty day" above (audit, 2026-09-16).
  "phoebe:contemplation-session-done",
  "phoebe:custom-done",             // custom anchors kept today (+ -hist)
  "phoebe:custom-anchor-done",
  "phoebe:weekly-done",             // Way-of-Love weekly self-logs
  "phoebe:psalms",                  // psalms-read + psalms:{side}:last-read-day
];

export function clearDailyCompletionFlags(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (PREFIXES.some((p) => key.startsWith(p)) || key.includes("last-read-day")) {
        toRemove.push(key);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* private mode / no storage — nothing to clear */
  }
}
