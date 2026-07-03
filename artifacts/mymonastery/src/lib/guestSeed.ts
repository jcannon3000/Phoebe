// First-open seed for the PUBLIC no-login version — writes the precoded rule
// of life into the same device-local officePrefs the customizer uses, ONCE, so
// a brand-new person lands on a home that's already going:
//
//   Morning Office · Evening Office · Forward Day by Day · a 5-minute silence
//   daily goal (its own single goal card with a progress bar — NOT the per-side
//   contemplation cards).
//
// Adjustable afterward in Daily progress → Customize, exactly like any rule.
// The seed stamps the local day it ran: when that first open is AFTER NOON,
// the home treats the (unstarted) morning office as tomorrow's — the day
// starts where you are. See memory "project_public_no_login".

import { setSideLevel, setSideEntry, setReflectionSource, setSideReflection, getExplicitSideLevel } from "@/lib/officePrefs";

const SEED_KEY = "phoebe:guest-seeded-ymd"; // local YMD of the first-open seed

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function guestSeededYmd(): string | null {
  try { return localStorage.getItem(SEED_KEY); } catch { return null; }
}

/** True only on the seed day itself when the seed happened after 12pm local —
 *  the "downloaded in the afternoon" case where the morning office belongs to
 *  tomorrow rather than reading as missed. */
export function guestSeededAfterNoonToday(): boolean {
  try {
    return localStorage.getItem(SEED_KEY) === todayYmd() && localStorage.getItem(`${SEED_KEY}:pm`) === "1";
  } catch { return false; }
}

/** Seed the precoded guest rule once (no-op if the device already has ANY
 *  explicit rule or has seeded before). Safe to call on every guest boot. */
export function seedGuestRule(): void {
  try {
    if (localStorage.getItem(SEED_KEY)) return; // already seeded
    // Respect an existing rule (e.g. a device that used the app signed-in).
    if (getExplicitSideLevel("morning") || getExplicitSideLevel("evening")) return;
    setSideLevel("morning", "office");
    setSideLevel("evening", "office");
    setSideEntry("morning", "read");
    setSideEntry("evening", "read");
    setReflectionSource("fdd");
    setSideReflection("morning", "fdd");
    // The 5-minute silence DAILY GOAL (single goal card w/ progress bar) is a
    // guest-local pref — the goal card reads it via the guest goal key below
    // (server contemplationGoalMinutes needs an account).
    localStorage.setItem(GUEST_GOAL_KEY, "5");
    localStorage.setItem(SEED_KEY, todayYmd());
    if (new Date().getHours() >= 12) localStorage.setItem(`${SEED_KEY}:pm`, "1");
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
export function setGuestSilenceGoalMin(min: number): void {
  try { localStorage.setItem(GUEST_GOAL_KEY, String(Math.max(0, Math.min(180, Math.round(min))))); } catch { /* ignore */ }
}
