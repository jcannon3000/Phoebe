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

    // Angelic major-triad bell — a true major chord (root + major third
    // + fifth) in just intonation, with octave doublings for shimmer. The
    // earlier stack was root + fifth + octaves only, which reads as
    // "hollow" or organum-like (medieval open fifth). Adding the
    // just-intonation major third (5:4 = 1.25) warms the tone into
    // something that sounds like a choir sustaining a chord — a vespers
    // bell the way a Renaissance painter would draw one. Sub-octave
    // removed because it growled against the third.
    const STRIKE = 523.25; // C5
    const partials: Array<{
      ratio: number;
      gain: number;
      decay: number;   // seconds to near-silence
      attack?: number; // optional attack delay
    }> = [
      { ratio: 1.0,  gain: 0.34, decay: 3.8 }, // root — C5
      { ratio: 1.25, gain: 0.22, decay: 3.5 }, // major third (5:4) — E5 (just)
      { ratio: 1.5,  gain: 0.18, decay: 3.2 }, // perfect fifth (3:2) — G5
      { ratio: 2.0,  gain: 0.14, decay: 2.8 }, // octave — C6
      { ratio: 2.5,  gain: 0.08, decay: 2.2 }, // octave + major third — E6
      { ratio: 3.0,  gain: 0.06, decay: 1.8 }, // octave + fifth — G6
      { ratio: 4.0,  gain: 0.04, decay: 1.3 }, // double octave — C7 (airy shimmer)
    ];

    // Master bus — a gentle low-pass shapes the tone into something
    // softer and more pad-like, so the bell "glows" rather than rings.
    const master = ctx.createGain();
    master.gain.value = 0.45;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3600;
    tone.Q.value = 0.3;
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

/**
 * Submit feedback — a brief rising swell (~1.1s) + smooth "medium"
 * haptic. Fires on successful submission of a prayer request, a comment,
 * or a word written for someone else's intercession. Shorter and softer
 * than the slideshow-opening swell so it doesn't overstay its welcome.
 */
export function triggerSubmitFeedback() {
  try {
    window.dispatchEvent(
      new CustomEvent("phoebe:haptic", { detail: { style: "medium" } }),
    );
  } catch {
    /* non-fatal */
  }
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
    const IN = 0.55;
    const HOLD = 0.25;
    const OUT = 0.9;
    const TOTAL = IN + HOLD + OUT;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.18, now + IN);
    master.gain.setValueAtTime(0.18, now + IN + HOLD);
    master.gain.exponentialRampToValueAtTime(0.0001, now + TOTAL);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(500, now);
    lp.frequency.linearRampToValueAtTime(1800, now + IN);
    lp.frequency.linearRampToValueAtTime(1100, now + TOTAL);
    lp.connect(master).connect(ctx.destination);

    // Soft triad rising a perfect fifth: D4 → A4, with E4 filling in.
    const notes: Array<{ freq: number; to: number; gain: number; type: OscillatorType }> = [
      { freq: 293.66, to: 440.00, gain: 0.45, type: "sine" },     // D4 → A4
      { freq: 369.99, to: 523.25, gain: 0.25, type: "triangle" }, // F#4 → C5 (gentle upper)
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      osc.type = n.type;
      osc.frequency.setValueAtTime(n.freq, now);
      osc.frequency.linearRampToValueAtTime(n.to, now + IN + HOLD);
      const vg = ctx.createGain();
      vg.gain.value = n.gain;
      osc.connect(vg).connect(lp);
      osc.start(now);
      osc.stop(now + TOTAL + 0.1);
    }
  } catch {
    /* non-fatal */
  }
}

/**
 * Rising ambient swell — a low organ-like pad that crescendos over ~3s,
 * opening the prayer-list slideshow like a chapel exhaling. An open fifth
 * (A2 + E3 + A3) on sine + triangle waves, sent through a slowly
 * opening low-pass filter so the tone brightens as it rises.
 *
 * Call on slideshow mount; fire-and-forget. Safe on web (plays) and
 * iOS (plays once the AudioContext resumes on the user gesture that
 * navigated into the slideshow).
 */
export function playOpeningSwell() {
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
    const SWELL_IN = 2.8;    // crescendo duration
    const HOLD     = 0.9;    // held at full volume
    const FADE_OUT = 2.2;    // then fade to silence
    const TOTAL    = SWELL_IN + HOLD + FADE_OUT;

    // Master gain — shapes the overall envelope.
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.22, now + SWELL_IN);
    master.gain.setValueAtTime(0.22, now + SWELL_IN + HOLD);
    master.gain.exponentialRampToValueAtTime(0.0001, now + TOTAL);

    // Slowly opening low-pass — the pad brightens as it rises.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(380, now);
    lp.frequency.linearRampToValueAtTime(1600, now + SWELL_IN);
    lp.frequency.linearRampToValueAtTime(900, now + TOTAL);
    lp.connect(master).connect(ctx.destination);

    // Open fifth — A2 (root), E3 (fifth), A3 (octave). The small upward
    // pitch drift (+3 cents over the swell) gives a "breath" of lift.
    const voices: Array<{ freq: number; type: OscillatorType; gain: number }> = [
      { freq: 110, type: "sine",     gain: 0.55 },
      { freq: 165, type: "triangle", gain: 0.28 },
      { freq: 220, type: "sine",     gain: 0.22 },
    ];

    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, now);
      // Tiny upward glide — pitch rises ~0.3% during the swell, then
      // settles. Organic, not obvious.
      osc.frequency.linearRampToValueAtTime(v.freq * 1.003, now + SWELL_IN);
      osc.frequency.linearRampToValueAtTime(v.freq, now + TOTAL);

      const vg = ctx.createGain();
      vg.gain.value = v.gain;

      osc.connect(vg).connect(lp);
      osc.start(now);
      osc.stop(now + TOTAL + 0.1);
    }
  } catch {
    // Audio blocked / unsupported — silent fallback.
  }
}
