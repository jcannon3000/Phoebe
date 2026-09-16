/**
 * Admin App Metrics
 *
 * GET /api/admin/metrics — the whole app, cut three ways: today, the last
 * seven days and the month to date, in Eastern time. Everyone using Phoebe is
 * counted, with an account or without (a phone gets a private device user
 * after its third signed-out day).
 *
 * What is counted, and how, lives in lib/appMetricsSql.ts: one unit for
 * everything prayed — a practice KEPT, one per person, per practice, per day
 * — grouped into families that add up to the total. This file holds the gate
 * and the response.
 *
 * Also here: the prayer-feed audit and repair tools (community features are
 * off for everyone; the page shows them folded away) and the pilot-group
 * switch.
 *
 * Gated to beta admins (beta_users.is_admin) — same gate the Newsletter /
 * Pilot Users / Reports tools use.
 */

import { Router, type IRouter } from "express";
import { APP_METRICS_SQL, appMetricsParams, appMetricsWindows, shapeAppMetrics, type AppMetricsResponse } from "../lib/appMetricsSql";
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

/**
 * The frozen iOS bundle's App Metrics page still reads the flat fields the
 * endpoint answered with before 2026-09-16. They are derived from the new
 * shape so that page keeps working until the owner rebuilds in Xcode; remove
 * once no shipped client reads them.
 */
function legacyFields(m: AppMetricsResponse): Record<string, number> {
  const { people, opens, practices, deans, community } = m;
  return {
    totalUsers: people.accounts.total + people.withoutAccount.total,
    newUsersToday: people.accounts.today + people.withoutAccount.today,
    newUsersThisWeek: people.accounts.week + people.withoutAccount.week,
    totalDeviceUsers: people.withoutAccount.total,
    newDeviceUsersToday: people.withoutAccount.today,
    newDeviceUsersThisWeek: people.withoutAccount.week,
    devicePrayedToday: people.prayedWithoutAccount.today,
    devicePrayedThisWeek: people.prayedWithoutAccount.week,
    devicePrayedThisMonth: people.prayedWithoutAccount.month,
    deviceOpenedToday: people.openedWithoutAccount.today,
    deviceOpenedThisWeek: people.openedWithoutAccount.week,
    deviceOpenedThisMonth: people.openedWithoutAccount.month,
    prayedToday: people.prayed.today,
    prayedThisWeek: people.prayed.week,
    prayedThisMonth: people.prayed.month,
    timesPrayedToday: practices.all.today,
    timesPrayedThisWeek: practices.all.week,
    timesPrayedThisMonth: practices.all.month,
    officesToday: practices.offices.today,
    officesThisWeek: practices.offices.week,
    officesThisMonth: practices.offices.month,
    contemplationExamenToday: practices.contemplation.today + practices.examen.today,
    contemplationExamenThisWeek: practices.contemplation.week + practices.examen.week,
    contemplationExamenThisMonth: practices.contemplation.month + practices.examen.month,
    deansReadersToday: deans.readers.today,
    deansReadersThisWeek: deans.readers.week,
    deansReadersThisMonth: deans.readers.month,
    deansReadsThisWeek: deans.readerDays.week,
    deansReadsThisMonth: deans.readerDays.month,
    prayerRequestsToday: community.prayerRequestsToday,
    prayerRequestsThisWeek: community.prayerRequestsWeek,
    prayerRequestsTotal: community.prayerRequestsTotal,
    openedToday: people.opened.today,
    openedThisWeek: people.opened.week,
    openedThisMonth: people.opened.month,
    opensToday: opens.today,
    opensThisWeek: opens.week,
    opensThisMonth: opens.month,
  };
}

// GET /api/admin/metrics — see lib/appMetricsSql.ts for what is counted and
// how. Gated to beta admins (beta_users.is_admin), like every tool here.
router.get("/admin/metrics", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(session.id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const windows = appMetricsWindows();
    const q = await pool.query(APP_METRICS_SQL, appMetricsParams(windows));
    const shaped = shapeAppMetrics(q.rows[0] ?? {}, windows);
    // Live numbers for one admin; the WebView must not hold yesterday's.
    res.setHeader("Cache-Control", "no-store");
    res.json({ ...legacyFields(shaped), ...shaped });
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

// ─── Pilot groups (PUBLIC no-login version) ─────────────────────────────────
// A PILOT GROUP's members are the only users who keep the FULL app once the
// guest flag flips — everyone else gets the light shape. Designating a group
// is an app-SUPER-ADMIN action (beta_users.is_admin), surfaced as a toggle in
// the group's settings page. See memory "project_public_no_login".

// GET /api/admin/am-super — lets the group-settings page decide whether to
// show the pilot-group toggle at all. Cheap, cached client-side.
router.get("/admin/am-super", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.json({ isSuperAdmin: await isBetaAdmin(session.id) });
});

// PATCH /api/admin/groups/:slug/pilot { isPilotGroup: boolean }
router.patch("/admin/groups/:slug/pilot", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(session.id))) { res.status(403).json({ error: "Forbidden" }); return; }
  const on = req.body?.isPilotGroup === true;
  const [group] = await db
    .update(groupsTable)
    .set({ isPilotGroup: on })
    .where(eq(groupsTable.slug, req.params.slug))
    .returning({ id: groupsTable.id, slug: groupsTable.slug, isPilotGroup: groupsTable.isPilotGroup });
  if (!group) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ok: true, group });
});

export default router;
