import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";

// ── Public landing stats ─────────────────────────────────────────────────────
// Unauthenticated aggregate(s) for the welcome screen (shown pre-login). No
// PII — just counts. Cached in-memory (~30 min) so the public landing can't
// hammer the DB regardless of traffic.

const router: IRouter = Router();

let prayedCache: { at: number; count: number } | null = null;
const TTL_MS = 30 * 60_000;

// GET /api/stats/prayed-this-month → { count }
// Distinct people who have prayed (any prayer_days row) since the first of the
// current month. prayer_days is the canonical "prayed" day-log (same source
// the community stats use for prayed-today / week / all-time).
router.get("/stats/prayed-this-month", async (_req: Request, res: Response): Promise<void> => {
  if (prayedCache && Date.now() - prayedCache.at < TTL_MS) {
    res.json({ count: prayedCache.count });
    return;
  }
  try {
    const now = new Date();
    const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const { rows } = await pool.query<{ count: number }>(
      `SELECT COUNT(DISTINCT user_id)::int AS count FROM prayer_days WHERE day >= $1`,
      [monthStart],
    );
    const count = rows[0]?.count ?? 0;
    prayedCache = { at: Date.now(), count };
    res.json({ count });
  } catch (err) {
    console.error("[stats] prayed-this-month failed:", err);
    // Degrade gracefully — the client falls back to its static subtitle.
    res.json({ count: 0 });
  }
});

export default router;
