// The parish prayer list — submitted by anyone, published by a leader.
//
// Owner: "you submit the prayer request and an admin approves it and an admin
// manages the list", and separately, asking whether that is safer than sending
// straight to the group: it is, and the reason shapes this file.
//
// The sharpest risk on a prayer list is THIRD-PARTY HEALTH INFORMATION — "pray
// for my neighbour, who has just been diagnosed with…" about someone who never
// consented. An admin reading it first is the only point where that is caught.
// So the verbs here are not just approve/decline: an admin can EDIT the body,
// because the useful action is usually neither publishing it as written nor
// refusing it, but softening it.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, groupPrayerRequestsTable, groupMembersTable, usersTable } from "@workspace/db";
import { requireAdmin, requireMember } from "./groups";

const router: IRouter = Router();
type SessionUser = { id: number; name?: string | null } | undefined;

const STATUSES = ["pending", "approved", "declined", "archived"] as const;
type Status = (typeof STATUSES)[number];

/**
 * GET /groups/:slug/prayer-list — what the congregation prays.
 *
 * MEMBERS see approved requests only. Pending ones are not "hidden" from the
 * response, they are never selected: an unreviewed request must not be one
 * client bug away from the whole group.
 */
router.get("/groups/:slug/prayer-list", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const membership = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!membership) { res.status(403).json({ error: "not_a_member" }); return; }

  const rows = await db
    .select({
      id: groupPrayerRequestsTable.id,
      body: groupPrayerRequestsTable.body,
      createdAt: groupPrayerRequestsTable.createdAt,
      sortOrder: groupPrayerRequestsTable.sortOrder,
    })
    .from(groupPrayerRequestsTable)
    .where(and(
      eq(groupPrayerRequestsTable.groupId, membership.group.id),
      eq(groupPrayerRequestsTable.status, "approved"),
    ))
    // The leader's ordering first, then newest — see sortOrder's note.
    .orderBy(asc(groupPrayerRequestsTable.sortOrder), desc(groupPrayerRequestsTable.createdAt));
  res.json(rows);
});

/**
 * POST /groups/:slug/prayer-list — submit a request.
 *
 * Any MEMBER may submit; it lands as pending and reaches nobody until a leader
 * has read it. An admin submitting through this route still goes through the
 * queue — they can approve their own in one tap, and it keeps a single path.
 */
router.post("/groups/:slug/prayer-list", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const membership = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!membership) { res.status(403).json({ error: "not_a_member" }); return; }

  const body = String(req.body?.body ?? "").trim();
  if (!body) { res.status(400).json({ error: "body_required" }); return; }
  if (body.length > 2000) { res.status(400).json({ error: "body_too_long" }); return; }

  const [row] = await db.insert(groupPrayerRequestsTable).values({
    groupId: membership.group.id,
    submittedByUserId: user.id,
    submitterName: membership.member.name ?? user.name ?? null,
    body,
    // Kept from the start, so an admin's later edit can be seen as an edit.
    originalBody: body,
    status: "pending",
  }).returning();
  res.status(201).json({ id: row?.id, status: "pending" });
});

/** GET /groups/:slug/prayer-list/all?status=pending — the leader's queue. */
router.get("/groups/:slug/prayer-list/all", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const result = await requireAdmin(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "not_an_admin" }); return; }

  const asked = String(req.query["status"] ?? "");
  const statuses: Status[] = STATUSES.includes(asked as Status)
    ? [asked as Status]
    : ["pending", "approved"];

  const rows = await db
    .select()
    .from(groupPrayerRequestsTable)
    .where(and(
      eq(groupPrayerRequestsTable.groupId, result.group.id),
      inArray(groupPrayerRequestsTable.status, statuses),
    ))
    .orderBy(asc(groupPrayerRequestsTable.sortOrder), desc(groupPrayerRequestsTable.createdAt))
    .limit(200);
  res.json(rows);
});

/**
 * PATCH /groups/:slug/prayer-list/:id — the leader's four verbs at once:
 * approve, decline, archive, reorder, and EDIT THE WORDING.
 *
 * One route rather than four, because in practice they are one action: a
 * leader reads a request, changes "my neighbour Jane, who has cancer" to "a
 * neighbour who is unwell", and approves it in the same breath.
 */
router.patch("/groups/:slug/prayer-list/:id", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const result = await requireAdmin(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "not_an_admin" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "bad_id" }); return; }

  const patch: Record<string, unknown> = {};
  if (typeof req.body?.body === "string") {
    const body = req.body.body.trim();
    if (!body) { res.status(400).json({ error: "body_required" }); return; }
    patch["body"] = body.slice(0, 2000);
  }
  if (typeof req.body?.status === "string") {
    if (!STATUSES.includes(req.body.status as Status)) {
      res.status(400).json({ error: "bad_status" }); return;
    }
    patch["status"] = req.body.status;
    patch["reviewedByUserId"] = user.id;
    patch["reviewedAt"] = new Date();
  }
  if (Number.isInteger(req.body?.sortOrder)) patch["sortOrder"] = req.body.sortOrder;
  if (Object.keys(patch).length === 0) { res.status(400).json({ error: "nothing_to_change" }); return; }

  // Scoped to the group as well as the id — an admin of one parish must not be
  // able to reach another's queue by guessing a number.
  const [row] = await db.update(groupPrayerRequestsTable)
    .set(patch)
    .where(and(
      eq(groupPrayerRequestsTable.id, id),
      eq(groupPrayerRequestsTable.groupId, result.group.id),
    ))
    .returning();
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  res.json(row);
});

/**
 * DELETE /groups/:slug/prayer-list/:id — really gone.
 *
 * Distinct from "declined", which keeps the row so the same request arriving
 * three times isn't re-reviewed from scratch. This is for a request that
 * should not be retained at all, which — given what people put in these — is a
 * verb a leader genuinely needs.
 */
router.delete("/groups/:slug/prayer-list/:id", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const result = await requireAdmin(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "not_an_admin" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "bad_id" }); return; }
  await db.delete(groupPrayerRequestsTable).where(and(
    eq(groupPrayerRequestsTable.id, id),
    eq(groupPrayerRequestsTable.groupId, result.group.id),
  ));
  res.json({ ok: true });
});

export default router;
