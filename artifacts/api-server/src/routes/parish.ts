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
    res.json({
      morning: user.parishOfficeMorningPref ?? "none",
      evening: user.parishOfficeEveningPref ?? "none",
      morningTime: user.parishOfficeMorningTime ?? null,
      parishFeedId: user.parishFeedId,
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

void prayerSessionsTable;

export default router;
