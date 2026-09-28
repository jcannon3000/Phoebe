// ── Has this person actually asked for a routine? ───────────────────────────
//
// Owner, 2026-09-28: "for new users … if they haven't built a routine yet, it
// just would show them practices that they can engage in … and then a fourth
// card that says build a routine or start a routine. And it would then change
// it to the default routine."
//
// Until today every device was handed the default rhythm on its first open
// (lib/guestSeed), so a newcomer met a day already planned for them — five
// cards, dots, a streak — before they had chosen anything. Now the rhythm
// waits to be asked for: the home offers a few ways to pray, and the routine
// begins when they say so.
//
// DEVICE-LOCAL, under the "phoebe:guest-" prefix so the logout wipe takes it
// with the rest of that family: a phone handed to somebody else is a new
// beginning, and should be offered the choice rather than inheriting one.

import { seedGuestRule } from "@/lib/guestSeed";

const STARTED_KEY = "phoebe:guest-routine-started";
/** Set the moment a routine begins; cleared once the person has been shown
 *  where to edit it, so the pointer appears exactly once. */
const JUST_STARTED_KEY = "phoebe:guest-routine-just-started";
export const ROUTINE_START_EVENT = "phoebe:routine-started";

export function routineStarted(): boolean {
  try { return localStorage.getItem(STARTED_KEY) === "1"; } catch { return true; }
}

/**
 * True for anyone who had a rhythm BEFORE this existed — an account, or a
 * device that was seeded in the old world. Their home must not empty itself
 * out from under them, so a device that already carries a saved home layout
 * or a chosen office side counts as started.
 */
export function inheritedRoutine(): boolean {
  try {
    if (localStorage.getItem("phoebe:home-layout")) return true;
    if (localStorage.getItem("phoebe:office:level:morning")) return true;
    if (localStorage.getItem("phoebe:office:level:evening")) return true;
    return false;
  } catch {
    return true;
  }
}

/** The routine begins: seed the default rhythm and remember that they asked. */
export function startRoutine(): void {
  try { localStorage.setItem(STARTED_KEY, "1"); } catch { /* private mode — this session only */ }
  try { localStorage.setItem(JUST_STARTED_KEY, "1"); } catch { /* ignore */ }
  // The same seed every device used to get on first open — the default
  // rhythm, its cards and the offices' own settings.
  try { seedGuestRule(); } catch { /* a failed seed leaves them on the cards */ }
  try { window.dispatchEvent(new Event(ROUTINE_START_EVENT)); } catch { /* ignore */ }
}

/** Show the "here is where you change it" pointer? Once, just after starting. */
export function routineJustStarted(): boolean {
  try { return localStorage.getItem(JUST_STARTED_KEY) === "1"; } catch { return false; }
}

export function clearRoutineJustStarted(): void {
  try { localStorage.removeItem(JUST_STARTED_KEY); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(ROUTINE_START_EVENT)); } catch { /* ignore */ }
}
