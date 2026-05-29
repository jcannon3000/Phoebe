// ── Office alignment orchestrator ──────────────────────────────────────────
//
// Ties the pieces together for one office on one day:
//   1. resolve today's episode (audio url + guid) from the podcast feed
//   2. transcribe the audio (Whisper)            — transcribeAudio.ts
//   3. assemble the office the app shows that day — assembleX
//   4. align the transcript to the office        — alignOffice.ts (Claude → heuristic)
//   5. upsert the result into office_audio_alignments
//
// Idempotent: a finished alignment for the same episode guid is reused unless
// `force` is passed. Degrades gracefully — if transcription isn't provisioned
// it records a "pending" row and reports "skipped" rather than throwing.

import { db, officeAudioAlignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { assembleMorningPrayer } from "../assembleMorningPrayer";
import { assembleEveningPrayer } from "../assembleEveningPrayer";
import { SHOWS, loadFeed } from "../../routes/podcast";
import { transcribeAudio, transcriptionEnabled } from "./transcribeAudio";
import { alignOffice } from "./alignOffice";
import { analyzeOfficeLiturgicalChoices, type LiturgicalAnalysis } from "./analyzeOfficeLiturgicalChoices";
import type { OfficeAlignmentSection } from "@workspace/db";

export type OfficeShow = "morning-office" | "evening-office";
const SOURCE = "forward-movement";

export type AlignmentResult = {
  show: OfficeShow;
  episodeDate: string;
  status: "done" | "failed" | "skipped";
  aligner?: string;
  cached?: boolean;
  durationSeconds?: number | null;
  sections?: OfficeAlignmentSection[];
  // Liturgical-choices analysis — present when Claude ran the analysis.
  liturgicalAnalysis?: LiturgicalAnalysis;
  reason?: string;
  error?: string;
};

export async function buildOfficeAlignment(opts: {
  show: OfficeShow;
  date?: Date;
  force?: boolean;
}): Promise<AlignmentResult> {
  const date = opts.date ?? new Date();
  const episodeDate = date.toISOString().slice(0, 10);

  const [existing] = await db
    .select()
    .from(officeAudioAlignmentsTable)
    .where(
      and(
        eq(officeAudioAlignmentsTable.show, opts.show),
        eq(officeAudioAlignmentsTable.source, SOURCE),
        eq(officeAudioAlignmentsTable.episodeDate, episodeDate),
      ),
    );

  const show = SHOWS[opts.show];
  if (!show) throw new Error(`unknown office show: ${opts.show}`);
  const feed = await loadFeed(show, 1);
  const ep = feed.episodes[0];
  const audioUrl = ep?.audioUrl ?? null;
  const guid = ep?.id ?? audioUrl ?? null;

  // Already aligned this exact episode → reuse.
  if (existing && existing.status === "done" && existing.episodeGuid === guid && !opts.force) {
    return {
      show: opts.show,
      episodeDate,
      status: "done",
      cached: true,
      aligner: existing.aligner ?? undefined,
      durationSeconds: existing.durationSeconds,
      sections: existing.sections ?? [],
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
        show: opts.show,
        source: SOURCE,
        episodeDate,
        audioUrl,
        episodeGuid: guid,
        ...patch,
      });
    }
  };

  if (!audioUrl) {
    await save({ status: "failed", episodeGuid: guid, error: "no audio url for today's episode" });
    return { show: opts.show, episodeDate, status: "failed", error: "no audio url" };
  }

  if (!transcriptionEnabled()) {
    await save({ status: "pending", audioUrl, episodeGuid: guid, error: null });
    return {
      show: opts.show,
      episodeDate,
      status: "skipped",
      reason: "transcription disabled — set OPENAI_API_KEY to enable",
    };
  }

  try {
    const transcript = await transcribeAudio(audioUrl);
    if (!transcript) {
      await save({ status: "pending", audioUrl, episodeGuid: guid });
      return { show: opts.show, episodeDate, status: "skipped", reason: "transcription disabled" };
    }

    const { slides } =
      opts.show === "morning-office"
        ? await assembleMorningPrayer(date, 0)
        : await assembleEveningPrayer(date, 0);

    const { sections, aligner } = await alignOffice(slides, transcript);
    const durationSeconds = Math.round(transcript.durationSeconds);

    // Run liturgical-choices analysis in parallel with the DB save.
    // Non-fatal: a failed analysis still lets the alignment succeed.
    const office: "morning" | "evening" = opts.show === "morning-office" ? "morning" : "evening";
    const liturgicalAnalysis = await analyzeOfficeLiturgicalChoices({
      transcript,
      slides,
      office,
      episodeDate,
    }).catch((err) => {
      console.warn("[office-align] liturgical analysis failed:", err);
      return undefined;
    });

    await save({
      status: "done",
      audioUrl,
      episodeGuid: guid,
      durationSeconds,
      sections,
      aligner,
      error: null,
    });
    return { show: opts.show, episodeDate, status: "done", aligner, durationSeconds, sections, liturgicalAnalysis };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[office-align] ${opts.show} ${episodeDate} failed:`, msg);
    await save({ status: "failed", audioUrl, episodeGuid: guid, error: msg });
    return { show: opts.show, episodeDate, status: "failed", error: msg };
  }
}
