import { Router, type IRouter } from "express";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  forumPostsTable,
  forumRepliesTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────
// Group forum
// ─────────────────────────────────────────────────────────────────────────
//
// A message board scoped to a group: any joined member can post a thread
// (optional title + body) and reply (flat) on anyone's thread. The "forum
// inside groups" the El Jardín portal wants, reusable by any community.
//
// Auth model: every endpoint requires a fully-joined member of the group
// (requireMember). Deletes additionally allow a group admin to remove
// anyone's post/reply (moderation), else author-only. Read = any member.

const router: IRouter = Router();

const TITLE_MAX = 200;
const BODY_MAX = 8000;

type SessionUser = { id: number; email: string; name: string };
function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

// hidden_admin shares admin privileges — matches groups.ts convention.
function isAdminRole(role: string): boolean {
  return role === "admin" || role === "hidden_admin";
}

// Resolve a group by slug + verify (a) it's an El Jardín group and (b) the
// caller is a fully-joined member. The forum is a Jardín-only feature — it
// must NOT exist on ordinary Phoebe communities — so a non-jardin group
// resolves to null here (the handlers then 403, i.e. "no forum here").
// Returns { group, member } so callers can also inspect the role.
async function requireMember(groupSlug: string, userId: number) {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, groupSlug));
  if (!group || group.focus !== "jardin") return null;
  const [member] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.userId, userId)));
  if (!member || !member.joinedAt) return null;
  return { group, member };
}

// ── GET /groups/:slug/forum — list posts, newest first ──────────────────────
router.get("/groups/:slug/forum", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await requireMember(req.params.slug, user.id);
  if (!access) { res.status(403).json({ error: "Not a member of this group" }); return; }

  const posts = await db
    .select({
      id: forumPostsTable.id,
      title: forumPostsTable.title,
      body: forumPostsTable.body,
      createdAt: forumPostsTable.createdAt,
      authorUserId: forumPostsTable.authorUserId,
      authorName: usersTable.name,
      authorAvatarUrl: usersTable.avatarUrl,
    })
    .from(forumPostsTable)
    .leftJoin(usersTable, eq(usersTable.id, forumPostsTable.authorUserId))
    .where(eq(forumPostsTable.groupId, access.group.id))
    .orderBy(desc(forumPostsTable.createdAt));

  // Reply counts in one grouped query, then map onto the posts.
  const postIds = posts.map((p) => p.id);
  const counts = postIds.length > 0
    ? await db
        .select({ postId: forumRepliesTable.postId, n: sql<number>`count(*)::int` })
        .from(forumRepliesTable)
        .where(inArray(forumRepliesTable.postId, postIds))
        .groupBy(forumRepliesTable.postId)
    : [];
  const countByPost = new Map(counts.map((c) => [c.postId, c.n]));

  res.json({
    isAdmin: isAdminRole(access.member.role),
    posts: posts.map((p) => ({
      ...p,
      replyCount: countByPost.get(p.id) ?? 0,
      isMine: p.authorUserId === user.id,
    })),
  });
});

// ── POST /groups/:slug/forum — create a post ────────────────────────────────
const CreatePostSchema = z.object({
  title: z.string().trim().max(TITLE_MAX).optional(),
  body: z.string().trim().min(1).max(BODY_MAX),
});
router.post("/groups/:slug/forum", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await requireMember(req.params.slug, user.id);
  if (!access) { res.status(403).json({ error: "Not a member of this group" }); return; }

  const parsed = CreatePostSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", issues: parsed.error.issues }); return; }

  const [post] = await db.insert(forumPostsTable).values({
    groupId: access.group.id,
    authorUserId: user.id,
    title: parsed.data.title?.length ? parsed.data.title : null,
    body: parsed.data.body,
  }).returning();

  res.status(201).json({ post });
});

// ── GET /groups/:slug/forum/:postId — a post + its replies ──────────────────
router.get("/groups/:slug/forum/:postId", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await requireMember(req.params.slug, user.id);
  if (!access) { res.status(403).json({ error: "Not a member of this group" }); return; }

  const postId = parseInt(req.params.postId, 10);
  if (Number.isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const [post] = await db
    .select({
      id: forumPostsTable.id,
      groupId: forumPostsTable.groupId,
      title: forumPostsTable.title,
      body: forumPostsTable.body,
      createdAt: forumPostsTable.createdAt,
      authorUserId: forumPostsTable.authorUserId,
      authorName: usersTable.name,
      authorAvatarUrl: usersTable.avatarUrl,
    })
    .from(forumPostsTable)
    .leftJoin(usersTable, eq(usersTable.id, forumPostsTable.authorUserId))
    .where(eq(forumPostsTable.id, postId));
  // Scope to the group in the URL so a member of group A can't read a post
  // from group B by guessing its id.
  if (!post || post.groupId !== access.group.id) { res.status(404).json({ error: "Not found" }); return; }

  const replies = await db
    .select({
      id: forumRepliesTable.id,
      body: forumRepliesTable.body,
      createdAt: forumRepliesTable.createdAt,
      authorUserId: forumRepliesTable.authorUserId,
      authorName: usersTable.name,
      authorAvatarUrl: usersTable.avatarUrl,
    })
    .from(forumRepliesTable)
    .leftJoin(usersTable, eq(usersTable.id, forumRepliesTable.authorUserId))
    .where(eq(forumRepliesTable.postId, postId))
    .orderBy(asc(forumRepliesTable.createdAt));

  const isAdmin = isAdminRole(access.member.role);
  res.json({
    post: { ...post, isMine: post.authorUserId === user.id, canDelete: isAdmin || post.authorUserId === user.id },
    replies: replies.map((r) => ({
      ...r,
      isMine: r.authorUserId === user.id,
      canDelete: isAdmin || r.authorUserId === user.id,
    })),
  });
});

// ── POST /groups/:slug/forum/:postId/replies — reply to a post ──────────────
const CreateReplySchema = z.object({ body: z.string().trim().min(1).max(BODY_MAX) });
router.post("/groups/:slug/forum/:postId/replies", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await requireMember(req.params.slug, user.id);
  if (!access) { res.status(403).json({ error: "Not a member of this group" }); return; }

  const postId = parseInt(req.params.postId, 10);
  if (Number.isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }
  const parsed = CreateReplySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", issues: parsed.error.issues }); return; }

  // The post must exist AND belong to this group (no cross-group replies).
  const [post] = await db.select({ id: forumPostsTable.id, groupId: forumPostsTable.groupId })
    .from(forumPostsTable).where(eq(forumPostsTable.id, postId));
  if (!post || post.groupId !== access.group.id) { res.status(404).json({ error: "Not found" }); return; }

  const [reply] = await db.insert(forumRepliesTable).values({
    postId,
    authorUserId: user.id,
    body: parsed.data.body,
  }).returning();

  res.status(201).json({ reply });
});

// ── DELETE /groups/:slug/forum/:postId — author or group admin ──────────────
router.delete("/groups/:slug/forum/:postId", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await requireMember(req.params.slug, user.id);
  if (!access) { res.status(403).json({ error: "Not a member of this group" }); return; }

  const postId = parseInt(req.params.postId, 10);
  if (Number.isNaN(postId)) { res.status(400).json({ error: "Invalid post id" }); return; }

  const [post] = await db.select({ authorUserId: forumPostsTable.authorUserId, groupId: forumPostsTable.groupId })
    .from(forumPostsTable).where(eq(forumPostsTable.id, postId));
  if (!post || post.groupId !== access.group.id) { res.status(404).json({ error: "Not found" }); return; }
  if (post.authorUserId !== user.id && !isAdminRole(access.member.role)) {
    res.status(403).json({ error: "Only the author or a group admin can delete this post" });
    return;
  }
  // Replies cascade via the FK ON DELETE CASCADE.
  await db.delete(forumPostsTable).where(eq(forumPostsTable.id, postId));
  res.json({ ok: true });
});

// ── DELETE /groups/:slug/forum/replies/:replyId — author or group admin ─────
router.delete("/groups/:slug/forum/replies/:replyId", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await requireMember(req.params.slug, user.id);
  if (!access) { res.status(403).json({ error: "Not a member of this group" }); return; }

  const replyId = parseInt(req.params.replyId, 10);
  if (Number.isNaN(replyId)) { res.status(400).json({ error: "Invalid reply id" }); return; }

  // Join to the post to confirm the reply belongs to a post in THIS group.
  const [row] = await db
    .select({ authorUserId: forumRepliesTable.authorUserId, groupId: forumPostsTable.groupId })
    .from(forumRepliesTable)
    .innerJoin(forumPostsTable, eq(forumPostsTable.id, forumRepliesTable.postId))
    .where(eq(forumRepliesTable.id, replyId));
  if (!row || row.groupId !== access.group.id) { res.status(404).json({ error: "Not found" }); return; }
  if (row.authorUserId !== user.id && !isAdminRole(access.member.role)) {
    res.status(403).json({ error: "Only the author or a group admin can delete this reply" });
    return;
  }
  await db.delete(forumRepliesTable).where(eq(forumRepliesTable.id, replyId));
  res.json({ ok: true });
});

export default router;
