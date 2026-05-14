// Count of "things waiting for your prayer" — drives the iOS app-icon
// badge that the new-prayer-request push sets, and any other
// surfaces (deep-link, dashboard) that want to mirror that number.
//
// Mirrors the dashboard's `newPrayersCount` filter:
//   r => !r.isAnswered && !r.isOwnRequest && !r.closedAt && !r.myAmenedEver
// over the same garden the prayer-list endpoint shows. We exclude
// requests the viewer has *ever* amen'd (not just today) — once
// you've engaged with a request once it's no longer "new" to you.
//
// Implemented as a single SQL round-trip rather than fetching every
// request and filtering in JS, because this fires on every new-
// request push fan-out and we want it cheap.
//
// Used by sendNewPrayerRequestPush; keeping the helper here (instead
// of inline) makes it reusable from a future "set badge to current
// count" silent-push path or a /api/me/unprayed-count endpoint.

import { and, eq, gt, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import {
  db,
  prayerRequestsTable,
  prayerRequestAmensTable,
  userMutesTable,
  sharedMomentsTable,
  momentUserTokensTable,
  momentPostsTable,
  usersTable,
} from "@workspace/db";
import { getGardenUserIds } from "./garden";

export async function getUnprayedCount(userId: number): Promise<number> {
  const gardenIds = await getGardenUserIds(userId);
  // No garden gates the prayer-request slice off; community
  // intercessions are still counted below since they're attached
  // to a community the user joined, not the broader garden.
  const requestCount = await countUnprayedRequests(userId, gardenIds);
  const intercessionCount = await countUnprayedIntercessions(userId);
  return requestCount + intercessionCount;
}

async function countUnprayedRequests(userId: number, gardenIds: number[]): Promise<number> {
  if (gardenIds.length === 0) return 0;

  const mutedRows = await db
    .select({ mutedUserId: userMutesTable.mutedUserId })
    .from(userMutesTable)
    .where(eq(userMutesTable.muterId, userId));
  const mutedIds = mutedRows.map((r) => r.mutedUserId);

  const filters = [
    inArray(prayerRequestsTable.ownerId, gardenIds),
    isNull(prayerRequestsTable.closedAt),
    eq(prayerRequestsTable.isAnswered, false),
    or(
      isNull(prayerRequestsTable.expiresAt),
      gt(prayerRequestsTable.expiresAt, new Date()),
    )!,
    notExists(
      db
        .select({ one: sql`1` })
        .from(prayerRequestAmensTable)
        .where(and(
          eq(prayerRequestAmensTable.requestId, prayerRequestsTable.id),
          eq(prayerRequestAmensTable.userId, userId),
        )),
    ),
  ];
  if (mutedIds.length > 0) {
    filters.push(sql`${prayerRequestsTable.ownerId} NOT IN (${sql.join(mutedIds.map((id) => sql`${id}`), sql`, `)})`);
  }

  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(prayerRequestsTable)
    .where(and(...filters));

  return row?.count ?? 0;
}

// Community intercessions the user is part of and hasn't yet
// prayed for today. Counted toward the app-icon badge so a brand-new
// intercession a community admin schedules shows up next to the icon
// the same way a new prayer request does. Today's tz-local check-in
// dismisses the badge contribution once the user prays it.
async function countUnprayedIntercessions(userId: number): Promise<number> {
  const [u] = await db
    .select({ email: usersTable.email, timezone: usersTable.timezone })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!u) return 0;
  const tz = u.timezone || "UTC";
  const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

  const tokenRows = await db
    .select({ momentId: momentUserTokensTable.momentId, userToken: momentUserTokensTable.userToken })
    .from(momentUserTokensTable)
    .where(sql`LOWER(${momentUserTokensTable.email}) = LOWER(${u.email})`);
  if (tokenRows.length === 0) return 0;
  const myMomentIds = [...new Set(tokenRows.map(r => r.momentId))];
  const myTokens = new Set(tokenRows.map(r => r.userToken));

  const moments = await db
    .select({
      id: sharedMomentsTable.id,
      goalDays: sharedMomentsTable.goalDays,
      cycleStartedAt: sharedMomentsTable.commitmentCycleStartedAt,
      reachedAt: sharedMomentsTable.commitmentGoalReachedAt,
      state: sharedMomentsTable.state,
      templateType: sharedMomentsTable.templateType,
    })
    .from(sharedMomentsTable)
    .where(and(
      inArray(sharedMomentsTable.id, myMomentIds),
      eq(sharedMomentsTable.templateType, "intercession"),
    ));

  const now = new Date();
  const graceMs = 2 * 24 * 60 * 60 * 1000;
  const liveIntercessions = moments.filter(m => {
    if (m.state === "archived") return false;
    if (m.reachedAt && (now.getTime() - new Date(m.reachedAt).getTime()) > graceMs) return false;
    if (!m.reachedAt && (m.goalDays ?? 0) > 0 && m.cycleStartedAt) {
      const cycleEndMs = new Date(m.cycleStartedAt).getTime() + (m.goalDays ?? 0) * 24 * 60 * 60 * 1000;
      if (now.getTime() > cycleEndMs) return false;
    }
    return true;
  });
  if (liveIntercessions.length === 0) return 0;

  // Today's check-in posts authored by this user on each intercession.
  // An intercession is "prayed for today" when the user has any
  // isCheckin=1 post for windowDate=today using one of their tokens.
  const liveIds = liveIntercessions.map(m => m.id);
  const todayCheckins = await db
    .select({ momentId: momentPostsTable.momentId, userToken: momentPostsTable.userToken })
    .from(momentPostsTable)
    .where(and(
      inArray(momentPostsTable.momentId, liveIds),
      eq(momentPostsTable.windowDate, todayYmd),
      eq(momentPostsTable.isCheckin, 1),
    ));
  const prayedTodayMoments = new Set<number>();
  for (const r of todayCheckins) {
    if (myTokens.has(r.userToken)) prayedTodayMoments.add(r.momentId);
  }

  return liveIntercessions.filter(m => !prayedTodayMoments.has(m.id)).length;
}
