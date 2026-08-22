// ── Speech-to-text (pluggable) ─────────────────────────────────────────────
//
// Turns an episode's audio into a timestamped transcript. Today this calls
// the OpenAI Whisper API; it's intentionally the ONLY place that knows about
// a transcription provider, so swapping in a self-hosted Whisper (whisper.cpp
// / faster-whisper) later is a drop-in replacement — the alignment, storage,
// API, and UI all stay identical.
//
// Inert by design: with no OPENAI_API_KEY set, transcribeAudio() returns null
// and the whole feature stays dark (nothing bills, nothing runs) until you
// opt in by provisioning the key. Claude cannot do this step — the Anthropic
// API has no audio input — so some STT engine is always required here.

import { assertPublicHttpUrl } from "../ssrfGuard";

export type TranscriptSegment = { start: number; end: number; text: string };
export type Transcript = {
  durationSeconds: number;
  segments: TranscriptSegment[];
  provider: string;
};

// OpenAI's Whisper endpoint rejects uploads over 25 MB. A ~15-minute office
// MP3 is typically well under that; we guard so a surprise large file fails
// with a clear message instead of an opaque 413.
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

/**
 * The single gate on every Whisper pass — and the app's whole OpenAI audio
 * bill runs through it.
 *
 * Owner: "it looks like it was running transcriptions each day, that was
 * supposed to be turned off." It was: the hourly office-alignment scheduler
 * had no off switch at all, and Whisper was $4.95 of a $5.02 fortnight — 98.6%
 * of the spend, against under a cent for everything else.
 *
 * OFF BY DEFAULT, and the flag must be set explicitly to turn it back on.
 * Costly background work that nobody asked for should be opt-in; the previous
 * arrangement had it running from the moment the server booted.
 *
 * Gating HERE rather than in the scheduler is the point. Disabling the
 * scheduler alone would not have saved a penny — routes/office-alignment.ts
 * and routes/podcast.ts both kick off a transcription on demand when today's
 * marks are missing, so the cost would simply have moved to whoever opened the
 * read-along first. Every path reaches this function, and both builders
 * already degrade gracefully when it returns false: they record "pending" and
 * return "skipped", never throw.
 *
 * What switching it off costs: the office read-aloud word highlighting and the
 * Forward Day by Day skip markers stop being computed. Those surfaces handle
 * the absence (no highlighting, no skip marks) rather than breaking.
 */
export function transcriptionEnabled(): boolean {
  if (!process.env.OPENAI_API_KEY) return false;
  const flag = process.env.OFFICE_TRANSCRIPTION_ENABLED;
  return flag === "1" || flag === "true";
}

export async function transcribeAudio(audioUrl: string): Promise<Transcript | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn("[office-align] OPENAI_API_KEY not set — transcription disabled");
    return null;
  }
  // Belt and braces on the function that actually spends the money. Callers
  // are supposed to check transcriptionEnabled() first, and today all of them
  // do — but this is the one place a Whisper charge is incurred, so a future
  // caller that forgets should cost nothing rather than quietly reopening the
  // daily bill.
  if (!transcriptionEnabled()) {
    console.warn("[office-align] transcription disabled — set OFFICE_TRANSCRIPTION_ENABLED=1 to enable");
    return null;
  }

  // SSRF guard — audioUrl comes from a podcast feed's <enclosure>; reject any
  // host that resolves to an internal/non-routable address before fetching.
  await assertPublicHttpUrl(audioUrl);
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
  if (!audioRes.ok) throw new Error(`audio fetch failed: ${audioRes.status}`);
  // Reject oversize via Content-Length before buffering the whole body.
  const declaredLen = Number(audioRes.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLen) && declaredLen > WHISPER_MAX_BYTES) {
    throw new Error(
      `audio is ${(declaredLen / 1e6).toFixed(1)} MB (Content-Length), over Whisper's 25 MB limit`,
    );
  }
  const bytes = Buffer.from(await audioRes.arrayBuffer());
  if (bytes.length > WHISPER_MAX_BYTES) {
    throw new Error(
      `audio is ${(bytes.length / 1e6).toFixed(1)} MB, over Whisper's 25 MB limit`,
    );
  }

  const fileName = (audioUrl.split("/").pop() ?? "office.mp3").split("?")[0] || "office.mp3";
  const form = new FormData();
  form.append("file", new Blob([bytes]), fileName);
  form.append("model", "whisper-1");
  // verbose_json gives us per-segment start/end times, which is all the
  // alignment step needs (segment granularity beats word-level here — it
  // keeps the payload we hand Claude small and the matching robust).
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Whisper API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    duration?: number;
    segments?: Array<{ start: number; end: number; text: string }>;
    text?: string;
  };
  const segments: TranscriptSegment[] = (data.segments ?? []).map((s) => ({
    start: s.start,
    end: s.end,
    text: (s.text ?? "").trim(),
  }));
  const last = segments[segments.length - 1];
  return {
    durationSeconds: data.duration ?? (last ? last.end : 0),
    segments,
    provider: "openai-whisper-1",
  };
}
