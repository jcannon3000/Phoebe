// ── Scripture Day by Day ↔ audio alignment ─────────────────────────────────
//
// Given an episode's four readings (already in spoken order — OT, Psalm, NT,
// Gospel — see scriptureReadings.ts) and a timestamped transcript of the
// episode, work out the START time of each reading so the app can flag "the
// Gospel begins here" / play a single reading.
//
// This is an easier alignment than the full office: the episode is ONLY the
// four readings after a short intro — no psalms-as-liturgy, prayers, canticles
// or creed interleaved — and we already know exactly which four passages, in
// order. So we:
//
//   1. RECOGNISE — hand an LLM the four readings (kind + citation) and the
//      timestamped transcript; it returns the start second of each, spotting
//      the reader's announcement ("A reading from Numbers", "Psalm 107", "The
//      Holy Gospel according to Matthew") and the passage's own words. A
//      book-name heuristic is the no-LLM fallback.
//   2. PREDICT — any reading the recogniser couldn't pin is placed by its
//      position: it sits in the gap between the readings on either side, the
//      gap split by each reading's estimated spoken length (verse count).
//
// The first reading never starts at 0 — an ~INTRO_SECONDS intro precedes it.

import type { OfficeAlignmentSection } from "@workspace/db";
import type { Transcript } from "./transcribeAudio";
import type { ReadingKind, ScriptureReading } from "./scriptureReadings";

// The episode opens with a short branded intro before the first reading. The
// OT is therefore pinned no earlier than this, and predicted starts distribute
// across [INTRO_SECONDS, end] — never from 0.
export const INTRO_SECONDS = 10;

const SECONDS_PER_VERSE = 12; // rough spoken length of one Bible verse
const MATCH_THRESHOLD = 0.5;

const KIND_LABEL: Record<ReadingKind, string> = {
  ot: "Old Testament", psalm: "Psalm", nt: "New Testament", gospel: "Gospel",
};

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

function normWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

// The distinctive book word to look for in the transcript when the LLM is
// unavailable — the last word of the book name ("Numbers"→"numbers",
// "1 Corinthians"→"corinthians", "Psalm 107…"→"psalm").
function bookAnchor(citation: string): string {
  const book = (citation.match(/^(.*?)\s+\d/)?.[1] ?? citation).toLowerCase();
  const words = normWords(book);
  return words[words.length - 1] ?? book;
}

// Estimate spoken seconds for a reading from its citation's verse span — used
// only to space PREDICTED readings; recognised ones use the real timestamp.
function readingSeconds(citation: string): number {
  const m = citation.match(/(\d+)\s*[-–—]\s*(\d+)\s*$/);
  if (m) {
    const span = Math.abs(parseInt(m[2], 10) - parseInt(m[1], 10)) + 1;
    if (span > 0 && span < 200) return Math.max(20, span * SECONDS_PER_VERSE);
  }
  return 90; // a middling reading
}

type Located = Map<ReadingKind, { start: number; confidence: number }>;

// ── Recognition: book-name heuristic (no LLM) ──────────────────────────────

type Tok = { w: string; t: number };

function transcriptTokens(transcript: Transcript): Tok[] {
  const toks: Tok[] = [];
  for (const seg of transcript.segments) {
    const ws = normWords(seg.text);
    if (ws.length === 0) continue;
    const span = Math.max(0.001, seg.end - seg.start);
    for (let i = 0; i < ws.length; i++) toks.push({ w: ws[i], t: seg.start + (span * i) / ws.length });
  }
  return toks;
}

function locateHeuristic(readings: ScriptureReading[], transcript: Transcript): Located {
  const toks = transcriptTokens(transcript);
  const located: Located = new Map();
  let cursor = 0;
  for (const r of readings) {
    const anchor = bookAnchor(r.citation);
    let foundAt = -1;
    for (let i = cursor; i < toks.length; i++) {
      if (toks[i].w === anchor) { foundAt = i; break; }
    }
    if (foundAt >= 0) {
      located.set(r.kind, { start: round1(toks[foundAt].t), confidence: 0.55 });
      cursor = foundAt + 1; // monotonic — readings are in order
    }
  }
  return located;
}

// ── Recognition: spoken-announcement anchor (deterministic) ────────────────
//
// Scripture Day by Day ANNOUNCES each reading before reading it — "A reading
// from Numbers…", "Psalm 107…", "The Holy Gospel… according to Matthew…". So
// the most reliable anchor is the announcement itself: find the reading's book
// word, confirmed by its chapter number appearing in the next few words. The
// chapter number disambiguates the real announcement from an incidental mention
// (e.g. the word "psalm" said in passing earlier). No model, no guessing — if
// the transcript is decent, every reading is found.

// The chapter number from a citation: the first number AFTER the book name, so
// "1 Corinthians 13:1" → "13" (not the book's "1"), "Psalm 107:33-43, 108" → "107".
function chapterOf(citation: string): string | null {
  const book = citation.match(/^(.*?)\s+\d/)?.[1] ?? "";
  const m = citation.slice(book.length).match(/\d+/);
  return m ? m[0] : null;
}

// A small lead so the segment opens on the announcement ("A reading from…"),
// not mid-phrase on the book word.
const ANNOUNCEMENT_LEAD = 2.5;

function locateByAnnouncement(readings: ScriptureReading[], transcript: Transcript): Located {
  const toks = transcriptTokens(transcript);
  const located: Located = new Map();
  let cursor = 0;
  for (const r of readings) {
    const anchor = bookAnchor(r.citation); // last book word: "numbers", "psalm", "matthew"
    const chapter = chapterOf(r.citation); // "20", "107", "21"
    let bookOnly = -1; // book word seen but chapter not confirmed nearby
    let strong = -1;   // book word AND its chapter number nearby — the announcement
    for (let i = cursor; i < toks.length; i++) {
      if (toks[i].w !== anchor) continue;
      if (bookOnly < 0) bookOnly = i;
      if (!chapter) { strong = i; break; }
      const hi = Math.min(toks.length - 1, i + 6);
      let near = false;
      for (let j = i + 1; j <= hi; j++) { if (toks[j].w === chapter) { near = true; break; } }
      if (near) { strong = i; break; }
    }
    const hit = strong >= 0 ? strong : bookOnly;
    if (hit >= 0) {
      located.set(r.kind, {
        start: round1(Math.max(0, toks[hit].t - ANNOUNCEMENT_LEAD)),
        confidence: strong >= 0 ? 0.95 : 0.6,
      });
      cursor = hit + 1; // strictly after — readings are in order
    }
  }
  return located;
}

// ── Recognition: LLM ───────────────────────────────────────────────────────

async function locateLLM(
  readings: ScriptureReading[],
  transcript: Transcript,
): Promise<{ located: Located; outroStartSeconds: number | null } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.SCRIPTURE_ALIGN_MODEL || process.env.OFFICE_ALIGN_MODEL || "gpt-4o-mini";

  const outline = readings
    .map((r, i) => `${i + 1}. kind=${r.kind} | ${KIND_LABEL[r.kind]} | ${r.citation}`)
    .join("\n");
  const tx = transcript.segments.map((seg) => `[${seg.start.toFixed(1)}] ${seg.text}`).join("\n");

  const system =
    "You align the spoken \"Scripture Day by Day\" podcast to its known readings.\n" +
    `The recording opens with a short (~${INTRO_SECONDS}s) branded INTRO, then reads four passages aloud IN THIS ORDER: (1) an Old Testament reading, (2) a Psalm, (3) a New Testament / epistle reading, (4) a Gospel reading. A different reader reads each.\n` +
    "Each reading is normally ANNOUNCED before it is read — e.g. \"A reading from Numbers\", \"A reading from the book of the prophet Isaiah\", \"Psalm 107\", \"A reading from Paul's letter to the Romans\", \"The Holy Gospel of our Lord Jesus Christ according to Matthew\".\n" +
    "You get (A) the four READINGS in spoken order, each with its kind and its scripture citation, and (B) a TRANSCRIPT whose every line starts with a timestamp in seconds like \"[12.4] ...\".\n" +
    "For each reading return startSeconds = the timestamp where that reading's SEGMENT BEGINS — the first word of its announcement (or, if not announced, its first spoken scripture word) — i.e. right after the previous reading ends. The Old Testament reading begins AFTER the intro, never at 0. Identify each reading both from its announcement AND from recognising the passage's actual words (you know the Bible, so infer the book/chapter from the spoken text). Readings occur strictly in order, so start times must increase.\n" +
    "If the recording ends with a closing/outro that is not one of the four readings (a sign-off, credits, or appeal), set outroStartSeconds to where it begins; otherwise null.\n" +
    "Respond with ONLY a JSON object: {\"readings\":[{\"kind\":\"ot|psalm|nt|gospel\",\"startSeconds\":<number>,\"confidence\":<0..1>}],\"outroStartSeconds\":<number|null>}";
  const user = `READINGS (in spoken order):\n${outline}\n\nTRANSCRIPT:\n${tx}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[scripture-align] LLM alignment ${res.status}: ${body.slice(0, 200)}`);
    return null;
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = extractJson(data.choices?.[0]?.message?.content ?? "");
  if (!parsed || !Array.isArray(parsed.readings)) return null;

  const validKinds = new Set(readings.map((r) => r.kind));
  const located: Located = new Map();
  for (const item of parsed.readings as Array<{ kind?: unknown; startSeconds?: unknown; confidence?: unknown }>) {
    if (!item || typeof item.kind !== "string" || typeof item.startSeconds !== "number") continue;
    if (!validKinds.has(item.kind as ReadingKind)) continue;
    located.set(item.kind as ReadingKind, {
      start: round1(item.startSeconds),
      confidence: typeof item.confidence === "number" ? round2(item.confidence) : 0.8,
    });
  }
  const rawOutro = parsed.outroStartSeconds;
  const outroStartSeconds = typeof rawOutro === "number" && rawOutro > 0 ? round1(rawOutro) : null;
  return { located, outroStartSeconds };
}

// ── Timeline assembly ──────────────────────────────────────────────────────
//
// Pins recognised readings (kept strictly increasing and never before the
// intro), then fills any gap by position — readings between two anchors split
// the span in proportion to their estimated spoken length.
function buildTimeline(
  readings: ScriptureReading[],
  located: Located,
  duration: number,
): OfficeAlignmentSection[] {
  const n = readings.length;
  const start: (number | null)[] = new Array(n).fill(null);
  const conf: number[] = new Array(n).fill(0);
  const predicted: boolean[] = new Array(n).fill(false);

  // Recognised starts, kept STRICTLY increasing and never before the intro. A
  // start the recogniser placed inside the intro is CLAMPED up to INTRO_SECONDS
  // (not dropped); a later reading that would tie the previous start is left to
  // the predictor rather than sharing an identical, zero-length segment.
  let lastT = 0;
  for (let i = 0; i < n; i++) {
    const l = located.get(readings[i].kind);
    if (!l) continue;
    const s = Math.max(l.start, INTRO_SECONDS);
    if (s > lastT) {
      start[i] = s;
      conf[i] = l.confidence;
      lastT = s;
    }
  }

  // Bracket recognised anchors with a virtual intro-end (INTRO_SECONDS) and end
  // (duration), then distribute predicted readings across each gap by weight.
  const anchored: number[] = [];
  for (let i = 0; i < n; i++) if (start[i] !== null) anchored.push(i);
  const lastAnchorT = anchored.length ? (start[anchored[anchored.length - 1]] as number) : INTRO_SECONDS;
  const endT = duration > lastAnchorT ? duration : lastAnchorT + readingSeconds(readings[n - 1].citation);
  const points = [
    { idx: -1, t: INTRO_SECONDS },
    ...anchored.map((i) => ({ idx: i, t: start[i] as number })),
    { idx: n, t: endT },
  ];

  for (let p = 0; p < points.length - 1; p++) {
    const a = points[p];
    const b = points[p + 1];
    const lo = a.idx + 1;
    const hi = b.idx - 1;
    if (hi < lo) continue;
    const cursor = a.t + (a.idx >= 0 ? readingSeconds(readings[a.idx].citation) : 0);
    const span = Math.max(0, b.t - cursor);
    let totalW = 0;
    for (let k = lo; k <= hi; k++) totalW += readingSeconds(readings[k].citation);
    let acc = 0;
    for (let k = lo; k <= hi; k++) {
      start[k] = round1(cursor + (totalW > 0 ? (acc / totalW) * span : 0));
      acc += readingSeconds(readings[k].citation);
      predicted[k] = true;
      conf[k] = 0.4;
    }
  }

  const out: OfficeAlignmentSection[] = readings.map((r, i) => ({
    id: r.kind,
    type: r.kind,
    title: r.citation,
    startSeconds: start[i] ?? (i > 0 ? (start[i - 1] ?? INTRO_SECONDS) : INTRO_SECONDS),
    endSeconds: null,
    confidence: conf[i] || 0.4,
    predicted: predicted[i] ? true : undefined,
  }));
  for (let i = 1; i < out.length; i++) {
    if (out[i].startSeconds < out[i - 1].startSeconds) out[i].startSeconds = out[i - 1].startSeconds;
  }
  fillEnds(out);
  return out;
}

// Recognise with the LLM (falling back to the book-name heuristic), then
// predict the rest by position. Prepends an "intro" marker [0, first reading)
// so the player can skip the branded open. Returns a per-reading timeline.
export async function alignScripture(
  readings: ScriptureReading[],
  transcript: Transcript,
): Promise<{ sections: OfficeAlignmentSection[]; aligner: string }> {
  if (readings.length === 0) return { sections: [], aligner: "none" };

  // PRIMARY: the spoken announcement (deterministic — book word + chapter
  // number). The LLM is kept only to detect the outro and to fill any reading
  // the announcement matcher couldn't find; the book-name heuristic is the last
  // resort. Per-reading precedence so one weak reading can't drag the others.
  const byAnnouncement = locateByAnnouncement(readings, transcript);
  let llm: { located: Located; outroStartSeconds: number | null } | null = null;
  try {
    llm = await locateLLM(readings, transcript);
  } catch (e) {
    console.warn("[scripture-align] LLM step failed:", e);
  }
  const heuristic = locateHeuristic(readings, transcript);

  const located: Located = new Map();
  for (const r of readings) {
    const pick = byAnnouncement.get(r.kind) ?? llm?.located.get(r.kind) ?? heuristic.get(r.kind);
    if (pick) located.set(r.kind, pick);
  }
  let outroStart: number | null = llm?.outroStartSeconds ?? null;
  const aligner = byAnnouncement.size === readings.length
    ? "announce"
    : llm && llm.located.size > 0 ? "announce+llm" : "announce+heuristic";

  // Ignore an outro the recogniser placed at/before the last recognised
  // reading — using it would give the final reading a negative-length segment.
  const recognizedMax = located.size > 0 ? Math.max(...Array.from(located.values(), (v) => v.start)) : 0;
  if (outroStart != null && outroStart <= recognizedMax) outroStart = null;

  // Cap the readings at any closing/outro so predicted readings distribute
  // across the scripture only.
  const effectiveEnd = outroStart != null && outroStart > 0 ? outroStart : transcript.durationSeconds;
  const timeline = buildTimeline(readings, located, effectiveEnd);

  // Lead with an intro marker so the UI can label/skip the branded open.
  const firstStart = timeline.length > 0 ? timeline[0].startSeconds : INTRO_SECONDS;
  const sections: OfficeAlignmentSection[] = [
    { id: "__intro__", type: "intro", title: null, startSeconds: 0, endSeconds: round1(firstStart), confidence: 0.9 },
    ...timeline,
  ];
  if (outroStart != null) {
    if (sections.length > 0) sections[sections.length - 1].endSeconds = round1(outroStart);
    sections.push({ id: "__outro__", type: "outro", title: null, startSeconds: round1(outroStart), endSeconds: null, confidence: 0.9 });
  }
  return { sections, aligner };
}

function fillEnds(secs: OfficeAlignmentSection[]): void {
  for (let i = 0; i < secs.length; i++) {
    secs[i].endSeconds = i + 1 < secs.length ? secs[i + 1].startSeconds : null;
  }
}

function extractJson(text: string): { readings?: unknown; outroStartSeconds?: unknown } | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1)) as { readings?: unknown; outroStartSeconds?: unknown };
  } catch {
    return null;
  }
}
