// ── Forward Day by Day alignment ───────────────────────────────────────────
//
// Finds two timestamps in today's FDD podcast episode so Reflect & Sit can
// skip the intro and the closing donation appeal:
//   scriptureStartSec — where the day's scripture reading begins
//   appealStartSec    — where the donation appeal/outro begins (AFTER the
//                        closing prayer, so the prayer is kept)
//
// Mirrors buildOfficeAlignment but much simpler — FDD has no slide structure,
// so there's no liturgical alignment, just a single focused detection call.
// Reuses transcribeAudio (Whisper) verbatim. Idempotent + degrades gracefully
// (records "pending" when OPENAI_API_KEY is unset, never throws on the path).

import { db, fddAudioMarksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SHOWS, loadFeed } from "../../routes/podcast";
import { transcribeAudio, transcriptionEnabled, type Transcript } from "./transcribeAudio";

export type FddAlignmentResult = {
  episodeDate: string;
  status: "done" | "failed" | "skipped";
  cached?: boolean;
  scriptureStartSec?: number | null;
  appealStartSec?: number | null;
  durationSeconds?: number | null;
  reason?: string;
  error?: string;
};

function extractJson(s: string): Record<string, unknown> | null {
  if (!s) return null;
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* fall through */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; } }
  return null;
}

// Ask an OpenAI chat model to locate the reading start + appeal start from the
// timestamped transcript. Same provider/model knob as the office aligner.
async function detectFddMarks(
  transcript: Transcript,
): Promise<{ scriptureStartSec: number | null; appealStartSec: number | null; detector: string } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = process.env.OFFICE_ALIGN_MODEL || "gpt-4o-mini";
  const duration = Math.round(transcript.durationSeconds);
  const tx = transcript.segments.map((seg) => `[${seg.start.toFixed(1)}] ${seg.text}`).join("\n");

  const system =
    "You analyze an audio episode of the Episcopal daily devotional \"Forward Day by Day\", read aloud.\n" +
    "Its structure is, in order: (1) a short intro / branding, (2) the day's SCRIPTURE READING — a Bible passage, sometimes announced (\"A reading from...\", \"Here begins...\") and sometimes simply begun; you know the Bible, so recognize the passage from its words, (3) a brief MEDITATION reflecting on that passage, (4) a short CLOSING PRAYER (often a collect, or the line beginning \"PRAY\", or \"Lord...\"), then (5) a DONATION APPEAL / outro that asks listeners to support Forward Movement (\"Forward Day by Day is published by Forward Movement\", \"your gift\", \"subscribe\", \"forwardmovement.org\").\n" +
    "You receive a TRANSCRIPT whose every line begins with a timestamp in seconds like \"[83.4] ...\".\n" +
    "Return ONLY a JSON object: {\"scriptureStartSec\": <number>, \"appealStartSec\": <number|null>}.\n" +
    "scriptureStartSec = the timestamp where the scripture reading begins (i.e. the end of the intro).\n" +
    "appealStartSec = the timestamp where the donation appeal/outro begins, AFTER the closing prayer. The closing prayer must remain BEFORE appealStartSec (do not cut the prayer). If there is no donation appeal, set appealStartSec to null.";
  const user = `AUDIO DURATION (seconds): ${duration}\n\nTRANSCRIPT:\n${tx}`;

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
    console.warn(`[fdd-align] OpenAI ${res.status}: ${body.slice(0, 200)}`);
    return null;
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const parsed = extractJson(data.choices?.[0]?.message?.content ?? "");
  if (!parsed) return null;

  const clamp = (n: unknown): number | null =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), duration) : null;
  const scriptureStartSec = clamp(parsed.scriptureStartSec);
  let appealStartSec = clamp(parsed.appealStartSec);
  // Sanity: the appeal must come after the reading; otherwise ignore it
  // (play through to the natural end rather than cutting too early).
  if (scriptureStartSec != null && appealStartSec != null && appealStartSec <= scriptureStartSec) {
    appealStartSec = null;
  }
  return { scriptureStartSec, appealStartSec, detector: `openai:${model}` };
}

export async function buildFddAlignment(opts: { date?: Date; force?: boolean } = {}): Promise<FddAlignmentResult> {
  const date = opts.date ?? new Date();
  const episodeDate = date.toISOString().slice(0, 10);

  const [existing] = await db
    .select()
    .from(fddAudioMarksTable)
    .where(eq(fddAudioMarksTable.episodeDate, episodeDate));

  const show = SHOWS["forward-day-by-day"];
  if (!show) return { episodeDate, status: "failed", error: "forward-day-by-day show not registered" };

  const feed = await loadFeed(show, 1);
  const ep = feed.episodes[0];
  const audioUrl = ep?.audioUrl ?? null;
  const guid = ep?.id ?? audioUrl ?? null;

  // Already analyzed this exact episode → reuse.
  if (existing && existing.status === "done" && existing.episodeGuid === guid && !opts.force) {
    return {
      episodeDate,
      status: "done",
      cached: true,
      scriptureStartSec: existing.scriptureStartSec,
      appealStartSec: existing.appealStartSec,
      durationSeconds: existing.durationSeconds,
    };
  }

  const save = async (patch: Partial<typeof fddAudioMarksTable.$inferInsert>) => {
    if (existing) {
      await db
        .update(fddAudioMarksTable)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(fddAudioMarksTable.id, existing.id));
    } else {
      await db.insert(fddAudioMarksTable).values({ episodeDate, audioUrl, episodeGuid: guid, ...patch });
    }
  };

  if (!audioUrl) {
    await save({ status: "failed", episodeGuid: guid, error: "no audio url for today's episode" });
    return { episodeDate, status: "failed", error: "no audio url" };
  }

  if (!transcriptionEnabled()) {
    await save({ status: "pending", audioUrl, episodeGuid: guid, error: null });
    return { episodeDate, status: "skipped", reason: "transcription disabled — set OPENAI_API_KEY to enable" };
  }

  try {
    const transcript = await transcribeAudio(audioUrl);
    if (!transcript) {
      await save({ status: "pending", audioUrl, episodeGuid: guid });
      return { episodeDate, status: "skipped", reason: "transcription disabled" };
    }
    const durationSeconds = Math.round(transcript.durationSeconds);
    const marks = await detectFddMarks(transcript);
    if (!marks || marks.scriptureStartSec == null) {
      await save({ status: "failed", audioUrl, episodeGuid: guid, durationSeconds, error: "could not detect scripture start" });
      return { episodeDate, status: "failed", error: "no scripture start detected", durationSeconds };
    }
    await save({
      status: "done",
      audioUrl,
      episodeGuid: guid,
      durationSeconds,
      scriptureStartSec: marks.scriptureStartSec,
      appealStartSec: marks.appealStartSec,
      detector: marks.detector,
      error: null,
    });
    return {
      episodeDate,
      status: "done",
      scriptureStartSec: marks.scriptureStartSec,
      appealStartSec: marks.appealStartSec,
      durationSeconds,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[fdd-align] ${episodeDate} failed:`, msg);
    await save({ status: "failed", audioUrl, episodeGuid: guid, error: msg });
    return { episodeDate, status: "failed", error: msg };
  }
}
