import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  correspondencesTable,
  correspondenceMembersTable,
  usersTable,
} from "@workspace/db";

// Returns the set of user ids the viewer shares an active letter
// correspondence with. "Active" = correspondences.is_active = true and the
// viewer is a member of the correspondence (by userId OR by a
// case-insensitive email match against users.email, since invited members
// can exist before they've linked a user account).
//
// This replaced the fellows-pin relationship as the prayer-feed
// prioritization signal: correspondents surface first in the prayer list.
export async function getCorrespondentUserIds(userId: number): Promise<number[]> {
  const [viewer] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!viewer) return [];
  const viewerEmail = viewer.email.toLowerCase();

  // Step 1: find correspondences the viewer is a member of (active only).
  // Match by userId or by case-insensitive email.
  const myMemberships = await db
    .select({ correspondenceId: correspondenceMembersTable.correspondenceId })
    .from(correspondenceMembersTable)
    .innerJoin(
      correspondencesTable,
      and(
        eq(correspondencesTable.id, correspondenceMembersTable.correspondenceId),
        eq(correspondencesTable.isActive, true),
      ),
    )
    .where(
      sql`(${correspondenceMembersTable.userId} = ${userId} OR LOWER(${correspondenceMembersTable.email}) = ${viewerEmail})`,
    );

  const correspondenceIds = Array.from(
    new Set(myMemberships.map(m => m.correspondenceId)),
  );
  if (correspondenceIds.length === 0) return [];

  // Step 2: gather all OTHER members of those correspondences. Prefer
  // member.userId; fall back to resolving by LOWER(email) against users.email.
  const otherMembers = await db
    .select({
      memberUserId: correspondenceMembersTable.userId,
      memberEmail: correspondenceMembersTable.email,
    })
    .from(correspondenceMembersTable)
    .where(inArray(correspondenceMembersTable.correspondenceId, correspondenceIds));

  const directIds = new Set<number>();
  const emailsToResolve = new Set<string>();

  for (const m of otherMembers) {
    if (m.memberUserId && m.memberUserId !== userId) {
      directIds.add(m.memberUserId);
      continue;
    }
    if (!m.memberUserId && m.memberEmail) {
      const email = m.memberEmail.toLowerCase();
      if (email !== viewerEmail) emailsToResolve.add(email);
    }
  }

  if (emailsToResolve.size > 0) {
    const resolved = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(
        sql`LOWER(${usersTable.email}) IN (${sql.join(
          Array.from(emailsToResolve).map(e => sql`${e}`),
          sql`, `,
        )})`,
      );
    for (const u of resolved) {
      if (u.id !== userId) directIds.add(u.id);
    }
  }

  return Array.from(directIds);
}
