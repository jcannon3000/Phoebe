// ── Office ↔ audio alignment ───────────────────────────────────────────────
//
// Given the office Phoebe assembled for a day (an ordered list of slides) and
// a timestamped transcript of that day's spoken office, work out the start
// time of EACH part of the office — including the scripture lessons, whose
// text never appears in the slides (Phoebe shows only the reference + a
// "read it" link; the Forward Movement reader reads the passage aloud).
//
// Phoebe's office is a deterministic, ordered slideshow: psalms split into
// 4-verse chunks, the Gloria its own slide, every prayer a fixed-text slide
// in a known sequence. We lean on that with two layers:
//
//   1. RECOGNISE — hand an OpenAI chat model the office outline + the
//      timestamped transcript. Fixed-text slides (psalm verses, the Gloria,
//      canticles, Creed, Lord's Prayer, …) it matches by their words. A
//      LESSON carries its eyebrow + scripture reference as the hint (e.g.
//      "FIRST LESSON — a reading from Matt. 13:31-35"); the model spots it in
//      the transcript by the reader's announcement ("A reading from the
//      Gospel according to Matthew…") or the passage's opening words. The
//      heuristic matcher is the no-LLM fallback.
//
//   2. PREDICT — any slide the recogniser couldn't pin (often a lesson, or a
//      psalm chunk in an unfamiliar translation) is placed by its LITURGICAL
//      POSITION: it sits in the audio gap between the slides on either side of
//      it, and we split that gap by each slide's estimated spoken length
//      (word count for fixed text; verse count for a lesson). So a lesson
//      lands right where the liturgy says it must — after the Psalm's Gloria,
//      before the Canticle — even when its words can't be matched directly.
//
// The result is a per-slide timeline: a start time for every spoken slide,
// exact where recognised, predicted (flagged, lower confidence) where not.

import type { OfficeAlignmentSection } from "@workspace/db";
import type { Transcript } from "./transcribeAudio";

type OfficeSlideLite = {
  id: string;
  type: string;
  eyebrow?: string | null;
  title: string | null;
  content: string;
  callAndResponseLines?: { speaker: string; text: string }[] | null;
};

// Visual-only / non-spoken slides — no audio, so they get no timestamp.
const SILENT_TYPES = new Set<string>([
  "office_intro", "intercessions", "intercessions_portal",
  "psalm_title", "canticle_title", "lesson_title",
]);
// The scripture lessons — read aloud, but the text isn't in the slide.
const LESSON_TYPES = new Set<string>(["lesson", "lesson_verses"]);

const WORDS_PER_SECOND = 2.4; // ~145 wpm — unhurried liturgical reading
const SECONDS_PER_VERSE = 12; // rough spoken length of one Bible verse
const MATCH_THRESHOLD = 0.5;

function anchorText(s: OfficeSlideLite): string {
  if (s.callAndResponseLines && s.callAndResponseLines.length > 0) {
    return s.callAndResponseLines.map((l) => l.text).join(" ");
  }
  return s.content || s.title || "";
}

function normWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^\d+$/.test(w));
}

// Estimate how long the reader spends on a lesson from its reference's verse
// span (e.g. "Matt. 13:31-35" → 5 verses). Falls back to a middling guess.
function lessonSeconds(reference: string): number {
  const m = reference.match(/(\d+)\s*[-–—]\s*(\d+)\s*$/);
  if (m) {
    const span = Math.abs(parseInt(m[2], 10) - parseInt(m[1], 10)) + 1;
    if (span > 0 && span < 200) return Math.max(20, span * SECONDS_PER_VERSE);
  }
  return 50;
}

type Section = {
  id: string;
  type: string;
  title: string | null;
  hint: string; // shown to the recogniser; also fuzzy-matched by the heuristic
  weight: number; // estimated spoken seconds
  isLesson: boolean;
};

// Every spoken slide, in order, with a recognition hint + an estimated spoken
// length. Lessons carry their eyebrow + reference as the hint so the
// recogniser can find the announcement/reading in the transcript.
export function buildSections(slides: OfficeSlideLite[]): Section[] {
  const out: Section[] = [];
  for (const s of slides) {
    if (SILENT_TYPES.has(s.type)) continue;
    if (LESSON_TYPES.has(s.type)) {
      const ref = (s.title ?? s.content ?? "").trim();
      const label = (s.eyebrow ?? "A reading").trim();
      out.push({
        id: s.id,
        type: "lesson",
        title: ref || s.title,
        hint: `${label} — a reading from ${ref}`.trim(),
        weight: lessonSeconds(ref),
        isLesson: true,
      });
      continue;
    }
    const words = normWords(anchorText(s));
    if (words.length < 2) continue;
    out.push({
      id: s.id,
      type: s.type,
      title: s.title,
      hint: words.slice(0, 18).join(" "),
      weight: Math.max(2, words.length / WORDS_PER_SECOND),
      isLesson: false,
    });
  }
  return out;
}

// Back-compat name.
export function locatableSections(slides: OfficeSlideLite[]): Section[] {
  return buildSections(slides);
}

// ── Recognition: heuristic (no LLM) ────────────────────────────────────────

type Tok = { w: string; t: number };
type Located = Map<string, { start: number; confidence: number }>;

function transcriptTokens(transcript: Transcript): Tok[] {
  const toks: Tok[] = [];
  for (const seg of transcript.segments) {
    const ws = normWords(seg.text);
    if (ws.length === 0) continue;
    const span = Math.max(0.001, seg.end - seg.start);
    for (let i = 0; i < ws.length; i++) {
      toks.push({ w: ws[i], t: seg.start + (span * i) / ws.length });
    }
  }
  return toks;
}

function bestMatch(anchor: string[], toks: Tok[], from: number): { idx: number; score: number } {
  const A = anchor.slice(0, 8);
  if (A.length < 2) return { idx: -1, score: 0 };
  const win = A.length + Math.max(4, Math.ceil(A.length * 0.7));
  let best = { idx: -1, score: 0 };
  for (let p = from; p < toks.length; p++) {
    let ai = 0;
    let matched = 0;
    const end = Math.min(toks.length, p + win);
    for (let q = p; q < end && ai < A.length; q++) {
      if (toks[q].w === A[ai]) { matched++; ai++; }
      else if (ai + 1 < A.length && toks[q].w === A[ai + 1]) { matched++; ai += 2; }
    }
    const score = matched / A.length;
    if (score > best.score) {
      best = { idx: p, score };
      if (score >= 0.999) break;
    }
  }
  return best;
}

function locateHeuristic(sections: Section[], transcript: Transcript): Located {
  const toks = transcriptTokens(transcript);
  const located: Located = new Map();
  let cursor = 0;
  for (const sec of sections) {
    const m = bestMatch(normWords(sec.hint), toks, cursor);
    if (m.idx >= 0 && m.score >= MATCH_THRESHOLD) {
      located.set(sec.id, { start: round1(toks[m.idx].t), confidence: round2(m.score) });
      cursor = m.idx + 1; // monotonic — the office is read in order
    }
  }
  return located;
}

// ── Recognition: OpenAI chat model ─────────────────────────────────────────

async function locateOpenAI(sections: Section[], transcript: Transcript): Promise<Located | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OFFICE_ALIGN_MODEL || "gpt-4o-mini";

  const outline = sections
    .map((s, i) => `${i + 1}. id=${s.id} | ${s.isLesson ? "LESSON" : s.type} | ${s.title ?? ""} | ${s.hint}`)
    .join("\n");
  const tx = transcript.segments.map((seg) => `[${seg.start.toFixed(1)}] ${seg.text}`).join("\n");

  const system =
    "You align a spoken Daily Office (Morning or Evening Prayer) to its written structure.\n" +
    "You get (A) the office's SECTIONS in order — each with an id, a type, a title, and a hint — and (B) a TRANSCRIPT whose every line starts with a timestamp in seconds like \"[83.4] ...\".\n" +
    "Most sections are fixed liturgical text (psalm verses, the Gloria \"Glory to the Father...\", canticles, the Apostles' Creed, the Lord's Prayer, suffrages, collects, the General Thanksgiving) — locate each by matching its words in the transcript.\n" +
    "LESSON sections are different: the slide has NO scripture text, only a reference like \"Matt. 13:31-35\", because the reader reads the passage aloud from a Bible. Recognise a lesson in the transcript by (a) its spoken announcement — e.g. \"A Reading from the Gospel according to Matthew\", \"The First Lesson\", \"A reading from Isaiah\", \"Here begins...\" — or (b) the opening words of that book/chapter. Use the reference's book + chapter to confirm, and return the timestamp where the announcement (or the reading's first words) begins.\n" +
    "Sections occur strictly in order, so start times must increase. Match on meaning, not exact words (different translations, paraphrase, spoken framing are expected). Omit a section only if you truly cannot find it.\n" +
    "Respond with ONLY a JSON object: {\"sections\":[{\"id\":\"<section id>\",\"startSeconds\":<number>,\"confidence\":<0..1>}]}";
  const user = `SECTIONS:\n${outline}\n\nTRANSCRIPT:\n${tx}`;

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
    console.warn(`[office-align] OpenAI alignment ${res.status}: ${body.slice(0, 200)}`);
    return null;
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = extractJson(data.choices?.[0]?.message?.content ?? "");
  if (!parsed || !Array.isArray(parsed.sections)) return null;

  const ids = new Set(sections.map((s) => s.id));
  const located: Located = new Map();
  for (const item of parsed.sections as Array<{ id?: unknown; startSeconds?: unknown; confidence?: unknown }>) {
    if (!item || typeof item.id !== "string" || typeof item.startSeconds !== "number") continue;
    if (!ids.has(item.id)) continue;
    located.set(item.id, {
      start: round1(item.startSeconds),
      confidence: typeof item.confidence === "number" ? round2(item.confidence) : 0.8,
    });
  }
  return located;
}

// ── Prediction: place every slide on the timeline ──────────────────────────
//
// Pins the recognised slides, then fills the gaps by liturgical position:
// the slides between two recognised anchors split that span in proportion to
// their estimated spoken length, so a lesson lands where the order demands.
function buildTimeline(
  sections: Section[],
  located: Located,
  duration: number,
): OfficeAlignmentSection[] {
  const n = sections.length;
  const start: (number | null)[] = new Array(n).fill(null);
  const conf: number[] = new Array(n).fill(0);
  const predicted: boolean[] = new Array(n).fill(false);

  // Assign recognised starts, keeping them strictly increasing (drop any that
  // would go backwards — the office is read in order).
  let lastT = -1;
  for (let i = 0; i < n; i++) {
    const l = located.get(sections[i].id);
    if (l && l.start > lastT) {
      start[i] = l.start;
      conf[i] = l.confidence;
      lastT = l.start;
    }
  }

  // Anchor points, bracketed by a virtual start (0) and end (duration).
  const anchored: number[] = [];
  for (let i = 0; i < n; i++) if (start[i] !== null) anchored.push(i);
  const lastAnchorT = anchored.length ? (start[anchored[anchored.length - 1]] as number) : 0;
  const endT = duration > lastAnchorT ? duration : lastAnchorT;
  const points = [
    { idx: -1, t: 0 },
    ...anchored.map((i) => ({ idx: i, t: start[i] as number })),
    { idx: n, t: endT },
  ];

  for (let p = 0; p < points.length - 1; p++) {
    const a = points[p];
    const b = points[p + 1];
    const lo = a.idx + 1;
    const hi = b.idx - 1;
    if (hi < lo) continue;
    // Start distributing once the preceding anchor has finished being read.
    const cursor = a.t + (a.idx >= 0 ? sections[a.idx].weight : 0);
    const span = Math.max(0, b.t - cursor);
    let totalW = 0;
    for (let k = lo; k <= hi; k++) totalW += sections[k].weight;
    let acc = 0;
    for (let k = lo; k <= hi; k++) {
      start[k] = round1(cursor + (totalW > 0 ? (acc / totalW) * span : 0));
      acc += sections[k].weight;
      predicted[k] = true;
      conf[k] = 0.4;
    }
  }

  const out: OfficeAlignmentSection[] = sections.map((s, i) => ({
    id: s.id,
    type: s.type,
    title: s.title,
    startSeconds: start[i] ?? (i > 0 ? (start[i - 1] ?? 0) : 0),
    endSeconds: null,
    confidence: conf[i] || 0.4,
    predicted: predicted[i] ? true : undefined,
  }));
  // Guarantee non-decreasing starts after rounding.
  for (let i = 1; i < out.length; i++) {
    if (out[i].startSeconds < out[i - 1].startSeconds) out[i].startSeconds = out[i - 1].startSeconds;
  }
  fillEnds(out);
  return out;
}

// Recognise with the LLM (falling back to the heuristic), then predict the
// rest by liturgical position. Always returns a per-slide timeline.
export async function alignOffice(
  slides: OfficeSlideLite[],
  transcript: Transcript,
): Promise<{ sections: OfficeAlignmentSection[]; aligner: string }> {
  const sections = buildSections(slides);
  if (sections.length === 0) return { sections: [], aligner: "none" };

  let located: Located | null = null;
  let aligner = "heuristic";
  try {
    const llm = await locateOpenAI(sections, transcript);
    if (llm && llm.size > 0) {
      located = llm;
      aligner = "openai";
    }
  } catch (e) {
    console.warn("[office-align] OpenAI alignment failed, falling back to heuristic:", e);
  }
  if (!located) located = locateHeuristic(sections, transcript);

  const timeline = buildTimeline(sections, located, transcript.durationSeconds);
  return { sections: timeline, aligner };
}

function fillEnds(secs: OfficeAlignmentSection[]): void {
  for (let i = 0; i < secs.length; i++) {
    secs[i].endSeconds = i + 1 < secs.length ? secs[i + 1].startSeconds : null;
  }
}
function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }

function extractJson(text: string): { sections?: unknown } | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1)) as { sections?: unknown };
  } catch {
    return null;
  }
}
