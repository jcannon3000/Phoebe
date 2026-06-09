// Per-day community "thoughts" for the three daily reflections (cac, fdd,
// ssje). On a reflection's in-app page the reader sees what others in their
// community (garden + self) wrote about THAT day's reflection.
//
// One uniform endpoint pair serves all three sources:
//   GET  /api/reflections/:source/thoughts?ymd=YYYY-MM-DD
//   POST /api/reflections/:source/thoughts { day, text }
//
// CAC already has a store (cac_reflections, written from routes/cac.ts) — we
// reuse it rather than building a parallel CAC table. cac_reflections has no
// `day` column, so the day is carried by created_at (day-scoped via
// created_at::date = ymd). fdd/ssje use the reflection_thoughts table, which
// carries `source` + an explicit `day`.
//
// Auth + the garden+me id set mirror routes/cac.ts exactly.

import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { getGardenUserIds } from "../lib/garden";

const router: IRouter = Router();

function getUser(req: Request): { id: number } | null {
  return (req as unknown as { user?: { id: number } }).user ?? null;
}

// The reflections that have a per-day community thoughts surface. "cac" reads
// the existing cac_reflections store; the others read reflection_thoughts.
// Anything outside this set is a 400 (never a silent empty result).
const SOURCES = ["cac", "fdd", "ssje"] as const;
type Source = (typeof SOURCES)[number];
function isSource(s: string): s is Source {
  return (SOURCES as readonly string[]).includes(s);
}

// Shared output row shape returned by both GET and POST so the frontend has
// one contract regardless of source. Mirrors GET /cac/reflections/responses.
interface ThoughtRow {
  id: number;
  text: string;
  created_at: Date;
  user_id: number;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}
function toThought(r: ThoughtRow, viewerId: number) {
  return {
    id: r.id,
    text: r.text,
    createdAt: r.created_at,
    authorName: r.name || r.email?.split("@")[0] || "Someone",
    avatarUrl: r.avatar_url || null,
    isYou: r.user_id === viewerId,
  };
}

// GET /api/reflections/:source/thoughts?ymd=YYYY-MM-DD
// Shared thoughts from the viewer's community (garden + self) for that source
// and day, newest first.
router.get("/api/reflections/:source/thoughts", async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const source = String(req.params.source);
  if (!isSource(source)) { res.status(400).json({ error: "Unknown source" }); return; }
  const ymd = String((req.query as { ymd?: unknown }).ymd ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) { res.status(400).json({ error: "Bad ymd" }); return; }
  try {
    const garden = await getGardenUserIds(user.id);
    const ids = Array.from(new Set([user.id, ...garden]));
    // CAC reuses cac_reflections (no `day` column → day comes from created_at).
    // Compare against the calendar day in the DB's timezone, matching how
    // cac_reads records the local day; ymd is treated as that day's date.
    const rows = source === "cac"
      ? await pool.query(
          `SELECT cr.id, cr.text, cr.created_at, cr.user_id, u.name, u.email, u.avatar_url
           FROM cac_reflections cr JOIN users u ON u.id = cr.user_id
           WHERE cr.shared = TRUE AND cr.user_id = ANY($1::int[]) AND cr.created_at::date = $2::date
           ORDER BY cr.created_at DESC LIMIT 100`,
          [ids, ymd],
        )
      : await pool.query(
          `SELECT rt.id, rt.text, rt.created_at, rt.user_id, u.name, u.email, u.avatar_url
           FROM reflection_thoughts rt JOIN users u ON u.id = rt.user_id
           WHERE rt.shared = TRUE AND rt.source = $1 AND rt.day = $2 AND rt.user_id = ANY($3::int[])
           ORDER BY rt.created_at DESC LIMIT 100`,
          [source, ymd, ids],
        );
    res.json({ thoughts: (rows.rows as ThoughtRow[]).map((r) => toThought(r, user.id)) });
  } catch (err) {
    logger.error({ err, source }, "GET /api/reflections/:source/thoughts failed");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/reflections/:source/thoughts { day, text }
// Insert the viewer's thought (shared) and return the created row in the same
// shape the GET returns.
router.post("/api/reflections/:source/thoughts", async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const source = String(req.params.source);
  if (!isSource(source)) { res.status(400).json({ error: "Unknown source" }); return; }
  const body = req.body as { day?: unknown; text?: unknown };
  const day = String(body?.day ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { res.status(400).json({ error: "Bad day" }); return; }
  if (!body?.text || typeof body.text !== "string" || body.text.trim().length === 0) {
    res.status(400).json({ error: "Text is required" }); return;
  }
  const trimmed = body.text.trim();
  try {
    // cac_reflections has no `day` column — created_at carries the day. For
    // fdd/ssje we store the explicit day + source. Both insert shared=TRUE.
    const inserted = source === "cac"
      ? await pool.query(
          `INSERT INTO cac_reflections (user_id, text, shared) VALUES ($1, $2, TRUE)
           RETURNING id, text, created_at, user_id`,
          [user.id, trimmed],
        )
      : await pool.query(
          `INSERT INTO reflection_thoughts (user_id, source, day, text, shared)
           VALUES ($1, $2, $3, $4, TRUE)
           RETURNING id, text, created_at, user_id`,
          [user.id, source, day, trimmed],
        );
    // Pull the author's display fields so the created row matches GET's shape.
    const me = await pool.query(
      `SELECT name, email, avatar_url FROM users WHERE id = $1`,
      [user.id],
    );
    const r: ThoughtRow = {
      ...(inserted.rows[0] as { id: number; text: string; created_at: Date; user_id: number }),
      name: me.rows[0]?.name ?? null,
      email: me.rows[0]?.email ?? null,
      avatar_url: me.rows[0]?.avatar_url ?? null,
    };
    res.json(toThought(r, user.id));
  } catch (err) {
    logger.error({ err, source }, "POST /api/reflections/:source/thoughts failed");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
