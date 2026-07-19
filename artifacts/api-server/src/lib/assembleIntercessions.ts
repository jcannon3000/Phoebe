import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import {
  db,
  prayerRequestsTable,
  prayersForTable,
  groupsTable,
  groupMembersTable,
  circleIntentionsTable,
  prayerFeedSubscriptionsTable,
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
    // Private sits don't bump the parish solidarity count — a user who
    // marked their sit Private on the contemplation summary doesn't
    // want their activity showing up to other parishioners, even as a
    // nameless +1 to the "praying with you" tally.
    .where(sql`${prayerSessionsTable.endedAt} > NOW() - (${intervalHours}::int * INTERVAL '1 hour')
               AND ${prayerSessionsTable.isPrivate} = false`);
  return row?.count ?? 0;
}

// A parish's STANDING intercessions — up to 7 dateless templates the
// priest programs once (prayer_feed_recurring_entries), carried by the
// parish EVERY day rather than a per-day slate the general feeds use.
// "weekly" templates are filtered to today's weekday in the parish tz;
// "daily" (mask 127) always shows. Returns them in slot order. `source`
// rides along so a "bcp" slot can render its body as a full Book of
// Common Prayer prayer downstream.
export async function readParishStandingIntercessions(
  parishFeedId: number,
  timezone: string,
): Promise<Array<{ id: number; slot: number; title: string; body: string; source: string }>> {
  const rows = await db
    .select({
      id: prayerFeedRecurringEntriesTable.id,
      slot: prayerFeedRecurringEntriesTable.slot,
      title: prayerFeedRecurringEntriesTable.title,
      body: prayerFeedRecurringEntriesTable.body,
      source: prayerFeedRecurringEntriesTable.source,
      recurrenceKind: prayerFeedRecurringEntriesTable.recurrenceKind,
      weekdaysMask: prayerFeedRecurringEntriesTable.weekdaysMask,
    })
    .from(prayerFeedRecurringEntriesTable)
    .where(and(
      eq(prayerFeedRecurringEntriesTable.feedId, parishFeedId),
      eq(prayerFeedRecurringEntriesTable.state, "live"),
    ))
    .orderBy(asc(prayerFeedRecurringEntriesTable.slot));
  // Weekday of "today" in the parish tz (0 = Sunday). Noon-UTC on the
  // resolved calendar date sidesteps any DST edge.
  const weekday = new Date(`${todayInTz(timezone)}T12:00:00Z`).getUTCDay();
  return rows
    .filter((e) => e.recurrenceKind === "daily" || (e.weekdaysMask & (1 << weekday)) !== 0)
    .map((e) => ({ id: e.id, slot: e.slot, title: e.title, body: e.body ?? "", source: e.source ?? "custom" }));
}


// Builds the intercessions surface as one Slide per prayer item (request,
// prayers-for, circle intention, feed entry, parish slot) so the office and
// devotion prayer space mirror the prayer-mode slideshow's "carry one prayer at
// a time" rhythm. (An older single-scrollable-slide variant for the office was
// removed — both surfaces now use these per-item slides.)
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

  // Source queries for the intercessions surface. The viewer's OWN requests are
  // excluded (you don't pray for your own ask in your office/devotion) via the
  // visibleOwnerIds filter below.
  // Feed intercessions row shape — the flat, ongoing list of every prayer feed
  // the viewer subscribes to. (Feeds used to be day-scheduled; that system was
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

  // This block used to run ~11 DB queries strictly SERIALLY on every office
  // fetch (each waiting for the last). They only have three dependency layers,
  // so we fire them in three concurrent waves instead — ~11 serial round-trips
  // → 3 on the office hot path. Behaviour is otherwise identical.

  // Wave 1 — the reads that depend only on userId.
  const [gardenIds, prayersForRows, myGroupRows, feedSubs, parishRow] = await Promise.all([
    getGardenUserIds(userId),
    db
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
      .limit(10),
    db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, userId)),
    db
      .select({ feedId: prayerFeedSubscriptionsTable.feedId })
      .from(prayerFeedSubscriptionsTable)
      .where(eq(prayerFeedSubscriptionsTable.userId, userId)),
    db
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
      .limit(1),
  ]);
  const visibleOwnerIds = gardenIds.filter((id) => id !== userId);
  const myGroupIds = myGroupRows.map((r) => r.groupId);
  const subscribedFeedIds = feedSubs.map((s) => s.feedId);
  // Parish standing intercessions (readParishStandingIntercessions). The two
  // solidarity counts (this-week + today) ride in wave 3.
  const parish = parishRow[0] ?? null;

  // Wave 2 — reads that depend on wave-1 ids (garden, groups, feed subs, parish).
  const [requestRows, circleRows, feedMomentRows, parishEntries] = await Promise.all([
    (async () =>
      visibleOwnerIds.length > 0
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
                // Parish-scoped pastoral concerns never enter the prayer-mode
                // slideshow — they're admin-only and live in the parish inbox.
                isNull(prayerRequestsTable.parishFeedId),
                // Directed ("to a fellow") requests are private — never in the office.
                eq(prayerRequestsTable.directOnly, false),
              ),
            )
            .limit(20)
        : [])(),
    (async () =>
      myGroupIds.length > 0
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
        : [])(),
    (async () =>
      subscribedFeedIds.length > 0
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
                // A feed turned "off" (state = paused) contributes nothing to the
                // office, even for existing subscribers — same full-off rule as
                // discovery and the /today + /subscribed surfaces.
                eq(prayerFeedsTable.state, "live"),
              ),
            )
            .orderBy(desc(sharedMomentsTable.createdAt))
            .limit(6)
        : [])(),
    parish ? readParishStandingIntercessions(parish.id, parish.timezone) : Promise.resolve([]),
  ]);
  const feedRows: FeedRow[] = feedMomentRows.map((r, i) => ({
    id: r.id,
    slot: i,
    title: r.title,
    body: r.body ?? "",
    learnMoreUrl: r.learnMoreUrl,
    feedTitle: r.feedTitle ?? null,
    momentToken: r.momentToken,
  }));

  // Wave 3 — the two parish solidarity counts (this-week + today), in parallel.
  const [parishWeekCount, parishTodayCount] = parish && parishEntries.length > 0
    ? await Promise.all([
        parishionersPrayingCount(parish.id, 24 * 7),
        parishionersPrayingCount(parish.id, 24),
      ])
    : [0, 0];

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
      // A "bcp" slot's body IS the full text of a Book of Common Prayer
      // prayer the priest chose from the library. The office/prayer-mode
      // renderer shows it in a frosted "closing prayer" card captioned
      // "From the Book of Common Prayer" — the way Co-Breathe closes.
      const isBcp = e.source === "bcp";
      slides.push({
        id: `dev-parish-${parish.id}-${e.slot}-${dayKey}`,
        type: "intercessions",
        emoji: isBcp ? "📖" : "⛪",
        // Standing list, not a daily slate — the eyebrow names the parish
        // rather than claiming these are "today's" fresh intentions.
        eyebrow: parish.title.toUpperCase(),
        title: e.title,
        content: body.length > 0 ? body : e.title,
        isCallAndResponse: false,
        callAndResponseLines: null,
        bcpReference: null,
        isScrollable: body.length > 280,
        scrollHint: body.length > 280 ? "↓ continue · tap when ready" : null,
        metadata: {
          source: "parish",
          parishTitle: parish.title,
          parishFeedId: parish.id,
          parishionersPrayingThisWeek: parishWeekCount,
          parishionersPrayingToday: parishTodayCount,
          // BCP slot → the renderer wraps `content` (the full prayer text)
          // in the frosted BCP prayer card and adds the attribution caption.
          isBcp,
        },
      });
    }
  }

  return slides;
}
