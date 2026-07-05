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

// Today's episode from the cached feed (cheap): the four parsed citations PLUS
// the episode guid, so the read can tell whether a stored alignment is actually
// for the CURRENT episode. Never throws — can't break the timestamps read.
async function todayEpisode(): Promise<{ readings: ReturnType<typeof parseScriptureReadings>; guid: string | null; date: string | null }> {
  try {
    const showMeta = SHOWS[SCRIPTURE_SOURCE];
    if (!showMeta) return { readings: [], guid: null, date: null };
    const feed = await loadFeed(showMeta, 1);
    const ep = feed.episodes[0];
    // The episode's OWN publish date (UTC) is the day it belongs to. The office
    // always plays the NEWEST episode, so "today" must track that episode — not
    // wall-clock UTC, which rolls a day ahead every evening in the Americas and
    // left the office polling an unpublished, never-aligned date (no pills) all
    // evening while the played episode's alignment sat done under yesterday.
    const date = ep?.publishedAt ? new Date(ep.publishedAt).toISOString().slice(0, 10) : null;
    return { readings: parseScriptureReadings(ep?.description), guid: ep?.id ?? ep?.audioUrl ?? null, date };
  } catch {
    return { readings: [], guid: null, date: null };
  }
}

router.get("/podcast/scripture/timestamps", async (req: Request, res: Response): Promise<void> => {
  const q = req.query.date;
  // "Today" tracks the newest published episode's own date, NOT wall-clock UTC —
  // otherwise the office polls a date whose episode isn't out yet every evening.
  const today = await todayEpisode();
  const resolvedToday = today.date ?? todayYmd();
  const episodeDate = typeof q === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : resolvedToday;
  const isToday = episodeDate === resolvedToday;
  // On-demand builds must target the SAME date the reader resolved (noon UTC
  // keeps the ymd stable across DST), not the builder's own wall-clock default.
  const buildDate = new Date(`${episodeDate}T12:00:00Z`);

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

  // Citations are useful even before the timeline exists; only serve today's
  // parsed readings (past days just serve whatever sections were stored).
  const readings = isToday ? today.readings : [];

  // Self-heal: if today's stored timeline predates the deterministic
  // announcement matcher (an old "openai"/"heuristic" aligner), re-run it once
  // so the corrected markers replace the stale guess. Serve "building" meanwhile
  // so the client polls for the new one.
  if (isToday && row?.status === "done" && !String(row.aligner ?? "").startsWith("announce")) {
    triggerOnce(`scripture-realign:${episodeDate}`, () => buildScriptureAlignment({ force: true, date: buildDate }));
    res.json({ episodeDate, status: "building", readings, sections: [] });
    return;
  }

  // Self-heal: the stored alignment is for a DIFFERENT episode than the feed's
  // current one. This happens when the align job ran before today's episode
  // published (~06:30 UTC) and transcribed YESTERDAY's audio, then saved it under
  // today's date — so the freshly-parsed `readings` above (today's) never match
  // the stale stored `sections` (yesterday's), and no Listen pill appears. Re-align
  // against the current episode; serve "building" until it's redone.
  if (isToday && row?.status === "done" && today.guid && row.episodeGuid && row.episodeGuid !== today.guid) {
    triggerOnce(`scripture-realign:${episodeDate}:${today.guid}`, () => buildScriptureAlignment({ force: true, date: buildDate }));
    res.json({ episodeDate, status: "building", readings, sections: [] });
    return;
  }

  if (!row || row.status !== "done") {
    const status = row?.status ?? "none";
    // On-demand fallback: the first open of today's episode kicks off the
    // transcribe + align in the background (guarded so repeated polls don't
    // duplicate it), and the client polls until it flips to "done". Not when a
    // prior attempt already "failed" — that needs the explicit POST /align.
    if ((status === "none" || status === "pending") && isToday) {
      triggerOnce(`scripture:${episodeDate}`, () => buildScriptureAlignment({ date: buildDate }));
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
