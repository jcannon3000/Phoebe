import { isFirstOpen } from "@/lib/firstOpen";

// Gate for the first-open prayer-setup splash: show it once, on the user's very
// first visit (native app OR website), and keep it "pending" until they actually
// finish — so a force-quit mid-flow re-shows it next time rather than dropping
// them onto the seeded default with no choice made. Existing users (who have
// opened before, so isFirstOpen() is already false) never see it.
//
// A returning signed-in user landing on a fresh browser would also count as a
// "first open" here — the component treats that case as a read-only preview (no
// routine writes) so their existing rhythm is never overwritten.
//
// `?firstrun=1` in the URL force-shows it (also read-only), for previewing.
const DONE = "phoebe:first-open-onboarding-done";
const PENDING = "phoebe:first-open-onboarding-pending";

export function shouldShowFirstOpenOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("firstrun") === "1") return true;
    if (localStorage.getItem(DONE)) return false;
    if (localStorage.getItem(PENDING)) return true;
    // isFirstOpen() is memoized per session (and shared with the OpeningSplash),
    // so calling it here doesn't disturb that gate — it just tells us this is the
    // first open. Mark pending so we re-show until finished.
    if (isFirstOpen()) { localStorage.setItem(PENDING, "1"); return true; }
    return false;
  } catch {
    return false;
  }
}

export function markFirstOpenOnboardingDone(): void {
  try {
    localStorage.setItem(DONE, "1");
    localStorage.removeItem(PENDING);
  } catch {
    /* private mode / quota — non-fatal */
  }
}
