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
