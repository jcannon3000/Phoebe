import { Router, type IRouter, type RequestHandler } from "express";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  prayerFeedsTable,
  prayerFeedEntriesTable,
  prayerFeedSubscriptionsTable,
  prayerFeedPrayersTable,
  prayerFeedGroupsTable,
  usersTable,
  betaUsersTable,
  groupsTable,
  groupMembersTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
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

// Edit permission for a feed:
//   • the creator can always edit
//   • for platform-owned feeds (creator_user_id IS NULL — e.g.
//     phoebe-climate), any beta admin can edit. This is how Phoebe
//     staff publish daily intentions for platform feeds without
//     a per-feed "creator" account.
async function canEditFeed(
  userId: number,
  feed: { creatorUserId: number | null },
): Promise<boolean> {
  if (feed.creatorUserId === userId) return true;
  if (feed.creatorUserId !== null) return false;
  const [u] = await db.select({ email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return false;
  const [admin] = await db.select({ isAdmin: betaUsersTable.isAdmin })
    .from(betaUsersTable)
    .where(eq(betaUsersTable.email, u.email.toLowerCase()));
  return !!admin?.isAdmin;
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const createFeedSchema = z.object({
  title: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(200).optional().nullable(),
  coverEmoji: z.string().trim().max(8).optional().nullable(),
  coverImageUrl: z.string().trim().url().max(500).optional().nullable(),
  timezone: z.string().trim().max(60).optional(),
  // Optional: when creating from a community page, the slug of the
  // community to bind. Server resolves to a group_id and:
  //   1. inserts a prayer_feed_groups row
  //   2. auto-subscribes every joined member of the group to the feed
  // Caller must be a community admin of the target group OR the
  // feed creator (which is the same person here, since the caller is
  // creating the feed).
  initialGroupSlug: z.string().trim().min(1).max(80).optional(),
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
  // 1, 2, or 3. Default 1 so callers that don't specify keep working
  // (single-slot legacy behavior). Each slot becomes its own slide on
  // the subscriber side, in ascending order.
  slot: z.number().int().min(1).max(3).default(1),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(2000).default(""),
  scriptureRef: z.string().trim().max(80).nullable().optional(),
  imageUrl: z.string().trim().url().max(500).nullable().optional(),
  // Optional URL — surfaces as a "Learn more →" pill on the
  // subscriber's intercession slide.
  learnMoreUrl: z.string().trim().url().max(500).nullable().optional(),
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
    // Multi-slot feeds publish up to three entries per date. The
    // dashboard summary card has room for one preview, so we pick the
    // earliest slot (smallest slot number) that's been published. That
    // matches the order subscribers see them in prayer-mode and gives
    // a stable "today's intention" preview regardless of how many
    // slots are filled.
    const [entry] = await db.select().from(prayerFeedEntriesTable)
      .where(and(
        eq(prayerFeedEntriesTable.feedId, feed.id),
        eq(prayerFeedEntriesTable.entryDate, today),
        eq(prayerFeedEntriesTable.state, "published"),
      ))
      .orderBy(asc(prayerFeedEntriesTable.slot))
      .limit(1);
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

// POST /api/prayer-feeds — create a new feed (caller is the creator).
// When `initialGroupSlug` is set (e.g. the user tapped "+ Prayer Feed"
// on a community page), the new feed is bound to that group and every
// joined member is auto-subscribed. The community + button used to
// just pass the slug in the URL and silently drop it; now it
// actually wires the feed to the community.
router.post("/prayer-feeds", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const parsed = createFeedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { title, tagline, coverEmoji, coverImageUrl, timezone, initialGroupSlug } = parsed.data;
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

  if (initialGroupSlug) {
    try {
      await bindFeedToGroup(row.id, initialGroupSlug, user.id);
    } catch (err) {
      // Don't fail the whole request if the group bind fails — the
      // feed itself is created and the user can add the group from
      // the manage page after. Log and move on.
      console.warn("[prayer-feeds] initial group bind failed:", err);
    }
  }

  res.status(201).json({ feed: row });
});

// Binds a feed to a group. Auth: caller must be the feed's creator
// OR a community admin of the target group. Side effect: every
// joined member of the group gets a prayer_feed_subscriptions row
// inserted (ON CONFLICT DO NOTHING so re-binding is idempotent).
// Throws on permission / not-found so callers can map to the right
// HTTP status.
async function bindFeedToGroup(feedId: number, groupSlug: string, byUserId: number): Promise<void> {
  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, groupSlug));
  if (!group) throw new Error("group_not_found");
  // Permission: feed creator OR admin of this group.
  const [feed] = await db.select().from(prayerFeedsTable).where(eq(prayerFeedsTable.id, feedId));
  if (!feed) throw new Error("feed_not_found");
  const isCreator = feed.creatorUserId === byUserId;
  let isGroupAdmin = false;
  if (!isCreator) {
    const [membership] = await db
      .select({ role: groupMembersTable.role })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, group.id),
        eq(groupMembersTable.userId, byUserId),
      ));
    isGroupAdmin = membership?.role === "admin" || membership?.role === "hidden_admin";
  }
  if (!isCreator && !isGroupAdmin) throw new Error("forbidden");

  // Bind row (idempotent).
  await db.insert(prayerFeedGroupsTable).values({
    feedId,
    groupId: group.id,
    addedByUserId: byUserId,
  }).onConflictDoNothing();

  // Auto-subscribe every joined member of the group.
  const memberRows = await db
    .select({ userId: groupMembersTable.userId })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, group.id),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      sql`${groupMembersTable.userId} IS NOT NULL`,
    ));
  const memberUserIds = memberRows
    .map((r) => r.userId)
    .filter((id): id is number => typeof id === "number");
  if (memberUserIds.length > 0) {
    await db.insert(prayerFeedSubscriptionsTable).values(
      memberUserIds.map((uid) => ({ feedId, userId: uid })),
    ).onConflictDoNothing();
  }
}

// GET /api/prayer-feeds/:slug — feed metadata + permission flags for the
// caller. Editors see everything; subscribers see published entries only.
//
// `isCreator` here is "can edit" semantics — it's true for the human
// creator AND for beta admins on platform-owned feeds (creatorUserId
// NULL, e.g. phoebe-climate). The flag name is preserved for client
// back-compat.
router.get("/prayer-feeds/:slug", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }

  const isCreator = await canEditFeed(user.id, feed);
  const [sub] = await db.select().from(prayerFeedSubscriptionsTable)
    .where(and(
      eq(prayerFeedSubscriptionsTable.feedId, feed.id),
      eq(prayerFeedSubscriptionsTable.userId, user.id),
    ));

  // Draft / paused feeds are hidden from non-editors entirely.
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

// PUT /api/prayer-feeds/:slug — editor-only edit (includes state changes)
router.put("/prayer-feeds/:slug", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "You don't have permission to edit this feed." });
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

// DELETE /api/prayer-feeds/:slug — admin/creator deletes the entire feed
// and all of its entries + subscriptions. Cascade behavior:
//   • prayer_feed_entries → ON DELETE CASCADE drops every entry
//   • prayer_feed_subscriptions → ON DELETE CASCADE drops every sub
//   • prayer_feed_prayers (per-entry "I prayed" stamps) → cascades via
//     entries
// Permission gate is the same `canEditFeed` used by PUT — only the
// creator (and platform admins for editorial feeds) can delete.
// Platform-owned feeds (creator_user_id IS NULL, e.g. phoebe-climate)
// can be deleted by any platform admin.
router.delete("/prayer-feeds/:slug", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "You don't have permission to delete this feed." });
    return;
  }
  await db.delete(prayerFeedsTable).where(eq(prayerFeedsTable.id, feed.id));
  res.json({ ok: true });
});

// ── Feed ↔ group bindings ──────────────────────────────────────────
//
// GET    /:slug/groups        — list groups bound to this feed
// POST   /:slug/groups        — bind a group (auto-subscribes members)
// DELETE /:slug/groups/:gid   — unbind (does NOT unsubscribe)
//
// Auth: any beta user can list (the data is non-sensitive — it tells
// you which communities back this feed). Add / remove gated to feed
// creator OR community admin of the target group via bindFeedToGroup.

router.get("/prayer-feeds/:slug/groups", requireBeta, async (req, res): Promise<void> => {
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const rows = await db
    .select({
      groupId: prayerFeedGroupsTable.groupId,
      addedAt: prayerFeedGroupsTable.createdAt,
      groupSlug: groupsTable.slug,
      groupName: groupsTable.name,
      groupEmoji: groupsTable.emoji,
    })
    .from(prayerFeedGroupsTable)
    .leftJoin(groupsTable, eq(groupsTable.id, prayerFeedGroupsTable.groupId))
    .where(eq(prayerFeedGroupsTable.feedId, feed.id))
    .orderBy(asc(prayerFeedGroupsTable.createdAt));
  res.json({ groups: rows });
});

router.post("/prayer-feeds/:slug/groups", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const groupSlug = typeof req.body?.groupSlug === "string" ? req.body.groupSlug.trim() : "";
  if (!groupSlug) { res.status(400).json({ error: "groupSlug required" }); return; }
  try {
    await bindFeedToGroup(feed.id, groupSlug, user.id);
    res.status(201).json({ ok: true });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "group_not_found") { res.status(404).json({ error: "Group not found" }); return; }
    if (msg === "forbidden") { res.status(403).json({ error: "Only the feed creator or a community admin can bind a group." }); return; }
    console.error("[prayer-feeds] bind group failed:", err);
    res.status(500).json({ error: "Failed to bind group" });
  }
});

router.delete("/prayer-feeds/:slug/groups/:groupId", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const groupId = parseInt(String(req.params.groupId), 10);
  if (!Number.isFinite(groupId)) { res.status(400).json({ error: "Invalid group id" }); return; }
  // Permission: feed creator OR admin of this group (mirrors the
  // bind path).
  const isCreator = feed.creatorUserId === user.id;
  let isGroupAdmin = false;
  if (!isCreator) {
    const [membership] = await db
      .select({ role: groupMembersTable.role })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, groupId),
        eq(groupMembersTable.userId, user.id),
      ));
    isGroupAdmin = membership?.role === "admin" || membership?.role === "hidden_admin";
  }
  if (!isCreator && !isGroupAdmin) {
    res.status(403).json({ error: "Only the feed creator or a community admin can remove a group." });
    return;
  }
  await db.delete(prayerFeedGroupsTable).where(and(
    eq(prayerFeedGroupsTable.feedId, feed.id),
    eq(prayerFeedGroupsTable.groupId, groupId),
  ));
  // Note: we deliberately do NOT unsubscribe individual members
  // here. People who manually subscribed should stay subscribed;
  // the binding remove just means new joiners won't be auto-
  // subscribed going forward.
  void inArray;
  res.json({ ok: true });
});

// GET /api/prayer-feeds/:slug/entries — list entries in a date range.
// Editors see every state; non-editors see only published.
router.get("/prayer-feeds/:slug/entries", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const isCreator = await canEditFeed(user.id, feed);
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
    .orderBy(asc(prayerFeedEntriesTable.entryDate), asc(prayerFeedEntriesTable.slot));
  res.json({ entries });
});

// POST /api/prayer-feeds/:slug/entries — editor-only upsert by date.
// If an entry already exists for that date, it's updated in place.
router.post("/prayer-feeds/:slug/entries", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "You don't have permission to publish to this feed." });
    return;
  }
  const parsed = entrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { entryDate, slot, title, body, scriptureRef, imageUrl, learnMoreUrl, state } = parsed.data;
  const publishedAt = state === "published" ? new Date() : null;

  // Upsert by (feed, date, slot). Three slots per day max — slot 1
  // is the legacy default for clients that haven't been updated.
  const [row] = await db.insert(prayerFeedEntriesTable).values({
    feedId: feed.id,
    entryDate,
    slot,
    title,
    body,
    scriptureRef: scriptureRef ?? null,
    imageUrl: imageUrl ?? null,
    learnMoreUrl: learnMoreUrl ?? null,
    state,
    createdByUserId: user.id,
    publishedAt,
  }).onConflictDoUpdate({
    target: [prayerFeedEntriesTable.feedId, prayerFeedEntriesTable.entryDate, prayerFeedEntriesTable.slot],
    set: {
      title,
      body,
      scriptureRef: scriptureRef ?? null,
      imageUrl: imageUrl ?? null,
      learnMoreUrl: learnMoreUrl ?? null,
      state,
      updatedAt: new Date(),
      publishedAt: sql`CASE WHEN ${prayerFeedEntriesTable.publishedAt} IS NULL AND ${state === "published"} THEN NOW() ELSE ${prayerFeedEntriesTable.publishedAt} END`,
    },
  }).returning();

  res.status(201).json({ entry: row });
});

// DELETE /api/prayer-feeds/:slug/entries/:date — editor-only.
// Optional ?slot=1|2|3 narrows the delete to a single slot. Without
// the param we delete every slot on that date (back-compat with
// callers that pre-date the multi-slot rollout).
router.delete("/prayer-feeds/:slug/entries/:date", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "You don't have permission to delete entries on this feed." });
    return;
  }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(String(req.params.date))) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const slotRaw = typeof req.query.slot === "string" ? parseInt(req.query.slot, 10) : null;
  const slot = slotRaw && Number.isInteger(slotRaw) && slotRaw >= 1 && slotRaw <= 3 ? slotRaw : null;
  const conditions = [
    eq(prayerFeedEntriesTable.feedId, feed.id),
    eq(prayerFeedEntriesTable.entryDate, String(req.params.date)),
  ];
  if (slot !== null) conditions.push(eq(prayerFeedEntriesTable.slot, slot));
  await db.delete(prayerFeedEntriesTable).where(and(...conditions));
  res.json({ ok: true });
});

// POST /api/prayer-feeds/:slug/subscribe — idempotent subscribe.
// After inserting the subscription row we reconcile every feed
// intercession's moment_user_tokens so the subscriber receives a token
// per intercession — that's how /api/moments + prayer-mode pick them up.
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

  // Reconcile token rosters across every feed intercession so the new
  // subscriber gets pulled in. Imported lazily to avoid a circular
  // import between the prayer-feeds and groups route modules.
  const { reconcileAllPracticesForFeed } = await import("./groups");
  await reconcileAllPracticesForFeed(feed.id);

  res.json({ ok: true, subscriberCount: count });
});

// DELETE /api/prayer-feeds/:slug/subscribe — unsubscribe. Same
// reconcile-on-the-way-out so the user's tokens for every feed
// intercession are removed in lockstep.
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

  const { reconcileAllPracticesForFeed } = await import("./groups");
  await reconcileAllPracticesForFeed(feed.id);

  res.json({ ok: true, subscriberCount: count });
});

// POST /api/prayer-feeds/:slug/entries/:date/pray — log a prayer.
// Returns updated today-context: prayCount + who-prayed roster.
//
// Slot is taken from `?slot=` (1/2/3) or body.slot, defaulting to 1
// for back-compat with single-slot callers. Each slot has its own
// `prayCount` and roster, so a feed with three slides per day records
// three independent prayer streams.
router.post("/prayer-feeds/:slug/entries/:date/pray", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(String(req.params.date))) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }
  const slotRaw = req.query.slot ?? req.body?.slot ?? 1;
  const slotNum = typeof slotRaw === "string" ? parseInt(slotRaw, 10) : Number(slotRaw);
  const slot = Number.isInteger(slotNum) && slotNum >= 1 && slotNum <= 3 ? slotNum : 1;
  const [entry] = await db.select().from(prayerFeedEntriesTable)
    .where(and(
      eq(prayerFeedEntriesTable.feedId, feed.id),
      eq(prayerFeedEntriesTable.entryDate, String(req.params.date)),
      eq(prayerFeedEntriesTable.slot, slot),
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

// GET /api/prayer-feeds/:slug/entries/:date/prayers — roster for a day.
// Slot is read from `?slot=` (1/2/3), defaulting to 1. Each slot has
// its own roster — calling without a slot still returns slot 1 to keep
// pre-multi-slot UIs working.
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
  const slotRaw = typeof req.query.slot === "string" ? parseInt(req.query.slot, 10) : 1;
  const slot = Number.isInteger(slotRaw) && slotRaw >= 1 && slotRaw <= 3 ? slotRaw : 1;

  const [entry] = await db.select().from(prayerFeedEntriesTable)
    .where(and(
      eq(prayerFeedEntriesTable.feedId, feed.id),
      eq(prayerFeedEntriesTable.entryDate, String(req.params.date)),
      eq(prayerFeedEntriesTable.slot, slot),
    ));
  if (!entry) { res.json({ prayers: [], prayCount: 0 }); return; }

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
