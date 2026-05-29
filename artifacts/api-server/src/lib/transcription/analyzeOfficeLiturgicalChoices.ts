// ── Liturgical choices analysis ──────────────────────────────────────────────
//
// Given a timestamped transcript of a spoken Daily Office (produced by
// transcribeAudio.ts / Whisper) and the assembled office for the same day
// (produced by assembleMorningPrayer / assembleEveningPrayer), ask Claude
// to reverse-engineer WHICH liturgical variant the reader chose for each
// variable section.
//
// This is used to cross-check Phoebe's assembly against Forward Movement's
// recorded office: if FM's reader prays Canticle 13 (A Song of Praise) but
// Phoebe chose Canticle 12 (A Song of Creation) for the same day, that is a
// divergence worth investigating.
//
// Returns a structured JSON report; the route in office-alignment.ts exposes
// it as GET /api/podcast/office/:side/liturgical-analysis?date=YYYY-MM-DD.
//
// Deliberately separate from alignOffice.ts — alignment = timestamps,
// analysis = liturgical content. Both use Claude but for different tasks.

import type { Transcript } from "./transcribeAudio";

export type LiturgicalChoice = {
  // BCP section name (e.g., "Opening Sentence", "Canticle after OT")
  section: string;
  // What the FM reader actually used (e.g., "Canticle 12: A Song of Creation")
  fmChoice: string;
  // What Phoebe assembled for the same day (from the slide data)
  phoebeChoice: string | null;
  // true when fmChoice ≠ phoebeChoice (note: paraphrase is OK — only flag
  // structural divergences, e.g. different canticle, different suffrage set)
  diverges: boolean;
  // Claude's confidence that it correctly identified the FM choice (0-1)
  confidence: number;
  // Optional note (e.g. "reader added a brief framing sentence before the psalm")
  note?: string;
};

export type LiturgicalAnalysis = {
  office: "morning" | "evening";
  episodeDate: string;
  aligner: "claude" | "unavailable";
  // High-level summary Claude wrote about the service
  summary: string;
  choices: LiturgicalChoice[];
  // Things the reader said that don't appear in Phoebe's assembly at all
  unrecognizedElements: string[];
};

// Derive "what Phoebe chose" for each variable section from the assembled slides.
function phoebeChoicesFromSlides(slides: Array<{ type: string; eyebrow: string; title: string | null; content: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of slides) {
    switch (s.type) {
      case "opening_sentence":
        out["Opening Sentence"] = s.content.slice(0, 80) + (s.content.length > 80 ? "…" : "");
        break;
      case "invitatory":
        // Eyebrow carries the invitatory name, e.g. "VENITE · PSALM 95"
        out["Invitatory"] = s.eyebrow;
        break;
      case "canticle_title": {
        // Map to positional label based on order of appearance
        const canticleKey = s.eyebrow;
        const pos = out["Canticle after OT"] ? "Canticle after Epistle" : "Canticle after OT";
        out[pos] = `${s.title ?? canticleKey} (${canticleKey})`;
        break;
      }
      case "suffrages":
        out["Suffrages"] = s.eyebrow; // e.g. "SUFFRAGES A" or "SUFFRAGES B"
        break;
      case "collect":
        out["Collect of the Day"] = s.title ?? s.content.slice(0, 60) + "…";
        break;
      case "prayer_for_mission":
        out["Prayer for Mission"] = s.content.slice(0, 80) + (s.content.length > 80 ? "…" : "");
        break;
    }
  }
  return out;
}

export async function analyzeOfficeLiturgicalChoices(opts: {
  transcript: Transcript;
  slides: Array<{ type: string; eyebrow: string; title: string | null; content: string }>;
  office: "morning" | "evening";
  episodeDate: string;
}): Promise<LiturgicalAnalysis> {
  const unavailable: LiturgicalAnalysis = {
    office: opts.office,
    episodeDate: opts.episodeDate,
    aligner: "unavailable",
    summary: "Claude integration not configured — set AI_INTEGRATIONS_ANTHROPIC_API_KEY to enable.",
    choices: [],
    unrecognizedElements: [],
  };

  if (!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY) return unavailable;
  let anthropic;
  try {
    ({ anthropic } = await import("@workspace/integrations-anthropic-ai"));
  } catch {
    return unavailable;
  }

  const phoebeChoices = phoebeChoicesFromSlides(opts.slides);

  // Compact the transcript for the prompt — one line per segment.
  const tx = opts.transcript.segments
    .map((seg) => `[${seg.start.toFixed(1)}s] ${seg.text}`)
    .join("\n");

  const phoebeChoicesStr = Object.entries(phoebeChoices)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  const model = process.env.OFFICE_ALIGN_MODEL ?? "claude-sonnet-4-6";

  const system = [
    {
      type: "text" as const,
      text: `You are a liturgical scholar analyzing a recording of Episcopal BCP Rite II ${opts.office === "morning" ? "Morning" : "Evening"} Prayer.

You are given:
A) PHOEBE's assembly for the same day — the specific liturgical variants Phoebe's app chose (opening sentence, canticles, suffrages, collects, prayer for mission).
B) A TRANSCRIPT of Forward Movement's recording of the same office.

Your task: identify which liturgical variant was actually used by the Forward Movement reader for each of the variable sections, compare with what Phoebe assembled, and flag genuine structural divergences (different canticle number, different suffrage set, etc.). Small wording differences from the reader's paraphrase or a different Bible translation for lessons are NOT divergences. Different canticle, different invitatory, or different collect IS a divergence.

Respond with ONLY a JSON object (no prose):
{
  "summary": "2-3 sentence high-level description of the service",
  "choices": [
    {
      "section": "Opening Sentence",
      "fmChoice": "what FM reader used (brief description)",
      "diverges": true/false,
      "confidence": 0.0-1.0,
      "note": "optional extra note"
    }
  ],
  "unrecognizedElements": ["list of phrases the reader said that have no parallel in Phoebe's assembly"]
}

Cover: Opening Sentence, Invitatory, Canticle after OT, Canticle after Epistle (if present), Suffrages, Collect of the Day, Prayer for Mission.`,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const user = `PHOEBE'S CHOICES FOR ${opts.episodeDate}:\n${phoebeChoicesStr}\n\nFORWARD MOVEMENT TRANSCRIPT:\n${tx}`;

  try {
    const resp = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a < 0 || b <= a) throw new Error("No JSON in Claude response");
    const parsed = JSON.parse(text.slice(a, b + 1)) as {
      summary?: string;
      choices?: Array<{
        section?: string;
        fmChoice?: string;
        diverges?: boolean;
        confidence?: number;
        note?: string;
      }>;
      unrecognizedElements?: string[];
    };

    const choices: LiturgicalChoice[] = (parsed.choices ?? []).map((c) => ({
      section: String(c.section ?? ""),
      fmChoice: String(c.fmChoice ?? ""),
      phoebeChoice: phoebeChoices[String(c.section ?? "")] ?? null,
      diverges: Boolean(c.diverges),
      confidence: typeof c.confidence === "number" ? c.confidence : 0.8,
      note: c.note,
    }));

    return {
      office: opts.office,
      episodeDate: opts.episodeDate,
      aligner: "claude",
      summary: String(parsed.summary ?? ""),
      choices,
      unrecognizedElements: (parsed.unrecognizedElements ?? []).map(String),
    };
  } catch (err) {
    console.error("[liturgical-analysis] Claude analysis failed:", err);
    return {
      ...unavailable,
      summary: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
