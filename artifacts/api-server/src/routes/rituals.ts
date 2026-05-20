import { getInviteBaseUrl } from "../lib/urls";
import { Router, type IRouter } from "express";
import { eq, desc, or, sql, and, ne } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, ritualsTable, meetupsTable, ritualMessagesTable, scheduleResponsesTable, inviteTokensTable, usersTable, momentUserTokensTable, ritualTimeSuggestionsTable, groupMembersTable, groupsTable } from "@workspace/db";
import { createCalendarEvent, deleteCalendarEvent, updateCalendarEvent, addAttendeesToCalendarEvent, removeAttendeesFromCalendarEvent, getCalendarEvent, createGatheringCalendarEvent, updateGatheringCalendarEvent } from "../lib/calendar";
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

// ─── Gathering calendar-invite sync ──────────────────────────────────────────
// Keep the meetup's Google Calendar event in lock-step with its scheduled
// time and attendee list. ONLY runs for gatherings tied to a community
// (ritual.groupId != null) — personal rituals stay calendar-less, and
// every non-gathering caller of calendar.ts keeps its existing
// "no attendees" behavior.
//
// Behavior:
//   • no event yet  → creates one with the joined group members as
//                     attendees (excluding the creator, who already
//                     created the gathering and doesn't need their own
//                     invite). sendUpdates:"all" so Google emails the
//                     attendees.
//   • event exists  → patches start/end/attendees so a moved gathering
//                     re-notifies the attendees.
//
// Fire-and-forget at call sites — meetup creation/confirmation still
// succeeds in the API response even if Google's Calendar API hiccups.
async function syncMeetupCalendarInvite(meetupId: number): Promise<void> {
  try {
    const [meetup] = await db
      .select()
      .from(meetupsTable)
      .where(eq(meetupsTable.id, meetupId))
      .limit(1);
    if (!meetup) return;

    const [ritual] = await db
      .select()
      .from(ritualsTable)
      .where(eq(ritualsTable.id, meetup.ritualId))
      .limit(1);
    if (!ritual || ritual.groupId == null) return; // personal ritual — no community to invite

    const [group] = await db
      .select({ name: groupsTable.name })
      .from(groupsTable)
      .where(eq(groupsTable.id, ritual.groupId));

    // Joined members with a usersTable row, excluding the creator (they
    // already know — and including them tends to surface a duplicate
    // event on their own calendar). NULL-safe role check matches the
    // newsletter route's IS DISTINCT FROM pattern.
    const memberRows = await db
      .select({ email: usersTable.email })
      .from(groupMembersTable)
      .innerJoin(usersTable, eq(usersTable.id, groupMembersTable.userId))
      .where(
        and(
          eq(groupMembersTable.groupId, ritual.groupId),
          sql`${groupMembersTable.joinedAt} IS NOT NULL`,
          sql`${groupMembersTable.role} IS DISTINCT FROM 'hidden_admin'`,
          ne(groupMembersTable.userId, ritual.ownerId),
        ),
      );
    const attendees = memberRows.map((m) => m.email);
    if (attendees.length === 0) return; // solo gathering — nothing to invite

    const startDate = new Date(meetup.scheduledDate);
    if (Number.isNaN(startDate.getTime())) return;
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1h default

    // A short description with the host community name and Phoebe
    // attribution so the calendar invite reads like real mail.
    const description = [
      ritual.intention?.trim() || "",
      "",
      group?.name ? `Hosted by ${group.name}` : "",
      "Sent through Phoebe — RSVPs live in the app.",
    ].filter(Boolean).join("\n");
    const location = meetup.location ?? ritual.location ?? undefined;

    if (meetup.googleCalendarEventId) {
      await updateGatheringCalendarEvent(meetup.googleCalendarEventId, {
        summary: ritual.name,
        description,
        location,
        startDate,
        endDate,
        attendees,
      });
      return;
    }

    const eventId = await createGatheringCalendarEvent({
      summary: ritual.name,
      description,
      location,
      startDate,
      endDate,
      attendees,
    });
    if (eventId) {
      await db
        .update(meetupsTable)
        .set({ googleCalendarEventId: eventId })
        .where(eq(meetupsTable.id, meetupId));
    }
  } catch (err) {
    console.warn("[gathering-calendar] sync failed", { meetupId, err });
  }
}

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

  return {
    ...ritual,
    participants: (ritual.participants as Array<{ name: string; email: string }>) ?? [],
    streak,
    lastMeetupDate,
    nextMeetupDate,
    nextMeetupLocation,
    nextMeetupId,
    status,
  };
}

router.get("/rituals", async (req, res): Promise<void> => {
  const rawOwnerId = req.query.ownerId;
  const ownerId = rawOwnerId !== undefined ? parseInt(String(rawOwnerId), 10) : null;

  // Also fetch rituals where the user appears as a participant (by email)
  let userEmail: string | null = null;
  if (ownerId !== null && !isNaN(ownerId)) {
    const [u] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, ownerId));
    userEmail = u?.email ?? null;
  }

  const whereClause = ownerId !== null && !isNaN(ownerId)
    ? userEmail
      ? or(
          eq(ritualsTable.ownerId, ownerId),
          sql`${ritualsTable.participants} @> ${JSON.stringify([{ email: userEmail }])}::jsonb`
        )
      : eq(ritualsTable.ownerId, ownerId)
    : undefined;

  const rituals = await db
    .select()
    .from(ritualsTable)
    .where(whereClause)
    .orderBy(desc(ritualsTable.createdAt));
    
  const enriched = await Promise.all(
    rituals.map(async (r) => {
      const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, r.id));
      return enrichRitual(r, meetups);
    })
  );
  res.json(ListRitualsResponse.parse(enriched));
});

router.post("/rituals", async (req, res): Promise<void> => {
  const parsed = CreateRitualBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const schedulingToken = randomUUID();
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

    const [ritual] = await db
      .insert(ritualsTable)
      .values({
        name: body.name,
        description: body.description ?? null,
        frequency: body.frequency,
        dayPreference: body.dayPreference ?? null,
        participants: body.participants ?? [],
        intention: body.intention ?? null,
        location,
        meetingUrl,
        ownerId: body.ownerId,
        scheduleToken: schedulingToken,
        rhythm: body.rhythm ?? "fortnightly",
        hasIntercession: body.hasIntercession ?? false,
        hasFasting: body.hasFasting ?? false,
        intercessionIntention: body.intercessionIntention ?? null,
        fastingDescription: body.fastingDescription ?? null,
        template,
        groupId,
      })
      .returning();

    const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritual.id));
    const enriched = await enrichRitual(ritual, meetups);

    const ctx = {
      ritual: enriched,
      streak: enriched.streak,
      lastMeetupDate: enriched.lastMeetupDate,
      nextMeetupDate: enriched.nextMeetupDate,
    };

    // Fan out new-gathering push to all joined group members (not the creator).
    if (groupId) {
      const [group] = await db.select({ slug: groupsTable.slug }).from(groupsTable).where(eq(groupsTable.id, groupId));
      const [creator] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, ritual.ownerId));
      if (group) {
        const members = await db
          .select({ userId: groupMembersTable.userId })
          .from(groupMembersTable)
          .where(and(
            eq(groupMembersTable.groupId, groupId),
            sql`${groupMembersTable.joinedAt} IS NOT NULL`,
            ne(groupMembersTable.userId, ritual.ownerId),
          ));
        const creatorName = creator?.name ?? "Someone";
        members.forEach(m => {
          if (typeof m.userId === "number") {
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
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create ritual" });
  }
});

router.get("/rituals/:id", async (req, res): Promise<void> => {
  const params = GetRitualParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

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

  const updateData: Partial<typeof ritualsTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.description !== undefined) updateData.description = parsed.data.description;
  if (parsed.data.frequency !== undefined) updateData.frequency = parsed.data.frequency;
  if (parsed.data.dayPreference !== undefined) updateData.dayPreference = parsed.data.dayPreference;
  if (parsed.data.participants !== undefined) updateData.participants = parsed.data.participants;
  if (parsed.data.intention !== undefined) updateData.intention = parsed.data.intention;
  // allowMemberInvites bypasses zod since the generated UpdateRitualBody
  // doesn't include it yet — read directly from req.body.
  if (typeof (req.body as { allowMemberInvites?: unknown }).allowMemberInvites === "boolean") {
    updateData.allowMemberInvites = (req.body as { allowMemberInvites: boolean }).allowMemberInvites;
  }

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

router.delete("/rituals/:id", async (req, res): Promise<void> => {
  const params = DeleteRitualParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;

  // Verify ownership
  const [ritual] = await db.select({ ownerId: ritualsTable.ownerId }).from(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  if (!ritual) { res.status(404).json({ error: "Tradition not found" }); return; }
  if (!sessionUserId || ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Only the owner can delete this tradition" }); return; }

  // Delete Google Calendar events from meetups before removing DB records
  try {
    const meetupsToClean = await db.select({ id: meetupsTable.id, googleCalendarEventId: meetupsTable.googleCalendarEventId })
      .from(meetupsTable).where(eq(meetupsTable.ritualId, params.data.id));
    for (const m of meetupsToClean) {
      if (m.googleCalendarEventId) {
        try {
          await deleteCalendarEvent(sessionUserId, m.googleCalendarEventId);
          console.info(`Deleted tradition GCal event ${m.googleCalendarEventId}`);
        } catch { /* best effort */ }
      }
    }
  } catch { /* non-fatal */ }

  // Delete all dependent records (tables without ON DELETE CASCADE in the actual DB)
  await db.delete(meetupsTable).where(eq(meetupsTable.ritualId, params.data.id));
  await db.delete(ritualMessagesTable).where(eq(ritualMessagesTable.ritualId, params.data.id));
  await db.delete(scheduleResponsesTable).where(eq(scheduleResponsesTable.ritualId, params.data.id));
  await db.delete(inviteTokensTable).where(eq(inviteTokensTable.ritualId, params.data.id));

  await db.delete(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  res.sendStatus(204);
});

router.get("/rituals/:id/meetups", async (req, res): Promise<void> => {
  const params = ListMeetupsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

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

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  const [meetup] = await db
    .insert(meetupsTable)
    .values({
      ritualId: params.data.id,
      scheduledDate: new Date(parsed.data.scheduledDate).toISOString(),
      status: parsed.data.status,
      notes: parsed.data.notes ?? null,
    })
    .returning();

  // Fire-and-forget: send the Google Calendar invite to every joined
  // group member if this is a community gathering. See
  // syncMeetupCalendarInvite for the gating rules.
  syncMeetupCalendarInvite(meetup.id).catch((err) =>
    req.log.warn({ err, meetupId: meetup.id }, "[gathering-calendar] sync failed"),
  );

  res.status(201).json(meetup);
});

router.get("/rituals/:id/messages", async (req, res): Promise<void> => {
  const params = ListMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

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

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, params.data.id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

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

  const enrichedRitual = {
    ...ritual,
    participants: (ritual.participants as Array<{ name: string; email: string }>) ?? [],
  };

  const aiResponse = await getCoordinatorResponse(
    { ritual: enrichedRitual, streak, lastMeetupDate, nextMeetupDate },
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

  // Create invite tokens for each participant
  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const appBase = getInviteBaseUrl();
  const existingInvites = await db
    .select()
    .from(inviteTokensTable)
    .where(eq(inviteTokensTable.ritualId, id));
  for (const p of participants) {
    const existingForEmail = existingInvites.find((t) => t.email === p.email);
    if (!existingForEmail) {
      await db.insert(inviteTokensTable).values({ ritualId: id, email: p.email, name: p.name, token: randomUUID() });
    }
  }

  // Create a planned meetup row so dashboard shows the proposed date.
  // Location is per-meetup: when the organizer supplies a location with
  // proposed times, stamp it onto the planned meetup row.
  let meetupId: number | null = null;
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
        meetupId = existingPlanned.id;
      } else {
        const [inserted] = await db.insert(meetupsTable).values({
          ritualId: id,
          scheduledDate: placeholderTimeISO,
          status: "planned",
          location: meetupLocation ?? null,
        }).returning();
        meetupId = inserted.id;
      }
    }
  } catch (err: unknown) {
    req.log.error({ err }, "Failed to create/update planned meetup for proposed-times");
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to save meetup" });
    return;
  }

  // ─── Create Google Calendar event for the tradition ─────────────────────────
  try {
    const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (organizer && parsed.data.proposedTimes.length > 0) {
      const appBase = getInviteBaseUrl();
      const organizerFirstName = (organizer.name ?? organizer.email ?? "Someone").split(" ")[0];

      const isOnce = ritual.frequency === "once";

      // Warm one-liner — use the stored intention (tagline) if available
      const warmLine = (ritual.intention && ritual.intention.trim())
        ? ritual.intention.trim()
        : isOnce
          ? "A gathering worth keeping."
          : "A recurring tradition worth tending.";

      // Frequency label
      const FREQ_LABELS: Record<string, string> = {
        once: "Just once",
        weekly: "Every week",
        biweekly: "Every 2 weeks",
        monthly: "Once a month",
      };
      const freqLabel = FREQ_LABELS[ritual.frequency] ?? ritual.frequency;

      // Format proposed times for the description
      function formatProposedTime(isoStr: string): string {
        const d = new Date(isoStr);
        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        const day = dayNames[d.getDay()];
        const month = monthNames[d.getMonth()];
        const date = d.getDate();
        const h = d.getHours();
        const m = d.getMinutes();
        const period = h < 12 ? "AM" : "PM";
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const minStr = m === 0 ? "" : `:${String(m).padStart(2, "0")}`;
        return `${day}, ${month} ${date} · ${hour12}${minStr} ${period}`;
      }

      // Create ONE group calendar event with all participants as attendees.
      // Each person gets their individual invite link via the Eleanor invite page, not the calendar.
      const proposedTimes = parsed.data.proposedTimes;
      // Include the organizer so they also receive a calendar invite to their own calendar
      const attendeeEmails = [...new Set([organizer.email, ...participants.map(p => p.email)])];

      // Fetch organizer's invite token for the link
      const allTokens = await db.select().from(inviteTokensTable)
        .where(eq(inviteTokensTable.ritualId, id));
      const organizerInviteToken = allTokens.find(t => t.email === organizer.email);
      const scheduleUrl = ritual.scheduleToken
        ? `${appBase}/schedule/${ritual.scheduleToken}`
        : (organizerInviteToken ? `${appBase}/invite/${organizerInviteToken.token}` : appBase);

      // Build description — emoji first, creator name, link on the second line,
      // then the practical details. No Phoebe tagline.
      const lines: string[] = [];
      lines.push(`🌿 ${organizerFirstName} invited you to ${ritual.name}.`);
      lines.push(scheduleUrl);
      lines.push("");

      if (proposedTimes.length === 1) {
        lines.push(`When: ${formatProposedTime(proposedTimes[0])}`);
      } else if (proposedTimes.length > 1) {
        lines.push("Proposed times:");
        for (let i = 0; i < proposedTimes.length; i++) {
          const label = i === 0 ? "✓ First choice" : "· Alternate";
          lines.push(`  ${label}: ${formatProposedTime(proposedTimes[i])}`);
        }
      }

      if (ritual.location && ritual.location.trim()) {
        lines.push(`Location: ${ritual.location.trim()}`);
      }

      lines.push(isOnce ? "A one-time gathering." : `A ${freqLabel.toLowerCase()} tradition.`);

      if (warmLine && warmLine !== "A recurring tradition worth tending." && warmLine !== "A gathering worth keeping.") {
        lines.push("");
        lines.push(warmLine);
      }

      const description = lines.join("\n");
      const eventStart = new Date(proposedTimes[0]);
      const eventEnd = new Date(eventStart.getTime() + 60 * 60_000);

      const eventId = await createCalendarEvent(sessionUserId, {
        summary: ritual.name,
        description,
        startDate: eventStart,
        endDate: eventEnd,
        attendees: attendeeEmails,
        colorId: "5",
        status: "tentative",
        reminders: [
          { method: "email", minutes: 1440 },
          { method: "popup", minutes: 120 },
        ],
      });

      if (eventId && meetupId) {
        await db.update(meetupsTable)
          .set({ googleCalendarEventId: eventId })
          .where(eq(meetupsTable.id, meetupId));
      }
    }
  } catch (calErr) {
    console.error("Tradition calendar event creation failed (non-fatal):", calErr);
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

  // Check if the creator's calendar event for the upcoming meetup was deleted
  let calendarEventMissing = false;
  if (upcoming?.googleCalendarEventId) {
    const calEvent = await getCalendarEvent(sessionUserId, upcoming.googleCalendarEventId);
    if (!calEvent) calendarEventMissing = true;
  }

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
    calendarEventMissing,
  });
});

// PATCH /api/rituals/:id/meetups/:meetupId — log a planned meetup as completed or skipped
router.patch("/rituals/:id/meetups/:meetupId", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  const meetupId = parseInt(req.params.meetupId, 10);
  if (isNaN(ritualId) || isNaN(meetupId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const parsed = z.object({ status: z.enum(["completed", "skipped"]) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "status must be completed or skipped" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  const [updated] = await db
    .update(meetupsTable)
    .set({ status: parsed.data.status })
    .where(eq(meetupsTable.id, meetupId))
    .returning();

  if (!updated) { res.status(404).json({ error: "Meetup not found" }); return; }

  res.json({ ...updated, scheduledDate: new Date(updated.scheduledDate as unknown as string).toISOString() });
});

// GET /api/rituals/:id/scheduling-summary — auth-required
router.get("/rituals/:id/scheduling-summary", async (req, res): Promise<void> => {
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

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const responses = await db
    .select()
    .from(scheduleResponsesTable)
    .where(eq(scheduleResponsesTable.ritualId, id))
    .orderBy(scheduleResponsesTable.createdAt);

  res.json({ responses });
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

  let confirmedMeetupId: number;
  if (existingPlanned) {
    await db.update(meetupsTable).set({ scheduledDate: confirmedTimeIso }).where(eq(meetupsTable.id, existingPlanned.id));
    confirmedMeetupId = existingPlanned.id;
  } else {
    const [inserted] = await db.insert(meetupsTable).values({
      ritualId: id,
      scheduledDate: confirmedTimeIso,
      status: "planned",
    }).returning({ id: meetupsTable.id });
    confirmedMeetupId = inserted!.id;
  }

  // Send/update the Google Calendar invite for the confirmed time. Fire
  // and forget — the confirm-time endpoint succeeds even if calendar
  // sync hiccups.
  syncMeetupCalendarInvite(confirmedMeetupId).catch((err) =>
    req.log.warn({ err, meetupId: confirmedMeetupId }, "[gathering-calendar] sync failed"),
  );

  res.json({ confirmedTime: confirmedTimeIso });
});

// ─── GET /api/rituals/:id/connections ─────────────────────────────────────────
// Returns Eleanor users who share a moment or tradition with the current user
// but are NOT already a member of this tradition
router.get("/rituals/:id/connections", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  const [currentUser] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!currentUser) { res.status(404).json({ error: "User not found" }); return; }

  const currentParticipants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const currentEmails = new Set(currentParticipants.map(p => p.email.toLowerCase()));

  // Collect emails from existing moment connections
  const myMomentTokens = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.email, currentUser.email));
  const momentIds = [...new Set(myMomentTokens.map(t => t.momentId))];
  const allConnections: Map<string, string> = new Map(); // email -> name

  if (momentIds.length > 0) {
    for (const mid of momentIds) {
      const allTokens = await db.select().from(momentUserTokensTable)
        .where(eq(momentUserTokensTable.momentId, mid));
      for (const t of allTokens) {
        if (t.email.toLowerCase() !== currentUser.email.toLowerCase()) {
          allConnections.set(t.email.toLowerCase(), t.name ?? t.email);
        }
      }
    }
  }

  // Collect emails from other rituals the user is in
  const allRituals = await db.select().from(ritualsTable);
  for (const r of allRituals) {
    const parts = (r.participants as Array<{ name: string; email: string }>) ?? [];
    const isMember = parts.some(p => p.email.toLowerCase() === currentUser.email.toLowerCase());
    if (isMember) {
      for (const p of parts) {
        if (p.email.toLowerCase() !== currentUser.email.toLowerCase()) {
          allConnections.set(p.email.toLowerCase(), p.name ?? p.email);
        }
      }
    }
  }

  // Filter out already-members of this tradition
  const connections = Array.from(allConnections.entries())
    .filter(([email]) => !currentEmails.has(email))
    .map(([email, name]) => ({ email, name }));

  res.json({ connections });
});

// ─── POST /api/rituals/:id/invite ────────────────────────────────────────────
// Adds new participants to the tradition
router.post("/rituals/:id/invite", async (req, res): Promise<void> => {
  try {
    const sessionUserId = req.user ? (req.user as { id: number }).id : null;
    if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
    const ritualId = parseInt(req.params.id, 10);
    if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

    const parsed = z.object({
      participants: z.array(z.object({ name: z.string(), email: z.string().email() })).min(1),
    }).safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Validation failed" }); return; }

    const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
    if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

    const isOwner = ritual.ownerId === sessionUserId;
    if (!isOwner && !ritual.allowMemberInvites) {
      res.status(403).json({ error: "Only the owner can invite people to this tradition" });
      return;
    }

    // Load the inviter so non-owner invites can be attributed in the calendar
    const [inviter] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));

    const current = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
    const currentEmails = new Set(current.map(p => p.email.toLowerCase()));

    // Merge new participants (deduplicate by email)
    const newParts = parsed.data.participants.filter(p => !currentEmails.has(p.email.toLowerCase()));
    if (newParts.length === 0) {
      res.json({ participants: current, added: [] });
      return;
    }
    const merged = [...current, ...newParts];

    await db.update(ritualsTable).set({ participants: merged }).where(eq(ritualsTable.id, ritualId));

    // Add invite tokens for new participants
    for (const p of newParts) {
      const existingToken = await db.select().from(inviteTokensTable)
        .where(eq(inviteTokensTable.ritualId, ritualId));
      const alreadyHasToken = existingToken.find(t => t.email.toLowerCase() === p.email.toLowerCase());
      if (!alreadyHasToken) {
        const token = randomUUID();
        await db.insert(inviteTokensTable).values({ ritualId, email: p.email, name: p.name, token });
      }
    }

    // Calendar invites
    //   - Owner inviting: add attendees to the existing shared meetup event.
    //   - Non-owner inviting: create a one-off calendar event from the
    //     inviter's credentials so the invitee sees the invite coming from
    //     them (not the owner). We don't touch the shared event because
    //     Google Calendar attribution is bound to the event owner.
    try {
      const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritualId));
      const plannedMeetup = meetups.find(m => m.status === "planned");

      if (isOwner && plannedMeetup?.googleCalendarEventId) {
        const newEmails = newParts.map(p => p.email);
        await addAttendeesToCalendarEvent(sessionUserId, plannedMeetup.googleCalendarEventId, newEmails);
      } else if (!isOwner && plannedMeetup && inviter) {
        const inviterFirst = (inviter.name ?? "").trim().split(/\s+/)[0] || inviter.name || "A friend";
        const shortLink = `${getInviteBaseUrl()}/rituals/${ritualId}`;
        const eventStart = new Date(plannedMeetup.scheduledDate);
        const eventEnd = new Date(eventStart.getTime() + 60 * 60_000);
        const description = [
          `${inviterFirst} invited you to join "${ritual.name}" on Phoebe.`,
          ritual.intention ? `"${ritual.intention}"` : null,
          "",
          `Open in Phoebe → ${shortLink}`,
        ].filter(Boolean).join("\n");

        for (const p of newParts) {
          await createCalendarEvent(sessionUserId, {
            summary: ritual.name,
            description,
            startDate: eventStart,
            endDate: eventEnd,
            attendees: [p.email],
            colorId: "5",
            status: "tentative",
            reminders: [
              { method: "email", minutes: 1440 },
              { method: "popup", minutes: 120 },
            ],
          }).catch(() => null);
        }
      }
    } catch { /* non-fatal */ }

    res.json({ participants: merged, added: newParts });
  } catch (err) {
    console.error("POST /api/rituals/:id/invite error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── DELETE /api/rituals/:id/participants/:email — owner removes a member ─────
router.delete("/rituals/:id/participants/:email", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const emailToRemove = decodeURIComponent(req.params.email).toLowerCase();

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Only the owner can remove members" });
    return;
  }

  // Can't remove yourself
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (owner && owner.email.toLowerCase() === emailToRemove) {
    res.status(400).json({ error: "Cannot remove yourself. Delete the tradition instead." });
    return;
  }

  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const updated = participants.filter(p => p.email.toLowerCase() !== emailToRemove);
  if (updated.length === participants.length) {
    res.status(404).json({ error: "Member not found in this tradition" });
    return;
  }

  // Update participants array
  await db.update(ritualsTable).set({ participants: updated }).where(eq(ritualsTable.id, ritualId));

  // Remove invite token
  const tokens = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.ritualId, ritualId));
  const tokenToRemove = tokens.find(t => t.email.toLowerCase() === emailToRemove);
  if (tokenToRemove) {
    await db.delete(inviteTokensTable).where(eq(inviteTokensTable.id, tokenToRemove.id));
  }

  // Remove from calendar event
  try {
    const meetups = await db.select().from(meetupsTable).where(eq(meetupsTable.ritualId, ritualId));
    const plannedMeetup = meetups.find(m => m.status === "planned" && m.googleCalendarEventId);
    if (plannedMeetup?.googleCalendarEventId) {
      await removeAttendeesFromCalendarEvent(sessionUserId, plannedMeetup.googleCalendarEventId, [emailToRemove]);
    }
  } catch { /* non-fatal */ }

  res.json({ success: true, participants: updated, removed: emailToRemove });
});

// ─── POST /api/rituals/:id/restore-calendar — owner restores deleted calendar event ───
router.post("/rituals/:id/restore-calendar", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [planned] = await db.select().from(meetupsTable)
    .where(and(eq(meetupsTable.ritualId, id), eq(meetupsTable.status, "planned")));
  if (!planned) { res.status(400).json({ error: "No upcoming gathering to restore" }); return; }

  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!organizer) { res.status(404).json({ error: "User not found" }); return; }

  const eventStart = new Date(planned.scheduledDate);
  const eventEnd = new Date(eventStart.getTime() + 60 * 60_000);
  const attendeeEmails = participants.map(p => p.email); // All members get invites from scheduler

  const eventId = await createCalendarEvent(sessionUserId, {
    summary: ritual.name,
    description: [
      `${ritual.name} — restored via Eleanor`,
      ritual.intention ? `"${ritual.intention}"` : "",
      "",
      `View this tradition → ${getInviteBaseUrl()}/ritual/${id}`,
    ].filter(Boolean).join("\n"),
    startDate: eventStart,
    endDate: eventEnd,
    attendees: attendeeEmails,
    colorId: "5",
    status: ritual.confirmedTime ? "confirmed" : "tentative",
    reminders: [
      { method: "popup", minutes: 30 },
    ],
  });

  if (!eventId) { res.status(500).json({ error: "Could not create calendar event" }); return; }

  await db.update(meetupsTable)
    .set({ googleCalendarEventId: eventId })
    .where(eq(meetupsTable.id, planned.id));

  res.json({ success: true });
});

// ─── POST /api/rituals/:id/suggest-time — participant suggests an alternative time ───
router.post("/rituals/:id/suggest-time", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = z.object({
    suggestedTime: z.string().min(1),
    note: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "suggestedTime is required" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Verify user is a participant (owner or listed participant)
  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];
  const isMember = ritual.ownerId === sessionUserId
    || participants.some(p => p.email.toLowerCase() === user.email.toLowerCase());
  if (!isMember) { res.status(403).json({ error: "Not a member of this tradition" }); return; }

  const [suggestion] = await db.insert(ritualTimeSuggestionsTable).values({
    ritualId: id,
    suggestedByEmail: user.email,
    suggestedByName: user.name,
    suggestedTime: parsed.data.suggestedTime,
    note: parsed.data.note ?? null,
  }).returning();

  res.json(suggestion);
});

// ─── GET /api/rituals/:id/suggestions — owner views member time suggestions ───
router.get("/rituals/:id/suggestions", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }

  // Only the owner sees suggestions
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const suggestions = await db.select()
    .from(ritualTimeSuggestionsTable)
    .where(eq(ritualTimeSuggestionsTable.ritualId, id))
    .orderBy(desc(ritualTimeSuggestionsTable.createdAt));

  res.json({ suggestions });
});

// ─── DELETE /api/rituals/:id/suggestions/:suggestionId — owner dismisses a suggestion ───
router.delete("/rituals/:id/suggestions/:suggestionId", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const suggestionId = parseInt(req.params.suggestionId, 10);
  if (isNaN(id) || isNaN(suggestionId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, id));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(ritualTimeSuggestionsTable)
    .where(and(eq(ritualTimeSuggestionsTable.id, suggestionId), eq(ritualTimeSuggestionsTable.ritualId, id)));

  res.json({ success: true });
});

export default router;
