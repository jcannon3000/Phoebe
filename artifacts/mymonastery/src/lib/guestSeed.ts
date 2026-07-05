// First-open seed for the PUBLIC no-login version — writes the precoded rule
// of life into the same device-local officePrefs the customizer uses, ONCE, so
// a brand-new person lands on a home that's already going:
//
//   Morning Office · Evening Office · Forward Day by Day · a 5-minute silence
//   daily goal (its own single goal card with a progress bar — NOT the per-side
//   contemplation cards).
//
// Adjustable afterward in Daily progress → Customize, exactly like any rule.
// (The after-noon "morning belongs to tomorrow" rule lives in
// DailyProgressBody now — for guests it applies EVERY day, not just the seed
// day.) See memory "project_public_no_login".

import { setSideLevel, setSideEntry, setReflectionSource, setSideReflection, getExplicitSideLevel, OFFICE_PREFS_EVENT } from "@/lib/officePrefs";

const SEED_KEY = "phoebe:guest-seeded-ymd"; // local YMD of the first-open seed

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function guestSeededYmd(): string | null {
  try { return localStorage.getItem(SEED_KEY); } catch { return null; }
}

/** Seed the precoded guest rule once (no-op if the device already has ANY
 *  explicit rule or has seeded before). Safe to call on every guest boot. */
export function seedGuestRule(): void {
  try {
    if (localStorage.getItem(SEED_KEY)) {
      // Backfill for devices seeded by an earlier bundle that didn't write the
      // goal key yet — without it the home shows no Silence card at all.
      if (localStorage.getItem(GUEST_GOAL_KEY) == null) localStorage.setItem(GUEST_GOAL_KEY, "5");
      return; // already seeded
    }
    // Respect an existing rule (e.g. a device that used the app signed-in).
    if (getExplicitSideLevel("morning") || getExplicitSideLevel("evening")) return;
    setSideLevel("morning", "office");
    setSideLevel("evening", "office");
    setSideEntry("morning", "read");
    setSideEntry("evening", "read");
    setReflectionSource("fdd");
    setSideReflection("morning", "fdd");
    setSideReflection("evening", "fdd");
    // The 5-minute silence DAILY GOAL (single goal card w/ progress bar) is a
    // guest-local pref — the goal card reads it via the guest goal key below
    // (server contemplationGoalMinutes needs an account).
    localStorage.setItem(GUEST_GOAL_KEY, "5");
    localStorage.setItem(SEED_KEY, todayYmd());
  } catch { /* private mode — the starter defaults still apply */ }
}

// The guest silence daily goal (minutes) — device-local stand-in for the
// server's contemplationGoalMinutes. The customizer's silence step and the
// home goal card both read/write this when in guest mode.
export const GUEST_GOAL_KEY = "phoebe:guest-silence-goal-min";
export function getGuestSilenceGoalMin(): number {
  try {
    const v = parseInt(localStorage.getItem(GUEST_GOAL_KEY) ?? "", 10);
    return Number.isFinite(v) && v >= 0 && v <= 180 ? v : 0;
  } catch { return 0; }
}
/** The stored goal itself, or null when the device has never written one —
 *  lets the customizer tell "a chosen value (even 0 = no goal)" apart from
 *  "nothing yet" (which falls back to the 5-minute default). */
export function getGuestSilenceGoalMinRaw(): number | null {
  try {
    const s = localStorage.getItem(GUEST_GOAL_KEY);
    if (s == null) return null;
    const v = parseInt(s, 10);
    return Number.isFinite(v) && v >= 0 && v <= 180 ? v : null;
  } catch { return null; }
}
export function setGuestSilenceGoalMin(min: number): void {
  try {
    localStorage.setItem(GUEST_GOAL_KEY, String(Math.max(0, Math.min(180, Math.round(min)))));
    // Same live-update signal the officePrefs setters fire, so the home cards
    // and the simple rule editor re-read the goal without a reload.
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* ignore */ }
}
