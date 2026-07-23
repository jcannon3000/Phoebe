import { Router, type IRouter, type Request, type Response } from "express";
import { db, listeningEntriesTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { perUserRateLimit } from "../lib/rate-limit";

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
      .select({ id: listeningEntriesTable.id, day: listeningEntriesTable.day, medium: listeningEntriesTable.medium, what: listeningEntriesTable.what, artworkUrl: listeningEntriesTable.artworkUrl, createdAt: listeningEntriesTable.createdAt })
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
  const body = req.body as { day?: unknown; medium?: unknown; what?: unknown; artworkUrl?: unknown };
  const day = typeof body.day === "string" && isValidYmd(body.day)
    ? body.day
    : new Date().toISOString().slice(0, 10);
  const medium = typeof body.medium === "string" && MEDIA.has(body.medium) ? body.medium : "streaming";
  const what = typeof body.what === "string" ? body.what.trim().slice(0, 200) : "";
  const artworkUrl = typeof body.artworkUrl === "string" && /^https?:\/\//i.test(body.artworkUrl) ? body.artworkUrl.slice(0, 600) : "";
  try {
    const [row] = await db
      .insert(listeningEntriesTable)
      .values({ userId, day, medium, what, artworkUrl })
      .returning({ id: listeningEntriesTable.id, day: listeningEntriesTable.day, medium: listeningEntriesTable.medium, what: listeningEntriesTable.what, artworkUrl: listeningEntriesTable.artworkUrl, createdAt: listeningEntriesTable.createdAt });
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
