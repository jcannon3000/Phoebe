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
import { and, asc, desc, eq, sql, inArray, isNull } from "drizzle-orm";
import {
  db,
  prayerFeedsTable,
  prayerFeedSubscriptionsTable,
  prayerRequestsTable,
  usersTable,
  betaUsersTable,
  prayerSessionsTable,
  parishAdminsTable,
  parishOpportunitiesTable,
  parishOpportunityInterestsTable,
  parishRuleAdoptionsTable,
  parishPrayerListTable,
  parishPrayerListPrayersTable,
  prescribedRoutinesTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { isUserBeta } from "../lib/parishGate";
import { todayInZone } from "../lib/tz";
import { perUserRateLimit } from "../lib/rate-limit";
import { sendPushToUsers } from "../lib/pushSender";
import { sanitizeSpec, applyRoutineSpecToUser } from "../lib/routineSpec";
import { practicedThisWeek } from "./groups";
import { readParishStandingIntercessions } from "../lib/assembleIntercessions";

const router: IRouter = Router();

function getUser(req: { user?: unknown }): { id: number } | null {
  return req.user ? (req.user as { id: number }) : null;
}

// todayInZone (today's YYYY-MM-DD in an IANA zone) lives in ../lib/tz.

// ─── GET /api/parishes/public ─────────────────────────────────────────────
// List every approved (live) parish so the onboarding picker can show
// them. Auth is required (we want to know who's looking) but every
// authenticated user — full, parish-only, or unassigned — can hit this.
router.get("/parishes/public", async (req, res) => {
  if (!getUser(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    // Optional name search: `?q=` filters the directory by parish title. A short
    // query (< 2 chars) is ignored so the picker still shows the full list. LIKE
    // wildcards are escaped so a typed %/_ can't widen the match set.
    const q = ((req.query.q as string) || "").trim();
    const nameFilter = q.length >= 2
      ? sql`${prayerFeedsTable.title} ILIKE ${`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`
      : undefined;
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
        // Only PUBLIC parishes are discoverable. Private-by-default means a
        // parish stays off the picker (and unjoinable) until its priest
        // publishes it from the manage page.
        eq(prayerFeedsTable.visibility, "public"),
        ...(nameFilter ? [nameFilter] : []),
      ))
      .orderBy(desc(prayerFeedsTable.subscriberCount), asc(prayerFeedsTable.title))
      .limit(60);
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

  // Beta-only gate while Parish is in private beta. Non-beta users
  // never become parish-only — they fall through to the regular
  // full-app experience. Beta admins (is_admin=true) also qualify
  // since the helper checks beta_users membership regardless of role.
  if (!(await isUserBeta(session.id))) {
    res.status(403).json({ error: "Parish is currently in private beta." });
    return;
  }

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

    // A private parish isn't openly joinable: only its own admins (previewing)
    // or someone already subscribed may pass. Public parishes are open to any
    // beta user who found them in the picker. This backs the private-by-default
    // guarantee — without it, anyone could join a private parish by id and read
    // its members / post to its pastoral inbox.
    if (parish.visibility !== "public"
      && user.parishFeedId !== parishId
      && !(await canManageParish(session.id, parishId)).allowed) {
      res.status(403).json({ error: "This parish isn't open to join." });
      return;
    }

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

    // Clean up the rule adoption too — leaving shouldn't leave the user counted
    // among those keeping the parish's rhythm. Delete their adoption row for the
    // parish's current rule and decrement the denormalized accept count (floored
    // at 0), so "taken up by N" doesn't drift high with departed members. (The
    // adopted rhythm stays applied to their own account — leaving a parish
    // doesn't reset a routine they chose; Settings → Reset routine does that.)
    const [oldParish] = await db
      .select({ ruleRoutineId: prayerFeedsTable.ruleRoutineId })
      .from(prayerFeedsTable).where(eq(prayerFeedsTable.id, oldParishId));
    const ruleId = oldParish?.ruleRoutineId ?? null;
    if (ruleId != null) {
      const removed = await db
        .delete(parishRuleAdoptionsTable)
        .where(and(
          eq(parishRuleAdoptionsTable.ruleId, ruleId),
          eq(parishRuleAdoptionsTable.userId, session.id),
        ))
        .returning({ id: parishRuleAdoptionsTable.id });
      if (removed.length > 0) {
        await db
          .update(prescribedRoutinesTable)
          .set({ acceptCount: sql`GREATEST(0, ${prescribedRoutinesTable.acceptCount} - 1)` })
          .where(eq(prescribedRoutinesTable.id, ruleId));
      }
    }

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

    // Parish intercessions are a STANDING list (up to 7 dateless
    // templates the priest programs once), carried every day — not a
    // per-day slate. Read the same set the office surfaces. `isBcp`
    // marks a slot whose body is a full Book of Common Prayer prayer.
    // (prayCount/scriptureRef are kept in the shape for client
    // back-compat; the standing list doesn't track per-slot pray counts
    // — solidarity is the aggregate parishionersPrayingThisWeek below.)
    const standing = await readParishStandingIntercessions(parish.id, parish.timezone);
    const todayEntries = standing.map((e) => ({
      id: e.id,
      slot: e.slot,
      title: e.title,
      body: e.body,
      scriptureRef: null as string | null,
      state: "published" as const,
      prayCount: 0,
      isBcp: e.source === "bcp",
    }));

    // Parishioners praying this week — distinct users who:
    //  (a) belong to this parish (subscription row), AND
    //  (b) REALLY practiced in the last 7 days — a completed office (the
    //      app-wide office invariant) or any ≥60s practice; a sub-minute glance
    //      or a prayer-list open (which logs a session on sight) does NOT count.
    // Same predicate as the shared `practicedThisWeek` helper, so this marquee
    // agrees with the rule card's "prayed with your parish" line beneath it.
    const weekRows = await db.execute<{ count: string }>(sql`
      SELECT COUNT(DISTINCT ps.user_id)::text AS count
      FROM prayer_sessions ps
      INNER JOIN prayer_feed_subscriptions pfs
        ON pfs.user_id = ps.user_id AND pfs.feed_id = ${parish.id}
      WHERE ps.ended_at > NOW() - INTERVAL '7 days'
        AND (ps.completed = true OR (ps.surface <> 'prayer-list' AND ps.duration_seconds >= 60))
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
        creatorUserId: prayerFeedsTable.creatorUserId,
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
    // so non-parishioners can't pad the count. Plus the distinct set who
    // prayed TODAY, so we can name the LEADER if they prayed alongside you.
    const [todayRows, weekRows, todayIdRows] = await Promise.all([
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
      db.execute<{ user_id: number }>(sql`
        SELECT DISTINCT ps.user_id
        FROM prayer_sessions ps
        INNER JOIN prayer_feed_subscriptions pfs
          ON pfs.user_id = ps.user_id AND pfs.feed_id = ${parish.id}
        WHERE (ps.ended_at AT TIME ZONE ${parish.timezone})::date = ${today}::date
          ${surface ? sql`AND ps.surface = ${surface}` : sql``}
      `),
    ]);

    const prayedTodayCount = Number(todayRows.rows[0]?.count ?? "0");
    const prayedWeekCount = Number(weekRows.rows[0]?.count ?? "0");

    // Parish presence is TOP-DOWN: name the LEADER when they prayed with you
    // today (priest/creator preferred, else any admin), and count everyone else
    // anonymously. We deliberately do NOT expose fellow parishioners' names or
    // faces to each other — that would identify who prays (and when) to peers,
    // and in a small parish a single face is an exact identification.
    const prayedToday = new Set(
      todayIdRows.rows.map((r) => Number(r.user_id)).filter((n) => Number.isFinite(n)),
    );
    prayedToday.delete(session.id);
    let leaderName: string | null = null;
    let leaderAvatarUrl: string | null = null;
    const leaderIds = await parishAdminUserIds(parish.id);
    const creatorId = parish.creatorUserId ?? null;
    const namedLeaderId = (creatorId != null && prayedToday.has(creatorId))
      ? creatorId
      : (leaderIds.find((id) => prayedToday.has(id)) ?? null);
    if (namedLeaderId != null) {
      const [lu] = await db
        .select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
        .from(usersTable).where(eq(usersTable.id, namedLeaderId));
      const nm = (lu?.name ?? "").trim();
      if (nm) { leaderName = nm; leaderAvatarUrl = lu?.avatarUrl ?? null; }
    }

    res.json({
      parish: {
        id: parish.id,
        slug: parish.slug,
        title: parish.title,
      },
      prayedTodayCount,
      prayedWeekCount,
      leaderName,
      leaderAvatarUrl,
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
export async function canManageParish(userId: number, parishId: number): Promise<{
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
  // The original creator is implicitly an admin (no parish_admins row
  // required for them — they're the seed).
  if (parish.creatorUserId === userId) return { allowed: true, parish };
  // Additional admins, granted by the creator (or by another admin)
  // via POST /api/parishes/:slug/admins.
  const [coAdmin] = await db
    .select({ id: parishAdminsTable.id })
    .from(parishAdminsTable)
    .where(and(
      eq(parishAdminsTable.parishFeedId, parish.id),
      eq(parishAdminsTable.userId, userId),
    ));
  if (coAdmin) return { allowed: true, parish };
  // Phoebe staff (beta_users.is_admin) retain global manage powers
  // for support purposes.
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return { allowed: false, parish };
  const [staffAdmin] = await db
    .select({ isAdmin: betaUsersTable.isAdmin })
    .from(betaUsersTable)
    .where(eq(betaUsersTable.email, u.email.toLowerCase()));
  return { allowed: !!staffAdmin?.isAdmin, parish };
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
            visibility: prayerFeedsTable.visibility,
            subscriberCount: prayerFeedsTable.subscriberCount,
          })
          .from(prayerFeedsTable)
          .where(eq(prayerFeedsTable.kind, "parish"))
          .orderBy(asc(prayerFeedsTable.title))
      // Non-staff: parishes the user CREATED or was added to as a
      // co-admin (parish_admins). DISTINCT because the join can
      // multiply a creator-also-listed row.
      : await db
          .selectDistinct({
            id: prayerFeedsTable.id,
            slug: prayerFeedsTable.slug,
            title: prayerFeedsTable.title,
            timezone: prayerFeedsTable.timezone,
            state: prayerFeedsTable.state,
            visibility: prayerFeedsTable.visibility,
            subscriberCount: prayerFeedsTable.subscriberCount,
          })
          .from(prayerFeedsTable)
          .leftJoin(parishAdminsTable, and(
            eq(parishAdminsTable.parishFeedId, prayerFeedsTable.id),
            eq(parishAdminsTable.userId, session.id),
          ))
          .where(and(
            eq(prayerFeedsTable.kind, "parish"),
            sql`(${prayerFeedsTable.creatorUserId} = ${session.id} OR ${parishAdminsTable.id} IS NOT NULL)`,
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

// ─── Parish "pastoral concerns" ────────────────────────────────────────
//
// A parishioner submits a prayer request privately to their parish
// admin. The request is stored in the normal prayer_requests table with
// parish_feed_id set — that scoping is what hides it from every other
// visibility query in the system (garden, slideshow, office). The
// parish admin sees a dedicated inbox at /parish/concerns and can
// respond pastorally; nothing else ever surfaces these to the rest of
// the community.

const SubmitConcernSchema = z.object({
  parishId: z.number().int(),
  body: z.string().min(1).max(2000),
  isAnonymous: z.boolean().optional().default(false),
});

router.post("/parish/concerns", perUserRateLimit("parish_concern", { max: 30, windowMs: 60 * 60 * 1000 }), async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = SubmitConcernSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { parishId, body, isAnonymous } = parsed.data;

  try {
    // The submitter must be subscribed to the parish they're writing
    // to. We check the canonical pointer (users.parish_feed_id) rather
    // than the subscription row so a user who's parked on a different
    // parish can't post into a sibling congregation's inbox.
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.id));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    if (user.parishFeedId !== parishId) {
      res.status(403).json({ error: "Not subscribed to this parish." });
      return;
    }

    // Verify the parish itself exists + is live.
    const [parish] = await db
      .select()
      .from(prayerFeedsTable)
      .where(and(
        eq(prayerFeedsTable.id, parishId),
        eq(prayerFeedsTable.kind, "parish"),
      ));
    if (!parish) { res.status(404).json({ error: "Parish not found" }); return; }

    const [created] = await db.insert(prayerRequestsTable).values({
      ownerId: session.id,
      parishFeedId: parishId,
      body,
      isAnonymous,
      // Don't even persist the name on an anonymous concern — anonymity should
      // be a property of the stored row, not just a read-time mask that one
      // future reader-bug could strip.
      createdByName: isAnonymous ? null : (user.name ?? null),
      // Concerns don't auto-expire — the parish admin can mark them
      // resolved manually. Leaving expiresAt null mirrors the
      // existing "no expiry" path used by long-running asks.
      expiresAt: null,
    }).returning();

    res.status(201).json({ ok: true, id: created.id });
  } catch (err) {
    console.error("[parish] submit concern failed:", err);
    res.status(500).json({ error: "Failed to submit." });
  }
});

router.get("/parish/admin/concerns", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parishId = Number(req.query.parishId);
  if (!Number.isFinite(parishId)) {
    res.status(400).json({ error: "parishId required" });
    return;
  }

  try {
    const { allowed } = await canManageParish(session.id, parishId);
    if (!allowed) {
      res.status(403).json({ error: "Not authorized to manage this parish" });
      return;
    }

    // Return every concern for this parish, newest first. We include
    // the owner's name + avatar UNLESS the row is anonymous — the
    // parish admin sees attribution unless the submitter explicitly
    // chose not to.
    const rows = await db
      .select({
        id: prayerRequestsTable.id,
        body: prayerRequestsTable.body,
        isAnonymous: prayerRequestsTable.isAnonymous,
        isAnswered: prayerRequestsTable.isAnswered,
        createdAt: prayerRequestsTable.createdAt,
        ownerId: prayerRequestsTable.ownerId,
        ownerName: usersTable.name,
        ownerAvatarUrl: usersTable.avatarUrl,
        ownerEmail: usersTable.email,
      })
      .from(prayerRequestsTable)
      .leftJoin(usersTable, eq(usersTable.id, prayerRequestsTable.ownerId))
      .where(and(
        eq(prayerRequestsTable.parishFeedId, parishId),
        sql`${prayerRequestsTable.closedAt} IS NULL`,
      ))
      .orderBy(desc(prayerRequestsTable.createdAt));

    res.json({
      concerns: rows.map((r) => ({
        id: r.id,
        body: r.body,
        isAnonymous: r.isAnonymous,
        isAnswered: r.isAnswered,
        createdAt: r.createdAt.toISOString(),
        owner: r.isAnonymous
          ? null
          : { id: r.ownerId, name: r.ownerName, avatarUrl: r.ownerAvatarUrl, email: r.ownerEmail },
      })),
    });
  } catch (err) {
    console.error("[parish] admin concerns failed:", err);
    res.status(500).json({ error: "Failed to load concerns." });
  }
});

// Parish admin marks a pastoral concern as answered / closed. Closing
// removes it from the active inbox view; the row stays in the DB for
// the requester's prayer-list history if they choose to view it.
router.post("/parish/admin/concerns/:id/close", async (req, res) => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  try {
    const [row] = await db
      .select({
        id: prayerRequestsTable.id,
        parishFeedId: prayerRequestsTable.parishFeedId,
      })
      .from(prayerRequestsTable)
      .where(eq(prayerRequestsTable.id, id));
    if (!row || row.parishFeedId === null) {
      res.status(404).json({ error: "Concern not found" });
      return;
    }

    const { allowed } = await canManageParish(session.id, row.parishFeedId);
    if (!allowed) {
      res.status(403).json({ error: "Not authorized." });
      return;
    }

    await db
      .update(prayerRequestsTable)
      .set({ closedAt: new Date(), closeReason: "parish-admin-closed" })
      .where(eq(prayerRequestsTable.id, id));

    res.json({ ok: true });
  } catch (err) {
    console.error("[parish] close concern failed:", err);
    res.status(500).json({ error: "Failed to close." });
  }
});

// ─── Parish creation (self-serve) + co-admin management ───────────────────
// Any beta user can create a new parish — they become its first admin
// and are subscribed automatically. The creator can then grant the
// same admin powers to other beta users by email.
//
// Parishes are private-by-default; the creator flips visibility from
// the manage page if they want a public discovery link. Sluug
// generation is deterministic + collision-padded so two churches with
// the same name don't fight.

import crypto from "crypto";

function slugifyParishName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "parish";
}

// A real IANA zone name — guards against a bad timezone being stored and later
// blowing up the AT TIME ZONE queries on the parish dashboard/metrics.
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const createParishSchema = z.object({
  title: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(200).optional(),
  coverEmoji: z.string().trim().max(8).optional(),
  timezone: z.string().trim().max(60).optional(),
});

router.post("/parishes", perUserRateLimit("parish_create", { max: 10, windowMs: 60 * 60 * 1000 }), async (req, res): Promise<void> => {
  const session = req.user ? (req.user as { id: number }) : null;
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Beta-gated for now. The schema-level capacity is built but the
  // product surface is still in pilot.
  if (!(await isUserBeta(session.id))) {
    res.status(403).json({ error: "Parish creation is in beta." });
    return;
  }
  const parsed = createParishSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { title, tagline, coverEmoji, timezone } = parsed.data;
  if (timezone && !isValidTimeZone(timezone)) {
    res.status(400).json({ error: "Invalid timezone" });
    return;
  }

  // Mint a unique slug. First try the slugified title; if taken, suffix
  // a short random hex segment until we land on a fresh one. (Two
  // collisions in a row is essentially impossible with 24-bit suffixes
  // so the bounded loop is just a defensive cap.)
  let slug = slugifyParishName(title);
  for (let attempt = 0; attempt < 5; attempt++) {
    const [existing] = await db.select({ id: prayerFeedsTable.id })
      .from(prayerFeedsTable).where(eq(prayerFeedsTable.slug, slug)).limit(1);
    if (!existing) break;
    slug = `${slugifyParishName(title)}-${crypto.randomBytes(3).toString("hex")}`;
  }

  try {
    const [parish] = await db
      .insert(prayerFeedsTable)
      .values({
        slug,
        title,
        tagline: tagline ?? null,
        coverEmoji: coverEmoji ?? "⛪",
        timezone: timezone ?? "America/New_York",
        kind: "parish",
        state: "live",
        visibility: "private",
        creatorUserId: session.id,
      })
      .returning();

    // Auto-subscribe the creator. They're the seed parishioner; the
    // single-parish rule (users.parish_feed_id) follows the existing
    // subscribe handler's invariant.
    await db.update(usersTable)
      .set({ parishFeedId: parish.id })
      .where(eq(usersTable.id, session.id));
    await db.insert(prayerFeedSubscriptionsTable).values({
      feedId: parish.id,
      userId: session.id,
    }).onConflictDoNothing();
    await db.update(prayerFeedsTable)
      .set({
        // Derive the count rather than trusting a blind literal 1 — if the
        // creator auto-subscribe above ever no-ops, this stays honest.
        subscriberCount: sql`(SELECT COUNT(*) FROM prayer_feed_subscriptions WHERE feed_id = ${parish.id})`,
        updatedAt: new Date(),
      })
      .where(eq(prayerFeedsTable.id, parish.id));

    res.status(201).json({ parish });
  } catch (err) {
    console.error("[/parishes POST] failed:", err);
    res.status(500).json({ error: "Couldn't create parish." });
  }
});

// Add another admin to a parish — by email so a creator doesn't need
// to know the user's id. Allowed for any caller who already manages
// the parish (creator or existing co-admin).
router.post("/parishes/:slug/admins", perUserRateLimit("parish_add_admin", { max: 20, windowMs: 60 * 60 * 1000 }), async (req, res): Promise<void> => {
  const session = req.user ? (req.user as { id: number }) : null;
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const slug = String(req.params.slug);
  const [parish] = await db.select().from(prayerFeedsTable)
    .where(and(eq(prayerFeedsTable.slug, slug), eq(prayerFeedsTable.kind, "parish")));
  if (!parish) { res.status(404).json({ error: "Parish not found" }); return; }
  const { allowed } = await canManageParish(session.id, parish.id);
  if (!allowed) { res.status(403).json({ error: "Admin only." }); return; }
  const email = String((req.body as { email?: unknown } | undefined)?.email ?? "")
    .trim().toLowerCase().slice(0, 320);
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }
  const [target] = await db.select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable).where(eq(usersTable.email, email));
  if (!target) {
    res.status(404).json({ error: "No Phoebe account found for that email." });
    return;
  }
  if (target.id === parish.creatorUserId) {
    res.status(409).json({ error: "That person is already the parish creator." });
    return;
  }
  try {
    await db.insert(parishAdminsTable).values({
      parishFeedId: parish.id,
      userId: target.id,
      addedByUserId: session.id,
    }).onConflictDoNothing();
    res.json({ ok: true, name: target.name });
  } catch (err) {
    console.error("[/parishes/:slug/admins POST] failed:", err);
    res.status(500).json({ error: "Couldn't add admin." });
  }
});

router.delete("/parishes/:slug/admins/:userId", async (req, res): Promise<void> => {
  const session = req.user ? (req.user as { id: number }) : null;
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const slug = String(req.params.slug);
  const targetUserId = parseInt(String(req.params.userId), 10);
  if (!Number.isFinite(targetUserId)) {
    res.status(400).json({ error: "Invalid user id" }); return;
  }
  const [parish] = await db.select().from(prayerFeedsTable)
    .where(and(eq(prayerFeedsTable.slug, slug), eq(prayerFeedsTable.kind, "parish")));
  if (!parish) { res.status(404).json({ error: "Parish not found" }); return; }
  const { allowed } = await canManageParish(session.id, parish.id);
  if (!allowed) { res.status(403).json({ error: "Admin only." }); return; }
  if (targetUserId === parish.creatorUserId) {
    res.status(400).json({ error: "The creator can't be removed — transfer ownership first." });
    return;
  }
  await db.delete(parishAdminsTable).where(and(
    eq(parishAdminsTable.parishFeedId, parish.id),
    eq(parishAdminsTable.userId, targetUserId),
  ));
  res.json({ ok: true });
});

// PUT /api/parishes/:slug/visibility — publish or unpublish a parish. Public =
// discoverable in the onboarding picker + openly joinable; private = off the
// picker and joinable only by admins/existing members. Admin only.
router.put("/parishes/:slug/visibility", async (req, res): Promise<void> => {
  const session = req.user ? (req.user as { id: number }) : null;
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const slug = String(req.params.slug);
  const raw = (req.body as { visibility?: unknown } | undefined)?.visibility;
  const visibility = raw === "public" ? "public" : raw === "private" ? "private" : null;
  if (!visibility) { res.status(400).json({ error: "visibility must be 'public' or 'private'" }); return; }
  const [parish] = await db.select().from(prayerFeedsTable)
    .where(and(eq(prayerFeedsTable.slug, slug), eq(prayerFeedsTable.kind, "parish")));
  if (!parish) { res.status(404).json({ error: "Parish not found" }); return; }
  const { allowed } = await canManageParish(session.id, parish.id);
  if (!allowed) { res.status(403).json({ error: "Admin only." }); return; }
  // PUBLISHING a parish (making it public + openly joinable) requires Phoebe
  // staff review — a real congregation shouldn't be listed on a name that no one
  // vetted (impersonation risk: a fake "St. Mark's" could collect pastoral
  // concerns). A parish admin can create + run their parish and UNPUBLISH it
  // themselves, but only staff can flip it public.
  if (visibility === "public" && parish.visibility !== "public") {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, session.id));
    const [staff] = u ? await db.select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase())) : [];
    if (!staff?.isAdmin) {
      res.status(403).json({ error: "A parish is listed publicly only after Phoebe reviews it. Ask us to publish yours." });
      return;
    }
  }
  try {
    await db.update(prayerFeedsTable)
      .set({ visibility, updatedAt: new Date() })
      .where(eq(prayerFeedsTable.id, parish.id));
    res.json({ ok: true, visibility });
  } catch (err) {
    console.error("[/parishes/:slug/visibility PUT] failed:", err);
    res.status(500).json({ error: "Couldn't update visibility." });
  }
});

// List the admins of a parish for the manage UI: creator + co-admins.
router.get("/parishes/:slug/admins", async (req, res): Promise<void> => {
  const session = req.user ? (req.user as { id: number }) : null;
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const slug = String(req.params.slug);
  const [parish] = await db.select().from(prayerFeedsTable)
    .where(and(eq(prayerFeedsTable.slug, slug), eq(prayerFeedsTable.kind, "parish")));
  if (!parish) { res.status(404).json({ error: "Parish not found" }); return; }
  const { allowed } = await canManageParish(session.id, parish.id);
  if (!allowed) { res.status(403).json({ error: "Admin only." }); return; }
  const coAdmins = await db
    .select({
      userId: parishAdminsTable.userId,
      name: usersTable.name,
      email: usersTable.email,
      createdAt: parishAdminsTable.createdAt,
    })
    .from(parishAdminsTable)
    .innerJoin(usersTable, eq(usersTable.id, parishAdminsTable.userId))
    .where(eq(parishAdminsTable.parishFeedId, parish.id));
  const [creator] = parish.creatorUserId != null
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, parish.creatorUserId))
    : [];
  res.json({
    creator: creator
      ? { userId: creator.id, name: creator.name, email: creator.email }
      : null,
    coAdmins: coAdmins.map((c) => ({
      userId: c.userId,
      name: c.name,
      email: c.email,
      addedAt: c.createdAt.toISOString(),
    })),
  });
});

// ─── "Ways to get involved" opportunities ──────────────────────────────────
// A priest (parish admin) publishes opportunities — worship roles, service
// ministries, community groups — and parishioners tap "I'm interested", which
// notifies the admins. Writes gated by canManageParish; reads require the
// caller to be subscribed to that parish (users.parish_feed_id) OR an admin.

const OPP_CATEGORIES = ["worship", "serve", "community", "other"] as const;

const OpportunityBodySchema = z.object({
  parishId: z.number().int().positive(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(OPP_CATEGORIES).default("other"),
  scheduleNote: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(200).optional(),
});

// The user ids of everyone who can manage a parish: the feed creator plus any
// parish_admins rows. Used to notify admins when someone raises their hand.
async function parishAdminUserIds(parishId: number): Promise<number[]> {
  const [feed] = await db
    .select({ creatorUserId: prayerFeedsTable.creatorUserId })
    .from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.id, parishId));
  const rows = await db
    .select({ userId: parishAdminsTable.userId })
    .from(parishAdminsTable)
    .where(eq(parishAdminsTable.parishFeedId, parishId));
  const ids = new Set<number>(rows.map((r) => r.userId));
  if (feed?.creatorUserId) ids.add(feed.creatorUserId);
  return [...ids];
}

// GET /api/parish/opportunities?parishId= — the parishioner's "get involved"
// board: every non-archived opportunity for their parish, with a count of how
// many have raised their hand and whether the viewer has.
router.get("/parish/opportunities", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parishId = Number(req.query.parishId);
  if (!Number.isFinite(parishId)) { res.status(400).json({ error: "parishId required" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.id));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    // Subscribers see their own parish; admins can preview any parish they manage.
    const isSubscriber = user.parishFeedId === parishId;
    const isAdmin = (await canManageParish(session.id, parishId)).allowed;
    if (!isSubscriber && !isAdmin) { res.status(403).json({ error: "Not subscribed to this parish." }); return; }

    const opps = await db
      .select()
      .from(parishOpportunitiesTable)
      .where(and(
        eq(parishOpportunitiesTable.parishFeedId, parishId),
        isNull(parishOpportunitiesTable.archivedAt),
      ))
      .orderBy(asc(parishOpportunitiesTable.createdAt));

    const oppIds = opps.map((o) => o.id);
    const counts = new Map<number, number>();
    const mine = new Set<number>();
    if (oppIds.length > 0) {
      const countRows = await db
        .select({ opportunityId: parishOpportunityInterestsTable.opportunityId, n: sql<number>`count(*)::int` })
        .from(parishOpportunityInterestsTable)
        .where(inArray(parishOpportunityInterestsTable.opportunityId, oppIds))
        .groupBy(parishOpportunityInterestsTable.opportunityId);
      for (const r of countRows) counts.set(r.opportunityId, r.n);
      const mineRows = await db
        .select({ opportunityId: parishOpportunityInterestsTable.opportunityId })
        .from(parishOpportunityInterestsTable)
        .where(and(
          inArray(parishOpportunityInterestsTable.opportunityId, oppIds),
          eq(parishOpportunityInterestsTable.userId, session.id),
        ));
      for (const r of mineRows) mine.add(r.opportunityId);
    }

    res.json({
      isAdmin,
      opportunities: opps.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        category: o.category,
        scheduleNote: o.scheduleNote,
        contact: o.contact,
        interestCount: counts.get(o.id) ?? 0,
        viewerInterested: mine.has(o.id),
      })),
    });
  } catch (err) {
    console.error("[parish] list opportunities failed:", err);
    res.status(500).json({ error: "Failed to load opportunities." });
  }
});

// POST /api/parish/admin/opportunities — create (admin only).
router.post("/parish/admin/opportunities", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = OpportunityBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { parishId, title, description, category, scheduleNote, contact } = parsed.data;
  try {
    const { allowed } = await canManageParish(session.id, parishId);
    if (!allowed) { res.status(403).json({ error: "Not a parish admin." }); return; }
    const [created] = await db.insert(parishOpportunitiesTable).values({
      parishFeedId: parishId,
      title,
      description: description || null,
      category,
      scheduleNote: scheduleNote || null,
      contact: contact || null,
      createdByUserId: session.id,
    }).returning();
    res.status(201).json({ ok: true, id: created.id });
  } catch (err) {
    console.error("[parish] create opportunity failed:", err);
    res.status(500).json({ error: "Failed to create." });
  }
});

// PUT /api/parish/admin/opportunities/:id — edit (admin only).
router.put("/parish/admin/opportunities/:id", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = OpportunityBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { parishId, title, description, category, scheduleNote, contact } = parsed.data;
  try {
    const [opp] = await db.select().from(parishOpportunitiesTable).where(eq(parishOpportunitiesTable.id, id));
    if (!opp || opp.parishFeedId !== parishId) { res.status(404).json({ error: "Not found" }); return; }
    const { allowed } = await canManageParish(session.id, parishId);
    if (!allowed) { res.status(403).json({ error: "Not a parish admin." }); return; }
    await db.update(parishOpportunitiesTable).set({
      title, description: description || null, category,
      scheduleNote: scheduleNote || null, contact: contact || null,
      updatedAt: new Date(),
    }).where(eq(parishOpportunitiesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[parish] edit opportunity failed:", err);
    res.status(500).json({ error: "Failed to save." });
  }
});

// POST /api/parish/admin/opportunities/:id/archive — soft-archive (admin only).
router.post("/parish/admin/opportunities/:id/archive", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [opp] = await db.select().from(parishOpportunitiesTable).where(eq(parishOpportunitiesTable.id, id));
    if (!opp) { res.status(404).json({ error: "Not found" }); return; }
    const { allowed } = await canManageParish(session.id, opp.parishFeedId);
    if (!allowed) { res.status(403).json({ error: "Not a parish admin." }); return; }
    await db.update(parishOpportunitiesTable)
      .set({ archivedAt: new Date() })
      .where(eq(parishOpportunitiesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[parish] archive opportunity failed:", err);
    res.status(500).json({ error: "Failed to remove." });
  }
});

// GET /api/parish/admin/opportunities/:id/interests — who raised their hand.
router.get("/parish/admin/opportunities/:id/interests", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [opp] = await db.select().from(parishOpportunitiesTable).where(eq(parishOpportunitiesTable.id, id));
    if (!opp) { res.status(404).json({ error: "Not found" }); return; }
    const { allowed } = await canManageParish(session.id, opp.parishFeedId);
    if (!allowed) { res.status(403).json({ error: "Not a parish admin." }); return; }
    const rows = await db
      .select()
      .from(parishOpportunityInterestsTable)
      .where(eq(parishOpportunityInterestsTable.opportunityId, id))
      .orderBy(desc(parishOpportunityInterestsTable.createdAt));
    res.json({
      title: opp.title,
      interests: rows.map((r) => ({
        name: r.name, email: r.email, note: r.note, at: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[parish] list interests failed:", err);
    res.status(500).json({ error: "Failed to load." });
  }
});

// POST /api/parish/opportunities/:id/interest — a parishioner raises their hand.
// Idempotent (unique on (opportunity, user)); notifies parish admins on the
// FIRST insert only. Rate-limited so the button can't spam admin lock screens.
router.post(
  "/parish/opportunities/:id/interest",
  perUserRateLimit("parish_opportunity_interest", { max: 40, windowMs: 60 * 60 * 1000 }),
  async (req, res): Promise<void> => {
    const session = getUser(req);
    if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const note = typeof (req.body as { note?: unknown })?.note === "string"
      ? (req.body as { note: string }).note.trim().slice(0, 500) : null;
    try {
      const [opp] = await db.select().from(parishOpportunitiesTable).where(eq(parishOpportunitiesTable.id, id));
      if (!opp || opp.archivedAt) { res.status(404).json({ error: "Not found" }); return; }
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.id));
      if (!user || user.parishFeedId !== opp.parishFeedId) {
        res.status(403).json({ error: "Not subscribed to this parish." }); return;
      }
      // Was there already an interest row? (For idempotent "don't re-notify".)
      const [existing] = await db.select({ id: parishOpportunityInterestsTable.id })
        .from(parishOpportunityInterestsTable)
        .where(and(
          eq(parishOpportunityInterestsTable.opportunityId, id),
          eq(parishOpportunityInterestsTable.userId, session.id),
        ));
      await db.insert(parishOpportunityInterestsTable).values({
        opportunityId: id,
        userId: session.id,
        name: user.name ?? null,
        email: user.email ?? null,
        note,
      }).onConflictDoUpdate({
        target: [parishOpportunityInterestsTable.opportunityId, parishOpportunityInterestsTable.userId],
        set: { name: user.name ?? null, note },
      });

      // Notify the parish admins on the first hand-raise only.
      if (!existing) {
        const adminIds = (await parishAdminUserIds(opp.parishFeedId)).filter((uid) => uid !== session.id);
        if (adminIds.length > 0) {
          const who = (user.name || "Someone").split(/\s+/)[0] || "Someone";
          void sendPushToUsers(adminIds, {
            title: `${who} is interested`,
            body: `"${opp.title}" — tap to see who's raising their hand.`,
            path: `/parish/admin`,
            threadId: "parish-opportunity",
            collapseId: `parish-opp-${id}`,
          }).catch((err) => console.warn("[parish] interest push failed:", err));
        }
      }
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("[parish] express interest failed:", err);
      res.status(500).json({ error: "Failed to submit." });
    }
  },
);

// DELETE /api/parish/opportunities/:id/interest — withdraw interest.
router.delete("/parish/opportunities/:id/interest", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(parishOpportunityInterestsTable).where(and(
      eq(parishOpportunityInterestsTable.opportunityId, id),
      eq(parishOpportunityInterestsTable.userId, session.id),
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[parish] withdraw interest failed:", err);
    res.status(500).json({ error: "Failed." });
  }
});

// ═══ Leader's prayer list — the priest's ongoing intentions the parish prays
//     WITH them ═══════════════════════════════════════════════════════════════
// Top-down + participatory: the priest keeps a list of prayer intentions and the
// congregation taps "Pray" on each (idempotent), so the priest sees how many are
// praying alongside them. Distinct from the day-scoped intercession slots and the
// private pastoral concerns.

// GET /api/parish/prayer-list?parishId= — active items + prayedCount + viewerPrayed.
router.get("/parish/prayer-list", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parishId = Number(req.query.parishId);
  if (!Number.isFinite(parishId)) { res.status(400).json({ error: "parishId required" }); return; }
  try {
    const [user] = await db.select({ parishFeedId: usersTable.parishFeedId }).from(usersTable).where(eq(usersTable.id, session.id));
    const isSubscriber = !!user && user.parishFeedId === parishId;
    const isAdmin = (await canManageParish(session.id, parishId)).allowed;
    if (!isSubscriber && !isAdmin) { res.status(403).json({ error: "Not subscribed to this parish." }); return; }
    const items = await db.select()
      .from(parishPrayerListTable)
      .where(and(eq(parishPrayerListTable.parishFeedId, parishId), isNull(parishPrayerListTable.archivedAt)))
      .orderBy(asc(parishPrayerListTable.createdAt));
    const ids = items.map((i) => i.id);
    const counts = new Map<number, number>();
    const mine = new Set<number>();
    if (ids.length > 0) {
      const countRows = await db
        .select({ itemId: parishPrayerListPrayersTable.itemId, n: sql<number>`count(*)::int` })
        .from(parishPrayerListPrayersTable)
        .where(inArray(parishPrayerListPrayersTable.itemId, ids))
        .groupBy(parishPrayerListPrayersTable.itemId);
      for (const r of countRows) counts.set(r.itemId, r.n);
      const mineRows = await db
        .select({ itemId: parishPrayerListPrayersTable.itemId })
        .from(parishPrayerListPrayersTable)
        .where(and(inArray(parishPrayerListPrayersTable.itemId, ids), eq(parishPrayerListPrayersTable.userId, session.id)));
      for (const r of mineRows) mine.add(r.itemId);
    }
    res.json({
      isAdmin,
      items: items.map((i) => ({
        id: i.id,
        body: i.body,
        prayedCount: counts.get(i.id) ?? 0,
        viewerPrayed: mine.has(i.id),
      })),
    });
  } catch (err) {
    console.error("[parish] prayer-list get failed:", err);
    res.status(500).json({ error: "Failed to load the prayer list." });
  }
});

const PrayerListBodySchema = z.object({
  parishId: z.number().int(),
  body: z.string().trim().min(1).max(2000),
});

// POST /api/parish/admin/prayer-list — add an item (admin only).
router.post("/parish/admin/prayer-list", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = PrayerListBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { parishId, body } = parsed.data;
  try {
    const { allowed } = await canManageParish(session.id, parishId);
    if (!allowed) { res.status(403).json({ error: "Not a parish admin." }); return; }
    const [created] = await db.insert(parishPrayerListTable).values({
      parishFeedId: parishId,
      body,
      createdByUserId: session.id,
    }).returning({ id: parishPrayerListTable.id });
    res.status(201).json({ ok: true, id: created?.id });
  } catch (err) {
    console.error("[parish] prayer-list add failed:", err);
    res.status(500).json({ error: "Failed to add." });
  }
});

// POST /api/parish/admin/prayer-list/:id/archive — soft-archive (admin only).
router.post("/parish/admin/prayer-list/:id/archive", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [item] = await db.select().from(parishPrayerListTable).where(eq(parishPrayerListTable.id, id));
    if (!item) { res.status(404).json({ error: "Not found" }); return; }
    const { allowed } = await canManageParish(session.id, item.parishFeedId);
    if (!allowed) { res.status(403).json({ error: "Not a parish admin." }); return; }
    await db.update(parishPrayerListTable).set({ archivedAt: new Date() }).where(eq(parishPrayerListTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[parish] prayer-list archive failed:", err);
    res.status(500).json({ error: "Failed to remove." });
  }
});

// POST /api/parish/prayer-list/:id/pray — a parishioner prays WITH the leader.
// Idempotent (unique on (item, user)); rate-limited.
router.post(
  "/parish/prayer-list/:id/pray",
  perUserRateLimit("parish_prayer_list_pray", { max: 120, windowMs: 60 * 60 * 1000 }),
  async (req, res): Promise<void> => {
    const session = getUser(req);
    if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    try {
      const [item] = await db.select().from(parishPrayerListTable).where(eq(parishPrayerListTable.id, id));
      if (!item || item.archivedAt) { res.status(404).json({ error: "Not found" }); return; }
      const [user] = await db.select({ parishFeedId: usersTable.parishFeedId }).from(usersTable).where(eq(usersTable.id, session.id));
      if (!user || user.parishFeedId !== item.parishFeedId) { res.status(403).json({ error: "Not subscribed to this parish." }); return; }
      await db.insert(parishPrayerListPrayersTable)
        .values({ itemId: id, userId: session.id })
        .onConflictDoNothing();
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("[parish] prayer-list pray failed:", err);
      res.status(500).json({ error: "Failed." });
    }
  },
);

// DELETE /api/parish/prayer-list/:id/pray — stop praying it.
router.delete("/parish/prayer-list/:id/pray", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(parishPrayerListPrayersTable).where(and(
      eq(parishPrayerListPrayersTable.itemId, id),
      eq(parishPrayerListPrayersTable.userId, session.id),
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[parish] prayer-list unpray failed:", err);
    res.status(500).json({ error: "Failed." });
  }
});

// ═══ Parish standing rule of life — the always-on parish rhythm ══════════════
//
// The priest sets ONE daily rhythm for the whole congregation (prayer_feeds
// .rule_routine_id → a prescribed_routines row). Parishioners adopt it in one
// tap (applies it to their account, same machinery as a routine link) and then
// see a "you prayed with your parish this week" signal — praying WITH the
// congregation, top-down. Mirrors the community rule of life, parish-scoped.

// GET /api/parish/rule?parishId= — the parish's rhythm (subscriber or admin).
router.get("/parish/rule", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parishId = Number(req.query.parishId);
  if (!Number.isFinite(parishId)) { res.status(400).json({ error: "parishId required" }); return; }
  try {
    const [user] = await db.select({ parishFeedId: usersTable.parishFeedId }).from(usersTable).where(eq(usersTable.id, session.id));
    const isSubscriber = !!user && user.parishFeedId === parishId;
    const isAdmin = (await canManageParish(session.id, parishId)).allowed;
    if (!isSubscriber && !isAdmin) { res.status(403).json({ error: "Not subscribed to this parish." }); return; }
    const [feed] = await db.select({ ruleRoutineId: prayerFeedsTable.ruleRoutineId, title: prayerFeedsTable.title })
      .from(prayerFeedsTable).where(eq(prayerFeedsTable.id, parishId));
    const ruleId = feed?.ruleRoutineId ?? null;
    if (!ruleId) { res.json({ rule: null, isAdmin, parishTitle: feed?.title ?? null }); return; }
    const [row] = await db.select({
      label: prescribedRoutinesTable.label, spec: prescribedRoutinesTable.spec, acceptCount: prescribedRoutinesTable.acceptCount,
    }).from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.id, ruleId)).limit(1);
    if (!row) { res.json({ rule: null, isAdmin, parishTitle: feed?.title ?? null }); return; }
    const [adoption] = await db.select({ id: parishRuleAdoptionsTable.id })
      .from(parishRuleAdoptionsTable)
      .where(and(eq(parishRuleAdoptionsTable.ruleId, ruleId), eq(parishRuleAdoptionsTable.userId, session.id)))
      .limit(1);
    res.json({ rule: { label: row.label, spec: row.spec, adoptCount: row.acceptCount }, isAdmin, viewerAdopted: !!adoption, parishTitle: feed?.title ?? null });
  } catch (err) {
    console.error("[parish] get rule failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// PUT /api/parish/rule — the priest sets (or replaces) the parish rhythm. Mints
// a NEW prescribed_routines row and moves the pointer (adopt count starts fresh).
router.put("/parish/rule", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = (req.body ?? {}) as { parishId?: unknown; spec?: unknown; label?: unknown };
  const parishId = typeof body.parishId === "number" ? body.parishId : NaN;
  if (!Number.isFinite(parishId)) { res.status(400).json({ error: "parishId required" }); return; }
  const { allowed } = await canManageParish(session.id, parishId);
  if (!allowed) { res.status(403).json({ error: "Not a parish admin." }); return; }
  const spec = sanitizeSpec(body.spec);
  if (!spec) { res.status(400).json({ error: "Invalid routine spec" }); return; }
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
  try {
    // Remember the rule being REPLACED so we can nudge the people who adopted it.
    const [prev] = await db.select({ ruleRoutineId: prayerFeedsTable.ruleRoutineId })
      .from(prayerFeedsTable).where(eq(prayerFeedsTable.id, parishId));
    const prevRuleId = prev?.ruleRoutineId ?? null;

    const token = crypto.randomBytes(16).toString("hex");
    const [inserted] = await db.insert(prescribedRoutinesTable).values({
      token, groupId: null, createdByUserId: session.id, label, spec,
    }).returning({ id: prescribedRoutinesTable.id });
    if (!inserted) { res.status(500).json({ error: "internal_error" }); return; }
    await db.update(prayerFeedsTable).set({ ruleRoutineId: inserted.id, updatedAt: new Date() }).where(eq(prayerFeedsTable.id, parishId));
    res.json({ ok: true });

    // Notify + re-prompt (product decision): when a rhythm is REPLACED, the
    // people who had taken up the old one keep it applied but are no longer
    // counted (adoption is keyed on the rule id), and their dashboard card now
    // re-offers "Take up this rhythm." Nudge them so the change isn't silent —
    // they choose whether to move to the new rhythm. Best-effort, after the
    // response; never nudge the editor themselves.
    if (prevRuleId != null && prevRuleId !== inserted.id) {
      void (async () => {
        try {
          const adopters = await db.select({ userId: parishRuleAdoptionsTable.userId })
            .from(parishRuleAdoptionsTable).where(eq(parishRuleAdoptionsTable.ruleId, prevRuleId));
          const ids = [...new Set(adopters.map((a) => a.userId).filter((n): n is number => n != null))]
            .filter((uid) => uid !== session.id)
            .slice(0, 2000); // safety cap on the fan-out for a very large parish
          if (ids.length > 0) {
            const [feed] = await db.select({ title: prayerFeedsTable.title })
              .from(prayerFeedsTable).where(eq(prayerFeedsTable.id, parishId));
            const where = feed?.title ? `${feed.title} updated its daily rhythm` : "Your parish updated its daily rhythm";
            await sendPushToUsers(ids, {
              title: where,
              body: "Take another look and choose whether to walk the new rhythm.",
              path: "/parish",
              threadId: "parish-rule",
              collapseId: `parish-rule-${parishId}`,
            });
          }
        } catch (err) { console.warn("[parish] rule-change nudge failed:", err); }
      })();
    }
  } catch (err) {
    console.error("[parish] set rule failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/parish/rule/adopt — a parishioner takes up the parish rhythm.
router.post("/parish/rule/adopt", perUserRateLimit("parish_rule_adopt", { max: 30, windowMs: 60 * 60 * 1000 }), async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parishId = typeof (req.body as { parishId?: unknown })?.parishId === "number" ? (req.body as { parishId: number }).parishId : NaN;
  if (!Number.isFinite(parishId)) { res.status(400).json({ error: "parishId required" }); return; }
  try {
    const [user] = await db.select({ parishFeedId: usersTable.parishFeedId }).from(usersTable).where(eq(usersTable.id, session.id));
    if (!user || user.parishFeedId !== parishId) { res.status(403).json({ error: "Not subscribed to this parish." }); return; }
    const [feed] = await db.select({ ruleRoutineId: prayerFeedsTable.ruleRoutineId }).from(prayerFeedsTable).where(eq(prayerFeedsTable.id, parishId));
    const ruleId = feed?.ruleRoutineId ?? null;
    if (!ruleId) { res.status(404).json({ error: "This parish has no rhythm yet" }); return; }
    const [row] = await db.select({ id: prescribedRoutinesTable.id, spec: prescribedRoutinesTable.spec })
      .from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.id, ruleId)).limit(1);
    const spec = row ? sanitizeSpec(row.spec) : null;
    if (!row || !spec) { res.status(422).json({ error: "Rhythm is no longer valid" }); return; }
    await applyRoutineSpecToUser(session.id, spec);
    // Record the adoption idempotently; only bump the parish-wide count the
    // FIRST time this member takes up this rhythm (re-tapping re-applies the
    // spec but can't inflate the count).
    const inserted = await db.insert(parishRuleAdoptionsTable)
      .values({ ruleId: row.id, userId: session.id })
      .onConflictDoNothing()
      .returning({ id: parishRuleAdoptionsTable.id });
    if (inserted.length > 0) {
      await db.update(prescribedRoutinesTable).set({ acceptCount: sql`${prescribedRoutinesTable.acceptCount} + 1` }).where(eq(prescribedRoutinesTable.id, row.id));
    }
    res.json({ ok: true, ruleConfig: spec.ruleConfig });
  } catch (err) {
    console.error("[parish] adopt rule failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/parish/prayed-with-week?parishId=&weekStart= — "you prayed with
// {the priest} and N others from your parish this week." Top-down parish, so we
// deliberately NAME the parish's leader (the priest — its creator, or an admin)
// when they prayed this week; everyone else stays an aggregate count. N = distinct
// OTHER subscribers with ≥1 practice signal this week, EXCLUDING the named leader.
router.get("/parish/prayed-with-week", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parishId = Number(req.query.parishId);
  if (!Number.isFinite(parishId)) { res.status(400).json({ error: "parishId required" }); return; }
  const weekStartRaw = typeof req.query.weekStart === "string" ? req.query.weekStart : "";
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw)
    ? weekStartRaw
    : (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); })();
  try {
    const [user] = await db.select({ parishFeedId: usersTable.parishFeedId }).from(usersTable).where(eq(usersTable.id, session.id));
    if (!user || user.parishFeedId !== parishId) { res.json({ count: 0, viewerPracticed: false, leaderName: null }); return; }
    const subs = await db.select({ userId: prayerFeedSubscriptionsTable.userId })
      .from(prayerFeedSubscriptionsTable).where(eq(prayerFeedSubscriptionsTable.feedId, parishId));
    const ids = [...new Set(subs.map((s) => s.userId).filter((n): n is number => n != null))];
    if (ids.length <= 1) { res.json({ count: 0, viewerPracticed: false, leaderName: null }); return; }
    const practiced = await practicedThisWeek(ids, weekStart);
    const viewerPracticed = practiced.has(session.id);
    practiced.delete(session.id);

    // Name the parish leader who prayed with them — prefer the priest (creator),
    // else any admin who prayed. Only when it isn't the viewer, and they have a
    // name to show; then pull them out of the anonymous "others" count.
    let leaderName: string | null = null;
    const [feedRow] = await db.select({ creatorUserId: prayerFeedsTable.creatorUserId })
      .from(prayerFeedsTable).where(eq(prayerFeedsTable.id, parishId));
    const leaderIds = await parishAdminUserIds(parishId);
    const creatorId = feedRow?.creatorUserId ?? null;
    const namedLeaderId = (creatorId != null && practiced.has(creatorId))
      ? creatorId
      : (leaderIds.find((id) => practiced.has(id)) ?? null);
    if (namedLeaderId != null) {
      const [lu] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, namedLeaderId));
      const nm = (lu?.name ?? "").trim();
      if (nm) { leaderName = nm; practiced.delete(namedLeaderId); }
    }

    res.json({ count: practiced.size, viewerPracticed, leaderName });
  } catch (err) {
    console.error("[parish] prayed-with-week failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/parish/breathed-with-leader-today — for the Co-Breathe close: name
// the viewer's parish leader (the priest — its creator, else an admin) IF they
// also co-breathed today, so the close can say "you breathe with {priest} and N
// others today." Returns { leaderName, leaderAvatarUrl } (both null when the
// viewer has no parish, or no leader breathed today). Fails soft (never blocks
// the close screen).
router.get("/parish/breathed-with-leader-today", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.json({ leaderName: null, leaderAvatarUrl: null }); return; }
  try {
    const [user] = await db.select({ parishFeedId: usersTable.parishFeedId }).from(usersTable).where(eq(usersTable.id, session.id));
    const parishId = user?.parishFeedId ?? null;
    if (parishId == null) { res.json({ leaderName: null, leaderAvatarUrl: null }); return; }
    const [parish] = await db.select({ timezone: prayerFeedsTable.timezone, creatorUserId: prayerFeedsTable.creatorUserId })
      .from(prayerFeedsTable).where(eq(prayerFeedsTable.id, parishId));
    if (!parish) { res.json({ leaderName: null, leaderAvatarUrl: null }); return; }
    const leaderIds = (await parishAdminUserIds(parishId)).filter((id) => id !== session.id);
    if (leaderIds.length === 0) { res.json({ leaderName: null, leaderAvatarUrl: null }); return; }
    const today = todayInZone(parish.timezone);
    const rows = await db.select({ userId: prayerSessionsTable.userId })
      .from(prayerSessionsTable)
      .where(and(
        inArray(prayerSessionsTable.userId, leaderIds),
        eq(prayerSessionsTable.source, "cobreathe"),
        sql`(${prayerSessionsTable.endedAt} AT TIME ZONE ${parish.timezone})::date = ${today}::date`,
      ));
    const breathed = new Set(rows.map((r) => r.userId).filter((n): n is number => n != null));
    const namedId = (parish.creatorUserId != null && breathed.has(parish.creatorUserId))
      ? parish.creatorUserId
      : (leaderIds.find((id) => breathed.has(id)) ?? null);
    if (namedId == null) { res.json({ leaderName: null, leaderAvatarUrl: null }); return; }
    const [lu] = await db.select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl }).from(usersTable).where(eq(usersTable.id, namedId));
    const nm = (lu?.name ?? "").trim();
    res.json({ leaderName: nm || null, leaderAvatarUrl: nm ? (lu?.avatarUrl ?? null) : null });
  } catch (err) {
    console.error("[parish] breathed-with-leader-today failed:", err);
    res.json({ leaderName: null, leaderAvatarUrl: null });
  }
});

export default router;
