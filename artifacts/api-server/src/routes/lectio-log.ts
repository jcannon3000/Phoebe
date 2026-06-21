import { Router, type IRouter, type Request, type Response } from "express";
import { db, lectioLogEntriesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { perUserRateLimit } from "../lib/rate-limit";

// ── Lectio Divina log (account-wide, private) ────────────────────────
//
//   GET    /api/lectio-log                              — the caller's log
//   POST   /api/lectio-log { day, passage, reflection } — record one sitting
//   DELETE /api/lectio-log/:id                          — remove one entry
//
// A contemplative practice modeled on Audio Divina, but for Scripture: read a
// passage slowly, then note what you felt drawn to / called to do. Append log,
// `day` is the caller's LOCAL calendar day (YYYY-MM-DD). Private — no sharing.
// (Distinct from routes/lectio.ts, the guided lectionary-reflection feature.)

const router: IRouter = Router();

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

// GET /api/lectio-log — the caller's lectio log, newest first.
router.get("/lectio-log", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  try {
    const rows = await db
      .select({ id: lectioLogEntriesTable.id, day: lectioLogEntriesTable.day, passage: lectioLogEntriesTable.passage, reflection: lectioLogEntriesTable.reflection, createdAt: lectioLogEntriesTable.createdAt })
      .from(lectioLogEntriesTable)
      .where(eq(lectioLogEntriesTable.userId, userId))
      .orderBy(desc(lectioLogEntriesTable.createdAt))
      .limit(200);
    res.json({ entries: rows });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/lectio-log — record one sitting.
router.post("/lectio-log", perUserRateLimit("lectio_log", { max: 30, windowMs: 60 * 1000 }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const body = req.body as { day?: unknown; passage?: unknown; reflection?: unknown };
  const day = typeof body.day === "string" && isValidYmd(body.day) ? body.day : new Date().toISOString().slice(0, 10);
  const passage = typeof body.passage === "string" ? body.passage.trim().slice(0, 200) : "";
  const reflection = typeof body.reflection === "string" ? body.reflection.trim().slice(0, 500) : "";
  try {
    const [row] = await db
      .insert(lectioLogEntriesTable)
      .values({ userId, day, passage, reflection })
      .returning({ id: lectioLogEntriesTable.id, day: lectioLogEntriesTable.day, passage: lectioLogEntriesTable.passage, reflection: lectioLogEntriesTable.reflection, createdAt: lectioLogEntriesTable.createdAt });
    res.json({ ok: true, entry: row });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// DELETE /api/lectio-log/:id — remove one of the caller's entries.
router.delete("/lectio-log/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad_id" }); return; }
  try {
    await db
      .delete(lectioLogEntriesTable)
      .where(and(eq(lectioLogEntriesTable.id, id), eq(lectioLogEntriesTable.userId, userId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

export default router;
