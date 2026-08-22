import { Router, type IRouter } from "express";
import { eq, desc, or, sql, and, ne, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, ritualsTable, meetupsTable, ritualMessagesTable, usersTable, groupMembersTable, groupsTable, ritualGroupsTable } from "@workspace/db";
import { sendNewGatheringPush } from "../lib/pushSender";
import {
  CreateRitualBody,
  ListRitualsResponse,
  GetRitualParams,
  GetRitualResponse,
  UpdateRitualParams,
  UpdateRitualBody,
  UpdateRitualResponse,
  DeleteRitualParams,
  ListMeetupsParams,
  ListMeetupsResponse,
  LogMeetupParams,
  LogMeetupBody,
  ListMessagesParams,
  ListMessagesResponse,
  SendMessageParams,
  SendMessageBody,
  SendMessageResponse,
} from "@workspace/api-zod";
import { computeStreak } from "../lib/streak";
import { getWelcomeMessage, getCoordinatorResponse } from "../lib/agent";
import { z } from "zod/v4";

const router: IRouter = Router();

async function enrichRitual(ritual: typeof ritualsTable.$inferSelect, meetups: typeof meetupsTable.$inferSelect[]) {
  const { streak, lastMeetupDate, nextMeetupDate: computedNext, status } = computeStreak(meetups, ritual.frequency);

  // If no history yet, fall back to the earliest future planned meetup date
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

  // Find the upcoming meetup row to pull its per-meetup location. Fall back
  // to the legacy ritual-level location when the meetup row has none. We
  // also surface its id so client surfaces (dashboard card, detail
  // modal) can attach RSVPs to the right meetup without an extra
  // round-trip.
  let nextMeetupLocation: string | null = null;
  let nextMeetupId: number | null = null;
  if (nextMeetupDate) {
    const nextIso = nextMeetupDate;
    const match = meetups.find((m) => {
      try { return new Date(m.scheduledDate).toISOString() === nextIso; }
      catch { return false; }
    });
    nextMeetupLocation = match?.location ?? ritual.location ?? null;
    nextMeetupId = match?.id ?? null;
  } else {
    nextMeetupLocation = ritual.location ?? null;
  }

  // Additional invited communities (multi-community gatherings).
  // Includes names so the client can render an "Also visible to:" line
  // without a second round-trip. We exclude the primary host here so
  // the array is the literal "additional" set.
  let additionalGroups: Array<{ id: number; name: string; slug: string; emoji: string | null }> = [];
  try {
    const rows = await db
      .select({
        id: groupsTable.id,
        name: groupsTable.name,
        slug: groupsTable.slug,
        emoji: groupsTable.emoji,
      })
      .from(ritualGroupsTable)
      .innerJoin(groupsTable, eq(groupsTable.id, ritualGroupsTable.groupId))
      .where(eq(ritualGroupsTable.ritualId, ritual.id));
    additionalGroups = rows.filter((g) => g.id !== ritual.groupId);
  } catch {
    // ritual_groups table may not exist yet on fresh schemas; degrade
    // gracefully rather than 500'ing the whole list.
    additionalGroups = [];
  }

  return {
    ...ritual,
    streak,
    lastMeetupDate,
    nextMeetupDate,
    nextMeetupLocation,
    nextMeetupId,
    additionalGroupIds: additionalGroups.map((g) => g.id),
    additionalGroups,
    status,
  };
}

router.get("/rituals", async (req, res): Promise<void> => {
  // AuthZ: you may only list your OWN gatherings. This previously trusted
  // ?ownerId from the query (so any user's id could be enumerated) and,
  // with no param at all, fell through to an undefined WHERE that returned
  // EVERY ritual in the system — an unauthenticated cross-tenant dump of
  // meeting logistics. Derive the owner from the session and ignore any
  // client-supplied id.
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ownerId: number | null = sessionUserId;

  // Rituals visible through community membership — the user is a
  // joined member of either the ritual's primary host community
  // (ritualsTable.groupId) OR any community attached via the
  // ritual_groups join table. Computing the set of group ids first
  // keeps the WHERE clause simple and works whether or not the
  // ritual_groups table has any rows.
  let visibleViaCommunityRitualIds: number[] = [];
  if (ownerId !== null && !isNaN(ownerId)) {
    try {
      const joinedGroups = await db
        .select({ groupId: groupMembersTable.groupId })
        .from(groupMembersTable)
        .where(and(
          eq(groupMembersTable.userId, ownerId),
          sql`${groupMembersTable.joinedAt} IS NOT NULL`,
        ));
      const joinedGroupIds = joinedGroups.map((r) => r.groupId);
      if (joinedGroupIds.length > 0) {
        const [primaryRows, linkedRows] = await Promise.all([
          db
            .select({ id: ritualsTable.id })
            .from(ritualsTable)
            .where(inArray(ritualsTable.groupId, joinedGroupIds)),
          db
            .select({ id: ritualGroupsTable.ritualId })
            .from(ritualGroupsTable)
            .where(inArray(ritualGroupsTable.groupId, joinedGroupIds)),
        ]);
        const set = new Set<number>();
        for (const r of primaryRows) set.add(r.id);
        for (const r of linkedRows) set.add(r.id);
        visibleViaCommunityRitualIds = Array.from(set);
      }
    } catch {
      // ritual_groups may not exist on a fresh schema yet; fall through
      // with no community-membership broadening (existing owner path
      // still works).
    }
  }

  const whereClause = ownerId !== null && !isNaN(ownerId)
    ? visibleViaCommunityRitualIds.length > 0
      ? or(
          eq(ritualsTable.ownerId, ownerId),
          inArray(ritualsTable.id, visibleViaCommunityRitualIds),
        )
      : eq(ritualsTable.ownerId, ownerId)
    : undefined;

  const rituals = await db
    .select()
    .from(ritualsTable)
    .where(whereClause)
    .orderBy(desc(ritualsTable.createdAt));

  // Bulk-fetch every relevant meetup in a single query, then group by
  // ritualId. The old per-ritual select issued N queries and scaled
  // poorly when a user belonged to many communities with many
  // gatherings each.
  const ritualIds = rituals.map((r) => r.id);
  const allMeetups = ritualIds.length > 0
    ? await db.select().from(meetupsTable).where(inArray(meetupsTable.ritualId, ritualIds))
    : [];
  const meetupsByRitual = new Map<number, typeof meetupsTable.$inferSelect[]>();
  for (const m of allMeetups) {
    const list = meetupsByRitual.get(m.ritualId) ?? [];
    list.push(m);
    meetupsByRitual.set(m.ritualId, list);
  }

  const enriched = await Promise.all(
    rituals.map((r) => enrichRitual(r, meetupsByRitual.get(r.id) ?? [])),
  );
  res.json(ListRitualsResponse.parse(enriched));
});

router.post("/rituals", async (req, res): Promise<void> => {
  // Auth required — and the gathering is ALWAYS owned by the authenticated
  // caller. We never trust a client-supplied ownerId (that let an unauthed
  // caller create gatherings as anyone and fan out pushes on their behalf).
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ownerId = sessionUserId;
  const parsed = CreateRitualBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  try {
    const location = parsed.data.location?.trim() || null;

    const body = parsed.data as typeof parsed.data & {
      rhythm?: string;
      hasIntercession?: boolean;
      hasFasting?: boolean;
      intercessionIntention?: string | null;
      fastingDescription?: string | null;
    };

    // `template` isn't in the generated zod schema yet, so pull it off the
    // raw body. Keeps the dashboard emoji accurate (e.g. 🚶🏽 for walks).
    const rawTemplate = req.body?.template;
    const template = typeof rawTemplate === "string" && rawTemplate.trim() ? rawTemplate.trim() : null;

    // `groupId` is set by the community gathering flow (ritual is
    // scoped to a community). Pulled off the raw body — not in the
    // generated zod schema yet. Null for personal gatherings.
    const rawGroupId = req.body?.groupId;
    const groupId = typeof rawGroupId === "number" && Number.isFinite(rawGroupId) ? rawGroupId : null;

    // `meetingUrl` — set by the "Video call" gathering format. Pulled
    // off the raw body (not in the generated zod schema yet). Accepts
    // any http(s) URL (Zoom / Meet / Teams). Null for in-person
    // gatherings. We constrain to http(s) so a javascript: URI can't
    // ride in via a hand-crafted request.
    const rawMeetingUrl = req.body?.meetingUrl;
    const meetingUrl =
      typeof rawMeetingUrl === "string" && /^https?:\/\/\S+$/i.test(rawMeetingUrl.trim())
        ? rawMeetingUrl.trim()
        : null;

    // `additionalGroupIds` — communities other than the primary host
    // that should also see / be invited to this gathering. Each id
    // must belong to a group the caller admins (admin or hidden_admin
    // role); the API does the membership check so a hand-crafted
    // request can't push gatherings into a community the creator
    // doesn't own. The primary groupId is removed if it accidentally
    // appears in the additional list, and duplicates are collapsed.
    const rawAdditionalGroupIds = req.body?.additionalGroupIds;
    let additionalGroupIds: number[] = [];
    if (Array.isArray(rawAdditionalGroupIds)) {
      const candidate = Array.from(
        new Set(
          rawAdditionalGroupIds
            .map((v: unknown) => Number(v))
            .filter((n: number) => Number.isFinite(n) && n > 0),
        ),
      ).filter((id) => id !== groupId);
      if (candidate.length > 0) {
        const owns = await db
          .select({ groupId: groupMembersTable.groupId })
          .from(groupMembersTable)
          .where(
            and(
              eq(groupMembersTable.userId, ownerId),
              inArray(groupMembersTable.groupId, candidate),
              sql`${groupMembersTable.joinedAt} IS NOT NULL`,
              or(
                eq(groupMembersTable.role, "admin"),
                eq(groupMembersTable.role, "hidden_admin"),
              ),
            ),
          );
        const ownedSet = new Set(owns.map((r) => r.groupId));
        additionalGroupIds = candidate.filter((id) => ownedSet.has(id));
      }
    }

    // Atomic create: the gathering row + its additional-community
    // junction rows commit together. A failure between the two left a
    // gathering that the host community could see but the additional
    // communities couldn't — a silent, hard-to-diagnose "why isn't
    // this showing up for the other group" bug. Push fan-out + the
    // welcome-message insert stay OUTSIDE (fire-and-forget side
    // effects, below).
    const ritual = await db.transaction(async (tx) => {
      const [insertedRitual] = await tx
        .insert(ritualsTable)
        .values({
          name: body.name,
          description: body.description ?? null,
          frequency: body.frequency,
          dayPreference: body.dayPreference ?? null,
          intention: body.intention ?? null,
          location,
          meetingUrl,
          ownerId,
          rhythm: body.rhythm ?? "fortnightly",
          hasIntercession: body.hasIntercession ?? false,
          hasFasting: body.hasFasting ?? false,
          intercessionIntention: body.intercessionIntention ?? null,
          fastingDescription: body.fastingDescription ?? null,
          template,
          groupId,
        })
        .returning();

      // Write additional-community links (multi-community gatherings).
      if (additionalGroupIds.length > 0) {
        await tx.insert(ritualGroupsTable).values(
          additionalGroupIds.map((gid) => ({ ritualId: insertedRitual.id, groupId: gid })),
        ).onConflictDoNothing();
      }

      return insertedRitual;
    });

    const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
    const enriched = await enrichRitual(ritual, meetups);

    const ctx = {
      ritual: enriched,
      streak: enriched.streak,
      lastMeetupDate: enriched.lastMeetupDate,
      nextMeetupDate: enriched.nextMeetupDate,
    };

    // Fan out new-gathering push to joined members of EVERY linked
    // community (primary + additional), deduped by userId so a person
    // in both communities only gets one push. The deep-link uses the
    // primary host's slug since that's the canonical "where this lives"
    // address.
    if (groupId) {
      const [group] = await db.select({ slug: groupsTable.slug }).from(groupsTable).where(eq(groupsTable.id, groupId));
      const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, ritual.ownerId));
      if (group) {
        const linkedGroupIds = [groupId, ...additionalGroupIds];
        const members = await db
          .select({ userId: groupMembersTable.userId })
          .from(groupMembersTable)
          .where(and(
            inArray(groupMembersTable.groupId, linkedGroupIds),
            sql`${groupMembersTable.joinedAt} IS NOT NULL`,
            ne(groupMembersTable.userId, ritual.ownerId),
          ));
        const creatorName = creator?.name ?? "Someone";
        const sentTo = new Set<number>();
        members.forEach(m => {
          if (typeof m.userId === "number" && !sentTo.has(m.userId)) {
            sentTo.add(m.userId);
            sendNewGatheringPush(m.userId, {
              ritualId: ritual.id,
              groupSlug: group.slug,
              gatheringName: ritual.name,
              creatorName,
            }).catch(err => req.log.warn({ err }, "[gathering] new-gathering push failed"));
          }
        });
      }
    }

    // Fire-and-forget: generate welcome message (non-blocking)
    getWelcomeMessage(ctx)
      .then(async (welcome) => {
        await db.insert(ritualMessagesTable).values({
          ritualId: ritual.id,
          role: "assistant",
          content: welcome,
        });
      })
      .catch((err: unknown) => req.log.warn({ err }, "Failed to generate welcome message"));

    res.status(201).json({ ...enriched, id: ritual.id });
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create ritual");
    res.status(500).json({ error: "Failed to create ritual" });
  }
});

router.get("/rituals/:id", async (req, res): Promise<void> => {
  const params = GetRitualParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // AuthZ: only a member of the gathering may read it. Previously this
  // only checked the ritual existed, so any id could be enumerated to read
  // a stranger's participants, chat history, and meeting logistics.
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await getRitualAccess(params.data.id, sessionUserId);
  if (!access) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (!access.isMember) { res.status(403).json({ error: "Only members of this gathering can view it" }); return; }
  const ritual = access.ritual;

  const [meetups, messages] = await Promise.all([
    db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id)).orderBy(desc(meetupsTable.scheduledDate)),
    db.select().from(ritualMessagesTable).where(eq(ritualMessagesTable.ritualId, ritual.id)).orderBy(ritualMessagesTable.createdAt),
  ]);

  const enriched = await enrichRitual(ritual, meetups);

  res.json(
    GetRitualResponse.parse({
      ...enriched,
      meetups,
      messages,
    })
  );
});

// Caller's access to a gathering. isMember = owner OR a joined member of the
// host community; isGroupAdmin = a joined admin / hidden_admin of the host
// community. Used to gate the gathering's read/write routes, which
// previously only checked that the ritual existed — so any signed-in user
// could overwrite a gathering, read/inject its chat, or log meetups for it
// by guessing the id.
async function getRitualAccess(ritualId: number, sessionUserId: number): Promise<
  { ritual: typeof ritualsTable.$inferSelect; isOwner: boolean; isGroupAdmin: boolean; isMember: boolean } | null
> {
  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) return null;
  const isOwner = ritual.ownerId === sessionUserId;
  let isMember = isOwner;
  let isGroupAdmin = false;

  if (ritual.groupId) {
    const [m] = await db.select({ role: groupMembersTable.role })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, ritual.groupId),
        eq(groupMembersTable.userId, sessionUserId),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ));
    if (m) { isMember = true; if (m.role === "admin" || m.role === "hidden_admin") isGroupAdmin = true; }
  }
  return { ritual, isOwner, isGroupAdmin, isMember };
}

router.put("/rituals/:id", async (req, res): Promise<void> => {
  const params = UpdateRitualParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRitualBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // AuthZ: only the owner or a community admin may edit a gathering. (Was
  // unauthenticated + IDOR — any caller could overwrite name/etc.)
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await getRitualAccess(params.data.id, sessionUserId);
  if (!access) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (!access.isOwner && !access.isGroupAdmin) {
    res.status(403).json({ error: "Only the owner or a community admin can edit this gathering" });
    return;
  }

  const updateData: Partial<typeof ritualsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.frequency !== undefined) updateData.frequency = parsed.data.frequency;
  if (parsed.data.dayPreference !== undefined) updateData.dayPreference = parsed.data.dayPreference;
  if (parsed.data.intention !== undefined) updateData.intention = parsed.data.intention;

  const [ritual] = await db
    .update(ritualsTable)
    .set(updateData)
    .where(eq(ritualsTable.id, params.data.id))
    .returning();

  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
  const enriched = await enrichRitual(ritual, meetups);
  res.json(UpdateRitualResponse.parse(enriched));
});

// ─── GET /api/rituals/:id/groups — list communities a gathering is shared with
// Primary group (ritualsTable.groupId) + any rows in ritual_groups.
// Mirrors GET /moments/:id/groups so the gathering admin UI reads the
// same shape as the intercession admin UI.
router.get("/rituals/:id/groups", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Gathering not found" }); return; }

  let extraGroupIds: number[] = [];
  try {
    const extraLinks = await db.select({ groupId: ritualGroupsTable.groupId })
      .from(ritualGroupsTable)
      .where(eq(ritualGroupsTable.ritualId, ritualId));
    extraGroupIds = extraLinks.map(l => l.groupId);
  } catch {
    // ritual_groups may not be migrated yet — degrade to empty list.
    extraGroupIds = [];
  }

  // Membership gate: caller must be a joined member of at least one
  // community this gathering belongs to (primary or any extra). The
  // gathering owner is also let through. Otherwise any signed-in user
  // could enumerate which communities a stranger's gathering touches.
  let allowed = ritual.ownerId === sessionUserId;
  if (!allowed) {
    const groupIdsToCheck = [
      ...(ritual.groupId ? [ritual.groupId] : []),
      ...extraGroupIds,
    ];
    if (groupIdsToCheck.length > 0) {
      const [membership] = await db.select({ id: groupMembersTable.id })
        .from(groupMembersTable)
        .where(and(
          inArray(groupMembersTable.groupId, groupIdsToCheck),
          eq(groupMembersTable.userId, sessionUserId),
          sql`${groupMembersTable.joinedAt} IS NOT NULL`,
        ));
      if (membership) allowed = true;
    }
  }
  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const primary = ritual.groupId
    ? (await db.select().from(groupsTable).where(eq(groupsTable.id, ritual.groupId)))[0]
    : null;
  const extraGroups = extraGroupIds.length > 0
    ? await db.select().from(groupsTable).where(inArray(groupsTable.id, extraGroupIds))
    : [];

  res.json({
    primary: primary ? { id: primary.id, name: primary.name, slug: primary.slug, emoji: primary.emoji } : null,
    additional: extraGroups.map(g => ({ id: g.id, name: g.name, slug: g.slug, emoji: g.emoji })),
  });
});

// ─── POST /api/rituals/:id/groups — share a gathering with another community.
// Body: { groupId: number }. Caller must be an admin (admin | hidden_admin)
// of the target community AND must be a member of the gathering's primary
// community. The target's joined members are NOT auto-added as participants
// (unlike intercessions) — gatherings don't have a per-person token roster
// the way intercessions do; they're discovered by community list views, so
// just adding the junction row is enough.
const attachRitualGroupSchema = z.object({ groupId: z.number().int().positive() });
router.post("/rituals/:id/groups", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = attachRitualGroupSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const targetGroupId = parsed.data.groupId;

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Gathering not found" }); return; }

  // Permission has two parts:
  //   1. Caller must admin the TARGET community (so they're authorized
  //      to pull content onto their members' dashboards).
  //   2. Caller must also have authority over the GATHERING itself —
  //      either the original owner OR an admin of the primary host
  //      community. Without this, any community admin who learned a
  //      ritual id could fan a stranger's gathering into their feed.
  const [targetMembership] = await db.select().from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, targetGroupId),
      eq(groupMembersTable.userId, sessionUserId),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
    ));
  if (!targetMembership || (targetMembership.role !== "admin" && targetMembership.role !== "hidden_admin")) {
    res.status(403).json({ error: "You must be an admin of that community" });
    return;
  }
  let authorizedOnRitual = ritual.ownerId === sessionUserId;
  if (!authorizedOnRitual && ritual.groupId) {
    const [primaryMembership] = await db.select().from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, ritual.groupId),
        eq(groupMembersTable.userId, sessionUserId),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ));
    if (primaryMembership && (primaryMembership.role === "admin" || primaryMembership.role === "hidden_admin")) {
      authorizedOnRitual = true;
    }
  }
  if (!authorizedOnRitual) {
    res.status(403).json({ error: "You don't have permission to share this gathering" });
    return;
  }

  // No-op if target == primary or already linked.
  if (ritual.groupId === targetGroupId) {
    res.json({ ok: true, alreadyLinked: true });
    return;
  }
  const [existing] = await db.select().from(ritualGroupsTable)
    .where(and(eq(ritualGroupsTable.ritualId, ritualId), eq(ritualGroupsTable.groupId, targetGroupId)));
  if (existing) {
    res.json({ ok: true, alreadyLinked: true });
    return;
  }

  await db.insert(ritualGroupsTable).values({ ritualId, groupId: targetGroupId }).onConflictDoNothing();
  res.json({ ok: true });
});

// ─── DELETE /api/rituals/:id/groups/:groupId — detach a gathering from a
// secondary community. Caller must admin the community being removed. The
// primary groupId is never deleted via this endpoint — that would orphan
// the gathering.
router.delete("/rituals/:id/groups/:groupId", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  const targetGroupId = parseInt(req.params.groupId, 10);
  if (isNaN(ritualId) || isNaN(targetGroupId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [myMembership] = await db.select().from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, targetGroupId),
      eq(groupMembersTable.userId, sessionUserId),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
    ));
  if (!myMembership || (myMembership.role !== "admin" && myMembership.role !== "hidden_admin")) {
    res.status(403).json({ error: "You must be an admin of that community" });
    return;
  }

  await db.delete(ritualGroupsTable)
    .where(and(eq(ritualGroupsTable.ritualId, ritualId), eq(ritualGroupsTable.groupId, targetGroupId)));

  res.json({ ok: true });
});

router.delete("/rituals/:id", async (req, res): Promise<void> => {
  const params = DeleteRitualParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Permission: caller must be either the original owner OR an admin
  // (admin | hidden_admin) of the gathering's primary host community.
  // Community admins manage their community's gatherings, even when
  // the gathering was created by someone else (a former member, etc.).
  const [ritual] = await db.select({
    ownerId: ritualsTable.ownerId,
    groupId: ritualsTable.groupId,
  }).from(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  if (!ritual) { res.status(404).json({ error: "Tradition not found" }); return; }

  let allowed = ritual.ownerId === sessionUserId;
  if (!allowed && ritual.groupId) {
    const [membership] = await db.select({ role: groupMembersTable.role })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, ritual.groupId),
        eq(groupMembersTable.userId, sessionUserId),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ));
    if (membership && (membership.role === "admin" || membership.role === "hidden_admin")) {
      allowed = true;
    }
  }
  if (!allowed) {
    res.status(403).json({ error: "Only the owner or a community admin can delete this gathering" });
    return;
  }

  // Delete all dependent records (tables without ON DELETE CASCADE in the actual DB)
  await db.delete(meetupsTable).where(eq(meetupsTable.ritualId, params.data.id));
  await db.delete(ritualMessagesTable).where(eq(ritualMessagesTable.ritualId, params.data.id));
  // ritual_groups (multi-community share junction). Wrap in try/catch
  // so a fresh DB without the table doesn't break delete.
  try {
    await db.delete(ritualGroupsTable).where(eq(ritualGroupsTable.ritualId, params.data.id));
  } catch { /* table may not exist on stale schemas */ }

  await db.delete(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/rituals/:id/meetups", async (req, res): Promise<void> => {
  const params = ListMeetupsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // AuthZ: only a member may list a gathering's meetups (times, locations,
  // notes). Was existence-only, so any id could be enumerated by a stranger.
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await getRitualAccess(params.data.id, sessionUserId);
  if (!access) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (!access.isMember) { res.status(403).json({ error: "Only members of this gathering can view its meetups" }); return; }

  const meetups = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.ritualId, params.data.id))
    .orderBy(desc(meetupsTable.scheduledDate));

  res.json(ListMeetupsResponse.parse(meetups));
});

router.post("/rituals/:id/meetups", async (req, res): Promise<void> => {
  const params = LogMeetupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = LogMeetupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // AuthZ: only a member of the gathering may log meetups (was existence-only,
  // so any signed-in user could inject meetups).
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await getRitualAccess(params.data.id, sessionUserId);
  if (!access) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (!access.isMember) { res.status(403).json({ error: "Only members of this gathering can log meetups" }); return; }

  const [meetup] = await db
    .insert(meetupsTable)
    .values({
      ritualId: params.data.id,
      scheduledDate: new Date(parsed.data.scheduledDate).toISOString(),
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  res.status(201).json(meetup);
});

router.get("/rituals/:id/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // AuthZ: only a member may read a gathering's chat history (was unauthed —
  // any caller could read any gathering's messages by id).
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await getRitualAccess(params.data.id, sessionUserId);
  if (!access) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (!access.isMember) { res.status(403).json({ error: "Forbidden" }); return; }

  const messages = await db
    .select()
    .from(ritualMessagesTable)
    .where(eq(ritualMessagesTable.ritualId, params.data.id))
    .orderBy(ritualMessagesTable.createdAt);

  res.json(ListMessagesResponse.parse(messages));
});

router.post("/rituals/:id/chat", async (req, res): Promise<void> => {
  const params = SendMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // AuthZ: only a member of the gathering may post to its chat (was existence-
  // only — any signed-in user could inject messages into any gathering).
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await getRitualAccess(params.data.id, sessionUserId);
  if (!access) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (!access.isMember) { res.status(403).json({ error: "Only members of this gathering can post" }); return; }
  const ritual = access.ritual;

  await db.insert(ritualMessagesTable).values({
    ritualId: params.data.id,
    role: "user",
    content: parsed.data.content,
  });

  const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
  const { streak, lastMeetupDate, nextMeetupDate } = computeStreak(meetups, ritual.frequency);

  const allMessages = await db
    .select()
    .from(ritualMessagesTable)
    .where(eq(ritualMessagesTable.ritualId, params.data.id))
    .orderBy(ritualMessagesTable.createdAt);

  const chatHistory = allMessages.slice(0, -1).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const aiResponse = await getCoordinatorResponse(
    { ritual, streak, lastMeetupDate, nextMeetupDate },
    chatHistory,
    parsed.data.content
  );

  const [savedMsg] = await db
    .insert(ritualMessagesTable)
    .values({
      ritualId: params.data.id,
      role: "assistant",
      content: aiResponse,
    })
    .returning();

  res.json(SendMessageResponse.parse(savedMsg));
});

// PATCH /api/rituals/:id/proposed-times — auth-required
const ISOTimestamp = z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Must be a valid ISO timestamp" });
const ProposedTimesBody = z.object({
  proposedTimes: z.array(ISOTimestamp).min(1).max(3),
  confirmedTime: ISOTimestamp.optional(),
  location: z.string().optional(),
});

router.patch("/rituals/:id/proposed-times", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = ProposedTimesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const updatePayload: Partial<typeof ritualsTable.$inferInsert> = {
    proposedTimes: parsed.data.proposedTimes,
  };
  if (parsed.data.confirmedTime !== undefined) {
    updatePayload.confirmedTime = parsed.data.confirmedTime;
  }
  // We still mirror location onto the ritual row for backward compatibility
  // with older clients that read `ritual.location`, but the source of truth
  // going forward is the per-meetup `meetups.location` column.
  if (parsed.data.location !== undefined) {
    updatePayload.location = parsed.data.location || null;
  }

  let updated: typeof ritualsTable.$inferSelect | undefined;
  try {
    [updated] = await db
      .update(ritualsTable)
      .set(updatePayload)
      .where(eq(ritualsTable.id, id))
      .returning();
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to update ritual proposed-times");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to update proposed times" });
    return;
  }

  if (!updated) {
    res.status(404).json({ error: "Ritual not found after update" });
    return;
  }

  // Create a planned meetup row so dashboard shows the proposed date.
  // Location is per-meetup: when the organizer supplies a location with
  // proposed times, stamp it onto the planned meetup row.
  try {
    if (parsed.data.proposedTimes && parsed.data.proposedTimes.length > 0) {
      const placeholderTimeISO = new Date(parsed.data.proposedTimes[0]).toISOString();
      const meetupLocation = parsed.data.location !== undefined
        ? (parsed.data.location.trim() || null)
        : undefined;
      const existingMeetups = await db
        .select()
        .from(meetupsTable)
        .where(eq(meetupsTable.ritualId, id));
      const existingPlanned = existingMeetups.find((m) => m.status === "planned");

      if (existingPlanned) {
        const meetupPatch: Partial<typeof meetupsTable.$inferInsert> = { scheduledDate: placeholderTimeISO };
        if (meetupLocation !== undefined) meetupPatch.location = meetupLocation;
        await db.update(meetupsTable).set(meetupPatch).where(eq(meetupsTable.id, existingPlanned.id));
      } else {
        await db.insert(meetupsTable).values({
          ritualId: id,
          scheduledDate: placeholderTimeISO,
          status: "planned",
          location: meetupLocation ?? null,
        }).returning();
      }
    }
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create/update planned meetup for proposed-times");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save meetup" });
    return;
  }

  res.json({ proposedTimes: updated.proposedTimes, confirmedTime: updated.confirmedTime });
});

// GET /api/rituals/:id/timeline — returns upcoming (planned) meetup + past meetups
router.get("/rituals/:id/timeline", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const allMeetups = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.ritualId, id))
    .orderBy(desc(meetupsTable.scheduledDate));

  // The upcoming meetup is the most recent "planned" one
  let upcoming = allMeetups.find((m) => m.status === "planned") ?? null;

  // Also check if ritual.confirmedTime has a matching planned meetup; if not, create one
  if (ritual.confirmedTime && !upcoming) {
    const confirmedTime = new Date(ritual.confirmedTime);
    if (confirmedTime > new Date()) {
      const [newMeetup] = await db
        .insert(meetupsTable)
        .values({ ritualId: id, scheduledDate: confirmedTime.toISOString(), status: "planned" })
        .returning();
      upcoming = newMeetup;
    }
  }

  const past = allMeetups.filter((m) => m.status !== "planned");

  // Location is per-meetup: prefer the upcoming meetup's location, fall
  // back to the legacy ritual-level location for older rows.
  const upcomingLocation = upcoming?.location ?? ritual.location ?? null;

  // scheduled_date is a text column in Postgres, so drizzle hands it back
  // as a string. Normalize to an ISO string via new Date() so the client
  // can parseISO it regardless of whether the row was written with a Date
  // object or a pre-stringified ISO value.
  const toIso = (v: unknown): string => {
    if (v instanceof Date) return v.toISOString();
    return new Date(String(v)).toISOString();
  };

  res.json({
    upcoming: upcoming
      ? { ...upcoming, scheduledDate: toIso(upcoming.scheduledDate), location: upcoming.location ?? null }
      : null,
    past: past.map((m) => ({ ...m, scheduledDate: toIso(m.scheduledDate), location: m.location ?? null })),
    location: upcomingLocation,
    confirmedTime: ritual.confirmedTime,
  });
});

// PATCH /api/rituals/:id/meetups/:meetupId — log a planned meetup as completed or skipped
router.patch("/rituals/:id/meetups/:meetupId", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  const meetupId = parseInt(req.params.meetupId, 10);
  if (isNaN(ritualId) || isNaN(meetupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = z.object({ status: z.enum(["completed", "skipped"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "status must be completed or skipped" }); return; }

  // AuthZ: only a member may change a meetup's status. Was existence-only
  // AND the update was keyed solely on meetupId — so an unauthenticated
  // caller could flip the status of ANY gathering's meetup by enumerating
  // ids, corrupting strangers' streaks. Gate on membership and scope the
  // update to this ritual.
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const access = await getRitualAccess(ritualId, sessionUserId);
  if (!access) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (!access.isMember) { res.status(403).json({ error: "Only members of this gathering can update meetups" }); return; }

  const [updated] = await db
    .update(meetupsTable)
    .set({ status: parsed.data.status })
    .where(and(eq(meetupsTable.id, meetupId), eq(meetupsTable.ritualId, ritualId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Meetup not found" }); return; }

  res.json({ ...updated, scheduledDate: new Date(updated.scheduledDate as unknown as string).toISOString() });
});

// POST /api/rituals/:id/confirm-time — auth-required
const ConfirmTimeBody = z.object({
  confirmedTime: z.string().refine((s) => !isNaN(Date.parse(s)), { message: "confirmedTime must be a valid ISO timestamp" }),
});

router.post("/rituals/:id/confirm-time", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = ConfirmTimeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const confirmedTimeIso = new Date(parsed.data.confirmedTime).toISOString();

  await db
    .update(ritualsTable)
    .set({ confirmedTime: confirmedTimeIso })
    .where(eq(ritualsTable.id, id));

  // Create a planned meetup for the confirmed time
  const existingMeetups = await db
    .select()
    .from(meetupsTable)
    .where(eq(meetupsTable.ritualId, id));
  const existingPlanned = existingMeetups.find((m) => m.status === "planned");

  if (existingPlanned) {
    await db.update(meetupsTable).set({ scheduledDate: confirmedTimeIso }).where(eq(meetupsTable.id, existingPlanned.id));
  } else {
    await db.insert(meetupsTable).values({
      ritualId: id,
      scheduledDate: confirmedTimeIso,
      status: "planned",
    }).returning({ id: meetupsTable.id });
  }

  res.json({ confirmedTime: confirmedTimeIso });
});

// GET /api/rituals/:id/connections, POST /api/rituals/:id/invite,
// DELETE /api/rituals/:id/participants/:email, and
// POST /api/rituals/:id/restore-calendar were removed — a gathering no
// longer has an invitee/attendee list or a Google Calendar sync to
// restore. It's now a posted announcement only. Confirmed via grep across
// artifacts/mymonastery/src that no client code called any of these
// (the "Who" invite step in tradition-new.tsx, the only plausible caller
// of /connections, was removed in the same change).

// Member "suggest a time" (ritual_time_suggestions) was removed — it collected
// a participant's name/email + a suggested meeting time, the same category of
// scheduling-response data as the guest RSVP poll. No RSVP-shaped data is
// collected from anyone but the organizer now.

export default router;
