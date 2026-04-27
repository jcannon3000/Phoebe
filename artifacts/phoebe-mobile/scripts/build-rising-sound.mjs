#!/usr/bin/env node
/**
 * Synthesize the "rising swell" notification sound — the same chord
 * the slideshow opens with (open fifth on A2/E3/A3, sine + triangle,
 * gentle crescendo + fade) but compressed to ~2.4s for use as a push
 * notification. iOS push sounds must be ≤ 30s and live at the root
 * of the app bundle.
 *
 * Output: 16-bit signed PCM WAV, mono, 22.05 kHz. iOS reads WAV-PCM
 * directly when the file extension is `.caf` or `.wav`. We use `.caf`
 * here because it's the convention iOS expects in
 * UNNotificationSound(named:).
 *
 * No deps — raw sample synthesis + WAV header. Run from the
 * phoebe-mobile/ directory:
 *
 *   node scripts/build-rising-sound.mjs
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SAMPLE_RATE = 22050;          // notification-quality, half size of CD
const BITS = 16;
const CHANNELS = 1;

// Envelope shape — quick rise into a brief held peak, then a softer
// fade. The slideshow swell uses 2.8s + 0.9s + 2.2s; we collapse to
// 1.2s + 0.4s + 0.8s so the whole thing sits comfortably inside the
// ~2-second window most users perceive a notification within.
const SWELL_IN  = 1.2;
const HOLD      = 0.4;
const FADE_OUT  = 0.8;
const TOTAL     = SWELL_IN + HOLD + FADE_OUT;
const TOTAL_SAMPLES = Math.floor(TOTAL * SAMPLE_RATE);

// Open fifth: A2 + E3 + A3 at the MID octave. Each voice gets a
// relative gain matching the in-app version so the chord balance reads
// the same. We synthesize three octave variants so different push
// categories feel distinct on the lock screen even when stacked:
//   • LOW  — daily-rhythm pulses (bell, evening nudge): warmer, an
//            octave below the slideshow swell.
//   • MID  — group / community / letter pulses: the original swell.
//   • HIGH — direct-to-you pulses (someone prayed for you, amen): an
//            octave above so the "this is for me" pings stand out.
const VOICES_MID = [
  { freq: 110, type: "sine",     gain: 0.55 },
  { freq: 165, type: "triangle", gain: 0.28 },
  { freq: 220, type: "sine",     gain: 0.22 },
];
const VOICES_LOW = VOICES_MID.map(v => ({ ...v, freq: v.freq / 2 }));
const VOICES_HIGH = VOICES_MID.map(v => ({ ...v, freq: v.freq * 2 }));

// Headroom — the sum of voice gains is 1.05 so we trim master a touch
// to keep peaks under full scale before clipping.
const MASTER_PEAK = 0.78;

function envelope(t) {
  // 0 → 1 over SWELL_IN, hold, then exponential decay to 0 over FADE_OUT.
  if (t <= SWELL_IN) return t / SWELL_IN;
  if (t <= SWELL_IN + HOLD) return 1;
  const fadeT = (t - SWELL_IN - HOLD) / FADE_OUT;
  // exp decay so the tail sits gracefully against silence
  return Math.pow(1 - fadeT, 2);
}

function triangle(phase) {
  // phase in [0, 1)
  const p = phase - Math.floor(phase);
  return 2 * Math.abs(2 * (p - 0.5)) - 1;
}

function renderToBuffer(voices) {
  const samples = new Int16Array(TOTAL_SAMPLES);
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const voice of voices) {
      const phase = voice.freq * t;
      const wave = voice.type === "sine"
        ? Math.sin(2 * Math.PI * phase)
        : triangle(phase);
      v += wave * voice.gain;
    }
    v *= envelope(t) * MASTER_PEAK;
    const clamped = Math.max(-1, Math.min(1, v));
    samples[i] = Math.round(clamped * 32767);
  }

  // ── WAV header ──────────────────────────────────────────────────────────
  // 44-byte RIFF/WAVE header for 16-bit signed PCM mono.
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  let o = 0;
  buf.write("RIFF", o); o += 4;
  buf.writeUInt32LE(36 + dataBytes, o); o += 4;     // chunk size
  buf.write("WAVE", o); o += 4;
  buf.write("fmt ", o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;                 // fmt chunk size (PCM)
  buf.writeUInt16LE(1, o); o += 2;                  // format = PCM
  buf.writeUInt16LE(CHANNELS, o); o += 2;
  buf.writeUInt32LE(SAMPLE_RATE, o); o += 4;
  buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), o); o += 4; // byte rate
  buf.writeUInt16LE(CHANNELS * (BITS / 8), o); o += 2;               // block align
  buf.writeUInt16LE(BITS, o); o += 2;
  buf.write("data", o); o += 4;
  buf.writeUInt32LE(dataBytes, o); o += 4;
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2);
  }
  return buf;
}

const variants = [
  { name: "PhoebeRising-low.caf", voices: VOICES_LOW },
  { name: "PhoebeRising.caf",     voices: VOICES_MID },
  { name: "PhoebeRising-high.caf", voices: VOICES_HIGH },
];
for (const v of variants) {
  const buf = renderToBuffer(v.voices);
  const dest = resolve(process.cwd(), `ios/App/App/${v.name}`);
  writeFileSync(dest, buf);
  console.log(
    `Wrote ${dest} — ${TOTAL.toFixed(2)}s @ ${SAMPLE_RATE}Hz mono 16-bit, ` +
    `${(buf.length / 1024).toFixed(1)} KB`,
  );
}
