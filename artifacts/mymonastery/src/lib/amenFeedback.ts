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

    // Master gain with a very slight low-pass character by keeping partials
    // as sines — clean, not harsh. A tiny dry "click" at onset simulates
    // the clapper hitting metal.
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    // Clapper click — a very short filtered noise burst.
    const clickBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
    const cd = clickBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i++) {
      cd[i] = (Math.random() * 2 - 1) * (1 - i / cd.length);
    }
    const clickSrc = ctx.createBufferSource();
    clickSrc.buffer = clickBuf;
    const clickFilt = ctx.createBiquadFilter();
    clickFilt.type = "bandpass";
    clickFilt.frequency.value = 2400;
    clickFilt.Q.value = 1.2;
    const clickGain = ctx.createGain();
    clickGain.gain.value = 0.08;
    clickSrc.connect(clickFilt).connect(clickGain).connect(master);
    clickSrc.start(now);
    clickSrc.stop(now + 0.04);

    // Each partial as a sine with its own envelope.
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = STRIKE * p.ratio;

      const t0 = now + (p.attack ?? 0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(p.gain, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + p.decay);

      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + p.decay + 0.05);
    }

    // Second, softer strike ~1.1s later — a faint second toll, like the bell
    // still hanging in the stone of the chapel. Only the main partials.
    const t2 = now + 1.1;
    const reverbPartials = partials.slice(0, 5);
    for (const p of reverbPartials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = STRIKE * p.ratio;
      g.gain.setValueAtTime(0, t2);
      g.gain.linearRampToValueAtTime(p.gain * 0.35, t2 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t2 + p.decay * 0.7);
      osc.connect(g).connect(master);
      osc.start(t2);
      osc.stop(t2 + p.decay * 0.7 + 0.05);
    }
  } catch {
    // Audio blocked / unsupported — silent fallback.
  }
}

export function triggerAmenFeedback() {
  // More pronounced haptic: a "heavy" impact, then a short second tap
  // ~110ms later so the gesture feels like a bell being struck.
  try {
    window.dispatchEvent(
      new CustomEvent("phoebe:haptic", { detail: { style: "heavy" } }),
    );
    setTimeout(() => {
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:haptic", { detail: { style: "medium" } }),
        );
      } catch {
        /* non-fatal */
      }
    }, 110);
  } catch {
    /* non-fatal */
  }
  playChurchBell();
}
