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
/**
 * TURNED OFF (owner, 2026-09-29: "a fourth option … that could revert to just
 * the practices view on the home screen, something about turn off routine",
 * and "put that as an option in settings too"). While set, the home shows the
 * practice cards as if no routine had been started. NOTHING IS DELETED: the
 * rhythm stays saved, and "Start a routine" brings THEIR routine back, since
 * the seed leaves an already-seeded rhythm alone.
 */
const OFF_KEY = "phoebe:guest-routine-off";

export function routineTurnedOff(): boolean {
  try { return localStorage.getItem(OFF_KEY) === "1"; } catch { return false; }
}

/** Back to the practices view. The routine is kept for when they want it. */
export function turnOffRoutine(): void {
  try { localStorage.setItem(OFF_KEY, "1"); } catch { /* private mode */ }
  try { localStorage.removeItem(JUST_STARTED_KEY); } catch { /* ignore */ }
  try { window.dispatchEvent(new Event(ROUTINE_START_EVENT)); } catch { /* ignore */ }
}

export function routineStarted(): boolean {
  if (routineTurnedOff()) return false;
  try { return localStorage.getItem(STARTED_KEY) === "1"; } catch { return true; }
}

/**
 * True for anyone who had a rhythm BEFORE this existed — an account, or a
 * device that was seeded in the old world. Their home must not empty itself
 * out from under them, so a device that already carries a saved home layout
 * or a chosen office side counts as started.
 */
export function inheritedRoutine(): boolean {
  // Turned off counts as "no routine" everywhere the home asks — the saved
  // layout is still there, it just isn't drawn.
  if (routineTurnedOff()) return false;
  return hasSavedRhythm();
}

/**
 * IS THERE A RHYTHM ON THIS DEVICE AT ALL — turned off or not?
 *
 * The same three keys, read WITHOUT the off flag, which is the difference
 * that matters when the routine is coming back: `inheritedRoutine()` answers
 * "is the home drawing a rhythm", this answers "is there one to draw".
 */
function hasSavedRhythm(): boolean {
  try {
    if (localStorage.getItem("phoebe:home-layout")) return true;
    if (localStorage.getItem("phoebe:office:level:morning")) return true;
    if (localStorage.getItem("phoebe:office:level:evening")) return true;
    return false;
  } catch {
    return true;
  }
}

/**
 * The routine begins — or comes back.
 *
 * TWO DIFFERENT MOMENTS, and telling them apart is the whole of it (owner,
 * 2026-09-29: "if they turn off the routine after having one, and then they
 * turn it back on, have it revert to their last saved routine").
 *
 * FIRST TIME: nothing is saved, so the default rhythm is seeded and the
 * one-time "this is your day now, here is where you change it" pointer is
 * armed.
 *
 * COMING BACK: their rhythm is still on the device — turning it off never
 * deleted anything, it only stopped the home drawing it — so this clears the
 * off flag and leaves every saved thing exactly as it was. No seed (it would
 * be a no-op anyway: seedGuestRule returns early once a device is stamped,
 * and again if a side level is set — but saying so here is worth more than
 * relying on it), and no pointer, because "This is your day now" over a
 * rhythm they built themselves reads as if Phoebe had just made it for them.
 */
export function startRoutine(): void {
  const returning = hasSavedRhythm();
  try { localStorage.removeItem(OFF_KEY); } catch { /* ignore */ }
  try { localStorage.setItem(STARTED_KEY, "1"); } catch { /* private mode — this session only */ }
  if (!returning) {
    try { localStorage.setItem(JUST_STARTED_KEY, "1"); } catch { /* ignore */ }
    // The same seed every device used to get on first open — the default
    // rhythm, its cards and the offices' own settings.
    try { seedGuestRule(); } catch { /* a failed seed leaves them on the cards */ }
  }
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
