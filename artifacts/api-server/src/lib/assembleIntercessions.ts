import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  prayerRequestsTable,
  prayersForTable,
  groupsTable,
  groupMembersTable,
  circleIntentionsTable,
  prayerFeedSubscriptionsTable,
  prayerFeedEntriesTable,
  prayerFeedsTable,
  usersTable,
} from "@workspace/db";
import { getGardenUserIds } from "./garden";
import type { Slide } from "./assembleMorningPrayer";

// Build the "Intercessions" slide for the Daily Office.
//
// Sourced from the same pool the prayer-mode slideshow draws on so the
// office and the daily prayer-list speak to the same set of named asks:
//
//   1. Active prayer requests visible to the user — their own + their
//      garden (group peers + active letter correspondents). Skipped if
//      anonymous, answered, or expired.
//   2. Active prayers-for the user is holding for someone else.
//      ("I am carrying X for the next 7 days.")
//   3. Circle intentions from the groups the user belongs to —
//      ongoing prayer foci a parish or circle has named.
//   4. Today's published entry on every feed the user subscribes to.
//      The climate-feed daily intention slides in here so it's woven
//      into the office, not just floating on the dashboard.
//
// Returns a single scrollable Slide with all of the above stacked into
// one body string, or `null` if there's nothing to surface — in which
// case the assembler skips the slide entirely (no "no intercessions
// today" filler).
//
// The slide is built fresh per request and is NOT cached alongside the
// rest of the office (which DOES go in `morning_prayer_cache` keyed by
// date alone). Caching this would cross-contaminate users.
//
// Format: a header line per source section, then a bulleted list. Final
// line is a short prayer-form prompt so the eye lands somewhere closing
// instead of trailing off mid-list.

export async function buildIntercessionsSlide(
  userId: number,
  cacheDate: Date,
): Promise<Slide | null> {
  if (!userId || userId <= 0) return null;

  // --- 1. Prayer requests (own + garden). We use getGardenUserIds for
  //        the visibility set so this matches what the user's feed shows.
  const gardenIds = await getGardenUserIds(userId);
  const visibleOwnerIds = [userId, ...gardenIds];

  const requestRows = visibleOwnerIds.length > 0
    ? await db
        .select({
          id: prayerRequestsTable.id,
          body: prayerRequestsTable.body,
          ownerId: prayerRequestsTable.ownerId,
          isAnonymous: prayerRequestsTable.isAnonymous,
          ownerName: usersTable.name,
        })
        .from(prayerRequestsTable)
        .leftJoin(usersTable, eq(usersTable.id, prayerRequestsTable.ownerId))
        .where(
          and(
            inArray(prayerRequestsTable.ownerId, visibleOwnerIds),
            eq(prayerRequestsTable.isAnswered, false),
            isNull(prayerRequestsTable.closedAt),
            or(
              isNull(prayerRequestsTable.expiresAt),
              gt(prayerRequestsTable.expiresAt, new Date()),
            ),
          ),
        )
        .limit(20)
    : [];

  // --- 2. Active prayers-for the user is holding. The prayer is theirs
  //        privately (not visible to others) but surfacing it in the
  //        office reinforces the commitment.
  const prayersForRows = await db
    .select({
      id: prayersForTable.id,
      prayerText: prayersForTable.prayerText,
      recipientUserId: prayersForTable.recipientUserId,
      expiresAt: prayersForTable.expiresAt,
      recipientName: usersTable.name,
    })
    .from(prayersForTable)
    .leftJoin(usersTable, eq(usersTable.id, prayersForTable.recipientUserId))
    .where(
      and(
        eq(prayersForTable.prayerUserId, userId),
        gt(prayersForTable.expiresAt, new Date()),
        isNull(prayersForTable.acknowledgedAt),
      ),
    )
    .limit(10);

  // --- 3. Circle intentions across the user's groups.
  const myGroupIds = (
    await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, userId))
  ).map((r) => r.groupId);

  const circleRows = myGroupIds.length > 0
    ? await db
        .select({
          id: circleIntentionsTable.id,
          title: circleIntentionsTable.title,
          groupName: groupsTable.name,
        })
        .from(circleIntentionsTable)
        .leftJoin(groupsTable, eq(groupsTable.id, circleIntentionsTable.groupId))
        .where(
          and(
            inArray(circleIntentionsTable.groupId, myGroupIds),
            isNull(circleIntentionsTable.archivedAt),
          ),
        )
        .limit(15)
    : [];

  // --- 4. Today's published entry on each subscribed feed. Date is
  //        compared in UTC to keep this cheap; near-midnight users in
  //        the wrong timezone may briefly see yesterday's or
  //        tomorrow's entry, which is acceptable for an office surface.
  const todayStr = cacheDate.toISOString().slice(0, 10);
  const feedSubs = await db
    .select({ feedId: prayerFeedSubscriptionsTable.feedId })
    .from(prayerFeedSubscriptionsTable)
    .where(eq(prayerFeedSubscriptionsTable.userId, userId));
  const subscribedFeedIds = feedSubs.map((s) => s.feedId);
  const feedRows = subscribedFeedIds.length > 0
    ? await db
        .select({
          id: prayerFeedEntriesTable.id,
          title: prayerFeedEntriesTable.title,
          feedTitle: prayerFeedsTable.title,
        })
        .from(prayerFeedEntriesTable)
        .leftJoin(prayerFeedsTable, eq(prayerFeedsTable.id, prayerFeedEntriesTable.feedId))
        .where(
          and(
            inArray(prayerFeedEntriesTable.feedId, subscribedFeedIds),
            eq(prayerFeedEntriesTable.entryDate, todayStr),
            eq(prayerFeedEntriesTable.state, "published"),
          ),
        )
    : [];

  // Compose the body text. Each source becomes its own section if
  // populated; absent sources are silently skipped. Empty body → no
  // slide at all (return null).
  const sections: string[] = [];

  if (requestRows.length > 0) {
    const lines = requestRows
      .filter((r) => !!r.body)
      .map((r) => {
        const who = r.isAnonymous ? "" : (r.ownerName ?? "");
        const trimmedBody = r.body.length > 200 ? r.body.slice(0, 200).trim() + "…" : r.body;
        return who ? `· ${who} — ${trimmedBody}` : `· ${trimmedBody}`;
      });
    if (lines.length > 0) {
      sections.push(`For our community's hopes and burdens:\n\n${lines.join("\n\n")}`);
    }
  }

  if (prayersForRows.length > 0) {
    const lines = prayersForRows
      .filter((r) => !!r.prayerText)
      .map((r) => {
        const who = r.recipientName ?? "this person";
        const trimmed = r.prayerText.length > 160 ? r.prayerText.slice(0, 160).trim() + "…" : r.prayerText;
        return `· ${who} — ${trimmed}`;
      });
    if (lines.length > 0) {
      sections.push(`Those I am holding in prayer:\n\n${lines.join("\n\n")}`);
    }
  }

  if (circleRows.length > 0) {
    const lines = circleRows.map((r) => {
      const community = r.groupName ? ` (${r.groupName})` : "";
      return `· ${r.title}${community}`;
    });
    if (lines.length > 0) {
      sections.push(`Our circles' intentions:\n\n${lines.join("\n")}`);
    }
  }

  if (feedRows.length > 0) {
    const lines = feedRows.map((r) => {
      const feed = r.feedTitle ? ` — ${r.feedTitle}` : "";
      return `· ${r.title}${feed}`;
    });
    if (lines.length > 0) {
      sections.push(`Across the network today:\n\n${lines.join("\n")}`);
    }
  }

  if (sections.length === 0) return null;

  const closing = "\n\nWe hold these before you, O Lord. Let us pray.";
  const content = sections.join("\n\n") + closing;

  return {
    // Stable ID per day so the slide deck reconciliation in the renderer
    // doesn't churn between renders. Not used for caching (this slide
    // is built fresh per request) — just for React keying.
    id: `intercessions-${cacheDate.toISOString().slice(0, 10)}-${userId}`,
    type: "intercessions",
    emoji: "🙏🏽",
    eyebrow: "INTERCESSIONS",
    title: "Today's prayers",
    content,
    isCallAndResponse: false,
    callAndResponseLines: null,
    bcpReference: "BCP p. 100",
    isScrollable: true,
    scrollHint: "↓ scroll · tap when ready",
    metadata: {},
  };
}
