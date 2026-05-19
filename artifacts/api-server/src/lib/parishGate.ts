/**
 * Phoebe Parish access tier — derived gate.
 *
 * A "parish-only" user is someone who:
 *   1. Has users.parish_feed_id set (signed up via the parish flow), AND
 *   2. Is NOT in beta_users, AND
 *   3. Is NOT a member of any community (group_members)
 *
 * The third clause is what makes the upgrade-to-full-app frictionless:
 * the moment a user accepts a community invite and a group_members row
 * is written, the gate flips. No separate "promote them to beta" job.
 *
 * This module is the single source of truth for that derivation —
 * routes that need to gate UI / endpoints behind the parish-only state
 * call `getUserAccessTier(userId)` and branch on the result.
 */

import { db, usersTable, betaUsersTable, groupMembersTable, prayerFeedsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

export type AccessTier =
  // Full Phoebe — beta member or community member. Sees everything:
  // garden, prayer requests, communities, letters, BCP, parish (if
  // also subscribed), settings.
  | "full"
  // Phoebe Parish — limited UI: BCP, parish dashboard, settings
  // (office reminders + parish picker). No garden, no requests, no
  // communities, no letters.
  | "parish-only"
  // Offices-only — accounts created from the public /pray page. Even
  // more limited than parish-only: just the Daily Office / Daily
  // Devotion (no parish identity, no groups, no prayer requests). It
  // reuses the parish dashboard as its home surface.
  | "offices-only"
  // No access tier yet — needs to either pick a parish (Phoebe Parish
  // signup) or wait on a beta invite. Useful for the onboarding
  // redirect logic.
  | "unassigned";

export interface UserAccess {
  tier: AccessTier;
  parishFeedId: number | null;
  parishSlug: string | null;
  isBeta: boolean;
  hasCommunityMembership: boolean;
}

/**
 * Compute the access tier + parish info for a user. Single round-trip
 * across users + beta_users + group_members + prayer_feeds.
 *
 * Returns a structured result rather than just the tier string so
 * callers can also pull the parish slug for routing without a second
 * query.
 */
export async function getUserAccessTier(userId: number): Promise<UserAccess> {
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      parishFeedId: usersTable.parishFeedId,
      officesOnly: usersTable.officesOnly,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) {
    return { tier: "unassigned", parishFeedId: null, parishSlug: null, isBeta: false, hasCommunityMembership: false };
  }

  // Run the three secondary queries in parallel — none of them depend
  // on each other.
  const [betaRows, memberRows, parishRow] = await Promise.all([
    db
      .select({ email: betaUsersTable.email })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, user.email.toLowerCase())),
    // Any group_members row at all is enough — even an invitee who
    // accepted to a community where they have no role yet still
    // counts. Limit 1 to keep the query cheap on power users with
    // dozens of memberships.
    db
      .select({ id: groupMembersTable.id })
      .from(groupMembersTable)
      .where(
        sql`${groupMembersTable.userId} = ${userId}
            OR LOWER(${groupMembersTable.email}) = ${user.email.toLowerCase()}`,
      )
      .limit(1),
    user.parishFeedId !== null
      ? db
          .select({ slug: prayerFeedsTable.slug })
          .from(prayerFeedsTable)
          .where(and(
            eq(prayerFeedsTable.id, user.parishFeedId),
            eq(prayerFeedsTable.kind, "parish"),
          ))
          .limit(1)
      : Promise.resolve([] as { slug: string }[]),
  ]);

  const isBeta = betaRows.length > 0;
  const hasCommunityMembership = memberRows.length > 0;
  const parishSlug = parishRow[0]?.slug ?? null;

  // Order matters: a community membership ALWAYS wins, so an
  // offices-only account that later joins a community frictionlessly
  // upgrades to "full". Offices-only is checked before parish-only;
  // in practice the two signals are mutually exclusive (the /pray
  // signup never sets a parish_feed_id).
  let tier: AccessTier;
  if (isBeta || hasCommunityMembership) {
    tier = "full";
  } else if (user.officesOnly) {
    tier = "offices-only";
  } else if (user.parishFeedId !== null) {
    tier = "parish-only";
  } else {
    tier = "unassigned";
  }

  return {
    tier,
    parishFeedId: user.parishFeedId,
    parishSlug,
    isBeta,
    hasCommunityMembership,
  };
}

/**
 * Convenience wrapper — true if the user is a parish-only user (the
 * limited-UI tier). Used by routes that should 403 for parish users
 * (prayer requests, garden, etc.) AND by the parish-only routes that
 * should 403 for full-app users (the simplified dashboard).
 */
export async function isParishOnlyUser(userId: number): Promise<boolean> {
  const access = await getUserAccessTier(userId);
  return access.tier === "parish-only";
}

// Schema validator — this is a Postgres-level check we want to enforce
// in addition to the at-most-one column shape: the parish_feed_id, when
// set, must point at a feed with kind="parish". Run on subscription so
// a misconfigured client can't park a user on a "general" feed.
export function isParishFeed(feed: { kind?: string | null }): boolean {
  return feed.kind === "parish";
}

// Beta gate for the parish flow. While Parish is in beta, only users
// with a beta_users row can subscribe to a parish — keeping the new
// pastoral surface in front of a small, observed cohort. Existing
// parish-only users (if any pre-date the gate) aren't kicked out;
// the gate is at the entry point (subscribe / onboarding), not on
// teardown of access tiers.
export async function isUserBeta(userId: number): Promise<boolean> {
  const [user] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return false;
  const [row] = await db
    .select({ email: betaUsersTable.email })
    .from(betaUsersTable)
    .where(eq(betaUsersTable.email, user.email.toLowerCase()));
  return !!row;
}
