// Transition cue between readings in the Listen-to-Scripture play-through.
//
// On device this plays the SAME swell tone Co-Breathe uses (the native
// PhoebeAudio.smoothSwell), so the chime matches the rest of the app. On the web
// (no native plugin) it falls back to a soft two-note bell synthesised with
// WebAudio. Safe to call repeatedly; no-ops if neither is available.

type SmoothSwell = (o: { durationMs: number; peak: number; sharpness: number }) => Promise<unknown>;

function nativeSwell(): SmoothSwell | null {
  try {
    return (window as unknown as {
      Capacitor?: { Plugins?: { PhoebeAudio?: { smoothSwell?: SmoothSwell } } };
    }).Capacitor?.Plugins?.PhoebeAudio?.smoothSwell ?? null;
  } catch {
    return null;
  }
}

let ctx: AudioContext | null = null;
function audioCtx(): AudioContext | null {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = ctx ?? new Ctor();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Soft two-note bell (web fallback only).
function webBell(): void {
  const ac = audioCtx();
  if (!ac) return;
  const now = ac.currentTime;
  for (const p of [{ freq: 528, delay: 0, gain: 0.16 }, { freq: 792, delay: 0.1, gain: 0.11 }]) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = p.freq;
    const t0 = now + p.delay;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(p.gain, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 1.7);
  }
}

export function playChime(): void {
  const swell = nativeSwell();
  if (swell) {
    // A fuller, slower swell than Co-Breathe's per-breath tap — a clear, calm
    // transition rather than a buzz.
    void swell({ durationMs: 520, peak: 1, sharpness: 0.45 }).catch(() => {});
    return;
  }
  webBell();
}

// Roughly how long the cue rings — callers wait this long before starting the
// next passage so it isn't stepped on.
export const CHIME_MS = 1500;
