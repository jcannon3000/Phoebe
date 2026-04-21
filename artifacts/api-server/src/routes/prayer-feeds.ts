import { Router, type IRouter, type RequestHandler } from "express";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  prayerFeedsTable,
  prayerFeedEntriesTable,
  prayerFeedSubscriptionsTable,
  prayerFeedPrayersTable,
  usersTable,
  betaUsersTable,
} from "@workspace/db";
import { z } from "zod/v4";
import crypto from "crypto";

const router: IRouter = Router();

// ─── Auth / beta gate ────────────────────────────────────────────────────────

function getUser(req: any): { id: number; email?: string } | null {
  return req.user ? (req.user as { id: number; email?: string }) : null;
}

// Prayer Feeds is a beta-only feature for now. Every route below is
// wrapped by `requireBeta` so a stale UI build or a direct fetch from a
// non-beta account cannot reach the endpoints.
const requireBeta: RequestHandler = async (req, res, next) => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
    const [beta] = await db.select({ email: betaUsersTable.email })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (!beta) {
      res.status(403).json({ error: "Prayer Feeds is a beta-only feature." });
      return;
    }
    next();
  } catch {
    res.status(403).json({ error: "Prayer Feeds is a beta-only feature." });
  }
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "feed";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  const [existing] = await db.select({ id: prayerFeedsTable.id })
    .from(prayerFeedsTable).where(eq(prayerFeedsTable.slug, slug));
  if (!existing) return slug;
  return `${slug}-${crypto.randomBytes(3).toString("hex")}`;
}

// Compute today's calendar date (YYYY-MM-DD) in the feed's timezone.
// Falls back to UTC if the IANA zone is invalid.
function todayInZone(tz: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date()); // "YYYY-MM-DD"
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function getFeedBySlug(slug: string) {
  const [feed] = await db.select().from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.slug, slug));
  return feed ?? null;
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const createFeedSchema = z.object({
  title: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(200).optional().nullable(),
  coverEmoji: z.string().trim().max(8).optional().nullable(),
  coverImageUrl: z.string().trim().url().max(500).optional().nullable(),
  timezone: z.string().trim().max(60).optional(),
});

const updateFeedSchema = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  tagline: z.string().trim().max(200).nullable().optional(),
  coverEmoji: z.string().trim().max(8).nullable().optional(),
  coverImageUrl: z.string().trim().url().max(500).nullable().optional(),
  timezone: z.string().trim().max(60).optional(),
  state: z.enum(["draft", "live", "paused"]).optional(),
});

const entrySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "entryDate must be YYYY-MM-DD"),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(2000).default(""),
  scriptureRef: z.string().trim().max(80).nullable().optional(),
  imageUrl: z.string().trim().url().max(500).nullable().optional(),
  state: z.enum(["draft", "scheduled", "published"]).default("draft"),
});

const updateEntrySchema = entrySchema.partial().extend({
  // entryDate stays the key — moving an entry to a different date is a
  // delete-and-recreate, not an in-place update.
  entryDate: z.undefined().optional(),
});

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /api/prayer-feeds — discovery: every `live` feed. For Phase 2/3
// beta this is a simple flat list; ranking / curation comes later.
router.get("/prayer-feeds", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const rows = await db.select().from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.state, "live"))
    .orderBy(desc(prayerFeedsTable.subscriberCount), desc(prayerFeedsTable.createdAt));

  // Annotate each row with whether the caller already subscribes.
  const subRows = await db.select({
    feedId: prayerFeedSubscriptionsTable.feedId,
  }).from(prayerFeedSubscriptionsTable)
    .where(eq(prayerFeedSubscriptionsTable.userId, user.id));
  const subscribedIds = new Set(subRows.map(r => r.feedId));

  res.json({
    feeds: rows.map(f => ({ ...f, isSubscribed: subscribedIds.has(f.id) })),
  });
});

// GET /api/prayer-feeds/mine — feeds the caller created
router.get("/prayer-feeds/mine", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const rows = await db.select().from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.creatorUserId, user.id))
    .orderBy(desc(prayerFeedsTable.createdAt));
  res.json({ feeds: rows });
});

// GET /api/prayer-feeds/subscribed — feeds the caller subscribes to,
// each with today's entry (if any). Used by the dashboard.
router.get("/prayer-feeds/subscribed", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const subs = await db
    .select({
      feed: prayerFeedsTable,
    })
    .from(prayerFeedSubscriptionsTable)
    .innerJoin(prayerFeedsTable, eq(prayerFeedsTable.id, prayerFeedSubscriptionsTable.feedId))
    .where(eq(prayerFeedSubscriptionsTable.userId, user.id));

  const out: Array<{
    feed: typeof prayerFeedsTable.$inferSelect;
    todayEntry: typeof prayerFeedEntriesTable.$inferSelect | null;
    prayedToday: boolean;
  }> = [];

  for (const { feed } of subs) {
    const today = todayInZone(feed.timezone);
    const [entry] = await db.select().from(prayerFeedEntriesTable)
      .where(and(
        eq(prayerFeedEntriesTable.feedId, feed.id),
        eq(prayerFeedEntriesTable.entryDate, today),
        eq(prayerFeedEntriesTable.state, "published"),
      ));
    let prayedToday = false;
    if (entry) {
      const [p] = await db.select({ id: prayerFeedPrayersTable.id })
        .from(prayerFeedPrayersTable)
        .where(and(
          eq(prayerFeedPrayersTable.entryId, entry.id),
          eq(prayerFeedPrayersTable.userId, user.id),
        ));
      prayedToday = !!p;
    }
    out.push({ feed, todayEntry: entry ?? null, prayedToday });
  }
  res.json({ subscriptions: out });
});

// POST /api/prayer-feeds — create a new feed (caller is the creator)
router.post("/prayer-feeds", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const parsed = createFeedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { title, tagline, coverEmoji, coverImageUrl, timezone } = parsed.data;
  const slug = await uniqueSlug(title);
  const [row] = await db.insert(prayerFeedsTable).values({
    slug,
    title,
    tagline: tagline ?? null,
    coverEmoji: coverEmoji ?? null,
    coverImageUrl: coverImageUrl ?? null,
    creatorUserId: user.id,
    timezone: timezone || "America/New_York",
    state: "draft",
  }).returning();
  res.status(201).json({ feed: row });
});

// GET /api/prayer-feeds/:slug — feed metadata + permission flags for the
// caller. Creator sees everything; subscribers see published entries only.
router.get("/prayer-feeds/:slug", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }

  const isCreator = feed.creatorUserId === user.id;
  const [sub] = await db.select().from(prayerFeedSubscriptionsTable)
    .where(and(
      eq(prayerFeedSubscriptionsTable.feedId, feed.id),
      eq(prayerFeedSubscriptionsTable.userId, user.id),
    ));

  // Draft / paused feeds are hidden from non-creators entirely.
  if (!isCreator && feed.state === "draft") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({
    feed,
    isCreator,
    isSubscribed: !!sub,
    mutedUntil: sub?.mutedUntil ?? null,
  });
});

// PUT /api/prayer-feeds/:slug — creator-only edit (includes state changes)
router.put("/prayer-feeds/:slug", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (feed.creatorUserId !== user.id) {
    res.status(403).json({ error: "Only the creator can edit this feed." });
    return;
  }
  const parsed = updateFeedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  const [row] = await db.update(prayerFeedsTable).set(patch as any)
    .where(eq(prayerFeedsTable.id, feed.id))
    .returning();
  res.json({ feed: row });
});

// GET /api/prayer-feeds/:slug/entries — list entries in a date range.
// Creator sees every state; non-creators see only published.
router.get("/prayer-feeds/:slug/entries", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const isCreator = feed.creatorUserId === user.id;
  if (!isCreator && feed.state === "draft") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const fromRaw = typeof req.query.from === "string" ? req.query.from : null;
  const toRaw = typeof req.query.to === "string" ? req.query.to : null;
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const from = fromRaw && dateRe.test(fromRaw) ? fromRaw : null;
  const to = toRaw && dateRe.test(toRaw) ? toRaw : null;

  const conditions = [eq(prayerFeedEntriesTable.feedId, feed.id)];
  if (from) conditions.push(gte(prayerFeedEntriesTable.entryDate, from));
  if (to) conditions.push(lte(prayerFeedEntriesTable.entryDate, to));
  if (!isCreator) conditions.push(eq(prayerFeedEntriesTable.state, "published"));

  const entries = await db.select().from(prayerFeedEntriesTable)
    .where(and(...conditions))
    .orderBy(asc(prayerFeedEntriesTable.entryDate));
  res.json({ entries });
});

// POST /api/prayer-feeds/:slug/entries — creator-only upsert by date.
// If an entry already exists for that date, it's updated in place.
router.post("/prayer-feeds/:slug/entries", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (feed.creatorUserId !== user.id) {
    res.status(403).json({ error: "Only the creator can publish entries." });
    return;
  }
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { entryDate, title, body, scriptureRef, imageUrl, state } = parsed.data;
  const publishedAt = state === "published" ? new Date() : null;

  const [row] = await db.insert(prayerFeedEntriesTable).values({
    feedId: feed.id,
    entryDate,
    title,
    body,
    scriptureRef: scriptureRef ?? null,
    imageUrl: imageUrl ?? null,
    state,
    createdByUserId: user.id,
    publishedAt,
  }).onConflictDoUpdate({
    target: [prayerFeedEntriesTable.feedId, prayerFeedEntriesTable.entryDate],
    set: {
      title,
      body,
      scriptureRef: scriptureRef ?? null,
      imageUrl: imageUrl ?? null,
      state,
      updatedAt: new Date(),
      publishedAt: sql`CASE WHEN ${prayerFeedEntriesTable.publishedAt} IS NULL AND ${state === "published"} THEN NOW() ELSE ${prayerFeedEntriesTable.publishedAt} END`,
    },
  }).returning();

  res.status(201).json({ entry: row });
});

// DELETE /api/prayer-feeds/:slug/entries/:date — creator-only
router.delete("/prayer-feeds/:slug/entries/:date", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (feed.creatorUserId !== user.id) {
    res.status(403).json({ error: "Only the creator can delete entries." });
    return;
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(String(req.params.date))) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  await db.delete(prayerFeedEntriesTable).where(and(
    eq(prayerFeedEntriesTable.feedId, feed.id),
    eq(prayerFeedEntriesTable.entryDate, String(req.params.date)),
  ));
  res.json({ ok: true });
});

// POST /api/prayer-feeds/:slug/subscribe — idempotent subscribe
router.post("/prayer-feeds/:slug/subscribe", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (feed.state !== "live") {
    res.status(400).json({ error: "This feed is not currently accepting subscribers." });
    return;
  }
  await db.insert(prayerFeedSubscriptionsTable).values({
    feedId: feed.id,
    userId: user.id,
  }).onConflictDoNothing();
  // Recompute subscriberCount lazily
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(prayerFeedSubscriptionsTable)
    .where(eq(prayerFeedSubscriptionsTable.feedId, feed.id));
  await db.update(prayerFeedsTable)
    .set({ subscriberCount: count, updatedAt: new Date() })
    .where(eq(prayerFeedsTable.id, feed.id));
  res.json({ ok: true, subscriberCount: count });
});

// DELETE /api/prayer-feeds/:slug/subscribe — unsubscribe
router.delete("/prayer-feeds/:slug/subscribe", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(prayerFeedSubscriptionsTable).where(and(
    eq(prayerFeedSubscriptionsTable.feedId, feed.id),
    eq(prayerFeedSubscriptionsTable.userId, user.id),
  ));
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(prayerFeedSubscriptionsTable)
    .where(eq(prayerFeedSubscriptionsTable.feedId, feed.id));
  await db.update(prayerFeedsTable)
    .set({ subscriberCount: count, updatedAt: new Date() })
    .where(eq(prayerFeedsTable.id, feed.id));
  res.json({ ok: true, subscriberCount: count });
});

// POST /api/prayer-feeds/:slug/entries/:date/pray — log a prayer.
// Returns updated today-context: prayCount + who-prayed roster.
router.post("/prayer-feeds/:slug/entries/:date/pray", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(String(req.params.date))) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  const [entry] = await db.select().from(prayerFeedEntriesTable)
    .where(and(
      eq(prayerFeedEntriesTable.feedId, feed.id),
      eq(prayerFeedEntriesTable.entryDate, String(req.params.date)),
      eq(prayerFeedEntriesTable.state, "published"),
    ));
  if (!entry) { res.status(404).json({ error: "Entry not published." }); return; }

  // Discipline: you can only pray for today's intention in the feed's tz.
  const today = todayInZone(feed.timezone);
  if (entry.entryDate !== today) {
    res.status(400).json({ error: "You can only pray for today's intention." });
    return;
  }

  const reflectionText = typeof req.body?.reflectionText === "string"
    ? req.body.reflectionText.trim().slice(0, 1000)
    : null;

  await db.insert(prayerFeedPrayersTable).values({
    feedId: feed.id,
    entryId: entry.id,
    userId: user.id,
    dayLocal: today,
    reflectionText: reflectionText || null,
  }).onConflictDoNothing();

  // Recompute count
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(prayerFeedPrayersTable)
    .where(eq(prayerFeedPrayersTable.entryId, entry.id));
  await db.update(prayerFeedEntriesTable)
    .set({ prayCount: count, updatedAt: new Date() })
    .where(eq(prayerFeedEntriesTable.id, entry.id));

  res.json({ ok: true, prayCount: count });
});

// GET /api/prayer-feeds/:slug/entries/:date/prayers — roster for a day
router.get("/prayer-feeds/:slug/entries/:date/prayers", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const isCreator = feed.creatorUserId === user.id;
  if (!isCreator && feed.state === "draft") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(String(req.params.date))) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const [entry] = await db.select().from(prayerFeedEntriesTable)
    .where(and(
      eq(prayerFeedEntriesTable.feedId, feed.id),
      eq(prayerFeedEntriesTable.entryDate, String(req.params.date)),
    ));
  if (!entry) { res.json({ prayers: [] }); return; }

  const rows = await db
    .select({
      name: usersTable.name,
      email: usersTable.email,
      avatarUrl: usersTable.avatarUrl,
      createdAt: prayerFeedPrayersTable.createdAt,
    })
    .from(prayerFeedPrayersTable)
    .innerJoin(usersTable, eq(usersTable.id, prayerFeedPrayersTable.userId))
    .where(eq(prayerFeedPrayersTable.entryId, entry.id))
    .orderBy(asc(prayerFeedPrayersTable.createdAt));
  res.json({ prayers: rows, prayCount: rows.length });
});

export default router;
