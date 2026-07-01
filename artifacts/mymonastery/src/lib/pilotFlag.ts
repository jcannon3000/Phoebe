/**
 * Phoebe Pilot — feature flag (client-side).
 *
 * When false (the default while we're still building it out), the pilot
 * <PilotGate> and every `usePilotMode()` check are no-ops, so the app
 * behaves EXACTLY as it does today for everyone.
 *
 * When true, anyone who is NOT a community admin and NOT a beta/pilot
 * tester is dropped into the simplified pilot experience (a calm two-option
 * home, a trimmed rhythm builder, personal-only prayers, Scripture +
 * Contemplation practices, podcasts without CAC, no community / events).
 *
 * Testing WITHOUT flipping this for everyone: set localStorage
 *   phoebe:pilot-preview = "1"
 * in your own browser (see usePilotMode) to preview the pilot shell.
 */
export const PHOEBE_PILOT_ENABLED = false;

// Per-device preview override so we can walk the pilot experience before
// flipping the global flag. Read defensively — private mode / SSR safe.
export function pilotPreviewEnabled(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem("phoebe:pilot-preview") === "1";
  } catch {
    return false;
  }
}
