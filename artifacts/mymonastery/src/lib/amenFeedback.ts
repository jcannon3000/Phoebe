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
let _stateChangeHookInstalled = false;
// Queue of audio attempts that fired before the AudioContext was
// allowed to leave its "suspended" state. Replayed verbatim once the
// first user gesture unlocks the context. Without this, the FIRST
// swell after a page reload (slideshow opens via useEffect, no gesture
// in scope) silently produces nothing — the resume() call is rejected
// by the browser audio policy and the oscillators we scheduled fall
// onto a deaf context. This is the bug users report as "swells don't
// go on web sometimes."
const _pendingAudio: Array<() => void> = [];

// Returns a live AudioContext. If the cached one is in the terminal
// "closed" state (iOS WKWebView occasionally closes contexts on
// aggressive memory pressure or audio-route changes), drop it and
// rebuild — otherwise every subsequent call would silently no-op
// onto a dead reference. This is one of the failure modes users
// see as "the swell doesn't always play."
function getOrCreateAudioCtx(): AudioContext | null {
  type WindowWithWebkitAudio = Window &
    typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const w = window as WindowWithWebkitAudio;
  const Ctx = w.AudioContext || w.webkitAudioContext;
  if (!Ctx) return null;
  if (_audioCtx && _audioCtx.state === "closed") {
    _audioCtx = null;
    _stateChangeHookInstalled = false;
  }
  if (!_audioCtx) _audioCtx = new Ctx();
  // Install a one-shot statechange listener so we drain pending audio
  // whenever the context becomes "running" — regardless of WHO woke it
  // up (a user-gesture unlock, a visibility resume, a programmatic
  // resume(), or even the OS deciding to wake a backgrounded audio
  // process on app foreground). The earlier code only drained on the
  // paths it controlled, which missed the (common on iOS) case where
  // the context wakes on its own after a focus event the JS layer
  // never sees.
  if (!_stateChangeHookInstalled && _audioCtx) {
    _stateChangeHookInstalled = true;
    _audioCtx.addEventListener?.("statechange", () => {
      if (_audioCtx && _audioCtx.state === "running") {
        drainPendingAudio();
      }
    });
  }
  return _audioCtx;
}

/**
 * Prime the audio subsystem during a real user gesture.
 *
 * Call this from a click/tap handler that LEADS INTO a screen which
 * will play sound from a useEffect (e.g. the prayer-list "Begin"
 * button before navigating to the slideshow). Without a prime, the
 * AudioContext is created fresh on first play, lands in "suspended"
 * state, and the unlock has to wait for the user's NEXT gesture —
 * which on the slideshow page is the first Amen tap, by which time
 * the opening swell has already silently failed.
 *
 * Idempotent and safe to call from anywhere; on web without
 * AudioContext support it's a no-op.
 */
export function primeAudio() {
  try {
    const ctx = getOrCreateAudioCtx();
    if (!ctx) return;
    ensureAudioUnlock();
    ensureVisibilityResume();
    ensureAppActiveResume();
    if (ctx.state === "suspended") {
      void ctx.resume().then(drainPendingAudio).catch(() => { /* next gesture retries */ });
    }
  } catch {
    /* non-fatal — audio is best-effort everywhere */
  }
}

// Replay every queued audio attempt. Called whenever the context leaves
// the "suspended" state — from the unlock gesture, a visibility resume,
// OR a successful resume() kicked off by a play attempt itself. That last
// path matters: a sound that queues while the context is suspended but
// the app is already foregrounded (so no visibility event is coming, and
// the one-shot unlock listeners have long since self-removed) would
// otherwise sit in the queue forever. Draining on resume-success means it
// fires as soon as the context wakes.
function drainPendingAudio() {
  // Splice rather than mutate in place so a callback that itself enqueues
  // something (rare) is handled on the next drain, not mid-iteration.
  const drained = _pendingAudio.splice(0, _pendingAudio.length);
  for (const fn of drained) {
    try { fn(); } catch { /* one callback failing shouldn't block the rest */ }
  }
}

// iOS WKWebView, Safari, and most browser audio policies only let an
// AudioContext leave the "suspended" state from inside a handler
// that's running because of a real user gesture. We install one-shot
// listeners for the next user interaction; in the unlock handler we
// resume the context AND drain any audio attempts that arrived before
// the unlock.
//
// Subtle: the listeners only self-remove AFTER we've successfully
// transitioned a context to "running". The earlier version self-removed
// on the first fire regardless — which meant a tap before any
// AudioContext had been built (e.g. the dashboard's Begin button)
// consumed the unlock event without anchoring it to a context, leaving
// the next page's freshly-built context permanently suspended. Now we
// keep the listeners armed until an actual unlock lands, so the
// gesture's audio-policy permission carries over to the first context
// that's actually constructed.
function ensureAudioUnlock() {
  if (_unlockHookInstalled || typeof window === "undefined") return;
  _unlockHookInstalled = true;
  const unlock = async () => {
    // If no context exists yet, build one inside the user-gesture
    // scope so we have something to resume. iOS treats the resulting
    // resume() as gesture-authorized.
    let ctx = _audioCtx;
    if (!ctx) {
      ctx = getOrCreateAudioCtx();
    }
    if (ctx) {
      try {
        if (ctx.state === "suspended") {
          await ctx.resume();
        }
      } catch { /* ignore */ }
    }
    drainPendingAudio();
    if (ctx && ctx.state === "running") {
      // Real unlock landed — listeners can retire.
      document.removeEventListener("touchend", unlock);
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
    }
    // Otherwise leave the listeners armed so the next gesture gets
    // another shot at unlocking. (Removing them after a failed unlock
    // was the old bug — first tap consumed the gesture without anchoring
    // to a context, every subsequent play silently failed.)
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
    _audioCtx.resume().then(drainPendingAudio).catch(() => { /* ignore — next user gesture will retry */ });
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tryResume();
  });
  window.addEventListener("focus", tryResume);
  window.addEventListener("pageshow", tryResume);
  // Capacitor fires this when the native shell resumes the WebView.
  document.addEventListener("resume", tryResume);
}

// Native-shell-specific resume signal. The DOM visibility/focus/pageshow
// events fire INCONSISTENTLY in WKWebView — some iOS versions deliver
// only one, some deliver none, and the order is unpredictable. The
// Capacitor shell dispatches `phoebe:appactive` from App.addListener
// "appStateChange" → isActive=true, which is the most reliable signal
// available that the app has come back to the foreground. Wiring it as
// an additional resume trigger covers the case where the user backgrounded
// during a sit/slideshow and none of the standard web events fired.
let _appActiveHookInstalled = false;
function ensureAppActiveResume() {
  if (_appActiveHookInstalled || typeof window === "undefined") return;
  _appActiveHookInstalled = true;
  window.addEventListener("phoebe:appactive", () => {
    if (!_audioCtx) return;
    if (_audioCtx.state === "closed") {
      // Closed context can't be resumed; drop it so the next play call
      // builds a fresh one via getOrCreateAudioCtx.
      _audioCtx = null;
      _stateChangeHookInstalled = false;
      return;
    }
    if (_audioCtx.state === "suspended") {
      _audioCtx.resume().then(drainPendingAudio).catch(() => { /* ignore */ });
    }
  });
}

function playChurchBell() {
  try {
    const ctx = getOrCreateAudioCtx();
    if (!ctx) return;
    ensureAudioUnlock();
    ensureVisibilityResume();
    ensureAppActiveResume();
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
 * Submit feedback — full chapel-exhale swell + smooth "medium" haptic.
 * Fires on successful submission of a prayer request, a comment, or a
 * word written for someone else's intercession. Per user direction
 * the envelope now matches the slideshow-opening / office-slide
 * chimes (~7s total) so a submit doesn't feel like a clipped chirp
 * compared to a slide turn — every Phoebe sound effect now breathes
 * the same way. Pitched an octave above the opening swell so it
 * still reads as a confirmation rather than a scene change.
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
    const ctx = getOrCreateAudioCtx();
    if (!ctx) return;
    ensureAudioUnlock();
    ensureVisibilityResume();
    ensureAppActiveResume();
    if (isAudioStillLocked()) {
      void ctx.resume().then(drainPendingAudio).catch(() => { /* ignore */ });
      _pendingAudio.push(() => triggerSubmitFeedback());
      return;
    }
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // Same envelope as playOpeningSwell — long crescendo, brief
    // hold, slow fade — so the submit chime overlaps with the user
    // reading whatever lands next instead of vanishing in a second.
    const SWELL_IN = 2.5;
    const HOLD     = 0.8;
    const FADE_OUT = 3.7;
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

    // Open fifth pitched an octave above the opening swell
    // (A3 / E4 / A4) — same sine + triangle voicing, same subtle
    // upward glide for "breath."
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
export function playBreathTone(octaveStep: number = 0) {
  try {
    // Build (or revive) the context up front so we can detect a locked
    // state even before any oscillators are scheduled. If we're locked,
    // defer the whole call until the unlock listener fires — at which
    // point we'll re-enter this function with the same args and the
    // AudioContext will be alive enough to actually make sound. The
    // getOrCreateAudioCtx helper also recovers from a "closed" context
    // — a state iOS WKWebView occasionally drops into on memory pressure
    // or audio-route changes, where every subsequent play call would
    // otherwise silently no-op.
    const ctx = getOrCreateAudioCtx();
    if (!ctx) return;
    ensureAudioUnlock();
    ensureVisibilityResume();
    ensureAppActiveResume();
    if (isAudioStillLocked()) {
      void ctx.resume().then(drainPendingAudio).catch(() => { /* ignore */ });
      _pendingAudio.push(() => playBreathTone(octaveStep));
      return;
    }
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // 7s total — full chapel exhale that overlaps slightly with the
    // user reading the next slide, so the room feels held by sound.
    const SWELL_IN = 2.5;
    const HOLD     = 0.8;
    const FADE_OUT = 3.7;
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

// Navigation swells + the office slide chime are removed per product direction
// (no sound on opening a prayer or advancing slides). Both stay exported as
// no-ops so their many call sites keep compiling; the chapel tone lives on as
// playBreathTone above, which the Cobreathe breath still uses.
export function playOpeningSwell(_octaveStep: number = 0) { /* no-op — navigation sound removed */ }

// NOTE: kept exported but no longer called — the office slide chime (a
// navigation sound) was removed per product direction by dropping its call
// sites in bcp-daily-office. Left here in case the chime is ever reinstated.
export function playOfficeChime(octaveStep: number = 0) {
  try {
    const ctx = getOrCreateAudioCtx();
    if (!ctx) return;
    ensureAudioUnlock();
    ensureVisibilityResume();
    ensureAppActiveResume();
    if (isAudioStillLocked()) {
      void ctx.resume().then(drainPendingAudio).catch(() => { /* ignore */ });
      _pendingAudio.push(() => playOfficeChime(octaveStep));
      return;
    }
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    // Same 7s chapel-exhale envelope as playOpeningSwell — a long
    // crescendo, brief hold, and slow fade so the chime overlaps
    // slightly with the reader's eyes settling on the next slide.
    const SWELL_IN = 2.5;
    const HOLD     = 0.8;
    const FADE_OUT = 3.7;
    const TOTAL    = SWELL_IN + HOLD + FADE_OUT;

    // Octave step bumps the whole chord up by powers of two; clamp
    // to [0, 4] so a pathological caller can't push the chord into
    // ultrasound where the lowpass swallows it.
    const safeStep = Math.max(0, Math.min(4, Math.floor(octaveStep) || 0));
    const octMult = Math.pow(2, safeStep);
    // Root D — D2 is 73.42 Hz, a perfect fourth above prayer-mode's
    // A2 (110 Hz). Same step ladder, different home note.
    const rootFreq = 73.42 * octMult;

    const masterPeak = safeStep >= 2 ? 0.18 : safeStep >= 1 ? 0.20 : 0.22;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(masterPeak, now + SWELL_IN);
    master.gain.setValueAtTime(masterPeak, now + SWELL_IN + HOLD);
    master.gain.exponentialRampToValueAtTime(0.0001, now + TOTAL);

    // Slow-opening lowpass that tracks the chord's octave so the
    // upper voices breathe through at higher steps without the
    // brightness fatiguing across a long office reading.
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 0.6;
    const lpStart = 380 * octMult;
    const lpPeak  = 1800 * octMult;
    lp.frequency.setValueAtTime(lpStart, now);
    lp.frequency.linearRampToValueAtTime(lpPeak, now + SWELL_IN);
    lp.frequency.linearRampToValueAtTime(lpStart * 2, now + TOTAL);
    lp.connect(master).connect(ctx.destination);

    // Open fifth — root, fifth, octave-up — same voicing as the
    // slideshow swell so the timbre matches; only the fundamental
    // pitch differs.
    const voices: Array<{ freq: number; type: OscillatorType; gain: number }> = [
      { freq: rootFreq,         type: "sine",     gain: 0.55 },
      { freq: rootFreq * 1.5,   type: "triangle", gain: 0.28 },
      { freq: rootFreq * 2,     type: "sine",     gain: 0.22 },
    ];

    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.frequency.setValueAtTime(v.freq, now);
      // Subtle 0.3% upward drift — same "breath" as the slideshow.
      osc.frequency.linearRampToValueAtTime(v.freq * 1.003, now + SWELL_IN);
      osc.frequency.linearRampToValueAtTime(v.freq, now + TOTAL);

      const vg = ctx.createGain();
      vg.gain.value = v.gain;

      osc.connect(vg).connect(lp);
      osc.start(now);
      osc.stop(now + TOTAL + 0.1);
    }
  } catch {
    /* silent fallback */
  }
}
