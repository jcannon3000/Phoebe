// ── Scripture Day by Day alignment orchestrator ────────────────────────────
//
// Ties the pieces together for one "Scripture Day by Day" episode:
//   1. resolve today's episode (audio url + guid + description) from the feed
//   2. parse the four readings from the episode description  — scriptureReadings
//   3. transcribe the audio (Whisper)                        — transcribeAudio
//   4. flag where each reading begins                        — alignScripture
//   5. upsert the result into office_audio_alignments (show "scripture")
//
// Reuses the generic office_audio_alignments table (keyed by show + source +
// episode_date) with show="scripture", source="scripture-day-by-day" — no new
// table, so no migration.
//
// Idempotent: a finished alignment for the same episode guid is reused unless
// `force` is passed. Degrades gracefully — if transcription isn't provisioned
// it records a "pending" row and reports "skipped" rather than throwing.

import { db, officeAudioAlignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { SHOWS, loadFeed } from "../../routes/podcast";
import { transcribeAudio, transcriptionEnabled } from "./transcribeAudio";
import { parseScriptureReadings, type ScriptureReading } from "./scriptureReadings";
import { alignScripture } from "./alignScripture";
import type { OfficeAlignmentSection } from "@workspace/db";

export const SCRIPTURE_SHOW = "scripture";
export const SCRIPTURE_SOURCE = "scripture-day-by-day";

export type ScriptureAlignmentResult = {
  episodeDate: string;
  status: "done" | "failed" | "skipped";
  aligner?: string;
  cached?: boolean;
  durationSeconds?: number | null;
  readings?: ScriptureReading[];
  sections?: OfficeAlignmentSection[];
  reason?: string;
  error?: string;
};

export async function buildScriptureAlignment(opts: {
  date?: Date;
  force?: boolean;
} = {}): Promise<ScriptureAlignmentResult> {
  const date = opts.date ?? new Date();
  const episodeDate = date.toISOString().slice(0, 10);

  const [existing] = await db
    .select()
    .from(officeAudioAlignmentsTable)
    .where(
      and(
        eq(officeAudioAlignmentsTable.show, SCRIPTURE_SHOW),
        eq(officeAudioAlignmentsTable.source, SCRIPTURE_SOURCE),
        eq(officeAudioAlignmentsTable.episodeDate, episodeDate),
      ),
    );

  const showMeta = SHOWS[SCRIPTURE_SOURCE];
  if (!showMeta) throw new Error(`unknown show: ${SCRIPTURE_SOURCE}`);
  const feed = await loadFeed(showMeta, 1);
  const ep = feed.episodes[0];
  const audioUrl = ep?.audioUrl ?? null;
  const guid = ep?.id ?? audioUrl ?? null;
  const readings = parseScriptureReadings(ep?.description);

  // Don't file a STALE episode under today's date. The feed's newest episode is
  // "today's" only after it publishes (~06:30 each morning); before that, the
  // newest is YESTERDAY's. Aligning then would store yesterday's segments under
  // today's date — and because the read re-parses readings fresh from the feed,
  // they'd never match the stored segments, so no Listen pill ever shows. When
  // running for the current day, wait until today's episode is actually up.
  // (A backfill for a past date — opts.date — is exempt; it intentionally aligns
  // whatever the feed currently carries.)
  const actualToday = new Date().toISOString().slice(0, 10);
  const epDate = ep?.publishedAt ? new Date(ep.publishedAt).toISOString().slice(0, 10) : null;
  if (episodeDate === actualToday && epDate && epDate < episodeDate) {
    return { episodeDate, status: "skipped", reason: `today's episode hasn't published yet (newest is dated ${epDate})`, readings };
  }

  // Already aligned this exact episode → reuse.
  if (existing && existing.status === "done" && existing.episodeGuid === guid && !opts.force) {
    return {
      episodeDate,
      status: "done",
      cached: true,
      aligner: existing.aligner ?? undefined,
      durationSeconds: existing.durationSeconds,
      sections: existing.sections ?? [],
      readings,
    };
  }

  const save = async (patch: Partial<typeof officeAudioAlignmentsTable.$inferInsert>) => {
    if (existing) {
      await db
        .update(officeAudioAlignmentsTable)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(officeAudioAlignmentsTable.id, existing.id));
    } else {
      await db.insert(officeAudioAlignmentsTable).values({
        show: SCRIPTURE_SHOW,
        source: SCRIPTURE_SOURCE,
        episodeDate,
        audioUrl,
        episodeGuid: guid,
        ...patch,
      });
    }
  };

  if (!audioUrl) {
    await save({ status: "failed", episodeGuid: guid, error: "no audio url for today's episode" });
    return { episodeDate, status: "failed", error: "no audio url" };
  }
  if (readings.length === 0) {
    await save({ status: "failed", audioUrl, episodeGuid: guid, error: "no readings parsed from episode description" });
    return { episodeDate, status: "failed", error: "no readings parsed from episode description" };
  }
  if (!transcriptionEnabled()) {
    await save({ status: "pending", audioUrl, episodeGuid: guid, error: null });
    return { episodeDate, status: "skipped", reason: "transcription disabled — set OPENAI_API_KEY to enable", readings };
  }

  try {
    const transcript = await transcribeAudio(audioUrl);
    if (!transcript) {
      await save({ status: "pending", audioUrl, episodeGuid: guid });
      return { episodeDate, status: "skipped", reason: "transcription disabled", readings };
    }

    const { sections, aligner } = await alignScripture(readings, transcript);
    const durationSeconds = Math.round(transcript.durationSeconds);

    await save({
      status: "done",
      audioUrl,
      episodeGuid: guid,
      durationSeconds,
      sections,
      aligner,
      error: null,
    });
    return { episodeDate, status: "done", aligner, durationSeconds, sections, readings };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[scripture-align] ${episodeDate} failed:`, msg);
    await save({ status: "failed", audioUrl, episodeGuid: guid, error: msg });
    return { episodeDate, status: "failed", error: msg };
  }
}
