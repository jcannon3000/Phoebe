import { Router, type IRouter, type RequestHandler } from "express";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  db,
  prayerFeedsTable,
  prayerFeedEntriesTable,
  prayerFeedSubscriptionsTable,
  prayerFeedPrayersTable,
  prayerFeedGroupsTable,
  prayerFeedRecurringEntriesTable,
  usersTable,
  betaUsersTable,
  groupsTable,
  groupMembersTable,
  sharedMomentsTable,
  momentUserTokensTable,
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

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Validate the optional action / learn-more URL on a feed intercession.
// Accepts http(s) only, prepends https:// for a bare host, returns null
// on empty/invalid input. Mirrors the climate-admin helper.
function normalizeLearnMoreUrl(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return null;
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
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
  slot: z.number().int().min(1).max(7).default(1),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(2000).default(""),
  scriptureRef: z.string().trim().max(80).nullable().optional(),
  imageUrl: z.string().trim().url().max(500).nullable().optional(),
  // Optional URL — surfaces as a "Learn more →" / "Take action →" pill
  // on the subscriber's intercession slide.
  learnMoreUrl: z.string().trim().url().max(500).nullable().optional(),
  // "custom" (a written prayer) | "action" (a prayer + a CTA link).
  source: z.enum(["custom", "action"]).default("custom"),
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

// GET /api/prayer-feeds/today — today's intercessions across every
// feed the caller subscribes to. Returns one row per (feed, slot) for
// today, merging the concrete prayerFeedEntriesTable rows with the
// recurringEntries that fire today's weekday. Concrete entries win on
// (feed, slot) collisions so an admin's day-specific override beats
// the daily/weekly template.
//
// This is what the prayer-mode slideshow and the personal Community
// intercessions section consume to surface feed-authored intercessions
// alongside group-attached ones. /api/moments doesn't see feed entries
// (different table; sharedMomentsTable is the moments source), so this
// route is the bridge.
router.get("/prayer-feeds/today", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const subs = await db
    .select({
      feedId: prayerFeedsTable.id,
      feedSlug: prayerFeedsTable.slug,
      feedTitle: prayerFeedsTable.title,
      feedCoverEmoji: prayerFeedsTable.coverEmoji,
      feedTimezone: prayerFeedsTable.timezone,
    })
    .from(prayerFeedSubscriptionsTable)
    .innerJoin(prayerFeedsTable, eq(prayerFeedsTable.id, prayerFeedSubscriptionsTable.feedId))
    .where(eq(prayerFeedSubscriptionsTable.userId, user.id));

  if (subs.length === 0) { res.json({ entries: [] }); return; }

  // Collect today's concrete + recurring rows per feed, grouped by
  // feed so the response shape is feed-first (mirrors how the UI
  // renders one card per feed with N intercessions inside).
  type Row = {
    id: number;
    feedId: number;
    feedSlug: string;
    feedTitle: string;
    feedCoverEmoji: string | null;
    slot: number;
    title: string;
    body: string;
    learnMoreUrl: string | null;
    isRecurring: boolean;
    prayedToday: boolean;
    // Communities linked to this feed via prayer_feed_groups — the
    // slideshow renders one pill per group instead of a single feed
    // tag, so the viewer sees which of THEIR communities is carrying
    // today's intercession together.
    groups: Array<{ id: number; name: string; slug: string; emoji: string | null }>;
    // Up to 7 distinct users who prayed THIS entry today. Used by
    // the slideshow's avatar stack + "N have prayed this today" line.
    // Empty for recurring rows (we'd need to know which "instance" to
    // count against — recurring entries have no per-day row of their
    // own until someone prays them); for concrete rows we pull from
    // prayer_feed_prayers.
    prayedBy: Array<{ name: string; avatarUrl: string | null }>;
    prayedTodayCount: number;
  };
  const out: Row[] = [];

  // Per-feed group roster — fetched once per feed and reused for
  // every entry on that feed. The same join also pulls a small
  // emoji per group so the pill row carries the community's
  // visual identity, not just its name.
  async function loadGroupsForFeed(feedId: number) {
    const rows = await db
      .select({
        id: groupsTable.id,
        name: groupsTable.name,
        slug: groupsTable.slug,
        emoji: groupsTable.emoji,
      })
      .from(prayerFeedGroupsTable)
      .innerJoin(groupsTable, eq(groupsTable.id, prayerFeedGroupsTable.groupId))
      .where(eq(prayerFeedGroupsTable.feedId, feedId));
    return rows.map((r) => ({ id: r.id, name: r.name, slug: r.slug, emoji: r.emoji }));
  }

  for (const s of subs) {
    const today = todayInZone(s.feedTimezone);
    // bit 0=Sunday..bit 6=Saturday — match assembleIntercessions.
    const todayWeekdayBit = 1 << new Date(`${today}T12:00:00Z`).getUTCDay();

    const concrete = await db.select({
      id: prayerFeedEntriesTable.id,
      slot: prayerFeedEntriesTable.slot,
      title: prayerFeedEntriesTable.title,
      body: prayerFeedEntriesTable.body,
      learnMoreUrl: prayerFeedEntriesTable.learnMoreUrl,
    })
      .from(prayerFeedEntriesTable)
      .where(and(
        eq(prayerFeedEntriesTable.feedId, s.feedId),
        eq(prayerFeedEntriesTable.entryDate, today),
        eq(prayerFeedEntriesTable.state, "published"),
      ));

    const recurring = await db.select({
      id: prayerFeedRecurringEntriesTable.id,
      slot: prayerFeedRecurringEntriesTable.slot,
      title: prayerFeedRecurringEntriesTable.title,
      body: prayerFeedRecurringEntriesTable.body,
      learnMoreUrl: prayerFeedRecurringEntriesTable.learnMoreUrl,
    })
      .from(prayerFeedRecurringEntriesTable)
      .where(and(
        eq(prayerFeedRecurringEntriesTable.feedId, s.feedId),
        eq(prayerFeedRecurringEntriesTable.state, "live"),
        sql`(${prayerFeedRecurringEntriesTable.weekdaysMask} & ${todayWeekdayBit}) <> 0`,
      ));

    // Merge — concrete wins on conflicting (feed, slot) keys.
    const bySlot = new Map<number, { id: number; slot: number; title: string; body: string; learnMoreUrl: string | null; isRecurring: boolean }>();
    for (const r of recurring) {
      bySlot.set(r.slot, { ...r, isRecurring: true });
    }
    for (const r of concrete) {
      bySlot.set(r.slot, { ...r, isRecurring: false });
    }

    // "Have I prayed any of today's entries on this feed?" — used by
    // the personal feed card to grey out a feed once the user finishes
    // its intercessions for the day.
    const concreteIds = concrete.map((c) => c.id);
    let prayedConcreteIds = new Set<number>();
    if (concreteIds.length > 0) {
      const prayed = await db.select({ entryId: prayerFeedPrayersTable.entryId })
        .from(prayerFeedPrayersTable)
        .where(and(
          eq(prayerFeedPrayersTable.userId, user.id),
          inArray(prayerFeedPrayersTable.entryId, concreteIds),
        ));
      prayedConcreteIds = new Set(prayed.map((p) => p.entryId));
    }

    // Communities this feed is linked to via prayer_feed_groups. The
    // slideshow renders one pill per community in place of a single
    // feed-tag chip.
    const feedGroups = await loadGroupsForFeed(s.feedId);

    // Per-entry "who prayed this today" roster. Only meaningful for
    // concrete entries (recurring rows have no per-day identity until
    // a prayer is logged). Capped at 7 distinct users; ordered most
    // recent first. Same query backs the slide's avatar stack.
    const prayedByByEntry = new Map<number, Array<{ name: string; avatarUrl: string | null }>>();
    const prayedCountByEntry = new Map<number, number>();
    if (concreteIds.length > 0) {
      const todayLocal = todayInZone(s.feedTimezone);
      const rows = await db
        .select({
          entryId: prayerFeedPrayersTable.entryId,
          name: usersTable.name,
          avatarUrl: usersTable.avatarUrl,
        })
        .from(prayerFeedPrayersTable)
        .innerJoin(usersTable, eq(usersTable.id, prayerFeedPrayersTable.userId))
        .where(and(
          inArray(prayerFeedPrayersTable.entryId, concreteIds),
          eq(prayerFeedPrayersTable.dayLocal, todayLocal),
        ));
      for (const r of rows) {
        if (r.entryId == null) continue;
        const list = prayedByByEntry.get(r.entryId) ?? [];
        if (list.length < 7) list.push({ name: r.name ?? "", avatarUrl: r.avatarUrl ?? null });
        prayedByByEntry.set(r.entryId, list);
        prayedCountByEntry.set(r.entryId, (prayedCountByEntry.get(r.entryId) ?? 0) + 1);
      }
    }

    for (const m of [...bySlot.values()].sort((a, b) => a.slot - b.slot)) {
      out.push({
        id: m.id,
        feedId: s.feedId,
        feedSlug: s.feedSlug,
        feedTitle: s.feedTitle,
        feedCoverEmoji: s.feedCoverEmoji ?? null,
        slot: m.slot,
        title: m.title,
        body: m.body,
        learnMoreUrl: m.learnMoreUrl,
        isRecurring: m.isRecurring,
        prayedToday: !m.isRecurring && prayedConcreteIds.has(m.id),
        groups: feedGroups,
        prayedBy: m.isRecurring ? [] : (prayedByByEntry.get(m.id) ?? []),
        prayedTodayCount: m.isRecurring ? 0 : (prayedCountByEntry.get(m.id) ?? 0),
      });
    }
  }

  res.json({ entries: out });
});

// GET /api/groups/:slug/prayer-feeds — feeds bound to this group, each
// with today's intercessions. Same merge semantics as /today above
// (concrete wins on slot collisions). Mirrors the personal-side endpoint
// so the community detail page can render a feed card section.
router.get("/groups/:slug/prayer-feeds", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const groupSlug = String(req.params.slug);

  const [group] = await db.select().from(groupsTable).where(eq(groupsTable.slug, groupSlug));
  if (!group) { res.status(404).json({ error: "Group not found" }); return; }

  // Membership check — only members of this group see its feed list.
  const [membership] = await db.select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, group.id),
      eq(groupMembersTable.userId, user.id),
    ));
  if (!membership) { res.status(403).json({ error: "Not a member" }); return; }

  // Feeds bound to this group via prayer_feed_groups.
  const bound = await db
    .select({
      feedId: prayerFeedsTable.id,
      feedSlug: prayerFeedsTable.slug,
      feedTitle: prayerFeedsTable.title,
      feedCoverEmoji: prayerFeedsTable.coverEmoji,
      feedTimezone: prayerFeedsTable.timezone,
      feedSubscriberCount: prayerFeedsTable.subscriberCount,
    })
    .from(prayerFeedGroupsTable)
    .innerJoin(prayerFeedsTable, eq(prayerFeedsTable.id, prayerFeedGroupsTable.feedId))
    .where(and(
      eq(prayerFeedGroupsTable.groupId, group.id),
      eq(prayerFeedsTable.state, "live"),
    ));

  type FeedOut = {
    feedId: number;
    feedSlug: string;
    feedTitle: string;
    feedCoverEmoji: string | null;
    subscriberCount: number;
    todayEntries: Array<{ id: number; slot: number; title: string; isRecurring: boolean }>;
  };
  const feeds: FeedOut[] = [];

  for (const f of bound) {
    const today = todayInZone(f.feedTimezone);
    const todayWeekdayBit = 1 << new Date(`${today}T12:00:00Z`).getUTCDay();

    const concrete = await db.select({
      id: prayerFeedEntriesTable.id,
      slot: prayerFeedEntriesTable.slot,
      title: prayerFeedEntriesTable.title,
    })
      .from(prayerFeedEntriesTable)
      .where(and(
        eq(prayerFeedEntriesTable.feedId, f.feedId),
        eq(prayerFeedEntriesTable.entryDate, today),
        eq(prayerFeedEntriesTable.state, "published"),
      ));
    const recurring = await db.select({
      id: prayerFeedRecurringEntriesTable.id,
      slot: prayerFeedRecurringEntriesTable.slot,
      title: prayerFeedRecurringEntriesTable.title,
    })
      .from(prayerFeedRecurringEntriesTable)
      .where(and(
        eq(prayerFeedRecurringEntriesTable.feedId, f.feedId),
        eq(prayerFeedRecurringEntriesTable.state, "live"),
        sql`(${prayerFeedRecurringEntriesTable.weekdaysMask} & ${todayWeekdayBit}) <> 0`,
      ));

    const bySlot = new Map<number, { id: number; slot: number; title: string; isRecurring: boolean }>();
    for (const r of recurring) bySlot.set(r.slot, { ...r, isRecurring: true });
    for (const r of concrete) bySlot.set(r.slot, { ...r, isRecurring: false });

    feeds.push({
      feedId: f.feedId,
      feedSlug: f.feedSlug,
      feedTitle: f.feedTitle,
      feedCoverEmoji: f.feedCoverEmoji ?? null,
      subscriberCount: f.feedSubscriberCount ?? 0,
      todayEntries: [...bySlot.values()].sort((a, b) => a.slot - b.slot),
    });
  }

  res.json({ feeds });
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

// ── Recurring entries (daily / weekly templates) ─────────────────────
//
// GET    /:slug/recurring        — list all recurring templates
// POST   /:slug/recurring        — create one
// PUT    /:slug/recurring/:id    — update
// DELETE /:slug/recurring/:id    — remove
//
// Editor-only (canEditFeed). The render path in
// assembleIntercessions UNIONs these with concrete (date, slot)
// entries so today's deck includes both. Concrete entries take
// precedence on overlapping (date, slot) pairs.

const recurringSchema = z.object({
  // Slot is now optional — modern clients omit it and the server
  // auto-assigns the next available slot. Older clients (and the
  // per-cell editor that still passes the cell's slot) keep working.
  slot: z.number().int().min(1).max(7).optional(),
  recurrenceKind: z.enum(["daily", "weekly"]),
  weekdaysMask: z.number().int().min(0).max(127).default(127),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(2000).default(""),
  learnMoreUrl: z.string().trim().url().max(500).nullable().optional(),
  source: z.enum(["custom", "action"]).default("custom"),
  state: z.enum(["draft", "live"]).default("live"),
});

router.get("/prayer-feeds/:slug/recurring", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "Editor only." });
    return;
  }
  const rows = await db
    .select()
    .from(prayerFeedRecurringEntriesTable)
    .where(eq(prayerFeedRecurringEntriesTable.feedId, feed.id))
    .orderBy(asc(prayerFeedRecurringEntriesTable.slot), asc(prayerFeedRecurringEntriesTable.createdAt));
  res.json({ recurring: rows });
});

router.post("/prayer-feeds/:slug/recurring", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "Editor only." });
    return;
  }
  const parsed = recurringSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const data = parsed.data;
  // Daily kind always sets weekdaysMask to 127 so the read-side
  // mask check is a single conditional regardless of kind.
  const weekdaysMask = data.recurrenceKind === "daily" ? 127 : data.weekdaysMask;

  // Slot is server-managed. We ALWAYS pick the lowest free slot 1..7
  // and ignore any value the client sent — earlier the per-cell
  // editor passed the cell's slot, and if the cell happened to be
  // empty on the chosen date but the same slot held another feed's
  // recurring template, the upsert path silently overwrote that
  // template. Auto-picking here means a fresh POST never touches an
  // existing template; updates always go through PUT /:id.
  // (PUT handles edits-in-place; POST is strict create.)
  const taken = await db
    .select({ slot: prayerFeedRecurringEntriesTable.slot })
    .from(prayerFeedRecurringEntriesTable)
    .where(eq(prayerFeedRecurringEntriesTable.feedId, feed.id));
  const takenSet = new Set(taken.map((t) => t.slot));
  const slot = [1, 2, 3, 4, 5, 6, 7].find((s) => !takenSet.has(s));
  if (slot === undefined) {
    res.status(409).json({ error: "Feed already has 7 recurring templates." });
    return;
  }

  const [row] = await db.insert(prayerFeedRecurringEntriesTable).values({
    feedId: feed.id,
    slot,
    recurrenceKind: data.recurrenceKind,
    weekdaysMask,
    title: data.title,
    body: data.body,
    learnMoreUrl: data.learnMoreUrl ?? null,
    source: data.source,
    state: data.state,
    createdByUserId: user.id,
  }).returning();
  res.status(201).json({ recurring: row });
});

router.put("/prayer-feeds/:slug/recurring/:id", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "Editor only." });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = recurringSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.slot !== undefined) patch.slot = parsed.data.slot;
  if (parsed.data.recurrenceKind !== undefined) patch.recurrenceKind = parsed.data.recurrenceKind;
  if (parsed.data.weekdaysMask !== undefined) patch.weekdaysMask = parsed.data.weekdaysMask;
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.body !== undefined) patch.body = parsed.data.body;
  if (parsed.data.learnMoreUrl !== undefined) patch.learnMoreUrl = parsed.data.learnMoreUrl;
  if (parsed.data.source !== undefined) patch.source = parsed.data.source;
  if (parsed.data.state !== undefined) patch.state = parsed.data.state;
  // Re-normalize daily kind to mask 127 if the kind is being set.
  if (parsed.data.recurrenceKind === "daily") patch.weekdaysMask = 127;
  const [row] = await db
    .update(prayerFeedRecurringEntriesTable)
    .set(patch)
    .where(and(
      eq(prayerFeedRecurringEntriesTable.id, id),
      eq(prayerFeedRecurringEntriesTable.feedId, feed.id),
    ))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ recurring: row });
});

router.delete("/prayer-feeds/:slug/recurring/:id", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "Editor only." });
    return;
  }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(prayerFeedRecurringEntriesTable).where(and(
    eq(prayerFeedRecurringEntriesTable.id, id),
    eq(prayerFeedRecurringEntriesTable.feedId, feed.id),
  ));
  res.json({ ok: true });
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

  // Per-viewer prayed state — which of these entries the current user
  // has already prayed. One query against prayer_feed_prayers keyed on
  // entry id; the feed detail page uses it to surface a count of
  // prayers still waiting.
  const entryIds = entries.map((e) => e.id);
  const prayedRows = entryIds.length > 0
    ? await db
        .select({ entryId: prayerFeedPrayersTable.entryId })
        .from(prayerFeedPrayersTable)
        .where(and(
          inArray(prayerFeedPrayersTable.entryId, entryIds),
          eq(prayerFeedPrayersTable.userId, user.id),
        ))
    : [];
  const prayedSet = new Set(prayedRows.map((r) => r.entryId));

  res.json({
    entries: entries.map((e) => ({ ...e, prayedByMe: prayedSet.has(e.id) })),
  });
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
  const { entryDate, slot, title, body, scriptureRef, imageUrl, learnMoreUrl, source, state } = parsed.data;
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
    source,
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
      source,
      state,
      updatedAt: new Date(),
      publishedAt: sql`CASE WHEN ${prayerFeedEntriesTable.publishedAt} IS NULL AND ${state === "published"} THEN NOW() ELSE ${prayerFeedEntriesTable.publishedAt} END`,
    },
  }).returning();

  res.status(201).json({ entry: row });
});

// ─── Feed intercessions ─────────────────────────────────────────────────────
//
// A feed intercession is a shared_moments row scoped to the feed
// (prayer_feed_id set, group_id null) — the same primitive Phoebe
// Climate uses. Subscribers get moment_user_tokens via
// reconcileFeedPracticeMembers so the intercession surfaces on the
// dashboard + prayer-mode slideshow, and gets a /moments/:id detail
// page for free. This generalizes the climate-only admin endpoints to
// any feed the caller can edit.

// GET /api/prayer-feeds/:slug/intercessions — list this feed's
// intercessions. Editors see all; everyone else sees active ones.
router.get("/prayer-feeds/:slug/intercessions", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const isCreator = await canEditFeed(user.id, feed);
  if (!isCreator && feed.state === "draft") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const conditions = [eq(sharedMomentsTable.prayerFeedId, feed.id)];
  if (!isCreator) conditions.push(eq(sharedMomentsTable.state, "active"));
  const rows = await db
    .select({
      id: sharedMomentsTable.id,
      name: sharedMomentsTable.name,
      intention: sharedMomentsTable.intention,
      intercessionTopic: sharedMomentsTable.intercessionTopic,
      intercessionFullText: sharedMomentsTable.intercessionFullText,
      intercessionSource: sharedMomentsTable.intercessionSource,
      learnMoreUrl: sharedMomentsTable.learnMoreUrl,
      state: sharedMomentsTable.state,
      createdAt: sharedMomentsTable.createdAt,
    })
    .from(sharedMomentsTable)
    .where(and(...conditions))
    .orderBy(desc(sharedMomentsTable.createdAt));
  res.json({ intercessions: rows });
});

const feedIntercessionSchema = z.object({
  // "bcp" | "custom" | "action" — mirrors the moment-new chooser.
  // "action" carries a required learnMoreUrl; the slideshow renders a
  // "Take action →" pill for it.
  source: z.enum(["bcp", "custom", "action"]).default("custom"),
  title: z.string().trim().min(1).max(120),
  fullText: z.string().trim().min(1).max(4000),
  learnMoreUrl: z.string().trim().max(500).optional().nullable(),
});

// POST /api/prayer-feeds/:slug/intercessions — editor-only. Creates a
// feed-scoped intercession and reconciles subscribers so it lands on
// their dashboard + slideshow immediately.
router.post("/prayer-feeds/:slug/intercessions", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "You don't have permission to publish to this feed." });
    return;
  }
  const parsed = feedIntercessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { source, title, fullText, learnMoreUrl } = parsed.data;
  // Action intercessions require a usable URL; reject early so an admin
  // doesn't ship an "action" with a dead "Take action" pill.
  const normalizedUrl = normalizeLearnMoreUrl(learnMoreUrl);
  if (source === "action" && !normalizedUrl) {
    res.status(400).json({ error: "An action intercession needs a valid link." });
    return;
  }

  const [u] = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, user.id));

  const [moment] = await db
    .insert(sharedMomentsTable)
    .values({
      prayerFeedId: feed.id,
      groupId: null,
      name: title,
      intention: title,
      intercessionTopic: title,
      intercessionFullText: fullText,
      intercessionSource: source,
      templateType: "intercession",
      loggingType: "photo",
      frequency: "daily",
      scheduledTime: "09:30",
      timezone: feed.timezone ?? "America/New_York",
      windowMinutes: 60,
      goalDays: 30,
      state: "active",
      momentToken: generateToken(),
      learnMoreUrl: normalizedUrl,
    })
    .returning();

  // Mint the creator's token first so they're the organizer
  // (smallest-id token), then reconcile to add every subscriber.
  await db.insert(momentUserTokensTable).values({
    momentId: moment.id,
    email: (u?.email ?? "").toLowerCase(),
    name: u?.name ?? "",
    userToken: generateToken(),
  });

  const { reconcileFeedPracticeMembers } = await import("./groups");
  await reconcileFeedPracticeMembers(moment.id);

  res.status(201).json({ intercession: moment });
});

// GET /api/prayer-feeds/:slug/group-intercession-options — community
// intercessions the editor could add to this feed. These are
// group-scoped shared_moments (created in a community, not yet on any
// feed) from communities the caller administers.
router.get("/prayer-feeds/:slug/group-intercession-options", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "Editor only." });
    return;
  }
  const adminGroups = await db
    .select({ groupId: groupMembersTable.groupId })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.userId, user.id),
      sql`${groupMembersTable.role} IN ('admin', 'hidden_admin')`,
    ));
  const groupIds = [...new Set(adminGroups.map((g) => g.groupId))];
  if (groupIds.length === 0) { res.json({ intercessions: [] }); return; }
  const rows = await db
    .select({
      id: sharedMomentsTable.id,
      name: sharedMomentsTable.name,
      intention: sharedMomentsTable.intention,
      intercessionFullText: sharedMomentsTable.intercessionFullText,
      intercessionSource: sharedMomentsTable.intercessionSource,
      groupId: sharedMomentsTable.groupId,
      groupName: groupsTable.name,
      groupEmoji: groupsTable.emoji,
    })
    .from(sharedMomentsTable)
    .innerJoin(groupsTable, eq(groupsTable.id, sharedMomentsTable.groupId))
    .where(and(
      inArray(sharedMomentsTable.groupId, groupIds),
      eq(sharedMomentsTable.templateType, "intercession"),
      eq(sharedMomentsTable.state, "active"),
      sql`${sharedMomentsTable.prayerFeedId} IS NULL`,
    ))
    .orderBy(desc(sharedMomentsTable.createdAt));
  res.json({ intercessions: rows });
});

// POST /api/prayer-feeds/:slug/intercessions/attach — editor-only.
// Adds an existing community (group-scoped) intercession to this feed
// by setting its prayer_feed_id. The intercession keeps its group, so
// it stays visible to that community AND the feed's subscribers.
const attachIntercessionSchema = z.object({ momentId: z.number().int().positive() });
router.post("/prayer-feeds/:slug/intercessions/attach", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "Editor only." });
    return;
  }
  const parsed = attachIntercessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [moment] = await db
    .select({
      id: sharedMomentsTable.id,
      groupId: sharedMomentsTable.groupId,
      prayerFeedId: sharedMomentsTable.prayerFeedId,
      templateType: sharedMomentsTable.templateType,
    })
    .from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.id, parsed.data.momentId))
    .limit(1);
  if (!moment || moment.templateType !== "intercession" || moment.groupId == null) {
    res.status(404).json({ error: "Not a community intercession." });
    return;
  }
  if (moment.prayerFeedId != null) {
    res.status(409).json({ error: "That intercession is already on a feed." });
    return;
  }
  // The caller must administer the intercession's community.
  const [adminRow] = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, moment.groupId),
      eq(groupMembersTable.userId, user.id),
      sql`${groupMembersTable.role} IN ('admin', 'hidden_admin')`,
    ))
    .limit(1);
  if (!adminRow) {
    res.status(403).json({ error: "You don't administer that community." });
    return;
  }
  await db
    .update(sharedMomentsTable)
    .set({ prayerFeedId: feed.id })
    .where(eq(sharedMomentsTable.id, moment.id));
  const { reconcileFeedPracticeMembers } = await import("./groups");
  await reconcileFeedPracticeMembers(moment.id);
  res.json({ ok: true });
});

// DELETE /api/prayer-feeds/:slug/entries/:date — editor-only.
// Optional ?slot=1..7 narrows the delete to a single slot. Without
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
  const slot = slotRaw && Number.isInteger(slotRaw) && slotRaw >= 1 && slotRaw <= 7 ? slotRaw : null;
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
// Slot is taken from `?slot=` (1..7) or body.slot, defaulting to 1
// for back-compat with single-slot callers. Each slot has its own
// `prayCount` and roster, so a feed with multiple slides per day
// records independent prayer streams.
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
  const slot = Number.isInteger(slotNum) && slotNum >= 1 && slotNum <= 7 ? slotNum : 1;
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
// Slot is read from `?slot=` (1..7), defaulting to 1. Each slot has
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
  const slot = Number.isInteger(slotRaw) && slotRaw >= 1 && slotRaw <= 7 ? slotRaw : 1;

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
