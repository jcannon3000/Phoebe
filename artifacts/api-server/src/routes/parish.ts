/**
 * Phoebe Parish — server routes for the parish-only tier.
 *
 * Endpoints:
 *   • GET  /api/parishes/public        — list every approved parish
 *                                        (kind="parish" + state="live")
 *                                        for the onboarding picker.
 *   • POST /api/parish/subscribe       — set users.parish_feed_id +
 *                                        write a prayer_feed_subscriptions
 *                                        row. Single-parish enforced
 *                                        server-side (rejects if already
 *                                        set unless body.replace=true).
 *   • DELETE /api/parish/subscribe     — clear the user's parish (drops
 *                                        them back to "unassigned"). Used
 *                                        when changing parishes from
 *                                        Settings → Parish.
 *   • GET  /api/parish/today           — the parish dashboard payload:
 *                                        parish meta + today's 3-slot
 *                                        intercessions + parishioners-
 *                                        praying-this-week count.
 */

import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  db,
  prayerFeedsTable,
  prayerFeedEntriesTable,
  prayerFeedSubscriptionsTable,
  usersTable,
  betaUsersTable,
  prayerSessionsTable,
} from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function getUser(req: { user?: unknown }): { id: number } | null {
  return req.user ? (req.user as { id: number }) : null;
}

function todayInZone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ─── GET /api/parishes/public ─────────────────────────────────────────────
// List every approved (live) parish so the onboarding picker can show
// them. Auth is required (we want to know who's looking) but every
// authenticated user — full, parish-only, or unassigned — can hit this.
router.get("/parishes/public", async (req, res) => {
  if (!getUser(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db
      .select({
        id: prayerFeedsTable.id,
        slug: prayerFeedsTable.slug,
        title: prayerFeedsTable.title,
        tagline: prayerFeedsTable.tagline,
        coverEmoji: prayerFeedsTable.coverEmoji,
        subscriberCount: prayerFeedsTable.subscriberCount,
      })
      .from(prayerFeedsTable)
      .where(and(
        eq(prayerFeedsTable.kind, "parish"),
        eq(prayerFeedsTable.state, "live"),
      ))
      .orderBy(desc(prayerFeedsTable.subscriberCount), asc(prayerFeedsTable.title));
    res.json({ parishes: rows });
  } catch (err) {
    console.error("[parish] list public failed:", err);
    res.status(500).json({ error: "Failed to list parishes" });
  }
});

// ─── POST /api/parish/subscribe ───────────────────────────────────────────
// Set users.parish_feed_id + the matching subscription row. Idempotent
// for the same parish, rejects with 409 for a different one (the user
// has to DELETE first to switch — that's the single-parish rule).
const SubscribeSchema = z.object({
  parishId: z.number().int(),
});

router.post("/parish/subscribe", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = SubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "parishId required" });
    return;
  }
  const { parishId } = parsed.data;

  try {
    const [parish] = await db
      .select()
      .from(prayerFeedsTable)
      .where(and(
        eq(prayerFeedsTable.id, parishId),
        eq(prayerFeedsTable.kind, "parish"),
        eq(prayerFeedsTable.state, "live"),
      ));
    if (!parish) { res.status(404).json({ error: "Parish not found" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.id));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    if (user.parishFeedId !== null && user.parishFeedId !== parishId) {
      res.status(409).json({
        error: "You're already in another parish. Leave it first to switch.",
      });
      return;
    }

    // 1. Stamp the user
    await db
      .update(usersTable)
      .set({ parishFeedId: parishId })
      .where(eq(usersTable.id, session.id));

    // 2. Write the subscription row (idempotent — onConflictDoNothing
    //    on the existing (feedId,userId) unique index)
    await db
      .insert(prayerFeedSubscriptionsTable)
      .values({ feedId: parishId, userId: session.id })
      .onConflictDoNothing();

    // 3. Bump the feed's denormalized subscriber count
    await db
      .update(prayerFeedsTable)
      .set({
        subscriberCount: sql`(SELECT COUNT(*) FROM prayer_feed_subscriptions WHERE feed_id = ${parishId})`,
      })
      .where(eq(prayerFeedsTable.id, parishId));

    res.json({ ok: true, parishId });
  } catch (err) {
    console.error("[parish] subscribe failed:", err);
    res.status(500).json({ error: "Failed to join parish" });
  }
});

// ─── DELETE /api/parish/subscribe ─────────────────────────────────────────
// Clear the user's parish. Drops the subscription row + nulls out
// users.parish_feed_id. Used when switching parishes from Settings.
router.delete("/parish/subscribe", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.id));
    if (!user || user.parishFeedId === null) {
      res.json({ ok: true });
      return;
    }
    const oldParishId = user.parishFeedId;

    await db
      .update(usersTable)
      .set({ parishFeedId: null })
      .where(eq(usersTable.id, session.id));

    await db
      .delete(prayerFeedSubscriptionsTable)
      .where(and(
        eq(prayerFeedSubscriptionsTable.feedId, oldParishId),
        eq(prayerFeedSubscriptionsTable.userId, session.id),
      ));

    await db
      .update(prayerFeedsTable)
      .set({
        subscriberCount: sql`(SELECT COUNT(*) FROM prayer_feed_subscriptions WHERE feed_id = ${oldParishId})`,
      })
      .where(eq(prayerFeedsTable.id, oldParishId));

    res.json({ ok: true });
  } catch (err) {
    console.error("[parish] unsubscribe failed:", err);
    res.status(500).json({ error: "Failed to leave parish" });
  }
});

// ─── GET /api/parish/today ────────────────────────────────────────────────
// Payload for the parish dashboard:
//   • parish: the user's parish meta
//   • todayEntries: up to 3 published slot entries for today
//   • parishionersPrayingThisWeek: distinct users in this parish who
//     have logged any prayer-session-log row in the rolling 7-day window
router.get("/parish/today", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.id));
    if (!user || user.parishFeedId === null) {
      res.status(404).json({ error: "No parish" });
      return;
    }

    const [parish] = await db
      .select({
        id: prayerFeedsTable.id,
        slug: prayerFeedsTable.slug,
        title: prayerFeedsTable.title,
        tagline: prayerFeedsTable.tagline,
        coverEmoji: prayerFeedsTable.coverEmoji,
        timezone: prayerFeedsTable.timezone,
      })
      .from(prayerFeedsTable)
      .where(eq(prayerFeedsTable.id, user.parishFeedId));
    if (!parish) {
      res.status(404).json({ error: "Parish not found" });
      return;
    }

    const today = todayInZone(parish.timezone);

    const todayEntries = await db
      .select({
        id: prayerFeedEntriesTable.id,
        slot: prayerFeedEntriesTable.slot,
        title: prayerFeedEntriesTable.title,
        body: prayerFeedEntriesTable.body,
        scriptureRef: prayerFeedEntriesTable.scriptureRef,
        state: prayerFeedEntriesTable.state,
        prayCount: prayerFeedEntriesTable.prayCount,
      })
      .from(prayerFeedEntriesTable)
      .where(and(
        eq(prayerFeedEntriesTable.feedId, parish.id),
        eq(prayerFeedEntriesTable.entryDate, today),
        eq(prayerFeedEntriesTable.state, "published"),
      ))
      .orderBy(asc(prayerFeedEntriesTable.slot));

    // Parishioners praying this week — distinct users who:
    //  (a) belong to this parish (subscription row), AND
    //  (b) have a prayer_sessions row in the last 7 days
    // Capped at 7 days of activity to keep the line meaningful.
    const weekRows = await db.execute<{ count: string }>(sql`
      SELECT COUNT(DISTINCT ps.user_id)::text AS count
      FROM prayer_sessions ps
      INNER JOIN prayer_feed_subscriptions pfs
        ON pfs.user_id = ps.user_id AND pfs.feed_id = ${parish.id}
      WHERE ps.ended_at > NOW() - INTERVAL '7 days'
    `);
    const parishionersPrayingThisWeek = Number(weekRows.rows[0]?.count ?? "0");

    res.json({
      parish,
      todayEntries,
      parishionersPrayingThisWeek,
    });
  } catch (err) {
    console.error("[parish] today failed:", err);
    res.status(500).json({ error: "Failed to load parish today" });
  }
});

// ─── GET /api/parish/celebration ──────────────────────────────────────────
//
// Powers the closing screen a parish-only user sees after finishing
// an office or devotion — "N from your parish prayed today, M this
// week". Distinct from /parish/today (which is the dashboard payload):
// celebration zooms in on the just-completed session and the
// surrounding community signal.
//
// Optional ?surface= query — one of "morning-prayer" / "evening-prayer"
// / "morning-devotion" / "early-evening-devotion" / "slideshow" —
// scopes the today-count to that one liturgy. No surface = aggregate
// across all surfaces (used as a fallback if the client doesn't know
// which one just finished).
router.get("/parish/celebration", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.id));
    if (!user || user.parishFeedId === null) {
      res.status(404).json({ error: "No parish" });
      return;
    }
    const [parish] = await db
      .select({
        id: prayerFeedsTable.id,
        slug: prayerFeedsTable.slug,
        title: prayerFeedsTable.title,
        timezone: prayerFeedsTable.timezone,
      })
      .from(prayerFeedsTable)
      .where(eq(prayerFeedsTable.id, user.parishFeedId));
    if (!parish) {
      res.status(404).json({ error: "Parish not found" });
      return;
    }

    const surface = typeof req.query.surface === "string" ? req.query.surface : null;
    const today = todayInZone(parish.timezone);

    // Parish today + this-week counts — distinct user_ids who logged a
    // prayer_session in (today, last 7 days). Joined to subscriptions
    // so non-parishioners can't pad the count.
    const [todayRows, weekRows, todayFaceRows] = await Promise.all([
      db.execute<{ count: string }>(sql`
        SELECT COUNT(DISTINCT ps.user_id)::text AS count
        FROM prayer_sessions ps
        INNER JOIN prayer_feed_subscriptions pfs
          ON pfs.user_id = ps.user_id AND pfs.feed_id = ${parish.id}
        WHERE (ps.ended_at AT TIME ZONE ${parish.timezone})::date = ${today}::date
          ${surface ? sql`AND ps.surface = ${surface}` : sql``}
      `),
      db.execute<{ count: string }>(sql`
        SELECT COUNT(DISTINCT ps.user_id)::text AS count
        FROM prayer_sessions ps
        INNER JOIN prayer_feed_subscriptions pfs
          ON pfs.user_id = ps.user_id AND pfs.feed_id = ${parish.id}
        WHERE ps.ended_at > NOW() - INTERVAL '7 days'
      `),
      // Up to 7 faces of distinct parishioners who prayed today
      // (not counting the viewer — the slide is "who else carried
      // this with me", not a self-portrait).
      db.execute<{ user_id: number; name: string | null; avatar_url: string | null }>(sql`
        SELECT DISTINCT ON (u.id) u.id AS user_id, u.name, u.avatar_url
        FROM prayer_sessions ps
        INNER JOIN prayer_feed_subscriptions pfs
          ON pfs.user_id = ps.user_id AND pfs.feed_id = ${parish.id}
        INNER JOIN users u ON u.id = ps.user_id
        WHERE (ps.ended_at AT TIME ZONE ${parish.timezone})::date = ${today}::date
          AND ps.user_id != ${session.id}
        ORDER BY u.id, ps.ended_at DESC
        LIMIT 7
      `),
    ]);

    const prayedTodayCount = Number(todayRows.rows[0]?.count ?? "0");
    const prayedWeekCount = Number(weekRows.rows[0]?.count ?? "0");
    const faces = todayFaceRows.rows.map((r) => ({
      userId: r.user_id,
      name: r.name ?? "Someone",
      avatarUrl: r.avatar_url,
    }));

    res.json({
      parish: {
        id: parish.id,
        slug: parish.slug,
        title: parish.title,
      },
      prayedTodayCount,
      prayedWeekCount,
      faces,
      surface,
    });
  } catch (err) {
    console.error("[parish] celebration failed:", err);
    res.status(500).json({ error: "Failed to load celebration" });
  }
});

// ─── GET /api/parish/prefs ────────────────────────────────────────────────
// Office reminder prefs (and parish meta for the settings page header).
router.get("/parish/prefs", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.id));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    // Whether the caller can manage their current parish — used by the
    // settings UI to surface the "Admin" link only for parish creators
    // and Phoebe staff. Non-managers don't see a link they can't act on.
    let canManage = false;
    if (user.parishFeedId !== null) {
      const result = await canManageParish(session.id, user.parishFeedId);
      canManage = result.allowed;
    }
    res.json({
      morning: user.parishOfficeMorningPref ?? "none",
      evening: user.parishOfficeEveningPref ?? "none",
      morningTime: user.parishOfficeMorningTime ?? null,
      parishFeedId: user.parishFeedId,
      canManage,
    });
  } catch (err) {
    console.error("[parish] prefs failed:", err);
    res.status(500).json({ error: "Failed to load prefs" });
  }
});

// ─── PUT /api/parish/prefs ────────────────────────────────────────────────
// Update office reminder prefs. Idempotent — partial updates allowed
// (the body's keys merge into the existing values).
const PrefSchema = z.object({
  morning: z.enum(["none", "office", "devotion"]).optional(),
  evening: z.enum(["none", "office", "devotion"]).optional(),
  morningTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

router.put("/parish/prefs", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = PrefSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: String(parsed.error) });
    return;
  }
  try {
    const update: Record<string, unknown> = {};
    if (parsed.data.morning !== undefined) update.parishOfficeMorningPref = parsed.data.morning;
    if (parsed.data.evening !== undefined) update.parishOfficeEveningPref = parsed.data.evening;
    if (parsed.data.morningTime !== undefined) update.parishOfficeMorningTime = parsed.data.morningTime;
    if (Object.keys(update).length === 0) { res.json({ ok: true }); return; }
    await db.update(usersTable).set(update).where(eq(usersTable.id, session.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[parish] prefs update failed:", err);
    res.status(500).json({ error: "Failed to save prefs" });
  }
});

// ─── Admin: who can manage this parish? ───────────────────────────────────
//
// A user can manage a parish if:
//   • they're the creator (creator_user_id matches), OR
//   • they're a Phoebe beta admin (beta_users.is_admin = true)
// Mirrors canEditFeed in prayer-feeds.ts but adapted for parishes
// (we always require kind="parish" so a "general" feed doesn't
// accidentally fall under parish admin tooling).
async function canManageParish(userId: number, parishId: number): Promise<{
  allowed: boolean;
  parish: typeof prayerFeedsTable.$inferSelect | null;
}> {
  const [parish] = await db
    .select()
    .from(prayerFeedsTable)
    .where(and(
      eq(prayerFeedsTable.id, parishId),
      eq(prayerFeedsTable.kind, "parish"),
    ));
  if (!parish) return { allowed: false, parish: null };
  if (parish.creatorUserId === userId) return { allowed: true, parish };
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return { allowed: false, parish };
  const [admin] = await db
    .select({ isAdmin: betaUsersTable.isAdmin })
    .from(betaUsersTable)
    .where(eq(betaUsersTable.email, u.email.toLowerCase()));
  return { allowed: !!admin?.isAdmin, parish };
}

// ─── GET /api/parish/admin/parishes ───────────────────────────────────────
// List of parishes the caller can manage. Lets the admin UI build a
// switcher when a Phoebe staff account oversees multiple congregations.
router.get("/parish/admin/parishes", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, session.id));
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [admin] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    const isStaffAdmin = !!admin?.isAdmin;

    // Beta admins see every parish; everyone else only sees parishes
    // they personally created.
    const rows = isStaffAdmin
      ? await db
          .select({
            id: prayerFeedsTable.id,
            slug: prayerFeedsTable.slug,
            title: prayerFeedsTable.title,
            timezone: prayerFeedsTable.timezone,
            state: prayerFeedsTable.state,
            subscriberCount: prayerFeedsTable.subscriberCount,
          })
          .from(prayerFeedsTable)
          .where(eq(prayerFeedsTable.kind, "parish"))
          .orderBy(asc(prayerFeedsTable.title))
      : await db
          .select({
            id: prayerFeedsTable.id,
            slug: prayerFeedsTable.slug,
            title: prayerFeedsTable.title,
            timezone: prayerFeedsTable.timezone,
            state: prayerFeedsTable.state,
            subscriberCount: prayerFeedsTable.subscriberCount,
          })
          .from(prayerFeedsTable)
          .where(and(
            eq(prayerFeedsTable.kind, "parish"),
            eq(prayerFeedsTable.creatorUserId, session.id),
          ))
          .orderBy(asc(prayerFeedsTable.title));
    res.json({ parishes: rows, isStaffAdmin });
  } catch (err) {
    console.error("[parish] admin parishes failed:", err);
    res.status(500).json({ error: "Failed to list parishes" });
  }
});

// ─── GET /api/parish/admin/metrics ────────────────────────────────────────
//
// Aggregate prayer-session metrics for a parish over a rolling window
// (default 7 days). Returns:
//   • totals: { sessions, distinctPrayers, totalSeconds }
//   • bySurface: per-liturgy breakdown (morning-prayer, evening-prayer,
//     morning-devotion, early-evening-devotion, slideshow)
//   • daily: per-day rollup so the dashboard can render a sparkline
//     or bar chart
const MetricsSchema = z.object({
  parishId: z.coerce.number().int(),
  days: z.coerce.number().int().min(1).max(90).optional().default(7),
});

router.get("/parish/admin/metrics", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = MetricsSchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }
  const { parishId, days } = parsed.data;

  try {
    const { allowed, parish } = await canManageParish(session.id, parishId);
    if (!allowed || !parish) {
      res.status(403).json({ error: "Not authorized to manage this parish" });
      return;
    }

    const tz = parish.timezone || "America/New_York";

    const [totalsRow, surfaceRows, dailyRows] = await Promise.all([
      db.execute<{ sessions: string; distinct_prayers: string; total_seconds: string }>(sql`
        SELECT
          COUNT(*)::text AS sessions,
          COUNT(DISTINCT ps.user_id)::text AS distinct_prayers,
          COALESCE(SUM(ps.duration_seconds), 0)::text AS total_seconds
        FROM prayer_sessions ps
        INNER JOIN prayer_feed_subscriptions pfs
          ON pfs.user_id = ps.user_id AND pfs.feed_id = ${parishId}
        WHERE ps.ended_at > NOW() - (${days}::int * INTERVAL '1 day')
      `),
      db.execute<{
        surface: string;
        sessions: string;
        distinct_prayers: string;
        total_seconds: string;
      }>(sql`
        SELECT
          ps.surface,
          COUNT(*)::text AS sessions,
          COUNT(DISTINCT ps.user_id)::text AS distinct_prayers,
          COALESCE(SUM(ps.duration_seconds), 0)::text AS total_seconds
        FROM prayer_sessions ps
        INNER JOIN prayer_feed_subscriptions pfs
          ON pfs.user_id = ps.user_id AND pfs.feed_id = ${parishId}
        WHERE ps.ended_at > NOW() - (${days}::int * INTERVAL '1 day')
        GROUP BY ps.surface
        ORDER BY total_seconds DESC
      `),
      db.execute<{
        day: string;
        sessions: string;
        distinct_prayers: string;
        total_seconds: string;
      }>(sql`
        SELECT
          (ps.ended_at AT TIME ZONE ${tz})::date::text AS day,
          COUNT(*)::text AS sessions,
          COUNT(DISTINCT ps.user_id)::text AS distinct_prayers,
          COALESCE(SUM(ps.duration_seconds), 0)::text AS total_seconds
        FROM prayer_sessions ps
        INNER JOIN prayer_feed_subscriptions pfs
          ON pfs.user_id = ps.user_id AND pfs.feed_id = ${parishId}
        WHERE ps.ended_at > NOW() - (${days}::int * INTERVAL '1 day')
        GROUP BY day
        ORDER BY day ASC
      `),
    ]);

    const t = totalsRow.rows[0] ?? { sessions: "0", distinct_prayers: "0", total_seconds: "0" };

    res.json({
      parish: {
        id: parish.id,
        slug: parish.slug,
        title: parish.title,
        timezone: tz,
        subscriberCount: parish.subscriberCount,
      },
      windowDays: days,
      totals: {
        sessions: Number(t.sessions),
        distinctPrayers: Number(t.distinct_prayers),
        totalSeconds: Number(t.total_seconds),
      },
      bySurface: surfaceRows.rows.map((r) => ({
        surface: r.surface,
        sessions: Number(r.sessions),
        distinctPrayers: Number(r.distinct_prayers),
        totalSeconds: Number(r.total_seconds),
      })),
      daily: dailyRows.rows.map((r) => ({
        day: r.day,
        sessions: Number(r.sessions),
        distinctPrayers: Number(r.distinct_prayers),
        totalSeconds: Number(r.total_seconds),
      })),
    });
  } catch (err) {
    console.error("[parish] admin metrics failed:", err);
    res.status(500).json({ error: "Failed to load metrics" });
  }
});

void prayerSessionsTable;

export default router;
