// The "garden" — the set of user IDs whose prayer requests are visible
// to the viewer. Pulled out of routes/prayer.ts so other subsystems
// (bell/push notification counts, for instance) can compute the same
// visibility without going through the HTTP layer.
//
// Membership rules (see prayer.ts history for how they evolved):
//
//   1. Anyone in a group the viewer is a joined member of, EXCEPT
//      users who are hidden_admin in that specific group.
//   2. Letter correspondents (mutual exchange) get added.
//   3. A global veto: if the viewer belongs to ANY group where
//      candidate X is a hidden_admin, X is dropped even if rules 1/2
//      would have included them via some other path.
//   4. The viewer's own hidden_admin memberships do NOT contribute
//      peers — being a hidden admin in a community is purely a
//      management role and confers no content visibility into that
//      community. Mirror of the existing rule that group members
//      can't see hidden_admins.

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, groupMembersTable, usersTable, fellowsTable } from "@workspace/db";
import { getCorrespondentUserIds } from "./correspondents";

// Helper — returns the user IDs of the viewer's Fellows. A Fellow pair is
// MEANT to be stored as two directional rows (A→B, B→A), but legacy/early
// accounts can have a one-sided row (only ever created forward, never
// backfilled). Reading BOTH directions (user_id = me OR fellow_user_id = me)
// makes a one-sided bond still grant visibility either way — this is the fix
// for "I'm fellows with an early account but get no notifications from them".
// Exported so other surfaces (push fan-out, /api/people garden union) reuse it.
export async function getFellowUserIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ a: fellowsTable.userId, b: fellowsTable.fellowUserId })
    .from(fellowsTable)
    .where(or(eq(fellowsTable.userId, userId), eq(fellowsTable.fellowUserId, userId)));
  const ids = new Set<number>();
  for (const r of rows) {
    if (r.a !== userId) ids.add(r.a);
    if (r.b !== userId) ids.add(r.b);
  }
  return [...ids];
}

// Short-TTL per-process cache. The computation below runs ~5 queries and is
// hit from many endpoints; a single home-screen load triggers it from several
// of them within a second or two. Caching by userId for a few seconds collapses
// that to one computation. Membership changes (join / leave / mute) take effect
// within the TTL — acceptable for prayer visibility, which isn't real-time.
const GARDEN_TTL_MS = 30_000;
const gardenCache = new Map<number, { ids: number[]; expires: number }>();

export async function getGardenUserIds(userId: number): Promise<number[]> {
  const now = Date.now();
  const hit = gardenCache.get(userId);
  if (hit && hit.expires > now) return hit.ids;
  const ids = await computeGardenUserIds(userId);
  gardenCache.set(userId, { ids, expires: now + GARDEN_TTL_MS });
  if (gardenCache.size > 5000) gardenCache.clear(); // crude bound; entries are short-lived
  return ids;
}

async function computeGardenUserIds(userId: number): Promise<number[]> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return [];
  const viewerEmail = (user.email ?? "").toLowerCase();

  // Viewer's memberships, with role.
  //   `myGroupIds` — groups where the viewer is a regular member or
  //     non-hidden admin. Used for rule 1 (peer-set source). Hidden-
  //     admin groups are dropped here so their content stays out of
  //     the viewer's feed.
  //   `vetoLookupGroupIds` — every group the viewer belongs to,
  //     INCLUDING hidden-admin ones. Used for rule 3 (veto): a peer
  //     who's hidden_admin in any group the viewer belongs to gets
  //     dropped even if some other path would have added them.
  const myMemberships = await db
    .select({ groupId: groupMembersTable.groupId, role: groupMembersTable.role })
    .from(groupMembersTable)
    .where(
      sql`${groupMembersTable.userId} = ${userId}
          OR LOWER(${groupMembersTable.email}) = ${viewerEmail}`,
    );
  const myGroupIds = Array.from(new Set(
    myMemberships
      .filter(r => r.role !== "hidden_admin")
      .map(r => r.groupId),
  ));
  const vetoLookupGroupIds = Array.from(new Set(myMemberships.map(r => r.groupId)));

  const groupPeerIds = new Set<number>();
  // Per-group peer breakdown for diagnostics — when a user reports an
  // empty garden we want to know whether they appear to be in zero
  // groups, in groups with no other members, in groups whose other
  // members have no Phoebe account yet, or in groups that get fully
  // veto-filtered. Aggregate the raw row counts so we can tell which.
  const peerDiag: Array<{
    groupId: number;
    rows: number;
    rowsWithUserId: number;
    rowsWithEmailMatch: number;
    rowsResolved: number;
  }> = [];
  if (myGroupIds.length > 0) {
    const peerRows = await db
      .select({
        groupId: groupMembersTable.groupId,
        rowUserId: groupMembersTable.userId,
        rowEmail: groupMembersTable.email,
        rowRole: groupMembersTable.role,
        emailUserId: usersTable.id,
      })
      .from(groupMembersTable)
      .leftJoin(
        usersTable,
        sql`LOWER(${usersTable.email}) = LOWER(${groupMembersTable.email})`,
      )
      .where(and(
        inArray(groupMembersTable.groupId, myGroupIds),
        sql`(${groupMembersTable.role} IS NULL
             OR ${groupMembersTable.role} <> 'hidden_admin')`,
      ));
    const byGroup = new Map<number, typeof peerRows>();
    for (const row of peerRows) {
      const list = byGroup.get(row.groupId) ?? [];
      list.push(row);
      byGroup.set(row.groupId, list);
    }
    for (const gid of myGroupIds) {
      const rows = byGroup.get(gid) ?? [];
      let withUserId = 0, withEmailMatch = 0, resolved = 0;
      for (const row of rows) {
        if (typeof row.rowUserId === "number") withUserId++;
        if (typeof row.emailUserId === "number") withEmailMatch++;
        const id = row.rowUserId ?? row.emailUserId;
        if (typeof id === "number" && id !== userId) resolved++;
      }
      peerDiag.push({ groupId: gid, rows: rows.length, rowsWithUserId: withUserId, rowsWithEmailMatch: withEmailMatch, rowsResolved: resolved });
    }
    for (const row of peerRows) {
      const id = row.rowUserId ?? row.emailUserId;
      if (typeof id === "number" && id !== userId) groupPeerIds.add(id);
    }
  }
  // Privacy audit #5 — log the numeric userId only, never the email.
  // This line fires on every garden computation (i.e. most authenticated
  // reads); shipping the viewer's email into logs is a needless PII /
  // social-graph exposure if logs are retained or forwarded. userId is
  // enough to debug with.
  console.log(
    `[garden] viewer=${userId} groups=[${myGroupIds.join(",")}] peerDiag=${JSON.stringify(peerDiag)}`,
  );

  const correspondentIds = await getCorrespondentUserIds(userId);
  for (const id of correspondentIds) {
    if (id !== userId) groupPeerIds.add(id);
  }

  // Fellows — durable person-to-person link created when someone
  // signs up via a /p/:token share-link Amen. Fellows see each
  // other's future prayer requests without needing to share a
  // community, which is the whole point of the share-link primitive.
  // Hidden-admin veto below still applies (rule 3): a Fellow who is
  // hidden_admin in any of the viewer's groups gets dropped, same
  // as a community peer would. This guards the rare case where two
  // people are both Fellows AND share a community where one is
  // hidden — the hidden-admin contract beats the Fellow grant.
  const fellowIds = await getFellowUserIds(userId);
  for (const id of fellowIds) {
    if (id !== userId) groupPeerIds.add(id);
  }
  void isNull; // reserved for future "ignore soft-removed fellows" check

  if (vetoLookupGroupIds.length > 0 && groupPeerIds.size > 0) {
    const vetoRows = await db
      .select({
        rowUserId: groupMembersTable.userId,
        emailUserId: usersTable.id,
      })
      .from(groupMembersTable)
      .leftJoin(
        usersTable,
        sql`LOWER(${usersTable.email}) = LOWER(${groupMembersTable.email})`,
      )
      .where(and(
        inArray(groupMembersTable.groupId, vetoLookupGroupIds),
        eq(groupMembersTable.role, "hidden_admin"),
      ));
    for (const row of vetoRows) {
      const id = row.rowUserId ?? row.emailUserId;
      if (typeof id === "number") groupPeerIds.delete(id);
    }
  }

  return Array.from(groupPeerIds);
}
