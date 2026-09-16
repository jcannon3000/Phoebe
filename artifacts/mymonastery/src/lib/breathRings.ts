/**
 * The breath's timing and its rings — ONE definition, shared.
 *
 * Creation Prayer's breath (components/CobreatheBreath) and the three-breath
 * intro after the app-open splash (components/BreathIntro) draw the SAME rings.
 * Owner, 2026-09-16, of the intro: "have the circles ui the same as breathing
 * together". They live here rather than being exported from CobreatheBreath so
 * the launch path doesn't pull in that component's photo library and its
 * server-clock sync just to learn a radius.
 */

// Breath pacing — a simple in / out breath, 6s each: a slow inhale and an
// equally slow exhale, no holds (five breaths a minute). 12s per cycle; twelve
// cycles ≈ 2:24. Creation Prayer's synced schedule is derived from CYCLE_MS, so
// changing these re-times the global breath for everyone at once.
export const INHALE_MS = 6000;
// Inhale and exhale are equal — a symmetric 6s in / 6s out. The scale and ring
// fills derive from INHALE_MS/EXHALE_MS separately, so this stays correct.
export const EXHALE_MS = 6000;
export const CYCLE_MS = INHALE_MS + EXHALE_MS;

// Frosted-glass rings — back to the ORIGINAL warm-white tones. Two tones: the
// inhale fills with the light warm-white and HOLDS; the much-darker base sweeps
// over it on the exhale, settling the ring back to its dark resting tone (a
// strong contrast between the two rings).
export const RING_IN = "#EFECE4";   // original light warm-white — the inhale fill
export const RING_OUT = "#4A473F";  // a lot darker — the base / exhale sweep
// Soft glow used by every ring's drop-shadow.
export const RING_GLOW = "rgba(240,237,230,0.45)";
export const RING_R = 58;           // outer ring radius (viewBox 128)
export const RING_CIRC = 2 * Math.PI * RING_R;
export const RING_SW = 3.36;        // stroke width — 30% thinner; inner ring matches it (same thickness)
// Inner SESSION ring — ONE slow circle filling once across the whole set of
// breaths, in the SAME card-surface green glass as the breath fill.
export const SESSION_RING = "#EFECE4";
export const SESSION_R = RING_R / 1.618; // inner radius — the outer (RING_R) is 1.618× (golden ratio) bigger
export const SESSION_CIRC = 2 * Math.PI * SESSION_R;
/** The inner ring's faint track, so the two rings read as concentric even at rest. */
export const SESSION_TRACK = "rgba(215,212,205,0.34)";
/**
 * Frosts ONLY the two ring bands: a backdrop blur (the same 11.34px the cards
 * use) clipped by this radial mask to the breath ring (~90% radius) and the
 * session ring (~56%), so each ring reads like the app's frosted-glass card
 * surface instead of a flat stroke. The mask also trims the per-stroke glows.
 */
export const BREATH_RING_MASK =
  "radial-gradient(circle closest-side, transparent 0 50%, #000 51% 61%, transparent 62% 84%, #000 85% 96%, transparent 97%)";

// Per-breath haptic. The exhale ("out") is EXACTLY 1.618× as strong as the
// inhale ("in") — the golden ratio, felt. Uses the native Core-Haptics plugin
// (PhoebeAudio.smoothSwell, which takes a numeric peak intensity) so the ratio
// is precise; falls back to Capacitor's discrete impact (light vs medium) on
// web / older shells where only fixed styles exist. Shared with the launch
// intro (owner, 2026-09-16: "make sure there are haptics on the intro
// breathing"), so the two breaths feel alike as well as look alike.
const HAPTIC_IN = 0.44;                       // inhale intensity (0–1) — 20% softer
const HAPTIC_OUT = Math.min(1, HAPTIC_IN * 1.618); // exhale — 1.618× stronger (also 20% softer)
export function breathHaptic(out: boolean): void {
  const peak = out ? HAPTIC_OUT : HAPTIC_IN;
  try {
    const audio = (window as unknown as {
      Capacitor?: { Plugins?: { PhoebeAudio?: { smoothSwell?: (o: { durationMs: number; peak: number; sharpness: number }) => Promise<unknown> } } };
    }).Capacitor?.Plugins?.PhoebeAudio;
    if (audio?.smoothSwell) {
      const r = audio.smoothSwell({ durationMs: 150, peak, sharpness: 0.5 });
      if (r && typeof (r as Promise<unknown>).catch === "function") (r as Promise<unknown>).catch(() => {});
      return;
    }
  } catch { /* fall through to discrete impact */ }
  try { window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: out ? "medium" : "light" } })); } catch { /* web — silent */ }
}

/**
 * Globe box size in px. On MOBILE the page width is 2.61× the OUTER ring's
 * diameter — i.e. outer diameter = viewport width / 2.61. The outer ring is
 * 2·RING_R of the 128 viewBox, so the box (the full viewBox) = outer·128/116.
 * Desktop keeps the fixed 158 box.
 */
export function breathGlobeBoxPx(vw: number): number {
  if (vw > 0 && vw <= 600) {
    const outer = vw / 2.61;
    return Math.round(outer * (128 / (2 * RING_R)));
  }
  return 158;
}
