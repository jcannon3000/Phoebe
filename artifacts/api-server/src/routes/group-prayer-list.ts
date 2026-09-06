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
import { db, groupPrayerRequestsTable, groupsTable } from "@workspace/db";
import { requireAdmin, requireCongregant } from "./groups";
import { perUserRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

/**
 * WHO GETS A PRAYER LIST AT ALL — the owner's rule, not a new one.
 *
 * Two conditions, both already enforced on the older shared prayer requests
 * (routes/prayer.ts and the PATCH /groups/:slug route), and this list is the
 * same kind of thing:
 *
 *   • `prayerRequestsEnabled` — an admin's switch. (2026-07: opt-in, "don't
 *     have list in community directly turned on inherently"; 2026-09-05: ON
 *     by default and an admin turns it OFF — see schema/groups.ts for why.)
 *   • NOT `isPublic` — owner: "no publicly listed group can have shared
 *     prayer requests." A browseable group is one anyone can walk into, and
 *     these bodies name real people's illnesses.
 *
 * Checked here rather than trusted from the older paths, because a stale-true
 * flag on a group that went public afterwards is exactly the case prayer.ts
 * documents.
 */
function listIsOpen(group: { prayerRequestsEnabled: boolean; isPublic: boolean }): boolean {
  return group.prayerRequestsEnabled && !group.isPublic;
}

/**
 * A joined congregant of a group whose list is open — the gate for both member
 * routes. `requireCongregant` rather than `requireMember`: a fresh join is a
 * full member now (owner, 2026-08-30), so this mainly protects the handful of
 * legacy rows still on the lighter "follower" tier — kept as the gate here
 * regardless, since it's the one place that answers "is this person really
 * in the parish" if that tier is ever used again.
 */
async function requireOpenList(slug: string, userId: number) {
  const membership = await requireCongregant(slug, userId);
  if (!membership) return null;
  return listIsOpen(membership.group) ? membership : null;
}
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
  const membership = await requireOpenList(String(req.params.slug ?? ""), user.id);
  if (!membership) { res.status(403).json({ error: "no_prayer_list" }); return; }

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
router.post(
  "/groups/:slug/prayer-list",
  // A moderation queue is a place someone else has to READ. Twenty a minute is
  // far above any honest use and far below burying a leader's queue under the
  // 200 rows the admin listing returns.
  perUserRateLimit("group_prayer_submit", { max: 20, windowMs: 60_000 }),
  async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const membership = await requireOpenList(String(req.params.slug ?? ""), user.id);
  if (!membership) { res.status(403).json({ error: "no_prayer_list" }); return; }

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
  },
);

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
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "bad_id" }); return; }

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
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "bad_id" }); return; }
  await db.delete(groupPrayerRequestsTable).where(and(
    eq(groupPrayerRequestsTable.id, id),
    eq(groupPrayerRequestsTable.groupId, result.group.id),
  ));
  res.json({ ok: true });
});

/**
 * GET /me/group-prayer-submissions — MY OWN pending submissions, across every
 * group I've submitted to. Owner: a "Pending prayer requests" section at the
 * bottom of the prayer-list page — the submitter's-side view of the same
 * queue the admin routes above manage.
 *
 * Scoped to the caller's own submittedByUserId — this is not a moderation
 * surface, it never lets anyone see another person's pending submission, and
 * it deliberately does not require group membership to still be current: if
 * someone left a group after submitting, their own history of having asked
 * is still theirs to see.
 */
router.get("/me/group-prayer-submissions", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }

  const askedStatus = String(req.query["status"] ?? "pending");
  const statuses: Status[] = STATUSES.includes(askedStatus as Status) ? [askedStatus as Status] : ["pending"];

  const rows = await db
    .select({
      id: groupPrayerRequestsTable.id,
      body: groupPrayerRequestsTable.body,
      status: groupPrayerRequestsTable.status,
      createdAt: groupPrayerRequestsTable.createdAt,
      groupId: groupPrayerRequestsTable.groupId,
      groupName: groupsTable.name,
      groupSlug: groupsTable.slug,
    })
    .from(groupPrayerRequestsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupPrayerRequestsTable.groupId))
    .where(and(
      eq(groupPrayerRequestsTable.submittedByUserId, user.id),
      inArray(groupPrayerRequestsTable.status, statuses),
    ))
    .orderBy(desc(groupPrayerRequestsTable.createdAt))
    .limit(100);
  res.json({ requests: rows });
});

export default router;
