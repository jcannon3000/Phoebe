import { Router, type IRouter, type Request, type Response } from "express";
import { db, officeAudioAlignmentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  buildScriptureAlignment,
  SCRIPTURE_SHOW,
  SCRIPTURE_SOURCE,
} from "../lib/transcription/buildScriptureAlignment";
import { parseScriptureReadings } from "../lib/transcription/scriptureReadings";
import { triggerOnce } from "../lib/transcription/alignInFlight";
import { SHOWS, loadFeed } from "./podcast";

// ── Scripture Day by Day audio timestamps ──────────────────────────────────
//
//   GET  /api/podcast/scripture/timestamps?date=YYYY-MM-DD   — public read
//   POST /api/podcast/scripture/align                        — internal trigger
//
// The GET serves the stored per-reading timeline (OT, Psalm, NT, Gospel start
// times), plus the day's four citations parsed straight from the feed — so the
// client has the readings immediately, even while the audio is still aligning.
// First open of today's episode kicks off transcribe + align in the background
// (guarded against duplicate runs) and the client polls until status="done".

const router: IRouter = Router();

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

// The day's four citations, parsed from the cached feed (cheap). Empty if the
// feed can't be reached — never throws, so it can't break the timestamps read.
async function readingsForToday(): Promise<ReturnType<typeof parseScriptureReadings>> {
  try {
    const showMeta = SHOWS[SCRIPTURE_SOURCE];
    if (!showMeta) return [];
    const feed = await loadFeed(showMeta, 1);
    return parseScriptureReadings(feed.episodes[0]?.description);
  } catch {
    return [];
  }
}

router.get("/podcast/scripture/timestamps", async (req: Request, res: Response): Promise<void> => {
  const q = req.query.date;
  const episodeDate = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayYmd();
  const isToday = episodeDate === todayYmd();

  const [row] = await db
    .select()
    .from(officeAudioAlignmentsTable)
    .where(
      and(
        eq(officeAudioAlignmentsTable.show, SCRIPTURE_SHOW),
        eq(officeAudioAlignmentsTable.source, SCRIPTURE_SOURCE),
        eq(officeAudioAlignmentsTable.episodeDate, episodeDate),
      ),
    );

  // Citations are useful even before the timeline exists; only spend the feed
  // read for today (past days just serve whatever was stored).
  const readings = isToday ? await readingsForToday() : [];

  if (!row || row.status !== "done") {
    const status = row?.status ?? "none";
    // On-demand fallback: the first open of today's episode kicks off the
    // transcribe + align in the background (guarded so repeated polls don't
    // duplicate it), and the client polls until it flips to "done". Not when a
    // prior attempt already "failed" — that needs the explicit POST /align.
    if ((status === "none" || status === "pending") && isToday) {
      triggerOnce(`scripture:${episodeDate}`, () => buildScriptureAlignment({}));
      res.json({ episodeDate, status: "building", readings, sections: [] });
      return;
    }
    res.json({ episodeDate, status, readings, sections: [] });
    return;
  }

  // Aligned episodes are stable for the day — let clients cache them.
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    episodeDate,
    status: row.status,
    aligner: row.aligner,
    durationSeconds: row.durationSeconds,
    readings,
    sections: row.sections ?? [],
  });
});

router.post("/podcast/scripture/align", async (req: Request, res: Response): Promise<void> => {
  const internalKey = req.headers["x-internal-key"];
  if (!internalKey || internalKey !== process.env.INTERNAL_API_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let date = new Date();
  if (req.body && typeof req.body.date === "string") {
    const parsed = new Date(req.body.date);
    if (!Number.isNaN(parsed.getTime())) date = parsed;
  }
  const force = Boolean(req.body && req.body.force);

  try {
    const result = await buildScriptureAlignment({ date, force });
    res.json(result);
  } catch (err) {
    console.error("[scripture-align] trigger failed:", err);
    res.status(500).json({ error: "alignment failed", detail: String(err) });
  }
});

export default router;
