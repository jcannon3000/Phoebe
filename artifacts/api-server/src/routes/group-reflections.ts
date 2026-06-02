import { Router, type IRouter, type RequestHandler } from "express";
import { eq, and, desc, inArray, gte, sql } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupReflectionSourcesTable,
  groupReflectionsTable,
  groupReflectionCommentsTable,
  prayerSessionsTable,
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
//
// "sunday" is the weekly Sunday-service reflection (see the "Sunday
// Service Reflections" block at the bottom of this file). It shares
// the `group_reflections` table with the daily flow but with a
// reflection_date pinned to the most recent Sunday — so a member's
// reflection sorts under the same week-anchor for the whole week.
const VALID_SOURCES = new Set(["cac", "fdd", "sunday"]);

// Compute the most recent Sunday (inclusive — if today is Sunday, return
// today) as YYYY-MM-DD in UTC. The Sunday-service reflection feature
// pins each week's reflections to this anchor so a member who writes
// Monday evening still files under Sunday's date.
function currentSundayISO(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

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

// ── GET /api/groups/:slug/contemplation-today ────────────────────────────
// Shared-goal progress for a contemplation community. Aggregates every
// joined member's contemplation minutes for the caller's local "today"
// (passed as ?todaySince=ISO; falls back to UTC midnight — same convention
// as /api/me/contemplation-stats) so the home tab can render the
// community's collective progress toward today's shared goal:
//   • totalSeconds — everyone's contemplation seconds today, summed
//   • metCount / memberCount — how many joined members hit the goal
//   • mySeconds — the caller's own seconds, for the "you've sat N of M" CTA
// Any joined member may read.
router.get("/groups/:slug/contemplation-today", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const result = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this community" }); return; }

  const todaySinceParam = typeof req.query.todaySince === "string" ? new Date(req.query.todaySince) : null;
  const todaySince = todaySinceParam && !Number.isNaN(todaySinceParam.getTime())
    ? todaySinceParam
    : new Date(new Date().setUTCHours(0, 0, 0, 0));

  const goalMinutes = result.group.contemplationGoalMinutes ?? 20;
  const goalSeconds = goalMinutes * 60;

  // Joined members (userId non-null + joinedAt set). Email-only invites
  // with no linked account can't contemplate, so they don't count toward
  // the denominator.
  const members = await db.select({ userId: groupMembersTable.userId })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, result.group.id),
      sql`${groupMembersTable.userId} IS NOT NULL`,
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
    ));
  const memberIds = members.map(m => m.userId).filter((id): id is number => id != null);
  const memberCount = memberIds.length;

  if (memberCount === 0) {
    res.json({ goalMinutes, totalSeconds: 0, memberCount: 0, metCount: 0, mySeconds: 0 });
    return;
  }

  // Per-member contemplation seconds today in one grouped query — avoids
  // an N+1 across the membership list.
  const perMember = await db.select({
    userId: prayerSessionsTable.userId,
    seconds: sql<number>`COALESCE(SUM(${prayerSessionsTable.durationSeconds}), 0)::int`,
  })
    .from(prayerSessionsTable)
    .where(and(
      inArray(prayerSessionsTable.userId, memberIds),
      eq(prayerSessionsTable.surface, "contemplation"),
      gte(prayerSessionsTable.endedAt, todaySince),
    ))
    .groupBy(prayerSessionsTable.userId);

  let totalSeconds = 0;
  let metCount = 0;
  let mySeconds = 0;
  for (const row of perMember) {
    totalSeconds += row.seconds;
    if (row.seconds >= goalSeconds) metCount += 1;
    if (row.userId === user.id) mySeconds = row.seconds;
  }

  res.json({ goalMinutes, totalSeconds, memberCount, metCount, mySeconds });
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

// ─────────────────────────────────────────────────────────────────────────
// Sunday Service Reflections (beta)
// ─────────────────────────────────────────────────────────────────────────
//
// Different cadence than the daily reflection — once per week, anchored
// to the most recent Sunday's service. Sunday evening a push goes out
// to every joined member of an opted-in community inviting them to
// write a short reflection. The composer stays open the whole week.
//
// Storage piggybacks on `group_reflections` via `source = 'sunday'`,
// with `reflection_date` set to the Sunday ISO string. The same
// uniqueness constraint (group_id, user_id, reflection_date, source)
// gives us upsert semantics so a member who writes Monday and edits
// Wednesday lands on the same row.
//
// Settings flag lives on `groups.sunday_reflections_enabled`. The
// bell scanner (lib/bellSender.ts → runSundayReflectionPushSender)
// reads this column to decide who to push on Sunday evenings.

// ── GET /api/groups/:slug/sunday-reflection ──────────────────────────────
// Returns the current week's reflections (all members) + the
// enabled/admin status the page needs to render its three states
// (off / off-as-admin / on). Any joined member may read.
router.get("/groups/:slug/sunday-reflection", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const result = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this community" }); return; }

  const sunday = currentSundayISO();
  const enabled = !!result.group.sundayReflectionsEnabled;

  // Reflections for this group + Sunday + source='sunday'. Newest first
  // so a just-posted reflection lands at the top.
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
      eq(groupReflectionsTable.reflectionDate, sunday),
      eq(groupReflectionsTable.source, "sunday"),
    ))
    .orderBy(desc(groupReflectionsTable.createdAt));

  // Batch comments query — same N+1 avoidance pattern as the daily route.
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

  const byRefl = new Map<number, typeof comments>();
  for (const c of comments) {
    const arr = byRefl.get(c.reflectionId) ?? [];
    arr.push(c);
    byRefl.set(c.reflectionId, arr);
  }

  const [memberCountRow] = await db.select({ count: sql<number>`COUNT(*)::int` })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, result.group.id),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
    ));
  const memberCount = memberCountRow?.count ?? 0;

  res.json({
    enabled,
    sunday,
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

// ── PUT /api/groups/:slug/sunday-reflection/enabled ──────────────────────
// Admin-only toggle. Body: { enabled: boolean }. Flipping off does NOT
// delete past Sunday reflections — they remain readable as history if
// the admin flips back on later.
router.put("/groups/:slug/sunday-reflection/enabled", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const result = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this community" }); return; }
  if (!isAdminRole(result.member.role)) {
    res.status(403).json({ error: "Only community admins can enable Sunday reflections." });
    return;
  }
  const schema = z.object({ enabled: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }
  await db.update(groupsTable)
    .set({ sundayReflectionsEnabled: parsed.data.enabled })
    .where(eq(groupsTable.id, result.group.id));
  res.json({ enabled: parsed.data.enabled });
});

// ── POST /api/groups/:slug/sunday-reflection ─────────────────────────────
// Write / update this member's reflection for the current Sunday.
// Server pins reflection_date to currentSundayISO() — clients don't get
// to override that, so a member who writes from a timezone where it's
// already Monday still files under Sunday's ISO.
router.post("/groups/:slug/sunday-reflection", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const result = await requireMember(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this community" }); return; }
  if (!result.group.sundayReflectionsEnabled) {
    res.status(409).json({ error: "Sunday reflections aren't enabled for this community." });
    return;
  }

  const schema = z.object({
    body: z.string().trim().min(1, "Reflection cannot be empty").max(2000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reflection", details: parsed.error.flatten() });
    return;
  }

  const sunday = currentSundayISO();
  const [row] = await db.insert(groupReflectionsTable)
    .values({
      groupId: result.group.id,
      userId: user.id,
      reflectionDate: sunday,
      source: "sunday",
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

export default router;
