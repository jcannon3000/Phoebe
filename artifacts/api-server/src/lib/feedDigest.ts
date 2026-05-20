// ─── Weekly prayer-feed digest — "new since" query ────────────────────────────
//
// Backs the weekly digest sender (lib/bellSender.ts → runWeeklyDigestSender),
// the digest email/push helpers, and GET /api/me/feed-digest which the
// slideshow consumes. One function, one shape — the four surfaces stay
// in lockstep on what counts as "new this week."
//
// "New" = intercessions on the viewer's subscribed feeds whose
// shared_moments row was created after the cutoff. Newest first.
// Action-type intercessions are bubbled out into their own list so the
// push/email can call them out specifically ("Take action this week:
// …") on top of the general "N new to pray" line.

import {
  db,
  prayerFeedSubscriptionsTable,
  sharedMomentsTable,
  prayerFeedsTable,
} from "@workspace/db";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

export interface FeedDigestEntry {
  id: number;
  feedId: number;
  feedSlug: string;
  feedTitle: string;
  feedCoverEmoji: string | null;
  title: string;
  body: string | null;
  // "custom" | "action" | "bcp" — see shared_moments.intercession_source.
  source: string | null;
  learnMoreUrl: string | null;
  // The shared-moment token, used by the slideshow to log an Amen via
  // POST /api/moment/:momentToken/amen.
  momentToken: string | null;
  createdAt: Date;
}

export interface FeedDigest {
  sinceDate: Date;
  entries: FeedDigestEntry[];
  // Subset of entries with source = "action" — surfaced separately in
  // the push body and the email's "Take action this week" section so
  // they aren't lost in a long list of written prayers.
  actionEntries: FeedDigestEntry[];
}

export async function loadFeedDigest(
  userId: number,
  since: Date,
): Promise<FeedDigest> {
  const feedSubs = await db
    .select({ feedId: prayerFeedSubscriptionsTable.feedId })
    .from(prayerFeedSubscriptionsTable)
    .where(eq(prayerFeedSubscriptionsTable.userId, userId));
  const feedIds = [...new Set(feedSubs.map((s) => s.feedId))];
  if (feedIds.length === 0) {
    return { sinceDate: since, entries: [], actionEntries: [] };
  }

  const rows = await db
    .select({
      id: sharedMomentsTable.id,
      feedId: sharedMomentsTable.prayerFeedId,
      feedSlug: prayerFeedsTable.slug,
      feedTitle: prayerFeedsTable.title,
      feedCoverEmoji: prayerFeedsTable.coverEmoji,
      topic: sharedMomentsTable.intercessionTopic,
      name: sharedMomentsTable.name,
      body: sharedMomentsTable.intercessionFullText,
      source: sharedMomentsTable.intercessionSource,
      learnMoreUrl: sharedMomentsTable.learnMoreUrl,
      momentToken: sharedMomentsTable.momentToken,
      createdAt: sharedMomentsTable.createdAt,
    })
    .from(sharedMomentsTable)
    .innerJoin(prayerFeedsTable, eq(prayerFeedsTable.id, sharedMomentsTable.prayerFeedId))
    .where(and(
      inArray(sharedMomentsTable.prayerFeedId, feedIds),
      eq(sharedMomentsTable.templateType, "intercession"),
      sql`${sharedMomentsTable.state} <> 'archived'`,
      gt(sharedMomentsTable.createdAt, since),
    ))
    .orderBy(desc(sharedMomentsTable.createdAt));

  const entries: FeedDigestEntry[] = rows.map((r) => ({
    id: r.id,
    // innerJoin guarantees feedId is non-null at runtime; the schema
    // typing keeps it nullable, hence the fallback.
    feedId: r.feedId ?? 0,
    feedSlug: r.feedSlug,
    feedTitle: r.feedTitle,
    feedCoverEmoji: r.feedCoverEmoji,
    title: r.topic || r.name || "Intercession",
    body: r.body,
    source: r.source,
    learnMoreUrl: r.learnMoreUrl,
    momentToken: r.momentToken,
    createdAt: r.createdAt,
  }));

  return {
    sinceDate: since,
    entries,
    actionEntries: entries.filter((e) => e.source === "action"),
  };
}
