import { Router, type IRouter, type RequestHandler } from "express";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupReflectionSourcesTable,
  groupReflectionsTable,
  groupReflectionCommentsTable,
  usersTable,
  betaUsersTable,
} from "@workspace/db";
import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────
// Group Daily Reflections (beta)
// ─────────────────────────────────────────────────────────────────────────
//
// A community pins a daily-reflection source (CAC Daily Reflection or
// Forward Day by Day), members tap out to open it, then come back to
// Phoebe and write a short reflection that's shared with the
// community. Other members can comment on each reflection.
//
// This file owns every endpoint behind the feature. The "did the user
// open today's reading?" signal lives in client-side localStorage (see
// `cacReadState.ts`) — we only persist the *written* reflection on the
// server.
//
// Auth model: beta-only at the route level. Each handler additionally
// checks `requireMember` (read) or `requireAdmin` (set source). This
// keeps the feature off non-beta accounts even if a stale client tries
// to call the endpoints, while still letting every community member
// participate once their community is gated in.

const router: IRouter = Router();

type SessionUser = { id: number; email: string; name: string };

function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

// Beta gate — same shape as other beta-only feature routers in the
// codebase. We look up the user's beta-list row by email and bounce
// 403 otherwise. The middleware runs *before* the per-group membership
// check below.
const requireBeta: RequestHandler = async (req, res, next) => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [beta] = await db.select({ email: betaUsersTable.email })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (!beta) {
      res.status(403).json({ error: "Group reflections is a beta-only feature." });
      return;
    }
    next();
  } catch {
    res.status(403).json({ error: "Group reflections is a beta-only feature." });
  }
};

// hidden_admin shares admin privileges; we treat both as admin for
// permission checks. Matches the existing convention in groups.ts.
function isAdminRole(role: string): boolean {
  return role === "admin" || role === "hidden_admin";
}

// Resolve a group by slug + verify the caller is a fully-joined
// member (joinedAt non-null). Returns { group, member } so callers
// can also inspect the role without a second query.
async function requireMember(groupSlug: string, userId: number) {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, groupSlug));
  if (!group) return null;
  const [member] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.userId, userId)));
  if (!member || !member.joinedAt) return null;
  return { group, member };
}

// Supported reflection sources. Adding a third source = add to this set
// + ship a client-side URL + label. No schema change required.
const VALID_SOURCES = new Set(["cac", "fdd"]);

// ── GET /api/groups/:slug/reflection-source ──────────────────────────────
// Returns the community's pinned source (or null when the feature isn't
// enabled). Any group member may read this.
router.get("/groups/:slug/reflection-source", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const result = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this community" }); return; }
  const [row] = await db.select().from(groupReflectionSourcesTable)
    .where(eq(groupReflectionSourcesTable.groupId, result.group.id));
  res.json({
    source: row?.source ?? null,
    setByUserId: row?.setByUserId ?? null,
    updatedAt: row?.updatedAt ?? null,
    isAdmin: isAdminRole(result.member.role),
  });
});

// ── PUT /api/groups/:slug/reflection-source ──────────────────────────────
// Admin only. Body: { source: "cac" | "fdd" | null }.
// Passing `null` deletes the row (turns the feature off for the
// community). Anything else upserts.
router.put("/groups/:slug/reflection-source", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const result = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this community" }); return; }
  if (!isAdminRole(result.member.role)) {
    res.status(403).json({ error: "Only community admins can set the reflection source." });
    return;
  }

  const schema = z.object({
    source: z.union([z.enum(["cac", "fdd"]), z.null()]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid source", details: parsed.error.flatten() });
    return;
  }
  const next = parsed.data.source;

  if (next === null) {
    // "Turn off" = remove the row. Reflections + comments written under
    // the previous source are *not* deleted — they remain readable as
    // history, just no longer surfaced on a current "today" card.
    await db.delete(groupReflectionSourcesTable)
      .where(eq(groupReflectionSourcesTable.groupId, result.group.id));
    res.json({ source: null });
    return;
  }

  // Upsert. Drizzle's onConflictDoUpdate keeps this single-statement.
  const [row] = await db.insert(groupReflectionSourcesTable)
    .values({
      groupId: result.group.id,
      source: next,
      setByUserId: user.id,
    })
    .onConflictDoUpdate({
      target: groupReflectionSourcesTable.groupId,
      set: {
        source: next,
        setByUserId: user.id,
        updatedAt: new Date(),
      },
    })
    .returning();
  res.json({ source: row.source, setByUserId: row.setByUserId, updatedAt: row.updatedAt });
});

// ── GET /api/groups/:slug/reflections ────────────────────────────────────
// Today's reflections (default) or any date passed via ?date=YYYY-MM-DD.
// Each reflection comes with its author (display name + avatar) and the
// full comment thread, also expanded with author info. The "did the
// caller write one yet today?" answer is implicit in the list — the
// client checks for a row authored by user.id.
//
// We deliberately keep the query window to one date — pagination /
// archive view is a future surface. Today's anchor is the only common
// case in v1.
router.get("/groups/:slug/reflections", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const result = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this community" }); return; }

  // Default to "today" in UTC if the client didn't pass a date. The
  // client almost always passes its local YYYY-MM-DD so each user
  // sorts under the date that feels like "today" to them.
  const rawDate = typeof req.query.date === "string" ? req.query.date : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : new Date().toISOString().slice(0, 10);

  // Reflections for this group + date, newest first so a just-posted
  // one lands at the top of the thread.
  const reflections = await db.select({
    id: groupReflectionsTable.id,
    userId: groupReflectionsTable.userId,
    source: groupReflectionsTable.source,
    body: groupReflectionsTable.body,
    createdAt: groupReflectionsTable.createdAt,
    updatedAt: groupReflectionsTable.updatedAt,
    authorName: usersTable.name,
    authorEmail: usersTable.email,
    authorAvatarUrl: usersTable.avatarUrl,
  })
    .from(groupReflectionsTable)
    .innerJoin(usersTable, eq(usersTable.id, groupReflectionsTable.userId))
    .where(and(
      eq(groupReflectionsTable.groupId, result.group.id),
      eq(groupReflectionsTable.reflectionDate, date),
    ))
    .orderBy(desc(groupReflectionsTable.createdAt));

  // Comments for these reflections in one batched query — N+1 here
  // would scale terribly even at modest community sizes.
  const ids = reflections.map(r => r.id);
  const comments = ids.length === 0 ? [] : await db.select({
    id: groupReflectionCommentsTable.id,
    reflectionId: groupReflectionCommentsTable.reflectionId,
    userId: groupReflectionCommentsTable.userId,
    body: groupReflectionCommentsTable.body,
    createdAt: groupReflectionCommentsTable.createdAt,
    authorName: usersTable.name,
    authorEmail: usersTable.email,
    authorAvatarUrl: usersTable.avatarUrl,
  })
    .from(groupReflectionCommentsTable)
    .innerJoin(usersTable, eq(usersTable.id, groupReflectionCommentsTable.userId))
    .where(inArray(groupReflectionCommentsTable.reflectionId, ids));

  // Group comments by reflection id for the JSON response shape.
  const byRefl = new Map<number, typeof comments>();
  for (const c of comments) {
    const arr = byRefl.get(c.reflectionId) ?? [];
    arr.push(c);
    byRefl.set(c.reflectionId, arr);
  }

  // Member count (for the "N of M reflected today" line on the card).
  const [memberCountRow] = await db.select({ count: sql<number>`COUNT(*)::int` })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, result.group.id),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
    ));
  const memberCount = memberCountRow?.count ?? 0;

  // Current source — we return it here too so the page can render
  // without a second round trip when it lands cold.
  const [src] = await db.select().from(groupReflectionSourcesTable)
    .where(eq(groupReflectionSourcesTable.groupId, result.group.id));

  res.json({
    date,
    source: src?.source ?? null,
    memberCount,
    isAdmin: isAdminRole(result.member.role),
    reflections: reflections.map(r => ({
      id: r.id,
      userId: r.userId,
      authorName: r.authorName,
      authorEmail: r.authorEmail,
      authorAvatarUrl: r.authorAvatarUrl,
      source: r.source,
      body: r.body,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      isMine: r.userId === user.id,
      comments: (byRefl.get(r.id) ?? []).map(c => ({
        id: c.id,
        userId: c.userId,
        authorName: c.authorName,
        authorEmail: c.authorEmail,
        authorAvatarUrl: c.authorAvatarUrl,
        body: c.body,
        createdAt: c.createdAt,
        isMine: c.userId === user.id,
      })),
    })),
  });
});

// ── POST /api/groups/:slug/reflections ───────────────────────────────────
// Write today's reflection. Upserts on (group, user, date, source) so a
// user can edit their reflection until midnight rolls over — the unique
// index makes the second write update the first instead of creating a
// duplicate.
//
// Body: { date: "YYYY-MM-DD", body: string, source?: "cac" | "fdd" }.
// If `source` is omitted we pull the community's pinned source — the
// client passes it explicitly when it has it cached, otherwise the
// server is the source of truth.
router.post("/groups/:slug/reflections", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const result = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this community" }); return; }

  const schema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
    body: z.string().trim().min(1, "Reflection cannot be empty").max(2000),
    source: z.enum(["cac", "fdd"]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reflection", details: parsed.error.flatten() });
    return;
  }

  // Resolve source: prefer body, fall back to the community's pinned
  // value. If neither exists, refuse — the user shouldn't be able to
  // start writing under a community that hasn't enabled the feature.
  let source: string | undefined = parsed.data.source;
  if (!source) {
    const [src] = await db.select({ source: groupReflectionSourcesTable.source })
      .from(groupReflectionSourcesTable)
      .where(eq(groupReflectionSourcesTable.groupId, result.group.id));
    if (!src) {
      res.status(409).json({ error: "This community hasn't picked a daily reflection yet." });
      return;
    }
    source = src.source;
  }
  if (!VALID_SOURCES.has(source!)) {
    res.status(400).json({ error: "Invalid reflection source." });
    return;
  }

  const [row] = await db.insert(groupReflectionsTable)
    .values({
      groupId: result.group.id,
      userId: user.id,
      reflectionDate: parsed.data.date,
      source: source!,
      body: parsed.data.body.trim(),
    })
    .onConflictDoUpdate({
      target: [
        groupReflectionsTable.groupId,
        groupReflectionsTable.userId,
        groupReflectionsTable.reflectionDate,
        groupReflectionsTable.source,
      ],
      set: {
        body: parsed.data.body.trim(),
        updatedAt: new Date(),
      },
    })
    .returning();

  res.status(201).json({ reflection: row });
});

// ── DELETE /api/group-reflections/:id ────────────────────────────────────
// Author-only. Cascade drops every comment on the reflection — comment
// threads make no sense without the original post they're attached to.
router.delete("/group-reflections/:id", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(groupReflectionsTable).where(eq(groupReflectionsTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.userId !== user.id) {
    res.status(403).json({ error: "Only the author can delete this reflection." });
    return;
  }
  await db.delete(groupReflectionsTable).where(eq(groupReflectionsTable.id, id));
  res.json({ ok: true });
});

// ── POST /api/group-reflections/:id/comments ─────────────────────────────
// Any member of the same community may comment. The "same community"
// check resolves the reflection's group_id through a one-row join.
router.post("/group-reflections/:id/comments", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({
    body: z.string().trim().min(1, "Comment cannot be empty").max(1000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid comment", details: parsed.error.flatten() });
    return;
  }

  // Verify the reflection exists + the commenter is a member of the
  // same group. One query that joins through group_members.
  const [refl] = await db.select({
    id: groupReflectionsTable.id,
    groupId: groupReflectionsTable.groupId,
  })
    .from(groupReflectionsTable)
    .where(eq(groupReflectionsTable.id, id));
  if (!refl) { res.status(404).json({ error: "Not found" }); return; }

  const [member] = await db.select().from(groupMembersTable).where(and(
    eq(groupMembersTable.groupId, refl.groupId),
    eq(groupMembersTable.userId, user.id),
  ));
  if (!member || !member.joinedAt) {
    res.status(403).json({ error: "Not a member of this community" });
    return;
  }

  const [row] = await db.insert(groupReflectionCommentsTable)
    .values({
      reflectionId: id,
      userId: user.id,
      body: parsed.data.body.trim(),
    })
    .returning();

  // Return the new row with author info so the client can insert it
  // into the list without refetching.
  const [author] = await db.select({
    name: usersTable.name,
    email: usersTable.email,
    avatarUrl: usersTable.avatarUrl,
  }).from(usersTable).where(eq(usersTable.id, user.id));

  res.status(201).json({
    comment: {
      ...row,
      authorName: author?.name ?? "Someone",
      authorEmail: author?.email ?? "",
      authorAvatarUrl: author?.avatarUrl ?? null,
      isMine: true,
    },
  });
});

// ── DELETE /api/group-reflections/:rid/comments/:cid ─────────────────────
// Comment author only.
router.delete("/group-reflections/:rid/comments/:cid", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const cid = Number(req.params.cid);
  if (!Number.isFinite(cid)) { res.status(400).json({ error: "Invalid comment id" }); return; }
  const [row] = await db.select().from(groupReflectionCommentsTable)
    .where(eq(groupReflectionCommentsTable.id, cid));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.userId !== user.id) {
    res.status(403).json({ error: "Only the author can delete this comment." });
    return;
  }
  await db.delete(groupReflectionCommentsTable).where(eq(groupReflectionCommentsTable.id, cid));
  res.json({ ok: true });
});

export default router;
