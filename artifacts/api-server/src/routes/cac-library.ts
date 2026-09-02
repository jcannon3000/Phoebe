// The full CAC library, granted to a pilot GROUP.
//
// Owner: "we want to create a feature where members of special pilot groups
// would be able to see the full library", and "only super admins could turn
// this on for groups."
//
// WHAT IS BEING HANDED OUT MATTERS HERE. This is not a Phoebe feature flag —
// it opens the Center for Action and Contemplation's shows to a cohort. So the
// grant is deliberately NOT something a group's own admin can make: a rector
// cannot decide their parish gets someone else's catalogue. Only a super admin
// can, which keeps the decision with whoever holds the relationship with CAC.
//
// PER-GROUP, NOT PER-USER, because the ask is about a parish or cohort being
// given access together: one row to set, one row to revoke, and nobody has to
// maintain a list of individuals. A member qualifies if ANY group they have
// joined carries the flag.
//
// The audio itself is unaffected either way — it always streams from CAC's own
// enclosure URLs (see routes/podcast.ts). This gates who can SEE the library,
// not where the bytes come from.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, groupsTable, groupMembersTable } from "@workspace/db";
import { isSuperAdminUser } from "../lib/superAdmin";

const router: IRouter = Router();

type SessionUser = { id: number } | undefined;

/**
 * GET /me/cac-library → { enabled, viaGroups }
 *
 * The one question the client asks. `viaGroups` names which groups granted it
 * so the UI can say WHY someone has access rather than it appearing by magic —
 * and so a support question ("why can they see this?") has an answer.
 *
 * A super admin always qualifies: they can already reach the library through
 * Admin Tools, and having the two disagree would mean the Learn row vanished
 * for the very people testing it.
 */
router.get("/me/cac-library", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }

  if (await isSuperAdminUser(user.id)) {
    res.json({ enabled: true, viaGroups: [], superAdmin: true });
    return;
  }

  // JOINED memberships only — a pending invite is not membership, and an
  // unclaimed invite must not hand out a catalogue.
  const rows = await db
    .select({ id: groupsTable.id, name: groupsTable.name })
    .from(groupMembersTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
    .where(and(
      eq(groupMembersTable.userId, user.id),
      isNotNull(groupMembersTable.joinedAt),
      eq(groupsTable.cacLibraryEnabled, true),
    ));

  res.json({
    enabled: rows.length > 0,
    viaGroups: rows.map((r) => r.name),
    superAdmin: false,
  });
});

/**
 * PATCH /groups/:slug/cac-library — super admin only. { enabled: boolean }
 *
 * Returns 403 for everyone else INCLUDING the group's own admins, which is the
 * point. See the header.
 */
router.patch("/groups/:slug/cac-library", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  if (!(await isSuperAdminUser(user.id))) { res.status(403).json({ error: "forbidden" }); return; }

  const slug = String(req.params["slug"] ?? "");
  if (!slug) { res.status(400).json({ error: "bad_slug" }); return; }
  if (typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ error: "enabled_required" }); return;
  }

  const [row] = await db.update(groupsTable)
    .set({ cacLibraryEnabled: req.body.enabled })
    .where(eq(groupsTable.slug, slug))
    .returning({ id: groupsTable.id, name: groupsTable.name, enabled: groupsTable.cacLibraryEnabled });

  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  res.json(row);
});

/**
 * GET /admin/cac-library — super admin only. Every group with the flag ON.
 *
 * So a super admin can see the whole grant list in one place rather than
 * having to remember which parishes they opened it for.
 */
router.get("/admin/cac-library", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  if (!(await isSuperAdminUser(user.id))) { res.status(403).json({ error: "forbidden" }); return; }

  const rows = await db
    .select({ id: groupsTable.id, slug: groupsTable.slug, name: groupsTable.name })
    .from(groupsTable)
    .where(eq(groupsTable.cacLibraryEnabled, true));
  res.json({ groups: rows });
});

export default router;

/** Exported for tests / future callers that need the same question answered
 *  server-side without going through HTTP. */
export async function userHasCacLibrary(userId: number): Promise<boolean> {
  if (await isSuperAdminUser(userId)) return true;
  const rows = await db
    .select({ id: groupsTable.id })
    .from(groupMembersTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
    .where(and(
      eq(groupMembersTable.userId, userId),
      isNotNull(groupMembersTable.joinedAt),
      eq(groupsTable.cacLibraryEnabled, true),
    ));
  return rows.length > 0;
}
