import { useEffect } from "react";
import { isNativeShell } from "@/lib/isNativeShell";
import { routineStarted, inheritedRoutine, ROUTINE_START_EVENT } from "@/lib/routineStart";
import { ROUTINE_SYNCED_EVENT } from "@/lib/routineSync";
import { OFFICE_PREFS_EVENT } from "@/lib/officePrefs";

// ── Two daily reminders for someone without a routine yet ──────────────────
//
// Owner, 2026-09-30: "If someone doesn't have a routine yet … when they
// download the app, ask them if to turn on notifications and send them a
// notification that would just take them to the home page … at 7 a.m. and
// 6 p.m."
//
// On the phone only (local notifications need the app). The first schedule is
// the ask: native-shell's `phoebe:schedule-bell` requests permission when it
// hasn't been granted, then sets a daily repeating notification. Both carry
// `route: "/dashboard"`, so a tap opens the home, not wherever the app was.
//
// They are for the time BEFORE a routine: starting one cancels them (the
// routine's own reminders are its settings' business), and turning the routine
// off brings them back. Re-scheduling on every launch is safe — a bell's id is
// derived from its name, so it replaces itself — and after a refusal iOS
// answers "denied" without asking again.

const BELLS = [
  {
    bellId: "no-routine-morning", hourMin: "07:00",
    title: "Good morning",
    body: "Take a few minutes to pray as the day begins.",
  },
  {
    bellId: "no-routine-evening", hourMin: "18:00",
    title: "Good evening",
    body: "Close the day with a few quiet minutes of prayer.",
  },
] as const;

function noRoutine(): boolean {
  return !routineStarted() && !inheritedRoutine();
}

function schedule(): void {
  for (const b of BELLS) {
    try { window.dispatchEvent(new CustomEvent("phoebe:schedule-bell", { detail: { ...b, route: "/dashboard" } })); } catch { /* web */ }
  }
}

function cancel(): void {
  for (const b of BELLS) {
    try { window.dispatchEvent(new CustomEvent("phoebe:cancel-bell", { detail: { bellId: b.bellId } })); } catch { /* web */ }
  }
}

export function NoRoutineReminders() {
  useEffect(() => {
    if (!isNativeShell()) return;
    // A beat after launch, so the question arrives once the home is on screen
    // rather than over the splash.
    const t = window.setTimeout(() => { if (noRoutine()) schedule(); else cancel(); }, 2500);
    /**
     * RE-CHECK WHEN A ROUTINE ARRIVES, not only when one is started here
     * (audit, 2026-09-30). A fresh install signing in to an account with a
     * routine reads "no routine" at launch, before the server's copy lands;
     * that copy arrives as ROUTINE_SYNCED_EVENT / OFFICE_PREFS_EVENT, and
     * without these the two reminders stayed until the next launch.
     */
    const onRoutine = () => { if (noRoutine()) schedule(); else cancel(); };
    const onMaybeRoutine = () => { if (!noRoutine()) cancel(); };
    window.addEventListener(ROUTINE_START_EVENT, onRoutine);
    window.addEventListener(ROUTINE_SYNCED_EVENT, onMaybeRoutine);
    window.addEventListener(OFFICE_PREFS_EVENT, onMaybeRoutine);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener(ROUTINE_START_EVENT, onRoutine);
      window.removeEventListener(ROUTINE_SYNCED_EVENT, onMaybeRoutine);
      window.removeEventListener(OFFICE_PREFS_EVENT, onMaybeRoutine);
    };
  }, []);
  return null;
}
