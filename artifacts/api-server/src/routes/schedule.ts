import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, ritualsTable, scheduleResponsesTable } from "@workspace/db";
import { deriveStartDate } from "../lib/scheduleDate";
import { rateLimit } from "../lib/rate-limit";
import crypto from "crypto";

const router: IRouter = Router();

function generateProposedTimes(dayPreference: string, frequency: string): string[] {
  const base = deriveStartDate(dayPreference, frequency);
  const times: string[] = [];

  times.push(base.toISOString());

  const alt1 = new Date(base);
  if (frequency === "monthly") {
    alt1.setDate(alt1.getDate() + 7);
  } else {
    alt1.setDate(alt1.getDate() + 1);
    if (alt1.getDay() === 0) alt1.setDate(alt1.getDate() + 1);
  }
  times.push(alt1.toISOString());

  const alt2 = new Date(base);
  if (frequency === "monthly") {
    alt2.setDate(alt2.getDate() + 14);
  } else {
    const hoursShift = base.getHours() < 17 ? 2 : -2;
    alt2.setHours(alt2.getHours() + hoursShift);
    alt2.setDate(alt2.getDate() + 7);
  }
  times.push(alt2.toISOString());

  return times;
}

router.get("/rituals/:id/suggested-times", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const sessionUserId = (req.user as { id: number }).id;

  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }

  if (ritual.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const existingTimes = (ritual.proposedTimes as string[]) ?? [];
  if (existingTimes.length > 0) {
    res.json({ proposedTimes: existingTimes });
    return;
  }

  const proposedTimes = generateProposedTimes(ritual.dayPreference ?? "", ritual.frequency);

  const token = crypto.randomBytes(16).toString("hex");
  await db
    .update(ritualsTable)
    .set({ proposedTimes, scheduleToken: token })
    .where(eq(ritualsTable.id, ritualId));

  res.json({ proposedTimes, token });
});

router.post("/rituals/:id/confirm-time", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const sessionUserId = (req.user as { id: number }).id;

  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const { confirmedTime } = req.body;
  if (!confirmedTime || typeof confirmedTime !== "string") {
    res.status(400).json({ error: "confirmedTime is required" });
    return;
  }

  // Verify existence and ownership before updating
  const [existing] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!existing) {
    res.status(404).json({ error: "Ritual not found" });
    return;
  }
  if (existing.ownerId !== sessionUserId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [ritual] = await db
    .update(ritualsTable)
    .set({ confirmedTime })
    .where(eq(ritualsTable.id, ritualId))
    .returning();

  res.json({ success: true, confirmedTime: ritual.confirmedTime });
});

// GET /api/schedule/:token — no auth required
router.get("/schedule/:token", async (req, res): Promise<void> => {
  const { token } = req.params;
  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const [ritual] = await db
    .select()
    .from(ritualsTable)
    .where(eq(ritualsTable.scheduleToken, token));

  if (!ritual) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  const responses = await db
    .select()
    .from(scheduleResponsesTable)
    .where(eq(scheduleResponsesTable.ritualId, ritual.id));

  const participants = (ritual.participants as Array<{ name: string; email: string }>) ?? [];

  res.json({
    ritualId: ritual.id,
    ritualName: ritual.name,
    frequency: ritual.frequency,
    organizerName: participants[0]?.name ?? "your organizer",
    proposedTimes: (ritual.proposedTimes as string[]) ?? [],
    confirmedTime: ritual.confirmedTime,
    responses: responses.map((r) => ({
      guestName: r.guestName,
      chosenTime: r.chosenTime,
      unavailable: r.unavailable === 1,
    })),
  });
});

// POST /api/schedule/:token/respond — no auth required
const ISOTimestamp = z.string().refine((s) => !isNaN(Date.parse(s)), { message: "Must be a valid ISO timestamp" });
const RespondBody = z.object({
  guestName: z.string().min(1),
  guestEmail: z.string().optional(),
  chosenTime: ISOTimestamp.optional(),
  unavailable: z.boolean().optional(),
  suggestedTime: z.string().optional(),
});

// Audit #22b: this route is unauthenticated and writes attacker-controlled
// guestName/guestEmail that render into the organizer's calendar view. Cap
// per-IP request volume so a single client can't flood the responses table.
router.post(
  "/schedule/:token/respond",
  rateLimit({ name: "schedule_respond", max: 30, windowMs: 60 * 60 * 1000 }),
  async (req, res): Promise<void> => {
  const token = String(req.params.token ?? "");
  if (!token) {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const parsed = RespondBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [ritual] = await db
    .select()
    .from(ritualsTable)
    .where(eq(ritualsTable.scheduleToken, token));

  if (!ritual) {
    res.status(404).json({ error: "Schedule not found" });
    return;
  }

  // If unavailable but a suggestion was provided, store it in chosenTime prefixed
  const chosenTime = parsed.data.chosenTime
    ?? (parsed.data.unavailable && parsed.data.suggestedTime?.trim()
        ? `suggest: ${parsed.data.suggestedTime.trim()}`
        : null);

  const guestName = parsed.data.guestName.trim();
  const guestEmail = parsed.data.guestEmail?.trim() || null;
  const unavailable = parsed.data.unavailable ? 1 : 0;

  // Audit #22b: dedup by (ritualId, guestEmail) so a guest re-submitting (or
  // an attacker replaying) can't spawn unbounded rows in the organizer's view.
  // No unique constraint exists on the table, so update-existing-or-insert.
  const [existingResponse] = guestEmail
    ? await db
        .select({ id: scheduleResponsesTable.id })
        .from(scheduleResponsesTable)
        .where(
          and(
            eq(scheduleResponsesTable.ritualId, ritual.id),
            eq(scheduleResponsesTable.guestEmail, guestEmail),
          ),
        )
    : [];

  if (existingResponse) {
    await db
      .update(scheduleResponsesTable)
      .set({ guestName, chosenTime, unavailable })
      .where(eq(scheduleResponsesTable.id, existingResponse.id));
  } else {
    await db.insert(scheduleResponsesTable).values({
      ritualId: ritual.id,
      guestName,
      guestEmail,
      chosenTime,
      unavailable,
    });
  }

  res.status(201).json({ success: true });
  },
);

router.get("/rituals/:id/schedule-responses", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const sessionUserId = (req.user as { id: number }).id;

  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) {
    res.status(400).json({ error: "Invalid ritual id" });
    return;
  }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
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
    .where(eq(scheduleResponsesTable.ritualId, ritualId));

  res.json({
    proposedTimes: (ritual.proposedTimes as string[]) ?? [],
    confirmedTime: ritual.confirmedTime,
    scheduleToken: ritual.scheduleToken,
    responses: responses.map((r) => ({
      id: r.id,
      guestName: r.guestName,
      guestEmail: r.guestEmail,
      chosenTime: r.chosenTime,
      unavailable: r.unavailable === 1,
      createdAt: r.createdAt,
    })),
  });
});

export default router;
