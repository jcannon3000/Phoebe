// A gentle two-note bell, synthesised with WebAudio so there's no audio asset to
// ship or decode. Used as the transition cue between readings in the
// Listen-to-Scripture play-through. Safe to call repeatedly; no-ops if WebAudio
// is unavailable or the gesture hasn't unlocked the context yet.

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

// Play a soft chime. Two sine partials (a fifth apart), each with a quick attack
// and a long exponential decay — a calm bell, not a notification ping.
export function playChime(): void {
  const ac = audioCtx();
  if (!ac) return;
  const now = ac.currentTime;
  const partials: Array<{ freq: number; delay: number; gain: number }> = [
    { freq: 528, delay: 0, gain: 0.16 },
    { freq: 792, delay: 0.1, gain: 0.11 },
  ];
  for (const p of partials) {
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

// Roughly how long the chime rings — callers wait this long before starting the
// next passage so the cue isn't stepped on.
export const CHIME_MS = 1500;
