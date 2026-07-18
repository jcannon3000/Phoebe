import { isNativeShell } from "@/lib/isNativeShell";
import { isFirstOpen } from "@/lib/firstOpen";

// Gate for the first-open prayer-setup splash (iOS/native only): show it once, on
// the user's very first app open, and keep it "pending" until they actually
// finish — so a force-quit mid-flow re-shows it next launch rather than dropping
// them onto the seeded default with no choice made. Existing users (who have
// opened before, so isFirstOpen() is already false) never see it.
//
// `?firstrun=1` in the URL force-shows it on ANY platform, for previewing.
const DONE = "phoebe:first-open-onboarding-done";
const PENDING = "phoebe:first-open-onboarding-pending";

export function shouldShowFirstOpenOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("firstrun") === "1") return true;
    if (!isNativeShell()) return false;
    if (localStorage.getItem(DONE)) return false;
    if (localStorage.getItem(PENDING)) return true;
    // isFirstOpen() is memoized per session (and shared with the OpeningSplash),
    // so calling it here doesn't disturb that gate — it just tells us this is the
    // first launch. Mark pending so we re-show until finished.
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
