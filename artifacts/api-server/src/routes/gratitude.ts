import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

function getUser(req: any): { id: number; email: string } | null {
  return (req as any).user ?? null;
}

// ── POST /api/gratitude — submit a gratitude response ──────────────────────
router.post("/api/gratitude", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text is required" });
    }

    const trimmed = text.trim();
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
    if (wordCount < 5) {
      return res.status(400).json({ error: "Minimum 5 words required" });
    }
    if (wordCount > 50) {
      return res.status(400).json({ error: "Maximum 50 words allowed" });
    }

    const result = await pool.query(
      `INSERT INTO gratitude_responses (user_id, text) VALUES ($1, $2) RETURNING id, created_at`,
      [user.id, trimmed],
    );

    return res.json({ id: result.rows[0].id, createdAt: result.rows[0].created_at });
  } catch (err) {
    console.error("POST /api/gratitude error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/gratitude/responses — get responses since last prayer session ──
router.get("/api/gratitude/responses", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    // Get the user's last prayer completion time
    const userResult = await pool.query(
      `SELECT last_prayer_at FROM users WHERE id = $1`,
      [user.id],
    );
    const lastPrayerAt = userResult.rows[0]?.last_prayer_at ?? null;

    // Fetch responses from other users since the last prayer session.
    // If no previous session, show responses from the last 24 hours.
    const sinceDate = lastPrayerAt
      ? lastPrayerAt
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const responses = await pool.query(
      `SELECT
        gr.id,
        gr.text,
        gr.created_at,
        gr.user_id,
        u.name AS author_name,
        u.email AS author_email,
        gs.id IS NOT NULL AS seen
      FROM gratitude_responses gr
      JOIN users u ON u.id = gr.user_id
      LEFT JOIN gratitude_seen gs ON gs.gratitude_id = gr.id AND gs.user_id = $1
      WHERE gr.user_id != $1
        AND gr.created_at > $2
      ORDER BY gr.created_at DESC
      LIMIT 50`,
      [user.id, sinceDate],
    );

    // Also get total count of all responses (for empty state messaging)
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM gratitude_responses WHERE user_id != $1`,
      [user.id],
    );

    return res.json({
      responses: responses.rows.map((r: any) => ({
        id: r.id,
        text: r.text,
        createdAt: r.created_at,
        authorName: r.author_name || r.author_email?.split("@")[0] || "Someone",
        authorEmail: r.author_email,
        isNew: !r.seen,
      })),
      totalCount: countResult.rows[0]?.total ?? 0,
    });
  } catch (err) {
    console.error("GET /api/gratitude/responses error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/gratitude/seen — mark responses as seen ──────────────────────
router.post("/api/gratitude/seen", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { responseIds } = req.body;
    if (!Array.isArray(responseIds) || responseIds.length === 0) {
      return res.json({ marked: 0 });
    }

    // Insert seen records, ignoring duplicates
    const values = responseIds
      .map((_: number, i: number) => `($${i * 2 + 1}, $${i * 2 + 2})`)
      .join(", ");
    const params = responseIds.flatMap((id: number) => [id, user.id]);

    await pool.query(
      `INSERT INTO gratitude_seen (gratitude_id, user_id)
       VALUES ${values}
       ON CONFLICT DO NOTHING`,
      params,
    );

    return res.json({ marked: responseIds.length });
  } catch (err) {
    console.error("POST /api/gratitude/seen error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/gratitude/complete-prayer — update last_prayer_at ────────────
router.post("/api/gratitude/complete-prayer", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    await pool.query(
      `UPDATE users SET last_prayer_at = NOW() WHERE id = $1`,
      [user.id],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/gratitude/complete-prayer error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
