import { Router, type IRouter } from "express";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupAnnouncementsTable,
  betaUsersTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod/v4";
import crypto from "crypto";

const router: IRouter = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "group";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  const existing = await db.select({ id: groupsTable.id }).from(groupsTable).where(eq(groupsTable.slug, slug));
  if (existing.length === 0) return slug;
  slug = `${slug}-${crypto.randomBytes(3).toString("hex")}`;
  return slug;
}

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

type SessionUser = { id: number; email: string; name: string };

function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

async function requireMember(groupSlug: string, userId: number) {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, groupSlug));
  if (!group) return null;
  const [member] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.userId, userId)));
  if (!member || !member.joinedAt) return null;
  return { group, member };
}

async function requireAdmin(groupSlug: string, userId: number) {
  const result = await requireMember(groupSlug, userId);
  if (!result || result.member.role !== "admin") return null;
  return result;
}

// ─── Group CRUD ─────────────────────────────────────────────────────────────

// POST /api/groups — create a group
router.post("/groups", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }

    const slug = await uniqueSlug(parsed.data.name);

    const [group] = await db.insert(groupsTable).values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      slug,
      createdByUserId: user.id,
    }).returning();

    // Creator becomes admin member
    await db.insert(groupMembersTable).values({
      groupId: group.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      role: "admin",
      inviteToken: generateToken(),
      joinedAt: new Date(),
    });

    res.json({ group });
  } catch (err) {
    console.error("POST /api/groups error:", err);
    res.status(500).json({ error: "Tables not ready — run schema push" });
  }
});

// GET /api/groups — list groups I belong to
router.get("/groups", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const memberships = await db.select()
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, user.id));

    const joined = memberships.filter(m => m.joinedAt !== null);
    if (joined.length === 0) { res.json({ groups: [] }); return; }

    const groupIds = joined.map(m => m.groupId);
    const groups = await db.select().from(groupsTable).where(inArray(groupsTable.id, groupIds));

    const enriched = await Promise.all(groups.map(async (g) => {
      const joinedMembers = (await db.select().from(groupMembersTable)
        .where(eq(groupMembersTable.groupId, g.id))).filter(m => m.joinedAt !== null);
      const myRole = joined.find(m => m.groupId === g.id)?.role ?? "member";
      return { ...g, memberCount: joinedMembers.length, myRole };
    }));

    res.json({ groups: enriched });
  } catch {
    // Tables don't exist yet
    res.json({ groups: [] });
  }
});

// GET /api/groups/:slug — single group detail
router.get("/groups/:slug", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }

  const members = (await db.select().from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, result.group.id))).filter(m => m.joinedAt !== null);

  res.json({
    group: result.group,
    myRole: result.member.role,
    members: members.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
  });
});

// PATCH /api/groups/:slug — update group (admin only)
router.patch("/groups/:slug", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    calendarUrl: z.string().url().max(1000).optional().or(z.literal("")),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const updates: Record<string, any> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.calendarUrl !== undefined) updates.calendarUrl = parsed.data.calendarUrl || null;

  if (Object.keys(updates).length > 0) {
    await db.update(groupsTable).set(updates).where(eq(groupsTable.id, result.group.id));
  }

  const [updated] = await db.select().from(groupsTable).where(eq(groupsTable.id, result.group.id));
  res.json({ group: updated });
});

// DELETE /api/groups/:slug — delete group (admin only)
router.delete("/groups/:slug", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  await db.delete(groupsTable).where(eq(groupsTable.id, result.group.id));
  res.json({ ok: true });
});

// ─── Membership ─────────────────────────────────────────────────────────────

// POST /api/groups/:slug/members — invite members (admin only)
router.post("/groups/:slug/members", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const schema = z.object({
    people: z.array(z.object({
      name: z.string().optional(),
      email: z.string().email(),
    })).min(1).max(50),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const invited = [];
  for (const person of parsed.data.people) {
    const emailLower = person.email.toLowerCase();
    // Check if already a member
    const [existing] = await db.select().from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, result.group.id), eq(groupMembersTable.email, emailLower)));
    if (existing) continue;

    // Look up userId if they have an account
    const [existingUser] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, emailLower));

    const token = generateToken();
    const [member] = await db.insert(groupMembersTable).values({
      groupId: result.group.id,
      userId: existingUser?.id ?? null,
      email: emailLower,
      name: person.name ?? null,
      role: "member",
      inviteToken: token,
    }).returning();

    invited.push({ ...member, inviteToken: token });
  }

  res.json({ invited });
});

// POST /api/groups/:slug/join — accept invite
router.post("/groups/:slug/join", async (req, res): Promise<void> => {
  const token = (req.query.token as string) || req.body?.token;
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, req.params.slug));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const [member] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.inviteToken, token)));
  if (!member) { res.status(404).json({ error: "Invalid invite" }); return; }
  if (member.joinedAt) { res.json({ ok: true, alreadyJoined: true, group }); return; }

  // Link userId if authenticated
  const user = getUser(req);
  const updates: Record<string, any> = { joinedAt: new Date() };
  if (user) {
    updates.userId = user.id;
    updates.name = user.name || member.name;
  }

  await db.update(groupMembersTable).set(updates).where(eq(groupMembersTable.id, member.id));
  res.json({ ok: true, group });
});

// GET /api/groups/:slug/members — list all members
router.get("/groups/:slug/members", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }

  const members = await db.select().from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, result.group.id));

  res.json({
    members: members.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
      pending: !m.joinedAt,
    })),
  });
});

// DELETE /api/groups/:slug/members/:memberId — remove a member (admin only)
router.delete("/groups/:slug/members/:memberId", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const memberId = parseInt(req.params.memberId, 10);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid member ID" }); return; }

  // Don't allow removing yourself if you're the only admin
  const [target] = await db.select().from(groupMembersTable).where(eq(groupMembersTable.id, memberId));
  if (!target || target.groupId !== result.group.id) { res.status(404).json({ error: "Member not found" }); return; }
  if (target.userId === user.id) { res.status(400).json({ error: "Cannot remove yourself" }); return; }

  await db.delete(groupMembersTable).where(eq(groupMembersTable.id, memberId));
  res.json({ ok: true });
});

// ─── Group-Scoped Resources (stubbed until groupId columns are migrated) ───
// These endpoints will return empty results until `drizzle-kit push` adds
// the group_id column to shared_moments, rituals, and prayer_requests.

router.get("/groups/:slug/prayer-requests", async (_req, res): Promise<void> => {
  res.json({ requests: [] });
});

router.post("/groups/:slug/prayer-requests", async (_req, res): Promise<void> => {
  res.status(503).json({ error: "Group prayer requests not yet available — schema migration pending" });
});

router.get("/groups/:slug/practices", async (_req, res): Promise<void> => {
  res.json({ practices: [] });
});

router.get("/groups/:slug/gatherings", async (_req, res): Promise<void> => {
  res.json({ gatherings: [] });
});

// ─── Announcements ──────────────────────────────────────────────────────────

// GET /api/groups/:slug/announcements
router.get("/groups/:slug/announcements", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }

  const announcements = await db.select().from(groupAnnouncementsTable)
    .where(eq(groupAnnouncementsTable.groupId, result.group.id))
    .orderBy(desc(groupAnnouncementsTable.createdAt));

  // Enrich with author name
  const enriched = await Promise.all(announcements.map(async (a) => {
    const [author] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, a.authorUserId));
    return { ...a, authorName: author?.name ?? "Admin" };
  }));

  res.json({ announcements: enriched });
});

// POST /api/groups/:slug/announcements (admin only)
router.post("/groups/:slug/announcements", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const schema = z.object({
    title: z.string().max(200).optional(),
    content: z.string().min(1).max(5000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [announcement] = await db.insert(groupAnnouncementsTable).values({
    groupId: result.group.id,
    authorUserId: user.id,
    title: parsed.data.title ?? null,
    content: parsed.data.content,
  }).returning();

  res.json({ announcement });
});

// ─── User Search ─────────────────────────────────────────────────────────────

// GET /api/groups/users/search?q=... — search Phoebe users by name or email
router.get("/groups/users/search", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const q = ((req.query.q as string) || "").trim().toLowerCase();
    if (q.length < 2) { res.json({ users: [] }); return; }

    const allUsers = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable);

    const matches = allUsers
      .filter(u => u.id !== user.id && (
        u.name?.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      ))
      .slice(0, 8);

    res.json({ users: matches });
  } catch (err) {
    console.error("GET /api/groups/users/search error:", err);
    res.json({ users: [] });
  }
});

// ─── Beta User Management ───────────────────────────────────────────────────

// Safely query beta_users — returns null if table doesn't exist yet
async function safeBetaLookup(email: string): Promise<{ isAdmin: boolean } | null> {
  try {
    const [beta] = await db.select().from(betaUsersTable).where(eq(betaUsersTable.email, email.toLowerCase()));
    return beta ? { isAdmin: beta.isAdmin } : null;
  } catch {
    // Table doesn't exist yet — schema not pushed
    return null;
  }
}

async function isBetaAdmin(userId: number): Promise<boolean> {
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return false;
  const beta = await safeBetaLookup(u.email);
  return beta?.isAdmin === true;
}

// GET /api/beta/status — check if current user is a beta user
router.get("/beta/status", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.json({ isBeta: false, isAdmin: false }); return; }

    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) { res.json({ isBeta: false, isAdmin: false }); return; }

    const beta = await safeBetaLookup(u.email);
    res.json({ isBeta: !!beta, isAdmin: beta?.isAdmin === true });
  } catch {
    // Graceful fallback if anything goes wrong
    res.json({ isBeta: false, isAdmin: false });
  }
});

// GET /api/beta/users — list all beta users (admin only)
router.get("/beta/users", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Beta admin access required" });
      return;
    }

    const betaUsers = await db.select().from(betaUsersTable).orderBy(desc(betaUsersTable.createdAt));
    res.json({ users: betaUsers });
  } catch (err) {
    console.error("GET /api/beta/users error:", err);
    res.json({ users: [] });
  }
});

// POST /api/beta/users — add a beta user (admin only)
router.post("/beta/users", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Beta admin access required" });
      return;
    }

    const schema = z.object({
      email: z.string().email(),
      name: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

    const emailLower = parsed.data.email.toLowerCase();
    const [existing] = await db.select().from(betaUsersTable).where(eq(betaUsersTable.email, emailLower));
    if (existing) { res.json({ user: existing, alreadyExists: true }); return; }

    const [betaUser] = await db.insert(betaUsersTable).values({
      email: emailLower,
      name: parsed.data.name ?? null,
      addedByUserId: user.id,
    }).returning();

    res.json({ user: betaUser });
  } catch (err) {
    console.error("POST /api/beta/users error:", err);
    res.status(500).json({ error: "Table not ready — run schema push" });
  }
});

// DELETE /api/beta/users/:id — remove a beta user (admin only)
router.delete("/beta/users/:id", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Beta admin access required" });
      return;
    }

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [target] = await db.select().from(betaUsersTable).where(eq(betaUsersTable.id, id));
    const [selfUser] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, user.id));
    if (target && selfUser && target.email === selfUser.email.toLowerCase()) {
      res.status(400).json({ error: "Cannot remove yourself" });
      return;
    }

    await db.delete(betaUsersTable).where(eq(betaUsersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/beta/users error:", err);
    res.status(500).json({ error: "Table not ready — run schema push" });
  }
});

// POST /api/beta/claim — one-time admin claim with secret token
// The claim token is set via BETA_CLAIM_TOKEN env var (or defaults to a hardcoded one for dev)
router.post("/beta/claim", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const { token } = req.body ?? {};
    const claimToken = process.env.BETA_CLAIM_TOKEN || "phoebe-admin-2026";
    if (token !== claimToken) {
      res.status(403).json({ error: "Invalid claim token" });
      return;
    }

    const [u] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) { res.status(400).json({ error: "User not found" }); return; }

    // Check if already a beta user
    const [existing] = await db.select().from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (existing) {
      // Upgrade to admin if not already
      if (!existing.isAdmin) {
        await db.update(betaUsersTable).set({ isAdmin: true }).where(eq(betaUsersTable.id, existing.id));
      }
      res.json({ ok: true, alreadyExisted: true });
      return;
    }

    const [betaUser] = await db.insert(betaUsersTable).values({
      email: u.email.toLowerCase(),
      name: u.name,
      addedByUserId: user.id,
      isAdmin: true,
    }).returning();

    res.json({ ok: true, user: betaUser });
  } catch (err) {
    console.error("POST /api/beta/claim error:", err);
    res.status(500).json({ error: "Table not ready — run schema push" });
  }
});

export default router;
