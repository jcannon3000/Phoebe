import { Router, type IRouter, type Request, type Response } from "express";
import { db, practiceLogEntriesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { perUserRateLimit } from "../lib/rate-limit";

// ── Generic practice log (account-wide, STRICTLY PRIVATE) ────────────
//
//   GET    /api/practice-log/:kind                 — the caller's own log
//   POST   /api/practice-log/:kind { day, what, notes }
//   DELETE /api/practice-log/:kind/:id
//
// Backs the Reading + Podcasts + Walk logging practices: log what you read /
// listened to / walked, plus optional notes. One table, keyed by `kind`. `day`
// is the caller's LOCAL calendar day (YYYY-MM-DD).
//
// A practice is presence, not performance: there is NO sharing and NO peer feed.
// An entry is only ever visible to the person who wrote it. (The legacy
// `shared` column is always written false and never read for any cross-user
// query — the /shared feed and /:id/share toggle were removed.)

const router: IRouter = Router();

const KINDS = new Set(["reading", "podcasts", "walk"]);

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

function kindOf(req: Request): string | null {
  const k = String(req.params.kind ?? "");
  return KINDS.has(k) ? k : null;
}

// GET /api/practice-log/:kind — the caller's own log, newest first.
router.get("/practice-log/:kind", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const kind = kindOf(req);
  if (!kind) { res.status(400).json({ error: "bad_kind" }); return; }
  try {
    const rows = await db
      .select({ id: practiceLogEntriesTable.id, day: practiceLogEntriesTable.day, what: practiceLogEntriesTable.what, notes: practiceLogEntriesTable.notes, createdAt: practiceLogEntriesTable.createdAt })
      .from(practiceLogEntriesTable)
      .where(and(eq(practiceLogEntriesTable.userId, userId), eq(practiceLogEntriesTable.kind, kind)))
      .orderBy(desc(practiceLogEntriesTable.createdAt))
      .limit(200);
    res.json({ entries: rows });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/practice-log/:kind — record one entry (always private).
router.post("/practice-log/:kind", perUserRateLimit("practice_log", { max: 30, windowMs: 60 * 1000 }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const kind = kindOf(req);
  if (!kind) { res.status(400).json({ error: "bad_kind" }); return; }
  const body = req.body as { day?: unknown; what?: unknown; notes?: unknown };
  const day = typeof body.day === "string" && isValidYmd(body.day) ? body.day : new Date().toISOString().slice(0, 10);
  const what = typeof body.what === "string" ? body.what.trim().slice(0, 200) : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
  try {
    const [row] = await db
      .insert(practiceLogEntriesTable)
      // shared is always false — practice logs are never peer-visible.
      .values({ userId, kind, day, what, notes, shared: false })
      .returning({ id: practiceLogEntriesTable.id, day: practiceLogEntriesTable.day, what: practiceLogEntriesTable.what, notes: practiceLogEntriesTable.notes, createdAt: practiceLogEntriesTable.createdAt });
    res.json({ ok: true, entry: row });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/practice-log/:kind/:id — remove one of the caller's entries.
router.delete("/practice-log/:kind/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad_id" }); return; }
  try {
    await db
      .delete(practiceLogEntriesTable)
      .where(and(eq(practiceLogEntriesTable.id, id), eq(practiceLogEntriesTable.userId, userId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
