import { Router, type IRouter, type Request, type Response } from "express";
import { db, listeningEntriesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { perUserRateLimit } from "../lib/rate-limit";

// ── Audio Divina (account-wide, STRICTLY PRIVATE) ────────────────────
//
//   GET    /api/listening            — the caller's own listening log
//   POST   /api/listening { day, medium, what, artworkUrl, experience }
//   DELETE /api/listening/:id
//
// Audio Divina is now a private, in-the-moment practice (the client no longer
// keeps a shared log), but these endpoints remain so any existing entries stay
// the owner's own. A practice is presence, not performance: there is NO sharing
// and NO peer feed — the /listening/shared feed and /:id/share toggle were
// removed, and new writes are always private (`shared` forced false).

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
      .select({ id: listeningEntriesTable.id, day: listeningEntriesTable.day, medium: listeningEntriesTable.medium, what: listeningEntriesTable.what, artworkUrl: listeningEntriesTable.artworkUrl, experience: listeningEntriesTable.experience, createdAt: listeningEntriesTable.createdAt })
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

router.post("/listening", perUserRateLimit("listening_log", { max: 30, windowMs: 60 * 1000 }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const body = req.body as { day?: unknown; medium?: unknown; what?: unknown; artworkUrl?: unknown; experience?: unknown };
  const day = typeof body.day === "string" && isValidYmd(body.day)
    ? body.day
    : new Date().toISOString().slice(0, 10);
  const medium = typeof body.medium === "string" && MEDIA.has(body.medium) ? body.medium : "streaming";
  const what = typeof body.what === "string" ? body.what.trim().slice(0, 200) : "";
  const artworkUrl = typeof body.artworkUrl === "string" && /^https?:\/\//i.test(body.artworkUrl) ? body.artworkUrl.slice(0, 600) : "";
  const experience = typeof body.experience === "string" ? body.experience.trim().slice(0, 500) : "";
  try {
    const [row] = await db
      .insert(listeningEntriesTable)
      // shared is always false — listening is never peer-visible.
      .values({ userId, day, medium, what, artworkUrl, experience, shared: false })
      .returning({ id: listeningEntriesTable.id, day: listeningEntriesTable.day, medium: listeningEntriesTable.medium, what: listeningEntriesTable.what, artworkUrl: listeningEntriesTable.artworkUrl, experience: listeningEntriesTable.experience, createdAt: listeningEntriesTable.createdAt });
    res.json({ ok: true, entry: row });
  } catch (err) {
    console.error("[/listening POST] failed:", err);
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
