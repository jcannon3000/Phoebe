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

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, groupMembersTable, usersTable } from "@workspace/db";

// Fellows (the 1:1 social graph) was removed. This helper is retained as a
// no-op stub returning an empty list so the remaining callers (push fan-out,
// /api/people garden union, breath/listening feeds) keep compiling and simply
// behave as "no fellows" — no fellow-derived visibility or notifications.
export async function getFellowUserIds(_userId: number): Promise<number[]> {
  return [];
}

// Short-TTL per-process cache. The computation below runs ~5 queries and is
// hit from many endpoints; a single home-screen load triggers it from several
// of them within a second or two. Caching by userId for a few seconds collapses
// that to one computation. Membership changes (join / leave / mute) take effect
// within the TTL — acceptable for prayer visibility, which isn't real-time.
const GARDEN_TTL_MS = 30_000;
const gardenCache = new Map<number, { ids: number[]; expires: number }>();

// Members of a SPECIFIC set of groups — not the viewer's whole garden.
// Backs the "select which communities to share it with" scoping: a
// prayer request targeted at particular groups fans out (visibility +
// push) only to those groups' members, not every group the requester
// belongs to. Excludes hidden_admin rows (same peer-visibility rule as
// getGardenUserIds) and the requester themselves. Deliberately skips the
// cross-group "veto" rule from getGardenUserIds — that rule protects a
// VIEWER from ever seeing someone who's a hidden_admin anywhere in the
// viewer's own groups, which doesn't translate cleanly to "who should
// this specific post reach"; the per-group hidden_admin exclusion alone
// is the right bar here.
export async function getGroupMemberUserIds(groupIds: number[], excludeUserId: number): Promise<number[]> {
  if (groupIds.length === 0) return [];
  const rows = await db
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
      inArray(groupMembersTable.groupId, groupIds),
      sql`(${groupMembersTable.role} IS NULL OR ${groupMembersTable.role} <> 'hidden_admin')`,
    ));
  const ids = new Set<number>();
  for (const row of rows) {
    const id = row.rowUserId ?? row.emailUserId;
    if (typeof id === "number" && id !== excludeUserId) ids.add(id);
  }
  return Array.from(ids);
}

// The groups a user actually belongs to (by userId OR matching invite
// email) — used to check a viewer against a specific request's
// prayer_request_groups scoping in prayer.ts's GET /prayer-requests.
export async function getUserGroupIds(userId: number): Promise<number[]> {
  const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  const viewerEmail = (user?.email ?? "").toLowerCase();
  const rows = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(sql`${groupMembersTable.userId} = ${userId} OR LOWER(${groupMembersTable.email}) = ${viewerEmail}`);
  return Array.from(new Set(rows.map(r => r.groupId)));
}

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

  // (Letters feature removed 2026-07-23 and Fellows removed 2026-07-23 —
  // the correspondents-priority + fellow expansions that used to widen the
  // garden here are gone; garden now = group peers only.)

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
