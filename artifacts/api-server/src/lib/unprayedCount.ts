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
} from "@workspace/db";
import { getGardenUserIds } from "./garden";

export async function getUnprayedCount(userId: number): Promise<number> {
  const gardenIds = await getGardenUserIds(userId);
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
