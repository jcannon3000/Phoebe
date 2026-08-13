// Feed-gated entitlements.
//
// Some content is only available to people who FOLLOW the feed that
// publishes it — today that's the VTS Dean's Commentary reflection source,
// which stays hidden from every picker until the viewer follows the `vts`
// feed (seeded in migrate.ts). This module is the single server-side answer
// to "is this user entitled to X?", so the gate can't drift between the
// surfaces that ask.
//
// IMPORTANT — "follows a feed" is deliberately the SAME union the home feed
// list uses (routes/prayer-feeds.ts GET /prayer-feeds/subscribed): a personal
// subscription row OR membership in a community the feed is bound to. If you
// only checked prayer_feed_subscriptions, someone who joined a VTS-linked
// community would see the feed on their home but still be told they can't
// have its content — the two must agree.

import { db, prayerFeedsTable, prayerFeedSubscriptionsTable, prayerFeedGroupsTable, groupMembersTable } from "@workspace/db";
import { and, eq, isNotNull } from "drizzle-orm";

/** Feed slugs whose content is gated behind following that feed. */
export const GATED_FEED_SLUGS = ["vts"] as const;
export type GatedFeedSlug = (typeof GATED_FEED_SLUGS)[number];

/** Does this user follow `slug` — personally, or via a community it's bound to? */
export async function followsFeed(userId: number, slug: string): Promise<boolean> {
  const [feed] = await db
    .select({ id: prayerFeedsTable.id })
    .from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.slug, slug));
  // No such feed (not yet seeded / deleted) → nobody is entitled. Fail
  // CLOSED: a missing feed row must not accidentally unlock gated content
  // for everyone.
  if (!feed) return false;

  const personal = await db
    .select({ id: prayerFeedSubscriptionsTable.id })
    .from(prayerFeedSubscriptionsTable)
    .where(and(
      eq(prayerFeedSubscriptionsTable.feedId, feed.id),
      eq(prayerFeedSubscriptionsTable.userId, userId),
    ))
    .limit(1);
  if (personal.length > 0) return true;

  const viaGroup = await db
    .select({ feedId: prayerFeedGroupsTable.feedId })
    .from(prayerFeedGroupsTable)
    .innerJoin(groupMembersTable, and(
      eq(groupMembersTable.groupId, prayerFeedGroupsTable.groupId),
      eq(groupMembersTable.userId, userId),
      isNotNull(groupMembersTable.joinedAt),
    ))
    .where(eq(prayerFeedGroupsTable.feedId, feed.id))
    .limit(1);
  return viaGroup.length > 0;
}

/**
 * Every gated slug → whether this user has it. Signed-out / device-local
 * guests have no account to hold a subscription, so callers pass no userId
 * and get everything false — gated content simply never appears for them.
 */
export async function entitlementsFor(userId: number | null): Promise<Record<GatedFeedSlug, boolean>> {
  const out = {} as Record<GatedFeedSlug, boolean>;
  for (const slug of GATED_FEED_SLUGS) {
    out[slug] = userId == null ? false : await followsFeed(userId, slug);
  }
  return out;
}
