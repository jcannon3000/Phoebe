// Parish Weekly Prayer List — the beta experiment.
//
// Unit of engagement is the PERSON / INTERCESSION / FEED ENTRY in the
// viewer's parish life, with a once-per-week goal. The list shrinks as
// they pray; refills at the next Sunday boundary or when new prayers
// arrive.
//
// Three sources merged into one weekly view:
//   1. Active prayer requests from peers in the viewer's groups.
//      Keyed by person; multiple active requests collapse to one entry
//      (most recent). One amen this week = "I've prayed for them."
//   2. Community intercessions the viewer participates in (shared_moments
//      with templateType="intercession"). One isCheckin post this week
//      via one of the viewer's moment user tokens = "I've prayed it."
//   3. Today's prayer-feed entries from feeds the viewer subscribes to.
//      Feed entries are slot-based per day; we treat each day's slate
//      as the "this week" item — once prayed today, the entry is
//      considered done for this week's rollup.
//
// Week boundary: global Sunday → Saturday in the viewer's tz. Same
// reasoning as the original requests-only model (gives the parish a
// shared cadence; avoids the rolling "Sara vanishes for 7 days" effect).

import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  groupsTable,
  groupMembersTable,
  prayerRequestsTable,
  prayerRequestAmensTable,
  sharedMomentsTable,
  momentUserTokensTable,
  momentPostsTable,
  prayerFeedSubscriptionsTable,
} from "@workspace/db";

export type ParishWeeklyEntry =
  | {
      kind: "request";
      id: string;
      title: string;
      subtitle: string | null;
      avatarUrl: string | null;
      emoji: string | null;
      prayedAt: string | null;
      userId: number;
      request: {
        id: number;
        body: string;
        isAnonymous: boolean;
        kind: string | null;
        expiresAt: string | null;
        createdAt: string;
      };
    }
  | {
      kind: "intercession";
      id: string;
      title: string;
      subtitle: string | null;
      avatarUrl: string | null;
      emoji: string | null;
      prayedAt: string | null;
      intercession: {
        momentId: number;
        momentToken: string | null;
        intercessionTopic: string | null;
        intercessionFullText: string | null;
        intention: string | null;
        groupName: string | null;
        groupSlug: string | null;
        groupEmoji: string | null;
      };
    }
  | {
      kind: "feed-entry";
      id: string;
      title: string;
      subtitle: string | null;
      avatarUrl: string | null;
      emoji: string | null;
      prayedAt: string | null;
      feedEntry: {
        entryId: number;
        feedId: number;
        feedSlug: string;
        feedTitle: string;
        feedCoverEmoji: string | null;
        slot: number;
        body: string;
        learnMoreUrl: string | null;
        isRecurring: boolean;
      };
    };

export interface ParishWeeklyResult {
  weekStartYmd: string;
  weekEndYmd: string;
  unprayed: ParishWeeklyEntry[];
  prayed: ParishWeeklyEntry[];
}

/**
 * Sunday-start YYYY-MM-DD for "this week" in the given tz.
 */
function sundayStartYmd(tz: string, now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find(p => p.type === "weekday")?.value ?? "Sun";
  const y = parts.find(p => p.type === "year")?.value ?? "1970";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
  const d = parts.find(p => p.type === "day")?.value ?? "01";
  const DAY_INDEX: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayIdx = DAY_INDEX[weekday] ?? 0;
  const t = Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  const start = new Date(t - dayIdx * 86_400_000);
  const sy = start.getUTCFullYear();
  const sm = String(start.getUTCMonth() + 1).padStart(2, "0");
  const sd = String(start.getUTCDate()).padStart(2, "0");
  return `${sy}-${sm}-${sd}`;
}

/**
 * Convert local-tz YYYY-MM-DD to the UTC Date for 00:00 in that tz.
 * Used to bound "this week" amen / check-in lookups.
 */
function localYmdToUtcDate(ymd: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  let candidate = new Date(Date.UTC(y!, m! - 1, d!));
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  for (let i = 0; i < 48; i++) {
    if (fmt.format(candidate) === ymd) {
      while (fmt.format(new Date(candidate.getTime() - 30 * 60_000)) === ymd) {
        candidate = new Date(candidate.getTime() - 30 * 60_000);
      }
      return candidate;
    }
    candidate = new Date(candidate.getTime() + 30 * 60_000);
  }
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

/**
 * Build the parish-weekly entries for a viewer. See module header.
 */
export async function getParishWeekly(userId: number): Promise<ParishWeeklyResult> {
  const [me] = await db
    .select({ id: usersTable.id, email: usersTable.email, timezone: usersTable.timezone })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!me) {
    return { weekStartYmd: "", weekEndYmd: "", unprayed: [], prayed: [] };
  }
  const tz = me.timezone || "UTC";
  const viewerEmail = me.email.toLowerCase();
  const weekStartYmd = sundayStartYmd(tz);
  const weekStartDate = localYmdToUtcDate(weekStartYmd, tz);
  const [wsY, wsM, wsD] = weekStartYmd.split("-").map(Number);
  const weekEnd = new Date(Date.UTC(wsY!, wsM! - 1, wsD! + 6));
  const weekEndYmd = `${weekEnd.getUTCFullYear()}-${String(weekEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(weekEnd.getUTCDate()).padStart(2, "0")}`;
  const todayYmd = todayInTz(tz);

  const unprayed: ParishWeeklyEntry[] = [];
  const prayed: ParishWeeklyEntry[] = [];

  // ── 1. Prayer requests from group peers ─────────────────────────
  const myGroups = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.userId, userId),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ne(groupMembersTable.role, "hidden_admin"),
    ));
  const groupIds = [...new Set(myGroups.map(r => r.groupId))];
  if (groupIds.length > 0) {
    const groupPeerRows = await db
      .select({ userId: groupMembersTable.userId })
      .from(groupMembersTable)
      .where(and(
        inArray(groupMembersTable.groupId, groupIds),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
        ne(groupMembersTable.role, "hidden_admin"),
        ne(groupMembersTable.userId, userId),
      ));
    const peerUserIds = [...new Set(
      groupPeerRows.map(r => r.userId).filter((id): id is number => id != null),
    )];
    if (peerUserIds.length > 0) {
      const requestRows = await db
        .select({
          id: prayerRequestsTable.id,
          ownerId: prayerRequestsTable.ownerId,
          body: prayerRequestsTable.body,
          isAnonymous: prayerRequestsTable.isAnonymous,
          kind: prayerRequestsTable.kind,
          expiresAt: prayerRequestsTable.expiresAt,
          createdAt: prayerRequestsTable.createdAt,
        })
        .from(prayerRequestsTable)
        .where(and(
          inArray(prayerRequestsTable.ownerId, peerUserIds),
          eq(prayerRequestsTable.isAnonymous, false),
          eq(prayerRequestsTable.isAnswered, false),
          isNull(prayerRequestsTable.closedAt),
          or(
            isNull(prayerRequestsTable.expiresAt),
            sql`${prayerRequestsTable.expiresAt} > NOW()`,
          )!,
        ))
        .orderBy(desc(prayerRequestsTable.createdAt));
      // Each prayer request gets its own entry — we used to collapse
      // by owner so the same person appeared only once, but that
      // hid the fact that one peer might be carrying multiple things
      // at once. The client dedupes avatars in the stack so the
      // visual roster still reads as "people" not "requests."
      const ownerIds = [...new Set(requestRows.map(r => r.ownerId))];
      if (ownerIds.length > 0) {
        const peers = await db
          .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(inArray(usersTable.id, ownerIds));
        const peerById = new Map(peers.map(p => [p.id, p]));
        const requestIds = requestRows.map(r => r.id);
        const myAmens = await db
          .select({
            requestId: prayerRequestAmensTable.requestId,
            prayedAt: prayerRequestAmensTable.prayedAt,
          })
          .from(prayerRequestAmensTable)
          .where(and(
            inArray(prayerRequestAmensTable.requestId, requestIds),
            eq(prayerRequestAmensTable.userId, userId),
            gte(prayerRequestAmensTable.prayedAt, weekStartDate),
          ))
          .orderBy(desc(prayerRequestAmensTable.prayedAt));
        const prayedRequestIds = new Map<number, Date>();
        for (const a of myAmens) {
          if (a.prayedAt && !prayedRequestIds.has(a.requestId)) {
            prayedRequestIds.set(a.requestId, a.prayedAt);
          }
        }
        for (const req of requestRows) {
          const peer = peerById.get(req.ownerId);
          const prayedAt = prayedRequestIds.get(req.id) ?? null;
          const entry: ParishWeeklyEntry = {
            kind: "request",
            id: `request-${req.id}`,
            title: peer?.name ?? "Someone",
            subtitle: req.body.length > 120 ? `${req.body.slice(0, 117)}…` : req.body,
            avatarUrl: peer?.avatarUrl ?? null,
            emoji: null,
            prayedAt: prayedAt ? new Date(prayedAt).toISOString() : null,
            userId: req.ownerId,
            request: {
              id: req.id,
              body: req.body,
              isAnonymous: req.isAnonymous,
              kind: req.kind,
              expiresAt: req.expiresAt ? new Date(req.expiresAt).toISOString() : null,
              createdAt: new Date(req.createdAt).toISOString(),
            },
          };
          if (prayedAt) prayed.push(entry);
          else unprayed.push(entry);
        }
      }
    }
  }

  // ── 2. Community intercessions the viewer participates in ───────
  const tokenRows = await db
    .select({ momentId: momentUserTokensTable.momentId, userToken: momentUserTokensTable.userToken })
    .from(momentUserTokensTable)
    .where(sql`LOWER(${momentUserTokensTable.email}) = ${viewerEmail}`);
  const myMomentIds = [...new Set(tokenRows.map(r => r.momentId))];
  const myTokens = new Set(tokenRows.map(r => r.userToken));
  if (myMomentIds.length > 0) {
    const moments = await db
      .select({
        id: sharedMomentsTable.id,
        name: sharedMomentsTable.name,
        intention: sharedMomentsTable.intention,
        intercessionTopic: sharedMomentsTable.intercessionTopic,
        intercessionFullText: sharedMomentsTable.intercessionFullText,
        momentToken: sharedMomentsTable.momentToken,
        groupId: sharedMomentsTable.groupId,
        templateType: sharedMomentsTable.templateType,
        state: sharedMomentsTable.state,
        goalDays: sharedMomentsTable.goalDays,
        cycleStartedAt: sharedMomentsTable.commitmentCycleStartedAt,
        reachedAt: sharedMomentsTable.commitmentGoalReachedAt,
      })
      .from(sharedMomentsTable)
      .where(and(
        inArray(sharedMomentsTable.id, myMomentIds),
        eq(sharedMomentsTable.templateType, "intercession"),
      ));
    const now = new Date();
    const graceMs = 2 * 24 * 60 * 60 * 1000;
    const live = moments.filter(m => {
      if (m.state === "archived") return false;
      if (m.reachedAt && (now.getTime() - new Date(m.reachedAt).getTime()) > graceMs) return false;
      if (!m.reachedAt && (m.goalDays ?? 0) > 0 && m.cycleStartedAt) {
        const cycleEndMs = new Date(m.cycleStartedAt).getTime() + (m.goalDays ?? 0) * 24 * 60 * 60 * 1000;
        if (now.getTime() > cycleEndMs) return false;
      }
      return true;
    });
    if (live.length > 0) {
      const liveIds = live.map(m => m.id);
      const groupRows = live
        .map(m => m.groupId)
        .filter((g): g is number => g != null);
      const groupsById = new Map<number, { name: string; slug: string; emoji: string | null }>();
      if (groupRows.length > 0) {
        const gs = await db
          .select({ id: groupsTable.id, name: groupsTable.name, slug: groupsTable.slug, emoji: groupsTable.emoji })
          .from(groupsTable)
          .where(inArray(groupsTable.id, groupRows));
        for (const g of gs) groupsById.set(g.id, { name: g.name, slug: g.slug, emoji: g.emoji });
      }
      // Viewer's check-ins this week on these intercessions.
      const checkinRows = await db
        .select({
          momentId: momentPostsTable.momentId,
          userToken: momentPostsTable.userToken,
          createdAt: momentPostsTable.createdAt,
        })
        .from(momentPostsTable)
        .where(and(
          inArray(momentPostsTable.momentId, liveIds),
          eq(momentPostsTable.isCheckin, 1),
          gte(momentPostsTable.createdAt, weekStartDate),
        ))
        .orderBy(desc(momentPostsTable.createdAt));
      const prayedMomentIds = new Map<number, Date>();
      for (const r of checkinRows) {
        if (myTokens.has(r.userToken) && r.createdAt && !prayedMomentIds.has(r.momentId)) {
          prayedMomentIds.set(r.momentId, r.createdAt);
        }
      }
      for (const m of live) {
        const grp = m.groupId ? groupsById.get(m.groupId) : null;
        const prayedAt = prayedMomentIds.get(m.id) ?? null;
        const title = m.intercessionTopic || m.name || "Community intercession";
        const subtitle = grp?.name ?? m.intention ?? null;
        const entry: ParishWeeklyEntry = {
          kind: "intercession",
          id: `intercession-${m.id}`,
          title,
          subtitle,
          avatarUrl: null,
          emoji: grp?.emoji ?? "🙏🏽",
          prayedAt: prayedAt ? new Date(prayedAt).toISOString() : null,
          intercession: {
            momentId: m.id,
            momentToken: m.momentToken,
            intercessionTopic: m.intercessionTopic,
            intercessionFullText: m.intercessionFullText,
            intention: m.intention,
            groupName: grp?.name ?? null,
            groupSlug: grp?.slug ?? null,
            groupEmoji: grp?.emoji ?? null,
          },
        };
        if (prayedAt) prayed.push(entry);
        else unprayed.push(entry);
      }
    }
  }

  // ── 3. Today's prayer-feed entries from subscribed feeds ─────────
  //
  // Feed entries are slot-based per day. We treat each day's slate as
  // the "this week" unit: prayed-today flips the entry into the
  // prayed bucket; tomorrow new entries refresh the list. Subscribers
  // see a steady drip across the week rather than a fixed Monday
  // dump. We pull from /api/prayer-feeds/today's same data path —
  // see lib/prayerFeedToday.ts for the canonical implementation. We
  // inline a minimal version here so we don't drag the HTTP layer
  // into a lib import.
  const mySubscriptions = await db
    .select({ feedId: prayerFeedSubscriptionsTable.feedId })
    .from(prayerFeedSubscriptionsTable)
    .where(eq(prayerFeedSubscriptionsTable.userId, userId));
  const feedIds = [...new Set(mySubscriptions.map(s => s.feedId))];
  if (feedIds.length > 0) {
    // Each feed has its intercessions stored as shared_moments rows
    // linked via prayer_feed_id. /api/moments requires the viewer to
    // have a moment_user_tokens row for the moment to surface it —
    // reconcileFeedPracticeMembers writes those when the user fetches
    // /api/moments. Parish-weekly must require the same token so the
    // three primary surfaces (community detail, /prayer-list, main
    // slideshow) and the parish-weekly card agree on what shows.
    //
    // Without this gate, a feed intercession would appear in
    // parish-weekly the instant the user subscribed but stay invisible
    // on the other surfaces until /api/moments was hit once.
    const feedMoments = await db
      .select({
        id: sharedMomentsTable.id,
        name: sharedMomentsTable.name,
        intercessionTopic: sharedMomentsTable.intercessionTopic,
        intercessionFullText: sharedMomentsTable.intercessionFullText,
        prayerFeedId: sharedMomentsTable.prayerFeedId,
        state: sharedMomentsTable.state,
        templateType: sharedMomentsTable.templateType,
      })
      .from(sharedMomentsTable)
      .innerJoin(
        momentUserTokensTable,
        and(
          eq(momentUserTokensTable.momentId, sharedMomentsTable.id),
          sql`LOWER(${momentUserTokensTable.email}) = ${viewerEmail}`,
        ),
      )
      .where(and(
        inArray(sharedMomentsTable.prayerFeedId, feedIds),
        eq(sharedMomentsTable.templateType, "intercession"),
        ne(sharedMomentsTable.state, "archived"),
      ));
    if (feedMoments.length > 0) {
      const feedRows = await db
        .select({
          id: sql<number>`prayer_feeds.id`.as("id"),
          slug: sql<string>`prayer_feeds.slug`.as("slug"),
          title: sql<string>`prayer_feeds.title`.as("title"),
          coverEmoji: sql<string | null>`prayer_feeds.cover_emoji`.as("cover_emoji"),
        })
        .from(sql`prayer_feeds`)
        .where(inArray(sql`prayer_feeds.id`, feedIds));
      const feedById = new Map<number, { slug: string; title: string; coverEmoji: string | null }>();
      for (const f of feedRows) {
        feedById.set(f.id, { slug: f.slug, title: f.title, coverEmoji: f.coverEmoji });
      }
      const feedMomentIds = feedMoments.map(m => m.id);
      const feedCheckins = await db
        .select({
          momentId: momentPostsTable.momentId,
          userToken: momentPostsTable.userToken,
          windowDate: momentPostsTable.windowDate,
          createdAt: momentPostsTable.createdAt,
        })
        .from(momentPostsTable)
        .where(and(
          inArray(momentPostsTable.momentId, feedMomentIds),
          eq(momentPostsTable.isCheckin, 1),
          eq(momentPostsTable.windowDate, todayYmd),
        ));
      // Feed-side tokens for the viewer.
      const myFeedTokens = await db
        .select({ momentId: momentUserTokensTable.momentId, userToken: momentUserTokensTable.userToken })
        .from(momentUserTokensTable)
        .where(and(
          inArray(momentUserTokensTable.momentId, feedMomentIds),
          sql`LOWER(${momentUserTokensTable.email}) = ${viewerEmail}`,
        ));
      const myFeedTokenSet = new Set(myFeedTokens.map(t => t.userToken));
      const prayedFeedMomentIds = new Map<number, Date>();
      for (const r of feedCheckins) {
        if (myFeedTokenSet.has(r.userToken) && r.createdAt && !prayedFeedMomentIds.has(r.momentId)) {
          prayedFeedMomentIds.set(r.momentId, r.createdAt);
        }
      }
      for (const m of feedMoments) {
        if (m.prayerFeedId == null) continue;
        const feed = feedById.get(m.prayerFeedId);
        if (!feed) continue;
        const prayedAt = prayedFeedMomentIds.get(m.id) ?? null;
        const title = m.intercessionTopic || m.name || "Intercession";
        const entry: ParishWeeklyEntry = {
          kind: "feed-entry",
          id: `feed-entry-${m.id}`,
          title,
          subtitle: feed.title,
          avatarUrl: null,
          emoji: feed.coverEmoji ?? "🌱",
          prayedAt: prayedAt ? new Date(prayedAt).toISOString() : null,
          feedEntry: {
            entryId: m.id,
            feedId: m.prayerFeedId,
            feedSlug: feed.slug,
            feedTitle: feed.title,
            feedCoverEmoji: feed.coverEmoji,
            slot: 0,
            body: m.intercessionFullText ?? m.intercessionTopic ?? title,
            learnMoreUrl: null,
            isRecurring: false,
          },
        };
        if (prayedAt) prayed.push(entry);
        else unprayed.push(entry);
      }
    }
  }

  // Sort: prayed by recency desc; unprayed by request createdAt asc
  // (oldest first — they've been waiting longest), with intercessions
  // and feed entries naturally interleaving by their own timestamps.
  prayed.sort((a, b) => (b.prayedAt ?? "").localeCompare(a.prayedAt ?? ""));
  unprayed.sort((a, b) => {
    const ka = a.kind === "request" ? a.request.createdAt : "";
    const kb = b.kind === "request" ? b.request.createdAt : "";
    return ka.localeCompare(kb);
  });

  return { weekStartYmd, weekEndYmd, unprayed, prayed };
}
