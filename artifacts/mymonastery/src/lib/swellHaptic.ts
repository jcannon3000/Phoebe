// Fires the app's "swell" completion haptic — a rising, sustained Core-Haptics
// swell. native-shell maps the `phoebe:haptic` style "celebration" to the
// smoothSwell payload (see native-shell wireHaptics); web has no listener so
// this is a harmless no-op there. Call it the moment a routine item is FRESHLY
// completed (an office logged or finished, a practice / reflection kept) — not
// on reload of an already-done item.
export function swellHaptic(): void {
  try {
    window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "celebration" } }));
  } catch {
    /* no window (SSR) / dispatch failed — ignore */
  }
}
