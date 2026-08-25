import { Router, type IRouter, type Request, type Response } from "express";
import { db, reflectionReadsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

// ── Daily-reflection read-state ──────────────────────────────────────────────
//
//   POST /api/reflections/read { source, ymd }  — mark FDD/SSJE read (idempotent)
//   GET  /api/me/reflections-read?ymd=           — { cac, fdd, ssje } for today
//
// The daily-progress "Reflect" anchor is kept if the user opened ANY daily
// reflection today. Reads were tracked in localStorage only, so a read on one
// device didn't show on another. These endpoints make read-state server-backed
// so it syncs everywhere. CAC keeps its own cac_reads table (it also powers
// community read-presence); FDD + SSJE + VTS live in reflection_reads. The GET
// folds all four together. `ymd` is the caller's LOCAL YYYY-MM-DD.

const router: IRouter = Router();

// A real local calendar day: well-formed AND an actual date (rejects junk like
// 2099-99-99 / 2024-02-30 that the shape regex alone would admit), matching the
// breath route's validation so reflection_reads can't accumulate junk rows.
function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const SOURCES = new Set(["fdd", "ssje", "vts"]);

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

router.post("/reflections/read", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const source = String(req.body?.source ?? "");
  const ymd = String(req.body?.ymd ?? "");
  if (!SOURCES.has(source) || !isValidYmd(ymd)) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    await db
      .insert(reflectionReadsTable)
      .values({ userId, source, ymd })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) {
    console.error("[/reflections/read POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/me/reflections-read", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const ymd = String(req.query.ymd ?? "");
  if (!isValidYmd(ymd)) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    const rows = await db
      .select({ source: reflectionReadsTable.source })
      .from(reflectionReadsTable)
      .where(and(eq(reflectionReadsTable.userId, userId), eq(reflectionReadsTable.ymd, ymd)));
    const present = new Set(rows.map((r) => r.source));
    // CAC lives in its own table (richer community-read feature).
    const cacRows = await db.execute<{ one: number }>(
      sql`SELECT 1 AS one FROM cac_reads WHERE user_id = ${userId} AND ymd = ${ymd} LIMIT 1`,
    );
    res.json({
      cac: cacRows.rows.length > 0,
      fdd: present.has("fdd"),
      ssje: present.has("ssje"),
      vts: present.has("vts"),
    });
  } catch (err) {
    console.error("[/me/reflections-read GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /me/reflection-streak?source=vts&today=YYYY-MM-DD
 *
 * How many PUBLISHING DAYS in a row this reader has opened a reflection, plus
 * how many days in total.
 *
 * Counting calendar days would be wrong for the Dean's Commentary, which
 * publishes weekdays only: a reader who never misses would still watch their
 * streak reset every Saturday. So the walk steps backwards over Mon–Fri and
 * skips weekends entirely — a weekend is not a miss, there was nothing to read.
 *
 * Today is not required to be read yet. The streak is anchored at the most
 * recent publishing day that WAS read, so opening yesterday's and not yet
 * today's still reads as a live streak rather than zero.
 */
router.get("/me/reflection-streak", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const source = String(req.query.source ?? "");
  if (!SOURCES.has(source)) { res.status(400).json({ error: "bad_request" }); return; }
  const today = String(req.query.today ?? "");
  if (!isValidYmd(today)) { res.status(400).json({ error: "bad_request" }); return; }
  try {
    const rows = await db
      .select({ ymd: reflectionReadsTable.ymd })
      .from(reflectionReadsTable)
      .where(and(eq(reflectionReadsTable.userId, userId), eq(reflectionReadsTable.source, source)));
    const read = new Set(rows.map((r) => r.ymd));

    // Date arithmetic on the plain YYYY-MM-DD, in UTC, so no timezone can shift
    // which calendar day a string means. `today` is the reader's own local day.
    const toDate = (ymd: string) => {
      const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
      return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
    };
    const toYmd = (dt: Date) => dt.toISOString().slice(0, 10);
    const isPublishingDay = (dt: Date) => {
      const dow = dt.getUTCDay();
      return dow !== 0 && dow !== 6; // Sun, Sat
    };

    let cursor = toDate(today);
    // Anchor on the latest publishing day that was actually read, so today
    // being unread (or a weekend) doesn't read as a broken streak.
    let guard = 0;
    while (guard++ < 14 && !(isPublishingDay(cursor) && read.has(toYmd(cursor)))) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    let current = 0;
    if (isPublishingDay(cursor) && read.has(toYmd(cursor))) {
      // Walk back over publishing days only; a weekend is stepped over, not counted.
      let steps = 0;
      while (steps++ < 800) {
        if (!isPublishingDay(cursor)) { cursor.setUTCDate(cursor.getUTCDate() - 1); continue; }
        if (!read.has(toYmd(cursor))) break;
        current += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
    }
    res.json({ source, current, totalDays: read.size });
  } catch (err) {
    console.error("[/me/reflection-streak GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
