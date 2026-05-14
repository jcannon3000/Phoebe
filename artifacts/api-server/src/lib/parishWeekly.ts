// Parish Weekly Prayer List — the beta experiment.
//
// Old model: the unit of engagement is the amen tap. Home card shows
// "X new prayers", slideshow weaves many sources, owner sees raw count.
// Rewards frequency.
//
// New model: the unit is the PERSON in your parish group. Once per
// week, the goal is to pray for everyone in your parish group who has
// an active prayer request. The list shrinks as you go; refills when
// the week boundary crosses or someone new shares a request.
//
// Week boundary: global Sunday → Saturday in the user's local
// timezone. Picked over rolling-7-days because:
//   - Lines up with how a parish actually thinks about a week
//     (Sunday is the natural reset post-service).
//   - Creates a shared cadence — every member sees the same "this
//     week" boundary, so admins can talk about it.
//   - Rolling would create a "Sara vanishes for 7 days from my list
//     after I pray for her" effect that's hard to communicate.
//
// One amen this week = "I've prayed for this person." Multiple amens
// on the same request collapse — we're counting people, not taps.

import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  groupsTable,
  groupMembersTable,
  prayerRequestsTable,
  prayerRequestAmensTable,
} from "@workspace/db";

export interface ParishWeeklyEntry {
  userId: number;
  name: string | null;
  avatarUrl: string | null;
  request: {
    id: number;
    body: string;
    isAnonymous: boolean;
    kind: string | null;
    expiresAt: string | null;
    createdAt: string;
  };
  prayedAt: string | null;
}

export interface ParishWeeklyResult {
  weekStartYmd: string;
  weekEndYmd: string;
  unprayed: ParishWeeklyEntry[];
  prayed: ParishWeeklyEntry[];
}

/**
 * Return the Sunday-start YYYY-MM-DD for "this week" in the given tz.
 * Sunday is index 0 in JS getDay(); we don't need to special-case.
 */
function sundayStartYmd(tz: string, now: Date = new Date()): string {
  // Render the local Y-M-D + day-of-week in the user's tz, then walk
  // back to the most recent Sunday.
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
  // Walk back dayIdx days using UTC math on the local Y-M-D parts.
  const t = Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
  const start = new Date(t - dayIdx * 86_400_000);
  const sy = start.getUTCFullYear();
  const sm = String(start.getUTCMonth() + 1).padStart(2, "0");
  const sd = String(start.getUTCDate()).padStart(2, "0");
  return `${sy}-${sm}-${sd}`;
}

/**
 * Convert a YYYY-MM-DD in a timezone to the UTC Date representing
 * 00:00 local-tz on that day. Used to bound the "this week" amen
 * lookup so we count from Sunday-midnight in the user's local clock.
 */
function localYmdToUtcDate(ymd: string, tz: string): Date {
  // Compute the offset by formatting an arbitrary UTC date in tz and
  // measuring the difference. For the small ranges we care about, we
  // can use Intl on the candidate UTC midnight and adjust if it
  // landed on the wrong local day.
  const [y, m, d] = ymd.split("-").map(Number);
  // Start with naive UTC midnight on that day.
  let candidate = new Date(Date.UTC(y!, m! - 1, d!));
  // Check what local-tz day this UTC instant is in. Shift forward or
  // back in 30-minute steps up to 24h until the local day matches.
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  for (let i = 0; i < 48; i++) {
    if (fmt.format(candidate) === ymd) {
      // We want local 00:00; step back further until the previous
      // half-hour would flip to the prior day.
      while (fmt.format(new Date(candidate.getTime() - 30 * 60_000)) === ymd) {
        candidate = new Date(candidate.getTime() - 30 * 60_000);
      }
      return candidate;
    }
    candidate = new Date(candidate.getTime() + 30 * 60_000);
  }
  // Fallback to UTC midnight if tz math gets weird.
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/**
 * Compute the user's parish-weekly prayer list. "Parish" here is the
 * union of every group the viewer belongs to (joined only) — group
 * is the closest match for the conceptual parish since Phoebe doesn't
 * have a separate parish-group flag.
 *
 * Excludes:
 *   - the viewer themselves (you don't pray for your own request)
 *   - members not in any shared group with viewer
 *   - hidden_admin role rows (observers, not members)
 *   - anonymous requests (the point is the person; anonymity
 *     defeats that)
 *   - answered / closed / expired requests
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
  const weekStartYmd = sundayStartYmd(tz);
  const weekStartDate = localYmdToUtcDate(weekStartYmd, tz);
  // Week end YYYY-MM-DD = Sunday + 6 (i.e. Saturday). Computed for the
  // client to display the range; not used in the amen query (we use
  // weekStartDate as a >= bound and ignore the upper bound since
  // amens can't fire from the future).
  const [wsY, wsM, wsD] = weekStartYmd.split("-").map(Number);
  const weekEnd = new Date(Date.UTC(wsY!, wsM! - 1, wsD! + 6));
  const weekEndYmd = `${weekEnd.getUTCFullYear()}-${String(weekEnd.getUTCMonth() + 1).padStart(2, "0")}-${String(weekEnd.getUTCDate()).padStart(2, "0")}`;

  // Groups the viewer is in (joined only).
  const myGroups = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.userId, userId),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
    ));
  const groupIds = [...new Set(myGroups.map(r => r.groupId))];
  if (groupIds.length === 0) {
    return { weekStartYmd, weekEndYmd, unprayed: [], prayed: [] };
  }

  // Every joined member of every group the viewer shares — minus the
  // viewer themselves and minus hidden admins. A user in two groups
  // with the viewer is still a single row here.
  const groupPeerRows = await db
    .select({
      userId: groupMembersTable.userId,
    })
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
  if (peerUserIds.length === 0) {
    return { weekStartYmd, weekEndYmd, unprayed: [], prayed: [] };
  }

  // Active prayer requests owned by those peers. "Active" mirrors the
  // GET /api/prayer-requests rules: not answered, not closed, not
  // expired, not anonymous.
  const now = new Date();
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
  if (requestRows.length === 0) {
    return { weekStartYmd, weekEndYmd, unprayed: [], prayed: [] };
  }

  // Collapse to most-recent request per owner — the list is keyed by
  // person, so if Sara has two active requests we surface the most
  // recent (which she'd most likely want carried right now).
  const byOwner = new Map<number, typeof requestRows[number]>();
  for (const r of requestRows) {
    if (!byOwner.has(r.ownerId)) byOwner.set(r.ownerId, r);
  }
  const ownerIds = Array.from(byOwner.keys());

  // Names + avatars in one round trip.
  const peers = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, ownerIds));
  const peerById = new Map(peers.map(p => [p.id, p]));

  // Amens the viewer made THIS WEEK on those requests. Multiple amens
  // on the same request collapse — the slice is keyed by ownerId, so
  // praying for Sara's request twice is still one entry in `prayed`.
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

  const unprayed: ParishWeeklyEntry[] = [];
  const prayed: ParishWeeklyEntry[] = [];

  for (const ownerId of ownerIds) {
    const req = byOwner.get(ownerId)!;
    const peer = peerById.get(ownerId);
    const prayedAt = prayedRequestIds.get(req.id) ?? null;
    const entry: ParishWeeklyEntry = {
      userId: ownerId,
      name: peer?.name ?? null,
      avatarUrl: peer?.avatarUrl ?? null,
      request: {
        id: req.id,
        body: req.body,
        isAnonymous: req.isAnonymous,
        kind: req.kind,
        expiresAt: req.expiresAt ? new Date(req.expiresAt).toISOString() : null,
        createdAt: new Date(req.createdAt).toISOString(),
      },
      prayedAt: prayedAt ? new Date(prayedAt).toISOString() : null,
    };
    if (prayedAt) prayed.push(entry);
    else unprayed.push(entry);
  }

  // Sort prayed by recency (most recent first); unprayed by request
  // age (oldest first — they've been waiting longest).
  prayed.sort((a, b) => (b.prayedAt ?? "").localeCompare(a.prayedAt ?? ""));
  unprayed.sort((a, b) => a.request.createdAt.localeCompare(b.request.createdAt));

  return { weekStartYmd, weekEndYmd, unprayed, prayed };
}
