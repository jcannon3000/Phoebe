import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { rateLimit } from "../lib/rate-limit";

// ── Personal prayer list ("prayer intentions") ─────────────────────────────
// A PRIVATE list of the things / people a user is holding in prayer. Each item
// is either free text ("peace in Sudan") or a person (name + optional note).
// Private by default; the client can post one to a community / their circle,
// which creates a normal prayer_request (reusing the pray-along/amen infra) and
// then PATCHes the intention { shared, sharedRequestId } so it shows "Shared".
//
// Mounted under the app's "/api" prefix (see routes/index.ts), so paths here
// are RELATIVE — "/prayer-intentions", not "/api/prayer-intentions".
const router: IRouter = Router();

function getUser(req: any): { id: number; email: string } | null {
  return (req as any).user ?? null;
}

type Row = {
  id: number;
  kind: string;
  person_name: string;
  body: string;
  answered: boolean;
  answered_at: string | null;
  shared: boolean;
  shared_request_id: number | null;
  created_at: string;
};

function toJson(r: Row) {
  return {
    id: r.id,
    kind: r.kind === "person" ? "person" : "text",
    personName: r.person_name ?? "",
    body: r.body ?? "",
    answered: !!r.answered,
    answeredAt: r.answered_at,
    shared: !!r.shared,
    sharedRequestId: r.shared_request_id,
    createdAt: r.created_at,
  };
}

// ── GET /api/prayer-intentions — the caller's own list ─────────────────────
// Oldest first (a stable order to pray through), unanswered before answered.
router.get("/prayer-intentions", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const result = await pool.query<Row>(
      `SELECT id, kind, person_name, body, answered, answered_at, shared, shared_request_id, created_at
         FROM prayer_intentions
        WHERE user_id = $1
        ORDER BY answered ASC, created_at ASC`,
      [user.id],
    );
    return res.json({ intentions: result.rows.map(toJson) });
  } catch (err) {
    console.error("GET /prayer-intentions error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/prayer-intentions — add an intention ─────────────────────────
router.post("/prayer-intentions", rateLimit({
  name: "prayer_intention_create",
  max: 60,
  windowMs: 60 * 60 * 1000,
  keyFn: (req) => {
    const u = (req as { user?: { id?: number } }).user;
    return u?.id ? `u:${u.id}` : null;
  },
  message: "You're adding items very quickly — please slow down a moment.",
}), async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const { kind: rawKind, personName, body } = req.body as {
      kind?: unknown; personName?: unknown; body?: unknown;
    };
    const kind = rawKind === "person" ? "person" : "text";
    const name = typeof personName === "string" ? personName.trim() : "";
    const text = typeof body === "string" ? body.trim() : "";

    // A person item needs a name; a text item needs body text.
    if (kind === "person" && !name) return res.status(400).json({ error: "A name is required" });
    if (kind === "text" && !text) return res.status(400).json({ error: "Write your intention" });
    if (name.length > 80) return res.status(400).json({ error: "Name is too long" });
    if (text.length > 500) return res.status(400).json({ error: "Intention is too long" });

    // Soft cap so the list (and its slideshow) stays prayable.
    const { rows: countRows } = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM prayer_intentions WHERE user_id = $1 AND answered = FALSE`,
      [user.id],
    );
    if (Number(countRows[0]?.n ?? "0") >= 100) {
      return res.status(409).json({ error: "Your list is full — mark some as answered first." });
    }

    const result = await pool.query<Row>(
      `INSERT INTO prayer_intentions (user_id, kind, person_name, body)
       VALUES ($1, $2, $3, $4)
       RETURNING id, kind, person_name, body, answered, answered_at, shared, shared_request_id, created_at`,
      [user.id, kind, name, text],
    );
    return res.json({ intention: toJson(result.rows[0]) });
  } catch (err) {
    console.error("POST /prayer-intentions error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── PATCH /api/prayer-intentions/:id — edit / answer / mark shared ─────────
router.patch("/prayer-intentions/:id", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });

    const { personName, body, answered, shared, sharedRequestId } = req.body as {
      personName?: unknown; body?: unknown; answered?: unknown;
      shared?: unknown; sharedRequestId?: unknown;
    };

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (typeof personName === "string") { sets.push(`person_name = $${i++}`); vals.push(personName.trim().slice(0, 80)); }
    if (typeof body === "string") { sets.push(`body = $${i++}`); vals.push(body.trim().slice(0, 500)); }
    if (typeof answered === "boolean") {
      sets.push(`answered = $${i++}`); vals.push(answered);
      sets.push(`answered_at = $${i++}`); vals.push(answered ? new Date().toISOString() : null);
    }
    if (typeof shared === "boolean") { sets.push(`shared = $${i++}`); vals.push(shared); }
    if (typeof sharedRequestId === "number" || sharedRequestId === null) {
      sets.push(`shared_request_id = $${i++}`); vals.push(sharedRequestId ?? null);
    }
    if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });

    vals.push(id, user.id);
    const result = await pool.query<Row>(
      `UPDATE prayer_intentions SET ${sets.join(", ")}
        WHERE id = $${i++} AND user_id = $${i}
       RETURNING id, kind, person_name, body, answered, answered_at, shared, shared_request_id, created_at`,
      vals,
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json({ intention: toJson(result.rows[0]) });
  } catch (err) {
    console.error("PATCH /prayer-intentions/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/prayer-intentions/:id ──────────────────────────────────────
router.delete("/prayer-intentions/:id", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
    await pool.query(`DELETE FROM prayer_intentions WHERE id = $1 AND user_id = $2`, [id, user.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /prayer-intentions/:id error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
