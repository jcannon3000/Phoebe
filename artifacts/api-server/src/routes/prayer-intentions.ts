import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { rateLimit } from "../lib/rate-limit";
import { encryptField, decryptField, fieldEncryptionActive } from "../lib/fieldCrypto";

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

function toJson(r: Row, prayedTodayIds?: Set<number>) {
  return {
    id: r.id,
    kind: r.kind === "person" ? "person" : "text",
    // person_name + body are stored encrypted at rest (see fieldCrypto); decrypt
    // on the way out. Legacy plaintext rows decrypt to themselves (no prefix).
    personName: decryptField(r.person_name ?? ""),
    body: decryptField(r.body ?? ""),
    answered: !!r.answered,
    answeredAt: r.answered_at,
    shared: !!r.shared,
    sharedRequestId: r.shared_request_id,
    createdAt: r.created_at,
    // Whether this specific item has been walked past in PrayThrough for
    // the ymd the caller asked about (see ?ymd= below) — powers the
    // "X out of Y prayers have been prayed" routine card. Omitted (never
    // true) if the caller didn't send ?ymd=, so an older app build's
    // request just gets everything false rather than erroring.
    prayedToday: prayedTodayIds?.has(r.id) ?? false,
  };
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── GET /api/prayer-intentions — the caller's own list ─────────────────────
// Oldest first (a stable order to pray through), unanswered before answered.
// ?ymd=YYYY-MM-DD (the caller's local day) also returns prayedToday per item.
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
    let prayedTodayIds: Set<number> | undefined;
    const ymd = typeof req.query.ymd === "string" && YMD_RE.test(req.query.ymd) ? req.query.ymd : null;
    if (ymd && result.rows.length > 0) {
      const ids = result.rows.map((r) => r.id);
      const prayed = await pool.query<{ intention_id: number }>(
        `SELECT intention_id FROM prayer_intention_prayed_days WHERE ymd = $1 AND intention_id = ANY($2::int[])`,
        [ymd, ids],
      );
      prayedTodayIds = new Set(prayed.rows.map((r) => r.intention_id));
    }
    // `encrypted` tells the client whether at-rest encryption is actually
    // active (a key is configured), so it only shows the "encrypted" note when
    // the claim is true.
    return res.json({ intentions: result.rows.map((r) => toJson(r, prayedTodayIds)), encrypted: fieldEncryptionActive() });
  } catch (err) {
    console.error("GET /prayer-intentions error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/prayer-intentions/:id/pray — mark prayed for a given day ─────
// Called as PrayThrough (intentions.tsx) walks past each item. Idempotent —
// re-marking the same (intention, day) is a no-op.
router.post("/prayer-intentions/:id/pray", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
    const ymd = typeof req.body?.ymd === "string" ? req.body.ymd : "";
    if (!YMD_RE.test(ymd)) return res.status(400).json({ error: "Bad ymd" });

    const owns = await pool.query(`SELECT 1 FROM prayer_intentions WHERE id = $1 AND user_id = $2`, [id, user.id]);
    if (owns.rowCount === 0) return res.status(404).json({ error: "Not found" });

    await pool.query(
      `INSERT INTO prayer_intention_prayed_days (intention_id, ymd) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, ymd],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("POST /prayer-intentions/:id/pray error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /api/prayer-intentions/:id/pray — undo a mark for a given day ───
router.delete("/prayer-intentions/:id/pray", async (req, res) => {
  try {
    const user = getUser(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Bad id" });
    const ymd = typeof req.body?.ymd === "string" ? req.body.ymd : "";
    if (!YMD_RE.test(ymd)) return res.status(400).json({ error: "Bad ymd" });

    const owns = await pool.query(`SELECT 1 FROM prayer_intentions WHERE id = $1 AND user_id = $2`, [id, user.id]);
    if (owns.rowCount === 0) return res.status(404).json({ error: "Not found" });

    await pool.query(`DELETE FROM prayer_intention_prayed_days WHERE intention_id = $1 AND ymd = $2`, [id, ymd]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /prayer-intentions/:id/pray error:", err);
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
      [user.id, kind, encryptField(name), encryptField(text)],
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
    if (typeof personName === "string") { sets.push(`person_name = $${i++}`); vals.push(encryptField(personName.trim().slice(0, 80))); }
    if (typeof body === "string") { sets.push(`body = $${i++}`); vals.push(encryptField(body.trim().slice(0, 500))); }
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
