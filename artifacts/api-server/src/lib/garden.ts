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

import { and, eq, inArray, sql } from "drizzle-orm";
import { db, groupMembersTable, usersTable } from "@workspace/db";
import { getCorrespondentUserIds } from "./correspondents";

export async function getGardenUserIds(userId: number): Promise<number[]> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return [];
  const viewerEmail = user.email.toLowerCase();

  const myMemberships = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(
      sql`${groupMembersTable.userId} = ${userId}
          OR LOWER(${groupMembersTable.email}) = ${viewerEmail}`,
    );
  const myGroupIds = Array.from(new Set(myMemberships.map(r => r.groupId)));

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
  console.log(
    `[garden] viewer=${userId} email=${viewerEmail} groups=[${myGroupIds.join(",")}] peerDiag=${JSON.stringify(peerDiag)}`,
  );

  const correspondentIds = await getCorrespondentUserIds(userId);
  for (const id of correspondentIds) {
    if (id !== userId) groupPeerIds.add(id);
  }

  if (myGroupIds.length > 0 && groupPeerIds.size > 0) {
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
        inArray(groupMembersTable.groupId, myGroupIds),
        eq(groupMembersTable.role, "hidden_admin"),
      ));
    for (const row of vetoRows) {
      const id = row.rowUserId ?? row.emailUserId;
      if (typeof id === "number") groupPeerIds.delete(id);
    }
  }

  return Array.from(groupPeerIds);
}
