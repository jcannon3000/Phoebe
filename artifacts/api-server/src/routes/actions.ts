import { Router, type IRouter } from "express";
import { eq, and, ne, inArray, gte, asc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  actionsTable,
  actionRsvpsTable,
  actionOfficialsTable,
  actionEmailSendsTable,
  usersTable,
  groupsTable,
  groupMembersTable,
  sharedMomentsTable,
  betaUsersTable,
} from "@workspace/db";
import { sendNewActionPush } from "../lib/pushSender";

// ─── Community "actions" ─────────────────────────────────────────────────────
//
// An action is an advocacy / community-action event (a city-council
// meeting, a volunteer day, a witness vigil). Admin-created, community-
// scoped. Unlike a gathering it surfaces a dedicated detail PAGE with a
// description, a "Learn more" link, persisted RSVPs visible to the whole
// community, and an optionally attached intercession.
//
// Endpoints:
//   POST   /api/actions                       create (admin only)
//   GET    /api/actions/intercession-options   intercessions to attach
//   GET    /api/me/actions                     dashboard feed
//   GET    /api/actions/:id                    detail + RSVP roster
//   PUT    /api/actions/:id                    edit (creator / admin)
//   DELETE /api/actions/:id                    archive (creator / admin)
//   PUT    /api/actions/:id/rsvp               set / clear the viewer's RSVP

const router: IRouter = Router();

// ─── Auth helpers ────────────────────────────────────────────────────────────

async function isGroupAdmin(groupId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.userId, userId),
        sql`${groupMembersTable.role} IN ('admin', 'hidden_admin')`,
      ),
    )
    .limit(1);
  return !!row;
}

async function isGroupMember(groupId: number, userId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.userId, userId),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ),
    )
    .limit(1);
  return !!row;
}

// Creator OR an admin of the action's host community can edit / archive.
async function canManageAction(
  action: { creatorUserId: number; groupId: number },
  userId: number,
): Promise<boolean> {
  if (action.creatorUserId === userId) return true;
  return isGroupAdmin(action.groupId, userId);
}

// "Email your officials" is a beta-only feature. Gates who can attach
// officials to an action and who can log an email send.
async function isBetaUser(userId: number): Promise<boolean> {
  const [u] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u) return false;
  const [beta] = await db
    .select({ email: betaUsersTable.email })
    .from(betaUsersTable)
    .where(eq(betaUsersTable.email, u.email.toLowerCase()))
    .limit(1);
  return !!beta;
}

// ─── RSVP roster ─────────────────────────────────────────────────────────────
// Shared by GET /:id and PUT /:id/rsvp so the detail page can refresh the
// roster from a single response after an RSVP toggle.
type RsvpPerson = { userId: number; name: string; avatarUrl: string | null };

async function loadRsvpRoster(
  actionId: number,
): Promise<{ coming: RsvpPerson[]; maybe: RsvpPerson[] }> {
  const rows = await db
    .select({
      userId: actionRsvpsTable.userId,
      status: actionRsvpsTable.status,
      name: usersTable.name,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(actionRsvpsTable)
    .innerJoin(usersTable, eq(usersTable.id, actionRsvpsTable.userId))
    .where(eq(actionRsvpsTable.actionId, actionId))
    .orderBy(asc(actionRsvpsTable.createdAt));

  const coming: RsvpPerson[] = [];
  const maybe: RsvpPerson[] = [];
  for (const r of rows) {
    const person: RsvpPerson = {
      userId: r.userId,
      name: r.name ?? "Someone",
      avatarUrl: r.avatarUrl ?? null,
    };
    if (r.status === "coming") coming.push(person);
    else if (r.status === "maybe") maybe.push(person);
  }
  return { coming, maybe };
}

// ─── Create ──────────────────────────────────────────────────────────────────

const CreateActionBody = z.object({
  groupId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(8000),
  learnMoreUrl: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(500).optional(),
  eventAt: z.string().min(1),
  attachedMomentId: z.number().int().positive().nullable().optional(),
  // "Email your officials" (beta) — an optional subject line and the
  // officials to contact. Officials are dropped for non-beta creators.
  emailSubject: z.string().trim().max(200).optional(),
  officials: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        title: z.string().trim().max(160).optional(),
        email: z.string().trim().email().max(320),
      }),
    )
    .max(10)
    .optional(),
});

router.post("/actions", async (req, res): Promise<void> => {
  const userId = req.user ? (req.user as { id: number }).id : null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = CreateActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const eventAt = new Date(data.eventAt);
  if (isNaN(eventAt.getTime())) {
    res.status(400).json({ error: "Invalid eventAt date" });
    return;
  }

  // Only admins of the host community can create an action there.
  if (!(await isGroupAdmin(data.groupId, userId))) {
    res.status(403).json({ error: "Only community admins can create an action" });
    return;
  }

  // Validate the attached intercession (if any) belongs to this community.
  let attachedMomentId: number | null = null;
  if (data.attachedMomentId != null) {
    const [moment] = await db
      .select({ id: sharedMomentsTable.id, groupId: sharedMomentsTable.groupId })
      .from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.id, data.attachedMomentId))
      .limit(1);
    if (moment && moment.groupId === data.groupId) {
      attachedMomentId = moment.id;
    }
  }

  // Suppress an advance reminder whose window has already passed (or
  // lands on the creation day) — the on-creation push is the heads-up in
  // that case. UTC calendar-date math mirrors runActionReminderSender.
  const utcDate = (d: Date) => d.toISOString().slice(0, 10);
  const plusDaysUTC = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    return utcDate(d);
  };
  const eventDateStr = utcDate(eventAt);
  const weekReminderSentAt = eventDateStr <= plusDaysUTC(7) ? new Date() : null;
  const dayReminderSentAt = eventDateStr <= plusDaysUTC(1) ? new Date() : null;

  try {
    const [action] = await db
      .insert(actionsTable)
      .values({
        groupId: data.groupId,
        creatorUserId: userId,
        title: data.title,
        description: data.description,
        learnMoreUrl: data.learnMoreUrl?.trim() || null,
        location: data.location?.trim() || null,
        eventAt,
        attachedMomentId,
        emailSubject: data.emailSubject?.trim() || null,
        state: "active",
        weekReminderSentAt,
        dayReminderSentAt,
      })
      .returning();

    // "Email your officials" (beta only) — attach the target officials
    // so the detail page can surface the mailto flow. Silently dropped
    // for non-beta creators.
    if ((data.officials?.length ?? 0) > 0 && (await isBetaUser(userId))) {
      await db.insert(actionOfficialsTable).values(
        data.officials!.map((o) => ({
          actionId: action.id,
          name: o.name,
          title: o.title?.trim() || null,
          email: o.email.toLowerCase(),
        })),
      );
    }

    // Fan out the on-creation push to every joined member except the creator.
    const [group] = await db
      .select({ slug: groupsTable.slug, name: groupsTable.name })
      .from(groupsTable)
      .where(eq(groupsTable.id, data.groupId))
      .limit(1);
    const [creator] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (group) {
      const members = await db
        .select({ userId: groupMembersTable.userId })
        .from(groupMembersTable)
        .where(
          and(
            eq(groupMembersTable.groupId, data.groupId),
            sql`${groupMembersTable.joinedAt} IS NOT NULL`,
            ne(groupMembersTable.userId, userId),
          ),
        );
      const creatorName = creator?.name ?? "Someone";
      for (const m of members) {
        if (typeof m.userId === "number") {
          sendNewActionPush(m.userId, {
            actionId: action.id,
            actionTitle: action.title,
            creatorName,
            groupName: group.name,
          }).catch((err) => req.log.warn({ err }, "[action] new-action push failed"));
        }
      }
    }

    res.status(201).json({ action });
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create action");
    res.status(500).json({ error: "Failed to create action" });
  }
});

// ─── Intercession options (for the create form's picker) ─────────────────────

router.get("/actions/intercession-options", async (req, res): Promise<void> => {
  const userId = req.user ? (req.user as { id: number }).id : null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const groupId = Number(req.query.groupId);
  if (!Number.isFinite(groupId) || groupId <= 0) {
    res.status(400).json({ error: "groupId required" });
    return;
  }
  if (!(await isGroupAdmin(groupId, userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const moments = await db
    .select({
      id: sharedMomentsTable.id,
      name: sharedMomentsTable.name,
      intention: sharedMomentsTable.intention,
    })
    .from(sharedMomentsTable)
    .where(
      and(
        eq(sharedMomentsTable.groupId, groupId),
        eq(sharedMomentsTable.state, "active"),
      ),
    );
  res.json({ intercessions: moments });
});

// ─── Dashboard feed ──────────────────────────────────────────────────────────

router.get("/me/actions", async (req, res): Promise<void> => {
  const userId = req.user ? (req.user as { id: number }).id : null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // The user's joined communities.
  const myGroups = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(
      and(
        eq(groupMembersTable.userId, userId),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ),
    );
  const groupIds = [...new Set(myGroups.map((g) => g.groupId))];
  if (groupIds.length === 0) {
    res.json({ actions: [] });
    return;
  }

  // Active actions in those communities whose event hasn't fully passed.
  // "Earlier today" still counts — the dashboard re-buckets per the
  // user's own clock.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const rows = await db
    .select({
      id: actionsTable.id,
      title: actionsTable.title,
      eventAt: actionsTable.eventAt,
      location: actionsTable.location,
      groupId: actionsTable.groupId,
      attachedMomentId: actionsTable.attachedMomentId,
      groupName: groupsTable.name,
      groupEmoji: groupsTable.emoji,
      groupSlug: groupsTable.slug,
    })
    .from(actionsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, actionsTable.groupId))
    .where(
      and(
        inArray(actionsTable.groupId, groupIds),
        eq(actionsTable.state, "active"),
        gte(actionsTable.eventAt, startOfToday),
      ),
    )
    .orderBy(asc(actionsTable.eventAt));

  // RSVP counts + the viewer's own RSVP, in one query.
  const actionIds = rows.map((r) => r.id);
  const rsvpRows = actionIds.length
    ? await db
        .select({
          actionId: actionRsvpsTable.actionId,
          userId: actionRsvpsTable.userId,
          status: actionRsvpsTable.status,
        })
        .from(actionRsvpsTable)
        .where(inArray(actionRsvpsTable.actionId, actionIds))
    : [];
  const countsByAction = new Map<number, { coming: number; maybe: number }>();
  const myRsvpByAction = new Map<number, string>();
  for (const r of rsvpRows) {
    const c = countsByAction.get(r.actionId) ?? { coming: 0, maybe: 0 };
    if (r.status === "coming") c.coming += 1;
    else if (r.status === "maybe") c.maybe += 1;
    countsByAction.set(r.actionId, c);
    if (r.userId === userId) myRsvpByAction.set(r.actionId, r.status);
  }

  res.json({
    actions: rows.map((r) => ({
      id: r.id,
      title: r.title,
      eventAt: r.eventAt,
      location: r.location,
      groupId: r.groupId,
      groupName: r.groupName,
      groupEmoji: r.groupEmoji,
      groupSlug: r.groupSlug,
      hasAttachedPrayer: r.attachedMomentId != null,
      comingCount: countsByAction.get(r.id)?.coming ?? 0,
      maybeCount: countsByAction.get(r.id)?.maybe ?? 0,
      myRsvp: myRsvpByAction.get(r.id) ?? null,
    })),
  });
});

// ─── Detail ──────────────────────────────────────────────────────────────────

router.get("/actions/:id", async (req, res): Promise<void> => {
  const userId = req.user ? (req.user as { id: number }).id : null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const actionId = Number(req.params.id);
  if (!Number.isFinite(actionId)) {
    res.status(400).json({ error: "Invalid action id" });
    return;
  }

  const [action] = await db
    .select()
    .from(actionsTable)
    .where(eq(actionsTable.id, actionId))
    .limit(1);
  if (!action || action.state === "archived") {
    res.status(404).json({ error: "Action not found" });
    return;
  }

  // Only members (or admins) of the host community can view an action.
  const member = await isGroupMember(action.groupId, userId);
  const admin = member ? false : await isGroupAdmin(action.groupId, userId);
  if (!member && !admin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [group] = await db
    .select({
      id: groupsTable.id,
      name: groupsTable.name,
      emoji: groupsTable.emoji,
      slug: groupsTable.slug,
    })
    .from(groupsTable)
    .where(eq(groupsTable.id, action.groupId))
    .limit(1);

  const [creator] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, action.creatorUserId))
    .limit(1);

  let attachedIntercession: { id: number; name: string; intention: string } | null = null;
  if (action.attachedMomentId != null) {
    const [moment] = await db
      .select({
        id: sharedMomentsTable.id,
        name: sharedMomentsTable.name,
        intention: sharedMomentsTable.intention,
        state: sharedMomentsTable.state,
      })
      .from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.id, action.attachedMomentId))
      .limit(1);
    if (moment && moment.state === "active") {
      attachedIntercession = {
        id: moment.id,
        name: moment.name,
        intention: moment.intention,
      };
    }
  }

  const roster = await loadRsvpRoster(actionId);
  const myRsvp =
    roster.coming.some((p) => p.userId === userId)
      ? "coming"
      : roster.maybe.some((p) => p.userId === userId)
        ? "maybe"
        : null;

  // "Email your officials" — the target officials + how many emails
  // have been started so far. Empty officials list = no email section
  // on the detail page.
  const officials = await db
    .select({
      id: actionOfficialsTable.id,
      name: actionOfficialsTable.name,
      title: actionOfficialsTable.title,
      email: actionOfficialsTable.email,
    })
    .from(actionOfficialsTable)
    .where(eq(actionOfficialsTable.actionId, actionId))
    .orderBy(asc(actionOfficialsTable.id));
  let emailSendCount = 0;
  if (officials.length > 0) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(actionEmailSendsTable)
      .where(eq(actionEmailSendsTable.actionId, actionId));
    emailSendCount = count ?? 0;
  }

  res.json({
    action: {
      id: action.id,
      groupId: action.groupId,
      title: action.title,
      description: action.description,
      learnMoreUrl: action.learnMoreUrl,
      location: action.location,
      eventAt: action.eventAt,
      emailSubject: action.emailSubject,
      state: action.state,
      createdAt: action.createdAt,
    },
    group: group ?? null,
    creator: creator ?? null,
    attachedIntercession,
    officials,
    emailSendCount,
    rsvps: roster,
    myRsvp,
    canManage: await canManageAction(action, userId),
  });
});

// ─── Edit ────────────────────────────────────────────────────────────────────

const UpdateActionBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(8000).optional(),
  learnMoreUrl: z.string().trim().max(2000).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  eventAt: z.string().min(1).optional(),
  attachedMomentId: z.number().int().positive().nullable().optional(),
});

router.put("/actions/:id", async (req, res): Promise<void> => {
  const userId = req.user ? (req.user as { id: number }).id : null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const actionId = Number(req.params.id);
  if (!Number.isFinite(actionId)) {
    res.status(400).json({ error: "Invalid action id" });
    return;
  }
  const parsed = UpdateActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [action] = await db
    .select()
    .from(actionsTable)
    .where(eq(actionsTable.id, actionId))
    .limit(1);
  if (!action || action.state === "archived") {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (!(await canManageAction(action, userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.learnMoreUrl !== undefined)
    updates.learnMoreUrl = data.learnMoreUrl?.trim() || null;
  if (data.location !== undefined) updates.location = data.location?.trim() || null;
  if (data.eventAt !== undefined) {
    const d = new Date(data.eventAt);
    if (isNaN(d.getTime())) {
      res.status(400).json({ error: "Invalid eventAt date" });
      return;
    }
    updates.eventAt = d;
    // A reschedule re-arms the reminder pushes so the new date gets fresh
    // week-before / day-before nudges.
    updates.weekReminderSentAt = null;
    updates.dayReminderSentAt = null;
  }
  if (data.attachedMomentId !== undefined) {
    if (data.attachedMomentId === null) {
      updates.attachedMomentId = null;
    } else {
      const [moment] = await db
        .select({ id: sharedMomentsTable.id, groupId: sharedMomentsTable.groupId })
        .from(sharedMomentsTable)
        .where(eq(sharedMomentsTable.id, data.attachedMomentId))
        .limit(1);
      updates.attachedMomentId =
        moment && moment.groupId === action.groupId ? moment.id : null;
    }
  }

  const [updated] = await db
    .update(actionsTable)
    .set(updates)
    .where(eq(actionsTable.id, actionId))
    .returning();
  res.json({ action: updated });
});

// ─── Archive ─────────────────────────────────────────────────────────────────

router.delete("/actions/:id", async (req, res): Promise<void> => {
  const userId = req.user ? (req.user as { id: number }).id : null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const actionId = Number(req.params.id);
  if (!Number.isFinite(actionId)) {
    res.status(400).json({ error: "Invalid action id" });
    return;
  }

  const [action] = await db
    .select()
    .from(actionsTable)
    .where(eq(actionsTable.id, actionId))
    .limit(1);
  if (!action) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  if (!(await canManageAction(action, userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .update(actionsTable)
    .set({ state: "archived", updatedAt: new Date() })
    .where(eq(actionsTable.id, actionId));
  res.json({ ok: true });
});

// ─── RSVP ────────────────────────────────────────────────────────────────────

const RsvpBody = z.object({
  status: z.enum(["coming", "maybe"]).nullable(),
});

router.put("/actions/:id/rsvp", async (req, res): Promise<void> => {
  const userId = req.user ? (req.user as { id: number }).id : null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const actionId = Number(req.params.id);
  if (!Number.isFinite(actionId)) {
    res.status(400).json({ error: "Invalid action id" });
    return;
  }
  const parsed = RsvpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [action] = await db
    .select({ id: actionsTable.id, groupId: actionsTable.groupId, state: actionsTable.state })
    .from(actionsTable)
    .where(eq(actionsTable.id, actionId))
    .limit(1);
  if (!action || action.state === "archived") {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  const member = await isGroupMember(action.groupId, userId);
  const admin = member ? false : await isGroupAdmin(action.groupId, userId);
  if (!member && !admin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const status = parsed.data.status;
  if (status === null) {
    // Clearing an RSVP simply deletes the row.
    await db
      .delete(actionRsvpsTable)
      .where(
        and(
          eq(actionRsvpsTable.actionId, actionId),
          eq(actionRsvpsTable.userId, userId),
        ),
      );
  } else {
    await db
      .insert(actionRsvpsTable)
      .values({ actionId, userId, status })
      .onConflictDoUpdate({
        target: [actionRsvpsTable.actionId, actionRsvpsTable.userId],
        set: { status, updatedAt: new Date() },
      });
  }

  const roster = await loadRsvpRoster(actionId);
  res.json({ myRsvp: status, rsvps: roster });
});

// ─── Email-sent log ──────────────────────────────────────────────────────────
// Logged when a member opens a pre-filled email to one of the action's
// officials. Beta-only. Returns the refreshed total so the detail page
// can update the "N emails sent" line without a refetch.

const EmailSentBody = z.object({
  officialId: z.number().int().positive().nullable().optional(),
});

router.post("/actions/:id/email-sent", async (req, res): Promise<void> => {
  const userId = req.user ? (req.user as { id: number }).id : null;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const actionId = Number(req.params.id);
  if (!Number.isFinite(actionId)) {
    res.status(400).json({ error: "Invalid action id" });
    return;
  }
  const parsed = EmailSentBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [action] = await db
    .select({ id: actionsTable.id, groupId: actionsTable.groupId, state: actionsTable.state })
    .from(actionsTable)
    .where(eq(actionsTable.id, actionId))
    .limit(1);
  if (!action || action.state === "archived") {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  const member = await isGroupMember(action.groupId, userId);
  const admin = member ? false : await isGroupAdmin(action.groupId, userId);
  if (!member && !admin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if (!(await isBetaUser(userId))) {
    res.status(403).json({ error: "Beta-only feature" });
    return;
  }

  // Validate the official belongs to this action; null = unattributed.
  let officialId: number | null = null;
  if (parsed.data.officialId != null) {
    const [official] = await db
      .select({ id: actionOfficialsTable.id })
      .from(actionOfficialsTable)
      .where(
        and(
          eq(actionOfficialsTable.id, parsed.data.officialId),
          eq(actionOfficialsTable.actionId, actionId),
        ),
      )
      .limit(1);
    officialId = official ? official.id : null;
  }

  await db.insert(actionEmailSendsTable).values({ actionId, userId, officialId });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actionEmailSendsTable)
    .where(eq(actionEmailSendsTable.actionId, actionId));
  res.json({ emailSendCount: count ?? 0 });
});

export default router;
