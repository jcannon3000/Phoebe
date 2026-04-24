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

function playAmenChime() {
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
    // Two stacked sines — a small, warm bell (G5 + D6), short decay.
    const notes: Array<{ freq: number; at: number; gain: number }> = [
      { freq: 784, at: 0, gain: 0.18 },
      { freq: 1175, at: 0.02, gain: 0.12 },
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0, now + n.at);
      gain.gain.linearRampToValueAtTime(n.gain, now + n.at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.at + 1.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.at);
      osc.stop(now + n.at + 1.7);
    }
  } catch {
    // Audio blocked / unsupported — silent fallback.
  }
}

export function triggerAmenFeedback() {
  try {
    window.dispatchEvent(
      new CustomEvent("phoebe:haptic", { detail: { style: "light" } }),
    );
  } catch {
    /* non-fatal */
  }
  playAmenChime();
}
