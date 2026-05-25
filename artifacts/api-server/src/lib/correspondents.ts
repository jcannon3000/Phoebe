import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  correspondencesTable,
  correspondenceMembersTable,
  lettersTable,
  usersTable,
  fellowsTable,
} from "@workspace/db";

// Ensure every pair of JOINED, account-linked members of a correspondence
// has a mutual Fellow link (source "letter"). "Anyone you are writing a
// letter with becomes a Fellow." Called when someone joins a correspondence
// or sends a letter. Idempotent: the fellows UNIQUE (user_id,
// fellow_user_id) constraint + onConflictDoNothing means repeat calls never
// duplicate. Members without a userId (invited-but-not-signed-up) are
// skipped until they have an account.
//
// A Fellow link is a full-app trigger (see parishGate.getUserAccessTier),
// so this is also what upgrades an offices-only writer to the full
// experience once they're corresponding with someone — exactly the intended
// "letters lead to fellowship" path.
export async function ensureCorrespondenceFellows(correspondenceId: number): Promise<void> {
  const members = await db
    .select({ userId: correspondenceMembersTable.userId })
    .from(correspondenceMembersTable)
    .where(
      and(
        eq(correspondenceMembersTable.correspondenceId, correspondenceId),
        sql`${correspondenceMembersTable.userId} IS NOT NULL`,
        sql`${correspondenceMembersTable.joinedAt} IS NOT NULL`,
      ),
    );

  const ids = Array.from(
    new Set(
      members
        .map((m) => m.userId)
        .filter((id): id is number => id != null),
    ),
  );
  if (ids.length < 2) return;

  const rows: Array<{ userId: number; fellowUserId: number; source: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      rows.push({ userId: ids[i], fellowUserId: ids[j], source: "letter" });
      rows.push({ userId: ids[j], fellowUserId: ids[i], source: "letter" });
    }
  }
  if (rows.length === 0) return;

  await db.insert(fellowsTable).values(rows).onConflictDoNothing();
}

// Returns the set of user ids the viewer has an ACTIVELY EXCHANGED letter
// correspondence with. "Exchanged" = both sides have sent ≥1 letter in the
// same active correspondence. An invitee who received a first letter but
// hasn't replied yet does NOT count — the relationship isn't mutual yet,
// so it wouldn't be fair to pin their prayers ahead of closer ties.
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

  // Step 2: filter to correspondences where *the viewer has actually sent
  // a letter*. If the viewer never wrote, no one in that correspondence
  // has exchanged with them yet.
  const viewerSends = await db
    .select({ correspondenceId: lettersTable.correspondenceId })
    .from(lettersTable)
    .where(
      and(
        inArray(lettersTable.correspondenceId, correspondenceIds),
        sql`LOWER(${lettersTable.authorEmail}) = ${viewerEmail}`,
      ),
    );
  const viewerSentCorrIds = new Set(viewerSends.map(r => r.correspondenceId));
  const exchangedCorrIds = correspondenceIds.filter(id => viewerSentCorrIds.has(id));
  if (exchangedCorrIds.length === 0) return [];

  // Step 3: for each exchanged correspondence, collect counterparty emails
  // that have ALSO sent ≥1 letter in the same correspondence. Group by
  // (correspondence_id, author_email) — other authors in those ids who
  // aren't the viewer are the mutual exchangers.
  const counterpartyLetters = await db
    .select({
      correspondenceId: lettersTable.correspondenceId,
      authorEmail: lettersTable.authorEmail,
    })
    .from(lettersTable)
    .where(
      and(
        inArray(lettersTable.correspondenceId, exchangedCorrIds),
        sql`LOWER(${lettersTable.authorEmail}) <> ${viewerEmail}`,
      ),
    );

  const exchangedEmails = new Set<string>();
  for (const row of counterpartyLetters) {
    if (row.authorEmail) exchangedEmails.add(row.authorEmail.toLowerCase());
  }
  if (exchangedEmails.size === 0) return [];

  // Step 4: resolve those emails to user ids. Email is authoritative on
  // letters.author_email (it's set when the letter is sent), so we don't
  // need a separate member-table pass.
  const resolved = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      sql`LOWER(${usersTable.email}) IN (${sql.join(
        Array.from(exchangedEmails).map(e => sql`${e}`),
        sql`, `,
      )})`,
    );

  const ids = new Set<number>();
  for (const u of resolved) {
    if (u.id !== userId) ids.add(u.id);
  }
  return Array.from(ids);
}
