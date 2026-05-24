import { Router, type IRouter } from "express";
import { db, prayerSessionsTable, prayerSurfaces } from "@workspace/db";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

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
          // Distinct calendar days sat (UTC). Approximate at a day
          // boundary but close enough for a "per day" average; "today"
          // is overridden to 1 below since it's definitionally one day.
          days: sql<number>`COUNT(DISTINCT (${prayerSessionsTable.endedAt})::date)::int`,
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

export default router;
