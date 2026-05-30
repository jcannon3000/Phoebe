import { Router, type IRouter, type Request, type Response } from "express";
import { db, officeAudioAlignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { buildOfficeAlignment, type OfficeShow } from "../lib/transcription/buildOfficeAlignment";
import { triggerOnce } from "../lib/transcription/alignInFlight";
import { assembleMorningPrayer } from "../lib/assembleMorningPrayer";
import { assembleEveningPrayer } from "../lib/assembleEveningPrayer";
import { SHOWS, loadFeed } from "./podcast";
import { transcribeAudio, transcriptionEnabled } from "../lib/transcription/transcribeAudio";
import { analyzeOfficeLiturgicalChoices } from "../lib/transcription/analyzeOfficeLiturgicalChoices";

// ── Office audio timestamps + liturgical analysis ─────────────────────────
//
//   GET  /api/podcast/office/:side/timestamps?date=YYYY-MM-DD   — public read
//   POST /api/podcast/office/:side/align                        — internal trigger
//   GET  /api/podcast/office/:side/liturgical-analysis?date=…   — internal, INTERNAL_API_KEY
//
// :side is "morning" | "evening". The GET timestamps serves stored data
// (empty sections until aligned). The POST align pipeline runs transcribe +
// align + liturgical analysis. The GET liturgical-analysis transcribes
// on-demand and returns Claude's report of how FM programmed their office
// and where it diverges from Phoebe's assembly — used by developers to
// keep Phoebe's assembly in sync with Forward Movement's choices.

const router: IRouter = Router();
const SOURCE = "forward-movement";
const SIDE_TO_SHOW: Record<string, OfficeShow> = {
  morning: "morning-office",
  evening: "evening-office",
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get("/podcast/office/:side/timestamps", async (req: Request, res: Response): Promise<void> => {
  const show = SIDE_TO_SHOW[String(req.params.side)];
  if (!show) {
    res.status(404).json({ error: "unknown side (use morning|evening)" });
    return;
  }
  const q = req.query.date;
  const episodeDate = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayYmd();

  const [row] = await db
    .select()
    .from(officeAudioAlignmentsTable)
    .where(
      and(
        eq(officeAudioAlignmentsTable.show, show),
        eq(officeAudioAlignmentsTable.source, SOURCE),
        eq(officeAudioAlignmentsTable.episodeDate, episodeDate),
      ),
    );

  if (!row || row.status !== "done") {
    const status = row?.status ?? "none";
    // On-demand fallback: with no worker computing alignments, the first
    // open of the read-along kicks off the transcribe+align in the
    // background (guarded so repeated polls don't duplicate it) and the
    // client polls until it flips to "done". Only for today's episode, and
    // not when a prior attempt already "failed" (avoid a retry/cost loop —
    // those need the explicit POST /align with force).
    if ((status === "none" || status === "pending") && episodeDate === todayYmd()) {
      triggerOnce(`office:${show}:${episodeDate}`, () => buildOfficeAlignment({ show }));
      res.json({ show, episodeDate, status: "building", sections: [] });
      return;
    }
    res.json({ show, episodeDate, status, sections: [] });
    return;
  }
  // Aligned episodes are stable for the day — let clients cache them.
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    show,
    episodeDate,
    status: row.status,
    aligner: row.aligner,
    durationSeconds: row.durationSeconds,
    sections: row.sections ?? [],
  });
});

router.post("/podcast/office/:side/align", async (req: Request, res: Response): Promise<void> => {
  const internalKey = req.headers["x-internal-key"];
  if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const show = SIDE_TO_SHOW[String(req.params.side)];
  if (!show) {
    res.status(404).json({ error: "unknown side (use morning|evening)" });
    return;
  }

  let date = new Date();
  if (req.body && typeof req.body.date === "string") {
    const parsed = new Date(req.body.date);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  const force = Boolean(req.body && req.body.force);

  try {
    const result = await buildOfficeAlignment({ show, date, force });
    res.json(result);
  } catch (err) {
    console.error("[office-align] trigger failed:", err);
    res.status(500).json({ error: "alignment failed", detail: String(err) });
  }
});

// GET /api/podcast/office/:side/liturgical-analysis — on-demand analysis
// of how Forward Movement programmed their office vs. Phoebe's assembly.
// Transcribes the most recent episode, then runs the Claude analysis.
// Gated by INTERNAL_API_KEY so only developers/ops can trigger it.
// ?date=YYYY-MM-DD  — optional; defaults to today.
// ?force=1          — re-run even if today's episode was already analyzed.
router.get(
  "/podcast/office/:side/liturgical-analysis",
  async (req: Request, res: Response): Promise<void> => {
    const internalKey = req.headers["x-internal-key"];
    if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const show = SIDE_TO_SHOW[String(req.params.side)];
    if (!show) {
      res.status(404).json({ error: "unknown side (use morning|evening)" });
      return;
    }

    const q = req.query.date;
    const dateStr = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayYmd();
    const date = new Date(`${dateStr}T12:00:00Z`);

    if (!transcriptionEnabled()) {
      res.status(503).json({
        error: "transcription disabled",
        hint: "Set OPENAI_API_KEY to enable Whisper transcription",
      });
      return;
    }

    try {
      // Fetch today's FM episode.
      const showMeta = SHOWS[show];
      if (!showMeta) { res.status(404).json({ error: `unknown show: ${show}` }); return; }
      const feed = await loadFeed(showMeta, 1);
      const ep = feed.episodes[0];
      if (!ep?.audioUrl) {
        res.status(404).json({ error: "no audio url for today's episode" });
        return;
      }

      // Transcribe.
      const transcript = await transcribeAudio(ep.audioUrl);
      if (!transcript) {
        res.status(503).json({ error: "transcription returned null" });
        return;
      }

      // Assemble Phoebe's office for the same date.
      const { slides } =
        show === "morning-office"
          ? await assembleMorningPrayer(date, 0)
          : await assembleEveningPrayer(date, 0);

      // Analyze liturgical choices.
      const office: "morning" | "evening" =
        show === "morning-office" ? "morning" : "evening";
      const analysis = await analyzeOfficeLiturgicalChoices({
        transcript,
        slides,
        office,
        episodeDate: dateStr,
      });

      res.setHeader("Cache-Control", "private, max-age=3600");
      res.json({
        episodeDate: dateStr,
        episodeTitle: ep.title,
        durationSeconds: Math.round(transcript.durationSeconds),
        analysis,
      });
    } catch (err) {
      console.error("[office-align] liturgical-analysis failed:", err);
      res.status(500).json({ error: "analysis failed", detail: String(err) });
    }
  },
);

export default router;
