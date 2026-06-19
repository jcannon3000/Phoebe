/**
 * Phoebe Studio — on-device, studio-grade voice enhancement.
 *
 * Turns a phone recording into something that sounds like it was spoken into a
 * podcast mic in a treated room: clean (AI noise removal), warm, close, evenly
 * levelled, full-band. Because voice memos are end-to-end encrypted (see
 * voiceCrypto.ts), ALL of this runs on the sender's device, BEFORE encryption —
 * the server never sees raw or enhanced audio.
 *
 * The chain, in order (the order is what makes it sound produced):
 *   1. Decode → mono 48 kHz PCM.
 *   2. AI noise removal — RNNoise (Xiph's recurrent-net denoiser, WASM). This
 *      is the single biggest jump from "phone" to "studio": it strips the
 *      room/HVAC/street hiss that a DSP gate can't touch, with almost none of
 *      the "musical noise" of spectral subtraction. Blended slightly wet/dry
 *      so the voice keeps its breath and intimacy.
 *   3. Tone + dynamics, rendered offline (OfflineAudioContext, non-realtime):
 *        high-pass 80 → warmth low-shelf 200 → cut mud 300 / box 500 →
 *        presence 3.2k → air shelf 8k (full-band, no low-pass) → compressor →
 *        soft tanh saturation.
 *   4. Downward expander — makes the silences between words silent (the biggest
 *      "studio vs phone" tell).
 *   5. Loudness — ITU-R BS.1770 / EBU R128 K-weighted gated integrated LUFS,
 *      normalized to a broadcast target, then a true-peak-safe limit.
 *   6. Encode full-band 48 kHz mono MP3 (plays on every device incl. iOS; tiny
 *      — a 144 s prayer is ~1–2.3 MB; no codec-playback gotchas like Opus).
 *
 * Best-effort: any failure (decode error, WASM won't load) throws so the caller
 * sends the original recording instead — a prayer is never blocked.
 */

export type StudioPreset = "studio" | "warm" | "radio" | "intimate" | "off";

export interface EnhanceResult {
  blob: Blob;
  mimeType: "audio/mpeg";
  preset: StudioPreset;
  lufsBefore: number;
  lufsAfter: number;
  durationMs: number;
}

const PROC_RATE = 48_000; // process, denoise (RNNoise needs 48k), measure, encode
const MP3_KBPS = 128;     // transparent for mono voice; full band; ~128kbps·duration/8 bytes
const TRUE_PEAK_CEIL = 0.794; // ≈ −2 dBTP
const RN_FRAME = 480;     // RNNoise frame = 10 ms @ 48 kHz

interface Voicing {
  denoiseWet: number;      // 0..1 — how much of the AI-denoised signal to keep
  warmthDb: number;        // low-shelf @200 Hz
  mudCutDb: number;        // peaking @300 Hz (negative)
  boxCutDb: number;        // peaking @500 Hz (negative)
  presenceDb: number;      // peaking @3.2 kHz
  airDb: number;           // high-shelf @9 kHz
  compThresholdDb: number;
  compRatio: number;
  saturation: number;      // 0..1 drive into the soft-sat curve
  expanderDb: number;      // max downward expansion below the gate (negative)
  targetLufs: number;
}

// denoiseWet kept MODERATE — aggressive RNNoise dulls/muffles the voice and
// eats its air; ~0.6-0.75 cleans the room while staying open and present. The
// air shelf is generous so the result reads bright, not under-water.
const VOICINGS: Record<Exclude<StudioPreset, "off">, Voicing> = {
  studio:   { denoiseWet: 0.72, warmthDb: 2.0, mudCutDb: -2.5, boxCutDb: -2.0, presenceDb: 3.5, airDb: 4.0, compThresholdDb: -24, compRatio: 3.0, saturation: 0.18, expanderDb: -16, targetLufs: -16 },
  warm:     { denoiseWet: 0.68, warmthDb: 3.5, mudCutDb: -1.5, boxCutDb: -1.5, presenceDb: 2.5, airDb: 2.5, compThresholdDb: -24, compRatio: 3.0, saturation: 0.26, expanderDb: -14, targetLufs: -16 },
  radio:    { denoiseWet: 0.78, warmthDb: 1.5, mudCutDb: -3.0, boxCutDb: -2.5, presenceDb: 4.5, airDb: 5.0, compThresholdDb: -28, compRatio: 4.0, saturation: 0.22, expanderDb: -18, targetLufs: -14 },
  intimate: { denoiseWet: 0.62, warmthDb: 4.0, mudCutDb: -1.5, boxCutDb: -1.0, presenceDb: 3.0, airDb: 3.5, compThresholdDb: -22, compRatio: 2.5, saturation: 0.30, expanderDb: -12, targetLufs: -17 },
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

async function decode(blob: Blob): Promise<AudioBuffer> {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  try {
    if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* ignore */ } }
    const arr = await blob.arrayBuffer();
    return await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(arr.slice(0), resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === "function") (p as Promise<AudioBuffer>).then(resolve, reject);
    });
  } finally {
    try { void ctx.close(); } catch { /* ignore */ }
  }
}

// Resample/downmix any decoded buffer to mono 48 kHz Float32.
async function toMono48k(buf: AudioBuffer): Promise<Float32Array> {
  const len = Math.ceil(buf.duration * PROC_RATE);
  const ctx = getOfflineCtx(1, len, PROC_RATE);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  const r = await ctx.startRendering();
  return r.getChannelData(0).slice();
}

// ── AI noise removal (RNNoise WASM) ───────────────────────────────────────────
// Lazy-loaded + cached. The sync build inlines the WASM as base64, so there's no
// separate asset to serve (Vite-friendly). RNNoise wants 48 kHz, 480-sample
// frames, with samples in int16 magnitude (±32768).
let rnnoiseModPromise: Promise<unknown> | null = null;
function loadRnnoise(): Promise<unknown> {
  if (!rnnoiseModPromise) {
    rnnoiseModPromise = import("@jitsi/rnnoise-wasm/dist/rnnoise-sync")
      .then((m: unknown) => {
        const factory = (m as { default?: unknown }).default ?? m;
        return (factory as () => unknown)();
      });
  }
  return rnnoiseModPromise;
}

type RnnModule = {
  _rnnoise_create: () => number;
  _rnnoise_destroy: (s: number) => void;
  _rnnoise_process_frame: (s: number, out: number, inp: number) => number;
  _malloc: (n: number) => number;
  _free: (p: number) => void;
  HEAPF32: Float32Array;
};

async function denoise(pcm: Float32Array, wet: number): Promise<Float32Array> {
  if (wet <= 0) return pcm;
  let mod: RnnModule;
  try {
    mod = (await loadRnnoise()) as RnnModule;
    if (!mod || typeof mod._rnnoise_create !== "function") return pcm;
  } catch { return pcm; }
  try {
    const state = mod._rnnoise_create();
    const ptr = mod._malloc(RN_FRAME * 4);
    const idx = ptr >> 2;
    const out = new Float32Array(pcm.length);
    const frame = new Float32Array(RN_FRAME);
    for (let i = 0; i < pcm.length; i += RN_FRAME) {
      const n = Math.min(RN_FRAME, pcm.length - i);
      for (let j = 0; j < RN_FRAME; j++) frame[j] = (j < n ? pcm[i + j] : 0) * 32768;
      mod.HEAPF32.set(frame, idx);
      mod._rnnoise_process_frame(state, ptr, ptr);
      for (let j = 0; j < n; j++) {
        const d = mod.HEAPF32[idx + j] / 32768;
        out[i + j] = wet * d + (1 - wet) * pcm[i + j];
      }
    }
    mod._free(ptr);
    mod._rnnoise_destroy(state);
    return out;
  } catch { return pcm; }
}

// ── Tone + dynamics (offline) ─────────────────────────────────────────────────
async function renderChain(pcm: Float32Array, v: Voicing): Promise<Float32Array> {
  const ctx = getOfflineCtx(1, pcm.length, PROC_RATE);
  const buf = ctx.createBuffer(1, pcm.length, PROC_RATE);
  const tmp = new Float32Array(pcm.length); tmp.set(pcm); buf.copyToChannel(tmp, 0);
  const src = ctx.createBufferSource(); src.buffer = buf;

  const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 80; hp.Q.value = 0.707;
  const warmth = ctx.createBiquadFilter(); warmth.type = "lowshelf"; warmth.frequency.value = 200; warmth.gain.value = v.warmthDb;
  const mud = ctx.createBiquadFilter(); mud.type = "peaking"; mud.frequency.value = 300; mud.Q.value = 1.0; mud.gain.value = v.mudCutDb;
  const box = ctx.createBiquadFilter(); box.type = "peaking"; box.frequency.value = 500; box.Q.value = 1.2; box.gain.value = v.boxCutDb;
  const presence = ctx.createBiquadFilter(); presence.type = "peaking"; presence.frequency.value = 3200; presence.Q.value = 0.8; presence.gain.value = v.presenceDb;
  const air = ctx.createBiquadFilter(); air.type = "highshelf"; air.frequency.value = 8000; air.gain.value = v.airDb;
  // (no low-pass — output is full-band 48 kHz MP3 now; the old 16 kHz LP was a
  // leftover from the dead 24 kHz path and was capping the brightness/air.)
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = v.compThresholdDb; comp.knee.value = 24; comp.ratio.value = v.compRatio; comp.attack.value = 0.004; comp.release.value = 0.18;
  const sat = ctx.createWaveShaper(); sat.curve = makeSaturationCurve(v.saturation); sat.oversample = "4x";
  const makeup = ctx.createGain(); makeup.gain.value = 1.0;

  src.connect(hp); hp.connect(warmth); warmth.connect(mud); mud.connect(box);
  box.connect(presence); presence.connect(air);
  air.connect(comp); comp.connect(sat); sat.connect(makeup); makeup.connect(ctx.destination);

  src.start();
  const r = await ctx.startRendering();
  return r.getChannelData(0).slice();
}

function makeSaturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = 1 + drive * 4;
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = drive <= 0 ? x : Math.tanh(k * x) / norm;
  }
  return curve;
}

// ── Downward expander (silent gaps) ───────────────────────────────────────────
function expand(pcm: Float32Array, sampleRate: number, maxReductionDb: number): void {
  const n = pcm.length;
  if (n === 0) return;
  const win = Math.max(1, Math.floor(sampleRate * 0.02));
  let minRms = Infinity, acc = 0;
  for (let i = 0; i < n; i++) {
    acc += pcm[i] * pcm[i];
    if (i >= win) { acc -= pcm[i - win] * pcm[i - win]; const rms = Math.sqrt(acc / win); if (rms < minRms) minRms = rms; }
  }
  if (!isFinite(minRms) || minRms <= 0) minRms = 1e-5;
  const openThresh = minRms * 2.8;
  const floorGain = Math.pow(10, maxReductionDb / 20);
  const atkCoef = Math.exp(-1 / (sampleRate * 0.005));
  const relCoef = Math.exp(-1 / (sampleRate * 0.08));
  const envCoef = Math.exp(-1 / (sampleRate * 0.01));
  let env = 0, gain = 1;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(pcm[i]);
    env = a + (env - a) * envCoef;
    let target: number;
    if (env >= openThresh) target = 1;
    else { const ratio = env / openThresh; target = floorGain + (1 - floorGain) * ratio * ratio; }
    const coef = target < gain ? relCoef : atkCoef;
    gain = target + (gain - target) * coef;
    pcm[i] *= gain;
  }
}

// ── Loudness (ITU-R BS.1770 / EBU R128, K-weighted + gated) ───────────────────
function kWeight(pcm: Float32Array): Float32Array {
  const b0 = 1.53512485958697, b1 = -2.69169618940638, b2 = 1.19839281085285, a1 = -1.69065929318241, a2 = 0.73248077421585;
  const c0 = 1.0, c1 = -2.0, c2 = 1.0, d1 = -1.99004745483398, d2 = 0.99007225036621;
  const out = new Float32Array(pcm.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, w1 = 0, w2 = 0;
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
  const block = Math.floor(sampleRate * 0.4), hop = Math.floor((sampleRate * 0.4) / 4);
  if (weighted.length < block) {
    let ms = 0; for (let i = 0; i < weighted.length; i++) ms += weighted[i] * weighted[i];
    return -0.691 + 10 * Math.log10(ms / Math.max(1, weighted.length) + 1e-12);
  }
  const loud: number[] = [], power: number[] = [];
  for (let start = 0; start + block <= weighted.length; start += hop) {
    let ms = 0; for (let i = start; i < start + block; i++) ms += weighted[i] * weighted[i];
    ms /= block; power.push(ms); loud.push(-0.691 + 10 * Math.log10(ms + 1e-12));
  }
  const absIdx = loud.map((l, i) => (l > -70 ? i : -1)).filter((i) => i >= 0);
  if (absIdx.length === 0) return -70;
  let gateMs = 0; for (const i of absIdx) gateMs += power[i]; gateMs /= absIdx.length;
  const relGate = -0.691 + 10 * Math.log10(gateMs + 1e-12) - 10;
  const relIdx = absIdx.filter((i) => loud[i] > relGate);
  if (relIdx.length === 0) return -70;
  let finalMs = 0; for (const i of relIdx) finalMs += power[i]; finalMs /= relIdx.length;
  return -0.691 + 10 * Math.log10(finalMs + 1e-12);
}

function normalizeAndLimit(pcm: Float32Array, gain: number): void {
  const ceil = TRUE_PEAK_CEIL;
  for (let i = 0; i < pcm.length; i++) {
    let s = pcm[i] * gain;
    if (s > ceil || s < -ceil) {
      const sign = s < 0 ? -1 : 1;
      const over = Math.abs(s) - ceil;
      s = sign * (ceil + (1 - ceil) * Math.tanh(over / (1 - ceil)));
    }
    pcm[i] = s;
  }
}

// ── MP3 encode (lamejs, pure-JS — plays on every device incl. iOS) ────────────
async function encodeMp3(pcm: Float32Array, sampleRate: number, kbps: number): Promise<Blob> {
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, sampleRate, kbps);
  const int16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  const block = 1152;
  const parts: BlobPart[] = [];
  for (let i = 0; i < int16.length; i += block) {
    const buf = enc.encodeBuffer(int16.subarray(i, i + block));
    if (buf.length > 0) parts.push(new Uint8Array(buf));
  }
  const end = enc.flush();
  if (end.length > 0) parts.push(new Uint8Array(end));
  return new Blob(parts, { type: "audio/mpeg" });
}

// 16-bit PCM WAV — lossless, used as the editable "raw take" intermediate
// (splicing / re-takes happen on PCM; WAV lets the unenhanced take play back).
export function pcmToWav(pcm: Float32Array, sampleRate: number): Blob {
  const dataSize = pcm.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); w(8, "WAVE"); w(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); w(36, "data"); view.setUint32(40, dataSize, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++, off += 2) { const s = Math.max(-1, Math.min(1, pcm[i])); view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buffer], { type: "audio/wav" });
}

export const STUDIO_RATE = PROC_RATE;

/** Encode an UN-processed mono-48k take to MP3 (the "as recorded" A/B take —
 *  same codec as the polished one so the only audible difference is the studio
 *  processing, and it stays small enough to send). */
export async function pcmToMp3(pcm: Float32Array): Promise<Blob> {
  return encodeMp3(pcm, PROC_RATE, MP3_KBPS);
}

/** Decode any recorded blob to the editor's working format: mono Float32 @48k. */
export async function decodeToMono48k(blob: Blob): Promise<Float32Array> {
  if (!studioSupported()) throw new Error("studio: unsupported");
  const decoded = await decode(blob);
  if (!decoded || decoded.length === 0) throw new Error("studio: empty");
  return toMono48k(decoded);
}

/**
 * Enhance a mono-48k PCM take → an MP3 blob (+ measured loudness). This is the
 * core; enhanceVoice() just decodes a blob into this. The tape editor calls
 * this directly on its spliced/edited PCM so it never re-decodes a lossy take.
 * `preset: "off"` is a levelled-only pass.
 */
export async function enhancePcm(mono48: Float32Array, preset: StudioPreset = "studio", durationMs?: number): Promise<EnhanceResult> {
  if (!studioSupported()) throw new Error("studio: unsupported");
  if (!mono48 || mono48.length === 0) throw new Error("studio: empty");

  const v = preset === "off" ? null : VOICINGS[preset];
  const lufsBefore = integratedLufs(mono48, PROC_RATE);

  let pcm = mono48;
  if (v) {
    pcm = await denoise(pcm, v.denoiseWet);   // 1) AI noise removal
    pcm = await renderChain(pcm, v);          // 2) tone + dynamics
    expand(pcm, PROC_RATE, v.expanderDb);     // 3) silent gaps
  }

  // 4) loudness normalize + true-peak-safe limit
  const target = v ? v.targetLufs : -16;
  const measured = integratedLufs(pcm, PROC_RATE);
  let gain = Math.pow(10, (target - measured) / 20);
  if (!isFinite(gain) || gain <= 0) gain = 1;
  gain = Math.min(gain, 8);
  normalizeAndLimit(pcm, gain);
  const lufsAfter = integratedLufs(pcm, PROC_RATE);

  // 5) full-band MP3
  const blob = await encodeMp3(pcm, PROC_RATE, MP3_KBPS);

  return { blob, mimeType: "audio/mpeg", preset, lufsBefore, lufsAfter, durationMs: durationMs ?? Math.round((mono48.length / PROC_RATE) * 1000) };
}

/**
 * Enhance a recorded voice blob → an MP3 blob. REJECTS on any failure so the
 * caller falls back to the raw recording.
 */
export async function enhanceVoice(input: Blob, preset: StudioPreset = "studio"): Promise<EnhanceResult> {
  const mono48 = await decodeToMono48k(input);
  return enhancePcm(mono48, preset);
}
