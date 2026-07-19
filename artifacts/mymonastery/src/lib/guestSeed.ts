// First-open seed for the PUBLIC no-login version — writes the precoded rule
// of life into the same device-local officePrefs the customizer uses, ONCE, so
// a brand-new person lands on a home that's already going:
//
//   Morning Psalms (Daily Office Lectionary) · Evening Psalms (same cycle) ·
//   Forward Day by Day · a 5-minute silence daily goal (its own single goal
//   card with a progress bar — NOT the per-side contemplation cards).
//
// Adjustable afterward in Daily progress → Customize, exactly like any rule.
// (The after-noon "morning belongs to tomorrow" rule lives in
// DailyProgressBody now — for guests it applies EVERY day, not just the seed
// day.) See memory "project_public_no_login".

import { setSideLevel, setSideEntry, setReflectionSource, setSideReflection, getExplicitSideLevel, setPsalmCycle, OFFICE_PREFS_EVENT } from "@/lib/officePrefs";
import { clearSpuriousGuestHomeLayout } from "@/lib/homeLayoutCache";
import { clearRoutineSyncClock } from "@/lib/routineSync";

const SEED_KEY = "phoebe:guest-seeded-ymd"; // local YMD of the first-open seed

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function guestSeededYmd(): string | null {
  try { return localStorage.getItem(SEED_KEY); } catch { return null; }
}

// Forget the seed (Settings → "Reset routine to default") so the NEXT
// seedGuestRule() re-writes the precoded default from scratch. Also clears the
// device-local silence + step goals so they return to their defaults.
export function clearGuestSeed(): void {
  try {
    localStorage.removeItem(SEED_KEY);
    localStorage.removeItem(GUEST_GOAL_KEY);
    localStorage.removeItem(GUEST_STEP_GOAL_KEY);
  } catch { /* private mode */ }
}

/** Seed the precoded guest rule once (no-op if the device already has ANY
 *  explicit rule or has seeded before). Safe to call on every guest boot. */
export function seedGuestRule(): void {
  try {
    // Undo a stale home layout a short-lived bug wrote for the Creation Prayer
    // pick, which was hiding the newsletter card (see clearSpuriousGuestHomeLayout).
    if (clearSpuriousGuestHomeLayout()) { try { window.dispatchEvent(new Event(OFFICE_PREFS_EVENT)); } catch { /* ignore */ } }
    if (localStorage.getItem(SEED_KEY)) {
      // Backfill for devices seeded by an earlier bundle that didn't write the
      // goal key yet — without it the home shows no Silence card at all.
      if (localStorage.getItem(GUEST_GOAL_KEY) == null) localStorage.setItem(GUEST_GOAL_KEY, "5");
      return; // already seeded
    }
    // Respect an existing rule (e.g. a device that used the app signed-in).
    if (getExplicitSideLevel("morning") || getExplicitSideLevel("evening")) return;
    setSideLevel("morning", "psalms");
    setSideLevel("evening", "psalms");
    setSideEntry("morning", "read");
    setSideEntry("evening", "read");
    setPsalmCycle("office"); // the Daily Office Lectionary (calendar-based)
    setReflectionSource("fdd");
    setSideReflection("morning", "fdd");
    setSideReflection("evening", "fdd");
    // The 5-minute silence DAILY GOAL (single goal card w/ progress bar) is a
    // guest-local pref — the goal card reads it via the guest goal key below
    // (server contemplationGoalMinutes needs an account).
    localStorage.setItem(GUEST_GOAL_KEY, "5");
    localStorage.setItem(SEED_KEY, todayYmd());
    // The precoded seed is NOT a user-authored routine, so it must never migrate
    // up to an account on sign-in. The setters above bumped the routine sync
    // clock (via OFFICE_PREFS_EVENT → pushRoutineConfig); zero it back out — and
    // cancel that queued (session-less, doomed) guest push — so a pure seed has
    // localAt === 0. The owner-switch guard in routineSync then skips migrating
    // it, and a genuine later customization re-bumps the clock and migrates
    // normally. (Without this, reinstall → psalms seed → sign in → the seed
    // clobbered an office account whose method lived only in office-prefs, and
    // the morning reminder went out worded for psalms.)
    clearRoutineSyncClock();
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

// The guest DAILY STEP goal (steps) — device-local stand-in for the server's
// dailyStepGoal (which guests, being login-free, don't reach). The Daily steps
// page + the home step card read/write this when in guest mode. 0 = off.
export const GUEST_STEP_GOAL_KEY = "phoebe:guest-step-goal";
export function getGuestStepGoal(): number {
  try {
    const v = parseInt(localStorage.getItem(GUEST_STEP_GOAL_KEY) ?? "", 10);
    return Number.isFinite(v) && v >= 0 && v <= 200000 ? v : 0;
  } catch { return 0; }
}
export function setGuestStepGoal(steps: number): void {
  try {
    localStorage.setItem(GUEST_STEP_GOAL_KEY, String(Math.max(0, Math.min(200000, Math.round(steps)))));
    window.dispatchEvent(new Event(OFFICE_PREFS_EVENT));
  } catch { /* ignore */ }
}

// Reset ALL device-local rule / preference state on LOGOUT, so the next person
// on this device (a guest) starts from the STANDARD seeded rule — not the
// signed-out user's customizations. The authoritative rule data lives on the
// server (rule_config, office-prefs, home layout, custom anchors, Way of Love)
// and is restored on the next sign-in, so clearing the DEVICE copy is safe. It
// also fixes re-login on the SAME device: a blank device + a zeroed routine
// sync clock makes routineSync ADOPT the server config in full, instead of a
// stale local copy winning last-write-wins. Clearing the guest-seeded marker
// makes seedGuestRule() re-run fresh on the next guest boot → the standard rule.
export function resetDeviceRuleForLogout(): void {
  try {
    const PREFIXES = [
      "phoebe:office:",           // per-side levels/entries/reflections/minutes/etc.
      "phoebe:office-completed:", // today's office done flags
      "phoebe:practice-done:",    // today's optional-practice done flags
      "phoebe:contemplation",     // per-side sit done flags + style
      "phoebe:slot:",             // practice time-of-day slots
      "phoebe:guest-",            // guest silence/step goals, seed marker, welcome, migrated
      "phoebe:home-layout",       // cached home card order/visibility
      "phoebe:routine",           // routine sync clock (UPDATED_AT) + owner
      "phoebe:health-",           // Apple Health connect/step flags
      "phoebe:course:",           // course progress (rides rule_config; flushed
                                  // on logout, restored from the server on re-login)
      "phoebe:spotify",           // Spotify OAuth token/verifier/state (audit #19:
                                  // otherwise user B inherits user A's Spotify tokens
                                  // on a shared device)
    ];
    const EXACT = new Set([
      "phoebe:fdd-mode", "phoebe:psalm-cycle", "phoebe:scripture-scope",
      "phoebe:journaling-slot", "phoebe:commitment-start", "phoebe:dp-pulse",
    ]);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (EXACT.has(k) || PREFIXES.some((p) => k.startsWith(p))) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch { /* private mode — nothing to reset */ }
}
