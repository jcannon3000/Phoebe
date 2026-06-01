import { Router, type IRouter } from "express";
import {
  db,
  calendarSubscriptionsTable,
  scheduledGatheringsTable,
  gatheringMembersTable,
  availabilityPatternsTable,
  usersTable,
  groupMembersTable,
} from "@workspace/db";
import { eq, and, inArray, or } from "drizzle-orm";
import { z } from "zod/v4";
import { parseIcal, normalizeCalendarUrl, type ICalEvent } from "../lib/ical";
import { assertPublicHttpUrl } from "../lib/ssrfGuard";

const router: IRouter = Router();

// ─── List subscriptions for the current user ──────────────────────────────────
router.get("/gatherings/calendars", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const subs = await db
    .select()
    .from(calendarSubscriptionsTable)
    .where(eq(calendarSubscriptionsTable.userId, userId));
  res.json(subs);
});

// ─── Add a public calendar subscription ──────────────────────────────────────
// Body: { url: string, name?: string, colorHex?: string }
// Accepts any public iCal URL or a Google Calendar public URL (auto-converted).
router.post("/gatherings/calendars", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const rawUrl = (req.body.url as string | undefined)?.trim() ?? "";
  if (!rawUrl) { res.status(400).json({ error: "url is required" }); return; }

  const url = normalizeCalendarUrl(rawUrl);

  // SSRF guard — this URL is user-submitted and we're about to fetch it from
  // the server. Reject anything that resolves to an internal / non-routable
  // address (cloud metadata, localhost, private ranges) before the fetch.
  try {
    await assertPublicHttpUrl(url);
  } catch {
    res.status(400).json({ error: "That calendar URL isn't allowed." });
    return;
  }

  // Quick validation: try to fetch a few events to confirm it works
  let calendarName = (req.body.name as string | undefined)?.trim() ?? "";
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) {
      res.status(400).json({ error: "Could not fetch that calendar. Make sure it's public." });
      return;
    }
    const text = await resp.text();
    if (!text.includes("BEGIN:VCALENDAR")) {
      res.status(400).json({ error: "That URL doesn't look like a calendar feed. Try copying the iCal link." });
      return;
    }
    // Auto-detect calendar name from X-WR-CALNAME if not provided
    if (!calendarName) {
      const match = text.match(/X-WR-CALNAME:(.+)/);
      calendarName = match ? match[1].trim() : "Calendar";
    }
  } catch {
    res.status(400).json({ error: "Could not reach that calendar URL. Make sure it's public and accessible." });
    return;
  }

  const [sub] = await db
    .insert(calendarSubscriptionsTable)
    .values({
      userId,
      url,
      name: calendarName,
      colorHex: (req.body.colorHex as string | undefined) ?? null,
    })
    .returning();

  res.status(201).json(sub);
});

// ─── Remove a subscription ────────────────────────────────────────────────────
router.delete("/gatherings/calendars/:id", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const id = Number(req.params.id);
  await db
    .delete(calendarSubscriptionsTable)
    .where(and(
      eq(calendarSubscriptionsTable.id, id),
      eq(calendarSubscriptionsTable.userId, userId),
    ));
  res.json({ ok: true });
});

// ─── Fetch events from all subscribed calendars ───────────────────────────────
// Returns upcoming events across all the user's subscribed public calendars.
router.get("/gatherings/calendar-events", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;

  const subs = await db
    .select()
    .from(calendarSubscriptionsTable)
    .where(eq(calendarSubscriptionsTable.userId, userId));

  if (subs.length === 0) { res.json([]); return; }

  const now = new Date();
  const future = new Date(now.getTime() + 90 * 86400000); // 90 days ahead

  const allEvents: Array<ICalEvent & {
    subscriptionId: number;
    calendarName: string;
    colorHex: string | null;
  }> = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      // Re-check at fetch time too (a sub stored before this guard existed,
      // or a name that has since rebound to an internal address).
      await assertPublicHttpUrl(sub.url);
      const resp = await fetch(sub.url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) return;
      const text = await resp.text();
      const events = parseIcal(text);

      for (const ev of events) {
        // Skip events outside our window
        const startDate = new Date(ev.start);
        if (isNaN(startDate.getTime())) continue;
        if (startDate > future) continue;

        const endDate = ev.end ? new Date(ev.end) : startDate;
        // Include events that haven't ended yet
        if (!isNaN(endDate.getTime()) && endDate < now && !ev.allDay) continue;
        // For all-day events, include if start >= today
        if (ev.allDay && startDate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) continue;

        allEvents.push({
          ...ev,
          subscriptionId: sub.id,
          calendarName: sub.name,
          colorHex: sub.colorHex,
        });
      }
    } catch { /* skip unreachable calendars silently */ }
  }));

  allEvents.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  res.json(allEvents);
});

// ─── Scheduling: Create ───────────────────────────────────────────────────────
const CreateGatheringSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  cadence: z.enum(["weekly", "fortnightly", "monthly", "seasonal"]).default("weekly"),
  durationMin: z.coerce.number().int().min(15).max(480).default(60),
  expectedSize: z.coerce.number().int().min(2).max(500).optional(),
  needsRoom: z.boolean().default(false),
  needsClergy: z.boolean().default(false),
  visibility: z.enum(["public", "community", "private"]).default("community"),
  communityId: z.coerce.number().int().optional(),
  seasonWindow: z.object({ start: z.string(), end: z.string() }).optional(),
});

router.post("/gatherings", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const parsed = CreateGatheringSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const d = parsed.data;

  const [gathering] = await db.insert(scheduledGatheringsTable).values({
    leaderUserId: userId,
    communityId: d.communityId ?? null,
    title: d.title,
    description: d.description ?? null,
    cadence: d.cadence,
    durationMin: d.durationMin,
    expectedSize: d.expectedSize ?? null,
    needsRoom: d.needsRoom,
    needsClergy: d.needsClergy,
    visibility: d.visibility,
    seasonWindow: d.seasonWindow ?? null,
  }).returning();

  await db.insert(gatheringMembersTable).values({
    gatheringId: gathering.id,
    userId,
    role: "leader",
    inviteStatus: "joined",
  });

  res.status(201).json(gathering);
});

// ─── Scheduling: List ─────────────────────────────────────────────────────────
router.get("/gatherings", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;

  const memberships = await db
    .select()
    .from(gatheringMembersTable)
    .where(eq(gatheringMembersTable.userId, userId));

  if (memberships.length === 0) { res.json([]); return; }

  const gids = memberships.map(m => m.gatheringId);
  const gatherings = await db
    .select()
    .from(scheduledGatheringsTable)
    .where(inArray(scheduledGatheringsTable.id, gids));

  const memMap = new Map(memberships.map(m => [m.gatheringId, m]));
  res.json(gatherings.map(g => ({
    ...g,
    myRole: memMap.get(g.id)?.role ?? "member",
    myInviteStatus: memMap.get(g.id)?.inviteStatus ?? "invited",
  })));
});

// ─── Scheduling: Detail ───────────────────────────────────────────────────────
router.get("/gatherings/:id", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const gid = Number(req.params.id);
  if (!Number.isFinite(gid)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [mine] = await db.select().from(gatheringMembersTable)
    .where(and(eq(gatheringMembersTable.gatheringId, gid), eq(gatheringMembersTable.userId, userId)));
  if (!mine) { res.status(403).json({ error: "Not a member" }); return; }

  const [gathering] = await db.select().from(scheduledGatheringsTable)
    .where(eq(scheduledGatheringsTable.id, gid));
  if (!gathering) { res.status(404).json({ error: "Not found" }); return; }

  const members = await db.select().from(gatheringMembersTable)
    .where(eq(gatheringMembersTable.gatheringId, gid));

  const memberUserIds = members.map(m => m.userId);
  const [users, respondedRows, myPatterns] = await Promise.all([
    memberUserIds.length > 0
      ? db.select({ id: usersTable.id, name: usersTable.name, avatarUrl: usersTable.avatarUrl })
          .from(usersTable).where(inArray(usersTable.id, memberUserIds))
      : Promise.resolve([] as Array<{ id: number; name: string | null; avatarUrl: string | null }>),
    memberUserIds.length > 0
      ? db.select({ userId: availabilityPatternsTable.userId })
          .from(availabilityPatternsTable)
          .where(and(
            eq(availabilityPatternsTable.gatheringId, gid),
            inArray(availabilityPatternsTable.userId, memberUserIds),
          ))
      : Promise.resolve([] as Array<{ userId: number }>),
    db.select().from(availabilityPatternsTable)
      .where(and(
        eq(availabilityPatternsTable.gatheringId, gid),
        eq(availabilityPatternsTable.userId, userId),
      )),
  ]);

  const respondedIds = new Set(respondedRows.map(p => p.userId));
  const usersMap = new Map(users.map(u => [u.id, u]));

  res.json({
    ...gathering,
    myRole: mine.role,
    myInviteStatus: mine.inviteStatus,
    myPatterns,
    members: members.map(m => ({
      ...m,
      user: usersMap.get(m.userId) ?? null,
      hasResponded: respondedIds.has(m.userId),
    })),
  });
});

// ─── Scheduling: Invite member ────────────────────────────────────────────────
router.post("/gatherings/:id/members", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const gid = Number(req.params.id);
  if (!Number.isFinite(gid)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [mine] = await db.select().from(gatheringMembersTable)
    .where(and(eq(gatheringMembersTable.gatheringId, gid), eq(gatheringMembersTable.userId, userId)));
  if (!mine || mine.role !== "leader") { res.status(403).json({ error: "Leader only" }); return; }

  const inviteUserId = Number(req.body.userId);
  if (!Number.isFinite(inviteUserId)) { res.status(400).json({ error: "userId required" }); return; }

  const [member] = await db.insert(gatheringMembersTable).values({
    gatheringId: gid,
    userId: inviteUserId,
    role: "member",
    inviteStatus: "invited",
  }).onConflictDoNothing().returning();

  res.status(201).json(member ?? { gatheringId: gid, userId: inviteUserId, role: "member", inviteStatus: "invited" });
});

// ─── Scheduling: Save availability ───────────────────────────────────────────
const AvailabilitySchema = z.object({
  patterns: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    timeBand: z.enum(["morning", "afternoon", "evening"]),
    level: z.enum(["free", "maybe", "busy"]),
  })),
});

router.put("/gatherings/:id/availability", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const gid = Number(req.params.id);
  if (!Number.isFinite(gid)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [mine] = await db.select().from(gatheringMembersTable)
    .where(and(eq(gatheringMembersTable.gatheringId, gid), eq(gatheringMembersTable.userId, userId)));
  if (!mine) { res.status(403).json({ error: "Not a member" }); return; }

  const parsed = AvailabilitySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { patterns } = parsed.data;

  // Replace-all: delete existing then insert new
  await db.delete(availabilityPatternsTable)
    .where(and(eq(availabilityPatternsTable.userId, userId), eq(availabilityPatternsTable.gatheringId, gid)));

  if (patterns.length > 0) {
    await db.insert(availabilityPatternsTable).values(
      patterns.map(p => ({ userId, gatheringId: gid, dayOfWeek: p.dayOfWeek, timeBand: p.timeBand, level: p.level }))
    );
  }

  await db.update(gatheringMembersTable)
    .set({ inviteStatus: "joined" })
    .where(and(eq(gatheringMembersTable.gatheringId, gid), eq(gatheringMembersTable.userId, userId)));

  res.json({ ok: true, count: patterns.length });
});

// ─── Scheduling: Slot suggestions ────────────────────────────────────────────
router.get("/gatherings/:id/suggestions", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const gid = Number(req.params.id);
  if (!Number.isFinite(gid)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [mine] = await db.select().from(gatheringMembersTable)
    .where(and(eq(gatheringMembersTable.gatheringId, gid), eq(gatheringMembersTable.userId, userId)));
  if (!mine) { res.status(403).json({ error: "Not a member" }); return; }

  const joinedMembers = await db.select().from(gatheringMembersTable)
    .where(and(eq(gatheringMembersTable.gatheringId, gid), eq(gatheringMembersTable.inviteStatus, "joined")));

  if (joinedMembers.length === 0) { res.json([]); return; }

  const memberIds = joinedMembers.map(m => m.userId);
  const patterns = await db.select().from(availabilityPatternsTable)
    .where(and(eq(availabilityPatternsTable.gatheringId, gid), inArray(availabilityPatternsTable.userId, memberIds)));

  const BANDS = ["morning", "afternoon", "evening"] as const;
  const levelScore: Record<string, number> = { free: 1.0, maybe: 0.5, busy: 0.0 };
  const respondedIds = new Set(patterns.map(p => p.userId));
  const respondedCount = respondedIds.size;

  const slots: Array<{ dayOfWeek: number; timeBand: string; score: number; respondedCount: number; blockedCount: number; totalMembers: number }> = [];

  for (let day = 0; day <= 6; day++) {
    for (const band of BANDS) {
      if (day === 0 && band === "morning") continue; // liturgically reserved
      const slotPatterns = patterns.filter(p => p.dayOfWeek === day && p.timeBand === band);
      const totalScore = slotPatterns.reduce((sum, p) => sum + (levelScore[p.level] ?? 0), 0);
      const blockedCount = slotPatterns.filter(p => p.level === "busy").length;
      slots.push({
        dayOfWeek: day,
        timeBand: band,
        score: respondedCount > 0 ? totalScore / respondedCount : 0,
        respondedCount,
        blockedCount,
        totalMembers: memberIds.length,
      });
    }
  }

  slots.sort((a, b) => b.score - a.score || a.blockedCount - b.blockedCount);
  res.json(slots.slice(0, 3));
});

// ─── Scheduling: Confirm slot ─────────────────────────────────────────────────
const ConfirmSchema = z.object({
  confirmedDayOfWeek: z.number().int().min(0).max(6),
  confirmedTime: z.string().regex(/^\d{2}:\d{2}$/),
  confirmedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.post("/gatherings/:id/confirm", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const gid = Number(req.params.id);
  if (!Number.isFinite(gid)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [mine] = await db.select().from(gatheringMembersTable)
    .where(and(eq(gatheringMembersTable.gatheringId, gid), eq(gatheringMembersTable.userId, userId)));
  if (!mine || mine.role !== "leader") { res.status(403).json({ error: "Leader only" }); return; }

  const parsed = ConfirmSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }
  const { confirmedDayOfWeek, confirmedTime, confirmedStartDate } = parsed.data;

  const [updated] = await db.update(scheduledGatheringsTable)
    .set({ confirmedDayOfWeek, confirmedTime, confirmedStartDate, status: "scheduled", updatedAt: new Date() })
    .where(eq(scheduledGatheringsTable.id, gid))
    .returning();

  res.json(updated);
});

export default router;

