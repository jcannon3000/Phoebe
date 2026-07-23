import { Router, type IRouter, type Request, type Response } from "express";
import { db, listeningEntriesTable, usersTable } from "@workspace/db";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { perUserRateLimit } from "../lib/rate-limit";
import { getFellowUserIds } from "../lib/garden";

// ── Audio Divina log (account-wide) ──────────────────────────────────
//
//   GET  /api/listening            — the caller's listening log, newest first
//   POST /api/listening { day, medium, what } — record one sitting
//
// Logging-first "sacred listening": you put on music and note what + how. An
// append log (multiple sittings a day are fine). `day` is the caller's LOCAL
// calendar day (YYYY-MM-DD). Replaces the old localStorage-only log so the
// history follows the account across devices.

const router: IRouter = Router();

const MEDIA = new Set(["streaming", "cd", "vinyl", "tape"]);

function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

router.get("/listening", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  try {
    const rows = await db
      .select({ id: listeningEntriesTable.id, day: listeningEntriesTable.day, medium: listeningEntriesTable.medium, what: listeningEntriesTable.what, artworkUrl: listeningEntriesTable.artworkUrl, shared: listeningEntriesTable.shared, createdAt: listeningEntriesTable.createdAt })
      .from(listeningEntriesTable)
      .where(eq(listeningEntriesTable.userId, userId))
      .orderBy(desc(listeningEntriesTable.createdAt))
      .limit(200);
    res.json({ entries: rows });
  } catch (err) {
    console.error("[/listening GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/listening/shared — your fellows' shared listening, newest first (last
// 30 days), with author name + avatar. Mirrors the gratitude garden, but scoped
// to the viewer's fellows (plus your own shared entries, marked isYou).
router.get("/listening/shared", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  try {
    const fellowIds = await getFellowUserIds(userId);
    const authorIds = [...new Set([userId, ...fellowIds])];
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        id: listeningEntriesTable.id, day: listeningEntriesTable.day, medium: listeningEntriesTable.medium,
        what: listeningEntriesTable.what, artworkUrl: listeningEntriesTable.artworkUrl,
        createdAt: listeningEntriesTable.createdAt, authorId: listeningEntriesTable.userId,
        authorName: usersTable.name, authorAvatarUrl: usersTable.avatarUrl,
      })
      .from(listeningEntriesTable)
      .innerJoin(usersTable, eq(usersTable.id, listeningEntriesTable.userId))
      .where(and(eq(listeningEntriesTable.shared, true), inArray(listeningEntriesTable.userId, authorIds), gt(listeningEntriesTable.createdAt, since)))
      .orderBy(desc(listeningEntriesTable.createdAt))
      .limit(80);
    const entries = rows.map((r) => ({
      id: r.id, day: r.day, medium: r.medium, what: r.what, artworkUrl: r.artworkUrl,
      createdAt: r.createdAt,
      authorName: r.authorName || "Someone",
      avatarUrl: r.authorAvatarUrl ?? null,
      isYou: r.authorId === userId,
    }));
    res.json({ entries });
  } catch (err) {
    console.error("[/listening/shared GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/listening", perUserRateLimit("listening_log", { max: 30, windowMs: 60 * 1000 }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const body = req.body as { day?: unknown; medium?: unknown; what?: unknown; artworkUrl?: unknown; shared?: unknown };
  const day = typeof body.day === "string" && isValidYmd(body.day)
    ? body.day
    : new Date().toISOString().slice(0, 10);
  const medium = typeof body.medium === "string" && MEDIA.has(body.medium) ? body.medium : "streaming";
  const what = typeof body.what === "string" ? body.what.trim().slice(0, 200) : "";
  const artworkUrl = typeof body.artworkUrl === "string" && /^https?:\/\//i.test(body.artworkUrl) ? body.artworkUrl.slice(0, 600) : "";
  const shared = body.shared === true;
  try {
    const [row] = await db
      .insert(listeningEntriesTable)
      .values({ userId, day, medium, what, artworkUrl, shared })
      .returning({ id: listeningEntriesTable.id, day: listeningEntriesTable.day, medium: listeningEntriesTable.medium, what: listeningEntriesTable.what, artworkUrl: listeningEntriesTable.artworkUrl, shared: listeningEntriesTable.shared, createdAt: listeningEntriesTable.createdAt });
    res.json({ ok: true, entry: row });
  } catch (err) {
    console.error("[/listening POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/listening/:id/share { shared } — author-only toggle of an entry's
// visibility to fellows (mirrors gratitude's share toggle).
router.post("/listening/:id/share", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad_id" }); return; }
  const shared = (req.body as { shared?: unknown }).shared === true;
  try {
    const [row] = await db
      .update(listeningEntriesTable)
      .set({ shared })
      .where(and(eq(listeningEntriesTable.id, id), eq(listeningEntriesTable.userId, userId)))
      .returning({ id: listeningEntriesTable.id, shared: listeningEntriesTable.shared });
    if (!row) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ ok: true, entry: row });
  } catch (err) {
    console.error("[/listening/:id/share POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// DELETE /api/listening/:id — remove one of the caller's own entries.
router.delete("/listening/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "bad_id" }); return; }
  try {
    await db
      .delete(listeningEntriesTable)
      .where(and(eq(listeningEntriesTable.id, id), eq(listeningEntriesTable.userId, userId)));
    res.json({ ok: true });
  } catch (err) {
    console.error("[/listening DELETE] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
