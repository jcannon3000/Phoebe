import { Router, type IRouter } from "express";
import { eq, and, or, asc, desc, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupAnnouncementsTable,
  groupAdminNotificationsAckTable,
  groupServiceSchedulesTable,
  type GroupServiceTime,
  betaUsersTable,
  usersTable,
  sharedMomentsTable,
  momentGroupsTable,
  momentUserTokensTable,
  momentPostsTable,
  prayerRequestsTable,
  prayerRequestAmensTable,
  circleDailyFocusTable,
  circleIntentionsTable,
  ritualsTable,
  meetupsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import crypto from "crypto";
import { sendEmail, sendDailyBellIcsInvite } from "../lib/email";
import { rateLimit, getClientIp } from "../lib/rate-limit";
import { createCalendarEvent, deleteCalendarEvent, getCalendarEventAttendees } from "../lib/calendar";
import { sendNewMemberPush, sendNewPrayerRequestPush, sendPushToUsers } from "../lib/pushSender";
import { pool } from "@workspace/db";
import { computeStreak } from "../lib/streak";

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
    if (!m) return;

    // Collect every group this practice is attached to:
    //   - primary: sharedMoments.groupId
    //   - secondary: any row in moment_groups junction (multi-group
    //     intercessions). Before this, only the primary group's roster
    //     got tokens, so an intercession shared with Group B never
    //     showed up in Group B members' /api/moments response —
    //     dashboards + slideshow silently missed it. Unioning both
    //     sources here is the single fix that makes multi-group
    //     intercessions actually propagate.
    const attachedGroupIds = new Set<number>();
    if (m.groupId) attachedGroupIds.add(m.groupId);
    const extraLinks = await db.select({ groupId: momentGroupsTable.groupId })
      .from(momentGroupsTable)
      .where(eq(momentGroupsTable.momentId, momentId));
    for (const link of extraLinks) attachedGroupIds.add(link.groupId);
    if (attachedGroupIds.size === 0) return;

    // Current roster across every attached group (joined only).
    const groupRows = await db.select().from(groupMembersTable)
      .where(inArray(groupMembersTable.groupId, Array.from(attachedGroupIds)));
    const joined = groupRows.filter(gm => gm.joinedAt !== null);
    const groupEmailToName = new Map<string, string | null>();
    for (const gm of joined) {
      const key = gm.email.toLowerCase();
      // Prefer the first non-null name we see so a member who joined
      // one group without a name but another with one shows up named.
      if (!groupEmailToName.has(key) || (groupEmailToName.get(key) == null && gm.name != null)) {
        groupEmailToName.set(key, gm.name);
      }
    }

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
    // Practices where this group is PRIMARY.
    const primary = await db.select({ id: sharedMomentsTable.id })
      .from(sharedMomentsTable)
      .where(and(eq(sharedMomentsTable.groupId, groupId), sql`${sharedMomentsTable.state} != 'archived'`));
    // Practices where this group is a SECONDARY link (moment_groups junction).
    // Must be included so new members of a group picked up as a shared-with
    // group still get tokens for that intercession.
    const secondary = await db.select({ id: sharedMomentsTable.id })
      .from(sharedMomentsTable)
      .innerJoin(momentGroupsTable, eq(momentGroupsTable.momentId, sharedMomentsTable.id))
      .where(and(
        eq(momentGroupsTable.groupId, groupId),
        sql`${sharedMomentsTable.state} != 'archived'`,
      ));
    const allIds = Array.from(new Set([
      ...primary.map(p => p.id),
      ...secondary.map(p => p.id),
    ]));
    await Promise.all(allIds.map(id => reconcileGroupPracticeMembers(id)));
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

// "hidden_admin" = invisible member with admin privileges. Designated by
// pilot users for platform-side observation / management of a community.
// For permission checks they behave exactly like an admin, but the role
// value is filtered out of roster views so other members don't see them.
function isAdminRole(role: string): boolean {
  return role === "admin" || role === "hidden_admin";
}

async function requireAdmin(groupSlug: string, userId: number) {
  const result = await requireMember(groupSlug, userId);
  if (!result || !isAdminRole(result.member.role)) return null;
  return result;
}

// Is this user a pilot (beta) user? Designating a hidden admin is gated
// behind this flag — only pilots can create or change hidden-admin roles.
async function isBetaUser(userId: number): Promise<boolean> {
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return false;
  const beta = await safeBetaLookup(u.email);
  return beta !== null;
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

    // Prayer Circle fields are optional; when `isPrayerCircle` is true we
    // require a non-empty `intention`. We don't branch into a separate
    // schema — keeps the create flow one endpoint, one shape.
    const schema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      emoji: z.string().max(10).optional(),
      isPrayerCircle: z.boolean().optional(),
      intention: z.string().max(500).optional(),
      circleDescription: z.string().max(2000).optional(),
    }).refine(
      (d) => !d.isPrayerCircle || (d.intention && d.intention.trim().length > 0),
      { message: "Prayer circles require an intention", path: ["intention"] },
    );
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }

    const slug = await uniqueSlug(parsed.data.name);

    const isCircle = parsed.data.isPrayerCircle === true;
    const [group] = await db.insert(groupsTable).values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      emoji: parsed.data.emoji ?? null,
      slug,
      // Generate the community-wide invite token up front. Without this
      // the Share-invite modal on the community detail page reads
      // "Invite link not available" until an admin taps Rotate, because
      // the legacy flow only set per-member invite tokens.
      inviteToken: generateToken(),
      isPrayerCircle: isCircle,
      intention: isCircle ? (parsed.data.intention?.trim() ?? null) : null,
      circleDescription: isCircle ? (parsed.data.circleDescription?.trim() || null) : null,
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

    // Seed the first intention from the create-form `intention` field so the
    // community page has something to render immediately. Subsequent additions
    // flow through POST /groups/:slug/intentions. The legacy groups.intention
    // column is also written for migration safety / older read paths.
    if (isCircle && parsed.data.intention && parsed.data.intention.trim().length > 0) {
      await db.insert(circleIntentionsTable).values({
        groupId: group.id,
        title: parsed.data.intention.trim(),
        description: parsed.data.circleDescription?.trim() || null,
        createdByUserId: user.id,
        sortOrder: 0,
      });
    }

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
      const allMembers = await db.select().from(groupMembersTable)
        .where(eq(groupMembersTable.groupId, g.id));
      // Hidden admins are invisible members (pilot-designated observers),
      // so they don't count toward the community's public member tally.
      const countable = allMembers.filter(m => m.joinedAt !== null && m.role !== "hidden_admin");
      const myRole = joined.find(m => m.groupId === g.id)?.role ?? "member";
      return { ...g, memberCount: countable.length, myRole };
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

  // Every community page load hits this — four DB reads (member check,
  // roster, avatars, intentions). Wrap so a transient DB blip returns a
  // clean 500 instead of blanking the page with Express's default HTML
  // error. The inner intentions try/catch (migration fallback) stays; it
  // handles a different error class (schema-not-yet-applied).
  const slug = req.params.slug;
  try {
  const result = await requireMember(slug, user.id);
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
  const isAdminView = isAdminRole(result.member.role);

  // Lazy-init the community-wide invite token. Older communities were
  // created before we started generating this at create time, so their
  // invite token is null — which reads as "Invite link not available"
  // on the detail page. Generate one now on first admin view; members
  // don't trigger this (they don't see the token anyway).
  if (isAdminView && !result.group.inviteToken) {
    const newToken = generateToken();
    await db.update(groupsTable)
      .set({ inviteToken: newToken })
      .where(eq(groupsTable.id, result.group.id));
    result.group.inviteToken = newToken;
  }

  // Active (non-archived) intentions for circles. Sorted by sortOrder then
  // creation time so admins can eventually drag-to-reorder without losing
  // stable positioning for ties. Non-circles always return an empty array.
  let intentions: Array<{
    id: number;
    title: string;
    description: string | null;
    createdByUserId: number;
    createdAt: Date;
  }> = [];
  if (result.group.isPrayerCircle) {
    try {
      const rows = await db.select().from(circleIntentionsTable)
        .where(and(
          eq(circleIntentionsTable.groupId, result.group.id),
          isNull(circleIntentionsTable.archivedAt),
        ))
        .orderBy(asc(circleIntentionsTable.sortOrder), asc(circleIntentionsTable.createdAt));
      intentions = rows.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt,
      }));
    } catch {
      // Migration not yet applied on this instance — fall back to the legacy
      // `groups.intention` single value (mapped to a synthetic id=0 row) so
      // the UI still has something to show.
      if (result.group.intention && result.group.intention.trim().length > 0) {
        intentions = [{
          id: 0,
          title: result.group.intention,
          description: result.group.circleDescription,
          createdByUserId: result.group.createdByUserId,
          createdAt: result.group.createdAt,
        }];
      }
    }
  }

  // Filter hidden admins out of the roster for non-admin viewers. Admin-
  // level viewers still see them so they can manage / demote. The viewer's
  // own row is always included even if they're a hidden admin (so `myRole`
  // is consistent with what they find in the list).
  const visibleMembers = isAdminView
    ? members
    : members.filter(m => m.role !== "hidden_admin" || m.userId === user.id);

  res.json({
    group: {
      ...result.group,
      ...(isAdminView ? {} : { inviteToken: undefined }),
    },
    myRole: result.member.role,
    members: visibleMembers.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
      avatarUrl: avatarByEmail.get(m.email.toLowerCase()) ?? null,
    })),
    intentions,
  });
  } catch (err) {
    console.error("[groups/get] unhandled error:", { slug, userId: user.id, err });
    if (!res.headersSent) {
      res.status(500).json({ error: "Couldn't load community. Please try again." });
    }
  }
});

// GET /api/groups/:slug/metrics — community analytics dashboard
// Admin-only (scoped to this community) and beta-only for now. Surfaces
// the rough health of the community: how many members, how many prayer
// requests, how many amens, and distinct-users-praying windows.
//
// All counts are computed in a single raw-SQL round trip so adding a
// metric later doesn't balloon into 10 Drizzle queries.
router.get("/groups/:slug/metrics", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Admin gate — scoped to this specific group.
  const result = await requireAdmin(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Only group admins can view metrics" }); return; }

  // Beta gate — any beta user (admin role not required here, just presence
  // in beta_users). Keeps the feature flag consistent with the client-side
  // `useBetaStatus().isBeta` check.
  const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, user.id));
  if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
  const beta = await safeBetaLookup(u.email);
  if (!beta) { res.status(403).json({ error: "Metrics are beta only for now" }); return; }

  try {
    // A "prayer event" is one of two things logged by a member of this
    // community:
    //   1. A prayer-list completion check-in (moment_posts row with
    //      isCheckin=1 — written by prayer-mode's handleDone for every
    //      intercession the user is part of).
    //   2. An Amen tap (prayer_request_amens row — fired once per non-
    //      own request slide in prayer-mode, plus anywhere else we wire
    //      an Amen button in future).
    // We UNION both signals and dedup by (user, day), because when a
    // user walks their list they generate several rows but that's still
    // "one day of prayer" for metrics purposes.
    const q = await pool.query(`
      WITH now_range AS (
        SELECT
          date_trunc('day', now()) AS today_start,
          (date_trunc('day', now()) - interval '6 days') AS week_start
      ),
      members AS (
        -- Hidden admins are observers, not members. They don't count
        -- toward member totals, don't contribute to "people praying"
        -- buckets, and their prayer requests are not community feed
        -- items. Excluded here so every downstream metric naturally
        -- treats them as invisible.
        SELECT u.id AS user_id, LOWER(u.email) AS email_lower
        FROM users u
        JOIN group_members gm ON gm.user_id = u.id
        WHERE gm.group_id = $1
          AND gm.joined_at IS NOT NULL
          AND gm.role <> 'hidden_admin'
      ),
      -- Every userToken (across every moment) belonging to a member of
      -- this community. moment_posts is keyed by userToken, so we need
      -- this join to resolve posts back to users.
      member_tokens AS (
        SELECT t.user_token, m.user_id
        FROM moment_user_tokens t
        JOIN members m ON LOWER(t.email) = m.email_lower
      ),
      member_requests AS (
        SELECT id, created_at, owner_id
        FROM prayer_requests
        WHERE owner_id IN (SELECT user_id FROM members)
      ),
      -- Dedup "did this member pray today?" across both signals.
      prayer_days AS (
        SELECT DISTINCT user_id, day FROM (
          -- Prayer-list completions (intercession check-ins).
          SELECT mt.user_id, mp.window_date::date AS day
          FROM moment_posts mp
          JOIN member_tokens mt ON mt.user_token = mp.user_token
          WHERE mp.is_checkin = 1
            AND mp.window_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'

          UNION

          -- Explicit amens on other members' requests.
          SELECT a.user_id, a.prayed_at::date AS day
          FROM prayer_request_amens a
          WHERE a.user_id IN (SELECT user_id FROM members)
        ) _
      )
      SELECT
        (SELECT COUNT(*) FROM members)::int AS total_members,

        (SELECT COUNT(*) FROM member_requests)::int AS prayer_requests_total,
        (SELECT COUNT(*) FROM member_requests, now_range WHERE created_at >= today_start)::int AS prayer_requests_today,
        (SELECT COUNT(*) FROM member_requests, now_range WHERE created_at >= week_start)::int AS prayer_requests_week,

        -- "Times prayed" = sum of (user, day) pairs. Five amens in one
        -- afternoon still count as one day of prayer.
        (SELECT COUNT(*) FROM prayer_days)::int AS times_prayed_total,
        (SELECT COUNT(*) FROM prayer_days, now_range WHERE day >= today_start::date)::int AS times_prayed_today,
        (SELECT COUNT(*) FROM prayer_days, now_range WHERE day >= week_start::date)::int AS times_prayed_week,

        -- Distinct users who have prayed in each window.
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days, now_range WHERE day >= today_start::date)::int AS prayed_today,
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days, now_range WHERE day >= week_start::date)::int AS prayed_week,
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days)::int AS prayed_all_time
    `, [result.group.id]);
    const row = q.rows[0] ?? {};
    res.json({
      groupName: result.group.name,
      totalMembers: Number(row.total_members ?? 0),

      prayedToday: Number(row.prayed_today ?? 0),
      prayedThisWeek: Number(row.prayed_week ?? 0),
      prayedAllTime: Number(row.prayed_all_time ?? 0),

      prayerRequestsTotal: Number(row.prayer_requests_total ?? 0),
      prayerRequestsToday: Number(row.prayer_requests_today ?? 0),
      prayerRequestsThisWeek: Number(row.prayer_requests_week ?? 0),

      // "times prayed" — one amen per user per day
      timesPrayedTotal: Number(row.times_prayed_total ?? 0),
      timesPrayedToday: Number(row.times_prayed_today ?? 0),
      timesPrayedThisWeek: Number(row.times_prayed_week ?? 0),
    });
  } catch (err) {
    console.error("[groups/metrics] query failed:", err);
    res.status(500).json({ error: "Couldn't load metrics" });
  }
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
    // Prayer-circle edits. `isPrayerCircle` is toggleable after creation,
    // but turning it on without an intention is rejected; turning it off
    // clears `intention` and `circleDescription` server-side so the detail
    // page no longer renders them.
    isPrayerCircle: z.boolean().optional(),
    intention: z.string().max(500).optional().or(z.literal("")),
    circleDescription: z.string().max(2000).optional().or(z.literal("")),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const updates: Record<string, any> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.emoji !== undefined) updates.emoji = parsed.data.emoji || null;
  if (parsed.data.calendarUrl !== undefined) updates.calendarUrl = parsed.data.calendarUrl || null;

  // Circle toggle logic. Compose the effective-after-update values so we
  // can enforce "intention required when circle is on" regardless of which
  // fields the client sent in this request. Either the legacy groups.intention
  // column or at least one active circle_intentions row satisfies the check —
  // the multi-intention redesign moved the source of truth into that table,
  // so a circle with intentions there but a null legacy column is valid.
  const nextIsCircle = parsed.data.isPrayerCircle ?? result.group.isPrayerCircle;
  const nextIntention = parsed.data.intention !== undefined
    ? (parsed.data.intention.trim() || null)
    : result.group.intention;
  let hasActiveIntentionRow = false;
  if (nextIsCircle) {
    try {
      const existing = await db.select({ id: circleIntentionsTable.id })
        .from(circleIntentionsTable)
        .where(and(
          eq(circleIntentionsTable.groupId, result.group.id),
          isNull(circleIntentionsTable.archivedAt),
        ))
        .limit(1);
      hasActiveIntentionRow = existing.length > 0;
    } catch {
      hasActiveIntentionRow = false;
    }
  }
  if (nextIsCircle && !hasActiveIntentionRow && (!nextIntention || nextIntention.length === 0)) {
    res.status(400).json({ error: "Prayer circles require an intention" });
    return;
  }
  if (parsed.data.isPrayerCircle !== undefined) updates.isPrayerCircle = parsed.data.isPrayerCircle;
  if (parsed.data.intention !== undefined) updates.intention = nextIntention;
  if (parsed.data.circleDescription !== undefined) {
    updates.circleDescription = parsed.data.circleDescription.trim() || null;
  }
  // Turning the circle off clears the circle-only fields so the detail
  // page immediately reverts to a normal group view.
  if (parsed.data.isPrayerCircle === false) {
    updates.intention = null;
    updates.circleDescription = null;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(groupsTable).set(updates).where(eq(groupsTable.id, result.group.id));
  }

  // If this PATCH turns the circle on (or was already on) and an `intention`
  // was supplied, mirror it into `circle_intentions` when there isn't an
  // active one yet. Keeps the legacy form usable for circle-first-creation
  // without producing duplicate cards on every subsequent settings save.
  if (nextIsCircle && parsed.data.intention !== undefined && nextIntention) {
    try {
      const existing = await db.select({ id: circleIntentionsTable.id })
        .from(circleIntentionsTable)
        .where(and(
          eq(circleIntentionsTable.groupId, result.group.id),
          isNull(circleIntentionsTable.archivedAt),
        ));
      if (existing.length === 0) {
        await db.insert(circleIntentionsTable).values({
          groupId: result.group.id,
          title: nextIntention,
          description: parsed.data.circleDescription?.trim() || null,
          createdByUserId: user.id,
          sortOrder: 0,
        });
      }
    } catch (err) {
      console.error("PATCH circle intention seed error:", err);
    }
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
      // Optional per-person role. "admin" is open to all current admins;
      // "hidden_admin" is pilot-gated (see check below). Unspecified → "member".
      role: z.enum(["member", "admin", "hidden_admin"]).optional(),
    })).min(1).max(50),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  // If any requested role is "hidden_admin", the inviting admin must also
  // be a pilot (beta) user. This gate keeps hidden-admin designation
  // reserved for people we've explicitly onboarded as pilots.
  const wantsHiddenAdmin = parsed.data.people.some(p => p.role === "hidden_admin");
  if (wantsHiddenAdmin && !(await isBetaUser(user.id))) {
    res.status(403).json({ error: "Only pilot users can designate hidden admins" });
    return;
  }

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
      role: person.role ?? "member",
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
  // This is the launch-day landing-page entry point — every visitor who
  // clicks an invite link hits here pre-auth. Wrap the whole handler so
  // a transient DB hiccup returns a clean 500 that the client can render
  // as the "Invalid invite" card, rather than bubbling to Express's
  // default HTML error page and looking like a hard crash.
  try {
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
        sql`${groupMembersTable.role} <> 'hidden_admin'`,
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
        // Hidden admins are invisible observers — not part of the public
        // member count or preview shown on the invite landing page.
        sql`${groupMembersTable.role} <> 'hidden_admin'`,
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
  } catch (err) {
    console.error("[groups/invite-lookup] unhandled error:", { slug, err });
    if (!res.headersSent) {
      res.status(500).json({ error: "Couldn't load invite. Please try again." });
    }
  }
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
  // Launch-day join wave routinely surfaces edge cases (expired sessions,
  // duplicate membership races, unreachable SMTP for notify-admins). Wrap
  // the whole handler body so one unexpected throw returns a clean 500
  // instead of a 200-then-crash, and we get a single log line with the
  // slug + acting user for forensics. Individual branches still
  // short-circuit with their own status codes above the catch.
  const slug = String(req.params.slug ?? "");
  try {
  const token = (req.query.token as string) || req.body?.token;
  if (!token) { res.status(400).json({ error: "Token required" }); return; }

  // Express's typing narrows less precisely once middleware is composed, so
  // we read :slug as a string explicitly (the route literal guarantees it).
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
    }, group.slug).catch(err => console.error("[groups/join] notify admins failed:", err));

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
  }, group.slug).catch(err => console.error("[groups/join] notify admins failed:", err));

  res.json({ ok: true, group });
  } catch (err) {
    const userId = getUser(req)?.id ?? null;
    console.error("[groups/join] unhandled error:", { slug, userId, err });
    if (!res.headersSent) {
      res.status(500).json({ error: "We couldn't complete the join. Please try again." });
    }
  }
});


// Exported so auth/register can call it after a community-invite signup
// (the join is performed inside register, not via this endpoint).
export async function notifyAdminsOfNewMember(
  groupId: number,
  groupName: string,
  joiner: { name: string; email: string },
  groupSlug?: string,
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
      inArray(groupMembersTable.role, ["admin", "hidden_admin"]),
    ));
  const userIds = adminMembers.map(a => a.userId).filter((id): id is number => id != null);
  if (userIds.length === 0) return;

  // Push to each admin. Fire-and-forget. Slug is required for the deep
  // link; if the caller didn't pass it, look it up once.
  if (!groupSlug) {
    const [g] = await db.select({ slug: groupsTable.slug }).from(groupsTable).where(eq(groupsTable.id, groupId));
    groupSlug = g?.slug;
  }
  if (groupSlug) {
    for (const adminUserId of userIds) {
      sendNewMemberPush(adminUserId, groupSlug, joiner.name).catch((err) =>
        console.warn("[groups/notify-admins] push dispatch failed:", err)
      );
    }
  }

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

  // Hidden admins are visible only to other admins. The viewer's own row
  // is always included so their client-side `myRole` stays consistent.
  const isAdminView = isAdminRole(result.member.role);
  const visibleMembers = isAdminView
    ? members
    : members.filter(m => m.role !== "hidden_admin" || m.userId === user.id);

  const memberEmails = Array.from(new Set(
    visibleMembers.map(m => m.email?.toLowerCase()).filter((e): e is string => !!e)
  ));
  const betaRows = memberEmails.length
    ? await db.select({ email: betaUsersTable.email })
        .from(betaUsersTable)
        .where(inArray(betaUsersTable.email, memberEmails))
    : [];
  const betaSet = new Set(betaRows.map(r => r.email.toLowerCase()));

  res.json({
    members: visibleMembers.map(m => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      joinedAt: m.joinedAt,
      pending: !m.joinedAt,
      isBeta: m.email ? betaSet.has(m.email.toLowerCase()) : false,
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

// PATCH /api/groups/:slug/members/:memberId/role — change a member's role
// between "member" | "admin" | "hidden_admin". Admin-gated. Designating or
// removing a "hidden_admin" role is additionally pilot-gated (only users in
// betaUsersTable can make that call). Guards against demoting the last
// visible admin so a community can never end up without a reachable admin.
router.patch("/groups/:slug/members/:memberId/role", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const memberId = parseInt(req.params.memberId, 10);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid member ID" }); return; }

  const schema = z.object({
    role: z.enum(["member", "admin", "hidden_admin"]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid role" }); return; }
  const nextRole = parsed.data.role;

  const [target] = await db.select().from(groupMembersTable).where(eq(groupMembersTable.id, memberId));
  if (!target || target.groupId !== result.group.id) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  // No-op short circuit — keeps client retry-safe.
  if (target.role === nextRole) {
    res.json({ ok: true, member: { id: target.id, role: target.role } });
    return;
  }

  // Pilot gate: either promoting INTO hidden_admin or demoting OUT of it
  // requires the acting admin to be a beta/pilot user. A non-pilot admin
  // can still shuffle members between "member" and "admin" freely.
  const touchesHiddenAdmin = nextRole === "hidden_admin" || target.role === "hidden_admin";
  if (touchesHiddenAdmin && !(await isBetaUser(user.id))) {
    res.status(403).json({ error: "Only pilot users can manage hidden admins" });
    return;
  }

  // Last-admin guard: if we're demoting an admin (either role) to "member",
  // make sure someone with admin powers will remain. Count both visible and
  // hidden admins — either is enough to keep the community reachable.
  if (isAdminRole(target.role) && nextRole === "member") {
    const remainingAdmins = await db.select({ id: groupMembersTable.id })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, result.group.id),
        inArray(groupMembersTable.role, ["admin", "hidden_admin"]),
        sql`${groupMembersTable.id} <> ${memberId}`,
      ));
    if (remainingAdmins.length === 0) {
      res.status(400).json({ error: "Can't demote the last admin" });
      return;
    }
  }

  await db.update(groupMembersTable)
    .set({ role: nextRole })
    .where(eq(groupMembersTable.id, memberId));

  res.json({ ok: true, member: { id: memberId, role: nextRole } });
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

  // New-prayer-request popup intentionally disabled.
  //
  // Admins of a community were previously shown a "A new prayer
  // request" popup whenever any member posted in the community. The
  // user flagged this as noise: "I dont need a pop up for a general
  // prayer request, but if they comment on my prayer request, or
  // write one directly to me i want to see it". Direct-to-me
  // surfaces (prayers_for, words on your own request) have their
  // own channels and aren't touched here. We keep the ack-table
  // columns + schema around so we can bring this back later with a
  // narrower trigger (e.g. only "posted while praying for YOUR
  // request" or a digest) without another migration.
  res.json({ newMembers, newPrayers: [] });
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
  try {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  // requireMember returns null if joined_at is NULL on the viewer's
  // membership row — that's a known source of "not a member" false
  // negatives when admins add people to the roster but the row never
  // gets a joined_at stamp. For this read-only endpoint we relax that:
  // any row in group_members for this group + this user counts as
  // "member enough to read the feed". Write endpoints still use the
  // stricter requireMember.
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, req.params.slug));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }
  const [membership] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, group.id), eq(groupMembersTable.userId, user.id)));
  if (!membership) {
    // Email-based fallback: the viewer's users.email matches a
    // group_members.email row (common when they were invited before
    // their account existed and the row was never back-linked).
    const [emailRow] = await db.select().from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, group.id), sql`LOWER(${groupMembersTable.email}) = LOWER(${user.email})`));
    if (!emailRow) { res.status(403).json({ error: "Not a member of this group" }); return; }
  }

  // Two kinds of requests land in a community's feed:
  //   1. Requests directly scoped to this community
  //      (prayer_requests.group_id = group.id) — created via the
  //      community-home compose bar or POST /groups/:slug/prayer-requests.
  //   2. "Global" requests from any member of this community
  //      (prayer_requests.group_id IS NULL, owned by a joined member).
  //      Before this fix, someone who typed a prayer on the prayer-wall
  //      surface got a row with group_id = null, and it silently failed
  //      to show up in their own community — the user flagged "my
  //      prayer request is not showing up in the group I am in". We
  //      treat a null-scoped request as "share with every community I
  //      belong to" so the common case of "I am in one community, I
  //      post on the prayer wall" just works without making the user
  //      pick a group every time.
  // Member resolution joins on users.email as a fallback so members
  // whose `group_members.user_id` is NULL (they joined via email
  // invite and the row was never back-linked) still contribute their
  // global requests to the wall. Previously those members' posts
  // silently missed their own community — the user flagged
  // "Anabelle's prayer request should be showing up here" because
  // Anabelle's membership row didn't have a user_id set.
  //
  // We previously also required `joined_at IS NOT NULL`, which
  // silently dropped anyone who was on the roster via invite but
  // hadn't explicitly clicked through. That caused the community
  // home to go completely empty even though several roster members
  // had active prayer requests ("NOW IT IS NOT SHOWING ANY REQUEST").
  // Being on the roster (having a row in group_members) is enough —
  // if they were invited by an admin their prayers belong on the
  // community feed. The session user themselves is guaranteed to
  // count because requireMember() above already passed.
  const joinedMemberRows = await db
    .select({
      rowUserId: groupMembersTable.userId,
      emailUserId: usersTable.id,
    })
    .from(groupMembersTable)
    .leftJoin(
      usersTable,
      sql`LOWER(${usersTable.email}) = LOWER(${groupMembersTable.email})`,
    )
    .where(eq(groupMembersTable.groupId, group.id));
  const memberUserIds = Array.from(
    new Set(
      [
        // The viewer is always a member (requireMember passed) — include
        // them explicitly so their own prayer requests always surface on
        // any community home they visit, even if their group_members row
        // happens to have a null user_id / unmatched email.
        user.id,
        ...joinedMemberRows.map(r => r.rowUserId ?? r.emailUserId),
      ].filter((id): id is number => typeof id === "number"),
    ),
  );
  console.log(
    `[groups/${req.params.slug}/prayer-requests] resolved ${memberUserIds.length} member user IDs ` +
    `from ${joinedMemberRows.length} roster rows:`,
    memberUserIds,
  );

  // Hidden-admin filter — SCOPED TO THIS COMMUNITY.
  //
  // Earlier rule was global: once hidden_admin in ANY group, your
  // prayers were hidden from EVERY community feed. That's wrong —
  // a user who is a hidden_admin in Group A but a regular admin
  // (or regular member) in Group B should still have their prayer
  // requests visible in Group B. User flagged: "If someone is just
  // an admin, we want their prayer request to show. Just not if
  // they are a hidden admin."
  //
  // New rule: only hide prayers from owners whose role IN THIS
  // specific community is hidden_admin. Cross-community hidden
  // status doesn't leak.
  const hiddenAdminRows = await db
    .select({
      rowUserId: groupMembersTable.userId,
      emailUserId: usersTable.id,
    })
    .from(groupMembersTable)
    .leftJoin(
      usersTable,
      sql`LOWER(${usersTable.email}) = LOWER(${groupMembersTable.email})`,
    )
    .where(and(
      eq(groupMembersTable.groupId, group.id),
      eq(groupMembersTable.role, "hidden_admin"),
    ));
  const hiddenAdminUserIds = new Set(
    hiddenAdminRows
      .map(r => r.rowUserId ?? r.emailUserId)
      .filter((id): id is number => typeof id === "number"),
  );
  // NOTE: no viewer exemption here. On THIS community's feed, a
  // hidden admin's own prayer must not appear — not even to
  // themselves — or the "hidden" label is a lie. If the viewer is
  // a hidden admin they still see their own prayer on their
  // personal /api/prayer-requests feed (handled separately there).

  // Community wall is scoped to this community's members.
  // Two inclusion rules:
  //   1. group_id = this group's id  (posted directly into this
  //      community via the community compose bar).
  //   2. owner is a joined member of this community  (any active
  //      prayer request from a member, regardless of which surface
  //      they posted it on — personal prayer-list (group_id NULL)
  //      or another community they're also in). Keeps non-members
  //      out (the original concern) while making sure every
  //      member's active prayer surfaces in their community's
  //      dashboard. Previously rule #2 also required group_id IS
  //      NULL, which silently dropped member prayers posted into
  //      other communities — user flagged that members visible on
  //      the home dashboard's Prayer Requests section were missing
  //      from their community detail page.
  // Postgres note: `sql\`... = ANY(${jsArray})\`` doesn't render a
  // proper array param — Drizzle expands the JS array into a
  // row-constructor `($2, $3, ...)` and Postgres rejects it at
  // runtime ("operator does not exist: integer = record"). That's
  // been silently 500-ing this endpoint since the member-scoped
  // query was added. Using `inArray()` produces the canonical
  // `owner_id IN ($2, $3, ...)` which is what we actually want.
  // Expired requests (past expiresAt with no renewal) drop off the
  // community dashboard for everyone — including the owner. The owner
  // can still see and renew their expired request from /prayer-list,
  // which intentionally keeps them visible there.
  const notExpired = or(
    isNull(prayerRequestsTable.expiresAt),
    gt(prayerRequestsTable.expiresAt, new Date()),
  );

  const rows = memberUserIds.length > 0
    ? await db
        .select({
          id: prayerRequestsTable.id,
          body: prayerRequestsTable.body,
          ownerId: prayerRequestsTable.ownerId,
          createdByName: prayerRequestsTable.createdByName,
          isAnonymous: prayerRequestsTable.isAnonymous,
          createdAt: prayerRequestsTable.createdAt,
          ownerDisplayName: usersTable.name,
          ownerAvatarUrl: usersTable.avatarUrl,
        })
        .from(prayerRequestsTable)
        .leftJoin(usersTable, eq(prayerRequestsTable.ownerId, usersTable.id))
        .where(and(
          sql`${prayerRequestsTable.closedAt} IS NULL`,
          notExpired,
          or(
            eq(prayerRequestsTable.groupId, group.id),
            inArray(prayerRequestsTable.ownerId, memberUserIds),
          ),
        ))
        .orderBy(desc(prayerRequestsTable.createdAt))
    : await db
        .select({
          id: prayerRequestsTable.id,
          body: prayerRequestsTable.body,
          ownerId: prayerRequestsTable.ownerId,
          createdByName: prayerRequestsTable.createdByName,
          isAnonymous: prayerRequestsTable.isAnonymous,
          createdAt: prayerRequestsTable.createdAt,
          ownerDisplayName: usersTable.name,
          ownerAvatarUrl: usersTable.avatarUrl,
        })
        .from(prayerRequestsTable)
        .leftJoin(usersTable, eq(prayerRequestsTable.ownerId, usersTable.id))
        .where(and(
          sql`${prayerRequestsTable.closedAt} IS NULL`,
          notExpired,
          eq(prayerRequestsTable.groupId, group.id),
        ))
        .orderBy(desc(prayerRequestsTable.createdAt));

  // Drop any prayer owned by a hidden admin (computed above).
  // hiddenAdminUserIds already excludes the viewer, so they always
  // see their own prayers even if they hold hidden_admin themselves.
  const visibleRows = rows.filter(r => !hiddenAdminUserIds.has(r.ownerId));

  // Word count is decorative on the community feed — reusable hook for
  // "how much prayer has this received?" once we implement it. For now,
  // return 0 so the UI renders consistently.
  const requests = visibleRows.map(r => ({
    id: r.id,
    body: r.body,
    ownerName: r.isAnonymous ? null : (r.createdByName ?? r.ownerDisplayName),
    // Anonymous requests suppress the avatar too — the UI renders
    // an initials bubble when ownerAvatarUrl is null.
    ownerAvatarUrl: r.isAnonymous ? null : (r.ownerAvatarUrl ?? null),
    wordCount: 0,
    isOwnRequest: r.ownerId === user.id,
    isAnonymous: r.isAnonymous,
    createdAt: r.createdAt,
  }));

  console.log(
    `[groups/${req.params.slug}/prayer-requests] returning ${requests.length} requests` +
    (requests.length > 0 ? ` — owners: ${rows.map(r => r.ownerId).join(", ")}` : ""),
  );

  // Debug dump: hit /api/groups/<slug>/prayer-requests?debug=1 to see
  // exactly what the server computed — roster rows, resolved member
  // user IDs, and every non-closed prayer request in the db that
  // should-or-shouldn't match. Takes the loop out of "push and hope"
  // when a community home appears empty.
  if (req.query["debug"] === "1") {
    const allOpen = await db
      .select({
        id: prayerRequestsTable.id,
        ownerId: prayerRequestsTable.ownerId,
        groupId: prayerRequestsTable.groupId,
        body: prayerRequestsTable.body,
        createdAt: prayerRequestsTable.createdAt,
        closedAt: prayerRequestsTable.closedAt,
        expiresAt: prayerRequestsTable.expiresAt,
      })
      .from(prayerRequestsTable)
      .where(sql`${prayerRequestsTable.closedAt} IS NULL`)
      .orderBy(desc(prayerRequestsTable.createdAt));
    res.json({
      requests,
      debug: {
        groupId: group.id,
        slug: req.params.slug,
        sessionUserId: user.id,
        rosterRows: joinedMemberRows,
        memberUserIds,
        matchingRequestCount: requests.length,
        matchingRequestOwnerIds: visibleRows.map(r => r.ownerId),
        hiddenAdminUserIdsFilteredOut: Array.from(hiddenAdminUserIds),
        allOpenPrayerRequests: allOpen,
      },
    });
    return;
  }

  res.json({ requests });
  } catch (err) {
    // Surface the real error on this endpoint — the generic
    // app-level 500 handler obscures what's failing, and this
    // endpoint has been the subject of repeated "why is it empty /
    // why does it 500" debugging. The response body exposes the
    // message so it shows up in the browser directly; the full
    // stack still goes to the Railway log line.
    console.error("[groups/:slug/prayer-requests] endpoint threw:", err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    res.status(500).json({ error: `prayer-requests endpoint failed: ${message}`, stack });
  }
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

  // Admin notification on a new community prayer request is disabled
  // per product direction — admins don't need an email (or the
  // in-app popup) for every request posted in a community they
  // admin; the user described the noise explicitly. The helper
  // stays defined so we can re-enable it with narrower logic (e.g.
  // daily digest, or only for prayer circles the admin leads).

  // Push to every joined member except the author. Admins are already
  // covered by the email+push notifyAdminsOfNewPrayerRequest path; this
  // layer broadens the audience for push (email stays admin-only to
  // avoid inbox noise). Anonymous posts still notify — we just hide the
  // author name in the push body.
  (async () => {
    try {
      const members = await db.select({ userId: groupMembersTable.userId, joinedAt: groupMembersTable.joinedAt })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.groupId, group.id));
      const recipientIds = members
        .filter(m => m.joinedAt != null)
        .map(m => m.userId)
        .filter((id): id is number => id != null && id !== user.id);
      if (recipientIds.length === 0) return;
      const authorDisplay = parsed.data.isAnonymous ? null : (member.name ?? user.name);
      for (const rid of recipientIds) {
        sendNewPrayerRequestPush(rid, group.slug, authorDisplay).catch((err) =>
          console.warn("[groups] prayer-request push failed:", err)
        );
      }
    } catch (err) {
      console.warn("[groups] broad prayer-request push failed:", err);
    }
  })();

  res.json({ ok: true, id: inserted.id });
});

router.get("/groups/:slug/practices", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this group" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, req.params.slug));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  // Practices = moments whose primary group is this community OR whose
  // moment_groups junction has this community listed. The junction lets
  // one intercession show up in multiple communities' home views.
  const linkedMomentIds = await db.select({ id: momentGroupsTable.momentId })
    .from(momentGroupsTable)
    .where(eq(momentGroupsTable.groupId, group.id));
  const linkedIds = linkedMomentIds.map(r => r.id);
  const practices = await db.select().from(sharedMomentsTable)
    .where(and(
      sql`${sharedMomentsTable.state} != 'archived'`,
      linkedIds.length > 0
        ? sql`(${sharedMomentsTable.groupId} = ${group.id} OR ${sharedMomentsTable.id} = ANY(${linkedIds}))`
        : eq(sharedMomentsTable.groupId, group.id),
    ));

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

// Gatherings scoped to a community. Two inclusion paths:
//   1. `rituals.group_id` = this community's id (the new way — set
//      by the community-gathering flow).
//   2. Legacy: pre-group_id gatherings where the ritual's participant
//      list sits entirely inside this community's member roster
//      (i.e., every attendee is a joined community member and the
//      owner is too). These were created before group_id existed,
//      so they stay "unattached" in the DB — we surface them by
//      matching their participants against the current roster.
// Member-gated, reverse chronological.
router.get("/groups/:slug/gatherings", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this group" }); return; }

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, req.params.slug));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  // Current joined roster (lowercased emails).
  const rosterRows = await db
    .select({ email: groupMembersTable.email, userId: groupMembersTable.userId })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, group.id),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
    ));
  const rosterEmails = new Set(rosterRows.map(r => r.email.toLowerCase()));
  const rosterUserIds = new Set(
    rosterRows.map(r => r.userId).filter((id): id is number => typeof id === "number"),
  );

  // Path 1: explicit group_id match.
  const explicit = await db
    .select({
      id: ritualsTable.id,
      name: ritualsTable.name,
      description: ritualsTable.description,
      template: ritualsTable.template,
      rhythm: ritualsTable.rhythm,
      frequency: ritualsTable.frequency,
      dayPreference: ritualsTable.dayPreference,
      location: ritualsTable.location,
      createdAt: ritualsTable.createdAt,
    })
    .from(ritualsTable)
    .where(eq(ritualsTable.groupId, group.id))
    .orderBy(desc(ritualsTable.createdAt));

  // Path 2: legacy heuristic — rituals with null group_id whose
  // owner is a current community member AND every participant
  // (emails) is in the community roster. Non-empty participants
  // only — we don't want to pull in every tangential personal
  // ritual a member happens to own.
  const legacyCandidates = rosterUserIds.size > 0
    ? await db
        .select({
          id: ritualsTable.id,
          name: ritualsTable.name,
          description: ritualsTable.description,
          template: ritualsTable.template,
          rhythm: ritualsTable.rhythm,
          frequency: ritualsTable.frequency,
          dayPreference: ritualsTable.dayPreference,
          location: ritualsTable.location,
          createdAt: ritualsTable.createdAt,
          ownerId: ritualsTable.ownerId,
          participants: ritualsTable.participants,
        })
        .from(ritualsTable)
        .where(and(
          isNull(ritualsTable.groupId),
          inArray(ritualsTable.ownerId, Array.from(rosterUserIds)),
        ))
    : [];

  const legacy = legacyCandidates.filter((r) => {
    const parts = (r.participants as Array<{ email?: string }> | null) ?? [];
    if (parts.length === 0) return false;
    // Every listed participant must be in this community's roster.
    return parts.every((p) => {
      if (!p || typeof p.email !== "string") return false;
      return rosterEmails.has(p.email.toLowerCase());
    });
  }).map(({ ownerId, participants, ...rest }) => { void ownerId; void participants; return rest; });

  // Merge + dedupe by id, sort desc by createdAt.
  const seen = new Set<number>();
  const merged = [...explicit, ...legacy].filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Enrich each gathering with nextMeetupDate so the client can render a
  // day/time pill exactly like Sunday Services. We compute it the same way
  // /api/rituals does: streak-based next, else earliest planned future meetup.
  const ids = merged.map((g) => g.id);
  const allMeetups = ids.length > 0
    ? await db.select().from(meetupsTable).where(inArray(meetupsTable.ritualId, ids))
    : [];
  const meetupsByRitual = new Map<number, typeof meetupsTable.$inferSelect[]>();
  for (const m of allMeetups) {
    const list = meetupsByRitual.get(m.ritualId) ?? [];
    list.push(m);
    meetupsByRitual.set(m.ritualId, list);
  }

  const enriched = merged.map((g) => {
    const meetups = meetupsByRitual.get(g.id) ?? [];
    const { nextMeetupDate: computedNext } = computeStreak(meetups, g.frequency);
    let nextMeetupDate = computedNext;
    if (!nextMeetupDate) {
      const now = new Date();
      const planned = meetups
        .filter((m) => m.status === "planned" && new Date(m.scheduledDate) > now)
        .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
      if (planned.length > 0) {
        nextMeetupDate = new Date(planned[0].scheduledDate).toISOString();
      }
    }
    return { ...g, nextMeetupDate };
  });

  res.json({ gatherings: enriched });
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

// GET /api/groups/me/circle-intentions — flat list of every active intention
// across all prayer circles this user belongs to. Consumed by the prayer-mode
// slideshow so community intentions surface alongside intercessions + prayer
// requests. Returns an empty list if the table isn't migrated yet or the user
// is in no circles — never throws.
router.get("/groups/me/circle-intentions", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    // Circles this user belongs to. Match via user id; legacy email-only rows
    // get picked up wherever we stitch userId on signup.
    const rows = await db.select({
      groupId: groupsTable.id,
      groupName: groupsTable.name,
      groupSlug: groupsTable.slug,
      groupEmoji: groupsTable.emoji,
      legacyIntention: groupsTable.intention,
    })
      .from(groupMembersTable)
      .innerJoin(groupsTable, eq(groupMembersTable.groupId, groupsTable.id))
      .where(and(
        eq(groupsTable.isPrayerCircle, true),
        eq(groupMembersTable.userId, user.id),
      ));

    if (rows.length === 0) { res.json({ intentions: [] }); return; }

    const groupIds = rows.map(r => r.groupId);
    let active: Array<{ id: number; groupId: number; title: string; description: string | null }> = [];
    try {
      active = await db.select({
        id: circleIntentionsTable.id,
        groupId: circleIntentionsTable.groupId,
        title: circleIntentionsTable.title,
        description: circleIntentionsTable.description,
      }).from(circleIntentionsTable)
        .where(and(
          inArray(circleIntentionsTable.groupId, groupIds),
          isNull(circleIntentionsTable.archivedAt),
        ))
        .orderBy(asc(circleIntentionsTable.sortOrder), asc(circleIntentionsTable.createdAt));
    } catch {
      active = [];
    }

    // Flatten with group context. Fall back to the legacy groups.intention
    // value for circles with no active rows yet (migration not yet run, or
    // all rows archived) so the slideshow still has something to pray.
    const out: Array<{
      id: number;
      title: string;
      description: string | null;
      groupId: number;
      groupName: string;
      groupSlug: string;
      groupEmoji: string | null;
    }> = [];
    for (const g of rows) {
      const forGroup = active.filter(a => a.groupId === g.groupId);
      if (forGroup.length > 0) {
        for (const a of forGroup) {
          out.push({
            id: a.id,
            title: a.title,
            description: a.description,
            groupId: g.groupId,
            groupName: g.groupName,
            groupSlug: g.groupSlug,
            groupEmoji: g.groupEmoji,
          });
        }
      } else if (g.legacyIntention && g.legacyIntention.trim().length > 0) {
        out.push({
          id: 0,
          title: g.legacyIntention,
          description: null,
          groupId: g.groupId,
          groupName: g.groupName,
          groupSlug: g.groupSlug,
          groupEmoji: g.groupEmoji,
        });
      }
    }

    res.json({ intentions: out });
  } catch (err) {
    console.error("GET /api/groups/me/circle-intentions error:", err);
    res.json({ intentions: [] });
  }
});

// ─── Prayer Circle: intentions ──────────────────────────────────────────────
// Each circle can hold many intentions at once. Members see them as stacked
// cards on the community page and through the daily bell. Creation is shaped
// like an intercession: a short `title` (the prayer) plus an optional
// `description` for context. Any member can add; an intention's author or a
// circle admin can archive it (soft delete so history survives).

// GET /api/groups/:slug/intentions — list active intentions (member-gated)
router.get("/groups/:slug/intentions", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const result = await requireMember(req.params.slug, user.id);
    if (!result) { res.status(404).json({ error: "Group not found" }); return; }
    if (!result.group.isPrayerCircle) { res.json({ intentions: [] }); return; }

    const rows = await db.select().from(circleIntentionsTable)
      .where(and(
        eq(circleIntentionsTable.groupId, result.group.id),
        isNull(circleIntentionsTable.archivedAt),
      ))
      .orderBy(asc(circleIntentionsTable.sortOrder), asc(circleIntentionsTable.createdAt));

    res.json({
      intentions: rows.map(r => ({
        id: r.id,
        title: r.title,
        description: r.description,
        createdByUserId: r.createdByUserId,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("GET /api/groups/:slug/intentions error:", err);
    res.json({ intentions: [] });
  }
});

// POST /api/groups/:slug/intentions — add a new intention (member-gated)
router.post("/groups/:slug/intentions", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }
  if (!result.group.isPrayerCircle) {
    res.status(400).json({ error: "This group is not a prayer circle" }); return;
  }

  const schema = z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(2000).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }

  const [row] = await db.insert(circleIntentionsTable).values({
    groupId: result.group.id,
    title: parsed.data.title.trim(),
    description: parsed.data.description?.trim() || null,
    createdByUserId: user.id,
    sortOrder: 0,
  }).returning();

  res.json({
    intention: {
      id: row.id,
      title: row.title,
      description: row.description,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
    },
  });
});

// DELETE /api/groups/:slug/intentions/:id — archive an intention. The author
// can archive their own; circle admins can archive any. Soft-delete via
// `archivedAt` so the row remains for future reflection / audit.
router.delete("/groups/:slug/intentions/:id", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [row] = await db.select().from(circleIntentionsTable)
    .where(and(
      eq(circleIntentionsTable.id, id),
      eq(circleIntentionsTable.groupId, result.group.id),
    ));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const isAdmin = isAdminRole(result.member.role);
  if (!isAdmin && row.createdByUserId !== user.id) {
    res.status(403).json({ error: "You can only archive your own intentions" }); return;
  }

  await db.update(circleIntentionsTable)
    .set({ archivedAt: new Date() })
    .where(eq(circleIntentionsTable.id, id));
  res.json({ ok: true });
});

// ─── Prayer Circle: daily focus ─────────────────────────────────────────────
// Members see and contribute to "Praying today" on the circle page and
// through the daily bell. Focus entries are per-day — at end of day they
// remain as history but the default view on the circle page is today.
//
// Date handling: a focus row's `focusDate` is stored as YYYY-MM-DD in the
// *adder's* timezone. Reads default to the *viewer's* today in their
// timezone. Matches how bell_notifications buckets days (see bell.ts).

async function userTimezone(userId: number): Promise<string> {
  const [u] = await db.select({ timezone: usersTable.timezone }).from(usersTable).where(eq(usersTable.id, userId));
  return (u?.timezone ?? "America/New_York");
}
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

// GET /api/groups/:slug/focus?date=YYYY-MM-DD — list focus entries for a day
// (defaults to today in the viewer's timezone). Member-gated.
router.get("/groups/:slug/focus", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const result = await requireMember(req.params.slug, user.id);
    if (!result) { res.status(404).json({ error: "Group not found" }); return; }
    if (!result.group.isPrayerCircle) {
      // Non-circles never accumulate focus. Return empty so the client can
      // render without branching on group type.
      res.json({ date: null, focus: [] }); return;
    }

    const tz = await userTimezone(user.id);
    const qDate = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? req.query.date
      : todayInTz(tz);

    const rows = await db.select().from(circleDailyFocusTable)
      .where(and(
        eq(circleDailyFocusTable.groupId, result.group.id),
        eq(circleDailyFocusTable.focusDate, qDate),
      ))
      .orderBy(desc(circleDailyFocusTable.createdAt));

    // Enrich subject user + adder in one pass.
    const userIds = Array.from(new Set([
      ...rows.map(r => r.subjectUserId).filter((x): x is number => x != null),
      ...rows.map(r => r.addedByUserId),
    ]));
    const profiles = userIds.length > 0
      ? await db.select({
          id: usersTable.id,
          name: usersTable.name,
          email: usersTable.email,
          avatarUrl: usersTable.avatarUrl,
        }).from(usersTable).where(inArray(usersTable.id, userIds))
      : [];
    const profileById = new Map(profiles.map(p => [p.id, p]));

    const focus = rows.map(r => {
      const subject = r.subjectUserId != null ? profileById.get(r.subjectUserId) ?? null : null;
      const addedBy = profileById.get(r.addedByUserId) ?? null;
      return {
        id: r.id,
        focusType: r.focusType,
        subject: subject && {
          userId: subject.id, name: subject.name, avatarUrl: subject.avatarUrl,
        },
        subjectText: r.subjectText,
        notes: r.notes,
        addedBy: addedBy ? { name: addedBy.name, email: addedBy.email } : null,
        createdAt: r.createdAt,
      };
    });

    res.json({ date: qDate, focus });
  } catch (err) {
    console.error("GET /api/groups/:slug/focus error:", err);
    res.json({ date: null, focus: [] });
  }
});

// POST /api/groups/:slug/focus — any member can add a focus entry for today
// in the adder's timezone. `focusType` determines whether the subject is
// a Phoebe user (subjectUserId) or free text (subjectText).
router.post("/groups/:slug/focus", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }
  if (!result.group.isPrayerCircle) {
    res.status(400).json({ error: "This group is not a prayer circle" }); return;
  }

  const schema = z.object({
    focusType: z.enum(["person", "situation", "cause", "custom"]),
    subjectUserId: z.number().int().positive().optional(),
    subjectText: z.string().min(1).max(280).optional(),
    notes: z.string().max(1000).optional(),
  }).refine(
    (d) => (d.focusType === "person")
      ? (d.subjectUserId != null || (d.subjectText && d.subjectText.trim().length > 0))
      : (d.subjectText != null && d.subjectText.trim().length > 0),
    { message: "Every focus entry needs a subject" },
  );
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  // If subjectUserId is given, sanity-check the user exists so we don't
  // store a dangling FK-style id (the column is ON DELETE SET NULL, but
  // catching at insert-time surfaces a clearer error).
  if (parsed.data.subjectUserId != null) {
    const [u] = await db.select({ id: usersTable.id }).from(usersTable)
      .where(eq(usersTable.id, parsed.data.subjectUserId));
    if (!u) { res.status(400).json({ error: "Subject not found" }); return; }
  }

  const tz = await userTimezone(user.id);
  const [row] = await db.insert(circleDailyFocusTable).values({
    groupId: result.group.id,
    focusDate: todayInTz(tz),
    focusType: parsed.data.focusType,
    subjectUserId: parsed.data.subjectUserId ?? null,
    subjectText: parsed.data.subjectText?.trim() ?? null,
    addedByUserId: user.id,
    notes: parsed.data.notes?.trim() || null,
  }).returning();

  res.json({ focus: row });
});

// DELETE /api/groups/:slug/focus/:id — remove a focus entry. The adder can
// remove their own; a group admin can remove any.
router.delete("/groups/:slug/focus/:id", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [row] = await db.select().from(circleDailyFocusTable)
    .where(and(
      eq(circleDailyFocusTable.id, id),
      eq(circleDailyFocusTable.groupId, result.group.id),
    ));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const isAdmin = isAdminRole(result.member.role);
  if (!isAdmin && row.addedByUserId !== user.id) {
    res.status(403).json({ error: "You can only remove your own additions" }); return;
  }

  await db.delete(circleDailyFocusTable).where(eq(circleDailyFocusTable.id, id));
  res.json({ ok: true });
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

    // Also create the full users row if this email has never been seen.
    // Admins asked for this so invited pilot users can be added to
    // communities / referenced in Garden-style UI before they've even
    // logged in themselves. When the real person signs up later, the
    // Google auth upsert (routes/auth.ts) matches by email and links
    // their Google ID to the existing row — no dup account created.
    let userAccountCreated = false;
    {
      const [byEmail] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, emailLower));
      if (!byEmail) {
        const display = parsed.data.name?.trim() || emailLower.split("@")[0];
        await db.insert(usersTable).values({
          name: display,
          email: emailLower,
        });
        userAccountCreated = true;
      }
    }

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

    res.json({ user: betaUser, userAccountCreated });
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

// ─── GET /api/beta/bells ────────────────────────────────────────────────────
// Admin-only overview of every user's daily bell status:
//   - bellEnabled: did they ever turn the bell on?
//   - dailyBellTime + timezone: what time (and local tz) it's scheduled for
//   - hasCalendarEvent: whether a Google Calendar event is currently attached
//   - lastSentAt: the most recent bell_notifications.sent_at for this user
//   - lastSentDate: bell_date string on that row (useful cross-TZ)
//
// We read the bell columns via raw SQL because bell columns are managed by
// the startup migration (not the Drizzle insert path) and older environments
// occasionally drift, which has bitten us before in bellSender.ts. Raw SQL
// is resilient to that; if the column genuinely doesn't exist, we fail open
// with an empty list rather than 500ing the admin UI.
router.get("/beta/bells", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Beta admin access required" });
      return;
    }

    // One round-trip: left join users → latest bell_notifications row per user.
    // The DISTINCT ON (user_id) + ORDER BY sent_at DESC pattern gives us the
    // single most-recent notification per user. NULLS LAST so a user who has
    // never been sent a bell sorts after users who have.
    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.bell_enabled,
        u.daily_bell_time,
        u.timezone,
        u.bell_calendar_event_id,
        u.created_at,
        latest.sent_at AS last_sent_at,
        latest.bell_date AS last_sent_date
      FROM users u
      LEFT JOIN LATERAL (
        SELECT sent_at, bell_date
        FROM bell_notifications bn
        WHERE bn.user_id = u.id
        ORDER BY bn.sent_at DESC NULLS LAST, bn.created_at DESC
        LIMIT 1
      ) latest ON TRUE
      ORDER BY
        u.bell_enabled DESC,
        latest.sent_at DESC NULLS LAST,
        u.created_at DESC
    `);

    const baseUsers = result.rows.map((r: Record<string, unknown>) => ({
      id: r["id"] as number,
      email: r["email"] as string,
      name: (r["name"] as string | null) ?? null,
      bellEnabled: r["bell_enabled"] === true,
      dailyBellTime: (r["daily_bell_time"] as string | null) ?? null,
      timezone: (r["timezone"] as string | null) ?? null,
      hasCalendarEvent: r["bell_calendar_event_id"] != null,
      bellCalendarEventId: (r["bell_calendar_event_id"] as string | null) ?? null,
      lastSentAt: r["last_sent_at"] as string | null,
      lastSentDate: (r["last_sent_date"] as string | null) ?? null,
      createdAt: r["created_at"] as string,
    }));

    // ── Resolve invite status per user by polling the scheduler calendar.
    //
    // We only query Google for users that actually have a stored event ID —
    // there's no point asking about users who were never invited. Everyone
    // else gets a synthesized status based on what we know locally:
    //   - bellEnabled + no event ID          → "ics-pending" (ICS invite
    //                                           emailed, user hasn't added
    //                                           it to a calendar we can see)
    //   - bellEnabled + event ID + RSVP      → accepted / tentative /
    //                                           declined / needsAction
    //   - bellEnabled + event ID + lookup    → "unknown" (Google 5xx / 404;
    //     fails                                  don't misreport as declined)
    //   - !bellEnabled + event ID            → "stale" (shouldn't really
    //                                           happen, but surface it)
    //   - !bellEnabled + no event ID         → "none"
    //
    // Parallelised across users. Each inner lookup is try/catch-wrapped so
    // a single hung/misbehaving event can't tank the whole admin page —
    // individual failures bubble up as "unknown" rather than rejecting.
    type InviteStatus =
      | "none"
      | "ics-pending"
      | "needsAction"
      | "accepted"
      | "tentative"
      | "declined"
      | "stale"
      | "unknown";

    const inviteStatuses = await Promise.all(
      baseUsers.map(async (u): Promise<InviteStatus> => {
        if (!u.bellCalendarEventId) {
          return u.bellEnabled ? "ics-pending" : "none";
        }
        try {
          const attendees = await getCalendarEventAttendees(u.id, u.bellCalendarEventId);
          if (!attendees) return "unknown";
          const me = attendees.find(a => a.email.toLowerCase() === u.email.toLowerCase());
          const rsvp = me?.responseStatus;
          if (rsvp === "accepted") return "accepted";
          if (rsvp === "tentative") return "tentative";
          if (rsvp === "declined") return "declined";
          // No matching attendee row, or responseStatus missing —
          // treat as an invite that hasn't been acted on.
          return "needsAction";
        } catch {
          return "unknown";
        }
      }),
    );

    const users = baseUsers.map((u, i) => {
      const inviteStatus = inviteStatuses[i] ?? "unknown";
      // Strip the internal-only bellCalendarEventId so we don't leak raw
      // Google event IDs to the admin client.
      const { bellCalendarEventId: _drop, ...publicRow } = u;
      return { ...publicRow, inviteStatus };
    });

    // Summary counts for the header strip — computed server-side so the
    // frontend never has to iterate the full list just to render a chip.
    const summary = {
      totalUsers: users.length,
      bellsActive: users.filter(u => u.bellEnabled).length,
      sentToday: users.filter(u => {
        if (!u.lastSentAt || !u.timezone) return false;
        try {
          const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: u.timezone })
            .format(new Date());
          return u.lastSentDate === todayLocal;
        } catch { return false; }
      }).length,
    };

    res.json({ users, summary });
  } catch (err) {
    console.error("GET /api/beta/bells error:", err);
    res.json({ users: [], summary: { totalUsers: 0, bellsActive: 0, sentToday: 0 } });
  }
});

// ── Shared admin-invite helper ─────────────────────────────────────────────
// All three admin bell-invite flows (single user, bulk new, bulk resend)
// should deliver the same thing: a real Google Calendar event created from
// the Phoebe scheduler account with the user listed as an attendee. That's
// what makes the invite show up as a proper "Phoebe invited you" email with
// RSVP buttons, and what gives us a bell_calendar_event_id to poll for
// acceptance later (which is what the "On calendar" chip on the admin page
// actually depends on).
//
// If Google Calendar creation fails for any reason (scheduler auth, quota,
// the user's mailbox rejecting the invite), we fall back to mailing a raw
// ICS so the user still has *some* way to add the bell to their calendar —
// that's the same degraded path the PUT /api/bell/preferences endpoint uses
// when a user turns their own bell on. Returns what we actually managed to
// deliver so the caller can store the event ID and log a sensible summary.
async function sendAdminBellInvite(
  u: { id: number; email: string; timezone: string | null },
  dailyBellTime: string, // "HH:MM" in u.timezone
): Promise<{ calendarEventId: string | null; icsSent: boolean; invited: boolean }> {
  const tz = u.timezone ?? "America/New_York";
  const match = /^(\d{2}):(\d{2})$/.exec(dailyBellTime);
  const hh = match ? parseInt(match[1]!, 10) : 7;
  const mm = match ? parseInt(match[2]!, 10) : 0;

  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  const startLocalStr = `${todayStr}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  // 5-minute window — mirrors the user-initiated bell flow in bell.ts.
  const endMm = mm + 5;
  const endHh = hh + Math.floor(endMm / 60);
  const endLocalStr = `${todayStr}T${String(endHh % 24).padStart(2, "0")}:${String(endMm % 60).padStart(2, "0")}:00`;

  const APP_URL_LOCAL = process.env["APP_URL"] ?? "https://withphoebe.app";
  const communityName = await getUserPrimaryCommunityName(u.id);
  const withLine = communityName
    ? `Set up your daily bell to pray with ${communityName}.`
    : "A daily time to pause and pray with your community.";
  const description = [withLine, "", `Open Phoebe: ${APP_URL_LOCAL}`].join("\n");

  // Preferred path: real Google Calendar event with RSVP tracking.
  let calendarEventId: string | null = null;
  try {
    calendarEventId = await createCalendarEvent(u.id, {
      summary: "🔔 Daily Bell — Phoebe",
      description,
      startDate: new Date(),
      startLocalStr,
      endLocalStr,
      attendees: [u.email],
      timeZone: tz,
      recurrence: ["RRULE:FREQ=DAILY"],
      colorId: "2",
      transparency: "transparent",
      reminders: [{ method: "popup", minutes: 0 }],
    });
  } catch (err) {
    console.error(`[bell] admin-invite: createCalendarEvent failed for user ${u.id}:`, err);
  }

  // Fallback: raw ICS email so the user at least has a way to add the
  // bell to their calendar manually. We only reach this path if Google
  // returned null — if it succeeded we don't want to spam a second invite.
  let icsSent = false;
  if (!calendarEventId) {
    try {
      icsSent = await sendDailyBellIcsInvite({
        to: u.email,
        userId: u.id,
        timeZone: tz,
        startLocalStr,
        endLocalStr,
        summary: "🔔 Daily Bell — Phoebe",
        description,
      });
    } catch (err) {
      console.error(`[bell] admin-invite: ICS fallback failed for user ${u.id}:`, err);
    }
  }

  return {
    calendarEventId,
    icsSent,
    invited: !!calendarEventId || icsSent,
  };
}

// Best-effort lookup of the community name to reference in a bell invite.
// Picks the earliest group the user joined — that's "their" community
// in the common case (single community per user). Returns null if they
// aren't in any community, in which case the caller should fall back
// to generic copy.
async function getUserPrimaryCommunityName(userId: number): Promise<string | null> {
  try {
    const result = await pool.query(
      `SELECT g.name
         FROM group_members gm
         JOIN groups g ON g.id = gm.group_id
        WHERE gm.user_id = $1
        ORDER BY gm.joined_at ASC NULLS LAST, g.id ASC
        LIMIT 1`,
      [userId],
    );
    const row = result.rows[0] as { name?: string } | undefined;
    return row?.name ?? null;
  } catch {
    return null;
  }
}

// ─── POST /api/beta/bells/send-invite/:userId ───────────────────────────────
// Admin action: send a 7 AM ICS calendar invite to a single user. Same
// flow as the bulk endpoint but scoped to one account — used by the
// "Send invite" button on each inactive row of the bells-admin page.
router.post("/beta/bells/send-invite/:userId", async (req, res): Promise<void> => {
  try {
    const actor = getUser(req);
    if (!actor) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isBetaAdmin(actor.id))) {
      res.status(403).json({ error: "Beta admin access required" });
      return;
    }

    const userId = Number(req.params["userId"]);
    if (!Number.isFinite(userId)) { res.status(400).json({ error: "Invalid userId" }); return; }

    const result = await pool.query(
      `SELECT id, email, name, timezone, bell_calendar_event_id FROM users WHERE id = $1`,
      [userId],
    );
    const row = result.rows[0] as {
      id: number; email: string; name: string | null;
      timezone: string | null; bell_calendar_event_id: string | null;
    } | undefined;
    if (!row) { res.status(404).json({ error: "User not found" }); return; }

    // ── Nuke any stale calendar event first ──
    // If there's already an event on file — typically a declined or
    // long-ignored invite — we delete it before creating a new one.
    // Otherwise the old event sticks around in the Phoebe scheduler's
    // calendar and keeps reporting its old RSVP. Same pattern the bulk
    // reinvite endpoint uses.
    if (row.bell_calendar_event_id) {
      try {
        await deleteCalendarEvent(row.id, row.bell_calendar_event_id);
      } catch (err) {
        console.warn(`[bell] single-invite: deleteCalendarEvent failed for user ${row.id} (continuing):`, err);
      }
      await pool.query(
        `UPDATE users SET bell_calendar_event_id = NULL WHERE id = $1`,
        [row.id],
      );
    }

    const tz = row.timezone ?? "America/New_York";
    const invite = await sendAdminBellInvite(
      { id: row.id, email: row.email, timezone: row.timezone },
      "07:00",
    );

    // Persist: enable the bell, default to 7 AM, and if the Google path
    // succeeded store the event ID so the admin UI's invite chip can
    // promote to "On calendar" once they accept.
    await pool.query(
      `UPDATE users
          SET bell_enabled = true,
              daily_bell_time = '07:00',
              timezone = COALESCE(timezone, $1),
              bell_calendar_event_id = COALESCE($2, bell_calendar_event_id)
        WHERE id = $3`,
      [tz, invite.calendarEventId, row.id],
    );

    const communityName = await getUserPrimaryCommunityName(row.id);
    console.log(
      `[bell] single-invite: user ${row.id} (${row.email}) ` +
      `google=${invite.calendarEventId ? "ok" : "—"} ics=${invite.icsSent} community=${communityName ?? "—"}`,
    );
    res.json({
      userId: row.id,
      email: row.email,
      sent: invite.invited,
      method: invite.calendarEventId ? "google" : invite.icsSent ? "ics" : "none",
      community: communityName,
    });
  } catch (err) {
    console.error("POST /api/beta/bells/send-invite/:userId error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/beta/bells/send-invites ──────────────────────────────────────
// Admin action: send a 7 AM ICS calendar invite to every user who does NOT
// have a bell enabled yet. Sets bell_enabled=true + daily_bell_time='07:00'
// for each user so the daily sender will also pick them up going forward.
//
// Returns { attempted, sent, failed, users: [{ id, email, sent }] }
router.post("/beta/bells/send-invites", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Beta admin access required" });
      return;
    }

    // Find all users without a bell
    const result = await pool.query(`
      SELECT id, email, name, timezone
      FROM users
      WHERE bell_enabled IS NOT TRUE
      ORDER BY created_at ASC
    `);

    const targets: Array<{ id: number; email: string; name: string | null; timezone: string | null }> =
      result.rows.map((r: Record<string, unknown>) => ({
        id: r["id"] as number,
        email: r["email"] as string,
        name: (r["name"] as string | null) ?? null,
        timezone: (r["timezone"] as string | null) ?? null,
      }));

    const results: Array<{ id: number; email: string; sent: boolean; method: "google" | "ics" | "none" }> = [];

    for (const u of targets) {
      try {
        const tz = u.timezone ?? "America/New_York";
        const invite = await sendAdminBellInvite(
          { id: u.id, email: u.email, timezone: u.timezone },
          "07:00",
        );

        // Enable bell + persist Google event ID if the API path succeeded.
        // This is what lets the admin UI later promote the invite chip to
        // "On calendar" once the user accepts.
        await pool.query(
          `UPDATE users
              SET bell_enabled = true,
                  daily_bell_time = '07:00',
                  timezone = COALESCE(timezone, $1),
                  bell_calendar_event_id = COALESCE($2, bell_calendar_event_id)
            WHERE id = $3`,
          [tz, invite.calendarEventId, u.id],
        );

        const method: "google" | "ics" | "none" =
          invite.calendarEventId ? "google" : invite.icsSent ? "ics" : "none";
        results.push({ id: u.id, email: u.email, sent: invite.invited, method });
        console.log(
          `[bell] bulk-invite: user ${u.id} (${u.email}) ` +
          `google=${invite.calendarEventId ? "ok" : "—"} ics=${invite.icsSent}`,
        );
      } catch (err) {
        console.error(`[bell] bulk-invite: user ${u.id} error:`, err);
        results.push({ id: u.id, email: u.email, sent: false, method: "none" });
      }
    }

    const sent = results.filter(r => r.sent).length;
    const failed = results.filter(r => !r.sent).length;
    const googleCount = results.filter(r => r.method === "google").length;
    const icsCount = results.filter(r => r.method === "ics").length;

    console.log(
      `[bell] bulk-invite complete: ${sent} sent (${googleCount} google, ${icsCount} ics), ` +
      `${failed} failed of ${targets.length} total`,
    );
    res.json({ attempted: targets.length, sent, failed, users: results });
  } catch (err) {
    console.error("POST /api/beta/bells/send-invites error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/beta/bells/resend-ics-invites ────────────────────────────────
// Admin action: re-invite every user whose bell is on but never landed on a
// Google Calendar (the rows labelled "ICS sent" on the admin page). This
// tries the proper Google Calendar path first — creating a real event from
// the Phoebe scheduler account with the user as attendee — so the user
// gets a clean "Phoebe invited you to Daily Bell" email with RSVP buttons
// and we get an event ID to track acceptance. If the Google API path fails
// we fall back to an ICS email, same as the user-initiated bell flow.
//
// Keeps each user's existing daily_bell_time / timezone — this is a resend,
// not a reset, so whatever time they originally chose is respected.
//
// Returns { attempted, sent, failed, users: [{ id, email, sent, method }] }
router.post("/beta/bells/resend-ics-invites", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Beta admin access required" });
      return;
    }

    // Everyone with a bell turned on but no Google event on file. This is
    // exactly the set the frontend labels "ICS sent" (and it's what the
    // /api/beta/bells endpoint synthesizes as inviteStatus === "ics-pending").
    const result = await pool.query(`
      SELECT id, email, name, timezone, daily_bell_time
      FROM users
      WHERE bell_enabled = true
        AND bell_calendar_event_id IS NULL
      ORDER BY created_at ASC
    `);

    type Target = {
      id: number;
      email: string;
      name: string | null;
      timezone: string | null;
      dailyBellTime: string | null;
    };
    const targets: Target[] = result.rows.map((r: Record<string, unknown>) => ({
      id: r["id"] as number,
      email: r["email"] as string,
      name: (r["name"] as string | null) ?? null,
      timezone: (r["timezone"] as string | null) ?? null,
      dailyBellTime: (r["daily_bell_time"] as string | null) ?? null,
    }));

    const results: Array<{ id: number; email: string; sent: boolean; method: "google" | "ics" | "none" }> = [];

    for (const u of targets) {
      try {
        // Respect whatever time the user originally picked. Default only
        // if the DB truly has nothing, which shouldn't happen for a row
        // with bell_enabled=true but we're belt-and-suspenders here.
        const dailyBellTime = /^\d{2}:\d{2}$/.test(u.dailyBellTime ?? "") ? u.dailyBellTime! : "07:00";
        const invite = await sendAdminBellInvite(
          { id: u.id, email: u.email, timezone: u.timezone },
          dailyBellTime,
        );

        // If Google created a real event this time, persist the event ID
        // so the admin UI's invite chip can promote past "ICS sent" on the
        // next refresh. Don't clobber on failure — if Google failed again,
        // leave the null there so this row stays in the "ICS sent" set.
        if (invite.calendarEventId) {
          await pool.query(
            `UPDATE users SET bell_calendar_event_id = $1 WHERE id = $2`,
            [invite.calendarEventId, u.id],
          );
        }

        const method: "google" | "ics" | "none" =
          invite.calendarEventId ? "google" : invite.icsSent ? "ics" : "none";
        results.push({ id: u.id, email: u.email, sent: invite.invited, method });
        console.log(
          `[bell] ics-resend: user ${u.id} (${u.email}) ` +
          `google=${invite.calendarEventId ? "ok" : "—"} ics=${invite.icsSent} time=${dailyBellTime}`,
        );
      } catch (err) {
        console.error(`[bell] ics-resend: user ${u.id} error:`, err);
        results.push({ id: u.id, email: u.email, sent: false, method: "none" });
      }
    }

    const sent = results.filter(r => r.sent).length;
    const failed = results.filter(r => !r.sent).length;
    const googleCount = results.filter(r => r.method === "google").length;
    const icsCount = results.filter(r => r.method === "ics").length;

    console.log(
      `[bell] ics-resend complete: ${sent} sent (${googleCount} google, ${icsCount} ics), ` +
      `${failed} failed of ${targets.length} total`,
    );
    res.json({ attempted: targets.length, sent, failed, users: results });
  } catch (err) {
    console.error("POST /api/beta/bells/resend-ics-invites error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/beta/bells/reinvite-pending ──────────────────────────────────
// Admin action: nuke-and-replace the calendar invite for every user whose
// bell is on but whose invite isn't live on their Google Calendar. "Live"
// means they have an accepted attendee response on the stored Phoebe
// scheduler event — anything else (needsAction, tentative, declined, no
// event at all, Google API unreachable) counts as "not on their calendar"
// and gets a fresh invite.
//
// Per-user flow:
//   1. Poll Google for the current RSVP. If "accepted" — skip (already live).
//   2. Otherwise: delete the old scheduler event if we have one on file,
//      clear bell_calendar_event_id, then call sendAdminBellInvite at the
//      user's existing daily_bell_time/timezone (preserves their chosen
//      schedule), and persist the new event ID when Google succeeds.
//
// Returns { attempted, skippedAccepted, sent, failed, users: [...] }.
// "attempted" counts only users we actually tried to reinvite; users who
// were already accepted are counted separately under skippedAccepted.
router.post("/beta/bells/reinvite-pending", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Beta admin access required" });
      return;
    }

    const result = await pool.query(`
      SELECT id, email, name, timezone, daily_bell_time, bell_calendar_event_id
      FROM users
      WHERE bell_enabled = true
      ORDER BY created_at ASC
    `);

    type Candidate = {
      id: number;
      email: string;
      name: string | null;
      timezone: string | null;
      dailyBellTime: string | null;
      bellCalendarEventId: string | null;
    };
    const candidates: Candidate[] = result.rows.map((r: Record<string, unknown>) => ({
      id: r["id"] as number,
      email: r["email"] as string,
      name: (r["name"] as string | null) ?? null,
      timezone: (r["timezone"] as string | null) ?? null,
      dailyBellTime: (r["daily_bell_time"] as string | null) ?? null,
      bellCalendarEventId: (r["bell_calendar_event_id"] as string | null) ?? null,
    }));

    const results: Array<{ id: number; email: string; sent: boolean; method: "google" | "ics" | "none" }> = [];
    let skippedAccepted = 0;

    for (const u of candidates) {
      try {
        // Live poll: is the current invite already accepted on their
        // calendar? If yes, this user is already "on calendar" — leave them
        // alone. We deliberately re-check here rather than trusting client
        // state so a button press is always against fresh reality.
        let isAccepted = false;
        if (u.bellCalendarEventId) {
          try {
            const attendees = await getCalendarEventAttendees(u.id, u.bellCalendarEventId);
            if (attendees) {
              const me = attendees.find(a => a.email.toLowerCase() === u.email.toLowerCase());
              if (me?.responseStatus === "accepted") isAccepted = true;
            }
          } catch {
            // Lookup failed — treat as "not accepted" so we reinvite.
            // Better to send a duplicate invite than to silently skip a
            // user whose bell might actually be broken.
          }
        }

        if (isAccepted) {
          skippedAccepted++;
          continue;
        }

        // Delete the stale event (best-effort — if Google returns 404
        // because it was already deleted, that's fine). We always clear
        // bell_calendar_event_id afterwards so sendAdminBellInvite starts
        // from a clean slate; otherwise the old ID would linger if the
        // new create fails and would still show the old decline/needsAction.
        if (u.bellCalendarEventId) {
          try {
            await deleteCalendarEvent(u.id, u.bellCalendarEventId);
          } catch (err) {
            console.warn(`[bell] reinvite: deleteCalendarEvent failed for user ${u.id} (continuing):`, err);
          }
          await pool.query(
            `UPDATE users SET bell_calendar_event_id = NULL WHERE id = $1`,
            [u.id],
          );
        }

        const dailyBellTime = /^\d{2}:\d{2}$/.test(u.dailyBellTime ?? "") ? u.dailyBellTime! : "07:00";
        const invite = await sendAdminBellInvite(
          { id: u.id, email: u.email, timezone: u.timezone },
          dailyBellTime,
        );

        if (invite.calendarEventId) {
          await pool.query(
            `UPDATE users SET bell_calendar_event_id = $1 WHERE id = $2`,
            [invite.calendarEventId, u.id],
          );
        }

        const method: "google" | "ics" | "none" =
          invite.calendarEventId ? "google" : invite.icsSent ? "ics" : "none";
        results.push({ id: u.id, email: u.email, sent: invite.invited, method });
        console.log(
          `[bell] reinvite: user ${u.id} (${u.email}) ` +
          `google=${invite.calendarEventId ? "ok" : "—"} ics=${invite.icsSent} time=${dailyBellTime}`,
        );
      } catch (err) {
        console.error(`[bell] reinvite: user ${u.id} error:`, err);
        results.push({ id: u.id, email: u.email, sent: false, method: "none" });
      }
    }

    const sent = results.filter(r => r.sent).length;
    const failed = results.filter(r => !r.sent).length;
    const googleCount = results.filter(r => r.method === "google").length;
    const icsCount = results.filter(r => r.method === "ics").length;

    console.log(
      `[bell] reinvite complete: ${sent} sent (${googleCount} google, ${icsCount} ics), ` +
      `${failed} failed, ${skippedAccepted} already accepted, of ${candidates.length} candidates`,
    );
    res.json({
      attempted: results.length,
      skippedAccepted,
      sent,
      failed,
      users: results,
    });
  } catch (err) {
    console.error("POST /api/beta/bells/reinvite-pending error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Service schedules (e.g. Sunday Services) ────────────────────────────────
//
// A community can have one recurring service schedule with multiple service
// times on the same weekday. Members see the schedule; only admins can edit.

// Parse/validate the times JSONB column into a typed, trimmed array. Drops
// rows with no time and caps length so a malformed PUT can't blow up the
// dashboard card.
function normalizeServiceTimes(raw: unknown): GroupServiceTime[] {
  if (!Array.isArray(raw)) return [];
  const out: GroupServiceTime[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const time = typeof rec.time === "string" ? rec.time.trim() : "";
    if (!/^\d{1,2}:\d{2}$/.test(time)) continue;
    const label = typeof rec.label === "string" ? rec.label.trim().slice(0, 80) : "";
    const location = typeof rec.location === "string" && rec.location.trim()
      ? rec.location.trim().slice(0, 120)
      : undefined;
    out.push({ label, time, ...(location ? { location } : {}) });
    if (out.length >= 12) break;
  }
  // Sort earliest → latest so every consumer gets a consistent order.
  out.sort((a, b) => a.time.localeCompare(b.time));
  return out;
}

// GET /api/groups/:slug/prayer-activity
// Returns every community member who has prayed in the last 7 days — either
// by checking in on an intercession/practice moment (`moment_posts` joined
// via `moment_user_tokens.email` → `users.email`) or by tapping Amen on a
// prayer request in this group (`prayer_request_amens`). One row per user,
// keyed on `lastPrayedAt` (max of either signal), sorted most-recent first.
//
// Consumers: the "Prayed this week" ticker on the community home tab. We
// cap at the last 7 days so the ticker stays fresh — older prayer activity
// bleeds off naturally.
router.get("/groups/:slug/prayer-activity", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const slug = String(req.params.slug ?? "");
    const result = await requireMember(slug, user.id);
    if (!result) { res.status(403).json({ error: "Not a member" }); return; }

    const groupId = result.group.id;

    // Union of two signals. We do them as two subqueries and combine in
    // memory; both are group-scoped + 7-day-windowed, so the total row
    // count stays small even for busy parishes.

    // 1. Intercession + practice check-ins (moment_posts for this group's
    //    shared moments), joined user-side via email-token → users. A
    //    moment counts for this group if its PRIMARY group_id matches
    //    this group OR if it's linked via moment_groups (multi-group
    //    intercession). Before this fix, an intercession attached to
    //    Community A but also shared with Community B showed activity
    //    only in A — the user flagged members prayer activity silently
    //    missing from B's "Prayed this week" row.
    const linkedIds = await db
      .select({ id: momentGroupsTable.momentId })
      .from(momentGroupsTable)
      .where(eq(momentGroupsTable.groupId, groupId));
    const linkedMomentIds = linkedIds.map(r => r.id);

    const momentRows = await db
      .select({
        userId: usersTable.id,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
        prayedAt: momentPostsTable.createdAt,
      })
      .from(momentPostsTable)
      .innerJoin(sharedMomentsTable, eq(momentPostsTable.momentId, sharedMomentsTable.id))
      .innerJoin(momentUserTokensTable, eq(momentPostsTable.userToken, momentUserTokensTable.userToken))
      .innerJoin(usersTable, eq(momentUserTokensTable.email, usersTable.email))
      .where(and(
        linkedMomentIds.length > 0
          ? sql`(${sharedMomentsTable.groupId} = ${groupId} OR ${sharedMomentsTable.id} = ANY(${linkedMomentIds}))`
          : eq(sharedMomentsTable.groupId, groupId),
        sql`${momentPostsTable.createdAt} > NOW() - INTERVAL '7 days'`,
      ));

    // 2. Prayer-request Amens — `prayer_request_amens.userId` already points
    //    at `users.id`, so we join the request to scope to this group.
    const amenRows = await db
      .select({
        userId: usersTable.id,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
        prayedAt: prayerRequestAmensTable.prayedAt,
      })
      .from(prayerRequestAmensTable)
      .innerJoin(prayerRequestsTable, eq(prayerRequestAmensTable.requestId, prayerRequestsTable.id))
      .innerJoin(usersTable, eq(prayerRequestAmensTable.userId, usersTable.id))
      .where(and(
        eq(prayerRequestsTable.groupId, groupId),
        sql`${prayerRequestAmensTable.prayedAt} > NOW() - INTERVAL '7 days'`,
      ));

    // Hidden admins don't count as group participants — their prayer
    // activity is hidden from the "Prayed this week" ticker just like
    // their prayer requests are hidden from the community wall.
    const hiddenAdminActivityRows = await db
      .select({
        rowUserId: groupMembersTable.userId,
        emailUserId: usersTable.id,
      })
      .from(groupMembersTable)
      .leftJoin(
        usersTable,
        sql`LOWER(${usersTable.email}) = LOWER(${groupMembersTable.email})`,
      )
      .where(eq(groupMembersTable.role, "hidden_admin"));
    const hiddenAdminActivityIds = new Set(
      hiddenAdminActivityRows
        .map(r => r.rowUserId ?? r.emailUserId)
        .filter((id): id is number => typeof id === "number"),
    );

    // Fold both sources into a map keyed on userId, tracking the latest
    // prayedAt. Drop the current viewer — the ticker reads better as
    // "others in the community" and the viewer knows what they did.
    const byUser = new Map<number, { userId: number; name: string; avatarUrl: string | null; lastPrayedAt: Date }>();
    for (const row of [...momentRows, ...amenRows]) {
      if (row.userId === user.id) continue;
      if (hiddenAdminActivityIds.has(row.userId)) continue;
      const existing = byUser.get(row.userId);
      const prayedAt = row.prayedAt instanceof Date ? row.prayedAt : new Date(row.prayedAt as any);
      if (!existing || prayedAt > existing.lastPrayedAt) {
        byUser.set(row.userId, {
          userId: row.userId,
          name: row.name,
          avatarUrl: row.avatarUrl ?? null,
          lastPrayedAt: prayedAt,
        });
      }
    }

    const users = Array.from(byUser.values())
      .sort((a, b) => b.lastPrayedAt.getTime() - a.lastPrayedAt.getTime())
      .map(u => ({
        userId: u.userId,
        name: u.name,
        avatarUrl: u.avatarUrl,
        lastPrayedAt: u.lastPrayedAt.toISOString(),
      }));

    res.json({ users });
  } catch (err) {
    console.error("GET /api/groups/:slug/prayer-activity error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/groups/:slug/service-schedule
router.get("/groups/:slug/service-schedule", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const slug = String(req.params.slug ?? "");
    const result = await requireMember(slug, user.id);
    if (!result) { res.status(403).json({ error: "Not a member" }); return; }

    const [row] = await db
      .select()
      .from(groupServiceSchedulesTable)
      .where(eq(groupServiceSchedulesTable.groupId, result.group.id));

    if (!row) {
      res.json({ schedule: null, canEdit: isAdminRole(result.member.role) });
      return;
    }

    res.json({
      schedule: {
        id: row.id,
        groupId: row.groupId,
        name: row.name,
        location: row.location ?? null,
        dayOfWeek: row.dayOfWeek,
        times: normalizeServiceTimes(row.times),
        updatedAt: row.updatedAt.toISOString(),
      },
      canEdit: isAdminRole(result.member.role),
    });
  } catch (err) {
    console.error("GET /api/groups/:slug/service-schedule error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUT /api/groups/:slug/service-schedule — admin-only upsert
router.put("/groups/:slug/service-schedule", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const slug = String(req.params.slug ?? "");
    const result = await requireAdmin(slug, user.id);
    if (!result) { res.status(403).json({ error: "Admin only" }); return; }

    const schema = z.object({
      name: z.string().min(1).max(80).optional(),
      location: z.string().max(200).nullable().optional(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      times: z.array(z.object({
        label: z.string().max(80).optional(),
        time: z.string().regex(/^\d{1,2}:\d{2}$/),
        location: z.string().max(120).optional(),
      })).max(12),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }

    const times = normalizeServiceTimes(parsed.data.times);
    const name = parsed.data.name?.trim() || "Sunday Services";
    // Trim location; treat empty string as null so the DB doesn't hold
    // whitespace that the split-flap would render as a blank slide.
    const rawLocation = parsed.data.location;
    const location = rawLocation == null
      ? null
      : (rawLocation.trim().length > 0 ? rawLocation.trim() : null);
    const dayOfWeek = parsed.data.dayOfWeek ?? 0;
    const now = new Date();

    // One row per group — upsert by groupId unique index.
    const [saved] = await db
      .insert(groupServiceSchedulesTable)
      .values({
        groupId: result.group.id,
        name,
        location,
        dayOfWeek,
        times,
        updatedByUserId: user.id,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: groupServiceSchedulesTable.groupId,
        set: { name, location, dayOfWeek, times, updatedByUserId: user.id, updatedAt: now },
      })
      .returning();

    res.json({
      schedule: {
        id: saved.id,
        groupId: saved.groupId,
        name: saved.name,
        location: saved.location ?? null,
        dayOfWeek: saved.dayOfWeek,
        times: normalizeServiceTimes(saved.times),
        updatedAt: saved.updatedAt.toISOString(),
      },
      canEdit: true,
    });
  } catch (err) {
    console.error("PUT /api/groups/:slug/service-schedule error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/groups/:slug/service-schedule — admin-only
router.delete("/groups/:slug/service-schedule", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const slug = String(req.params.slug ?? "");
    const result = await requireAdmin(slug, user.id);
    if (!result) { res.status(403).json({ error: "Admin only" }); return; }
    await db
      .delete(groupServiceSchedulesTable)
      .where(eq(groupServiceSchedulesTable.groupId, result.group.id));
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/groups/:slug/service-schedule error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/me/service-schedules — every schedule for groups I'm in (dashboard)
router.get("/me/service-schedules", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const myGroups = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.userId, user.id),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ));
    const ids = myGroups.map(g => g.groupId);
    if (ids.length === 0) { res.json({ schedules: [] }); return; }

    const rows = await db
      .select({
        id: groupServiceSchedulesTable.id,
        groupId: groupServiceSchedulesTable.groupId,
        name: groupServiceSchedulesTable.name,
        location: groupServiceSchedulesTable.location,
        dayOfWeek: groupServiceSchedulesTable.dayOfWeek,
        times: groupServiceSchedulesTable.times,
        groupName: groupsTable.name,
        groupSlug: groupsTable.slug,
        groupEmoji: groupsTable.emoji,
      })
      .from(groupServiceSchedulesTable)
      .innerJoin(groupsTable, eq(groupServiceSchedulesTable.groupId, groupsTable.id))
      .where(inArray(groupServiceSchedulesTable.groupId, ids));

    // Skip schedules with zero times — they'd render as empty cards.
    const schedules = rows
      .map(r => ({
        id: r.id,
        groupId: r.groupId,
        groupName: r.groupName,
        groupSlug: r.groupSlug,
        groupEmoji: r.groupEmoji,
        name: r.name,
        location: r.location ?? null,
        dayOfWeek: r.dayOfWeek,
        times: normalizeServiceTimes(r.times),
      }))
      .filter(s => s.times.length > 0);

    res.json({ schedules });
  } catch (err) {
    console.error("GET /api/me/service-schedules error:", err);
    res.json({ schedules: [] });
  }
});

export default router;
