import { Router, type IRouter, type Request, type Response } from "express";
import { db, practiceLogEntriesTable, usersTable } from "@workspace/db";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { perUserRateLimit } from "../lib/rate-limit";
import { getFellowUserIds } from "../lib/garden";

// ── Generic practice log (account-wide) ──────────────────────────────
//
//   GET    /api/practice-log/:kind                 — the caller's log for kind
//   POST   /api/practice-log/:kind { day, what, notes, shared }
//   DELETE /api/practice-log/:kind/:id
//   POST   /api/practice-log/:kind/:id/share { shared }
//   GET    /api/practice-log/:kind/shared          — fellows' shared, for kind
//
// Backs the Reading + Podcasts logging practices: log what you read/listened
// to plus optional notes, privately or shared with fellows. One table, keyed
// by `kind`. `day` is the caller's LOCAL calendar day (YYYY-MM-DD).

const router: IRouter = Router();

const KINDS = new Set(["reading", "podcasts"]);

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

// GET /api/practice-log/:kind/shared — fellows' (and your own) shared entries.
// Declared before /:kind so "shared" isn't read as an :id.
router.get("/practice-log/:kind/shared", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const kind = kindOf(req);
  if (!kind) { res.status(400).json({ error: "bad_kind" }); return; }
  try {
    const fellowIds = await getFellowUserIds(userId);
    const authorIds = [...new Set([userId, ...fellowIds])];
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        id: practiceLogEntriesTable.id, day: practiceLogEntriesTable.day, what: practiceLogEntriesTable.what,
        notes: practiceLogEntriesTable.notes, createdAt: practiceLogEntriesTable.createdAt, authorId: practiceLogEntriesTable.userId,
        authorName: usersTable.name, authorAvatarUrl: usersTable.avatarUrl,
      })
      .from(practiceLogEntriesTable)
      .innerJoin(usersTable, eq(usersTable.id, practiceLogEntriesTable.userId))
      .where(and(eq(practiceLogEntriesTable.kind, kind), eq(practiceLogEntriesTable.shared, true), inArray(practiceLogEntriesTable.userId, authorIds), gt(practiceLogEntriesTable.createdAt, since)))
      .orderBy(desc(practiceLogEntriesTable.createdAt))
      .limit(80);
    res.json({ entries: rows.map((r) => ({ id: r.id, day: r.day, what: r.what, notes: r.notes, createdAt: r.createdAt, authorName: r.authorName, avatarUrl: r.authorAvatarUrl, isYou: r.authorId === userId })) });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// GET /api/practice-log/:kind — the caller's log, newest first.
router.get("/practice-log/:kind", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const kind = kindOf(req);
  if (!kind) { res.status(400).json({ error: "bad_kind" }); return; }
  try {
    const rows = await db
      .select({ id: practiceLogEntriesTable.id, day: practiceLogEntriesTable.day, what: practiceLogEntriesTable.what, notes: practiceLogEntriesTable.notes, shared: practiceLogEntriesTable.shared, createdAt: practiceLogEntriesTable.createdAt })
      .from(practiceLogEntriesTable)
      .where(and(eq(practiceLogEntriesTable.userId, userId), eq(practiceLogEntriesTable.kind, kind)))
      .orderBy(desc(practiceLogEntriesTable.createdAt))
      .limit(200);
    res.json({ entries: rows });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/practice-log/:kind — record one entry.
router.post("/practice-log/:kind", perUserRateLimit("practice_log", { max: 30, windowMs: 60 * 1000 }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const kind = kindOf(req);
  if (!kind) { res.status(400).json({ error: "bad_kind" }); return; }
  const body = req.body as { day?: unknown; what?: unknown; notes?: unknown; shared?: unknown };
  const day = typeof body.day === "string" && isValidYmd(body.day) ? body.day : new Date().toISOString().slice(0, 10);
  const what = typeof body.what === "string" ? body.what.trim().slice(0, 200) : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
  const shared = body.shared === true;
  try {
    const [row] = await db
      .insert(practiceLogEntriesTable)
      .values({ userId, kind, day, what, notes, shared })
      .returning({ id: practiceLogEntriesTable.id, day: practiceLogEntriesTable.day, what: practiceLogEntriesTable.what, notes: practiceLogEntriesTable.notes, shared: practiceLogEntriesTable.shared, createdAt: practiceLogEntriesTable.createdAt });
    res.json({ ok: true, entry: row });
  } catch {
    res.status(500).json({ error: "server_error" });
  }
});

// POST /api/practice-log/:kind/:id/share — toggle visibility to fellows.
router.post("/practice-log/:kind/:id/share", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad_id" }); return; }
  const shared = (req.body as { shared?: unknown }).shared === true;
  try {
    const [row] = await db
      .update(practiceLogEntriesTable)
      .set({ shared })
      .where(and(eq(practiceLogEntriesTable.id, id), eq(practiceLogEntriesTable.userId, userId)))
      .returning({ id: practiceLogEntriesTable.id, shared: practiceLogEntriesTable.shared });
    if (!row) { res.status(404).json({ error: "not_found" }); return; }
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
