import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { rateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

// NB: this router is mounted under the app's "/api" prefix (see app.ts +
// routes/index.ts), so paths here are RELATIVE — "/gratitude", not
// "/api/gratitude". (The old code double-prefixed, resolving to
// /api/api/gratitude, which is why the endpoints were unreachable.)

function getUser(req: any): { id: number; email: string } | null {
  return (req as any).user ?? null;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// ── POST /api/gratitude — write a gratitude entry ──────────────────────────
// Private by default; pass { shared: true } to also post it to the garden.
router.post("/gratitude", rateLimit({
  name: "gratitude_create",
  max: 60,
  windowMs: 60 * 60 * 1000,
  keyFn: (req) => {
    const u = (req as { user?: { id?: number } }).user;
    return u?.id ? `u:${u.id}` : null;
  },
  message: "You're adding entries very quickly — please slow down a moment.",
}), async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const { text, shared } = req.body as { text?: unknown; shared?: unknown };
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text is required" });
    }
    const trimmed = text.trim();
    const wc = wordCount(trimmed);
    if (wc < 5) return res.status(400).json({ error: "Minimum 5 words required" });
    if (wc > 50) return res.status(400).json({ error: "Maximum 50 words allowed" });

    const result = await pool.query(
      `INSERT INTO gratitude_responses (user_id, text, shared)
       VALUES ($1, $2, $3) RETURNING id, created_at, shared`,
      [user.id, trimmed, shared === true],
    );
    return res.json({
      id: result.rows[0].id,
      createdAt: result.rows[0].created_at,
      shared: result.rows[0].shared,
    });
  } catch (err) {
    console.error("POST /gratitude error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/gratitude/:id/share — share/unshare one of your entries ──────
// Lets the user share a private entry to the garden later, entry by entry
// (or pull it back). Only the author can change their own entry.
router.post("/gratitude/:id/share", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });
    const shared = (req.body as { shared?: unknown })?.shared === true;

    const result = await pool.query(
      `UPDATE gratitude_responses SET shared = $1
       WHERE id = $2 AND user_id = $3 RETURNING id, shared`,
      [shared, id, user.id],
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json({ id: result.rows[0].id, shared: result.rows[0].shared });
  } catch (err) {
    console.error("POST /gratitude/:id/share error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/gratitude/mine — the viewer's own journal (private + shared) ───
// Newest first. The client computes "days of thanks" + streak in local
// time from these rows, so no tz handling is needed server-side.
router.get("/gratitude/mine", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const rows = await pool.query(
      `SELECT id, text, shared, created_at
       FROM gratitude_responses
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 365`,
      [user.id],
    );
    return res.json({
      entries: rows.rows.map((r: any) => ({
        id: r.id,
        text: r.text,
        shared: r.shared,
        createdAt: r.created_at,
      })),
      total: rows.rows.length,
    });
  } catch (err) {
    console.error("GET /gratitude/mine error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/gratitude/responses — the garden wall ─────────────────────────
// Shared entries from the last 7 days (everyone, including the viewer's
// own shared ones), newest first, with per-viewer seen tracking.
router.get("/gratitude/responses", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const responses = await pool.query(
      `SELECT
        gr.id, gr.text, gr.created_at, gr.user_id,
        u.name AS author_name,
        u.email AS author_email,
        u.avatar_url AS author_avatar_url,
        gs.id IS NOT NULL AS seen
      FROM gratitude_responses gr
      JOIN users u ON u.id = gr.user_id
      LEFT JOIN gratitude_seen gs ON gs.gratitude_id = gr.id AND gs.user_id = $1
      WHERE gr.shared = TRUE AND gr.created_at > $2
      ORDER BY gr.created_at DESC
      LIMIT 50`,
      [user.id, since],
    );

    return res.json({
      responses: responses.rows.map((r: any) => ({
        id: r.id,
        text: r.text,
        createdAt: r.created_at,
        authorName: r.author_name || r.author_email?.split("@")[0] || "Someone",
        avatarUrl: r.author_avatar_url || null,
        isYou: r.user_id === user.id,
        isNew: !r.seen && r.user_id !== user.id,
      })),
    });
  } catch (err) {
    console.error("GET /gratitude/responses error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/gratitude/seen — mark garden entries as seen ─────────────────
router.post("/gratitude/seen", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const { responseIds } = req.body as { responseIds?: unknown };
    if (!Array.isArray(responseIds) || responseIds.length === 0) {
      return res.json({ marked: 0 });
    }
    const ids = responseIds.filter((x): x is number => Number.isFinite(x));
    if (ids.length === 0) return res.json({ marked: 0 });
    const values = ids.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(", ");
    const params = ids.flatMap((id) => [id, user.id]);
    await pool.query(
      `INSERT INTO gratitude_seen (gratitude_id, user_id) VALUES ${values}
       ON CONFLICT DO NOTHING`,
      params,
    );
    return res.json({ marked: ids.length });
  } catch (err) {
    console.error("POST /gratitude/seen error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
