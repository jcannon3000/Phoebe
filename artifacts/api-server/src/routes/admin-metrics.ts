/**
 * Admin App Metrics
 *
 * GET /api/admin/metrics — whole-app Today / This Week / All Time
 * tile data. Mirrors the per-community metrics dashboard exactly:
 *
 *   People praying   — distinct users with a prayer event
 *   Times prayed     — total prayer events (15-min dedup, no admin cap)
 *   Offices          — (user, day, morning|evening) office completions
 *                       (Daily Office / Devotion ≥3 slides)
 *   Prayer requests  — total requests created
 *
 * Same SQL semantics as /api/groups/:slug/metrics but without the
 * `members` scope — we don't filter to one community, we roll across
 * every user. The community-side ADMIN_DAILY_PRAYER_CAP is intentionally
 * skipped: the whole point of an admin dashboard is to see real
 * engagement totals, and there's no single "admin" identity in an
 * app-wide rollup.
 *
 * Gated to beta admins (beta_users.is_admin) — same gate the Newsletter
 * / Pilot Users / Reports tools use.
 */

import { Router, type IRouter } from "express";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  betaUsersTable,
  pool,
  prayerFeedsTable,
  prayerFeedSubscriptionsTable,
  prayerFeedGroupsTable,
  groupsTable,
  groupMembersTable,
  sharedMomentsTable,
  momentUserTokensTable,
} from "@workspace/db";

const router: IRouter = Router();

type SessionUser = { id: number; email: string };
function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

async function isBetaAdmin(userId: number): Promise<boolean> {
  const [u] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!u) return false;
  try {
    const [beta] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch {
    return false;
  }
}

router.get("/admin/metrics", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(session.id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    // Bucket "today" / "this week" in Eastern Time — Phoebe runs out
    // of ET and admin intuition for "today" is the ET calendar day.
    // Matches the per-community endpoint's choice so the two pages
    // tell the same story.
    const tz = "America/New_York";
    const ymdFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = ymdFmt.format(new Date());
    const [tyStr, tmStr, tdStr] = todayStr.split("-");
    const todayUTC = new Date(Date.UTC(
      parseInt(tyStr, 10),
      parseInt(tmStr, 10) - 1,
      parseInt(tdStr, 10),
    ));
    todayUTC.setUTCDate(todayUTC.getUTCDate() - 6);
    const weekStartStr = todayUTC.toISOString().slice(0, 10);

    const q = await pool.query(`
      WITH session_candidates AS (
        -- Same definition as the community-scoped metrics endpoint,
        -- minus the members CTE: a "prayer event" candidate is an
        -- Amen tap OR an office / devotion completion that reached
        -- ≥3 slides. NULL slides_completed = legacy row pre-dating
        -- the column; treat as qualifying.
        SELECT user_id, occurred_at FROM (
          SELECT a.user_id, a.prayed_at AS occurred_at
          FROM prayer_request_amens a
          WHERE a.prayed_at IS NOT NULL

          UNION ALL

          SELECT ps.user_id, ps.ended_at AS occurred_at
          FROM prayer_sessions ps
          WHERE ps.surface IN (
              'morning-prayer',
              'evening-prayer',
              'morning-devotion',
              'early-evening-devotion'
            )
            AND (ps.slides_completed IS NULL OR ps.slides_completed >= 3)
        ) c
      ),
      session_with_lag AS (
        SELECT
          sc.user_id, sc.occurred_at,
          to_char((sc.occurred_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day,
          LAG(sc.occurred_at) OVER (
            PARTITION BY sc.user_id ORDER BY sc.occurred_at
          ) AS prev_at
        FROM session_candidates sc
      ),
      -- 15-min dedup so a tap-in / tap-out / tap-in burst stays
      -- one event. No admin cap (the community page caps because
      -- a single noisy admin can dominate a small group; at the
      -- app level we want the true total).
      prayer_events AS (
        SELECT user_id, day
        FROM session_with_lag
        WHERE prev_at IS NULL
           OR occurred_at - prev_at > INTERVAL '15 minutes'
      ),
      prayer_days AS (
        SELECT DISTINCT user_id, day FROM prayer_events
      ),
      -- Offices: (user, day, side) tuples. Side is "morning"
      -- (morning-prayer + morning-devotion) or "evening"
      -- (evening-prayer + early-evening-devotion). Max 2 per
      -- person per day.
      office_session_candidates AS (
        SELECT
          ps.user_id,
          ps.ended_at AS occurred_at,
          CASE
            WHEN ps.surface IN ('morning-prayer', 'morning-devotion') THEN 'morning'
            ELSE 'evening'
          END AS side
        FROM prayer_sessions ps
        WHERE ps.surface IN (
            'morning-prayer',
            'evening-prayer',
            'morning-devotion',
            'early-evening-devotion'
          )
          AND (ps.slides_completed IS NULL OR ps.slides_completed >= 3)
      ),
      office_days AS (
        SELECT DISTINCT
          user_id,
          side,
          to_char((occurred_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') AS day
        FROM office_session_candidates
      )
      SELECT
        (SELECT COUNT(*) FROM users)::int AS total_users,

        (SELECT COUNT(*) FROM prayer_requests)::int AS prayer_requests_total,
        (SELECT COUNT(*) FROM prayer_requests
           WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $1)::int AS prayer_requests_today,
        (SELECT COUNT(*) FROM prayer_requests
           WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $2)::int AS prayer_requests_week,

        -- Distinct users praying in each window.
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days WHERE day >= $1)::int AS prayed_today,
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days WHERE day >= $2)::int AS prayed_week,
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days)::int AS prayed_all_time,

        -- Times prayed (15-min-deduped events).
        (SELECT COUNT(*) FROM prayer_events WHERE day >= $1)::int AS times_prayed_today,
        (SELECT COUNT(*) FROM prayer_events WHERE day >= $2)::int AS times_prayed_week,
        (SELECT COUNT(*) FROM prayer_events)::int AS times_prayed_total,

        -- Offices.
        (SELECT COUNT(*) FROM office_days WHERE day >= $1)::int AS offices_today,
        (SELECT COUNT(*) FROM office_days WHERE day >= $2)::int AS offices_week,
        (SELECT COUNT(*) FROM office_days)::int AS offices_total,

        -- New signups in each window — handy app-level signal.
        (SELECT COUNT(*) FROM users
           WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $1)::int AS new_users_today,
        (SELECT COUNT(*) FROM users
           WHERE to_char((created_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $2)::int AS new_users_week,

        -- App opens. Each app_opens row is already one 15-min-deduped
        -- open (unique user_id+bucket), so COUNT(DISTINCT user_id) =
        -- "people who opened" and COUNT(*) = "times opened."
        (SELECT COUNT(DISTINCT user_id) FROM app_opens
           WHERE to_char((opened_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $1)::int AS opened_today,
        (SELECT COUNT(DISTINCT user_id) FROM app_opens
           WHERE to_char((opened_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $2)::int AS opened_week,
        (SELECT COUNT(DISTINCT user_id) FROM app_opens)::int AS opened_all_time,

        (SELECT COUNT(*) FROM app_opens
           WHERE to_char((opened_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $1)::int AS opens_today,
        (SELECT COUNT(*) FROM app_opens
           WHERE to_char((opened_at AT TIME ZONE $3)::date, 'YYYY-MM-DD') >= $2)::int AS opens_week,
        (SELECT COUNT(*) FROM app_opens)::int AS opens_total
    `, [todayStr, weekStartStr, tz]);

    const row = q.rows[0] ?? {};
    res.json({
      totalUsers: Number(row.total_users ?? 0),
      newUsersToday: Number(row.new_users_today ?? 0),
      newUsersThisWeek: Number(row.new_users_week ?? 0),

      prayedToday: Number(row.prayed_today ?? 0),
      prayedThisWeek: Number(row.prayed_week ?? 0),
      prayedAllTime: Number(row.prayed_all_time ?? 0),

      timesPrayedToday: Number(row.times_prayed_today ?? 0),
      timesPrayedThisWeek: Number(row.times_prayed_week ?? 0),
      timesPrayedTotal: Number(row.times_prayed_total ?? 0),

      officesToday: Number(row.offices_today ?? 0),
      officesThisWeek: Number(row.offices_week ?? 0),
      officesTotal: Number(row.offices_total ?? 0),

      prayerRequestsToday: Number(row.prayer_requests_today ?? 0),
      prayerRequestsThisWeek: Number(row.prayer_requests_week ?? 0),
      prayerRequestsTotal: Number(row.prayer_requests_total ?? 0),

      openedToday: Number(row.opened_today ?? 0),
      openedThisWeek: Number(row.opened_week ?? 0),
      openedAllTime: Number(row.opened_all_time ?? 0),

      opensToday: Number(row.opens_today ?? 0),
      opensThisWeek: Number(row.opens_week ?? 0),
      opensTotal: Number(row.opens_total ?? 0),
    });
  } catch (err) {
    console.error("[admin/metrics] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/admin/feed-audit — for every prayer feed, report:
//   • duplicate slugs / titles (the "Manage shows 2 feeds but there's
//     really 1" symptom)
//   • real subscription count vs the cached subscriber_count column
//   • bound groups
//   • intercession count
//   • token-holders who are NEITHER subscribed NOR a member of any
//     bound group — the "praying it without being subscribed / in a
//     group" leak.
// Beta-admin gated. Read-only.
router.get("/admin/feed-audit", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(session.id))) { res.status(403).json({ error: "Forbidden" }); return; }

  try {
    const feeds = await db
      .select({
        id: prayerFeedsTable.id,
        slug: prayerFeedsTable.slug,
        title: prayerFeedsTable.title,
        state: prayerFeedsTable.state,
        creatorUserId: prayerFeedsTable.creatorUserId,
        subscriberCountColumn: prayerFeedsTable.subscriberCount,
        createdAt: prayerFeedsTable.createdAt,
      })
      .from(prayerFeedsTable)
      .orderBy(prayerFeedsTable.createdAt);

    // Duplicate detection.
    const slugCounts = new Map<string, number>();
    const titleCounts = new Map<string, number>();
    for (const f of feeds) {
      slugCounts.set(f.slug, (slugCounts.get(f.slug) ?? 0) + 1);
      const t = (f.title ?? "").toLowerCase();
      titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
    }
    const duplicateSlugs = [...slugCounts].filter(([, n]) => n > 1).map(([s]) => s);
    const duplicateTitles = [...titleCounts].filter(([, n]) => n > 1).map(([t]) => t);

    const perFeed = [];
    for (const f of feeds) {
      const realSubs = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(prayerFeedSubscriptionsTable)
        .where(eq(prayerFeedSubscriptionsTable.feedId, f.id)))[0]?.n ?? 0;

      const groups = await db
        .select({ id: groupsTable.id, slug: groupsTable.slug, name: groupsTable.name })
        .from(prayerFeedGroupsTable)
        .innerJoin(groupsTable, eq(groupsTable.id, prayerFeedGroupsTable.groupId))
        .where(eq(prayerFeedGroupsTable.feedId, f.id));

      const moments = await db
        .select({ id: sharedMomentsTable.id })
        .from(sharedMomentsTable)
        .where(eq(sharedMomentsTable.prayerFeedId, f.id));
      const momentIds = moments.map(m => m.id);

      let tokenHolders = 0;
      let leakEmails: string[] = [];
      if (momentIds.length > 0) {
        // Distinct emails holding a token on any of this feed's moments.
        const holders = await db
          .selectDistinct({ email: sql<string>`LOWER(${momentUserTokensTable.email})` })
          .from(momentUserTokensTable)
          .where(inArray(momentUserTokensTable.momentId, momentIds));
        const holderEmails = holders.map(h => h.email).filter(Boolean);
        tokenHolders = holderEmails.length;

        // Subscriber emails.
        const subRows = await db
          .select({ email: sql<string>`LOWER(${usersTable.email})` })
          .from(prayerFeedSubscriptionsTable)
          .innerJoin(usersTable, eq(usersTable.id, prayerFeedSubscriptionsTable.userId))
          .where(eq(prayerFeedSubscriptionsTable.feedId, f.id));
        const subscriberEmails = new Set(subRows.map(r => r.email));

        // Members of any bound group (by user email OR invite email).
        const groupMemberEmails = new Set<string>();
        if (groups.length > 0) {
          const gmRows = await db
            .select({
              userEmail: sql<string | null>`LOWER(${usersTable.email})`,
              inviteEmail: sql<string | null>`LOWER(${groupMembersTable.email})`,
            })
            .from(groupMembersTable)
            .leftJoin(usersTable, eq(usersTable.id, groupMembersTable.userId))
            .where(and(
              inArray(groupMembersTable.groupId, groups.map(g => g.id)),
              isNotNull(groupMembersTable.joinedAt),
            ));
          for (const r of gmRows) {
            if (r.userEmail) groupMemberEmails.add(r.userEmail);
            if (r.inviteEmail) groupMemberEmails.add(r.inviteEmail);
          }
        }

        leakEmails = holderEmails.filter(
          e => !subscriberEmails.has(e) && !groupMemberEmails.has(e),
        );
      }

      perFeed.push({
        id: f.id,
        slug: f.slug,
        title: f.title,
        state: f.state,
        creatorUserId: f.creatorUserId,
        subscriberCountColumn: f.subscriberCountColumn ?? 0,
        realSubscriptions: realSubs,
        boundGroups: groups.map(g => ({ id: g.id, slug: g.slug, name: g.name })),
        intercessionCount: momentIds.length,
        tokenHolders,
        leakCount: leakEmails.length,
        // Cap the email list so a huge leak doesn't bloat the payload;
        // leakCount is the authoritative number.
        leakEmails: leakEmails.slice(0, 100),
      });
    }

    res.json({
      feedCount: feeds.length,
      duplicateSlugs,
      duplicateTitles,
      feeds: perFeed,
    });
  } catch (err) {
    console.error("[admin/feed-audit] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// POST /api/admin/feed-repair — prune orphan feed tokens + resync the
// cached subscriber_count column. Defaults to a DRY RUN (reports what
// it WOULD do); pass { apply: true } to actually mutate.
//
// "Orphan token" = a moment_user_tokens row on a feed-scoped
// intercession whose holder is NEITHER a subscriber NOR a member of
// any bound group NOR the moment's organizer (smallest-id token,
// preserved so the authoring account never loses access). These are
// the people "praying it without being subscribed / in a group."
// Removing the token revokes feed access on their next load;
// historical moment_posts stay intact (we only delete the token row,
// the same operation reconcileFeedPracticeMembers already performs).
//
// Beta-admin gated.
router.post("/admin/feed-repair", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(session.id))) { res.status(403).json({ error: "Forbidden" }); return; }

  const apply = req.body?.apply === true;

  try {
    const feeds = await db
      .select({ id: prayerFeedsTable.id, slug: prayerFeedsTable.slug, title: prayerFeedsTable.title })
      .from(prayerFeedsTable);

    const report: Array<{
      feedId: number;
      slug: string;
      title: string;
      orphanTokensPruned: number;
      subscriberCountBefore: number;
      subscriberCountAfter: number;
    }> = [];

    for (const f of feeds) {
      // Allowed emails = subscribers ∪ bound-group members.
      const subRows = await db
        .select({ email: sql<string>`LOWER(${usersTable.email})` })
        .from(prayerFeedSubscriptionsTable)
        .innerJoin(usersTable, eq(usersTable.id, prayerFeedSubscriptionsTable.userId))
        .where(eq(prayerFeedSubscriptionsTable.feedId, f.id));
      const allowed = new Set(subRows.map(r => r.email));

      const groups = await db
        .select({ id: prayerFeedGroupsTable.groupId })
        .from(prayerFeedGroupsTable)
        .where(eq(prayerFeedGroupsTable.feedId, f.id));
      if (groups.length > 0) {
        const gmRows = await db
          .select({
            userEmail: sql<string | null>`LOWER(${usersTable.email})`,
            inviteEmail: sql<string | null>`LOWER(${groupMembersTable.email})`,
          })
          .from(groupMembersTable)
          .leftJoin(usersTable, eq(usersTable.id, groupMembersTable.userId))
          .where(and(
            inArray(groupMembersTable.groupId, groups.map(g => g.id)),
            isNotNull(groupMembersTable.joinedAt),
          ));
        for (const r of gmRows) {
          if (r.userEmail) allowed.add(r.userEmail);
          if (r.inviteEmail) allowed.add(r.inviteEmail);
        }
      }

      // Resync the cached subscriber_count to the real subscription count.
      const realSubs = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(prayerFeedSubscriptionsTable)
        .where(eq(prayerFeedSubscriptionsTable.feedId, f.id)))[0]?.n ?? 0;
      const beforeCol = (await db
        .select({ c: prayerFeedsTable.subscriberCount })
        .from(prayerFeedsTable)
        .where(eq(prayerFeedsTable.id, f.id)))[0]?.c ?? 0;

      const moments = await db
        .select({ id: sharedMomentsTable.id })
        .from(sharedMomentsTable)
        .where(eq(sharedMomentsTable.prayerFeedId, f.id));

      let pruned = 0;
      for (const m of moments) {
        const tokens = await db
          .select({ id: momentUserTokensTable.id, email: momentUserTokensTable.email })
          .from(momentUserTokensTable)
          .where(eq(momentUserTokensTable.momentId, m.id));
        if (tokens.length === 0) continue;
        // Organizer = smallest token id, always preserved.
        const organizerId = tokens.reduce((min, t) => (t.id < min.id ? t : min), tokens[0]).id;
        const orphans = tokens.filter(t =>
          t.id !== organizerId && !allowed.has((t.email || "").toLowerCase()),
        );
        pruned += orphans.length;
        if (apply && orphans.length > 0) {
          await db.delete(momentUserTokensTable)
            .where(inArray(momentUserTokensTable.id, orphans.map(o => o.id)));
        }
      }

      if (apply && beforeCol !== realSubs) {
        await db.update(prayerFeedsTable)
          .set({ subscriberCount: realSubs })
          .where(eq(prayerFeedsTable.id, f.id));
      }

      report.push({
        feedId: f.id,
        slug: f.slug,
        title: f.title,
        orphanTokensPruned: pruned,
        subscriberCountBefore: beforeCol,
        subscriberCountAfter: realSubs,
      });
    }

    res.json({ applied: apply, report });
  } catch (err) {
    console.error("[admin/feed-repair] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
