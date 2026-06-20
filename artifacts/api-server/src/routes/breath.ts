import { Router, type IRouter, type Request, type Response } from "express";
import { db, breathSessionsTable, usersTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getGardenUserIds, getFellowUserIds } from "../lib/garden";
import { perUserRateLimit } from "../lib/rate-limit";
import { ensureActivePartnership } from "./daily-prayer";

// ── Cobreathe ────────────────────────────────────────────────────────
//
//   GET  /api/breath/today?day=YYYY-MM-DD  — today's breath state
//   POST /api/breath/today { day, seconds? } — record today's breath
//
// Both return the same payload:
//   done           — has the caller cobreathed on `day`?
//   count          — everyone who cobreathed on `day` (caller included once
//                    they have)
//   companions     — up to 6 garden members (group peers + correspondents +
//                    fellows) who cobreathed that day, with name + avatar —
//                    the "you breathed with Maria and James" row
//   companionCount — total garden cobreathers that day (companions is capped)
//   myDays         — how many days the caller has ever cobreathed
//   allBreaths     — every breath held across Phoebe since the practice began
//
// "Cobreathe" — from conspire, con + spirare, to breathe together. Each
// person keeps one short guided breath a day, asynchronously; everyone who
// holds the practice on a local-day string shares one count. The client
// separately logs the sit as a contemplation prayer_session so the breath
// counts toward the daily contemplation goal like any other silence.
//
// `day` is the caller's LOCAL calendar day (YYYY-MM-DD), matching the TEXT
// local-day convention used by practice_completion and
// contemplation_health_minutes. People in different timezones who share a
// day string share a breath count — fitting for a practice about
// interconnection, and it means everyone's "today" is their own.

const router: IRouter = Router();

// A real local calendar day: well-formed AND an actual date. The shape
// regex alone admits nonsense like 2099-99-99 or 2024-02-30, which would
// seed a junk breath row (inflating allBreaths / a user's myDays) under a
// day key that no honest client would ever send. Round-trip through UTC to
// reject impossible dates.
function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

type Companion = { userId: number; name: string | null; avatarUrl: string | null };

type BreathPayload = {
  done: boolean;
  count: number;
  companions: Companion[];
  companionCount: number;
  companionIds: number[];
  myDays: number;
  allBreaths: number;
};

async function breathPayload(userId: number, day: string): Promise<BreathPayload> {
  const [mineRows, dayRows, myDaysRows, allRows, gardenIds] = await Promise.all([
    db.select({ id: breathSessionsTable.id })
      .from(breathSessionsTable)
      .where(and(eq(breathSessionsTable.userId, userId), eq(breathSessionsTable.day, day))),
    db.select({ n: sql<number>`COUNT(*)::int` })
      .from(breathSessionsTable)
      .where(eq(breathSessionsTable.day, day)),
    db.select({ n: sql<number>`COUNT(*)::int` })
      .from(breathSessionsTable)
      .where(eq(breathSessionsTable.userId, userId)),
    db.select({ n: sql<number>`COUNT(*)::int` }).from(breathSessionsTable),
    getGardenUserIds(userId),
  ]);

  let companions: Companion[] = [];
  let companionCount = 0;
  let companionIds: number[] = [];
  if (gardenIds.length > 0) {
    const rows = await db
      .select({ userId: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
      .from(breathSessionsTable)
      .innerJoin(usersTable, eq(usersTable.id, breathSessionsTable.userId))
      .where(and(
        eq(breathSessionsTable.day, day),
        inArray(breathSessionsTable.userId, gardenIds),
      ));
    companionCount = rows.length;
    companions = rows.slice(0, 6);
    companionIds = rows.map((r) => r.userId);
  }

  return {
    done: mineRows.length > 0,
    count: dayRows[0]?.n ?? 0,
    companions,
    companionCount,
    companionIds,
    myDays: myDaysRows[0]?.n ?? 0,
    allBreaths: allRows[0]?.n ?? 0,
  };
}

router.get("/breath/today", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const dayRaw = req.query.day;
  const day = typeof dayRaw === "string" && isValidYmd(dayRaw) ? dayRaw : null;
  if (!day) { res.status(400).json({ error: "bad_request" }); return; }

  try {
    res.json(await breathPayload(userId, day));
  } catch (err) {
    console.error("[/breath/today GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/breath/today", perUserRateLimit("breath_record", { max: 20, windowMs: 60 * 1000 }), async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId === null) { res.status(401).json({ error: "not_authenticated" }); return; }

  const day = String(req.body?.day ?? "");
  if (!isValidYmd(day)) { res.status(400).json({ error: "bad_request" }); return; }
  const secondsRaw = Number(req.body?.seconds);
  const seconds = Number.isFinite(secondsRaw) ? Math.max(0, Math.min(3600, Math.round(secondsRaw))) : 0;

  try {
    // Idempotent — one breath per local day; a second sit the same day keeps
    // the first row (and its created_at) rather than duplicating.
    await db
      .insert(breathSessionsTable)
      .values({ userId, day, seconds })
      .onConflictDoNothing({
        target: [breathSessionsTable.userId, breathSessionsTable.day],
      });

    res.json({ ok: true, ...(await breathPayload(userId, day)) });
  } catch (err) {
    console.error("[/breath/today POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /breath/together-with { fellowIds: number[] }
// You just held the breath one-to-one with these fellows (the "Breathe with a
// fellow" mode). Cobreathing together STARTS a Heart to Heart with each of them
// (and makes you Fellows). It also counts toward Walking Together: the breath is
// logged as a contemplation sit (a walk dot), and the new Fellow link makes the
// pair walkable + surfaces "Cobreathed together" on the People page. Idempotent;
// only real fellows are paired.
router.post("/breath/together-with", perUserRateLimit("breath_together_with", { max: 30, windowMs: 60 * 1000 }), async (req: Request, res: Response): Promise<void> => {
  const me = uid(req);
  if (me === null) { res.status(401).json({ error: "not_authenticated" }); return; }
  const raw = (req.body as { fellowIds?: unknown })?.fellowIds;
  const ids = Array.isArray(raw)
    ? raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0 && n !== me)
    : [];
  if (ids.length === 0) { res.json({ ok: true, paired: [] }); return; }
  try {
    const fellowSet = new Set(await getFellowUserIds(me));
    const targets = Array.from(new Set(ids)).filter((id) => fellowSet.has(id)).slice(0, 10);
    for (const fid of targets) {
      try { await ensureActivePartnership(me, fid); }
      catch (e) { console.error("[/breath/together-with] pair failed", fid, e); }
    }
    res.json({ ok: true, paired: targets });
  } catch (err) {
    console.error("[/breath/together-with POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /breath/together — for each of the caller's fellows, the most recent LOCAL
// day they BOTH held the breath (a cobreathe "together"). Cobreathe is async —
// same day, not the same moment — so co-presence is the latest shared day across
// both users' breath_sessions rows. Powers the "last breathed together" line on
// the People page.
router.get("/breath/together", async (req: Request, res: Response): Promise<void> => {
  const me = uid(req);
  if (!me) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const fellowIds = (await getFellowUserIds(me)).filter((id) => id !== me);
    if (fellowIds.length === 0) { res.json({ together: {} }); return; }
    const rows = await db.execute<{ fellow_id: number; last_day: string }>(sql`
      SELECT bf.user_id AS fellow_id, MAX(bf.day) AS last_day
      FROM breath_sessions bf
      JOIN breath_sessions mine ON mine.user_id = ${me} AND mine.day = bf.day
      WHERE bf.user_id IN (${sql.join(fellowIds, sql`, `)})
      GROUP BY bf.user_id
    `);
    const together: Record<number, string> = {};
    for (const r of rows.rows) together[Number(r.fellow_id)] = String(r.last_day);
    res.json({ together });
  } catch (err) {
    console.error("[/breath/together GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
