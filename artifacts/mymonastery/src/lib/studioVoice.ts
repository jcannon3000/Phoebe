/**
 * Phoebe Studio — on-device voice enhancement.
 *
 * Turns a phone recording into something that sounds like it was spoken into a
 * podcast mic: clean, warm, close, evenly levelled. Because voice memos are
 * end-to-end encrypted (see voiceCrypto.ts), ALL of this runs on the sender's
 * device, BEFORE encryption — the server never sees raw or enhanced audio.
 *
 * The chain, in order (the order is what makes it sound produced, not just
 * "louder"):
 *   1. Decode the recording to PCM and render the tone/dynamics chain offline
 *      at 48 kHz (OfflineAudioContext — non-realtime, so it can't record
 *      silence the way a live graph can):
 *        · high-pass 80 Hz            — shed rumble / handling / plosive thump
 *        · low-shelf  +warmth @200 Hz — the chest/closeness of a near mic
 *        · cut 300 Hz / 500 Hz        — remove "mud" and "boxiness"
 *        · presence peak @3.2 kHz     — intelligibility, the voice steps forward
 *        · air high-shelf @9 kHz      — breath and sparkle
 *        · compressor                 — even out the dynamics, hold the level
 *        · soft saturation            — gentle harmonics = perceived warmth/body
 *   2. A downward expander on the PCM — pushes the room tone DOWN between words
 *      so the silences are silent (the single biggest "studio vs phone" tell).
 *   3. Loudness: measure integrated loudness (ITU-R BS.1770 / EBU R128,
 *      K-weighted + gated) and normalize to a broadcast target, then a
 *      true-peak-safe soft limiter so it never clips.
 *   4. Resample to 24 kHz mono and encode 16-bit WAV (no codec dependency,
 *      ~480 KB for 10 s — fits under the encrypted-payload cap).
 *
 * Everything is wrapped so any failure (an old WebAudio impl, a decode error)
 * degrades gracefully: enhanceVoice rejects and the caller sends the original.
 */

export type StudioPreset = "studio" | "warm" | "radio" | "intimate" | "off";

export interface EnhanceResult {
  blob: Blob;
  mimeType: "audio/wav";
  preset: StudioPreset;
  lufsBefore: number;
  lufsAfter: number;
  durationMs: number;
}

const PROC_RATE = 48_000; // process + measure at 48 kHz (BS.1770 coeffs are 48 k)
const OUT_RATE = 24_000; // output: voice is full + warm here, and it keeps size small
const TRUE_PEAK_CEIL = 0.794; // ≈ −2 dBTP — extra margin against inter-sample peaks the sample-peak fold can miss

// ── Per-preset voicing ───────────────────────────────────────────────────────
// All presets share the same chain; they differ in how warm / forward / loud.
interface Voicing {
  warmthDb: number;        // low-shelf @200 Hz
  mudCutDb: number;        // peaking @300 Hz (negative)
  boxCutDb: number;        // peaking @500 Hz (negative)
  presenceDb: number;      // peaking @3.2 kHz
  airDb: number;           // high-shelf @9 kHz
  compThresholdDb: number;
  compRatio: number;
  saturation: number;      // 0..1 drive into the soft-sat curve
  expanderDb: number;      // max downward expansion below the gate (negative)
  targetLufs: number;      // integrated-loudness target
}

const VOICINGS: Record<Exclude<StudioPreset, "off">, Voicing> = {
  // Balanced, clean, "podcast default".
  studio:   { warmthDb: 2.0, mudCutDb: -2.5, boxCutDb: -2.0, presenceDb: 3.0, airDb: 2.5, compThresholdDb: -24, compRatio: 3.0, saturation: 0.18, expanderDb: -14, targetLufs: -16 },
  // Rounder low-mids, softer top — a fireside closeness.
  warm:     { warmthDb: 3.5, mudCutDb: -1.5, boxCutDb: -1.5, presenceDb: 2.0, airDb: 1.0, compThresholdDb: -24, compRatio: 3.0, saturation: 0.26, expanderDb: -12, targetLufs: -16 },
  // Forward, loud, tightly compressed — broadcast/announcer.
  radio:    { warmthDb: 1.5, mudCutDb: -3.0, boxCutDb: -2.5, presenceDb: 4.0, airDb: 3.0, compThresholdDb: -28, compRatio: 4.0, saturation: 0.22, expanderDb: -16, targetLufs: -14 },
  // Very close + warm, gentle dynamics — a whisper near the ear.
  intimate: { warmthDb: 4.0, mudCutDb: -1.5, boxCutDb: -1.0, presenceDb: 2.5, airDb: 2.0, compThresholdDb: -22, compRatio: 2.5, saturation: 0.30, expanderDb: -10, targetLufs: -17 },
};

export function studioSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: unknown }).webkitOfflineAudioContext) === "function" &&
    typeof (window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext) === "function"
  );
}

function getOfflineCtx(channels: number, length: number, sampleRate: number): OfflineAudioContext {
  const OAC = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  return new OAC(channels, Math.max(1, Math.ceil(length)), sampleRate);
}

// Decode a recorded blob to a (possibly multi-channel) AudioBuffer.
async function decode(blob: Blob): Promise<AudioBuffer> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* ignore */ } }
    const arr = await blob.arrayBuffer();
    // Safari wants the callback form; standard browsers take the promise form.
    const buf = await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(arr.slice(0), resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === "function") (p as Promise<AudioBuffer>).then(resolve, reject);
    });
    return buf;
  } finally {
    try { void ctx.close(); } catch { /* ignore */ }
  }
}

// Run the tone + dynamics chain offline at PROC_RATE, mono. Returns Float32 PCM.
async function renderChain(input: AudioBuffer, v: Voicing): Promise<Float32Array> {
  const durationSec = input.length / input.sampleRate;
  const outLen = Math.ceil(durationSec * PROC_RATE);
  const ctx = getOfflineCtx(1, outLen, PROC_RATE);

  const src = ctx.createBufferSource();
  src.buffer = input; // OfflineAudioContext resamples to PROC_RATE on render

  // If the source is stereo, downmix happens automatically into the mono ctx.
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 80; hp.Q.value = 0.707;

  const warmth = ctx.createBiquadFilter();
  warmth.type = "lowshelf"; warmth.frequency.value = 200; warmth.gain.value = v.warmthDb;

  const mud = ctx.createBiquadFilter();
  mud.type = "peaking"; mud.frequency.value = 300; mud.Q.value = 1.0; mud.gain.value = v.mudCutDb;

  const box = ctx.createBiquadFilter();
  box.type = "peaking"; box.frequency.value = 500; box.Q.value = 1.2; box.gain.value = v.boxCutDb;

  const presence = ctx.createBiquadFilter();
  presence.type = "peaking"; presence.frequency.value = 3200; presence.Q.value = 0.8; presence.gain.value = v.presenceDb;

  const air = ctx.createBiquadFilter();
  air.type = "highshelf"; air.frequency.value = 9000; air.gain.value = v.airDb;

  // Anti-alias before the eventual 24 kHz decimation — keep energy below ~11.4k.
  const aa = ctx.createBiquadFilter();
  aa.type = "lowpass"; aa.frequency.value = OUT_RATE * 0.475; aa.Q.value = 0.707;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = v.compThresholdDb;
  comp.knee.value = 24;
  comp.ratio.value = v.compRatio;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  const sat = ctx.createWaveShaper();
  sat.curve = makeSaturationCurve(v.saturation);
  sat.oversample = "4x";

  const makeup = ctx.createGain();
  makeup.gain.value = 1.0; // final level is set by LUFS normalization later

  src.connect(hp); hp.connect(warmth); warmth.connect(mud); mud.connect(box);
  box.connect(presence); presence.connect(air); air.connect(aa);
  aa.connect(comp); comp.connect(sat); sat.connect(makeup); makeup.connect(ctx.destination);

  src.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

// A tanh soft-saturation curve. `drive` 0..1 → subtle even/odd harmonics that
// the ear reads as "warmth"/"body" — the analog-console trick. drive 0 = bypass.
function makeSaturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 1 + drive * 4; // 1..5
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = drive <= 0 ? x : Math.tanh(k * x) / norm;
  }
  return curve;
}

// ── Downward expander (the "make the silences silent" pass) ───────────────────
// Estimate the noise floor from the quietest stretch, then pull anything near
// that floor further down with a smoothed envelope so it doesn't chatter.
function expand(pcm: Float32Array, sampleRate: number, maxReductionDb: number): void {
  const n = pcm.length;
  if (n === 0) return;

  // Short-window RMS envelope (~20 ms) to find the noise floor.
  const win = Math.max(1, Math.floor(sampleRate * 0.02));
  let minRms = Infinity;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += pcm[i] * pcm[i];
    if (i >= win) acc -= pcm[i - win] * pcm[i - win];
    if (i >= win) {
      const rms = Math.sqrt(acc / win);
      if (rms < minRms) minRms = rms;
    }
  }
  if (!isFinite(minRms) || minRms <= 0) minRms = 1e-5;

  // Gate opens ~9 dB above the measured floor; below it we expand down.
  const openThresh = minRms * 2.8;
  const floorGain = Math.pow(10, maxReductionDb / 20); // e.g. −14 dB
  const atkCoef = Math.exp(-1 / (sampleRate * 0.005)); // 5 ms open
  const relCoef = Math.exp(-1 / (sampleRate * 0.08));  // 80 ms close

  let env = 0;
  let gain = 1;
  const envCoef = Math.exp(-1 / (sampleRate * 0.01)); // 10 ms detector
  for (let i = 0; i < n; i++) {
    const a = Math.abs(pcm[i]);
    env = a > env ? a + (env - a) * envCoef : a + (env - a) * envCoef; // simple smoothing
    // Target gain: 1 above the threshold, floorGain well below it, smooth across.
    let target: number;
    if (env >= openThresh) target = 1;
    else {
      const ratio = env / openThresh; // 0..1
      target = floorGain + (1 - floorGain) * ratio * ratio; // ease-in
    }
    const coef = target < gain ? relCoef : atkCoef;
    gain = target + (gain - target) * coef;
    pcm[i] *= gain;
  }
}

// ── Loudness: ITU-R BS.1770 / EBU R128 integrated, K-weighted + gated ─────────
// Two cascaded biquads (the "K" weighting) at 48 kHz, then 400 ms blocks with
// 75% overlap, an absolute −70 LUFS gate and a −10 LU relative gate.
function kWeight(pcm: Float32Array): Float32Array {
  // Stage 1: high-shelf "head" filter (BS.1770-4, 48 kHz).
  const b0 = 1.53512485958697, b1 = -2.69169618940638, b2 = 1.19839281085285;
  const a1 = -1.69065929318241, a2 = 0.73248077421585;
  // Stage 2: RLB high-pass (48 kHz).
  const c0 = 1.0, c1 = -2.0, c2 = 1.0, d1 = -1.99004745483398, d2 = 0.99007225036621;

  const out = new Float32Array(pcm.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let u1 = 0, u2 = 0, w1 = 0, w2 = 0;
  for (let i = 0; i < pcm.length; i++) {
    const x = pcm[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    const z = c0 * y + c1 * u1 + c2 * u2 - d1 * w1 - d2 * w2;
    u2 = u1; u1 = y; w2 = w1; w1 = z;
    out[i] = z;
  }
  return out;
}

function integratedLufs(pcm: Float32Array, sampleRate: number): number {
  const weighted = kWeight(pcm);
  const block = Math.floor(sampleRate * 0.4); // 400 ms
  const hop = Math.floor(block / 4);          // 75% overlap
  if (weighted.length < block) {
    // Too short for a gated measure — fall back to plain mean-square loudness.
    let ms = 0;
    for (let i = 0; i < weighted.length; i++) ms += weighted[i] * weighted[i];
    ms /= Math.max(1, weighted.length);
    return -0.691 + 10 * Math.log10(ms + 1e-12);
  }
  const loud: number[] = []; // per-block loudness
  const power: number[] = [];
  for (let start = 0; start + block <= weighted.length; start += hop) {
    let ms = 0;
    for (let i = start; i < start + block; i++) ms += weighted[i] * weighted[i];
    ms /= block;
    power.push(ms);
    loud.push(-0.691 + 10 * Math.log10(ms + 1e-12));
  }
  // Absolute gate at −70 LUFS.
  const absIdx = loud.map((l, i) => (l > -70 ? i : -1)).filter((i) => i >= 0);
  if (absIdx.length === 0) return -70;
  let gateMs = 0;
  for (const i of absIdx) gateMs += power[i];
  gateMs /= absIdx.length;
  const relGate = -0.691 + 10 * Math.log10(gateMs + 1e-12) - 10; // −10 LU relative
  // Relative gate.
  const relIdx = absIdx.filter((i) => loud[i] > relGate);
  if (relIdx.length === 0) return -70;
  let finalMs = 0;
  for (const i of relIdx) finalMs += power[i];
  finalMs /= relIdx.length;
  return -0.691 + 10 * Math.log10(finalMs + 1e-12);
}

// Apply a flat gain then fold any over-ceiling peaks back under a true-peak-safe
// ceiling with a soft (tanh) knee, so normalization never hard-clips.
function normalizeAndLimit(pcm: Float32Array, gain: number): void {
  const ceil = TRUE_PEAK_CEIL;
  for (let i = 0; i < pcm.length; i++) {
    let s = pcm[i] * gain;
    if (s > ceil || s < -ceil) {
      const sign = s < 0 ? -1 : 1;
      const over = Math.abs(s) - ceil;
      // soft knee above the ceiling
      s = sign * (ceil + (1 - ceil) * Math.tanh(over / (1 - ceil)));
    }
    pcm[i] = s;
  }
}

// Resample a mono Float32 buffer to OUT_RATE using the browser's (anti-aliased)
// resampler via a second offline render.
async function resampleTo(pcm: Float32Array, fromRate: number, toRate: number): Promise<Float32Array> {
  if (fromRate === toRate) return pcm;
  const outLen = Math.ceil((pcm.length * toRate) / fromRate);
  const ctx = getOfflineCtx(1, outLen, toRate);
  const buf = ctx.createBuffer(1, pcm.length, fromRate);
  // copyToChannel wants an ArrayBuffer-backed view; copy into a fresh one.
  const tmp = new Float32Array(pcm.length);
  tmp.set(pcm);
  buf.copyToChannel(tmp, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0).slice();
}

// 16-bit PCM WAV.
function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Enhance a recorded voice blob. Resolves to a WAV blob (and the loudness it
 * measured); REJECTS on any failure so the caller can fall back to the raw
 * recording. `preset: "off"` returns a normalized-only pass (still levelled).
 */
export async function enhanceVoice(input: Blob, preset: StudioPreset = "studio"): Promise<EnhanceResult> {
  if (!studioSupported()) throw new Error("studio: unsupported");
  const decoded = await decode(input);
  if (!decoded || decoded.length === 0) throw new Error("studio: empty");

  const v = preset === "off" ? null : VOICINGS[preset];

  // 1) Tone + dynamics chain (or a clean resample-to-48k if preset is off).
  let pcm: Float32Array;
  if (v) {
    pcm = await renderChain(decoded, v);
  } else {
    pcm = await resampleTo(decoded.getChannelData(0).slice(), decoded.sampleRate, PROC_RATE);
  }

  const lufsBefore = integratedLufs(
    await resampleTo(decoded.numberOfChannels > 0 ? decoded.getChannelData(0).slice() : pcm, decoded.sampleRate, PROC_RATE),
    PROC_RATE,
  );

  // 2) Downward expander — silences become silent.
  if (v) expand(pcm, PROC_RATE, v.expanderDb);

  // 3) Loudness normalize to target + true-peak-safe limit.
  const target = v ? v.targetLufs : -16;
  const measured = integratedLufs(pcm, PROC_RATE);
  let gain = Math.pow(10, (target - measured) / 20);
  if (!isFinite(gain) || gain <= 0) gain = 1;
  gain = Math.min(gain, 8); // never boost noise more than +18 dB
  normalizeAndLimit(pcm, gain);
  const lufsAfter = integratedLufs(pcm, PROC_RATE);

  // 4) Down to 24 kHz mono + WAV — but stay under the encrypted-payload cap.
  // base64 inflates ~1.33×, and the server caps ciphertext at 900 KB, so the
  // WAV must stay under ~670 KB. 24 kHz/10 s is ~480 KB (safe); if a clip ever
  // exceeds it, drop to 16 kHz (telephone-plus, still warm) rather than fail.
  const SAFE_BYTES = 670_000;
  let outRate = OUT_RATE;
  let out = await resampleTo(pcm, PROC_RATE, outRate);
  let blob = encodeWav(out, outRate);
  if (blob.size > SAFE_BYTES) {
    outRate = 16_000;
    out = await resampleTo(pcm, PROC_RATE, outRate);
    blob = encodeWav(out, outRate);
  }

  return {
    blob,
    mimeType: "audio/wav",
    preset,
    lufsBefore,
    lufsAfter,
    durationMs: Math.round((decoded.length / decoded.sampleRate) * 1000),
  };
}
