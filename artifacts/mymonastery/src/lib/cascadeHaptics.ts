import { isNativeShell } from "./isNativeShell";

// Shared cascade-haptic driver — a tick under EACH home card as it rises in,
// continuing one ramp across sections (rhythm rows → prayer list → events).
// Each card's tick is keyed to its GLOBAL index so the intensity keeps climbing
// across the whole home, and the timing matches the visual stagger in
// DailyProgressBody (START_DELAY + index * STEP). Native only; no-op on web.
const START_DELAY = 100; // ms — small hold so it doesn't fire before the first card (0.1s earlier than before)
const STEP = 110;        // ms between cards (≈ the 0.1s visual stagger)
const BASE_PEAK = 0.42;  // first card's strength
const BASE_MS = 77;      // each tick's length — 30% shorter than the prior 110ms

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
    const peak = Math.min(1, BASE_PEAK * Math.pow(1.1, i)); // +10% per card, across sections
    const durationMs = Math.round(BASE_MS);
    timers.push(
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style: "tick", peak, durationMs } }));
      }, START_DELAY + i * STEP),
    );
  }
  return () => timers.forEach((id) => window.clearTimeout(id));
}
