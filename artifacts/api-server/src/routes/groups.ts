import { Router, type IRouter } from "express";
import { eq, and, or, asc, desc, gt, gte, lt, lte, inArray, isNull, isNotNull, ne, count, sql } from "drizzle-orm";
import {
  db,
  groupsTable,
  groupMembersTable,
  groupReflectionSourcesTable,
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
  ritualGroupsTable,
  meetupsTable,
  prayerFeedSubscriptionsTable,
  groupJoinRequestsTable,
  groupWeeklyItemsTable,
  groupWeeklyCompletionsTable,
  prescribedRoutinesTable,
  prayerSessionsTable,
  practiceCompletionTable,
  practiceLogEntriesTable,
  groupOpportunitiesTable,
  groupOpportunityInterestsTable,
} from "@workspace/db";
import { sanitizeSpec, applyRoutineSpecToUser } from "../lib/routineSpec";
import { sanitizeWeeklyPayload } from "../lib/weeklyPayload";
import type { WeeklyItemPayload } from "@workspace/db";
import { z } from "zod/v4";
import crypto from "crypto";
import { sendAnnouncementEmail, sendPrayerInviteEmail } from "../lib/email";
import { getInviteBaseUrl } from "../lib/urls";
import { rateLimit, perUserRateLimit, getClientIp } from "../lib/rate-limit";
import {
  sendPushToUsers,
  sendCommunityJoinRequestPush,
  sendCommunityJoinAcceptedPush,
  sendNewPrayerRequestPush,
  sendPrayerInvitePush,
} from "../lib/pushSender";
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

    // Resolve each joined member's email through their actual user
    // account when there is one. `group_members.email` is the address
    // an admin typed into the invite and is never re-synced afterward,
    // so it can drift from the member's real account email (a changed
    // email, gmail-dot variants, etc.). moment_user_tokens — and the
    // visibility query in GET /api/moments — key on the *account*
    // email, so deriving the token email from users.email here is what
    // keeps a community intercession actually visible to the people it
    // was created for.
    //
    // Bug this fixes: a member got the "new community intercession"
    // push (push fans out by group-member userId) but the intercession
    // never appeared, because visibility keyed on a token email that
    // was minted from a stale group_members.email and so never matched
    // their users.email.
    const joinedUserIds = [
      ...new Set(
        joined
          .map(gm => gm.userId)
          .filter((id): id is number => typeof id === "number"),
      ),
    ];
    const accountEmailById = new Map<number, string>();
    if (joinedUserIds.length > 0) {
      const userRows = await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(inArray(usersTable.id, joinedUserIds));
      for (const u of userRows) accountEmailById.set(u.id, u.email);
    }

    const groupEmailToName = new Map<string, string | null>();
    for (const gm of joined) {
      // hidden_admin members are invisible observers — they must never
      // become praying participants on the practice. Minting a moment
      // token for them would surface their name/email in every roster,
      // presence row, count, and attribution line the practice exposes
      // (GET /moments/:id and the public /moment/:t/:t share endpoint),
      // defeating the whole point of the role. A person who is
      // hidden_admin in one attached group but a normal member of
      // another is still included via that visible row, so we skip per
      // row, not per email.
      if (gm.role === "hidden_admin") continue;
      // Account email wins; fall back to the invite email only for
      // members who haven't linked a user account yet.
      const resolvedEmail =
        (gm.userId != null ? accountEmailById.get(gm.userId) : undefined) ?? gm.email;
      const key = resolvedEmail.toLowerCase();
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

    // Remove tokens for people no longer in any of the moment's
    // scopes (but never the organizer). A dual-scoped intercession (a
    // community intercession also attached to a feed) has a roster
    // that is the UNION of its group members and the feed's
    // subscribers, so widen the keep-set with the feed's subscribers
    // before pruning — otherwise we'd delete them. This reconciler is
    // the authoritative pruner for dual-scoped moments;
    // reconcileFeedPracticeMembers only adds for them.
    const keepEmails = new Set(groupEmailSet);
    if (m.prayerFeedId != null) {
      const feedSubs = await db
        .select({ email: usersTable.email })
        .from(prayerFeedSubscriptionsTable)
        .innerJoin(usersTable, eq(usersTable.id, prayerFeedSubscriptionsTable.userId))
        .where(eq(prayerFeedSubscriptionsTable.feedId, m.prayerFeedId));
      for (const s of feedSubs) keepEmails.add(s.email.toLowerCase());
    }
    const toRemove = tokens.filter(t => {
      if (t.id === organizerId) return false;
      return !keepEmails.has(t.email.toLowerCase());
    });
    if (toRemove.length > 0) {
      await db.delete(momentUserTokensTable)
        .where(inArray(momentUserTokensTable.id, toRemove.map(t => t.id)));
    }
  } catch (err) {
    console.error("[groups] reconcileGroupPracticeMembers failed for moment", momentId, err);
  }
}

// Mirror of reconcileGroupPracticeMembers for prayer feeds. A
// shared_moment with prayer_feed_id set has its participants = current
// feed subscribers. This is what makes a feed-scoped intercession
// appear on a subscriber's /api/moments + prayer-mode slideshow without
// any custom climate-specific code path.
//
// Like the group variant: organizer is preserved as the smallest-id
// token (the admin who created the intercession), and tokens are
// removed when a user unsubscribes.
export async function reconcileFeedPracticeMembers(momentId: number): Promise<void> {
  try {
    const [m] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (!m || !m.prayerFeedId) return;

    // Current subscribers of this feed, joined to users for email + name.
    const subscriberRows = await db
      .select({
        email: usersTable.email,
        name: usersTable.name,
      })
      .from(prayerFeedSubscriptionsTable)
      .innerJoin(usersTable, eq(usersTable.id, prayerFeedSubscriptionsTable.userId))
      .where(eq(prayerFeedSubscriptionsTable.feedId, m.prayerFeedId));

    const subscriberEmailToName = new Map<string, string | null>();
    for (const row of subscriberRows) {
      subscriberEmailToName.set(row.email.toLowerCase(), row.name);
    }

    const tokens = await db
      .select()
      .from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, momentId));

    // Organizer = smallest-id token (the admin who created the moment).
    // Preserved unconditionally even if they aren't a subscriber.
    const organizerId = tokens.length > 0
      ? tokens.reduce((min, t) => (t.id < min.id ? t : min), tokens[0]).id
      : null;

    const tokenEmailSet = new Set(tokens.map(t => t.email.toLowerCase()));
    const subscriberEmailSet = new Set(subscriberEmailToName.keys());

    const toAdd: { email: string; name: string }[] = [];
    for (const email of subscriberEmailSet) {
      if (!tokenEmailSet.has(email)) {
        toAdd.push({ email, name: subscriberEmailToName.get(email) ?? email });
      }
    }
    if (toAdd.length > 0) {
      await db.insert(momentUserTokensTable).values(
        toAdd.map(row => ({
          momentId,
          email: row.email,
          name: row.name,
          userToken: generateToken(),
        })),
      );
    }

    // Remove tokens for people no longer subscribed (but never the
    // organizer). Skipped when the moment is ALSO group-scoped: a
    // dual-scoped intercession's roster is the union of its feed and
    // its group. reconcileGroupPracticeMembers is the authoritative
    // pruner for dual-scoped moments (it prunes against that union);
    // here we only add, so we never delete the group's members.
    if (m.groupId == null) {
      const toRemove = tokens.filter(t => {
        if (t.id === organizerId) return false;
        return !subscriberEmailSet.has(t.email.toLowerCase());
      });
      if (toRemove.length > 0) {
        await db.delete(momentUserTokensTable)
          .where(inArray(momentUserTokensTable.id, toRemove.map(t => t.id)));
      }
    }
  } catch (err) {
    console.error("[groups] reconcileFeedPracticeMembers failed for moment", momentId, err);
  }
}

// Reconcile every moment attached to a feed — fired when a user
// subscribes or unsubscribes so all the feed's intercessions update
// their token rosters at once.
export async function reconcileAllPracticesForFeed(feedId: number): Promise<void> {
  try {
    const moments = await db
      .select({ id: sharedMomentsTable.id })
      .from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.prayerFeedId, feedId));
    await Promise.all(moments.map(m => reconcileFeedPracticeMembers(m.id)));
  } catch (err) {
    console.error("[groups] reconcileAllPracticesForFeed failed for feed", feedId, err);
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

export function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}

export async function requireMember(groupSlug: string, userId: number) {
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
export function isAdminRole(role: string): boolean {
  return role === "admin" || role === "hidden_admin";
}

export async function requireAdmin(groupSlug: string, userId: number) {
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

// POST /api/groups — create a group (builders only). Rate-limited
// because community creation triggers downstream fan-outs (calendar
// scaffolding, member invites). 10/day is comfortably more than any
// legitimate user would create in a day.
router.post("/groups", perUserRateLimit("groups_create", {
  max: 10, windowMs: 24 * 60 * 60 * 1000,
  message: "You've created a lot of communities today. Please try again tomorrow.",
}), async (req, res): Promise<void> => {
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
      // Group flavor. "contemplation" = shared contemplation goal + CAC Home.
      // null = a standard, office-shaped community.
      focus: z.enum(["contemplation"]).optional(),
      contemplationGoalMinutes: z.number().int().min(1).max(180).optional(),
    }).refine(
      (d) => !d.isPrayerCircle || (d.intention && d.intention.trim().length > 0),
      { message: "Prayer circles require an intention", path: ["intention"] },
    );
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input", details: parsed.error.issues }); return; }

    const slug = await uniqueSlug(parsed.data.name);

    const isCircle = parsed.data.isPrayerCircle === true;
    const isContemplation = parsed.data.focus === "contemplation";

    // Atomic create: group row, admin member, and (for circles) the
    // initial intention all commit together. Without the transaction,
    // a failure between the groupsTable insert and the
    // groupMembersTable insert would leave an orphan community that
    // nobody — including its creator — could access (no admin row
    // means even the creator's UI sees "you're not a member").
    const group = await db.transaction(async (tx) => {
      const [insertedGroup] = await tx.insert(groupsTable).values({
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
        focus: isContemplation ? "contemplation" : null,
        contemplationGoalMinutes: isContemplation ? (parsed.data.contemplationGoalMinutes ?? 20) : null,
        createdByUserId: user.id,
      }).returning();

      // Creator becomes admin member.
      await tx.insert(groupMembersTable).values({
        groupId: insertedGroup.id,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: "admin",
        inviteToken: generateToken(),
        joinedAt: new Date(),
      });

      // Seed the first intention from the create-form `intention` field
      // so the community page has something to render immediately.
      // Subsequent additions flow through POST /groups/:slug/intentions.
      // The legacy groups.intention column is also written for migration
      // safety / older read paths.
      if (isCircle && parsed.data.intention && parsed.data.intention.trim().length > 0) {
        await tx.insert(circleIntentionsTable).values({
          groupId: insertedGroup.id,
          title: parsed.data.intention.trim(),
          description: parsed.data.circleDescription?.trim() || null,
          createdByUserId: user.id,
          sortOrder: 0,
        });
      }

      // Contemplation communities pin their daily reflection feed to CAC, so
      // the discussion lands on the day's meditation from the very first day.
      if (isContemplation) {
        await tx.insert(groupReflectionSourcesTable).values({
          groupId: insertedGroup.id,
          source: "cac",
          setByUserId: user.id,
        });
      }

      return insertedGroup;
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

    // Member counts in ONE grouped query instead of N+1 (was: a
    // SELECT * per group, counting in JS). Hidden admins are invisible
    // members (pilot-designated observers), so the COUNT excludes them
    // and any not-yet-joined invite rows — matching the old in-JS
    // filter exactly. Index: group_members(group_id).
    const countRows = await db
      .select({ groupId: groupMembersTable.groupId, cnt: count() })
      .from(groupMembersTable)
      .where(and(
        inArray(groupMembersTable.groupId, groupIds),
        isNotNull(groupMembersTable.joinedAt),
        ne(groupMembersTable.role, "hidden_admin"),
      ))
      .groupBy(groupMembersTable.groupId);
    const countByGroup = new Map(countRows.map(r => [r.groupId, Number(r.cnt)]));

    const enriched = groups.map((g) => ({
      ...g,
      memberCount: countByGroup.get(g.id) ?? 0,
      myRole: joined.find(m => m.groupId === g.id)?.role ?? "follower",
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

  // A community is a FOLLOWED FEED, not a social room: FOLLOWERS (the
  // anonymous default every join grants) never see each other or anyone
  // else's row. MEMBERS are the smaller, admin-curated tier — they ARE
  // visible to any other non-admin viewer (the curated "who's here" list),
  // just never to a follower peer. A non-admin viewer always receives their
  // own row (so `myRole` / joined-state resolves) plus every member/admin
  // row; a fellow follower's row is never included. Admin-level viewers get
  // the full roster (incl. every follower) so they can manage the feed
  // (remove, promote, demote) — that's leader management, not peer visibility.
  const visibleMembers = isAdminView
    ? members
    // hidden_admin stays hidden from non-admins even though it's technically
    // "member or above" — only member/admin rows (plus the viewer's own row,
    // whatever tier they are) are in the curated visible-to-everyone set.
    : members.filter(m => m.userId === user.id || m.role === "member" || m.role === "admin");

  // Anonymous follower count (joined, excluding hidden-admin observers) —
  // computed from the FULL roster so the "N following" headline stays honest
  // even though a non-admin viewer never receives the individual member rows.
  const memberCount = members.filter(m => m.joinedAt !== null && m.role !== "hidden_admin").length;

  res.json({
    group: {
      ...result.group,
      ...(isAdminView ? {} : { inviteToken: undefined }),
    },
    myRole: result.member.role,
    memberCount,
    members: visibleMembers.map(m => ({
      id: m.id,
      name: m.name,
      // Member emails are visible only to admins — a regular member shouldn't be
      // able to harvest every peer's email from a community roster.
      email: isAdminView ? m.email : undefined,
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
    // Bucket "today" / "this week" in Eastern Time. Phoebe's community
    // is run out of ET and the admin's intuition about "today" is the
    // ET calendar day; UTC bucketing (the previous behavior) flipped
    // the metrics to a fresh day at midnight UTC — i.e. 8pm EDT —
    // which made "Today=0" appear every evening. Hardcoded rather
    // than read off the admin's timezone field so every admin sees
    // the same numbers regardless of where they sign in from.
    // "America/New_York" handles DST automatically (EDT in summer,
    // EST in winter).
    const tz = "America/New_York";
    const ymdFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const nowDate = new Date();
    const todayStr = ymdFmt.format(nowDate);
    // Week-start in ET: take today's local Y-M-D, parse it back to a
    // date, subtract 6 days. The intermediate Date math is UTC-safe
    // because we only use the date components.
    const [tyStr, tmStr, tdStr] = todayStr.split("-");
    const todayUTC = new Date(Date.UTC(
      parseInt(tyStr, 10),
      parseInt(tmStr, 10) - 1,
      parseInt(tdStr, 10),
    ));
    todayUTC.setUTCDate(todayUTC.getUTCDate() - 6);
    const weekStartStr = todayUTC.toISOString().slice(0, 10);

    // A "prayer event" is one of two things logged by a member of this
    // community:
    //   1. A prayer-list completion check-in (moment_posts row with
    //      isCheckin=1 — written by prayer-mode's handleDone for every
    //      intercession the user is part of).
    //   2. An Amen tap (prayer_request_amens row — fired once per non-
    //      own request slide in prayer-mode, plus anywhere else we wire
    //      an Amen button in future).
    // We UNION both signals and dedup by (user, day) where day is a
    // local YYYY-MM-DD string, because walking the list generates
    // several rows but that's still "one day of prayer".
    const q = await pool.query(`
      WITH members AS (
        -- Hidden admins are observers, not members. They don't count
        -- toward member totals, don't contribute to "people praying"
        -- buckets, and their prayer requests are not community feed
        -- items. Excluded here so every downstream metric naturally
        -- treats them as invisible.
        --
        -- is_admin flags the (visible) admin role so downstream rollups
        -- can cap an admin's contribution to "Times prayed" — see
        -- ADMIN_DAILY_PRAYER_CAP in prayer_events below. This prevents
        -- an admin from inflating the community's stats by tapping
        -- amen dozens of times; their care for the community shows up,
        -- but a single admin can't dominate the rollup.
        SELECT u.id AS user_id, LOWER(u.email) AS email_lower,
               (gm.role = 'admin') AS is_admin
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
      -- One unified definition of a "prayer session" — drives BOTH
      -- People praying and Times prayed so the math always holds
      -- (Times ≥ People). A session is one of:
      --   • an Amen tap (prayer_request_amens row)
      --   • an office / devotion completion that reached ≥3 slides
      --     (prayer_sessions with the right surface + slide count)
      --
      -- Two events <15 min apart for the same user collapse to one,
      -- so tapping in / out / in doesn't inflate the count.
      -- Two sessions more than 15 min apart each count separately —
      -- e.g. praying in the morning and again in the evening = 2.
      -- Briefly opening an office without reaching 3 slides is NOT
      -- counted — neither as a session nor as "this user prayed
      -- today". The semantics: a person who "prayed today" actually
      -- did something prayer-shaped past the threshold.
      session_candidates AS (
        SELECT user_id, occurred_at FROM (
          SELECT a.user_id, a.prayed_at AS occurred_at
          FROM prayer_request_amens a
          WHERE a.user_id IN (SELECT user_id FROM members)
            AND a.prayed_at IS NOT NULL

          UNION ALL

          -- NULL slides_completed = legacy row pre-dating the
          -- column; treat as qualifying so historic data doesn't
          -- disappear from the rollup.
          SELECT ps.user_id, ps.ended_at AS occurred_at
          FROM prayer_sessions ps
          WHERE ps.user_id IN (SELECT user_id FROM members)
            AND ps.surface IN (
              'morning-prayer',
              'evening-prayer',
              'compline',
              'morning-devotion',
              'early-evening-devotion'
            )
            AND (ps.slides_completed IS NULL OR ps.slides_completed >= 3)
        ) c
      ),
      session_with_lag AS (
        SELECT
          sc.user_id, sc.occurred_at,
          to_char((sc.occurred_at AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS day,
          LAG(sc.occurred_at) OVER (
            PARTITION BY sc.user_id ORDER BY sc.occurred_at
          ) AS prev_at,
          m.is_admin
        FROM session_candidates sc
        JOIN members m ON m.user_id = sc.user_id
      ),
      -- After 15-min dedup, number each event within (user, day) so
      -- we can cap admins at 3 prayer events per day. Non-admins keep
      -- their full count; an admin's 4th+ daily event drops out of
      -- "Times prayed" rollups. "Prayed today/week/all-time" still
      -- counts the admin as 1 person/day because that bucket is a
      -- DISTINCT (user, day) on prayer_events — capping doesn't
      -- remove their first event, just the inflated tail.
      prayer_events_raw AS (
        SELECT
          user_id, day, occurred_at, is_admin,
          ROW_NUMBER() OVER (
            PARTITION BY user_id, day ORDER BY occurred_at
          ) AS daily_idx
        FROM session_with_lag
        WHERE prev_at IS NULL
           OR occurred_at - prev_at > INTERVAL '15 minutes'
      ),
      -- ADMIN_DAILY_PRAYER_CAP = 3. A visible group admin contributes
      -- at most 3 prayer events per day to "Times prayed"; their first
      -- through third events of the day count, the 4th onwards drop
      -- out so a hyper-engaged admin can't single-handedly inflate
      -- the community's rollup. Non-admins keep their full count
      -- (after the 15-min dedup above). "People praying" is derived
      -- from this same source so it stays consistent — but it's a
      -- DISTINCT (user, day), so the cap doesn't remove an admin's
      -- presence in that bucket; they still count as 1 person/day.
      prayer_events AS (
        SELECT user_id, day
        FROM prayer_events_raw
        WHERE is_admin = false OR daily_idx <= 3
      ),
      -- People praying = distinct users with at least one prayer
      -- event. Same source as Times prayed, just deduped, so
      -- People ≤ Times always holds.
      prayer_days AS (
        SELECT DISTINCT user_id, day FROM prayer_events
      ),
      -- Offices: one session per (user, day, side). A side is
      -- "morning" (morning-prayer + morning-devotion) or "evening"
      -- (evening-prayer + early-evening-devotion + compline) so the
      -- max count for any one person per day is 2 — once for the
      -- morning office, once for the evening. Same ≥3-slides +
      -- 15-min-dedup semantics as the unified prayer event above
      -- (the dedup is folded into the DISTINCT at the day+side
      -- grain). Surfaces a "Offices" row in the metrics dashboard
      -- separate from the broader Times prayed count.
      office_session_candidates AS (
        SELECT
          ps.user_id,
          ps.ended_at AS occurred_at,
          CASE
            WHEN ps.surface IN ('morning-prayer', 'morning-devotion') THEN 'morning'
            ELSE 'evening'
          END AS side
        FROM prayer_sessions ps
        WHERE ps.user_id IN (SELECT user_id FROM members)
          AND ps.surface IN (
            'morning-prayer',
            'evening-prayer',
            'compline',
            'morning-devotion',
            'early-evening-devotion'
          )
          AND (ps.slides_completed IS NULL OR ps.slides_completed >= 3)
      ),
      office_days AS (
        SELECT DISTINCT
          user_id,
          side,
          to_char((occurred_at AT TIME ZONE $4)::date, 'YYYY-MM-DD') AS day
        FROM office_session_candidates
      )
      SELECT
        (SELECT COUNT(*) FROM members)::int AS total_members,

        (SELECT COUNT(*) FROM member_requests)::int AS prayer_requests_total,
        (SELECT COUNT(*) FROM member_requests
           WHERE to_char((created_at AT TIME ZONE $4)::date, 'YYYY-MM-DD') >= $2)::int AS prayer_requests_today,
        (SELECT COUNT(*) FROM member_requests
           WHERE to_char((created_at AT TIME ZONE $4)::date, 'YYYY-MM-DD') >= $3)::int AS prayer_requests_week,

        -- "Times prayed" = count of distinct (user, day) tuples. One
        -- prayer event per person per day, no matter how many requests
        -- they touched or how many times they tapped.
        (SELECT COUNT(*) FROM prayer_events)::int AS times_prayed_total,
        (SELECT COUNT(*) FROM prayer_events WHERE day >= $2)::int AS times_prayed_today,
        (SELECT COUNT(*) FROM prayer_events WHERE day >= $3)::int AS times_prayed_week,

        -- Distinct users who have prayed in each window.
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days WHERE day >= $2)::int AS prayed_today,
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days WHERE day >= $3)::int AS prayed_week,
        (SELECT COUNT(DISTINCT user_id) FROM prayer_days)::int AS prayed_all_time,

        -- Offices: count of (user, day, side) tuples. Caps at 2 per
        -- person per day (morning + evening). Window-scoped same as
        -- the Times prayed columns.
        (SELECT COUNT(*) FROM office_days WHERE day >= $2)::int AS offices_today,
        (SELECT COUNT(*) FROM office_days WHERE day >= $3)::int AS offices_week,
        (SELECT COUNT(*) FROM office_days)::int AS offices_total,

        -- "Time praying" — sum of duration_seconds across every
        -- prayer_sessions row whose user is in this community. Sessions
        -- are committed by the slideshow / Office / Devotion viewer
        -- when their React component unmounts; bible-reading time
        -- launched from a lesson slide is captured naturally because
        -- the parent surface stays mounted while SFSafariViewController
        -- is open. Anti-cheat (5s floor + 60min cap) lives in the POST
        -- route, so the sum here is already clean.
        -- Private sits (the contemplation summary's Private toggle)
        -- drop out of community "Time Praying" — a user who marked
        -- their sit Private doesn't want it surfacing in any other
        -- member's view, even as anonymous seconds. Office surfaces
        -- never set is_private, so this is a no-op for them.
        COALESCE((SELECT SUM(duration_seconds) FROM prayer_sessions
           WHERE user_id IN (SELECT user_id FROM members)
             AND is_private = false
             AND to_char((ended_at AT TIME ZONE $4)::date, 'YYYY-MM-DD') >= $2), 0)::bigint AS seconds_prayed_today,
        COALESCE((SELECT SUM(duration_seconds) FROM prayer_sessions
           WHERE user_id IN (SELECT user_id FROM members)
             AND is_private = false
             AND to_char((ended_at AT TIME ZONE $4)::date, 'YYYY-MM-DD') >= $3), 0)::bigint AS seconds_prayed_week,
        COALESCE((SELECT SUM(duration_seconds) FROM prayer_sessions
           WHERE user_id IN (SELECT user_id FROM members)
             AND is_private = false), 0)::bigint AS seconds_prayed_total
    `, [result.group.id, todayStr, weekStartStr, tz]);
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

      // "times prayed" — count of distinct (user, day) prayer events.
      // A user who prays for several requests and checks in to a
      // couple of intercessions on the same day still counts as one
      // prayer event for that day.
      timesPrayedTotal: Number(row.times_prayed_total ?? 0),
      timesPrayedToday: Number(row.times_prayed_today ?? 0),
      timesPrayedThisWeek: Number(row.times_prayed_week ?? 0),

      // "offices" — count of (user, day, side) tuples for Daily
      // Office / Devotion sessions. Max two per person per day
      // (morning + evening). Reaches ≥3 slides counts; "tap and
      // bail" does not.
      officesTotal: Number(row.offices_total ?? 0),
      officesToday: Number(row.offices_today ?? 0),
      officesThisWeek: Number(row.offices_week ?? 0),

      // "Time praying" — total seconds spent in the slideshow / Office
      // / Devotion viewers across every joined community member.
      // Capped per-session in the POST /prayer-sessions route so a
      // phone left on a slide overnight can't skew the rollup.
      secondsPrayedTotal: Number(row.seconds_prayed_total ?? 0),
      secondsPrayedToday: Number(row.seconds_prayed_today ?? 0),
      secondsPrayedThisWeek: Number(row.seconds_prayed_week ?? 0),
    });
  } catch (err) {
    console.error("[groups/metrics] query failed:", err);
    res.status(500).json({ error: "Couldn't load metrics" });
  }
});

// GET /api/groups/:slug/metrics-debug — admin-only inspection of the raw rows
// the metrics aggregator sees for each member. Useful when "Today=0" and you
// want to know whether the writes actually landed, whether the userToken→email
// join resolved, and what local-day the events bucketed into.
router.get("/groups/:slug/metrics-debug", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireAdmin(String(req.params.slug ?? ""), user.id);
  if (!result) { res.status(403).json({ error: "Admin only" }); return; }

  const [adminUser] = await db.select({ timezone: usersTable.timezone })
    .from(usersTable).where(eq(usersTable.id, user.id));
  const tz = adminUser?.timezone || "UTC";
  const todayStr = (() => {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  })();

  try {
    const q = await pool.query(`
      WITH members AS (
        SELECT u.id AS user_id, u.email, LOWER(u.email) AS email_lower, u.name
        FROM users u
        JOIN group_members gm ON gm.user_id = u.id
        WHERE gm.group_id = $1
          AND gm.joined_at IS NOT NULL
          AND gm.role <> 'hidden_admin'
      ),
      member_tokens AS (
        SELECT t.user_token, m.user_id
        FROM moment_user_tokens t
        JOIN members m ON LOWER(t.email) = m.email_lower
      ),
      checkins AS (
        SELECT mt.user_id, mp.window_date AS day, mp.created_at, mp.user_token
        FROM moment_posts mp
        JOIN member_tokens mt ON mt.user_token = mp.user_token
        WHERE mp.is_checkin = 1
      ),
      amens AS (
        SELECT a.user_id,
               to_char((a.prayed_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day,
               a.prayed_at, a.request_id
        FROM prayer_request_amens a
        WHERE a.user_id IN (SELECT user_id FROM members)
      )
      SELECT
        (SELECT json_agg(row_to_json(m.*)) FROM members m) AS members,
        (SELECT json_agg(row_to_json(c.*)) FROM (
          SELECT * FROM checkins ORDER BY created_at DESC LIMIT 50
        ) c) AS recent_checkins,
        (SELECT json_agg(row_to_json(a.*)) FROM (
          SELECT * FROM amens ORDER BY prayed_at DESC LIMIT 50
        ) a) AS recent_amens
    `, [result.group.id, tz]);
    const row = q.rows[0] ?? {};
    // NB: member share tokens are deliberately NOT returned — they're the
    // capability credentials behind the no-auth /moment/:token surfaces, so a
    // group admin must not be able to harvest them here. Debug metrics don't
    // need them.
    res.json({
      adminTimezone: tz,
      todayLocal: todayStr,
      groupId: result.group.id,
      members: row.members ?? [],
      recentCheckins: row.recent_checkins ?? [],
      recentAmens: row.recent_amens ?? [],
    });
  } catch (err) {
    console.error("[groups/metrics-debug] query failed:", err);
    res.status(500).json({ error: "Debug query failed" });
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

// ── "How can I pray for you?" community prompt ─────────────────────────
//
// An admin asks every joined member of their group to share something
// the community can hold for them in prayer this week. Each push deep-
// links to /community/:slug/share-prayer where the member's response
// becomes a regular prayer request (visible to their full garden via
// the existing visibility rules).
//
// Rate limit: once per 7 days per group. The DB column groups.
// last_prayer_invite_at is stamped on successful send; before the 7-day
// window elapses the POST returns 429. GET returns the next eligible
// timestamp so the client can render "Available in N days."
const PRAYER_INVITE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// The question the "Ask your community" prompt asks when the admin
// doesn't pick a preset or write their own.
const DEFAULT_PRAYER_INVITE_PROMPT = "How can we pray for you?";

router.get("/groups/:slug/prayer-invite-status", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const last = result.group.lastPrayerInviteAt;
  const nextEligibleAt = last
    ? new Date(new Date(last).getTime() + PRAYER_INVITE_COOLDOWN_MS)
    : null;
  const available = !nextEligibleAt || nextEligibleAt.getTime() <= Date.now();
  res.json({
    available,
    lastSentAt: last ? new Date(last).toISOString() : null,
    nextEligibleAt: nextEligibleAt ? nextEligibleAt.toISOString() : null,
  });
});

router.post("/groups/:slug/prayer-invite", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const last = result.group.lastPrayerInviteAt;
  if (last && (Date.now() - new Date(last).getTime()) < PRAYER_INVITE_COOLDOWN_MS) {
    const nextEligibleAt = new Date(new Date(last).getTime() + PRAYER_INVITE_COOLDOWN_MS);
    res.status(429).json({
      error: "You can send this once every 7 days.",
      nextEligibleAt: nextEligibleAt.toISOString(),
    });
    return;
  }

  // Optional admin-chosen prompt — a preset ("What's a big life event
  // this week we can pray for?") or a custom question. Falls back to
  // the default if absent/blank. Threaded into the email subject +
  // headline, the push title, and the share-prayer landing slide so
  // every surface asks the same question.
  const promptParsed = z
    .object({ prompt: z.string().trim().min(1).max(160).optional() })
    .safeParse(req.body ?? {});
  const prompt = promptParsed.success && promptParsed.data.prompt
    ? promptParsed.data.prompt
    : DEFAULT_PRAYER_INVITE_PROMPT;

  // Resolve every joined member of the group except the sending admin
  // themself (don't push the admin their own prompt). Hidden-admins are
  // excluded too — they're observers, not part of the community's
  // pastoral round. We also pull name + email + the per-user email
  // dedup column so the email fan-out can skip anyone who's already
  // received a prayer-invite email today from a sibling group.
  const recipients = await db
    .select({
      userId: groupMembersTable.userId,
      name: usersTable.name,
      email: usersTable.email,
      lastEmailDate: usersTable.lastPrayerInviteEmailDate,
    })
    .from(groupMembersTable)
    .innerJoin(usersTable, eq(usersTable.id, groupMembersTable.userId))
    .where(
      and(
        eq(groupMembersTable.groupId, result.group.id),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
        sql`${groupMembersTable.role} <> 'hidden_admin'`,
        sql`${groupMembersTable.userId} <> ${user.id}`,
      ),
    );

  // Stamp the rate-limit column BEFORE the fan-out. Two reasons:
  //   1. A burst of fast taps from the admin can't kick off two
  //      parallel fan-outs while the first is still in flight.
  //   2. Even if push delivery partially fails, the admin doesn't
  //      get to retry within the 7-day window and double-spam the
  //      community.
  await db
    .update(groupsTable)
    .set({ lastPrayerInviteAt: new Date(), prayerInvitePrompt: prompt })
    .where(eq(groupsTable.id, result.group.id));

  // Today's UTC date (YYYY-MM-DD) for the per-user email dedup. Using
  // UTC rather than user-local: the concept of "did they get this
  // today" is loose enough that timezone precision doesn't matter, and
  // a single yardstick makes the check trivial.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const adminName = user.name ?? "Someone";
  const shareUrl = `${getInviteBaseUrl()}/communities/${result.group.slug}/share-prayer`;

  // Fire-and-forget per-recipient delivery. Push always fires (it's
  // per-group, not per-user). Email is gated by the daily dedup so a
  // user in N groups gets at most one of these emails per day. We
  // stamp the dedup column inside the inner promise so concurrent
  // dispatches in the same fan-out don't double-send.
  void Promise.all(
    recipients
      .filter((r) => typeof r.userId === "number")
      .map(async (r) => {
        const uid = r.userId as number;
        try {
          await sendPrayerInvitePush(uid, {
            groupSlug: result.group.slug,
            groupName: result.group.name,
            adminName,
            prompt,
          });
        } catch (err) {
          console.warn("[prayer-invite] push failed:", { userId: uid, err });
        }
        if (r.email && r.lastEmailDate !== todayUtc) {
          try {
            const sent = await sendPrayerInviteEmail({
              to: r.email,
              recipientName: r.name ?? "",
              adminName,
              groupName: result.group.name,
              shareUrl,
              prompt,
            });
            if (sent) {
              await db
                .update(usersTable)
                .set({ lastPrayerInviteEmailDate: todayUtc })
                .where(eq(usersTable.id, uid));
            }
          } catch (err) {
            console.warn("[prayer-invite] email failed:", { userId: uid, err });
          }
        }
      }),
  );

  res.json({
    ok: true,
    sentToCount: recipients.length,
    nextEligibleAt: new Date(Date.now() + PRAYER_INVITE_COOLDOWN_MS).toISOString(),
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
    // Contemplation template: null clears it back to a standard community.
    focus: z.enum(["contemplation"]).nullable().optional(),
    contemplationGoalMinutes: z.number().int().min(1).max(180).nullable().optional(),
    // Listed on /communities/browse for anyone to find and request to join.
    // Any group admin can flip this (not super-admin-only, unlike isPilotGroup).
    isPublic: z.boolean().optional(),
    // Free-text location shown on the public directory and searchable
    // alongside name (no geocoding — plain city/state strings).
    city: z.string().max(100).optional().or(z.literal("")),
    state: z.string().max(100).optional().or(z.literal("")),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const updates: Record<string, any> = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.emoji !== undefined) updates.emoji = parsed.data.emoji || null;
  if (parsed.data.calendarUrl !== undefined) updates.calendarUrl = parsed.data.calendarUrl || null;
  if (parsed.data.isPublic !== undefined) updates.isPublic = parsed.data.isPublic;
  if (parsed.data.city !== undefined) updates.city = parsed.data.city.trim() || null;
  if (parsed.data.state !== undefined) updates.state = parsed.data.state.trim() || null;

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

  // Contemplation template toggle. focus = "contemplation" turns the
  // community into a shared-contemplation template (CAC feed + shared
  // minute goal) and guarantees a goal default; focus = null reverts to a
  // standard, office-shaped community and clears the goal.
  if (parsed.data.focus !== undefined) {
    updates.focus = parsed.data.focus;
    if (parsed.data.focus === "contemplation") {
      updates.contemplationGoalMinutes =
        parsed.data.contemplationGoalMinutes
        ?? result.group.contemplationGoalMinutes
        ?? 20;
    } else {
      updates.contemplationGoalMinutes = null;
    }
  } else if (parsed.data.contemplationGoalMinutes !== undefined) {
    // Goal-only edit (focus unchanged).
    updates.contemplationGoalMinutes = parsed.data.contemplationGoalMinutes;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(groupsTable).set(updates).where(eq(groupsTable.id, result.group.id));
  }

  // Enabling the contemplation template pins the community's shared
  // reflection feed to the CAC daily meditation when one isn't set yet —
  // mirrors what the create flow does so the home tab has a source to render.
  if (parsed.data.focus === "contemplation") {
    try {
      const existingSource = await db.select({ id: groupReflectionSourcesTable.id })
        .from(groupReflectionSourcesTable)
        .where(eq(groupReflectionSourcesTable.groupId, result.group.id))
        .limit(1);
      if (existingSource.length === 0) {
        await db.insert(groupReflectionSourcesTable).values({
          groupId: result.group.id,
          source: "cac",
          setByUserId: user.id,
        });
      }
    } catch (err) {
      console.error("PATCH contemplation CAC source seed error:", err);
    }
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
  const groupId = result.group.id;

  // Hard delete. The schema CASCADEs membership, intentions, daily
  // focus, announcements, admin-notification acks, prayer requests,
  // and the moment_groups junction automatically. We have to take care
  // of three groups of references manually:
  //
  //   1. shared_moments.group_id (intercessions, practices,
  //      fasting, etc.) — schema is ON DELETE SET NULL, so without
  //      explicit cleanup the practices would survive as orphaned
  //      groupless rows. The user expects "delete the group →
  //      delete its intercessions / practices." So we delete them.
  //   2. rituals.group_id (events / gatherings) — same SET NULL
  //      schema, same expectation: deleting the parish wipes its
  //      events. meetups + ritual_messages + schedule_responses etc.
  //      cascade off rituals automatically.
  //   3. users.parish_id — declared without an ON DELETE clause, so
  //      Postgres would reject the delete with a foreign-key
  //      violation if any user still pointed at this group as their
  //      primary parish. NULL them out first.
  //
  // We deliberately do NOT touch:
  //   - prayer_feeds (no FK to groups in current schema; feeds are
  //     creator-scoped, not parish-scoped, even on the climate side)
  //   - moment_groups secondary-share rows for OTHER groups (only
  //     the rows where group_id = this group cascade off via the
  //     existing FK)

  // 1. NULL out users.parish_id pointing here so the group delete
  //    doesn't fail on the FK constraint.
  await db
    .update(usersTable)
    .set({ parishId: null } as Record<string, unknown>)
    .where(eq(usersTable.parishId, groupId));

  // 2. Delete every intercession / practice owned by this
  //    group. shared_moments has CASCADEs on its child tables
  //    (moment_user_tokens, moment_posts, moment_windows,
  //    moment_renewals, moment_calendar_events, moment_groups,
  //    moment_streak_days, lectio_reflections), so this is enough.
  //    Rows that are SHARED with this group via moment_groups but
  //    primary-owned by another group stay alive — only their
  //    junction row disappears via that table's CASCADE.
  await db.delete(sharedMomentsTable).where(eq(sharedMomentsTable.groupId, groupId));

  // 3. Delete every event / gathering tied to this group. Rituals' own
  //    remaining children (meetups, ritual_messages) are cleaned up
  //    explicitly in the ritual-delete route, not via FK cascade — they
  //    don't specify ON DELETE CASCADE. (The RSVP-scheduling tables that
  //    used to live here — schedule_responses, invite_tokens,
  //    ritual_time_suggestions — were removed along with that feature.)
  await db.delete(ritualsTable).where(eq(ritualsTable.groupId, groupId));

  // 4. Finally drop the group row. The schema's existing CASCADEs
  //    handle the rest: group_members, circle_intentions,
  //    circle_daily_focus, group_announcements, prayer_requests
  //    scoped to this group, etc.
  await db.delete(groupsTable).where(eq(groupsTable.id, groupId));

  res.json({ ok: true });
});

// ─── Membership ─────────────────────────────────────────────────────────────

// NOTE: POST /api/groups/:slug/members (admin add-by-email) was removed
// 2026-07-25. Admins can no longer add people directly — the only ways in
// are the shareable invite link or requesting to join and being accepted.

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
    // Enrich with preview data for the join-page onboarding slideshow: the
    // group's active practices (so visitors see what they're signing up to do)
    // plus an anonymous follower count. A community is a followed feed, not a
    // social room, so we NEVER surface individual members' names or avatars —
    // not on the join page, not anywhere.
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
        sampleMembers: [],
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
      role: "follower",
      inviteToken: crypto.randomBytes(16).toString("hex"),
      joinedAt: new Date(),
    });
    await reconcileAllPracticesForGroup(group.id);
    // No need to flip users.officesOnly here — the derived access
    // tier in parishGate.ts already promotes any user with a joined
    // group_members row to "full" (hasCommunityMembership wins over
    // the officesOnly flag). The client just needs to re-fetch
    // /api/auth/me after a successful join to pick up the new tier;
    // see community-join.tsx invalidating that cache in joinMutation
    // onSuccess. We intentionally leave the column alone so that if
    // the user later leaves the community, they revert to their
    // original offices-only experience rather than landing on the
    // parish-onboarding flow as an "unassigned" account.

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
  // Tier upgrade comment: same as the community-wide path above —
  // we don't touch users.officesOnly here. The derived accessTier
  // already returns "full" the moment a joined membership row
  // exists for the user; the client invalidates /api/auth/me on
  // join success so the limited UI flips to the full app
  // immediately.

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
  _groupId: number,
  _groupName: string,
  _joiner: { name: string; email: string },
  _groupSlug?: string,
): Promise<void> { return; }

async function notifyAdminsOfNewPrayerRequest(
  _groupId: number,
  _groupName: string,
  _body: string,
  _authorName: string | null,
  _isAnonymous: boolean,
): Promise<void> { return; }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// GET /api/groups/:slug/members — list all members. Admin-only: communities
// are a followed feed now (members don't see a roster of each other), so
// full member rows (name, email, role) are for admin management only — the
// sibling GET /groups/:slug already scopes non-admins to just their own row;
// this endpoint must match that, not the community's public member COUNT.
router.get("/groups/:slug/members", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }

  const members = await db.select().from(groupMembersTable)
    .where(eq(groupMembersTable.groupId, result.group.id));

  // Hidden admins are visible only to other admins — always true here since
  // the caller is already an admin, but keep the viewer's-own-row carve-out
  // for consistency with the sibling endpoint's shape.
  const visibleMembers = members;

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
// between "follower" | "member" | "admin" | "hidden_admin". Admin-gated.
// "follower" is the anonymous, count-only tier (the default for anyone who
// joins); "member" is the smaller, admin-curated tier an admin explicitly
// promotes someone into. Designating or removing a "hidden_admin" role is
// additionally pilot-gated (only users in betaUsersTable can make that
// call). Guards against demoting the last visible admin so a community can
// never end up without a reachable admin.
router.patch("/groups/:slug/members/:memberId/role", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const memberId = parseInt(req.params.memberId, 10);
  if (isNaN(memberId)) { res.status(400).json({ error: "Invalid member ID" }); return; }

  const schema = z.object({
    role: z.enum(["follower", "member", "admin", "hidden_admin"]),
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

  // Last-admin guard: if we're demoting an admin (either role) to a
  // non-admin tier (follower OR member), make sure someone with admin
  // powers will remain. Count both visible and hidden admins — either is
  // enough to keep the community reachable.
  if (isAdminRole(target.role) && !isAdminRole(nextRole)) {
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
    // Audit #1: only ACCEPTED members (joinedAt set by their own join) fan their
    // prayers onto this wall. A pending admin-typed invite must not pull the
    // invitee's prayers from their other communities / personal wall here — that
    // was the prayer-harvesting primitive. Cross-community visibility is
    // preserved for members who genuinely joined.
    .where(and(
      eq(groupMembersTable.groupId, group.id),
      isNotNull(groupMembersTable.joinedAt),
    ));
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
          // Parish-scoped pastoral concerns are private to the
          // requester + parish admin and must never appear on a
          // community wall, even when the requester is a member of
          // this group.
          isNull(prayerRequestsTable.parishFeedId),
          // Directed ("to a fellow") requests are private — never on a wall.
          eq(prayerRequestsTable.directOnly, false),
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
          isNull(prayerRequestsTable.parishFeedId),
          // Directed ("to a fellow") requests are private — never on a wall.
          eq(prayerRequestsTable.directOnly, false),
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

  // Debug dump: hit /api/groups/<slug>/prayer-requests?debug=1 to see
  // exactly what the server computed — roster rows, resolved member
  // user IDs, and every non-closed prayer request in the db that
  // should-or-shouldn't match. Takes the loop out of "push and hope"
  // when a community home appears empty.
  // STAFF ONLY: the dump includes `allOpenPrayerRequests` — every open
  // request's BODY + owner across the whole database — so it must never be
  // reachable by an ordinary member (a guest can join a public group). Gate it
  // behind the super-admin check the other admin diagnostics use.
  if (req.query["debug"] === "1" && (await isBetaAdmin(user.id))) {
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
    // Log the full error (message + stack) server-side for debugging via
    // the Railway log line, but return only a generic message to the
    // client. Audit finding #21: echoing err.message + err.stack into the
    // 500 body leaks file paths / ORM internals to any authenticated caller.
    console.error("[groups/:slug/prayer-requests] endpoint threw:", err);
    res.status(500).json({ error: "Failed to load prayer requests" });
  }
});

router.post("/groups/:slug/prayer-requests", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not a member of this group" }); return; }
  const { group, member } = result;

  // Hidden admins are invisible-by-design members. Posting a community-
  // scoped prayer would either fan out a "{HiddenAdmin} is asking for
  // your prayers" push to the whole group (immediately revealing their
  // existence + name) OR land in the community feed (same leak via the
  // wall). Block the POST entirely; the hidden admin can still post a
  // global prayer via POST /prayer-requests if they want their own
  // garden to see it — that path scopes the audience via
  // getGardenUserIds, which already excludes the hidden-admin's
  // hidden-admin groups from `myGroupIds`.
  if (member.role === "hidden_admin") {
    res.status(403).json({ error: "Hidden admins can't post community prayer requests in this group." });
    return;
  }

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

  // Community-wide push: every JOINED member except the author gets
  // a "{Name} is asking for your prayers" lock-screen ping that deep-
  // links to the prayer's slide page. Pending invitees stay quiet
  // (they aren't members yet); anonymous requests collapse the title
  // to "Someone …". Fire-and-forget so a slow APNs round-trip can't
  // delay the HTTP response. Hidden admins of this group are
  // excluded from the recipient set: they're invisible-by-design
  // observers, and pushing a community prayer to them would leak
  // their existence (the deep-link slide page would show in their
  // app even though no other member can see them as a peer).
  (async () => {
    try {
      const memberRows = await db.select({
        userId: groupMembersTable.userId,
        joinedAt: groupMembersTable.joinedAt,
        role: groupMembersTable.role,
      })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.groupId, group.id));
      const recipientIds = memberRows
        .filter(r =>
          r.joinedAt &&
          r.userId != null &&
          r.userId !== user.id &&
          r.role !== "hidden_admin",
        )
        .map(r => r.userId as number);
      if (recipientIds.length === 0) return;
      const authorName = member.name ?? user.name ?? "Someone";
      await Promise.all(recipientIds.map(rid =>
        sendNewPrayerRequestPush(rid, {
          authorName,
          isAnonymous: parsed.data.isAnonymous ?? false,
          prayerRequestId: inserted.id,
        }).catch(err => console.warn("[groups] new-prayer-request push failed:", err))
      ));
    } catch (err) {
      console.warn("[groups] new-prayer-request push fan-out failed:", err);
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

  // Member counts in ONE grouped query instead of N+1 (was: a full
  // SELECT of moment_user_tokens per practice, counted in JS via
  // members.length). Index: moment_user_tokens(moment_id).
  const practiceIds = practices.map((p) => p.id);
  const countRows = practiceIds.length > 0
    ? await db
        .select({ momentId: momentUserTokensTable.momentId, cnt: count() })
        .from(momentUserTokensTable)
        .where(inArray(momentUserTokensTable.momentId, practiceIds))
        .groupBy(momentUserTokensTable.momentId)
    : [];
  const countByMoment = new Map(countRows.map((r) => [r.momentId, Number(r.cnt)]));

  const enriched = practices.map((p) => ({
    id: p.id,
    name: p.name,
    templateType: p.templateType,
    intention: p.intention,
    frequency: p.frequency,
    memberCount: countByMoment.get(p.id) ?? 0,
    state: p.state,
    createdAt: p.createdAt,
  }));

  res.json({ practices: enriched });
});

// Gatherings scoped to a community. Two inclusion paths:
//   1. `rituals.group_id` = this community's id (the new way — set
//      by the community-gathering flow).
//   2. Rituals linked via the ritual_groups junction (multi-community
//      gatherings, see Path 3 below).
// The old Path 2 "legacy heuristic" (pre-group_id gatherings matched by
// comparing their invitee list against the community roster) was removed
// along with the invitee/attendee list itself — a gathering has no
// participants column to match against anymore.
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
      meetingUrl: ritualsTable.meetingUrl,
      createdAt: ritualsTable.createdAt,
    })
    .from(ritualsTable)
    .where(eq(ritualsTable.groupId, group.id))
    .orderBy(desc(ritualsTable.createdAt));

  // Path 2 (legacy invitee-roster heuristic) removed — see comment above.
  const legacy: typeof explicit = [];

  // Path 3: rituals linked to this community via the ritual_groups
  // junction (multi-community gatherings). A gathering can be hosted
  // by one community and shared with several others — each shared-with
  // community sees the gathering in its own Gatherings list. We catch
  // a missing-table error so a fresh DB without ritual_groups doesn't
  // 500 the whole list.
  let sharedExtra: typeof explicit = [];
  try {
    sharedExtra = await db
      .select({
        id: ritualsTable.id,
        name: ritualsTable.name,
        description: ritualsTable.description,
        template: ritualsTable.template,
        rhythm: ritualsTable.rhythm,
        frequency: ritualsTable.frequency,
        dayPreference: ritualsTable.dayPreference,
        location: ritualsTable.location,
        meetingUrl: ritualsTable.meetingUrl,
        createdAt: ritualsTable.createdAt,
      })
      .from(ritualGroupsTable)
      .innerJoin(ritualsTable, eq(ritualsTable.id, ritualGroupsTable.ritualId))
      .where(eq(ritualGroupsTable.groupId, group.id));
  } catch {
    sharedExtra = [];
  }

  // Merge + dedupe by id, sort desc by createdAt.
  const seen = new Set<number>();
  const merged = [...explicit, ...legacy, ...sharedExtra].filter((r) => {
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
    // Find the matching meetup id so the client can attach RSVPs to
    // the right meetup without an extra round-trip.
    let nextMeetupId: number | null = null;
    if (nextMeetupDate) {
      const nextIso = nextMeetupDate;
      const match = meetups.find((m) => {
        try { return new Date(m.scheduledDate).toISOString() === nextIso; }
        catch { return false; }
      });
      nextMeetupId = match?.id ?? null;
    }
    return { ...g, nextMeetupDate, nextMeetupId };
  });

  // Sort by next upcoming date so the soonest meetup is first.
  // Gatherings without a next date (e.g. one-off that's already past
  // with no future plans) fall to the bottom, ordered by createdAt
  // desc as a stable secondary sort.
  enriched.sort((a, b) => {
    const aNext = a.nextMeetupDate ? new Date(a.nextMeetupDate).getTime() : null;
    const bNext = b.nextMeetupDate ? new Date(b.nextMeetupDate).getTime() : null;
    if (aNext !== null && bNext !== null) return aNext - bNext;
    if (aNext !== null) return -1;
    if (bNext !== null) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
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

  // Enrich with author name in ONE query instead of N+1 (was: a SELECT
  // per announcement). Index: users primary key on id.
  const authorIds = [...new Set(
    announcements
      .map((a) => a.authorUserId)
      .filter((id): id is number => typeof id === "number"),
  )];
  const authorRows = authorIds.length > 0
    ? await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.id, authorIds))
    : [];
  const nameById = new Map(authorRows.map((r) => [r.id, r.name]));
  const enriched = announcements.map((a) => ({
    ...a,
    authorName: (a.authorUserId != null ? nameById.get(a.authorUserId) : undefined) ?? "Admin",
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
    // Optional event fields. When kind='prayer_walk', eventAt should be
    // set; we don't require it strictly so admins can save drafts.
    kind: z.enum(["announcement", "prayer_walk"]).optional(),
    eventAt: z.string().datetime().optional(),
    location: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [announcement] = await db.insert(groupAnnouncementsTable).values({
    groupId: result.group.id,
    authorUserId: user.id,
    title: parsed.data.title ?? null,
    content: parsed.data.content,
    kind: parsed.data.kind ?? "announcement",
    eventAt: parsed.data.eventAt ? new Date(parsed.data.eventAt) : null,
    location: parsed.data.location ?? null,
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
    // get picked up wherever we stitch userId on signup. Hidden_admin
    // memberships are excluded — the role grants admin powers without
    // content visibility, so circle intentions in those groups
    // shouldn't reach the viewer's slideshow either.
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
        sql`(${groupMembersTable.role} IS NULL
             OR ${groupMembersTable.role} <> 'hidden_admin')`,
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

  // If subjectUserId is given, it must be a MEMBER of this circle — you may
  // only link an actual account as a focus subject when they're in the group.
  // Otherwise a member could name any Phoebe user id and pull that stranger's
  // profile (name/avatar, surfaced by GET /focus) into the circle without
  // consent — an enumeration/harvest vector. To pray for a non-member by name,
  // use the free-text subjectText field instead.
  if (parsed.data.subjectUserId != null) {
    const [m] = await db.select({ id: groupMembersTable.id }).from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, result.group.id),
        eq(groupMembersTable.userId, parsed.data.subjectUserId),
      ));
    if (!m) { res.status(400).json({ error: "Subject must be a member of this circle" }); return; }
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

// GET /api/groups/users/search?q=... — search Phoebe users by name or email.
// Beta-admin gated: this endpoint exposes raw email addresses, and the
// only legit caller is the beta-admin onboarding picker (beta-admin.tsx)
// which is itself admin-only. The previous version was open to any
// signed-in user, which let an attacker enumerate the full user
// directory by typing two-letter substrings.
//
// Filter is done SQL-side via ILIKE so we never pull the whole users
// table into Node, and LIMIT 8 caps the wire size.
router.get("/groups/users/search", perUserRateLimit("groups_user_search", { max: 40, windowMs: 60 * 1000 }), async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const q = ((req.query.q as string) || "").trim();
    if (q.length < 2) { res.json({ users: [] }); return; }

    // Escape LIKE wildcards (%, _) so a user typing them doesn't get
    // a surprise match set.
    const safeQ = q.replace(/[%_\\]/g, (c) => `\\${c}`);
    const pattern = `%${safeQ}%`;

    const matches = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(and(
        sql`${usersTable.id} <> ${user.id}`,
        or(
          sql`${usersTable.name} ILIKE ${pattern}`,
          sql`${usersTable.email} ILIKE ${pattern}`,
        ),
      ))
      .limit(8);

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

    // Case-insensitive existence check on beta_users. The legacy
    // version compared exact-case, which let mixed-case duplicates
    // through (someone added with "Anabelle.Helsell@…" then a
    // re-add at the all-lowercase form would hit the UNIQUE
    // constraint on insert and 500). Now: LOWER(...) on both sides.
    const [existing] = await db
      .select({
        id: betaUsersTable.id,
        email: betaUsersTable.email,
        name: betaUsersTable.name,
        isAdmin: betaUsersTable.isAdmin,
        createdAt: betaUsersTable.createdAt,
      })
      .from(betaUsersTable)
      .where(sql`LOWER(${betaUsersTable.email}) = ${emailLower}`);
    if (existing) { res.json({ user: existing, alreadyExists: true }); return; }

    // Also create the full users row if this email has never been seen.
    // Admins asked for this so invited pilot users can be added to
    // communities / referenced in Garden-style UI before they've even
    // logged in themselves. When the real person signs up later, the
    // Google auth upsert (routes/auth.ts) matches by email and links
    // their Google ID to the existing row — no dup account created.
    //
    // Case-insensitive lookup for the same reason as above —
    // existing users rows with mixed-case emails should be picked
    // up rather than triggering a UNIQUE-constraint conflict on
    // INSERT.
    let userAccountCreated = false;
    {
      const [byEmail] = await db.select({ id: usersTable.id })
        .from(usersTable)
        .where(sql`LOWER(${usersTable.email}) = ${emailLower}`);
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
    // Surface the actual cause instead of the legacy "table not
    // ready" string — the catch fired for any failure, so admins
    // saw a misleading reason. Most common real-world causes:
    // (a) FK violation if the admin's own users.id was deleted,
    // (b) UNIQUE collision after a case-mismatched lookup (now
    // patched above), (c) genuine DB outage. We log the full err
    // server-side for debugging but return only a generic message —
    // audit finding #21: raw err.message leaks ORM/DB internals to the
    // authenticated caller.
    console.error("POST /api/beta/users error:", err);
    res.status(500).json({ error: "Could not add users" });
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
router.post("/beta/claim", rateLimit({
  // This endpoint grants admin if the caller presents the secret
  // BETA_CLAIM_TOKEN. Throttle per-IP so a weak/guessable token can't be
  // brute-forced. (Belt-and-suspenders — the token should be long and
  // random, and BETA_CLAIM_TOKEN should be UNSET in prod once admins are
  // claimed, which disables this endpoint entirely.)
  name: "beta_claim",
  max: 5,
  windowMs: 60 * 60 * 1000,
  message: "Too many attempts. Please try again later.",
}), async (req, res): Promise<void> => {
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


// The Google-Calendar-based Daily Bell admin tooling (GET /beta/bells,
// send-invite/:userId, send-invites, resend-ics-invites, reinvite-pending —
// monitoring/managing the calendar invite each user accepted/declined) was
// removed entirely (owner). The push-based bell is unaffected.

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
    // their prayer requests are hidden from the community wall. Scoped to
    // THIS group: cross-community hidden status must not leak, or a member
    // who is a hidden_admin in some OTHER community would be wrongly
    // suppressed from this ticker (and the unscoped scan read every
    // hidden_admin row in the DB). Mirrors the community-wall query above.
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
      .where(and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.role, "hidden_admin"),
      ));
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
      // min(1): a service schedule must have at least one time. Without this an
      // empty array from a stale/cleared admin form would wipe all service times
      // via the upsert below (confirmed data-loss path).
      times: z.array(z.object({
        label: z.string().max(80).optional(),
        time: z.string().regex(/^\d{1,2}:\d{2}$/),
        location: z.string().max(120).optional(),
      })).min(1).max(12),
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

// ─── Public communities + join-request workflow ────────────────────────────
// Open-signup users land on /communities/browse where they can request
// to join any group with is_public = true. The request waits in
// group_join_requests until an admin accepts/declines.

// GET /api/groups/public — every public group, annotated with the
// caller's relationship: already a member, has pending request, or
// neither. Ordered by recency for now; can swap to popularity later.
router.get("/groups/public", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    // Optional name search: `?q=` filters the directory by group name. A short
    // query (< 2 chars) is ignored so the browse page still shows the full
    // list. LIKE wildcards are escaped so a typed %/_ can't widen the match set.
    const q = ((req.query.q as string) || "").trim();
    const nameFilter = q.length >= 2
      ? sql`${groupsTable.name} ILIKE ${`%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`}`
      : undefined;
    // Optional location search: `?location=` matches against either city or
    // state (e.g. "Austin" or "TX" or "Austin, TX" both find it) — same
    // ILIKE + escaping approach as the name filter above, no geocoding.
    const loc = ((req.query.location as string) || "").trim();
    const locationFilter = loc.length >= 2
      ? (() => {
          const esc = `%${loc.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
          return sql`(${groupsTable.city} ILIKE ${esc} OR ${groupsTable.state} ILIKE ${esc})`;
        })()
      : undefined;
    const rows = await db
      .select({
        id: groupsTable.id,
        name: groupsTable.name,
        description: groupsTable.description,
        slug: groupsTable.slug,
        emoji: groupsTable.emoji,
        isPrayerCircle: groupsTable.isPrayerCircle,
        city: groupsTable.city,
        state: groupsTable.state,
        createdAt: groupsTable.createdAt,
      })
      .from(groupsTable)
      .where(and(
        eq(groupsTable.isPublic, true),
        ...(nameFilter ? [nameFilter] : []),
        ...(locationFilter ? [locationFilter] : []),
      ))
      .orderBy(desc(groupsTable.createdAt));

    if (rows.length === 0) { res.json({ groups: [] }); return; }
    const groupIds = rows.map(g => g.id);

    // Caller's existing membership rows across these groups.
    const myMembers = await db
      .select({ groupId: groupMembersTable.groupId, role: groupMembersTable.role })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.userId, user.id),
        inArray(groupMembersTable.groupId, groupIds),
      ));
    const memberSet = new Set(myMembers.map(m => m.groupId));

    // Caller's pending requests across these groups.
    const myPending = await db
      .select({ groupId: groupJoinRequestsTable.groupId })
      .from(groupJoinRequestsTable)
      .where(and(
        eq(groupJoinRequestsTable.userId, user.id),
        isNull(groupJoinRequestsTable.decision),
        inArray(groupJoinRequestsTable.groupId, groupIds),
      ));
    const pendingSet = new Set(myPending.map(p => p.groupId));

    // Public-facing member counts so each card can hint at scale.
    const memberCounts = await db
      .select({
        groupId: groupMembersTable.groupId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(groupMembersTable)
      .where(and(
        inArray(groupMembersTable.groupId, groupIds),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ))
      .groupBy(groupMembersTable.groupId);
    const countByGroup = new Map(memberCounts.map(c => [c.groupId, Number(c.count) || 0]));

    res.json({
      groups: rows.map(g => ({
        ...g,
        memberCount: countByGroup.get(g.id) ?? 0,
        myStatus: memberSet.has(g.id)
          ? "member"
          : pendingSet.has(g.id)
            ? "pending"
            : "none",
      })),
    });
  } catch (err) {
    console.error("GET /api/groups/public error:", err);
    res.status(500).json({ error: "Failed to load communities" });
  }
});

// POST /api/groups/:slug/request-join — submit a request to join a
// public community. Idempotent on (group_id, user_id) — re-tapping
// doesn't create duplicates. Pushes every admin of the group.
router.post("/groups/:slug/request-join", perUserRateLimit("groups_request_join", {
  max: 20, windowMs: 60 * 60 * 1000,
  message: "You've sent a lot of join requests. Please try again later.",
}), async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const slug = String(req.params.slug ?? "");
    const [group] = await db
      .select({ id: groupsTable.id, name: groupsTable.name, slug: groupsTable.slug, isPublic: groupsTable.isPublic })
      .from(groupsTable)
      .where(eq(groupsTable.slug, slug));
    if (!group) { res.status(404).json({ error: "Community not found" }); return; }
    if (!group.isPublic) {
      res.status(403).json({ error: "This community isn't accepting requests right now." });
      return;
    }

    // Already a member? Don't queue a request — return early so the UI
    // can route the user straight into the group.
    const [existingMember] = await db
      .select({ id: groupMembersTable.id })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, group.id),
        eq(groupMembersTable.userId, user.id),
      ));
    if (existingMember) {
      res.json({ ok: true, status: "already_member", groupSlug: group.slug });
      return;
    }

    // Is there already a PENDING request? If so, re-tapping is a no-op and
    // must NOT re-notify admins — otherwise a user could spam every admin's
    // lock screen by hammering this endpoint. We only push when the request is
    // genuinely new, or transitions out of a decided state (rejected/approved)
    // back to pending.
    const [existingRequest] = await db
      .select({ decision: groupJoinRequestsTable.decision })
      .from(groupJoinRequestsTable)
      .where(and(
        eq(groupJoinRequestsTable.groupId, group.id),
        eq(groupJoinRequestsTable.userId, user.id),
      ));
    const wasAlreadyPending = existingRequest != null && existingRequest.decision == null;

    // Insert the request — idempotent on the unique (group_id, user_id)
    // index. If a row already exists we just leave it; if the existing
    // decision was "rejected" we reset it to pending so the user can try
    // again after the admin clears.
    await db
      .insert(groupJoinRequestsTable)
      .values({ groupId: group.id, userId: user.id })
      .onConflictDoUpdate({
        target: [groupJoinRequestsTable.groupId, groupJoinRequestsTable.userId],
        set: {
          requestedAt: new Date(),
          decidedAt: null,
          decision: null,
          decidedByUserId: null,
        },
      });

    // Already-pending re-tap: acknowledge without re-notifying admins.
    if (wasAlreadyPending) {
      res.json({ ok: true, status: "pending", groupSlug: group.slug });
      return;
    }

    // Push every admin so they can act on it from anywhere.
    const adminMembers = await db
      .select({ userId: groupMembersTable.userId })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, group.id),
        inArray(groupMembersTable.role, ["admin", "hidden_admin"]),
      ));
    const adminUserIds = adminMembers
      .map(a => a.userId)
      .filter((id): id is number => id != null);
    const requesterName = (req.user as { name: string } | undefined)?.name ?? "Someone";
    await Promise.all(adminUserIds.map(adminId =>
      sendCommunityJoinRequestPush(adminId, {
        groupSlug: group.slug,
        groupName: group.name,
        requesterName,
      }).catch(err => console.error("[join-request] admin push failed:", err)),
    ));

    res.json({ ok: true, status: "pending", groupSlug: group.slug });
  } catch (err) {
    console.error("POST /api/groups/:slug/request-join error:", err);
    res.status(500).json({ error: "Failed to submit request" });
  }
});

// GET /api/groups/:slug/join-requests — admin only. Returns pending
// requests with requester name + email + avatar.
router.get("/groups/:slug/join-requests", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const result = await requireAdmin(req.params.slug, user.id);
    if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

    const rows = await db
      .select({
        id: groupJoinRequestsTable.id,
        userId: groupJoinRequestsTable.userId,
        userName: usersTable.name,
        userEmail: usersTable.email,
        userAvatarUrl: usersTable.avatarUrl,
        requestedAt: groupJoinRequestsTable.requestedAt,
      })
      .from(groupJoinRequestsTable)
      .innerJoin(usersTable, eq(usersTable.id, groupJoinRequestsTable.userId))
      .where(and(
        eq(groupJoinRequestsTable.groupId, result.group.id),
        isNull(groupJoinRequestsTable.decision),
      ))
      .orderBy(asc(groupJoinRequestsTable.requestedAt));

    res.json({ requests: rows });
  } catch (err) {
    console.error("GET /api/groups/:slug/join-requests error:", err);
    res.status(500).json({ error: "Failed to load requests" });
  }
});

// POST /api/groups/:slug/join-requests/:id/accept — admin accepts.
// Inserts the group_members row, stamps the request, pushes the user.
router.post("/groups/:slug/join-requests/:id/accept", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const result = await requireAdmin(req.params.slug, user.id);
    if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId)) {
      res.status(400).json({ error: "Invalid request id" }); return;
    }

    const [reqRow] = await db
      .select()
      .from(groupJoinRequestsTable)
      .where(and(
        eq(groupJoinRequestsTable.id, requestId),
        eq(groupJoinRequestsTable.groupId, result.group.id),
      ));
    if (!reqRow) { res.status(404).json({ error: "Request not found" }); return; }
    if (reqRow.decision !== null) {
      res.status(400).json({ error: "Request already decided" }); return;
    }

    const [requester] = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, reqRow.userId));
    if (!requester) { res.status(404).json({ error: "User not found" }); return; }

    // Mint the membership (or reactivate a stale row if one exists).
    await db
      .insert(groupMembersTable)
      .values({
        groupId: result.group.id,
        userId: requester.id,
        email: requester.email.toLowerCase(),
        name: requester.name,
        role: "follower",
        inviteToken: crypto.randomBytes(16).toString("hex"),
        joinedAt: new Date(),
      })
      .onConflictDoNothing();

    // Stamp the request as accepted.
    await db
      .update(groupJoinRequestsTable)
      .set({
        decision: "accepted",
        decidedAt: new Date(),
        decidedByUserId: user.id,
      })
      .where(eq(groupJoinRequestsTable.id, requestId));

    // Reconcile group practices so the new member picks up tokens for
    // every group-scoped intercession.
    try { await reconcileAllPracticesForGroup(result.group.id); } catch { /* non-fatal */ }

    // Push the requester so they know they're in.
    await sendCommunityJoinAcceptedPush(requester.id, {
      groupSlug: result.group.slug,
      groupName: result.group.name,
    }).catch(err => console.error("[join-accept] requester push failed:", err));

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/groups/:slug/join-requests/:id/accept error:", err);
    res.status(500).json({ error: "Failed to accept request" });
  }
});

// POST /api/groups/:slug/join-requests/:id/reject — admin declines.
// Stamps the request; no membership row, no push to the user.
router.post("/groups/:slug/join-requests/:id/reject", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const result = await requireAdmin(req.params.slug, user.id);
    if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId)) {
      res.status(400).json({ error: "Invalid request id" }); return;
    }

    const [reqRow] = await db
      .select()
      .from(groupJoinRequestsTable)
      .where(and(
        eq(groupJoinRequestsTable.id, requestId),
        eq(groupJoinRequestsTable.groupId, result.group.id),
      ));
    if (!reqRow) { res.status(404).json({ error: "Request not found" }); return; }
    if (reqRow.decision !== null) {
      res.status(400).json({ error: "Request already decided" }); return;
    }

    await db
      .update(groupJoinRequestsTable)
      .set({
        decision: "rejected",
        decidedAt: new Date(),
        decidedByUserId: user.id,
      })
      .where(eq(groupJoinRequestsTable.id, requestId));

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/groups/:slug/join-requests/:id/reject error:", err);
    res.status(500).json({ error: "Failed to reject request" });
  }
});

// GET /api/me/pending-join-request-counts — for the drawer badge.
// Returns total pending requests across communities the caller admins.
router.get("/me/pending-join-request-counts", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const myAdminGroups = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.userId, user.id),
        inArray(groupMembersTable.role, ["admin", "hidden_admin"]),
      ));
    const groupIds = myAdminGroups.map(g => g.groupId);
    if (groupIds.length === 0) { res.json({ total: 0, byGroup: {} }); return; }

    const counts = await db
      .select({
        groupId: groupJoinRequestsTable.groupId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(groupJoinRequestsTable)
      .where(and(
        inArray(groupJoinRequestsTable.groupId, groupIds),
        isNull(groupJoinRequestsTable.decision),
      ))
      .groupBy(groupJoinRequestsTable.groupId);

    const byGroup: Record<number, number> = {};
    let total = 0;
    for (const c of counts) {
      const n = Number(c.count) || 0;
      byGroup[c.groupId] = n;
      total += n;
    }
    res.json({ total, byGroup });
  } catch (err) {
    console.error("GET /api/me/pending-join-request-counts error:", err);
    res.json({ total: 0, byGroup: {} });
  }
});

// POST /api/admin/announce — pilot admins only.
// Sends a platform-wide email to every user in the app.
router.post("/admin/announce", async (req, res): Promise<void> => {
  try {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    if (!(await isBetaAdmin(user.id))) {
      res.status(403).json({ error: "Platform admin access required" });
      return;
    }

    const schema = z.object({
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(10000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
    const { subject, body } = parsed.data;

    const recipients = await db
      .select({ email: usersTable.email })
      .from(usersTable);

    const results = await Promise.allSettled(
      recipients.map(r => sendAnnouncementEmail({ to: r.email, subject, body }))
    );

    const sent = results.filter(r => r.status === "fulfilled" && r.value === true).length;
    res.json({ sent, total: recipients.length });
  } catch (err) {
    console.error("POST /api/admin/announce error:", err);
    res.status(500).json({ error: "Failed to send announcement" });
  }
});

// ─── Group weekly plan (NOT YET PUBLIC — client UI is behind a flag) ─────────
// A church programs a checklist of practices for the week between Sundays
// ("read one CAC meditation", "Co-Breathe once", "sit in silence for 10
// minutes", "listen to a podcast"); members see it and tick items done. The
// week is identified by its Sunday (weekStart, YYYY-MM-DD — the client
// computes its local week's Sunday, same convention as the home rhythm).

const WEEK_START_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKLY_ITEM_KINDS = new Set(["cac", "cobreathe", "silence", "podcast", "custom", "pdf", "deck", "episode"]);
// The leader-authored CONTENT kinds carry a validated payload (slides / an
// episode snapshot / a pdf reference) — see lib/weeklyPayload.
const WEEKLY_CONTENT_KINDS = new Set(["pdf", "deck", "episode"]);

// GET /api/groups/:slug/weekly-plan?weekStart=YYYY-MM-DD — the week's
// checklist + which items THIS member has done + how many members have done
// each item (the church's shared momentum, not a leaderboard).
router.get("/groups/:slug/weekly-plan", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not a member" }); return; }
  const weekStart = String(req.query.weekStart ?? "");
  if (!WEEK_START_RE.test(weekStart)) { res.status(400).json({ error: "weekStart must be YYYY-MM-DD" }); return; }

  const items = await db.select().from(groupWeeklyItemsTable)
    .where(and(eq(groupWeeklyItemsTable.groupId, result.group.id), eq(groupWeeklyItemsTable.weekStart, weekStart)))
    .orderBy(asc(groupWeeklyItemsTable.sort), asc(groupWeeklyItemsTable.id));

  const itemIds = items.map((i) => i.id);
  const completions = itemIds.length === 0 ? [] : await db.select({
    itemId: groupWeeklyCompletionsTable.itemId,
    userId: groupWeeklyCompletionsTable.userId,
  }).from(groupWeeklyCompletionsTable).where(inArray(groupWeeklyCompletionsTable.itemId, itemIds));

  const doneCount = new Map<number, number>();
  const mine = new Set<number>();
  for (const c of completions) {
    doneCount.set(c.itemId, (doneCount.get(c.itemId) ?? 0) + 1);
    if (c.userId === user.id) mine.add(c.itemId);
  }
  res.json({
    weekStart,
    isAdmin: isAdminRole(result.member.role),
    items: items.map((i) => ({
      id: i.id, kind: i.kind, title: i.title, detail: i.detail, target: i.target, sort: i.sort,
      payload: i.payload ?? null,
      done: mine.has(i.id),
      doneCount: doneCount.get(i.id) ?? 0,
    })),
  });
});

// PUT /api/groups/:slug/weekly-plan — a leader authors (replaces) the week's
// checklist. Replace-all semantics per (group, week): items sent without an id
// are created; existing ids are updated in place (keeping their completions);
// existing items NOT sent are deleted (their completions cascade).
router.put("/groups/:slug/weekly-plan", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const body = req.body as { weekStart?: unknown; items?: unknown };
  const weekStart = typeof body?.weekStart === "string" ? body.weekStart : "";
  if (!WEEK_START_RE.test(weekStart)) { res.status(400).json({ error: "weekStart must be YYYY-MM-DD" }); return; }
  if (!Array.isArray(body.items) || body.items.length > 20) { res.status(400).json({ error: "items must be an array of at most 20" }); return; }

  const rawItems = body.items.map((raw, idx) => {
    const it = raw as { id?: unknown; kind?: unknown; title?: unknown; detail?: unknown; target?: unknown; payload?: unknown };
    const kind = typeof it.kind === "string" && WEEKLY_ITEM_KINDS.has(it.kind) ? it.kind : "custom";
    const title = typeof it.title === "string" ? it.title.trim().slice(0, 200) : "";
    const detail = typeof it.detail === "string" && it.detail.trim() ? it.detail.trim().slice(0, 500) : null;
    const targetN = typeof it.target === "number" && Number.isFinite(it.target) ? Math.max(1, Math.min(999, Math.round(it.target))) : 1;
    const id = typeof it.id === "number" && Number.isFinite(it.id) ? it.id : null;
    return { id, kind, title, detail, target: targetN, sort: idx, rawPayload: it.payload };
  }).filter((i) => i.title.length > 0);

  // Validate the content kinds' payloads (slide caps, pdf ownership, episode
  // snapshot shape). An invalid payload rejects the WHOLE save with the item
  // named, so a leader never silently loses a slideshow they authored.
  const items: Array<{ id: number | null; kind: string; title: string; detail: string | null; target: number; sort: number; payload: WeeklyItemPayload | null }> = [];
  for (const it of rawItems) {
    if (WEEKLY_CONTENT_KINDS.has(it.kind)) {
      const payload = await sanitizeWeeklyPayload(it.kind, it.rawPayload, result.group.id);
      if (!payload) {
        res.status(400).json({ error: "invalid_payload", kind: it.kind, title: it.title });
        return;
      }
      items.push({ id: it.id, kind: it.kind, title: it.title, detail: it.detail, target: it.target, sort: it.sort, payload });
    } else {
      items.push({ id: it.id, kind: it.kind, title: it.title, detail: it.detail, target: it.target, sort: it.sort, payload: null });
    }
  }

  const existing = await db.select({ id: groupWeeklyItemsTable.id }).from(groupWeeklyItemsTable)
    .where(and(eq(groupWeeklyItemsTable.groupId, result.group.id), eq(groupWeeklyItemsTable.weekStart, weekStart)));
  const existingIds = new Set(existing.map((e) => e.id));
  const keptIds = new Set(items.map((i) => i.id).filter((id): id is number => id != null && existingIds.has(id)));
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));

  if (toDelete.length > 0) {
    await db.delete(groupWeeklyItemsTable).where(inArray(groupWeeklyItemsTable.id, toDelete));
  }
  for (const it of items) {
    if (it.id != null && keptIds.has(it.id)) {
      await db.update(groupWeeklyItemsTable)
        .set({ kind: it.kind, title: it.title, detail: it.detail, target: it.target, sort: it.sort, payload: it.payload })
        .where(eq(groupWeeklyItemsTable.id, it.id));
    } else {
      await db.insert(groupWeeklyItemsTable).values({
        groupId: result.group.id, weekStart, kind: it.kind, title: it.title,
        detail: it.detail, target: it.target, sort: it.sort, payload: it.payload, createdByUserId: user.id,
      });
    }
  }
  res.json({ ok: true, count: items.length });
});

// POST /api/groups/:slug/weekly-plan/complete — a member ticks (or unticks)
// one item. Idempotent both ways (unique index absorbs double-taps).
router.post("/groups/:slug/weekly-plan/complete", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not a member" }); return; }

  const body = req.body as { itemId?: unknown; done?: unknown };
  const itemId = typeof body?.itemId === "number" && Number.isFinite(body.itemId) ? body.itemId : null;
  if (itemId == null) { res.status(400).json({ error: "itemId required" }); return; }
  const done = body?.done !== false; // default = mark done

  // The item must belong to THIS group — a member of one community can't tick
  // items in another by guessing ids.
  const [item] = await db.select({ id: groupWeeklyItemsTable.id }).from(groupWeeklyItemsTable)
    .where(and(eq(groupWeeklyItemsTable.id, itemId), eq(groupWeeklyItemsTable.groupId, result.group.id)));
  if (!item) { res.status(404).json({ error: "not found" }); return; }

  if (done) {
    await db.insert(groupWeeklyCompletionsTable)
      .values({ itemId, userId: user.id })
      .onConflictDoNothing();
  } else {
    await db.delete(groupWeeklyCompletionsTable)
      .where(and(eq(groupWeeklyCompletionsTable.itemId, itemId), eq(groupWeeklyCompletionsTable.userId, user.id)));
  }
  res.json({ ok: true, done });
});


// ═══ Community rule of life — praying WITH each other ════════════════════════
//
// Each community can carry ONE canonical rule of life (a prescribed-routine
// row pointed at by groups.rule_routine_id): the daily rhythm the community
// keeps together. Members adopt it in one tap (the shared routineSpec apply —
// offices, cards, silence; never their prayers/journals). And the week's
// fellowship is made visible WITHOUT surveillance: "you prayed with N people
// this week" counts distinct fellow community members with at least one
// practice signal this week — an aggregate number only, never who did or
// didn't. Presence, not attendance.

// GET /api/groups/:slug/rule — the community's rule (members).
router.get("/groups/:slug/rule", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Members only" }); return; }
  const ruleId = (result.group as { ruleRoutineId?: number | null }).ruleRoutineId ?? null;
  if (!ruleId) { res.json({ rule: null, isAdmin: isAdminRole(result.member.role) }); return; }
  const [row] = await db.select({
    label: prescribedRoutinesTable.label,
    spec: prescribedRoutinesTable.spec,
    acceptCount: prescribedRoutinesTable.acceptCount,
    token: prescribedRoutinesTable.token,
  }).from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.id, ruleId)).limit(1);
  if (!row) { res.json({ rule: null, isAdmin: isAdminRole(result.member.role) }); return; }
  res.json({
    // `token` powers the printable QR invite sign (/sign/:token) for admins.
    rule: { label: row.label, spec: row.spec, adoptCount: row.acceptCount, token: row.token },
    isAdmin: isAdminRole(result.member.role),
  });
});

// PUT /api/groups/:slug/rule — a leader sets (or replaces) the community's
// rule of life. A NEW prescribed-routine row is minted and the group pointer
// moves — any previously shared token links keep resolving to the rule they
// carried, and the adopt count starts fresh for the new rule.
router.put("/groups/:slug/rule", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }
  const body = (req.body ?? {}) as { spec?: unknown; label?: unknown };
  const spec = sanitizeSpec(body.spec);
  if (!spec) { res.status(400).json({ error: "Invalid routine spec" }); return; }
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null;
  const token = crypto.randomBytes(16).toString("hex");
  const [inserted] = await db.insert(prescribedRoutinesTable).values({
    token, groupId: result.group.id, createdByUserId: user.id, label, spec,
  }).returning({ id: prescribedRoutinesTable.id });
  if (!inserted) { res.status(500).json({ error: "internal_error" }); return; }
  await db.update(groupsTable)
    .set({ ruleRoutineId: inserted.id })
    .where(eq(groupsTable.id, result.group.id));
  res.json({ ok: true, token, url: `https://withphoebe.app/routine/${token}` });
});

// POST /api/groups/:slug/rule/adopt — a member takes up the community's rule:
// applies it to their account (same machinery as accepting a routine link)
// and counts the adoption. Returns the spec's ruleConfig so the client can
// mirror the routine onto the device immediately.
router.post("/groups/:slug/rule/adopt", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Members only" }); return; }
  const ruleId = (result.group as { ruleRoutineId?: number | null }).ruleRoutineId ?? null;
  if (!ruleId) { res.status(404).json({ error: "This community has no rule yet" }); return; }
  const [row] = await db.select({ id: prescribedRoutinesTable.id, spec: prescribedRoutinesTable.spec })
    .from(prescribedRoutinesTable).where(eq(prescribedRoutinesTable.id, ruleId)).limit(1);
  if (!row) { res.status(404).json({ error: "This community has no rule yet" }); return; }
  const spec = sanitizeSpec(row.spec);
  if (!spec) { res.status(422).json({ error: "Rule is no longer valid" }); return; }
  await applyRoutineSpecToUser(user.id, spec);
  await db.update(prescribedRoutinesTable)
    .set({ acceptCount: sql`${prescribedRoutinesTable.acceptCount} + 1` })
    .where(eq(prescribedRoutinesTable.id, row.id));
  res.json({ ok: true, ruleConfig: spec.ruleConfig });
});

// GET /api/me/prayed-with-week?weekStart=YYYY-MM-DD — "you prayed with N
// people this week." N = DISTINCT other members across all my joined
// communities with at least one practice signal this week:
//   • a practice_completion row whose week_start matches (the client writes
//     each member's own local Sunday there, so weeks align per-member)
//   • a completed prayer session (offices, contemplation, the breath)
//   • an amen on the prayer list
// AGGREGATE ONLY — this endpoint never returns names, ids, or who was
// missing. Presence, not attendance. viewerPracticed drives the copy ("you
// prayed with…" vs "…prayed this week"), same signals for the viewer.
router.get("/me/prayed-with-week", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const weekStartRaw = typeof req.query.weekStart === "string" ? req.query.weekStart : "";
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw)
    ? weekStartRaw
    : (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); })();
  try {
    // My joined communities → fellow member ids (me included, for viewerPracticed).
    const myGroups = await db.select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.userId, user.id), isNotNull(groupMembersTable.joinedAt)));
    const groupIds = myGroups.map((g) => g.groupId);
    if (groupIds.length === 0) { res.json({ count: 0, viewerPracticed: false, groups: [] }); return; }
    // groupId + userId pairs (not distinct users) so the per-group breakdown
    // below can attribute each practiced member to the group(s) they share
    // with the viewer.
    const memberRows = await db.select({ groupId: groupMembersTable.groupId, userId: groupMembersTable.userId })
      .from(groupMembersTable)
      .where(and(inArray(groupMembersTable.groupId, groupIds), isNotNull(groupMembersTable.joinedAt)));
    const memberIds = [...new Set(memberRows.map((m) => m.userId).filter((id): id is number => id != null))];
    if (memberIds.length <= 1) { res.json({ count: 0, viewerPracticed: false, groups: [] }); return; }

    const practiced = await practicedThisWeek(memberIds, weekStart);
    const viewerPracticed = practiced.has(user.id);
    practiced.delete(user.id);

    // Per-group breakdown — STILL aggregate-only (each entry is the viewer's
    // own community's name + a count; never names/ids of who practiced). The
    // splash uses it to say "you prayed with N people from St. Mark's".
    const groupNames = await db.select({ id: groupsTable.id, name: groupsTable.name })
      .from(groupsTable).where(inArray(groupsTable.id, groupIds));
    const nameById = new Map(groupNames.map((g) => [g.id, g.name]));
    const perGroup = new Map<number, number>();
    // Total OTHER joined members per group — the pool a count is drawn from.
    const othersByGroup = new Map<number, number>();
    for (const row of memberRows) {
      if (row.userId == null || row.userId === user.id) continue;
      othersByGroup.set(row.groupId, (othersByGroup.get(row.groupId) ?? 0) + 1);
      if (!practiced.has(row.userId)) continue;
      perGroup.set(row.groupId, (perGroup.get(row.groupId) ?? 0) + 1);
    }
    // Privacy floor (k-anonymity): only surface a NAMED per-group line when the
    // group has enough other members that a count can't finger a specific
    // person. In a 2–3 person circle, "you prayed with 1 from St. Mark's" would
    // identify exactly who practiced. Members of smaller groups still count
    // toward the aggregate `count` headline above — they're just not broken out
    // by community name.
    const PER_GROUP_MIN_OTHERS = 4;
    const groups = [...perGroup.entries()]
      .filter(([gid]) => (othersByGroup.get(gid) ?? 0) >= PER_GROUP_MIN_OTHERS)
      .map(([gid, count]) => ({ name: nameById.get(gid) ?? "your community", count }))
      .sort((a, b) => b.count - a.count);

    res.json({ count: practiced.size, viewerPracticed, groups });
  } catch (err) {
    console.error("[prayed-with-week] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// Which of `memberIds` practiced at least one thing in the week starting at
// `weekStart` (a Sunday, YYYY-MM-DD)? Signals:
//   • practice_completion — exact week_start match (each member's own local week)
//   • practice_log_entries — any log (weekly Way of Love, reading, listening…)
//     dated inside the week (lexical YYYY-MM-DD compare)
//   • prayer_sessions — a COMPLETED office, or any non-glance session ≥60s
//   • prayer_request_amens — praying the list
// Timestamp signals are BOUNDED to [weekStart−14h, weekStart+7d+14h] so a past
// weekStart returns THAT week, not cumulative-since (±14h absorbs any tz).
export async function practicedThisWeek(memberIds: number[], weekStart: string): Promise<Set<number>> {
  const sinceUtc = new Date(`${weekStart}T00:00:00Z`);
  sinceUtc.setUTCHours(sinceUtc.getUTCHours() - 14);
  const untilUtc = new Date(`${weekStart}T00:00:00Z`);
  untilUtc.setUTCDate(untilUtc.getUTCDate() + 7);
  untilUtc.setUTCHours(untilUtc.getUTCHours() + 14);
  // The week's last local day, for the string-dated practice-log compare.
  const weekEnd = new Date(`${weekStart}T00:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndYmd = weekEnd.toISOString().slice(0, 10);

  const practiced = new Set<number>();
  const completions = await db.selectDistinct({ userId: practiceCompletionTable.userId })
    .from(practiceCompletionTable)
    .where(and(inArray(practiceCompletionTable.userId, memberIds), eq(practiceCompletionTable.weekStart, weekStart)));
  for (const r of completions) practiced.add(r.userId);
  const logs = await db.selectDistinct({ userId: practiceLogEntriesTable.userId })
    .from(practiceLogEntriesTable)
    .where(and(
      inArray(practiceLogEntriesTable.userId, memberIds),
      gte(practiceLogEntriesTable.day, weekStart),
      lte(practiceLogEntriesTable.day, weekEndYmd),
    ));
  for (const r of logs) practiced.add(r.userId);
  // A session counts as "practiced" when it was a COMPLETED office (the
  // app-wide office invariant) or any other real practice of at least a
  // minute — never a sub-minute glance (prayer-list opens log a session on
  // sight so a brief look still records; that is not praying together).
  const sessions = await db.selectDistinct({ userId: prayerSessionsTable.userId })
    .from(prayerSessionsTable)
    .where(and(
      inArray(prayerSessionsTable.userId, memberIds),
      gte(prayerSessionsTable.endedAt, sinceUtc),
      lt(prayerSessionsTable.endedAt, untilUtc),
      or(
        eq(prayerSessionsTable.completed, true),
        and(ne(prayerSessionsTable.surface, "prayer-list"), gte(prayerSessionsTable.durationSeconds, 60)),
      ),
    ));
  for (const r of sessions) if (r.userId != null) practiced.add(r.userId);
  const amens = await db.selectDistinct({ userId: prayerRequestAmensTable.userId })
    .from(prayerRequestAmensTable)
    .where(and(
      inArray(prayerRequestAmensTable.userId, memberIds),
      gte(prayerRequestAmensTable.prayedAt, sinceUtc),
      lt(prayerRequestAmensTable.prayedAt, untilUtc),
    ));
  for (const r of amens) practiced.add(r.userId);
  return practiced;
}

// GET /api/me/rule-offers (BETA surface) — the communities I belong to that
// keep a rule of life, for the home's one-time "take up our rule" offer (the
// register path never sees the join-time offer). Returns slug/name/label only.
router.get("/me/rule-offers", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const rows = await db.select({
      slug: groupsTable.slug,
      name: groupsTable.name,
      ruleId: groupsTable.ruleRoutineId,
    }).from(groupMembersTable)
      .innerJoin(groupsTable, eq(groupsTable.id, groupMembersTable.groupId))
      .where(and(eq(groupMembersTable.userId, user.id), isNotNull(groupMembersTable.joinedAt), isNotNull(groupsTable.ruleRoutineId)));
    const ids = rows.map((r) => r.ruleId).filter((id): id is number => id != null);
    const labels = ids.length > 0
      ? await db.select({ id: prescribedRoutinesTable.id, label: prescribedRoutinesTable.label })
          .from(prescribedRoutinesTable).where(inArray(prescribedRoutinesTable.id, ids))
      : [];
    const labelById = new Map(labels.map((l) => [l.id, l.label]));
    res.json({
      offers: rows.map((r) => ({ slug: r.slug, name: r.name, label: r.ruleId != null ? (labelById.get(r.ruleId) ?? null) : null })),
    });
  } catch (err) {
    console.error("[rule-offers] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /api/groups/:slug/pulse (BETA surface) — the LEADER's aggregate read:
// how many of us practiced at least one thing this week. AGGREGATE ONLY with a
// PRIVACY FLOOR: under 4 members the count is withheld (null) so a tiny group
// can never be reverse-engineered into attendance. Never names, never who.
router.get("/groups/:slug/pulse", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }
  const weekStartRaw = typeof req.query.weekStart === "string" ? req.query.weekStart : "";
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw)
    ? weekStartRaw
    : (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); })();
  try {
    const memberRows = await db.select({ userId: groupMembersTable.userId })
      .from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, result.group.id), isNotNull(groupMembersTable.joinedAt)));
    const memberIds = memberRows.map((m) => m.userId).filter((id): id is number => id != null);
    const memberCount = memberIds.length;
    // PRIVACY FLOOR — with fewer than 4 members an aggregate IS attendance.
    if (memberCount < 4) { res.json({ count: null, memberCount }); return; }
    const practiced = await practicedThisWeek(memberIds, weekStart);
    res.json({ count: practiced.size, memberCount });
  } catch (err) {
    console.error("[group-pulse] failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── "Ways to get involved" opportunities ──────────────────────────────────
// An admin publishes opportunities (worship roles, service ministries,
// community groups, anything) scoped to their group; members tap "I'm
// interested", which notifies the group's admins. Rebuilt from the deleted
// Phoebe Parish system's identically-shaped feature (commit 094181c0),
// scoped to groupId instead of a parish's prayerFeedId. Reads require group
// membership (any tier — follower or above); writes are requireAdmin.

const OPP_CATEGORIES = ["worship", "serve", "community", "other"] as const;

const opportunityBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
  category: z.enum(OPP_CATEGORIES).default("other"),
  scheduleNote: z.string().trim().max(120).optional(),
  contact: z.string().trim().max(200).optional(),
});

// GET /api/groups/:slug/opportunities — the member board: every non-archived
// opportunity for this group, with an interest count and whether the viewer
// has raised their hand. Open to any joined member (follower or above).
router.get("/groups/:slug/opportunities", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }
  try {
    const opps = await db
      .select()
      .from(groupOpportunitiesTable)
      .where(and(
        eq(groupOpportunitiesTable.groupId, result.group.id),
        isNull(groupOpportunitiesTable.archivedAt),
      ))
      .orderBy(asc(groupOpportunitiesTable.createdAt));

    const oppIds = opps.map((o) => o.id);
    const counts = new Map<number, number>();
    const mine = new Set<number>();
    if (oppIds.length > 0) {
      const countRows = await db
        .select({ opportunityId: groupOpportunityInterestsTable.opportunityId, n: sql<number>`count(*)::int` })
        .from(groupOpportunityInterestsTable)
        .where(inArray(groupOpportunityInterestsTable.opportunityId, oppIds))
        .groupBy(groupOpportunityInterestsTable.opportunityId);
      for (const r of countRows) counts.set(r.opportunityId, Number(r.n));
      const mineRows = await db
        .select({ opportunityId: groupOpportunityInterestsTable.opportunityId })
        .from(groupOpportunityInterestsTable)
        .where(and(
          inArray(groupOpportunityInterestsTable.opportunityId, oppIds),
          eq(groupOpportunityInterestsTable.userId, user.id),
        ));
      for (const r of mineRows) mine.add(r.opportunityId);
    }

    res.json({
      isAdmin: isAdminRole(result.member.role),
      opportunities: opps.map((o) => ({
        id: o.id,
        title: o.title,
        description: o.description,
        category: o.category,
        scheduleNote: o.scheduleNote,
        contact: o.contact,
        interestCount: counts.get(o.id) ?? 0,
        viewerInterested: mine.has(o.id),
      })),
    });
  } catch (err) {
    console.error("[groups] list opportunities failed:", err);
    res.status(500).json({ error: "Failed to load opportunities." });
  }
});

// POST /api/groups/:slug/admin/opportunities — create (admin only).
router.post("/groups/:slug/admin/opportunities", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }
  const parsed = opportunityBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { title, description, category, scheduleNote, contact } = parsed.data;
  try {
    const [created] = await db.insert(groupOpportunitiesTable).values({
      groupId: result.group.id,
      title,
      description: description || null,
      category,
      scheduleNote: scheduleNote || null,
      contact: contact || null,
      createdByUserId: user.id,
    }).returning();
    res.status(201).json({ ok: true, id: created.id });
  } catch (err) {
    console.error("[groups] create opportunity failed:", err);
    res.status(500).json({ error: "Failed to create." });
  }
});

// PUT /api/groups/:slug/admin/opportunities/:id — edit (admin only).
router.put("/groups/:slug/admin/opportunities/:id", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = opportunityBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const { title, description, category, scheduleNote, contact } = parsed.data;
  try {
    const [opp] = await db.select().from(groupOpportunitiesTable).where(eq(groupOpportunitiesTable.id, id));
    if (!opp || opp.groupId !== result.group.id) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(groupOpportunitiesTable).set({
      title, description: description || null, category,
      scheduleNote: scheduleNote || null, contact: contact || null,
      updatedAt: new Date(),
    }).where(eq(groupOpportunitiesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[groups] edit opportunity failed:", err);
    res.status(500).json({ error: "Failed to save." });
  }
});

// POST /api/groups/:slug/admin/opportunities/:id/archive — soft-archive (admin only).
router.post("/groups/:slug/admin/opportunities/:id/archive", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [opp] = await db.select().from(groupOpportunitiesTable).where(eq(groupOpportunitiesTable.id, id));
    if (!opp || opp.groupId !== result.group.id) { res.status(404).json({ error: "Not found" }); return; }
    await db.update(groupOpportunitiesTable)
      .set({ archivedAt: new Date() })
      .where(eq(groupOpportunitiesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[groups] archive opportunity failed:", err);
    res.status(500).json({ error: "Failed to remove." });
  }
});

// GET /api/groups/:slug/admin/opportunities/:id/interests — who raised
// their hand (admin only).
router.get("/groups/:slug/admin/opportunities/:id/interests", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [opp] = await db.select().from(groupOpportunitiesTable).where(eq(groupOpportunitiesTable.id, id));
    if (!opp || opp.groupId !== result.group.id) { res.status(404).json({ error: "Not found" }); return; }
    const rows = await db
      .select()
      .from(groupOpportunityInterestsTable)
      .where(eq(groupOpportunityInterestsTable.opportunityId, id))
      .orderBy(desc(groupOpportunityInterestsTable.createdAt));
    res.json({
      title: opp.title,
      interests: rows.map((r) => ({
        name: r.name, email: r.email, note: r.note, at: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[groups] list opportunity interests failed:", err);
    res.status(500).json({ error: "Failed to load." });
  }
});

// POST /api/groups/:slug/opportunities/:id/interest — a member raises their
// hand. Idempotent (unique on opportunity+user); notifies group admins on
// the FIRST raise only. Rate-limited so the button can't spam admin lock
// screens.
router.post(
  "/groups/:slug/opportunities/:id/interest",
  perUserRateLimit("group_opportunity_interest", { max: 40, windowMs: 60 * 60 * 1000 }),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const slug = String(req.params.slug ?? "");
    const result = await requireMember(slug, user.id);
    if (!result) { res.status(404).json({ error: "Group not found" }); return; }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const note = typeof (req.body as { note?: unknown })?.note === "string"
      ? (req.body as { note: string }).note.trim().slice(0, 500) : null;
    try {
      const [opp] = await db.select().from(groupOpportunitiesTable).where(eq(groupOpportunitiesTable.id, id));
      if (!opp || opp.archivedAt || opp.groupId !== result.group.id) { res.status(404).json({ error: "Not found" }); return; }

      const [existing] = await db.select({ id: groupOpportunityInterestsTable.id })
        .from(groupOpportunityInterestsTable)
        .where(and(
          eq(groupOpportunityInterestsTable.opportunityId, id),
          eq(groupOpportunityInterestsTable.userId, user.id),
        ));
      const [userRow] = await db.select({ name: usersTable.name, email: usersTable.email })
        .from(usersTable).where(eq(usersTable.id, user.id));
      await db.insert(groupOpportunityInterestsTable).values({
        opportunityId: id,
        userId: user.id,
        name: userRow?.name ?? null,
        email: userRow?.email ?? null,
        note,
      }).onConflictDoUpdate({
        target: [groupOpportunityInterestsTable.opportunityId, groupOpportunityInterestsTable.userId],
        set: { name: userRow?.name ?? null, note },
      });

      // Notify the group's admins on the first hand-raise only.
      if (!existing) {
        const adminRows = await db.select({ userId: groupMembersTable.userId })
          .from(groupMembersTable)
          .where(and(
            eq(groupMembersTable.groupId, result.group.id),
            or(eq(groupMembersTable.role, "admin"), eq(groupMembersTable.role, "hidden_admin")),
            isNotNull(groupMembersTable.joinedAt),
          ));
        const adminIds = adminRows
          .map((r) => r.userId)
          .filter((uid): uid is number => typeof uid === "number" && uid !== user.id);
        if (adminIds.length > 0) {
          const who = (userRow?.name || "Someone").split(/\s+/)[0] || "Someone";
          void sendPushToUsers(adminIds, {
            title: `${who} is interested`,
            body: `"${opp.title}" — tap to see who's raising their hand.`,
            path: `/communities/${slug}?tab=hub`,
            threadId: "group-opportunity",
            collapseId: `group-opp-${id}`,
          }).catch((err) => console.warn("[groups] interest push failed:", err));
        }
      }
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("[groups] express interest failed:", err);
      res.status(500).json({ error: "Failed to submit." });
    }
  },
);

// DELETE /api/groups/:slug/opportunities/:id/interest — withdraw interest.
router.delete("/groups/:slug/opportunities/:id/interest", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(404).json({ error: "Group not found" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    await db.delete(groupOpportunityInterestsTable).where(and(
      eq(groupOpportunityInterestsTable.opportunityId, id),
      eq(groupOpportunityInterestsTable.userId, user.id),
    ));
    res.json({ ok: true });
  } catch (err) {
    console.error("[groups] withdraw interest failed:", err);
    res.status(500).json({ error: "Failed." });
  }
});

export default router;
