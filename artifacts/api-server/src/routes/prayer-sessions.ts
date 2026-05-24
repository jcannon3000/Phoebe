import { Router, type IRouter } from "express";
import { db, prayerSessionsTable, prayerSurfaces, appOpensTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

// POST /api/app-open — records that the signed-in user opened/foregrounded
// the app. Stamped into a 15-minute bucket (floor(epoch/900)) with a
// unique (user_id, bucket) index, so rapid re-opens within the window
// collapse to one row. Backs the "people who opened" / "times opened"
// admin metrics. Fire-and-forget from the client; always 200.
router.post("/app-open", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const bucket = Math.floor(Date.now() / 1000 / 900);
    await db
      .insert(appOpensTable)
      .values({ userId: sessionUserId, bucket })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) {
    console.error("[/app-open] failed:", err);
    // Non-fatal — a dropped open ping shouldn't surface an error.
    res.json({ ok: false });
  }
});

// Per-user prayer-time ledger. Client posts a finished session; the
// metrics page reads the rolled-up totals via /api/groups/:slug/metrics.
//
// Anti-cheat:
//   • Sessions < 5 seconds are dropped silently — the user passed
//     through the screen and didn't actually pray. Without this floor
//     a debounced re-mount on a fast back-and-forth would clutter the
//     ledger with sub-second entries.
//   • Sessions > 60 minutes are clamped to 60 — a phone left on a
//     slide overnight shouldn't add 8 hours to the user's "Time
//     praying" total. The client tries to commit on unmount + on
//     visibility change, so a clamped session usually means the user
//     foregrounded the app after a long interval; we keep the row but
//     cap the number.

const SURFACE_SET = new Set<string>(prayerSurfaces);
const MIN_SESSION_SECONDS = 5;
const MAX_SESSION_SECONDS = 60 * 60;

const schema = z.object({
  surface: z.string(),
  durationSeconds: z.number().int().min(0).max(24 * 60 * 60),
  startedAt: z.string(), // ISO
  endedAt: z.string(),   // ISO
  // Optional: max slide index the user advanced to during the session.
  // Office viewer passes it through so metrics can distinguish
  // "actually prayed" (≥3 slides) from "tap-and-bail".
  slidesCompleted: z.number().int().min(0).max(10000).optional(),
});

router.post("/prayer-sessions", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { surface, durationSeconds, startedAt, endedAt, slidesCompleted } = parsed.data;

  if (!SURFACE_SET.has(surface)) {
    res.status(400).json({ error: "Unknown surface" });
    return;
  }
  // The 5-second floor is bypassed for "visit-style" surfaces where
  // the act of opening the page is itself the meaningful event:
  //   • prayer-list — opening your prayer list
  //   • the four office / devotion surfaces — opening an office and
  //     starting to pray. The user wants every office open counted
  //     in the community's people-praying / times-prayed rollups,
  //     even if the session is short. Slideshow keeps the floor
  //     since a 0-second slideshow open is almost always a fat-
  //     finger or a navigation transition.
  const FLOOR_BYPASS_SURFACES = new Set<string>([
    "prayer-list",
    "morning-prayer",
    "evening-prayer",
    "morning-devotion",
    "early-evening-devotion",
  ]);
  if (!FLOOR_BYPASS_SURFACES.has(surface) && durationSeconds < MIN_SESSION_SECONDS) {
    // Drop silently — too short to count as a real prayer session.
    res.json({ ok: true, recorded: false, reason: "below-floor" });
    return;
  }

  // Clamp upper bound. If the client submitted something outrageous we
  // store the clamped value; the user still gets credit for ~an hour.
  const capped = Math.min(durationSeconds, MAX_SESSION_SECONDS);

  const startedAtDate = new Date(startedAt);
  const endedAtDate = new Date(endedAt);
  if (Number.isNaN(startedAtDate.getTime()) || Number.isNaN(endedAtDate.getTime())) {
    res.status(400).json({ error: "Invalid timestamps" });
    return;
  }

  await db.insert(prayerSessionsTable).values({
    userId: sessionUserId,
    surface,
    durationSeconds: capped,
    slidesCompleted: typeof slidesCompleted === "number" ? slidesCompleted : null,
    startedAt: startedAtDate,
    endedAt: endedAtDate,
  });

  res.json({ ok: true, recorded: true, durationSeconds: capped });
});

// GET /api/me/contemplation-stats — the viewer's own contemplation
// figures for the Contemplation page, per window (today / this week —
// rolling 7 days / all time): the SUM of seconds, the session COUNT,
// and the number of distinct DAYS sat in that window, so the client can
// show cumulative time on one row and average-per-day (sum/days) on
// another. Cheap — covered by the (user_id, ended_at) index.
//
// "Today" is the user's LOCAL calendar day, which the server can't know
// on its own, so the client passes its local midnight as ?todaySince=
// (ISO). We fall back to UTC midnight if it's missing or unparseable —
// off by a few hours at worst, never wrong by a day for most users.
router.get("/me/contemplation-stats", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todaySinceParam = typeof req.query.todaySince === "string" ? new Date(req.query.todaySince) : null;
    const todaySince = todaySinceParam && !Number.isNaN(todaySinceParam.getTime())
      ? todaySinceParam
      : new Date(new Date().setUTCHours(0, 0, 0, 0));
    // Caller's IANA timezone — used so distinct days-sat are counted in
    // local time (Postgres `AT TIME ZONE`). Validate the shape before it
    // touches SQL; fall back to UTC on anything unexpected. Bad zone
    // strings would otherwise throw at query time.
    const tzRaw = typeof req.query.tz === "string" ? req.query.tz : "";
    const tz = /^[A-Za-z0-9_+\-/]{1,64}$/.test(tzRaw) ? tzRaw : "UTC";

    const windowStats = async (since: Date | null): Promise<{ seconds: number; count: number; days: number }> => {
      const conds = [
        eq(prayerSessionsTable.userId, sessionUserId),
        eq(prayerSessionsTable.surface, "contemplation"),
      ];
      if (since) conds.push(gte(prayerSessionsTable.endedAt, since));
      const [row] = await db
        .select({
          seconds: sql<number>`COALESCE(SUM(${prayerSessionsTable.durationSeconds}), 0)::int`,
          count: sql<number>`COUNT(*)::int`,
          // Distinct calendar days sat, in the caller's local timezone —
          // so evening sits don't split across UTC midnight and inflate
          // the day count (which deflated the per-day average).
          days: sql<number>`COUNT(DISTINCT (${prayerSessionsTable.endedAt} AT TIME ZONE ${tz})::date)::int`,
        })
        .from(prayerSessionsTable)
        .where(and(...conds));
      return { seconds: row?.seconds ?? 0, count: row?.count ?? 0, days: row?.days ?? 0 };
    };

    const [today, week, all] = await Promise.all([
      windowStats(todaySince),
      windowStats(weekAgo),
      windowStats(null),
    ]);

    res.json({
      todaySeconds: today.seconds,
      todayCount: today.count,
      // Today is one local day — a sit means 1 day, not the UTC-split
      // count, so the per-day average == today's total.
      todayDays: today.count > 0 ? 1 : 0,
      weekSeconds: week.seconds,
      weekCount: week.count,
      weekDays: week.days,
      totalSeconds: all.seconds,
      sessionCount: all.count,
      totalDays: all.days,
    });
  } catch (err) {
    console.error("[/me/contemplation-stats GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/me/contemplation-sessions — the viewer's recent contemplation
// sits, newest first. Powers the History list on the Contemplation page;
// each card shows the date, the time, and how long the sit was.
router.get("/me/contemplation-sessions", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const rows = await db
      .select({
        id: prayerSessionsTable.id,
        startedAt: prayerSessionsTable.startedAt,
        endedAt: prayerSessionsTable.endedAt,
        durationSeconds: prayerSessionsTable.durationSeconds,
      })
      .from(prayerSessionsTable)
      .where(and(
        eq(prayerSessionsTable.userId, sessionUserId),
        eq(prayerSessionsTable.surface, "contemplation"),
      ))
      .orderBy(desc(prayerSessionsTable.endedAt))
      .limit(limit);
    res.json(rows.map((r) => ({
      id: r.id,
      startedAt: r.startedAt ? r.startedAt.toISOString() : null,
      endedAt: r.endedAt ? r.endedAt.toISOString() : null,
      durationSeconds: r.durationSeconds,
    })));
  } catch (err) {
    console.error("[/me/contemplation-sessions GET] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/me/contemplation-sessions — manually log a sit that wasn't
// timed in-app (e.g. you sat away from your phone). Body: how long it was
// and when it happened. Stored as an ordinary contemplation session so it
// rolls into the same cumulative + average-per-day totals. The 12-hour
// cap is generous (retreat sits) but guards against fat-fingered entries.
const manualLogSchema = z.object({
  durationSeconds: z.number().int().min(1).max(12 * 60 * 60),
  // When the sit began (ISO). The client sends the user's chosen local
  // time converted to UTC.
  occurredAt: z.string(),
});
router.post("/me/contemplation-sessions", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = manualLogSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { durationSeconds, occurredAt } = parsed.data;
  const startedAt = new Date(occurredAt);
  if (Number.isNaN(startedAt.getTime())) { res.status(400).json({ error: "Invalid timestamp" }); return; }
  // Reject sits logged in the future (allow a small clock-skew grace).
  if (startedAt.getTime() > Date.now() + 5 * 60 * 1000) {
    res.status(400).json({ error: "Cannot log a sit in the future" });
    return;
  }
  const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
  try {
    const [created] = await db.insert(prayerSessionsTable).values({
      userId: sessionUserId,
      surface: "contemplation",
      durationSeconds,
      slidesCompleted: null,
      startedAt,
      endedAt,
    }).returning({ id: prayerSessionsTable.id });
    res.json({ ok: true, id: created?.id ?? null });
  } catch (err) {
    console.error("[/me/contemplation-sessions POST] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// DELETE /api/me/contemplation-sessions/:id — remove one of the viewer's
// own contemplation sessions (e.g. a mis-entered manual log). Scoped to
// the owner AND the contemplation surface so it can never touch another
// user's rows or a non-contemplation session.
router.delete("/me/contemplation-sessions/:id", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(prayerSessionsTable).where(and(
      eq(prayerSessionsTable.id, id),
      eq(prayerSessionsTable.userId, sessionUserId),
      eq(prayerSessionsTable.surface, "contemplation"),
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[/me/contemplation-sessions DELETE] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
