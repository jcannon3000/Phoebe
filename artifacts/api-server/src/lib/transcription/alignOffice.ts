// ── Office ↔ audio alignment ───────────────────────────────────────────────
//
// Given the office the app assembled for a day (an ordered list of slides)
// and a timestamped transcript of that day's spoken office, work out the
// start time of each part of the office.
//
// Two aligners:
//   • alignWithClaude — the smart path. Hands Claude the office outline +
//     the timestamped transcript and lets it reason about where each section
//     begins. Robust to paraphrase, different psalm/Bible translations, and
//     the reader's spoken framing ("Let us confess our sins", "Here begins
//     the first lesson"). Uses the existing @workspace/integrations-anthropic-ai
//     client; inert when that integration isn't provisioned.
//   • alignWithHeuristic — a no-LLM fallback. Monotonic fuzzy search of each
//     section's opening words against the transcript token stream. Reliable
//     for the fixed liturgical texts; less so for the variable psalms/lessons.
//
// alignOffice() prefers Claude and falls back to the heuristic, so the
// pipeline always produces something.

import type { OfficeAlignmentSection } from "@workspace/db";
import type { Transcript } from "./transcribeAudio";

type OfficeSlideLite = {
  id: string;
  type: string;
  title: string | null;
  content: string;
  callAndResponseLines?: { speaker: string; text: string }[] | null;
};

// Slide types that mark a clear, nameable boundary in the spoken office —
// the chapters worth jumping to. Psalms/lessons vary daily; the canticles,
// creed, prayers, and thanksgiving are fixed wording — all good landmarks.
const ANCHOR_TYPES = new Set<string>([
  "opening_sentence", "confession", "absolution", "invitatory",
  "invitatory_psalm", "psalm_title", "psalm", "lesson_title", "lesson",
  "canticle_title", "canticle", "creed", "lords_prayer", "suffrages",
  "collect", "prayer_for_mission", "general_thanksgiving", "closing",
]);

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

export type LocatableSection = { id: string; type: string; title: string | null; snippet: string };

// The compact "sections to find" list handed to both aligners — anchorable
// slides, each with the first ~16 significant words of its written text.
export function locatableSections(slides: OfficeSlideLite[]): LocatableSection[] {
  const out: LocatableSection[] = [];
  for (const s of slides) {
    if (!ANCHOR_TYPES.has(s.type)) continue;
    const words = normWords(anchorText(s));
    if (words.length < 2) continue;
    out.push({ id: s.id, type: s.type, title: s.title, snippet: words.slice(0, 16).join(" ") });
  }
  return out;
}

// ── Heuristic aligner (no LLM) ─────────────────────────────────────────────

type Tok = { w: string; t: number };

function transcriptTokens(transcript: Transcript): Tok[] {
  const toks: Tok[] = [];
  for (const seg of transcript.segments) {
    const ws = normWords(seg.text);
    if (ws.length === 0) continue;
    const span = Math.max(0.001, seg.end - seg.start);
    // Spread each token's time linearly across its segment so a match part-
    // way through a long segment lands at roughly the right second.
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
      else if (ai + 1 < A.length && toks[q].w === A[ai + 1]) { matched++; ai += 2; } // tolerate 1 skip
    }
    const score = matched / A.length;
    if (score > best.score) {
      best = { idx: p, score };
      if (score >= 0.999) break;
    }
  }
  return best;
}

export function alignWithHeuristic(slides: OfficeSlideLite[], transcript: Transcript): OfficeAlignmentSection[] {
  const toks = transcriptTokens(transcript);
  const secs = locatableSections(slides);
  const out: OfficeAlignmentSection[] = [];
  let cursor = 0;
  const THRESHOLD = 0.5;
  for (const sec of secs) {
    const m = bestMatch(normWords(sec.snippet), toks, cursor);
    if (m.idx >= 0 && m.score >= THRESHOLD) {
      out.push({
        id: sec.id, type: sec.type, title: sec.title,
        startSeconds: round1(toks[m.idx].t), endSeconds: null, confidence: round2(m.score),
      });
      cursor = m.idx + 1; // monotonic — the office is read in order
    }
  }
  fillEnds(out);
  return out;
}

// ── Claude aligner ─────────────────────────────────────────────────────────

function claudeEnabled(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY &&
      process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  );
}

export async function alignWithClaude(
  slides: OfficeSlideLite[],
  transcript: Transcript,
): Promise<OfficeAlignmentSection[] | null> {
  // Guard on the env BEFORE importing — the client module throws at load
  // time when the integration isn't provisioned, so a bare import would
  // crash callers. With the env unset we just bow out and let the caller
  // fall back to the heuristic.
  if (!claudeEnabled()) return null;
  let anthropic;
  try {
    ({ anthropic } = await import("@workspace/integrations-anthropic-ai"));
  } catch (e) {
    console.warn("[office-align] anthropic client unavailable:", e);
    return null;
  }

  const secs = locatableSections(slides);
  if (secs.length === 0) return [];
  const model = process.env.OFFICE_ALIGN_MODEL || "claude-sonnet-4-6";

  const outline = secs
    .map((s, i) => `${i + 1}. id=${s.id} | ${s.type} | ${s.title ?? ""} | "${s.snippet}"`)
    .join("\n");
  const tx = transcript.segments.map((seg) => `[${seg.start.toFixed(1)}] ${seg.text}`).join("\n");

  // Static instructions get cache_control so repeated daily runs reuse the
  // cached system prompt (the per-episode transcript is the only varying part).
  const system = [
    {
      type: "text" as const,
      text:
        "You align a spoken Daily Office (Morning or Evening Prayer) recording to its written structure.\n" +
        "You are given (A) an ordered list of office SECTIONS — each with an id, a type, a title, and the opening words of its written text — and (B) a TRANSCRIPT of the recording where every line is prefixed with its start time in seconds, like \"[83.4] text...\".\n" +
        "For each section you can confidently locate, return the start time in seconds, copied from the transcript line where that section begins. Sections occur in order, so their start times must be strictly increasing. Match on meaning, not exact words: the reader may paraphrase, use a different psalm or Bible translation, or add framing such as \"Let us confess our sins\" or \"Here begins the first lesson\". If you genuinely cannot find a section, omit it.\n" +
        "Respond with ONLY a JSON object and no other prose: {\"sections\":[{\"id\":\"<section id>\",\"startSeconds\":<number>,\"confidence\":<0..1>}]}",
      cache_control: { type: "ephemeral" as const },
    },
  ];
  const user = `SECTIONS:\n${outline}\n\nTRANSCRIPT:\n${tx}`;

  const resp = await anthropic.messages.create({
    model,
    max_tokens: 2048,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const parsed = extractJson(text);
  if (!parsed || !Array.isArray(parsed.sections)) return null;

  const byId = new Map(secs.map((s) => [s.id, s]));
  const out: OfficeAlignmentSection[] = [];
  let lastT = -1;
  for (const item of parsed.sections as Array<{ id?: unknown; startSeconds?: unknown; confidence?: unknown }>) {
    if (!item || typeof item.id !== "string" || typeof item.startSeconds !== "number") continue;
    const sec = byId.get(item.id);
    if (!sec) continue;
    if (item.startSeconds <= lastT) continue; // keep timestamps strictly increasing
    lastT = item.startSeconds;
    out.push({
      id: sec.id, type: sec.type, title: sec.title,
      startSeconds: round1(item.startSeconds),
      endSeconds: null,
      confidence: typeof item.confidence === "number" ? round2(item.confidence) : 0.8,
    });
  }
  fillEnds(out);
  return out;
}

// Prefer Claude; fall back to the heuristic so the pipeline always yields
// something even when the Anthropic integration isn't provisioned.
export async function alignOffice(
  slides: OfficeSlideLite[],
  transcript: Transcript,
): Promise<{ sections: OfficeAlignmentSection[]; aligner: string }> {
  try {
    const viaClaude = await alignWithClaude(slides, transcript);
    if (viaClaude && viaClaude.length > 0) return { sections: viaClaude, aligner: "claude" };
  } catch (e) {
    console.warn("[office-align] claude alignment failed, falling back to heuristic:", e);
  }
  return { sections: alignWithHeuristic(slides, transcript), aligner: "heuristic" };
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
