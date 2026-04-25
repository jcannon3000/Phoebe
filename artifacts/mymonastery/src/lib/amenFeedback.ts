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
let _unlockHookInstalled = false;
let _visibilityHookInstalled = false;
// Queue of audio attempts that fired before the AudioContext was
// allowed to leave its "suspended" state. Replayed verbatim once the
// first user gesture unlocks the context. Without this, the FIRST
// swell after a page reload (slideshow opens via useEffect, no gesture
// in scope) silently produces nothing — the resume() call is rejected
// by the browser audio policy and the oscillators we scheduled fall
// onto a deaf context. This is the bug users report as "swells don't
// go on web sometimes."
const _pendingAudio: Array<() => void> = [];

// iOS WKWebView, Safari, and most browser audio policies only let an
// AudioContext leave the "suspended" state from inside a handler
// that's running because of a real user gesture. We install one-shot
// listeners for the next user interaction; in the unlock handler we
// resume the context AND drain any audio attempts that arrived before
// the unlock. Once unlocked the context stays unlocked for the page's
// lifetime so the listeners self-remove on first fire.
function ensureAudioUnlock() {
  if (_unlockHookInstalled || typeof window === "undefined") return;
  _unlockHookInstalled = true;
  const unlock = async () => {
    try {
      if (_audioCtx && _audioCtx.state === "suspended") {
        await _audioCtx.resume();
      }
    } catch { /* ignore */ }
    // Drain any swells that tried to fire while we were locked. We
    // pop and call rather than splicing the array in place so a
    // pending callback that itself enqueues something else (rare) is
    // handled in the next pass instead of mutating mid-iteration.
    const drained = _pendingAudio.splice(0, _pendingAudio.length);
    for (const fn of drained) {
      try { fn(); } catch { /* per-callback failure shouldn't block the rest */ }
    }
    document.removeEventListener("touchend", unlock);
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("click", unlock);
    document.removeEventListener("keydown", unlock);
  };
  document.addEventListener("touchend", unlock, { passive: true });
  document.addEventListener("pointerdown", unlock, { passive: true });
  document.addEventListener("click", unlock);
  document.addEventListener("keydown", unlock);
}

// True if a play attempt right now would land on a deaf
// (still-suspended) AudioContext. Caller should queue instead.
function isAudioStillLocked(): boolean {
  return !!_audioCtx && _audioCtx.state === "suspended";
}

// Once an AudioContext has been unlocked by a user gesture, iOS/WKWebView
// will let resume() succeed programmatically — but the context still gets
// suspended whenever the app backgrounds (Home button, app switcher,
// long idle on locked screen). Without this, the user comes back to
// Phoebe and taps Amen but the bell falls onto a suspended context and
// nothing plays. We listen for the app/page becoming visible again and
// kick off resume() so the context is awake by the time the next sound
// fires. Also drains any swells that queued up while suspended.
function ensureVisibilityResume() {
  if (_visibilityHookInstalled || typeof window === "undefined") return;
  _visibilityHookInstalled = true;
  const tryResume = () => {
    if (!_audioCtx || _audioCtx.state !== "suspended") return;
    _audioCtx.resume().then(() => {
      const drained = _pendingAudio.splice(0, _pendingAudio.length);
      for (const fn of drained) {
        try { fn(); } catch { /* per-callback failure shouldn't block */ }
      }
    }).catch(() => { /* ignore — next user gesture will retry */ });
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryResume();
  });
  window.addEventListener("focus", tryResume);
  window.addEventListener("pageshow", tryResume);
  // Capacitor fires this when the native shell resumes the WebView.
  document.addEventListener("resume", tryResume);
}

function playChurchBell() {
  try {
    type WindowWithWebkitAudio = Window &
      typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const w = window as WindowWithWebkitAudio;
    const Ctx = w.AudioContext || w.webkitAudioContext;
    if (!Ctx) return;
    if (!_audioCtx) _audioCtx = new Ctx();
    const ctx = _audioCtx;
    ensureAudioUnlock();
    ensureVisibilityResume();
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
  // Single soft haptic — a "medium" impact reads as smooth and present.
  // The bell chime is disabled for now; we keep the haptic so the Amen
  // tap still has tactile confirmation.
  try {
    window.dispatchEvent(
      new CustomEvent("phoebe:haptic", { detail: { style: "medium" } }),
    );
  } catch {
    /* non-fatal */
  }
  // playChurchBell(); // disabled — sound effect removed per request
}

/**
 * Submit feedback — a brief organ-pad swell + smooth "medium" haptic.
 * Fires on successful submission of a prayer request, a comment, or a
 * word written for someone else's intercession. Same shape as the
 * slideshow-opening swell (open-fifth pad on sine + triangle with a
 * low-pass that opens as it rises), but shorter (~1.5s total) and
 * pitched an octave higher so it reads as a confirmation rather than
 * a scene change.
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
    ensureAudioUnlock();
    ensureVisibilityResume();
    // If the context hasn't been unlocked by a user gesture yet, defer
    // the entire call rather than scheduling oscillators on a deaf
    // context — same fix as playOpeningSwell. Browser audio policy
    // applies on web too, not just iOS.
    if (isAudioStillLocked()) {
      void ctx.resume().catch(() => { /* ignore */ });
      _pendingAudio.push(() => triggerSubmitFeedback());
      return;
    }
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // Compressed version of the opening-swell envelope — same crescendo
    // → hold → fade shape, but under two seconds so it feels like an
    // affirmation, not a preamble.
    const SWELL_IN = 0.7;
    const HOLD     = 0.25;
    const FADE_OUT = 0.6;
    const TOTAL    = SWELL_IN + HOLD + FADE_OUT;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.2, now + SWELL_IN);
    master.gain.setValueAtTime(0.2, now + SWELL_IN + HOLD);
    master.gain.exponentialRampToValueAtTime(0.0001, now + TOTAL);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(600, now);
    lp.frequency.linearRampToValueAtTime(2600, now + SWELL_IN);
    lp.frequency.linearRampToValueAtTime(1500, now + TOTAL);
    lp.connect(master).connect(ctx.destination);

    // Open fifth, pitched an octave above the opening swell (was
    // A2/E3/A3 → now A3/E4/A4). Same sine + triangle voicing, same
    // tiny upward glide for "breath."
    const voices: Array<{ freq: number; type: OscillatorType; gain: number }> = [
      { freq: 220, type: "sine",     gain: 0.55 },
      { freq: 330, type: "triangle", gain: 0.28 },
      { freq: 440, type: "sine",     gain: 0.22 },
    ];

    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, now);
      osc.frequency.linearRampToValueAtTime(v.freq * 1.003, now + SWELL_IN);
      osc.frequency.linearRampToValueAtTime(v.freq, now + TOTAL);

      const vg = ctx.createGain();
      vg.gain.value = v.gain;

      osc.connect(vg).connect(lp);
      osc.start(now);
      osc.stop(now + TOTAL + 0.1);
    }
  } catch {
    /* non-fatal */
  }
}

/**
 * Rising ambient swell — a single open-fifth pad (root, fifth, octave)
 * with a gentle crescendo and fade. Total runtime ≈ 2.4s.
 *
 * Pass `octaveStep` to shift the chord up a power of two:
 *   0 → A2 / 110 Hz root  (base; what the slideshow opens with)
 *   1 → A3 / 220 Hz root  (one octave up)
 *   2 → A4 / 440 Hz root  (two octaves up)
 *
 * The prayer slideshow calls this on every slide entry, with octaveStep
 * cycling 0 → 1 → 2 → 0 → 1 → 2 → … via `slideIndex % 3`. The first
 * slide stays the same, the next two climb, and the fourth resolves
 * back to the original — a chord progression that climbs and resets
 * across the whole list.
 *
 * The low-pass cutoff scales with the octave so the +2 step doesn't
 * lose its high voices to the filter. Master gain tapers slightly at
 * higher octaves so the bright pads don't shriek on a phone speaker.
 *
 * Call fire-and-forget. Safe on web (plays) and iOS (plays once the
 * AudioContext resumes on the user gesture that triggered it).
 */
export function playOpeningSwell(octaveStep: number = 0) {
  try {
    type WindowWithWebkitAudio = Window &
      typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const w = window as WindowWithWebkitAudio;
    const Ctx = w.AudioContext || w.webkitAudioContext;
    if (!Ctx) return;
    // Build the context up front so we can detect a locked state even
    // before any oscillators are scheduled. If we're locked, defer the
    // whole call until the unlock listener fires — at which point we'll
    // re-enter this function with the same args and the AudioContext
    // will be alive enough to actually make sound.
    if (!_audioCtx) _audioCtx = new Ctx();
    ensureAudioUnlock();
    ensureVisibilityResume();
    if (isAudioStillLocked()) {
      void _audioCtx.resume().catch(() => { /* ignore */ });
      _pendingAudio.push(() => playOpeningSwell(octaveStep));
      return;
    }
    if (!_audioCtx) _audioCtx = new Ctx();
    const ctx = _audioCtx;
    ensureAudioUnlock();
    ensureVisibilityResume();
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // ~6.4s total — matches the perceived length of the old four-pad
    // opener (which was ~7s of evolving sound across overlapping pads)
    // so each per-slide swell still feels like a full chapel exhale,
    // not a brief chime.
    const SWELL_IN = 2.5;
    const HOLD     = 0.8;
    const FADE_OUT = 3.1;
    const TOTAL    = SWELL_IN + HOLD + FADE_OUT;

    // Clamp the step to [0, 4] so a pathological caller can't set the
    // chord into ultrasound and lose the entire sound to the lowpass.
    const safeStep = Math.max(0, Math.min(4, Math.floor(octaveStep) || 0));
    const octMult = Math.pow(2, safeStep);
    const rootFreq = 110 * octMult;

    // Master volume taper — pull higher steps back a touch so the +2
    // step doesn't read as much louder than the base, and so the
    // brightness doesn't fatigue across a long slideshow.
    const masterPeak = safeStep >= 2 ? 0.18 : safeStep >= 1 ? 0.20 : 0.22;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(masterPeak, now + SWELL_IN);
    master.gain.setValueAtTime(masterPeak, now + SWELL_IN + HOLD);
    master.gain.exponentialRampToValueAtTime(0.0001, now + TOTAL);

    // Slow-opening low-pass that scales with octave — at higher steps
    // we open the cutoff wider so the upper voices aren't muffled.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.6;
    const lpStart = 380 * octMult;
    const lpPeak  = 1800 * octMult;
    lp.frequency.setValueAtTime(lpStart, now);
    lp.frequency.linearRampToValueAtTime(lpPeak, now + SWELL_IN);
    lp.frequency.linearRampToValueAtTime(lpStart * 2, now + TOTAL);
    lp.connect(master).connect(ctx.destination);

    // Open fifth at the chosen octave — root, fifth, octave-up.
    const voices: Array<{ freq: number; type: OscillatorType; gain: number }> = [
      { freq: rootFreq,         type: "sine",     gain: 0.55 },
      { freq: rootFreq * 1.5,   type: "triangle", gain: 0.28 },
      { freq: rootFreq * 2,     type: "sine",     gain: 0.22 },
    ];

    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, now);
      // Subtle ~0.3% upward drift — gives the pad a breath rather than
      // a static drone.
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
