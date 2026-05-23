/**
 * Admin User Metrics
 *
 * GET /api/admin/user-metrics — list every Phoebe user with at-a-glance
 * engagement numbers (last-active, prayer-request count, amens given,
 * fellow count, community count, access tier). Plus a small aggregate
 * summary on top.
 *
 * Gated to beta admins (beta_users.is_admin) — same gate the Newsletter
 * / Pilot Users / Reports tools use.
 */

import { Router, type IRouter } from "express";
import { eq, gte, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  betaUsersTable,
  prayerRequestsTable,
  prayerRequestAmensTable,
  prayerSessionsTable,
  groupMembersTable,
  fellowsTable,
} from "@workspace/db";
import { getUserAccessTier } from "../lib/parishGate";

const router: IRouter = Router();

type SessionUser = { id: number; email: string };
function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

// Super-admin gate. Same shape as routes/newsletter.ts so the
// /admin/* surfaces are all consistent.
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

router.get("/admin/user-metrics", async (req, res): Promise<void> => {
  const session = getUser(req);
  if (!session) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(session.id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Base user roster — every row in `users`. We pull a flat list
    // and enrich in JS with the aggregate counts below; the user
    // base is small enough (low thousands) that the aggregation
    // round-trips are cheap and the SQL stays readable.
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
        createdAt: usersTable.createdAt,
        officesOnly: usersTable.officesOnly,
        parishFeedId: usersTable.parishFeedId,
      })
      .from(usersTable);

    // Per-user aggregates pulled as grouped counts. Each is keyed by
    // user_id so we can stitch them into the user row by id.
    const [
      requestCountsRows,
      amensGivenRows,
      sessionStatsRows,
      groupCountsRows,
      fellowCountsRows,
    ] = await Promise.all([
      db
        .select({
          ownerId: prayerRequestsTable.ownerId,
          total: sql<number>`count(*)::int`,
        })
        .from(prayerRequestsTable)
        .groupBy(prayerRequestsTable.ownerId),
      db
        .select({
          userId: prayerRequestAmensTable.userId,
          total: sql<number>`count(*)::int`,
        })
        .from(prayerRequestAmensTable)
        .groupBy(prayerRequestAmensTable.userId),
      db
        .select({
          userId: prayerSessionsTable.userId,
          lastEndedAt: sql<Date | null>`max(${prayerSessionsTable.endedAt})`,
          sessionsLast7: sql<number>`count(*) filter (where ${prayerSessionsTable.endedAt} >= ${sevenDaysAgo})::int`,
          sessionsLast30: sql<number>`count(*) filter (where ${prayerSessionsTable.endedAt} >= ${thirtyDaysAgo})::int`,
        })
        .from(prayerSessionsTable)
        .groupBy(prayerSessionsTable.userId),
      db
        .select({
          userId: groupMembersTable.userId,
          total: sql<number>`count(*)::int`,
        })
        .from(groupMembersTable)
        .where(sql`${groupMembersTable.userId} IS NOT NULL AND ${groupMembersTable.joinedAt} IS NOT NULL`)
        .groupBy(groupMembersTable.userId),
      db
        .select({
          userId: fellowsTable.userId,
          total: sql<number>`count(*)::int`,
        })
        .from(fellowsTable)
        .groupBy(fellowsTable.userId),
    ]);

    const requestCounts = new Map<number, number>();
    for (const r of requestCountsRows) requestCounts.set(r.ownerId, r.total);
    const amensGiven = new Map<number, number>();
    for (const r of amensGivenRows) {
      if (typeof r.userId === "number") amensGiven.set(r.userId, r.total);
    }
    const sessionStats = new Map<number, { lastEndedAt: Date | null; sessionsLast7: number; sessionsLast30: number }>();
    for (const r of sessionStatsRows) {
      if (typeof r.userId === "number") {
        sessionStats.set(r.userId, {
          lastEndedAt: r.lastEndedAt,
          sessionsLast7: r.sessionsLast7,
          sessionsLast30: r.sessionsLast30,
        });
      }
    }
    const groupCounts = new Map<number, number>();
    for (const r of groupCountsRows) {
      if (typeof r.userId === "number") groupCounts.set(r.userId, r.total);
    }
    const fellowCounts = new Map<number, number>();
    for (const r of fellowCountsRows) fellowCounts.set(r.userId, r.total);

    // Resolve access tier per user. parishGate runs a small batch of
    // queries per call; the user base size makes this acceptable for
    // an admin-only metrics page. Parallel to stay snappy.
    const tierRows = await Promise.all(
      users.map(u => getUserAccessTier(u.id).then(t => ({ id: u.id, tier: t.tier }))),
    );
    const tierByUser = new Map<number, string>();
    for (const t of tierRows) tierByUser.set(t.id, t.tier);

    // Aggregate buckets used by the summary tiles at the top.
    let tierFull = 0, tierOfficesOnly = 0, tierParishOnly = 0, tierUnassigned = 0;
    let activeLast7 = 0, activeLast30 = 0;
    let newLast7 = 0, newLast30 = 0;

    const enriched = users.map(u => {
      const tier = tierByUser.get(u.id) ?? "unassigned";
      switch (tier) {
        case "full": tierFull++; break;
        case "offices-only": tierOfficesOnly++; break;
        case "parish-only": tierParishOnly++; break;
        default: tierUnassigned++; break;
      }
      const stats = sessionStats.get(u.id);
      const lastActiveAt = stats?.lastEndedAt ?? null;
      if (lastActiveAt && lastActiveAt >= sevenDaysAgo) activeLast7++;
      if (lastActiveAt && lastActiveAt >= thirtyDaysAgo) activeLast30++;
      if (u.createdAt >= sevenDaysAgo) newLast7++;
      if (u.createdAt >= thirtyDaysAgo) newLast30++;

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt.toISOString(),
        tier,
        lastActiveAt: lastActiveAt ? lastActiveAt.toISOString() : null,
        sessionsLast7: stats?.sessionsLast7 ?? 0,
        sessionsLast30: stats?.sessionsLast30 ?? 0,
        prayerRequestsTotal: requestCounts.get(u.id) ?? 0,
        amensGivenTotal: amensGiven.get(u.id) ?? 0,
        communityCount: groupCounts.get(u.id) ?? 0,
        fellowCount: fellowCounts.get(u.id) ?? 0,
      };
    });

    // Default sort: most-recently-active first, then newest signup.
    // The client can still re-sort by any column.
    enriched.sort((a, b) => {
      const la = a.lastActiveAt ?? "";
      const lb = b.lastActiveAt ?? "";
      if (la !== lb) return lb.localeCompare(la);
      return b.createdAt.localeCompare(a.createdAt);
    });

    res.json({
      summary: {
        totalUsers: users.length,
        tierFull,
        tierOfficesOnly,
        tierParishOnly,
        tierUnassigned,
        activeLast7,
        activeLast30,
        newLast7,
        newLast30,
      },
      users: enriched,
    });
  } catch (err) {
    console.error("[admin/user-metrics] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Reserved for future metric drill-downs (per-user activity timeline,
// etc.). Listed here so the typecheck doesn't drop the import.
void gte;

export default router;
