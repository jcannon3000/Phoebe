import { Router, type IRouter } from "express";
import { eq, desc, inArray, notInArray, and, isNull, or, gt } from "drizzle-orm";
import { db, prayerRequestsTable, prayerWordsTable, usersTable, ritualsTable, momentUserTokensTable, userMutesTable, fellowsTable } from "@workspace/db";
import { z } from "zod/v4";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// Get garden connection user IDs for a user (people who share a tradition or practice)
async function getGardenUserIds(userId: number): Promise<number[]> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return [];

  // People from traditions
  const rituals = await db.select().from(ritualsTable).where(
    or(
      eq(ritualsTable.ownerId, userId),
      sql`${ritualsTable.participants} @> ${JSON.stringify([{ email: user.email }])}::jsonb`
    )
  );
  const participantEmails = new Set<string>();
  for (const r of rituals) {
    const parts = (r.participants as { email: string }[]) ?? [];
    for (const p of parts) {
      if (p.email && p.email !== user.email) participantEmails.add(p.email);
    }
    // Also add owner's email if not self
    const ownerRow = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, r.ownerId)).limit(1);
    if (ownerRow[0]?.email && ownerRow[0].email !== user.email) participantEmails.add(ownerRow[0].email);
  }

  // People from practices
  const myTokens = await db.select({ momentId: momentUserTokensTable.momentId })
    .from(momentUserTokensTable).where(eq(momentUserTokensTable.email, user.email));
  if (myTokens.length > 0) {
    const momentIds = myTokens.map(t => t.momentId);
    const otherTokens = await db.select({ email: momentUserTokensTable.email })
      .from(momentUserTokensTable).where(inArray(momentUserTokensTable.momentId, momentIds));
    for (const t of otherTokens) {
      if (t.email && t.email !== user.email) participantEmails.add(t.email);
    }
  }

  if (participantEmails.size === 0) return [];
  const gardenUsers = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(inArray(usersTable.email, Array.from(participantEmails)));
  return gardenUsers.map(u => u.id);
}

// GET /api/prayer-requests — list active prayer requests visible to me (mine + garden)
router.get("/prayer-requests", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const gardenIds = await getGardenUserIds(sessionUserId);
  const visibleOwnerIds = [sessionUserId, ...gardenIds];

  // Fetch muted user IDs so we can exclude their requests
  const mutedRows = await db
    .select({ mutedUserId: userMutesTable.mutedUserId })
    .from(userMutesTable)
    .where(eq(userMutesTable.muterId, sessionUserId));
  const mutedIds = mutedRows.map(r => r.mutedUserId);

  // Fetch fellow user IDs so we can flag and prioritize their requests
  const fellowRows = await db
    .select({ fellowUserId: fellowsTable.fellowUserId })
    .from(fellowsTable)
    .where(eq(fellowsTable.userId, sessionUserId));
  const fellowIds = new Set(fellowRows.map(r => r.fellowUserId));

  const now = new Date();

  // Prayer requests stay visible until the owner explicitly releases,
  // answers, or deletes them. For other viewers, once `expiresAt` has
  // passed and the owner hasn't renewed, the request drops off. The
  // owner themself continues to see it so they can tap "Renew".
  const freshOrMine = or(
    eq(prayerRequestsTable.ownerId, sessionUserId),
    isNull(prayerRequestsTable.expiresAt),
    gt(prayerRequestsTable.expiresAt, new Date()),
  );
  const requests = await db.select().from(prayerRequestsTable)
    .where(
      mutedIds.length > 0
        ? and(
            inArray(prayerRequestsTable.ownerId, visibleOwnerIds),
            isNull(prayerRequestsTable.closedAt),
            notInArray(prayerRequestsTable.ownerId, mutedIds),
            freshOrMine,
          )
        : and(
            inArray(prayerRequestsTable.ownerId, visibleOwnerIds),
            isNull(prayerRequestsTable.closedAt),
            freshOrMine,
          )
    )
    .orderBy(desc(prayerRequestsTable.createdAt));

  // Enrich with owner name, words, and per-user flags
  const enriched = await Promise.all(requests.map(async (r) => {
    const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, r.ownerId));
    const words = await db.select({
      authorName: prayerWordsTable.authorName,
      content: prayerWordsTable.content,
      authorUserId: prayerWordsTable.authorUserId,
    }).from(prayerWordsTable).where(eq(prayerWordsTable.requestId, r.id));

    const myWordRow = words.find(w => w.authorUserId === sessionUserId);
    const isOwnRequest = r.ownerId === sessionUserId;

    // Freshness flags based on expiresAt (which we no longer hard-filter on)
    let nearingExpiry = false;
    let needsRenewal = false;
    if (isOwnRequest && r.expiresAt) {
      const msUntilExpiry = r.expiresAt.getTime() - now.getTime();
      if (msUntilExpiry <= 0) {
        // Past the 3-day mark — owner can renew
        needsRenewal = true;
      } else if (msUntilExpiry <= 12 * 60 * 60 * 1000) {
        // Within 12 hours of the 3-day mark
        nearingExpiry = true;
      }
    }

    return {
      ...r,
      ownerName: r.isAnonymous ? null : (owner?.name ?? null),
      isOwnRequest,
      isFellow: fellowIds.has(r.ownerId),
      words: words.map(w => ({ authorName: w.authorName, content: w.content })),
      myWord: myWordRow?.content ?? null,
      nearingExpiry,
      needsRenewal,
    };
  }));

  // Sort: fellows' requests first, then by creation date (already ordered)
  enriched.sort((a, b) => {
    if (a.isFellow && !b.isFellow) return -1;
    if (!a.isFellow && b.isFellow) return 1;
    return 0;
  });

  res.json(enriched);
});

// POST /api/prayer-requests — create a request
// Cap: a user can only hold 3 active prayer requests at a time. "Active" =
// not answered, not closed — regardless of whether it has expired (owners
// keep seeing their own expired requests so they can renew them).
const ACTIVE_PRAYER_REQUEST_CAP = 3;

router.post("/prayer-requests", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const schema = z.object({
    body: z.string().min(1).max(1000),
    isAnonymous: z.boolean().optional().default(false),
    durationDays: z.number().int().min(1).max(30).optional().default(3),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const active = await db.select({ id: prayerRequestsTable.id })
    .from(prayerRequestsTable)
    .where(and(
      eq(prayerRequestsTable.ownerId, sessionUserId),
      eq(prayerRequestsTable.isAnswered, false),
      isNull(prayerRequestsTable.closedAt),
    ));
  if (active.length >= ACTIVE_PRAYER_REQUEST_CAP) {
    res.status(409).json({
      error: `You can only hold ${ACTIVE_PRAYER_REQUEST_CAP} active prayer requests at a time. Mark one as answered or release it to share a new one.`,
    });
    return;
  }

  const [owner] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, sessionUserId));

  const expiresAt = new Date(Date.now() + parsed.data.durationDays * 24 * 60 * 60 * 1000);

  const [created] = await db.insert(prayerRequestsTable)
    .values({
      ownerId: sessionUserId,
      body: parsed.data.body,
      isAnonymous: parsed.data.isAnonymous,
      createdByName: owner?.name ?? null,
      expiresAt,
    })
    .returning();
  res.status(201).json(created);
});

// POST /api/prayer-requests/:id/word — leave (or update) a word on a request
router.post("/prayer-requests/:id/word", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({ content: z.string().min(1).max(120) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.closedAt) { res.status(400).json({ error: "Request is closed" }); return; }

  const [author] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, sessionUserId));
  const authorName = author?.name ?? "Someone";

  const [existing] = await db.select().from(prayerWordsTable)
    .where(and(eq(prayerWordsTable.requestId, id), eq(prayerWordsTable.authorUserId, sessionUserId)));

  let word;
  if (existing) {
    [word] = await db.update(prayerWordsTable)
      .set({ content: parsed.data.content })
      .where(eq(prayerWordsTable.id, existing.id))
      .returning();
  } else {
    [word] = await db.insert(prayerWordsTable)
      .values({
        requestId: id,
        authorUserId: sessionUserId,
        authorName,
        content: parsed.data.content,
      })
      .returning();
  }

  res.json(word);
});

// PATCH /api/prayer-requests/:id/answer — mark as answered (owner only)
router.patch("/prayer-requests/:id/answer", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(prayerRequestsTable)
    .set({ isAnswered: true, answeredAt: new Date(), closedAt: new Date(), closeReason: "answered" })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// PATCH /api/prayer-requests/:id/renew — renew expiry by 3 days (owner only)
router.patch("/prayer-requests/:id/renew", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const newExpiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  const [updated] = await db.update(prayerRequestsTable)
    .set({ expiresAt: newExpiry })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// PATCH /api/prayer-requests/:id/release — release/close a request (owner only)
router.patch("/prayer-requests/:id/release", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const [updated] = await db.update(prayerRequestsTable)
    .set({ closedAt: new Date(), closeReason: "released" })
    .where(eq(prayerRequestsTable.id, id))
    .returning();
  res.json(updated);
});

// DELETE /api/prayer-requests/:id — hard delete (owner only)
router.delete("/prayer-requests/:id", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [request] = await db.select().from(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  if (!request) { res.status(404).json({ error: "Not found" }); return; }
  if (request.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.delete(prayerRequestsTable).where(eq(prayerRequestsTable.id, id));
  res.sendStatus(204);
});

export default router;
