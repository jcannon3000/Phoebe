import { Router, type IRouter } from "express";
import { eq, and, desc, isNull, gt, notInArray } from "drizzle-orm";
import { db, prayersForTable, usersTable, userMutesTable } from "@workspace/db";
import { z } from "zod/v4";
import { sendPrayerForYouPush } from "../lib/pushSender";
import { perUserRateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

// ─── GET /api/prayers-for/mine ──────────────────────────────────────────────
// Active + expired-but-unacknowledged prayers I am currently offering.
// Expired ones surface as renewal prompts in the client.
router.get("/prayers-for/mine", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const rows = await db.select({
    id: prayersForTable.id,
    prayerText: prayersForTable.prayerText,
    durationDays: prayersForTable.durationDays,
    startedAt: prayersForTable.startedAt,
    expiresAt: prayersForTable.expiresAt,
    acknowledgedAt: prayersForTable.acknowledgedAt,
    recipientUserId: prayersForTable.recipientUserId,
    recipientName: usersTable.name,
    recipientEmail: usersTable.email,
    recipientAvatarUrl: usersTable.avatarUrl,
  })
    .from(prayersForTable)
    .innerJoin(usersTable, eq(usersTable.id, prayersForTable.recipientUserId))
    .where(and(
      eq(prayersForTable.prayerUserId, sessionUserId),
      isNull(prayersForTable.acknowledgedAt),
    ))
    .orderBy(desc(prayersForTable.startedAt));

  const now = Date.now();
  const enriched = rows.map(r => ({
    ...r,
    expired: r.expiresAt.getTime() <= now,
  }));
  res.json(enriched);
});

// ─── GET /api/prayers-for/for-me ────────────────────────────────────────────
// Active prayers others are currently offering for me. Includes the prayer
// text so the recipient can read it on their prayer list.
//
// "Active" means: not acknowledged AND not yet expired. Surfaces that show a
// live-in-the-moment indicator (the People page's candle, the dashboard pill,
// the dedicated /prayers-for-me page) consume this endpoint.
//
// The full backlog — past prayers that have rotated out of someone's active
// slideshow — is exposed by /for-me/history below so it can be rendered on
// the prayer list without inflating the live-state surfaces.
router.get("/prayers-for/for-me", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  // Exclude prayers from users I've muted — I don't want to see their name surfaced.
  const mutedRows = await db.select({ mutedUserId: userMutesTable.mutedUserId })
    .from(userMutesTable)
    .where(eq(userMutesTable.muterId, sessionUserId));
  const mutedIds = mutedRows.map(r => r.mutedUserId);

  const baseWhere = and(
    eq(prayersForTable.recipientUserId, sessionUserId),
    isNull(prayersForTable.acknowledgedAt),
    gt(prayersForTable.expiresAt, new Date()),
  );
  const whereClause = mutedIds.length > 0
    ? and(baseWhere, notInArray(prayersForTable.prayerUserId, mutedIds))
    : baseWhere;

  const rows = await db.select({
    id: prayersForTable.id,
    startedAt: prayersForTable.startedAt,
    expiresAt: prayersForTable.expiresAt,
    prayerText: prayersForTable.prayerText,
    prayerUserId: prayersForTable.prayerUserId,
    prayerName: usersTable.name,
    prayerEmail: usersTable.email,
    prayerAvatarUrl: usersTable.avatarUrl,
  })
    .from(prayersForTable)
    .innerJoin(usersTable, eq(usersTable.id, prayersForTable.prayerUserId))
    .where(whereClause)
    .orderBy(desc(prayersForTable.startedAt));

  res.json(rows);
});

// ─── GET /api/prayers-for/for-me/history ────────────────────────────────────
// Full backlog of every prayer ever offered for me — including ones that
// have expired (the prayer-er didn't renew) and ones that have been
// acknowledged (the prayer-er explicitly ended). Past prayers stay readable
// here so the recipient has a permanent record of who has held them in
// prayer, even after those prayers rotate out of the prayer-er's active
// slideshow. Each row is tagged with `active` so the client can group
// active vs past without recomputing the predicate.
//
// Mute filtering is preserved so blocking someone purges their name from
// the historical view too.
router.get("/prayers-for/for-me/history", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const mutedRows = await db.select({ mutedUserId: userMutesTable.mutedUserId })
    .from(userMutesTable)
    .where(eq(userMutesTable.muterId, sessionUserId));
  const mutedIds = mutedRows.map(r => r.mutedUserId);

  const baseWhere = eq(prayersForTable.recipientUserId, sessionUserId);
  const whereClause = mutedIds.length > 0
    ? and(baseWhere, notInArray(prayersForTable.prayerUserId, mutedIds))
    : baseWhere;

  const rows = await db.select({
    id: prayersForTable.id,
    startedAt: prayersForTable.startedAt,
    expiresAt: prayersForTable.expiresAt,
    acknowledgedAt: prayersForTable.acknowledgedAt,
    prayerText: prayersForTable.prayerText,
    prayerUserId: prayersForTable.prayerUserId,
    prayerName: usersTable.name,
    prayerEmail: usersTable.email,
    prayerAvatarUrl: usersTable.avatarUrl,
  })
    .from(prayersForTable)
    .innerJoin(usersTable, eq(usersTable.id, prayersForTable.prayerUserId))
    .where(whereClause)
    .orderBy(desc(prayersForTable.startedAt));

  const now = Date.now();
  const enriched = rows.map(r => {
    const expired = r.expiresAt.getTime() <= now;
    const acknowledged = r.acknowledgedAt != null;
    return {
      ...r,
      acknowledgedAt: r.acknowledgedAt ? r.acknowledgedAt.toISOString() : null,
      expired,
      acknowledged,
      // active = currently being held. Past = either expired with no
      // renewal, or explicitly ended by the prayer-er.
      active: !expired && !acknowledged,
    };
  });

  res.json(enriched);
});

// ─── POST /api/prayers-for ──────────────────────────────────────────────────
// Create a new private prayer for someone, for 3 or 7 days.
// Create-prayer-for sends a push to the recipient. Rate-limited per
// user because a hostile or buggy client could otherwise spam any
// other user's lock screen with private-prayer pushes. 20/hour is
// generous for normal usage (you don't write 20 private prayers an
// hour) but cuts off the abuse curve sharply.
router.post("/prayers-for", perUserRateLimit("prayers_for_create", {
  max: 20, windowMs: 60 * 60 * 1000,
  message: "You've started a lot of prayers in the last hour. Please try again later.",
}), async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const schema = z.object({
    recipientUserId: z.number().int().positive(),
    prayerText: z.string().min(1).max(1000),
    durationDays: z.union([z.literal(3), z.literal(7)]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  if (parsed.data.recipientUserId === sessionUserId) {
    res.status(400).json({ error: "You can't start a prayer for yourself here." });
    return;
  }

  const [recipient] = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, parsed.data.recipientUserId));
  if (!recipient) { res.status(404).json({ error: "Recipient not found" }); return; }

  const [sender] = await db.select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, sessionUserId));

  const now = new Date();
  const expiresAt = new Date(now.getTime() + parsed.data.durationDays * 24 * 60 * 60 * 1000);

  const [created] = await db.insert(prayersForTable)
    .values({
      prayerUserId: sessionUserId,
      recipientUserId: parsed.data.recipientUserId,
      prayerText: parsed.data.prayerText,
      durationDays: parsed.data.durationDays,
      startedAt: now,
      expiresAt,
    })
    .returning();

  // Fire-and-forget — an APNs hiccup shouldn't break the create response.
  sendPrayerForYouPush(
    parsed.data.recipientUserId,
    sender?.name || "Someone",
    created.id,
  ).catch((err) => {
    console.warn("[prayers-for] push dispatch failed:", err);
  });

  res.status(201).json(created);
});

// ─── POST /api/prayers-for/:id/renew ────────────────────────────────────────
// Extend by another N days (3 or 7). Clears acknowledgedAt, resets expiresAt.
router.post("/prayers-for/:id/renew", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({
    durationDays: z.union([z.literal(3), z.literal(7)]).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [row] = await db.select().from(prayersForTable).where(eq(prayersForTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.prayerUserId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const days = parsed.data.durationDays ?? row.durationDays;
  const newExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const [updated] = await db.update(prayersForTable)
    .set({ expiresAt: newExpiry, durationDays: days, acknowledgedAt: null })
    .where(eq(prayersForTable.id, id))
    .returning();
  res.json(updated);
});

// ─── POST /api/prayers-for/:id/end ──────────────────────────────────────────
// Acknowledge end — marks acknowledgedAt, removes from all surfaces.
router.post("/prayers-for/:id/end", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db.select().from(prayersForTable).where(eq(prayersForTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (row.prayerUserId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(prayersForTable)
    .set({ acknowledgedAt: new Date() })
    .where(eq(prayersForTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
