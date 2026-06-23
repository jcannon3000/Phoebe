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
// Gratitude is a PRIVATE practice: entries are never peer-visible. The `shared`
// flag is always written false (the community garden was removed — presence,
// not performance).
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

    const { text } = req.body as { text?: unknown };
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Text is required" });
    }
    const trimmed = text.trim();
    const wc = wordCount(trimmed);
    if (wc < 5) return res.status(400).json({ error: "Minimum 5 words required" });
    if (wc > 50) return res.status(400).json({ error: "Maximum 50 words allowed" });

    const result = await pool.query(
      // shared is always false — gratitude is never peer-visible.
      `INSERT INTO gratitude_responses (user_id, text, shared)
       VALUES ($1, $2, FALSE) RETURNING id, created_at, shared`,
      [user.id, trimmed],
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

// ── POST /api/gratitude/:id/share — retained only to RETRACT old shares ─────
// Gratitude is private now: there is no garden to share into, so this always
// forces the entry private (shared = FALSE), whatever the request asks. It
// exists so any pre-existing shared entry can still be pulled back.
router.post("/gratitude/:id/share", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Bad id" });

    const result = await pool.query(
      `UPDATE gratitude_responses SET shared = FALSE
       WHERE id = $1 AND user_id = $2 RETURNING id, shared`,
      [id, user.id],
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

// ── GET /api/gratitude/responses — the garden wall (REMOVED) ───────────────
// Gratitude is private; there is no community garden. Always empty so no one
// ever sees anyone else's thanks. (Kept as a stable 200 for any cached client.)
router.get("/gratitude/responses", (req, res) => {
  if (!getUser(req)) return res.status(401).json({ error: "Not authenticated" });
  return res.json({ responses: [] });
});

// ── GET /api/gratitude/unseen-count — always 0 (no garden) ─────────────────
router.get("/gratitude/unseen-count", (req, res) => {
  if (!getUser(req)) return res.status(401).json({ error: "Not authenticated" });
  return res.json({ count: 0 });
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
