import { Router, type IRouter, type Request, type Response } from "express";
import { db, officeAudioAlignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { buildOfficeAlignment, type OfficeShow } from "../lib/transcription/buildOfficeAlignment";

// ── Office audio timestamps ────────────────────────────────────────────────
//
//   GET  /api/podcast/office/:side/timestamps?date=YYYY-MM-DD   — public read
//   POST /api/podcast/office/:side/align                        — internal trigger
//
// :side is "morning" | "evening". The GET serves whatever's stored (empty
// sections until an episode has been aligned); the POST runs the transcribe +
// align pipeline for a day and is gated by INTERNAL_API_KEY, so it can be
// driven by a nightly cron the same way /office/morning/prefetch is.

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
    res.json({ show, episodeDate, status: row?.status ?? "none", sections: [] });
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

export default router;
