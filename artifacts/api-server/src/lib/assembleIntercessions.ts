import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  prayerRequestsTable,
  prayersForTable,
  groupsTable,
  groupMembersTable,
  circleIntentionsTable,
  prayerFeedSubscriptionsTable,
  prayerFeedEntriesTable,
  prayerFeedRecurringEntriesTable,
  prayerFeedsTable,
  prayerSessionsTable,
  sharedMomentsTable,
  usersTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { getGardenUserIds } from "./garden";
import type { Slide } from "./assembleMorningPrayer";

// Today's calendar date (YYYY-MM-DD) in a given IANA timezone. Mirrors
// the helper in lib/bellSender / routes/prayer-feeds — copied here to
// avoid a cross-file import in what's otherwise a self-contained
// assembler. Falls back to UTC if the zone string is invalid.
function todayInTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Number of distinct parishioners (subscribers of this parish feed)
// who completed a prayer_sessions row in the last `intervalHours`.
// "Praying with you" solidarity — used for both the "this week" and
// "today" counts on parish intercession slides. Pure SQL, idempotent.
async function parishionersPrayingCount(
  parishFeedId: number,
  intervalHours: number,
): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(distinct ${prayerSessionsTable.userId})::int`,
    })
    .from(prayerSessionsTable)
    .innerJoin(
      prayerFeedSubscriptionsTable,
      and(
        eq(prayerFeedSubscriptionsTable.userId, prayerSessionsTable.userId),
        eq(prayerFeedSubscriptionsTable.feedId, parishFeedId),
      ),
    )
    .where(sql`${prayerSessionsTable.endedAt} > NOW() - (${intervalHours}::int * INTERVAL '1 hour')`);
  return row?.count ?? 0;
}

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
            // Parish "pastoral concerns" are private to the requester
            // + parish admin and never enter the office intercessions.
            isNull(prayerRequestsTable.parishFeedId),
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

  // --- 4. Intercessions from each subscribed prayer feed. Feeds are a
  //        flat, ongoing list of intercessions now (the day-scheduled
  //        entry system was retired) — newest first, capped so the
  //        office paragraph stays short.
  const feedSubs = await db
    .select({ feedId: prayerFeedSubscriptionsTable.feedId })
    .from(prayerFeedSubscriptionsTable)
    .where(eq(prayerFeedSubscriptionsTable.userId, userId));
  const subscribedFeedIds = feedSubs.map((s) => s.feedId);
  const feedRows = subscribedFeedIds.length > 0
    ? await db
        .select({
          id: sharedMomentsTable.id,
          title: sql<string>`coalesce(${sharedMomentsTable.intercessionTopic}, ${sharedMomentsTable.name})`,
          feedTitle: prayerFeedsTable.title,
        })
        .from(sharedMomentsTable)
        .leftJoin(prayerFeedsTable, eq(prayerFeedsTable.id, sharedMomentsTable.prayerFeedId))
        .where(
          and(
            inArray(sharedMomentsTable.prayerFeedId, subscribedFeedIds),
            eq(sharedMomentsTable.templateType, "intercession"),
            sql`${sharedMomentsTable.state} <> 'archived'`,
          ),
        )
        .orderBy(desc(sharedMomentsTable.createdAt))
        .limit(6)
    : [];

  // --- 5. Parish intercessions — today's slot-based slate (BCP-style
  //        3-prayer-a-day rhythm) authored by the parish admin. A
  //        parish is a special prayer_feeds row (kind="parish") with
  //        day-scheduled entries in prayer_feed_entries; this is the
  //        wire that puts that admin work in front of each
  //        parishioner during their actual Office or Devotion. Today
  //        is resolved in the parish's local TZ, not the viewer's.
  const parishRow = await db
    .select({
      id: prayerFeedsTable.id,
      title: prayerFeedsTable.title,
      timezone: prayerFeedsTable.timezone,
    })
    .from(prayerFeedsTable)
    .innerJoin(usersTable, eq(usersTable.parishFeedId, prayerFeedsTable.id))
    .where(and(
      eq(usersTable.id, userId),
      eq(prayerFeedsTable.kind, "parish"),
      eq(prayerFeedsTable.state, "live"),
    ))
    .limit(1);
  const parish = parishRow[0] ?? null;
  const parishEntries = parish
    ? await db
        .select({
          slot: prayerFeedEntriesTable.slot,
          title: prayerFeedEntriesTable.title,
          body: prayerFeedEntriesTable.body,
          scriptureRef: prayerFeedEntriesTable.scriptureRef,
        })
        .from(prayerFeedEntriesTable)
        .where(and(
          eq(prayerFeedEntriesTable.feedId, parish.id),
          eq(prayerFeedEntriesTable.entryDate, todayInTz(parish.timezone)),
          eq(prayerFeedEntriesTable.state, "published"),
        ))
        .orderBy(asc(prayerFeedEntriesTable.slot))
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

  if (parish && parishEntries.length > 0) {
    const lines = parishEntries.map((e) => `· ${e.title}`);
    sections.push(`At ${parish.title} today:\n\n${lines.join("\n")}`);
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

// Per-item variant of the intercessions surface — used by the Daily
// Devotion assembler. Returns one Slide per prayer item (request,
// prayers-for, circle intention, feed entry) so the devotion's prayer
// space mirrors the prayer-mode slideshow's "carry one prayer at a
// time" rhythm. The Daily Office still uses buildIntercessionsSlide
// (the single scrollable slide) — that surface is meant to read as a
// liturgical paragraph, not as a deck-within-a-deck.
//
// Slide ordering mirrors the source query order: requests first
// (community-named asks), then prayers-for (the user's private
// commitments), then circle intentions (group-level), then today's
// published feed entries. Within each group, server query order is
// preserved so the user's deck feels stable across reloads.
export async function buildIntercessionSlides(
  userId: number,
  cacheDate: Date,
): Promise<Slide[]> {
  if (!userId || userId <= 0) return [];

  // ── Same source queries as buildIntercessionsSlide. We deliberately
  // duplicate the query logic rather than refactoring shared helpers
  // out — the two callers want subtly different shaping (single
  // collapsed body vs. per-item slides), and a shared query layer
  // would force both consumers through one transformation. The query
  // text is identical though, so any future change should land here
  // and in the slide builder above.
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
          ownerAvatarUrl: usersTable.avatarUrl,
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
            // Parish-scoped pastoral concerns never enter the prayer-
            // mode slideshow — they're admin-only and live in the
            // parish concerns inbox.
            isNull(prayerRequestsTable.parishFeedId),
          ),
        )
        .limit(20)
    : [];

  const prayersForRows = await db
    .select({
      id: prayersForTable.id,
      prayerText: prayersForTable.prayerText,
      recipientUserId: prayersForTable.recipientUserId,
      expiresAt: prayersForTable.expiresAt,
      recipientName: usersTable.name,
      recipientAvatarUrl: usersTable.avatarUrl,
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

  const feedSubs = await db
    .select({ feedId: prayerFeedSubscriptionsTable.feedId })
    .from(prayerFeedSubscriptionsTable)
    .where(eq(prayerFeedSubscriptionsTable.userId, userId));
  const subscribedFeedIds = feedSubs.map((s) => s.feedId);

  // Feed intercessions — the flat, ongoing list of every prayer feed
  // the viewer subscribes to. Newest first, capped so the devotion
  // stays short. (Feeds used to be day-scheduled; that system was
  // retired — a feed is now just a list of intercessions.)
  type FeedRow = {
    id: number;
    slot: number;
    title: string;
    body: string;
    learnMoreUrl: string | null;
    feedTitle: string | null;
    momentToken: string | null;
  };
  const feedMomentRows = subscribedFeedIds.length > 0
    ? await db
        .select({
          id: sharedMomentsTable.id,
          title: sql<string>`coalesce(${sharedMomentsTable.intercessionTopic}, ${sharedMomentsTable.name})`,
          body: sharedMomentsTable.intercessionFullText,
          learnMoreUrl: sharedMomentsTable.learnMoreUrl,
          feedTitle: prayerFeedsTable.title,
          momentToken: sharedMomentsTable.momentToken,
        })
        .from(sharedMomentsTable)
        .leftJoin(prayerFeedsTable, eq(prayerFeedsTable.id, sharedMomentsTable.prayerFeedId))
        .where(
          and(
            inArray(sharedMomentsTable.prayerFeedId, subscribedFeedIds),
            eq(sharedMomentsTable.templateType, "intercession"),
            sql`${sharedMomentsTable.state} <> 'archived'`,
          ),
        )
        .orderBy(desc(sharedMomentsTable.createdAt))
        .limit(6)
    : [];
  const feedRows: FeedRow[] = feedMomentRows.map((r, i) => ({
    id: r.id,
    slot: i,
    title: r.title,
    body: r.body ?? "",
    learnMoreUrl: r.learnMoreUrl,
    feedTitle: r.feedTitle ?? null,
    momentToken: r.momentToken,
  }));

  // Parish intercessions — see the matching block in
  // buildIntercessionsSlide for the rationale. We additionally pull
  // the two solidarity counts (this-week + today) here so each parish
  // slide can carry them in its metadata; the prayer-mode renderer
  // shows them as a chip while the parishioner is reading the prayer.
  const parishRow = await db
    .select({
      id: prayerFeedsTable.id,
      title: prayerFeedsTable.title,
      timezone: prayerFeedsTable.timezone,
    })
    .from(prayerFeedsTable)
    .innerJoin(usersTable, eq(usersTable.parishFeedId, prayerFeedsTable.id))
    .where(and(
      eq(usersTable.id, userId),
      eq(prayerFeedsTable.kind, "parish"),
      eq(prayerFeedsTable.state, "live"),
    ))
    .limit(1);
  const parish = parishRow[0] ?? null;
  const parishEntries = parish
    ? await db
        .select({
          slot: prayerFeedEntriesTable.slot,
          title: prayerFeedEntriesTable.title,
          body: prayerFeedEntriesTable.body,
          scriptureRef: prayerFeedEntriesTable.scriptureRef,
        })
        .from(prayerFeedEntriesTable)
        .where(and(
          eq(prayerFeedEntriesTable.feedId, parish.id),
          eq(prayerFeedEntriesTable.entryDate, todayInTz(parish.timezone)),
          eq(prayerFeedEntriesTable.state, "published"),
        ))
        .orderBy(asc(prayerFeedEntriesTable.slot))
    : [];
  const parishWeekCount = parish && parishEntries.length > 0
    ? await parishionersPrayingCount(parish.id, 24 * 7)
    : 0;
  const parishTodayCount = parish && parishEntries.length > 0
    ? await parishionersPrayingCount(parish.id, 24)
    : 0;

  const slides: Slide[] = [];
  const dayKey = cacheDate.toISOString().slice(0, 10);

  // 1. Prayer requests — one slide each. Eyebrow names the source so
  //    the viewer knows whose ask this is; body holds the request
  //    text verbatim. We don't truncate here (these are read in a
  //    devotion context, not on a feed card).
  for (const r of requestRows) {
    if (!r.body) continue;
    const who = r.isAnonymous ? "Someone" : (r.ownerName ?? "Someone");
    // Anonymous requests intentionally drop the avatar so the slide
    // doesn't betray the requester's identity even when the renderer
    // has the URL handy.
    const avatarUrl = r.isAnonymous ? null : (r.ownerAvatarUrl ?? null);
    slides.push({
      id: `dev-req-${r.id}-${dayKey}`,
      type: "intercessions",
      emoji: "🙏🏽",
      eyebrow: "A PRAYER REQUEST",
      title: who,
      content: r.body,
      isCallAndResponse: false,
      callAndResponseLines: null,
      bcpReference: null,
      isScrollable: r.body.length > 280,
      scrollHint: r.body.length > 280 ? "↓ continue · tap when ready" : null,
      metadata: {
        source: "request",
        requestId: r.id,
        isAnonymous: r.isAnonymous,
        // Avatar surfaces in the renderer for the prayer-mode-style
        // centered layout. authorName mirrors the title for consistency
        // with the prayer-mode slide schema.
        authorName: who,
        authorAvatarUrl: avatarUrl,
      },
    });
  }

  // 2. Prayers-for — the user's private "I am holding X" commitments.
  //    Title carries the recipient name so the viewer remembers who
  //    they're carrying.
  for (const p of prayersForRows) {
    if (!p.prayerText) continue;
    const who = p.recipientName ?? "Someone";
    slides.push({
      id: `dev-prayer-for-${p.id}-${dayKey}`,
      type: "intercessions",
      emoji: "🌿",
      eyebrow: "I AM HOLDING",
      title: who,
      content: p.prayerText,
      isCallAndResponse: false,
      callAndResponseLines: null,
      bcpReference: null,
      isScrollable: p.prayerText.length > 280,
      scrollHint: p.prayerText.length > 280 ? "↓ continue · tap when ready" : null,
      metadata: {
        source: "prayer-for",
        prayerForId: p.id,
        authorName: who,
        authorAvatarUrl: p.recipientAvatarUrl ?? null,
      },
    });
  }

  // 3. Circle intentions — a group's named, ongoing prayer focus.
  for (const c of circleRows) {
    slides.push({
      id: `dev-circle-${c.id}-${dayKey}`,
      type: "intercessions",
      emoji: "🤝🏽",
      eyebrow: "A CIRCLE INTENTION",
      title: c.groupName ?? "Our circle",
      content: c.title,
      isCallAndResponse: false,
      callAndResponseLines: null,
      bcpReference: null,
      isScrollable: false,
      scrollHint: null,
      metadata: { source: "circle-intention", circleIntentionId: c.id },
    });
  }

  // 4. Today's feed entries — the platform-wide intentions the user
  //    is subscribed to (e.g. phoebe-climate). Body is included if
  //    the publisher wrote one; otherwise just the title carries the
  //    prayer.
  for (const f of feedRows) {
    const body = (f.body ?? "").trim();
    slides.push({
      id: `dev-feed-${f.id}-${dayKey}`,
      type: "intercessions",
      emoji: "📡",
      eyebrow: f.feedTitle ? `TODAY ON ${f.feedTitle.toUpperCase()}` : "TODAY'S FEED",
      title: f.title,
      content: body.length > 0 ? body : f.title,
      isCallAndResponse: false,
      callAndResponseLines: null,
      bcpReference: null,
      isScrollable: body.length > 280,
      scrollHint: body.length > 280 ? "↓ continue · tap when ready" : null,
      metadata: {
        source: "feed",
        feedTitle: f.feedTitle ?? null,
        // A feed intercession is a shared_moment — its Amen logs a
        // check-in via POST /api/moment/:momentToken/amen, the same
        // path the prayer-mode slideshow uses.
        momentToken: f.momentToken,
        // Optional "Learn more" URL — surfaces as a pill CTA below
        // the body, mirroring the Bible.com pill on lectionary
        // slides. Opens in SFSafariViewController.
        learnMoreUrl: f.learnMoreUrl ?? null,
      },
    });
  }

  // 5. Parish intercessions — today's published slate. One slide per
  //    slot, in slot order. Metadata carries solidarity counts so the
  //    renderer can chip in "N from your parish are praying this with
  //    you today / this week" — the in-the-moment version of what the
  //    parish dashboard and post-Office celebration screen already
  //    show outside the liturgy.
  if (parish) {
    for (const e of parishEntries) {
      const body = (e.body ?? "").trim();
      slides.push({
        id: `dev-parish-${parish.id}-${e.slot}-${dayKey}`,
        type: "intercessions",
        emoji: "⛪",
        eyebrow: `TODAY AT ${parish.title.toUpperCase()}`,
        title: e.title,
        content: body.length > 0 ? body : e.title,
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: e.scriptureRef ?? null,
        isScrollable: body.length > 280,
        scrollHint: body.length > 280 ? "↓ continue · tap when ready" : null,
        metadata: {
          source: "parish",
          parishTitle: parish.title,
          parishFeedId: parish.id,
          parishionersPrayingThisWeek: parishWeekCount,
          parishionersPrayingToday: parishTodayCount,
          scriptureRef: e.scriptureRef ?? null,
        },
      });
    }
  }

  return slides;
}
