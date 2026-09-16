/**
 * State for the three-breath intro after the native app-open splash
 * (components/BreathIntro, owned by OpeningSplash in components/layout.tsx).
 *
 * Owner, 2026-09-16: super admins first, and "every app launch, but only once
 * every 15 minutes".
 *
 * Deliberately in two stores:
 *  - WHEN IT LAST SHOWED lives in localStorage, because the 15-minute rule must
 *    survive the app being killed and relaunched — that is what a launch is.
 *  - WHETHER ONE IS RUNNING lives in sessionStorage, as a start time and a
 *    deadline. A Layout remount while sign-in resolves tears the splash down and
 *    mounts it again; the new splash reads these to RESUME the same breaths
 *    rather than vanish mid-breath, and the home's card gates read
 *    isBreathIntroActive() to keep the cards held behind it.
 *
 * The deadline keeps both honest: past it nothing treats an intro as running,
 * so a stalled or abandoned one can never hold the home.
 */
const LAST_SHOWN_KEY = "phoebe:breath-intro-at";
const STARTED_KEY = "phoebe:breath-intro-started";
const DEADLINE_KEY = "phoebe:breath-intro-deadline";
const ENDED_KEY = "phoebe:breath-intro-ended";

/** Three breaths (owner). */
export const BREATH_INTRO_BREATHS = 3;
/** Owner: "only once every 15 minutes". */
export const BREATH_INTRO_MIN_GAP_MS = 15 * 60 * 1000;
/** Headroom past the last exhale before the cap forces the fade. */
export const BREATH_INTRO_SLACK_MS = 4000;

/** Has it been at least 15 minutes since the intro last began on this device? */
export function breathIntroDueNow(now = Date.now()): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_SHOWN_KEY));
    // Never shown, unreadable, or stamped in the future (the clock moved back):
    // all due, so a bad stamp can't suppress the intro indefinitely.
    if (!Number.isFinite(last) || last <= 0 || last > now) return true;
    return now - last >= BREATH_INTRO_MIN_GAP_MS;
  } catch {
    // Storage we can't read is storage we can't throttle with — don't show it
    // on every launch rather than risk that.
    return false;
  }
}

/** Mark the intro started; returns the start time the breaths are timed from. */
export function beginBreathIntro(durationMs: number, now = Date.now()): number {
  try { localStorage.setItem(LAST_SHOWN_KEY, String(now)); } catch { /* ignore */ }
  try {
    sessionStorage.setItem(STARTED_KEY, String(now));
    sessionStorage.setItem(DEADLINE_KEY, String(now + durationMs));
    sessionStorage.removeItem(ENDED_KEY);
  } catch { /* ignore */ }
  return now;
}

/** The breaths ended — kept, skipped or capped. */
export function endBreathIntro(): void {
  try { sessionStorage.setItem(ENDED_KEY, "1"); } catch { /* ignore */ }
}

/** Is an intro on screen right now (started, not ended, not past its deadline)? */
export function isBreathIntroActive(now = Date.now()): boolean {
  try {
    if (sessionStorage.getItem(ENDED_KEY)) return false;
    const deadline = Number(sessionStorage.getItem(DEADLINE_KEY));
    return Number.isFinite(deadline) && deadline > 0 && now < deadline;
  } catch {
    return false;
  }
}

/** The running intro's start time, for a remounted splash to resume from. */
export function breathIntroStartedAt(): number | null {
  if (!isBreathIntroActive()) return null;
  try {
    const started = Number(sessionStorage.getItem(STARTED_KEY));
    return Number.isFinite(started) && started > 0 ? started : null;
  } catch {
    return null;
  }
}
