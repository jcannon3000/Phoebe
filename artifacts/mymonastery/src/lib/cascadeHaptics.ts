import { isNativeShell } from "./isNativeShell";

// Shared cascade-haptic driver — a tick under EACH home card as it rises in,
// continuing one ramp across sections (rhythm rows → prayer list → events).
// Every tick is the SAME intensity + length — matching the Daily Progress
// cascade haptics exactly (no escalation across cards). The timing tracks the
// visual stagger (START_DELAY + globalIndex * STEP). Native only; no-op on web.
const START_DELAY = 100; // ms — small hold so it doesn't fire before the first card
const STEP = 110;        // ms between cards (≈ the 0.1s visual stagger)
const PEAK = 0.42;       // every tick's strength (uniform — same as Daily Progress)
const DURATION_MS = 110; // every tick's length (uniform — same as Daily Progress)

/**
 * Schedule a tick haptic for `count` cards whose global cascade indices run
 * `from … from + count - 1`. Returns a cleanup that cancels any pending ticks.
 * Call from a splash-gated effect so every section fires from the same t0.
 */
export function scheduleCascadeHaptics(from: number, count: number): () => void {
  if (!isNativeShell() || count <= 0) return () => {};
  const timers: number[] = [];
  for (let j = 0; j < count; j++) {
    const i = from + j;
    timers.push(
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "tick", peak: PEAK, durationMs: DURATION_MS } }));
      }, START_DELAY + i * STEP),
    );
  }
  return () => timers.forEach((id) => window.clearTimeout(id));
}
