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
    // RETIRED (owner: no intro slides on first download). New users land
    // straight on the seeded default home — Psalms morning & evening + Forward
    // Day by Day, from guestSeed.seedGuestRule() — and customize from there.
    // The ?firstrun=1 escape hatch still force-shows the flow for previewing;
    // it writes nothing (see the `preview` guard in FirstOpenOnboarding).
    return new URLSearchParams(window.location.search).get("firstrun") === "1";
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

// While the first-open intro is on screen, the home renders BEHIND it. The home
// must not cascade its cards in (or fire the per-card cascade haptics) under the
// opaque overlay — so it holds its cards until the intro dissolves. This module
// flag lets the home's splash gate know the intro is still up even after the
// DONE flag is stamped (which happens a few slides before the dissolve).
let onboardingActive = false;
export function isFirstOpenOnboardingActive(): boolean { return onboardingActive; }
export function markFirstOpenOnboardingActive(active: boolean): void { onboardingActive = active; }
// Fired the moment the intro begins dissolving, so the home un-gates and
// cascades its cards in as the overlay fades (reusing the splash-done path).
export const FIRST_OPEN_ONBOARDING_CLOSED_EVENT = "phoebe:first-open-onboarding-closed";
