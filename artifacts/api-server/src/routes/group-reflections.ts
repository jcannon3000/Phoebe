// A group admin's weekly reflection, delivered to that group as an INBOX item.
//
// Owner: "for admin could do a weekly reflection. That would work just like
// the taize one, and it would go into the inbox of all the people in the
// group."
//
// So it behaves like the other inboxes — it waits in Next until each person
// reads it, then rests until the next one is posted — and differs in three
// ways that all follow from it being written FOR a named congregation rather
// than found on a public website:
//
//   • It is authored here, so there is a table and a compose route.
//   • It is scoped to a group, so the feed answers "the newest reflection from
//     any group I belong to", not "the newest reflection".
//   • Read state is per USER, not per device. The Taizé/Chittister/Cathedral
//     inboxes remember what they have read in localStorage, which is right for
//     a public newsletter and wrong for something a priest wrote for you:
//     read it on your phone and it must be read on your laptop.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import {
  db,
  groupPostsTable,
  groupPostReadsTable,
  groupMembersTable,
  groupsTable,
} from "@workspace/db";
import { requireAdmin } from "./groups";
import { inboundAddressFor } from "./inbound-email";

const router: IRouter = Router();

type SessionUser = { id: number; name?: string | null } | undefined;

/** The groups this person actually belongs to (joined, any role). */
async function myGroupIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.userId, userId), isNotNull(groupMembersTable.joinedAt)));
  return [...new Set(rows.map((r: { groupId: number }) => r.groupId))];
}

/**
 * GET /me/group-reflection/latest → the newest published reflection from any
 * group this person belongs to, plus whether they have read it.
 *
 * ONE item, not a list: this feeds an inbox card, and an inbox card asks a
 * single question — is there something waiting. Returns 204 when there is
 * nothing, so the client renders no card at all rather than an empty one.
 */
router.get("/me/group-reflection/latest", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const groupIds = await myGroupIds(user.id);
  if (groupIds.length === 0) { res.status(204).end(); return; }

  const [row] = await db
    .select({
      id: groupPostsTable.id,
      title: groupPostsTable.title,
      body: groupPostsTable.body,
      authorName: groupPostsTable.authorName,
      url: groupPostsTable.url,
      openExternally: groupPostsTable.openExternally,
      ctaLabel: groupPostsTable.ctaLabel,
      expiresAt: groupPostsTable.expiresAt,
      publishedAt: groupPostsTable.publishedAt,
      groupName: groupsTable.name,
      groupSlug: groupsTable.slug,
    })
    .from(groupPostsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, groupPostsTable.groupId))
    .where(and(
      inArray(groupPostsTable.groupId, groupIds),
      isNotNull(groupPostsTable.publishedAt),
      // Never hand out something scheduled for later.
      lte(groupPostsTable.publishedAt, new Date()),
      /**
       * …or something that has run out. A LINK POST lasts a week (owner: "if
       * it goes longer than a week, it disappears"); a written reflection has
       * no expiry and passes this by having expires_at null.
       *
       * Filtered in SQL rather than after the fact: this query takes the
       * NEWEST row, so an expired one filtered in JS would hide the live
       * reflection sitting behind it.
       */
      or(isNull(groupPostsTable.expiresAt), gt(groupPostsTable.expiresAt, new Date())),
    ))
    .orderBy(desc(groupPostsTable.publishedAt))
    .limit(1);

  if (!row) { res.status(204).end(); return; }

  const [read] = await db
    .select({ id: groupPostReadsTable.id })
    .from(groupPostReadsTable)
    .where(and(
      eq(groupPostReadsTable.postId, row.id),
      eq(groupPostReadsTable.userId, user.id),
    ))
    .limit(1);

  res.json({
    // The inbox keys on a string id, the same shape the other sources use.
    id: `group-${row.id}`,
    reflectionId: row.id,
    title: row.title,
    body: row.body,
    authorName: row.authorName,
    groupName: row.groupName,
    groupSlug: row.groupSlug,
    published: row.publishedAt ? row.publishedAt.toISOString().slice(0, 10) : null,
    // A url means "open their page", and the client must not put the reader
    // view over it — see the schema's note on why.
    url: row.url ?? null,
    openExternally: !!row.openExternally,
    ctaLabel: row.ctaLabel ?? null,
    read: !!read,
  });
});

/**
 * POST /me/group-reflection/:id/read — mark it read for THIS person.
 *
 * Idempotent by the table's unique index rather than by checking first: two
 * taps racing each other would both pass a check-then-insert.
 */
router.post("/me/group-reflection/:id/read", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "bad_id" }); return; }

  // Only for a reflection from a group they are actually in — otherwise a
  // guessed id would let anyone mark (and by implication read) another
  // congregation's post.
  const groupIds = await myGroupIds(user.id);
  if (groupIds.length === 0) { res.status(403).json({ error: "not_a_member" }); return; }
  const [row] = await db
    .select({ id: groupPostsTable.id })
    .from(groupPostsTable)
    .where(and(eq(groupPostsTable.id, id), inArray(groupPostsTable.groupId, groupIds)))
    .limit(1);
  if (!row) { res.status(404).json({ error: "not_found" }); return; }

  await db.insert(groupPostReadsTable)
    .values({ postId: id, userId: user.id })
    .onConflictDoNothing();
  res.json({ ok: true });
});

/**
 * GET /groups/:slug/inbound-address — the address a parish adds to its list.
 *
 * Admin only: it is a write endpoint's key, and it should not be sitting in a
 * follower's browser. Returns null when the column has not been backfilled,
 * which the admin screen renders as simply not offering the feature.
 */
router.get("/groups/:slug/inbound-address", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const slug = String(req.params.slug ?? "");
  const result = await requireAdmin(slug, user.id);
  if (!result) { res.status(403).json({ error: "not_an_admin" }); return; }
  const [row] = await db.select({ token: groupsTable.inboundToken, name: groupsTable.name })
    .from(groupsTable).where(eq(groupsTable.id, result.group.id)).limit(1);
  res.json({ name: row?.name ?? result.group.name, inboundAddress: inboundAddressFor(slug, row?.token ?? null) });
});

/** GET /groups/:slug/reflections — the group's own list, admin only. */
router.get("/groups/:slug/reflections", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const result = await requireAdmin(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "not_an_admin" }); return; }
  const rows = await db
    .select()
    .from(groupPostsTable)
    .where(eq(groupPostsTable.groupId, result.group.id))
    .orderBy(desc(groupPostsTable.createdAt))
    .limit(50);
  res.json(rows);
});

/**
 * POST /groups/:slug/reflections — write one. Admin only.
 *
 * Publishes immediately by default, because the owner described this as the
 * weekly thing an admin sits down and writes, not a scheduling tool. Passing
 * publish:false keeps it as a draft with published_at null, which the feed
 * above ignores.
 */
router.post("/groups/:slug/reflections", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const result = await requireAdmin(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "not_an_admin" }); return; }

  const title = String((req.body?.title ?? "")).trim();
  const body = String((req.body?.body ?? "")).trim();
  const rawUrl = String((req.body?.url ?? "")).trim();
  /**
   * A post is EITHER something written or a link to something. http(s) only —
   * an admin pasting a javascript: or data: URL would be handing the whole
   * group a link the app then opens.
   */
  let url: string | null = null;
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        res.status(400).json({ error: "url_must_be_http" }); return;
      }
      url = parsed.toString();
    } catch { res.status(400).json({ error: "bad_url" }); return; }
  }
  if (!title) { res.status(400).json({ error: "title_required" }); return; }
  if (!url && !body) { res.status(400).json({ error: "body_or_url_required" }); return; }
  if (title.length > 140) { res.status(400).json({ error: "title_too_long" }); return; }
  if (body.length > 20000) { res.status(400).json({ error: "body_too_long" }); return; }
  const publish = req.body?.publish !== false;
  // Only meaningful for a link — there is nothing to leave the app for on
  // something the leader wrote here.
  const openExternally = !!url && req.body?.openExternally === true;
  const ctaLabel = String(req.body?.ctaLabel ?? "").trim().slice(0, 24) || null;

  const [row] = await db.insert(groupPostsTable).values({
    groupId: result.group.id,
    authorUserId: user.id,
    authorName: result.member.name ?? user.name ?? null,
    title,
    body,
    url,
    openExternally,
    ctaLabel,
    // ONE WEEK for a link, none for a reflection (owner). Measured from
    // publication rather than creation, so a draft published later gets its
    // full week rather than a week that started while nobody could see it.
    expiresAt: url && publish ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
    publishedAt: publish ? new Date() : null,
  }).returning();

  res.status(201).json(row);
});

/** DELETE /groups/:slug/reflections/:id — admin only. */
router.delete("/groups/:slug/reflections/:id", async (req: Request, res: Response): Promise<void> => {
  const user = req.user as SessionUser;
  if (!user) { res.status(401).json({ error: "not_authenticated" }); return; }
  const result = await requireAdmin(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "not_an_admin" }); return; }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "bad_id" }); return; }
  await db.delete(groupPostsTable)
    .where(and(eq(groupPostsTable.id, id), eq(groupPostsTable.groupId, result.group.id)));
  res.json({ ok: true });
});

export default router;
