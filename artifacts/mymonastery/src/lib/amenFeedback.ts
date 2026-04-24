/**
 * Amen feedback — haptic + a soft synthesized chime fired when the user
 * taps "Amen" to advance a prayer slide.
 *
 * - Haptic: dispatches the `phoebe:haptic` custom event; the native shell
 *   (phoebe-mobile) listens for it and routes to Capacitor Haptics on iOS.
 *   On the plain web build, nothing listens — silent no-op.
 * - Sound: a gentle two-note bell synthesized with the Web Audio API. No
 *   asset shipped; the AudioContext resolves on the first user gesture
 *   (the button tap itself), so iOS autoplay policy is satisfied.
 */

let _audioCtx: AudioContext | null = null;

function playChurchBell() {
  try {
    type WindowWithWebkitAudio = Window &
      typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const w = window as WindowWithWebkitAudio;
    const Ctx = w.AudioContext || w.webkitAudioContext;
    if (!Ctx) return;
    if (!_audioCtx) _audioCtx = new Ctx();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;

    // Church-bell partial structure. A real bell has (roughly):
    //   hum  = 0.5 × strike (sub-octave)
    //   prime/strike = 1.0
    //   tierce (minor third) = 1.2
    //   quint  = 1.5
    //   nominal = 2.0
    //   upper harmonics = 2.5, 3.0, 4.2
    // Strike fundamental tuned to A3 (220 Hz) for a deep monastery-bell feel.
    const STRIKE = 220;
    const partials: Array<{
      ratio: number;
      gain: number;
      decay: number;   // seconds to near-silence
      attack?: number; // optional attack delay
    }> = [
      { ratio: 0.5,  gain: 0.22, decay: 5.5 }, // hum tone — carries the weight
      { ratio: 1.0,  gain: 0.30, decay: 3.5 }, // strike — the immediate impact
      { ratio: 1.2,  gain: 0.16, decay: 3.0 }, // tierce — the "minor" bell color
      { ratio: 1.5,  gain: 0.12, decay: 2.6 }, // quint
      { ratio: 2.0,  gain: 0.10, decay: 2.0 }, // nominal
      { ratio: 2.51, gain: 0.05, decay: 1.2 }, // upper — inharmonic shimmer
      { ratio: 3.02, gain: 0.04, decay: 0.9 },
      { ratio: 4.18, gain: 0.03, decay: 0.6 },
    ];

    // Master bus — a gentle low-pass shapes the tone into something
    // softer and more pad-like, so the bell "glows" rather than rings.
    const master = ctx.createGain();
    master.gain.value = 0.45;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2200;
    tone.Q.value = 0.4;
    tone.connect(master).connect(ctx.destination);

    // Each partial as a sine with a slow swell and long decay — no clapper
    // click, no second toll. One ambient bell that fades into silence.
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = STRIKE * p.ratio;

      const t0 = now + (p.attack ?? 0);
      g.gain.setValueAtTime(0, t0);
      // Slow 80ms attack — removes the percussive edge.
      g.gain.linearRampToValueAtTime(p.gain, t0 + 0.08);
      // Extra-long decay for an ambient tail.
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay * 1.4);

      osc.connect(g).connect(tone);
      osc.start(t0);
      osc.stop(t0 + p.decay * 1.4 + 0.05);
    }
  } catch {
    // Audio blocked / unsupported — silent fallback.
  }
}

export function triggerAmenFeedback() {
  // Single soft haptic — a "medium" impact reads as smooth and present
  // without the double-tap feeling percussive.
  try {
    window.dispatchEvent(
      new CustomEvent("phoebe:haptic", { detail: { style: "medium" } }),
    );
  } catch {
    /* non-fatal */
  }
  playChurchBell();
}
