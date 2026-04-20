import { Router, type IRouter } from "express";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupAnnouncementsTable,
  groupAdminNotificationsAckTable,
  betaUsersTable,
  usersTable,
  sharedMomentsTable,
  momentUserTokensTable,
  prayerRequestsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import crypto from "crypto";
import { sendEmail } from "../lib/email";
import { rateLimit, getClientIp } from "../lib/rate-limit";

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

// ─── Dynamic practice membership ─────────────────────────────────────────────
// A practice tied to a group reflects the group's current roster. Rather than
// capture members statically at practice-creation time, we reconcile the
// practice's `moment_user_tokens` rows against `group_members` every time the
// group or the practice is read. That way, adding/removing someone from the
// group flows into every attached practice automatically, and the two can
// never drift even if a code path forgets to call the eager helpers below.
//
// The organizer (practice creator) is identified as the token with the
// smallest `id` — the first row ever inserted for this practice. We preserve
// the organizer even when they're not in the group, because a community
// admin may create a practice for a group they don't personally belong to.

export async function reconcileGroupPracticeMembers(momentId: number): Promise<void> {
  try {
    const [m] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (!m || !m.groupId) return;

    // Current group roster (joined only — exclude pending invites)
    const groupRows = await db.select().from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, m.groupId));
    const joined = groupRows.filter(gm => gm.joinedAt !== null);
    const groupEmailToName = new Map<string, string | null>();
    for (const gm of joined) groupEmailToName.set(gm.email.toLowerCase(), gm.name);

    // Existing tokens for the practice
    const tokens = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, momentId));

    // Organizer = smallest-id token (practice creator). Preserved unconditionally.
    const organizerId = tokens.length > 0
      ? tokens.reduce((min, t) => (t.id < min.id ? t : min), tokens[0]).id
      : null;

    const tokenEmailSet = new Set(tokens.map(t => t.email.toLowerCase()));
    const groupEmailSet = new Set(groupEmailToName.keys());

    // Add tokens for group members who don't have one yet.
    const toAdd: { email: string; name: string }[] = [];
    for (const email of groupEmailSet) {
      if (!tokenEmailSet.has(email)) {
        toAdd.push({ email, name: groupEmailToName.get(email) ?? email });
      }
    }
    if (toAdd.length > 0) {
      await db.insert(momentUserTokensTable).values(
        toAdd.map(row => ({
          momentId,
          email: row.email,
          name: row.name,
          userToken: generateToken(),
        }))
      );
    }

    // Remove tokens for people no longer in the group (but never the organizer).
    const toRemove = tokens.filter(t => {
      if (t.id === organizerId) return false;
      return !groupEmailSet.has(t.email.toLowerCase());
    });
    if (toRemove.length > 0) {
      await db.delete(momentUserTokensTable)
        .where(inArray(momentUserTokensTable.id, toRemove.map(t => t.id)));
    }
  } catch (err) {
    console.error("[groups] reconcileGroupPracticeMembers failed for moment", momentId, err);
  }
}

export async function reconcileAllPracticesForGroup(groupId: number): Promise<void> {
  try {
    const practices = await db.select({ id: sharedMomentsTable.id })
      .from(sharedMomentsTable)
      .where(and(eq(sharedMomentsTable.groupId, groupId), sql`${sharedMomentsTable.state} != 'archived'`));
    await Promise.all(practices.map(p => reconcileGroupPracticeMembers(p.id)));
  } catch (err) {
    console.error("[groups] reconcileAllPracticesForGroup failed for group", groupId, err);
  }
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

// POST /api/groups — create a group (builders only)
router.post("/groups", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    // Only builders (platform admins) can create groups
    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Only builders can create groups" }); return;
    }

    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      emoji: z.string().max(10).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }

    const slug = await uniqueSlug(parsed.data.name);

    const [group] = await db.insert(groupsTable).values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      emoji: parsed.data.emoji ?? null,
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

  // Return ALL members (both joined and pending-invite) so admins can manage
  // pending invites in the UI. The client filters on `joinedAt` to separate
  // the two sections.
  const members = await db.select().from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, result.group.id));

  // Batch-fetch avatarUrl for all members
  const memberEmails = members.map(m => m.email.toLowerCase());
  const avatarRows = memberEmails.length > 0
    ? await db.select({ email: usersTable.email, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(inArray(usersTable.email, memberEmails))
    : [];
  const avatarByEmail = new Map(avatarRows.map(u => [u.email.toLowerCase(), u.avatarUrl]));

  // `inviteToken` is surfaced only to admins — they're the ones sharing
  // the link, and we don't want every member handing it out. A member who
  // wants to share the community can ask an admin.
  const isAdminView = result.member.role === "admin";
  res.json({
    group: {
      ...result.group,
      ...(isAdminView ? {} : { inviteToken: undefined }),
    },
    myRole: result.member.role,
    members: members.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
      avatarUrl: avatarByEmail.get(m.email.toLowerCase()) ?? null,
    })),
  });
});

// POST /api/groups/:slug/rotate-invite — regenerate the community-wide invite
// token (admin only). Useful if the current link was shared too widely or the
// admin wants to wall off new joiners without deleting existing memberships.
router.post("/groups/:slug/rotate-invite", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const newToken = crypto.randomBytes(16).toString("hex");
  await db.update(groupsTable).set({ inviteToken: newToken })
    .where(eq(groupsTable.id, result.group.id));
  res.json({ ok: true, inviteToken: newToken });
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
    emoji: z.string().max(10).optional(),
    // Restrict to http(s)/webcal so the stored URL can't be rendered as a
    // javascript: or data: href on the client — that would be stored XSS
    // on every member viewing the group.
    calendarUrl: z.string().url().max(1000).refine(
      (v) => {
        try { return ["http:", "https:", "webcal:"].includes(new URL(v).protocol); }
        catch { return false; }
      },
      { message: "Calendar URL must use http, https, or webcal" },
    ).optional().or(z.literal("")),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const updates: Record<string, any> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.emoji !== undefined) updates.emoji = parsed.data.emoji || null;
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

// POST /api/groups/:slug/members — add members (admin only)
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

  const added = [];
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
      joinedAt: new Date(),
    }).returning();

    added.push(member);
  }

  // Practices attached to this group reflect the group roster — reconcile once
  // at the end so every attached practice sees the newly-added members.
  await reconcileAllPracticesForGroup(result.group.id);

  res.json({ added });
});

// GET /api/groups/:slug/invite/:token — public lookup. Returns the group
// name and either the pre-invited email (per-member legacy tokens) or
// nothing (community-wide link) so the join page can render appropriately.
// No auth required because brand-new users hit this before they have an
// account. Validates token before returning anything.
//
// Resolution order:
//   1. Community-wide token on the group itself → kind: "community"
//   2. Per-member token on group_members → kind: "member" (legacy/pending)
router.get("/groups/:slug/invite/:token", async (req, res): Promise<void> => {
  const { slug, token } = req.params as { slug: string; token: string };
  const [group] = await db.select({
    id: groupsTable.id,
    name: groupsTable.name,
    slug: groupsTable.slug,
    emoji: groupsTable.emoji,
    description: groupsTable.description,
    inviteToken: groupsTable.inviteToken,
  }).from(groupsTable).where(eq(groupsTable.slug, slug));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  // 1. Community-wide token — the new primary path. Anyone with this
  // token can join, no email match required.
  if (group.inviteToken && group.inviteToken === token) {
    // Enrich with preview data for the join-page onboarding slideshow:
    // a small sample of joined members (names + avatars for social proof)
    // and the group's active practices (so visitors see what they're
    // signing up to do). All of this is read-only, non-sensitive, and
    // already visible to any member — fine to surface pre-auth.
    const joinedMembers = await db.select({
      name: groupMembersTable.name,
      email: groupMembersTable.email,
      avatarUrl: usersTable.avatarUrl,
    })
      .from(groupMembersTable)
      .leftJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
      .where(and(
        eq(groupMembersTable.groupId, group.id),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ))
      .orderBy(desc(groupMembersTable.joinedAt))
      .limit(6);

    const [memberCountRow] = await db.select({
      c: sql<number>`count(*)::int`,
    })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, group.id),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ));

    const practices = await db.select({
      id: sharedMomentsTable.id,
      name: sharedMomentsTable.name,
      templateType: sharedMomentsTable.templateType,
      intention: sharedMomentsTable.intention,
    })
      .from(sharedMomentsTable)
      .where(and(
        eq(sharedMomentsTable.groupId, group.id),
        sql`${sharedMomentsTable.state} != 'archived'`,
      ))
      .limit(5);

    res.json({
      kind: "community",
      group: { name: group.name, slug: group.slug, emoji: group.emoji, description: group.description },
      preview: {
        memberCount: memberCountRow?.c ?? 0,
        sampleMembers: joinedMembers.map(m => ({
          name: m.name,
          // Strip email — we only surface first names / display names to
          // pre-auth visitors. An email would be PII leakage.
          avatarUrl: m.avatarUrl ?? null,
        })),
        practices: practices.map(p => ({
          id: p.id,
          name: p.name,
          templateType: p.templateType,
          intention: p.intention,
        })),
      },
    });
    return;
  }

  // 2. Per-member token — kept working so any pending email invites
  // created before this change are still redeemable.
  const [member] = await db.select({
    email: groupMembersTable.email,
    name: groupMembersTable.name,
    joinedAt: groupMembersTable.joinedAt,
  })
    .from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.inviteToken, token)));
  if (!member) { res.status(404).json({ error: "Invalid invite" }); return; }

  res.json({
    kind: "member",
    group: { name: group.name, slug: group.slug, emoji: group.emoji, description: group.description },
    invitee: { email: member.email, name: member.name, joinedAt: member.joinedAt },
  });
});

// POST /api/groups/:slug/join — accept invite
//
// Two token flavors:
//   1. Community-wide token (new primary path) — anyone signed in can click
//      the link and land here. We INSERT a fresh group_members row for them.
//   2. Per-member token (legacy) — pre-invited user redeems their token and
//      we UPDATE the existing pending row.
// Rate limit: a leaked invite link is the main abuse vector here. 20 joins
// per hour per (slug + IP) lets a legit admin share a link in a room of ~20
// people without friction, while throttling a scraped-link flood enough that
// the admin has time to rotate the token. We key on slug+IP rather than slug
// alone so that a single noisy IP can't deny access to the whole community.
router.post(
  "/groups/:slug/join",
  rateLimit({
    name: "groups_join",
    max: 20,
    windowMs: 60 * 60 * 1000,
    keyFn: (req) => `${req.params.slug ?? "_"}::${getClientIp(req)}`,
    message: "Too many join attempts for this community. Please try again shortly.",
  }),
  async (req, res): Promise<void> => {
  const token = (req.query.token as string) || req.body?.token;
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  // Express's typing narrows less precisely once middleware is composed, so
  // we read :slug as a string explicitly (the route literal guarantees it).
  const slug = String(req.params.slug ?? "");
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, slug));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  // ── Community-wide token path ───────────────────────────────────────────
  // This is the new primary join flow. Users must be signed in so we know
  // who to link the membership to; the landing page routes unauthenticated
  // visitors through register-then-join instead of hitting this endpoint.
  if (group.inviteToken && group.inviteToken === token) {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Sign in to join this community" }); return; }

    // Already a member? Idempotent — the link is shareable, so retries
    // and re-clicks should be harmless.
    const [existing] = await db.select().from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, group.id),
        eq(groupMembersTable.userId, user.id),
      ));
    if (existing) {
      // Upgrade a pending row (userId matched via old email-invite path)
      // to a joined row if somehow it isn't already.
      if (!existing.joinedAt) {
        await db.update(groupMembersTable)
          .set({ joinedAt: new Date(), name: user.name || existing.name })
          .where(eq(groupMembersTable.id, existing.id));
        await reconcileAllPracticesForGroup(group.id);
      }
      res.json({ ok: true, alreadyJoined: true, group });
      return;
    }

    // Fresh membership. group_members.inviteToken is NOT NULL UNIQUE (it
    // was the per-member invite token in the old model), so we still mint
    // a random one per row to satisfy the constraint even though it's no
    // longer the sharing mechanism.
    await db.insert(groupMembersTable).values({
      groupId: group.id,
      userId: user.id,
      email: user.email?.toLowerCase() ?? "",
      name: user.name ?? null,
      role: "member",
      inviteToken: crypto.randomBytes(16).toString("hex"),
      joinedAt: new Date(),
    });
    await reconcileAllPracticesForGroup(group.id);

    notifyAdminsOfNewMember(group.id, group.name, {
      name: user.name ?? user.email ?? "A new member",
      email: user.email ?? "",
    }).catch(err => console.error("[groups/join] notify admins failed:", err));

    res.json({ ok: true, group });
    return;
  }

  // ── Per-member (legacy) token path ──────────────────────────────────────
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
  // Practices attached to this group reflect the group roster — reconcile so
  // this newly-joined user appears as a member everywhere.
  await reconcileAllPracticesForGroup(group.id);

  // Notify community admins. Fire-and-forget so the user's response isn't
  // blocked on email delivery.
  notifyAdminsOfNewMember(group.id, group.name, {
    name: updates.name ?? member.name ?? member.email,
    email: member.email,
  }).catch(err => console.error("[groups/join] notify admins failed:", err));

  res.json({ ok: true, group });
});


// Exported so auth/register can call it after a community-invite signup
// (the join is performed inside register, not via this endpoint).
export async function notifyAdminsOfNewMember(
  groupId: number,
  groupName: string,
  joiner: { name: string; email: string },
): Promise<void> {
  // Resolve admin emails for the group via the user records linked to
  // joined admin members. Pending invites are skipped (they haven't joined
  // yet themselves).
  const adminMembers = await db.select({
    userId: groupMembersTable.userId,
  })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, groupId),
      eq(groupMembersTable.role, "admin"),
    ));
  const userIds = adminMembers.map(a => a.userId).filter((id): id is number => id != null);
  if (userIds.length === 0) return;

  const adminUsers = await db.select({
    email: usersTable.email,
    name: usersTable.name,
  })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  if (adminUsers.length === 0) return;

  const subject = `🌿 ${joiner.name} joined ${groupName}`;
  const safeName = escapeHtml(joiner.name);
  const safeEmail = escapeHtml(joiner.email);
  const safeGroup = escapeHtml(groupName);
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
      <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#888;margin:0 0 8px">Phoebe community</p>
      <h1 style="font-size:18px;margin:0 0 12px">${safeName} joined ${safeGroup}</h1>
      <p style="margin:0 0 4px"><strong>Email:</strong> <a href="mailto:${safeEmail}">${safeEmail}</a></p>
      <p style="margin:16px 0 0;color:#666">They accepted your invite and are now a member of ${safeGroup}.</p>
    </div>
  `;
  const text = [
    `${joiner.name} joined ${groupName}`,
    ``,
    `Email: ${joiner.email}`,
    ``,
    `They accepted your invite and are now a member of ${groupName}.`,
  ].join("\n");

  await Promise.all(adminUsers.map(a => sendEmail({ to: a.email, subject, html, text })));
}

// Mirror of notifyAdminsOfNewMember, for prayer requests. Called from the
// POST /groups/:slug/prayer-requests handler so admins get the out-of-band
// nudge even if they don't open the app for a while.
async function notifyAdminsOfNewPrayerRequest(
  groupId: number,
  groupName: string,
  body: string,
  authorName: string | null,
  isAnonymous: boolean,
): Promise<void> {
  const adminMembers = await db.select({ userId: groupMembersTable.userId })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, groupId),
      eq(groupMembersTable.role, "admin"),
    ));
  const userIds = adminMembers.map(a => a.userId).filter((id): id is number => id != null);
  if (userIds.length === 0) return;

  const adminUsers = await db.select({
    email: usersTable.email,
    name: usersTable.name,
  })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  if (adminUsers.length === 0) return;

  const displayAuthor = isAnonymous ? "Someone" : (authorName ?? "A member");
  const subject = `🙏 New prayer request in ${groupName}`;
  const safeAuthor = escapeHtml(displayAuthor);
  const safeBody = escapeHtml(body);
  const safeGroup = escapeHtml(groupName);
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">
      <p style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#888;margin:0 0 8px">Phoebe community</p>
      <h1 style="font-size:18px;margin:0 0 12px">${safeAuthor} shared a prayer in ${safeGroup}</h1>
      <blockquote style="margin:12px 0;padding:12px 16px;border-left:3px solid #2D5E3F;background:#f6f8f6;color:#333;white-space:pre-wrap">${safeBody}</blockquote>
      <p style="margin:16px 0 0;color:#666">Open Phoebe to pray for this request.</p>
    </div>
  `;
  const text = [
    `${displayAuthor} shared a prayer in ${groupName}:`,
    ``,
    body,
    ``,
    `Open Phoebe to pray for this request.`,
  ].join("\n");

  await Promise.all(adminUsers.map(a => sendEmail({ to: a.email, subject, html, text })));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

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
  // Practices attached to this group reflect the group roster — reconcile so
  // the removed user loses their tokens across every attached practice.
  await reconcileAllPracticesForGroup(result.group.id);
  res.json({ ok: true });
});

// ─── Admin notifications (new-member + new-prayer popup) ───────────────────
// GET  /api/groups/:slug/admin-notifications → events the admin hasn't
//      acknowledged yet (new joiners + new prayer requests by members)
// POST /api/groups/:slug/admin-notifications/acknowledge → body: { events: [{kind, id}] }
//      Inserts ack rows (ON CONFLICT DO NOTHING) so the popup fires exactly
//      once per admin per event even across devices and reloads.
//
// Scope: capped at the last 30 days to avoid retro-flooding a freshly
// promoted admin with 2 years of history. Exclude the admin's own joins
// and own prayer requests — they don't need a popup about themselves.

const LOOKBACK_DAYS = 30;

router.get("/groups/:slug/admin-notifications", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.json({ newMembers: [], newPrayers: [] }); return; }
  const { group } = result;

  // ── New members: joined within lookback window, not yet acknowledged ────
  const recentMembers = await db.select({
    id: groupMembersTable.id,
    name: groupMembersTable.name,
    email: groupMembersTable.email,
    joinedAt: groupMembersTable.joinedAt,
    userId: groupMembersTable.userId,
    avatarUrl: usersTable.avatarUrl,
  })
    .from(groupMembersTable)
    .leftJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
    .where(and(
      eq(groupMembersTable.groupId, group.id),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      sql`${groupMembersTable.joinedAt} > NOW() - INTERVAL '${sql.raw(String(LOOKBACK_DAYS))} days'`,
      sql`${groupMembersTable.userId} <> ${user.id}`,
    ))
    .orderBy(desc(groupMembersTable.joinedAt));

  // Filter out members the admin has already ack'd. One ack lookup, batch.
  const memberIds = recentMembers.map(m => m.id);
  let memberAckedSet = new Set<number>();
  if (memberIds.length > 0) {
    const acks = await db.select({ eventId: groupAdminNotificationsAckTable.eventId })
      .from(groupAdminNotificationsAckTable)
      .where(and(
        eq(groupAdminNotificationsAckTable.adminUserId, user.id),
        eq(groupAdminNotificationsAckTable.groupId, group.id),
        eq(groupAdminNotificationsAckTable.kind, "member_joined"),
        inArray(groupAdminNotificationsAckTable.eventId, memberIds),
      ));
    memberAckedSet = new Set(acks.map(a => a.eventId));
  }
  const newMembers = recentMembers
    .filter(m => !memberAckedSet.has(m.id))
    .map(m => ({
      id: m.id,
      name: m.name,
      avatarUrl: m.avatarUrl ?? null,
      joinedAt: m.joinedAt,
    }));

  // ── New prayer requests: direct group_id filter on prayer_requests ──────
  // Exclude the admin's own requests (they don't need a popup about their
  // own post) and filter out anything already acknowledged.
  const recentPrayers = await db.select({
    id: prayerRequestsTable.id,
    body: prayerRequestsTable.body,
    ownerName: prayerRequestsTable.createdByName,
    isAnonymous: prayerRequestsTable.isAnonymous,
    createdAt: prayerRequestsTable.createdAt,
  })
    .from(prayerRequestsTable)
    .where(and(
      eq(prayerRequestsTable.groupId, group.id),
      sql`${prayerRequestsTable.ownerId} <> ${user.id}`,
      sql`${prayerRequestsTable.createdAt} > NOW() - INTERVAL '${sql.raw(String(LOOKBACK_DAYS))} days'`,
    ))
    .orderBy(desc(prayerRequestsTable.createdAt));

  const prayerIds = recentPrayers.map(p => p.id);
  let prayerAckedSet = new Set<number>();
  if (prayerIds.length > 0) {
    const acks = await db.select({ eventId: groupAdminNotificationsAckTable.eventId })
      .from(groupAdminNotificationsAckTable)
      .where(and(
        eq(groupAdminNotificationsAckTable.adminUserId, user.id),
        eq(groupAdminNotificationsAckTable.groupId, group.id),
        eq(groupAdminNotificationsAckTable.kind, "prayer_request"),
        inArray(groupAdminNotificationsAckTable.eventId, prayerIds),
      ));
    prayerAckedSet = new Set(acks.map(a => a.eventId));
  }
  const newPrayers = recentPrayers.filter(p => !prayerAckedSet.has(p.id));

  res.json({ newMembers, newPrayers });
});

router.post("/groups/:slug/admin-notifications/acknowledge", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not an admin" }); return; }
  const { group } = result;

  const schema = z.object({
    events: z.array(z.object({
      kind: z.enum(["member_joined", "prayer_request"]),
      id: z.number().int().positive(),
    })),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Bad payload" }); return; }
  if (parsed.data.events.length === 0) { res.json({ ok: true, inserted: 0 }); return; }

  // ON CONFLICT DO NOTHING — repeated dismissals of the same event are no-ops.
  const values = parsed.data.events.map(e => ({
    adminUserId: user.id,
    groupId: group.id,
    kind: e.kind,
    eventId: e.id,
  }));
  await db.insert(groupAdminNotificationsAckTable)
    .values(values)
    .onConflictDoNothing();

  res.json({ ok: true, inserted: values.length });
});

// ─── Group-scoped prayer requests ──────────────────────────────────────────
// A community's prayer wall. Any member can read; any member can post.
// Admins also receive a popup on the community-detail page when a new
// request lands (via /admin-notifications).

router.get("/groups/:slug/prayer-requests", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this group" }); return; }
  const { group } = result;

  const rows = await db.select({
    id: prayerRequestsTable.id,
    body: prayerRequestsTable.body,
    ownerId: prayerRequestsTable.ownerId,
    createdByName: prayerRequestsTable.createdByName,
    isAnonymous: prayerRequestsTable.isAnonymous,
    createdAt: prayerRequestsTable.createdAt,
    ownerDisplayName: usersTable.name,
  })
    .from(prayerRequestsTable)
    .leftJoin(usersTable, eq(prayerRequestsTable.ownerId, usersTable.id))
    .where(and(
      eq(prayerRequestsTable.groupId, group.id),
      sql`${prayerRequestsTable.closedAt} IS NULL`,
    ))
    .orderBy(desc(prayerRequestsTable.createdAt));

  // Word count is decorative on the community feed — reusable hook for
  // "how much prayer has this received?" once we implement it. For now,
  // return 0 so the UI renders consistently.
  const requests = rows.map(r => ({
    id: r.id,
    body: r.body,
    ownerName: r.isAnonymous ? null : (r.createdByName ?? r.ownerDisplayName),
    wordCount: 0,
    isOwnRequest: r.ownerId === user.id,
    isAnonymous: r.isAnonymous,
    createdAt: r.createdAt,
  }));

  res.json({ requests });
});

router.post("/groups/:slug/prayer-requests", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this group" }); return; }
  const { group, member } = result;

  const schema = z.object({
    body: z.string().trim().min(1, "Request cannot be empty").max(2000),
    isAnonymous: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" });
    return;
  }

  const [inserted] = await db.insert(prayerRequestsTable).values({
    ownerId: user.id,
    groupId: group.id,
    body: parsed.data.body,
    createdByName: member.name ?? user.name,
    isAnonymous: parsed.data.isAnonymous ?? false,
  }).returning({ id: prayerRequestsTable.id });

  // Fire-and-forget notification to admins. Failure here must not block the
  // happy path — the request is already saved.
  notifyAdminsOfNewPrayerRequest(
    group.id,
    group.name,
    parsed.data.body,
    parsed.data.isAnonymous ? null : (member.name ?? user.name),
    parsed.data.isAnonymous ?? false,
  ).catch(err => console.error("[groups] notify admins of new prayer failed:", err));

  res.json({ ok: true, id: inserted.id });
});

router.get("/groups/:slug/practices", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this group" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, req.params.slug));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  const practices = await db.select().from(sharedMomentsTable)
    .where(and(eq(sharedMomentsTable.groupId, group.id), sql`${sharedMomentsTable.state} != 'archived'`));

  const enriched = await Promise.all(practices.map(async (p) => {
    const members = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, p.id));
    return {
      id: p.id,
      name: p.name,
      templateType: p.templateType,
      intention: p.intention,
      frequency: p.frequency,
      memberCount: members.length,
      state: p.state,
      createdAt: p.createdAt,
    };
  }));

  res.json({ practices: enriched });
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
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
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
async function safeBetaLookup(email: string): Promise<{ isAdmin: boolean; seenWelcome: boolean } | null> {
  try {
    // Select only core columns — seenWelcome may not exist yet in all environments
    const [beta] = await db
      .select({ email: betaUsersTable.email, isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, email.toLowerCase()));
    if (!beta) return null;
    // Try reading seenWelcome separately — graceful if column doesn't exist
    let seenWelcome = false;
    try {
      const [row] = await db
        .select({ seenWelcome: betaUsersTable.seenWelcome })
        .from(betaUsersTable)
        .where(eq(betaUsersTable.email, email.toLowerCase()));
      seenWelcome = row?.seenWelcome ?? false;
    } catch {
      // Column doesn't exist yet
    }
    return { isAdmin: beta.isAdmin, seenWelcome };
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
    res.json({
      isBeta: !!beta,
      isAdmin: beta?.isAdmin === true,
      showWelcome: beta ? !beta.seenWelcome : false,
    });
  } catch {
    // Graceful fallback if anything goes wrong
    res.json({ isBeta: false, isAdmin: false, showWelcome: false });
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

    const betaUsers = await db.select({
      id: betaUsersTable.id,
      email: betaUsersTable.email,
      name: betaUsersTable.name,
      isAdmin: betaUsersTable.isAdmin,
      createdAt: betaUsersTable.createdAt,
      addedByUserId: betaUsersTable.addedByUserId,
    }).from(betaUsersTable).orderBy(desc(betaUsersTable.createdAt));

    // Resolve addedByUserId → display name in one batch query. We render
    // "invited by X" in the admin UI so it's clear who owns each invite.
    // Fall back to null silently if the inviter has been deleted.
    const inviterIds = Array.from(new Set(betaUsers.map(u => u.addedByUserId).filter((v): v is number => typeof v === "number")));
    const inviterMap = new Map<number, { name: string | null; email: string }>();
    if (inviterIds.length > 0) {
      const inviterRows = await db.select({
        id: usersTable.id, name: usersTable.name, email: usersTable.email,
      }).from(usersTable).where(inArray(usersTable.id, inviterIds));
      for (const r of inviterRows) inviterMap.set(r.id, { name: r.name, email: r.email });
    }

    const withInviter = betaUsers.map(u => {
      const inv = u.addedByUserId != null ? inviterMap.get(u.addedByUserId) : undefined;
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt,
        addedByName: inv ? (inv.name || inv.email.split("@")[0]) : null,
      };
    });
    res.json({ users: withInviter });
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
    const [existing] = await db.select({ id: betaUsersTable.id, email: betaUsersTable.email }).from(betaUsersTable).where(eq(betaUsersTable.email, emailLower));
    if (existing) { res.json({ user: existing, alreadyExists: true }); return; }

    const [betaUser] = await db.insert(betaUsersTable).values({
      email: emailLower,
      name: parsed.data.name ?? null,
      addedByUserId: user.id,
    }).returning({
      id: betaUsersTable.id,
      email: betaUsersTable.email,
      name: betaUsersTable.name,
      isAdmin: betaUsersTable.isAdmin,
      createdAt: betaUsersTable.createdAt,
    });

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

    const [target] = await db.select({ id: betaUsersTable.id, email: betaUsersTable.email, isAdmin: betaUsersTable.isAdmin }).from(betaUsersTable).where(eq(betaUsersTable.id, id));
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

// POST /api/beta/welcome-seen — dismiss the one-time welcome popup
router.post("/beta/welcome-seen", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) { res.status(404).json({ error: "User not found" }); return; }
    await db.update(betaUsersTable).set({ seenWelcome: true }).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/beta/welcome-seen error:", err);
    res.status(500).json({ error: "Failed" });
  }
});

// POST /api/beta/claim — one-time admin claim with secret token
// The claim token MUST be set via the BETA_CLAIM_TOKEN env var. If it's
// unset we fail closed — previously this fell back to a hardcoded string
// that was checked into the repo, so any signed-in user could self-promote
// to beta admin on any environment missing the env var.
router.post("/beta/claim", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const claimToken = process.env.BETA_CLAIM_TOKEN;
    if (!claimToken) {
      res.status(503).json({ error: "Claim disabled" });
      return;
    }

    const { token } = req.body ?? {};
    if (token !== claimToken) {
      res.status(403).json({ error: "Invalid claim token" });
      return;
    }

    const [u] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) { res.status(400).json({ error: "User not found" }); return; }

    // Check if already a beta user
    const [existing] = await db.select({ id: betaUsersTable.id, isAdmin: betaUsersTable.isAdmin }).from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
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
    }).returning({
      id: betaUsersTable.id,
      email: betaUsersTable.email,
      name: betaUsersTable.name,
      isAdmin: betaUsersTable.isAdmin,
      createdAt: betaUsersTable.createdAt,
    });

    res.json({ ok: true, user: betaUser });
  } catch (err) {
    console.error("POST /api/beta/claim error:", err);
    res.status(500).json({ error: "Table not ready — run schema push" });
  }
});

export default router;
