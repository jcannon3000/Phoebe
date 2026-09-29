// isFirstOpen — true ONLY on the very first app launch on this device, false
// ever after. Device-local, computed ONCE per JS session (module cache) so
// every caller in the same launch agrees regardless of call order; the
// localStorage flag is stamped on that first call so the next launch reads
// false.
//
// A brand-new user should land straight on the home with their standard
// (seeded) routine already there — no app-open splash, no held card cascade.
// The recap / quote greeting splash is for people who've already been here, so
// it starts on the SECOND open. See OpeningSplash (layout.tsx) + the
// `splashCleared` card gate (DailyProgressBody / dashboard).

const FLAG = "phoebe:opened-before";
let cached: boolean | null = null;

export function isFirstOpen(): boolean {
  if (cached !== null) return cached;
  if (typeof window === "undefined") {
    cached = false;
    return cached;
  }
  try {
    const seen = window.localStorage.getItem(FLAG);
    cached = !seen;
    if (!seen) window.localStorage.setItem(FLAG, "1");
  } catch {
    // Private mode / quota — treat as a returning open (never suppress the
    // splash on a device we can't remember, so we don't skip it forever).
    cached = false;
  }
  return cached;
}

/**
 * The web landing page (public/landing.html) is shown ONCE, on a first visit,
 * before the app. Going there must not spend the first open: `isFirstOpen()`
 * is what gives a brand-new visitor the instant seeded home (four guest-path
 * gates), and that should happen when they come back through "Start praying",
 * not on the visit that only showed them the landing. So leaving for it
 * un-stamps the first-open flag and remembers the landing on its own key.
 */
const LANDING_FLAG = "phoebe:landing-seen";

export function hasSeenLanding(): boolean {
  try { return !!window.localStorage.getItem(LANDING_FLAG); } catch { return true; }
}

export function leaveForLanding(): void {
  try {
    window.localStorage.setItem(LANDING_FLAG, "1");
    window.localStorage.removeItem(FLAG);
  } catch { /* private mode: they simply get the app */ }
  window.location.replace("/landing.html");
}
