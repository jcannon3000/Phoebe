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
          // A pastoral concern submitted privately to clergy (parish_feed_id set)
          // and a request directed to a single fellow (directOnly) must NEVER
          // fan out to group peers — the same two predicates every other wall
          // surface applies. Their omission here leaked illness/grief/marital
          // concerns to peers who were never authorized to see them.
          isNull(prayerRequestsTable.parishFeedId),
          eq(prayerRequestsTable.directOnly, false),
          or(
            isNull(prayerRequestsTable.expiresAt),
            sql`${prayerRequestsTable.expiresAt} > NOW()`,
          )!,
        ))
        .orderBy(desc(prayerRequestsTable.createdAt));
      // Collapse to one per owner (most recent).
      const byOwner = new Map<number, typeof requestRows[number]>();
      for (const r of requestRows) {
        if (!byOwner.has(r.ownerId)) byOwner.set(r.ownerId, r);
      }
      const ownerIds = Array.from(byOwner.keys());
      if (ownerIds.length > 0) {
        const peers = await db
          .select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(inArray(usersTable.id, ownerIds));
        const peerById = new Map(peers.map(p => [p.id, p]));
        const requestIds = ownerIds.map(oid => byOwner.get(oid)!.id);
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
        for (const ownerId of ownerIds) {
          const req = byOwner.get(ownerId)!;
          const peer = peerById.get(ownerId);
          const prayedAt = prayedRequestIds.get(req.id) ?? null;
          const entry: ParishWeeklyEntry = {
            kind: "request",
            id: `request-${req.id}`,
            title: peer?.name ?? "Someone",
            subtitle: req.body.length > 120 ? `${req.body.slice(0, 117)}…` : req.body,
            avatarUrl: peer?.avatarUrl ?? null,
            emoji: null,
            prayedAt: prayedAt ? new Date(prayedAt).toISOString() : null,
            userId: ownerId,
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

  // NOTE: feed intercessions are NOT queried separately here. A feed
  // intercession is a shared_moment (template_type = intercession) and
  // the viewer holds a moment_user_tokens row for it once subscribed,
  // so section 2 above already picks it up as a `kind: "intercession"`
  // entry — with the same momentToken-backed Amen path as every other
  // intercession. A dedicated feed branch only duplicated those rows
  // (and lacked a working Amen handler).

  // Sort: prayed by recency desc; unprayed by request createdAt asc
  // (oldest first — they've been waiting longest).
  prayed.sort((a, b) => (b.prayedAt ?? "").localeCompare(a.prayedAt ?? ""));
  unprayed.sort((a, b) => {
    const ka = a.kind === "request" ? a.request.createdAt : "";
    const kb = b.kind === "request" ? b.request.createdAt : "";
    return ka.localeCompare(kb);
  });

  return { weekStartYmd, weekEndYmd, unprayed, prayed };
}
