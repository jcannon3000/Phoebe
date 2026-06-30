import { Router, type IRouter, type RequestHandler } from "express";
import { and, asc, desc, eq, gte, lte, sql, or, isNull, isNotNull } from "drizzle-orm";
import {
  db,
  prayerFeedsTable,
  prayerFeedEntriesTable,
  prayerFeedSubscriptionsTable,
  prayerFeedPrayersTable,
  prayerFeedGroupsTable,
  prayerFeedRecurringEntriesTable,
  prayerFeedEventsTable,
  usersTable,
  betaUsersTable,
  groupsTable,
  groupMembersTable,
  sharedMomentsTable,
  momentUserTokensTable,
  momentPostsTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "crypto";
import { todayInZone } from "../lib/tz";
import { ensureDailyMomentsForFeeds } from "../lib/feedDailyPromotion";

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

// Lighter gate than requireBeta — used by the public-feed surfaces
// (discovery, detail, intercession list, subscribe) which any signed-in
// account may reach, including the limited offices-only tier. The
// handlers themselves enforce the public/private visibility rule.
const requireAuth: RequestHandler = (req, res, next) => {
  if (!getUser(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
};

// Is this user a beta member? Beta users see every live feed in
// discovery and may reach private feeds; non-beta accounts are limited
// to feeds the creator marked visibility = "public".
async function isBetaUser(userId: number): Promise<boolean> {
  const [u] = await db.select({ email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return false;
  const [beta] = await db.select({ email: betaUsersTable.email })
    .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
  return !!beta;
}

// Can this user view a feed's detail + intercession list? Creators
// always can. Draft feeds are hidden from everyone else. A live
// public feed is open to any signed-in user; a live private feed is
// reachable only by beta members and existing subscribers.
async function canViewFeed(
  userId: number,
  feed: { id: number; state: string; visibility: string },
  isCreator: boolean,
): Promise<boolean> {
  if (isCreator) return true;
  // A non-live feed is creator-only: `draft` (pre-launch) and `paused`
  // (the creator's "off" switch) both 404 for everyone else, so an off
  // feed can't be opened by direct link or its intercessions prayed —
  // matching the full-off rule that also hides it from discovery,
  // groups, and existing subscribers' feeds.
  if (feed.state !== "live") return false;
  if (feed.visibility === "public") return true;
  if (await isBetaUser(userId)) return true;
  const [sub] = await db
    .select({ id: prayerFeedSubscriptionsTable.id })
    .from(prayerFeedSubscriptionsTable)
    .where(and(
      eq(prayerFeedSubscriptionsTable.feedId, feed.id),
      eq(prayerFeedSubscriptionsTable.userId, userId),
    ));
  return !!sub;
}

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

// todayInZone (today's YYYY-MM-DD in the feed's timezone, UTC fallback) lives
// in ../lib/tz.

async function getFeedBySlug(slug: string) {
  const [feed] = await db.select().from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.slug, slug));
  return feed ?? null;
}

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ─── Flat-list feed intercessions ────────────────────────────────────────────
// Prayer feeds no longer schedule entries by day. A feed's intercessions
// now live as shared_moments rows (template_type = intercession,
// prayer_feed_id set). This loads them for a set of feeds, newest first,
// annotated with the viewer's prayed-today state and a distinct
// "people praying" count — the data the dashboard / prayer-list /
// community summary cards used to read from the retired
// prayer_feed_entries day grid.
type FeedIntercession = {
  id: number;
  feedId: number;
  title: string;
  body: string | null;
  learnMoreUrl: string | null;
  momentToken: string | null;
  createdAt: Date;
  prayedToday: boolean;
  prayCount: number;
  // True when the viewer has logged a check-in on this intercession
  // at least once on ANY date. Drives the "X new prayers" count on
  // the dashboard FeedPrayerCard — counted as `everPrayed === false`.
  everPrayed: boolean;
  // Most recent time THIS viewer prayed it (epoch ms), or null if never.
  // Drives the per-user rotation: least-recently-prayed surface first.
  lastPrayedAt: number | null;
};

async function loadFeedIntercessions(
  feedIds: number[],
  viewerEmail: string,
): Promise<Map<number, FeedIntercession[]>> {
  const byFeed = new Map<number, FeedIntercession[]>();
  if (feedIds.length === 0) return byFeed;

  // Mirror today's date-programmed entry (if any) into each feed's live
  // intercession, so a feed an editor programs by day surfaces "what they have
  // that day" through this same moments path. No-op for feeds without entries.
  await ensureDailyMomentsForFeeds(feedIds);

  const moments = await db
    .select({
      id: sharedMomentsTable.id,
      feedId: sharedMomentsTable.prayerFeedId,
      topic: sharedMomentsTable.intercessionTopic,
      name: sharedMomentsTable.name,
      body: sharedMomentsTable.intercessionFullText,
      learnMoreUrl: sharedMomentsTable.learnMoreUrl,
      momentToken: sharedMomentsTable.momentToken,
      createdAt: sharedMomentsTable.createdAt,
      timezone: sharedMomentsTable.timezone,
    })
    .from(sharedMomentsTable)
    .where(and(
      inArray(sharedMomentsTable.prayerFeedId, feedIds),
      eq(sharedMomentsTable.templateType, "intercession"),
      sql`${sharedMomentsTable.state} <> 'archived'`,
    ))
    .orderBy(desc(sharedMomentsTable.createdAt));
  if (moments.length === 0) return byFeed;

  // Check-ins on these intercessions, joined to the token roster so we
  // can both tell whether THIS viewer prayed today and count distinct
  // people praying. A feed intercession is prayed through the ordinary
  // shared-moment check-in path, so moment_posts is the source of truth.
  const momentIds = moments.map((m) => m.id);
  const checkins = await db
    .select({
      momentId: momentPostsTable.momentId,
      windowDate: momentPostsTable.windowDate,
      createdAt: momentPostsTable.createdAt,
      email: momentUserTokensTable.email,
    })
    .from(momentPostsTable)
    .innerJoin(
      momentUserTokensTable,
      eq(momentUserTokensTable.userToken, momentPostsTable.userToken),
    )
    .where(and(
      inArray(momentPostsTable.momentId, momentIds),
      eq(momentPostsTable.isCheckin, 1),
    ));

  const myWindowDates = new Map<number, Set<string>>();
  // Most recent check-in time (epoch ms) by the viewer, per intercession.
  const myLastPrayedAt = new Map<number, number>();
  const prayerEmails = new Map<number, Set<string>>();
  for (const c of checkins) {
    const lc = c.email.toLowerCase();
    const pe = prayerEmails.get(c.momentId) ?? new Set<string>();
    pe.add(lc);
    prayerEmails.set(c.momentId, pe);
    if (lc === viewerEmail) {
      const wd = myWindowDates.get(c.momentId) ?? new Set<string>();
      wd.add(c.windowDate);
      myWindowDates.set(c.momentId, wd);
      const t = c.createdAt ? c.createdAt.getTime() : 0;
      if (t > (myLastPrayedAt.get(c.momentId) ?? 0)) myLastPrayedAt.set(c.momentId, t);
    }
  }

  for (const m of moments) {
    if (m.feedId == null) continue;
    const today = todayInZone(m.timezone || "UTC");
    const list = byFeed.get(m.feedId) ?? [];
    list.push({
      id: m.id,
      feedId: m.feedId,
      title: m.topic || m.name || "Intercession",
      body: m.body,
      learnMoreUrl: m.learnMoreUrl,
      momentToken: m.momentToken,
      createdAt: m.createdAt,
      prayedToday: myWindowDates.get(m.id)?.has(today) ?? false,
      prayCount: prayerEmails.get(m.id)?.size ?? 0,
      everPrayed: (myWindowDates.get(m.id)?.size ?? 0) > 0,
      lastPrayedAt: myLastPrayedAt.get(m.id) ?? null,
    });
    byFeed.set(m.feedId, list);
  }
  return byFeed;
}

// Resolve the caller's account email (lowercased) for token matching.
async function viewerEmailFor(userId: number): Promise<string> {
  const [me] = await db.select({ email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId));
  return (me?.email ?? "").toLowerCase();
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
  visibility: z.enum(["public", "private"]).optional(),
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
router.get("/prayer-feeds", requireAuth, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  // Beta members see every live feed in discovery; everyone else
  // (including the offices-only tier) sees only public feeds.
  const beta = await isBetaUser(user.id);
  const rows = await db.select().from(prayerFeedsTable)
    .where(beta
      ? eq(prayerFeedsTable.state, "live")
      : and(eq(prayerFeedsTable.state, "live"), eq(prayerFeedsTable.visibility, "public")))
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
    })
    .from(prayerFeedSubscriptionsTable)
    .innerJoin(prayerFeedsTable, eq(prayerFeedsTable.id, prayerFeedSubscriptionsTable.feedId))
    .where(and(
      eq(prayerFeedSubscriptionsTable.userId, user.id),
      // A feed turned "off" (state = paused) drops out of existing
      // subscribers' daily surface too, not just discovery. The
      // subscription row stays, so turning it back to live restores it.
      eq(prayerFeedsTable.state, "live"),
    ));

  if (subs.length === 0) { res.json({ entries: [] }); return; }

  // One row per intercession on every subscribed feed, grouped
  // feed-first (the UI renders one card per feed with N intercessions
  // inside). Feeds carry a rolling list of ongoing intercessions; the
  // "today" surface is a daily rotating window of FEED_DAILY_LIMIT
  // entries that cycles deck-style across the full active list.
  const byFeed = await loadFeedIntercessions(
    subs.map((s) => s.feedId),
    await viewerEmailFor(user.id),
  );
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
    momentToken: string | null;
    isRecurring: boolean;
    prayedToday: boolean;
  };
  const entries: Row[] = [];
  for (const s of subs) {
    userTodaySlice(byFeed.get(s.feedId) ?? []).forEach((m, i) => {
      entries.push({
        id: m.id,
        feedId: s.feedId,
        feedSlug: s.feedSlug,
        feedTitle: s.feedTitle,
        feedCoverEmoji: s.feedCoverEmoji ?? null,
        slot: i,
        title: m.title,
        body: m.body ?? "",
        learnMoreUrl: m.learnMoreUrl,
        momentToken: m.momentToken,
        isRecurring: false,
        prayedToday: m.prayedToday,
      });
    });
  }

  res.json({ entries });
});

// A feed's daily-surface cap. Subscribers pray through a rotating set
// of FEED_DAILY_LIMIT intercessions per day; the full active list
// remains walkable via the feed-detail page and the slideshow's
// "Pray the full list" tap. The /api/prayer-feeds/:slug/intercessions
// endpoint that powers those isn't capped — only the daily summary
// surfaces (the prayer-list FeedCard count + community detail) use
// this window.
const FEED_DAILY_LIMIT = 3;

// Per-user rotation. Each subscriber walks the feed at their OWN pace:
// the intercessions they've prayed LEAST recently surface first, so the
// last few they prayed sink to the back and they always meet fresh
// ground. Never-prayed cards lead (newest first), so a freshly-added
// intercession tops the deck until it's prayed, then enters the
// rotation. (This replaces the old global day-keyed deck where every
// subscriber saw the same three on a given calendar day; the cursor is
// now each viewer's own prayer history, not the calendar.)
//
// Ordering, in priority:
//   1. Never prayed by this viewer → newest createdAt first.
//   2. Prayed → least-recently-prayed first (oldest lastPrayedAt).
// So the three a viewer most recently prayed are always at the back.
function rotateForUser<T extends { createdAt: Date; lastPrayedAt: number | null }>(all: T[]): T[] {
  return [...all].sort((a, b) => {
    if (a.lastPrayedAt === null && b.lastPrayedAt === null) {
      return b.createdAt.getTime() - a.createdAt.getTime(); // never-prayed: newest first
    }
    if (a.lastPrayedAt === null) return -1; // never-prayed before prayed
    if (b.lastPrayedAt === null) return 1;
    if (a.lastPrayedAt !== b.lastPrayedAt) return a.lastPrayedAt - b.lastPrayedAt; // least-recent first
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

// Today's slice for a viewer — the FEED_DAILY_LIMIT they're "due" next,
// in rotation order. Feeds at or under the cap return everything (still
// in rotation order so even a short feed walks fresh ground first).
function userTodaySlice<T extends { createdAt: Date; lastPrayedAt: number | null }>(all: T[]): T[] {
  const ordered = rotateForUser(all);
  return ordered.length <= FEED_DAILY_LIMIT ? ordered : ordered.slice(0, FEED_DAILY_LIMIT);
}

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

  // todayEntries uses the same per-user rotation as the personal
  // /prayer-feeds/today surface — each viewer sees the three they've
  // prayed least recently, so the cards advance as they pray rather
  // than on a shared calendar cursor.
  const byFeed = await loadFeedIntercessions(
    bound.map((f) => f.feedId),
    await viewerEmailFor(user.id),
  );
  const feeds: FeedOut[] = bound.map((f) => ({
    feedId: f.feedId,
    feedSlug: f.feedSlug,
    feedTitle: f.feedTitle,
    feedCoverEmoji: f.feedCoverEmoji ?? null,
    subscriberCount: f.feedSubscriberCount ?? 0,
    todayEntries: userTodaySlice(byFeed.get(f.feedId) ?? []).map((m, i) => ({
      id: m.id,
      slot: i,
      title: m.title,
      isRecurring: false,
    })),
  }));

  res.json({ feeds });
});

// GET /api/prayer-feeds/mine — live + "off" feeds the caller created.
// Includes `paused` (the creator-facing "Off" switch) so a feed the
// creator turned off still shows in "Manage Prayer Feeds" and can be
// flipped back on — without it the feed would vanish from the only
// surface that can reactivate it. `draft` stays excluded so abandoned
// drafts don't inflate the count (the original symptom was "says 2
// feeds but there's really 1" — the 2nd was a non-live draft). The
// admin App-Metrics feed-audit still lists every feed regardless of
// state for cleanup purposes.
router.get("/prayer-feeds/mine", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  // "Mine" = feeds the caller can manage, matching canEditFeed:
  //   • feeds they created, plus
  //   • platform-owned feeds (creator_user_id NULL, e.g. phoebe-climate)
  //     when the caller is a beta admin.
  // Without the admin branch, a beta admin who can edit phoebe-climate
  // saw no "Manage Prayer Feeds" entry because the platform feed has a
  // null creator and so never matched creatorUserId = them. (The
  // phoebe-climate seed nulls the creator on every boot, which is what
  // made the entry disappear for whoever originally created it.)
  const [betaAdmin] = await db.select({ isAdmin: betaUsersTable.isAdmin })
    .from(betaUsersTable)
    .where(eq(betaUsersTable.email, (user.email ?? "").toLowerCase()));
  const isAdmin = !!betaAdmin?.isAdmin;

  const rows = await db.select().from(prayerFeedsTable)
    .where(and(
      isAdmin
        ? or(
            eq(prayerFeedsTable.creatorUserId, user.id),
            isNull(prayerFeedsTable.creatorUserId),
          )
        : eq(prayerFeedsTable.creatorUserId, user.id),
      inArray(prayerFeedsTable.state, ["live", "paused"]),
    ))
    .orderBy(desc(prayerFeedsTable.createdAt));
  res.json({ feeds: rows });
});

// GET /api/prayer-feeds/subscribed — feeds the caller subscribes to,
// each with a preview of its newest intercession. Used by the
// dashboard + prayer-list feed cards.
// Any signed-in account may read its own subscriptions — including the
// offices-only tier, whose parish dashboard surfaces a "Your feed" card
// for each subscribed public feed. The endpoint is per-caller (filters
// to userId), so opening it up doesn't leak anyone else's data.
router.get("/prayer-feeds/subscribed", requireAuth, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  // The home feed list = feeds the user personally subscribes to UNION feeds
  // bound to any community they've joined — so a member who joined AFTER a feed
  // was attached (and so was never caught by the bind-time auto-subscribe) still
  // sees it on home, not only those auto-subscribed at attach time.
  const [subRows, groupFeedRows] = await Promise.all([
    db.select({ feedId: prayerFeedSubscriptionsTable.feedId })
      .from(prayerFeedSubscriptionsTable)
      .where(eq(prayerFeedSubscriptionsTable.userId, user.id)),
    db.select({ feedId: prayerFeedGroupsTable.feedId })
      .from(prayerFeedGroupsTable)
      .innerJoin(groupMembersTable, and(
        eq(groupMembersTable.groupId, prayerFeedGroupsTable.groupId),
        eq(groupMembersTable.userId, user.id),
        isNotNull(groupMembersTable.joinedAt),
      )),
  ]);
  const feedIds = Array.from(new Set([
    ...subRows.map((r) => r.feedId),
    ...groupFeedRows.map((r) => r.feedId),
  ]));
  // Feeds turned "off" (paused) leave the dashboard card list; only live feeds surface here.
  const subs = feedIds.length === 0 ? [] : await db
    .select({ feed: prayerFeedsTable })
    .from(prayerFeedsTable)
    .where(and(inArray(prayerFeedsTable.id, feedIds), eq(prayerFeedsTable.state, "live")));

  const viewerEmail = await viewerEmailFor(user.id);
  const byFeed = await loadFeedIntercessions(
    subs.map((s) => s.feed.id),
    viewerEmail,
  );

  // For each feed, look up the people who've prayed ANY of its
  // intercessions in the last 7 days — drives the avatar stack on the
  // dashboard's per-feed card. We join check-ins → moment_user_tokens
  // for the email, then → users for name + avatar. Filtered to the
  // viewer's subscribed feeds so we never expose other communities'
  // rosters.
  type WeekPrayer = { id: number; name: string; avatarUrl: string | null };
  const weekPrayersByFeed = new Map<number, WeekPrayer[]>();
  // Accurate distinct-pray-er count per feed, uncapped — the avatar
  // array below is truncated to MAX_PER_FEED for payload size, which is
  // fine for a 5-avatar rail but understates the count on a popular
  // feed (climate has hundreds praying weekly). The feed-first hero
  // card surfaces this number as "N prayed this week", so it has to be
  // honest, not the avatar-array length. Tracked via a per-feed Set of
  // distinct user ids built from the same rows — no extra query.
  const weekPrayerIdsByFeed = new Map<number, Set<number>>();
  const feedIdsForRoster = subs.map((s) => s.feed.id);
  if (feedIdsForRoster.length > 0) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        feedId: sharedMomentsTable.prayerFeedId,
        userId: usersTable.id,
        name: usersTable.name,
        avatarUrl: usersTable.avatarUrl,
        email: usersTable.email,
      })
      .from(momentPostsTable)
      .innerJoin(sharedMomentsTable, eq(sharedMomentsTable.id, momentPostsTable.momentId))
      .innerJoin(momentUserTokensTable, eq(momentUserTokensTable.userToken, momentPostsTable.userToken))
      .innerJoin(usersTable, sql`LOWER(${usersTable.email}) = LOWER(${momentUserTokensTable.email})`)
      .where(and(
        inArray(sharedMomentsTable.prayerFeedId, feedIdsForRoster),
        eq(momentPostsTable.isCheckin, 1),
        gte(momentPostsTable.createdAt, since),
      ));
    const viewerLc = (viewerEmail ?? "").toLowerCase();
    // Cap per-feed entries. The dashboard renders 5 avatars; anything
    // beyond ~12 is wasted bytes on a popular feed (climate has
    // hundreds of subscribers who all pray weekly). Keep enough
    // headroom that the count remains an accurate "9+" indicator
    // even if a surface later wants to show more avatars.
    const MAX_PER_FEED = 12;
    for (const r of rows) {
      if (r.feedId == null) continue;
      // Drop the viewer themselves — the avatar stack is "OTHER people
      // praying with you," same convention PrayerOfficeCard uses.
      if (r.email.toLowerCase() === viewerLc) continue;
      // Uncapped distinct count for the hero's "N prayed this week".
      const idSet = weekPrayerIdsByFeed.get(r.feedId) ?? new Set<number>();
      idSet.add(r.userId);
      weekPrayerIdsByFeed.set(r.feedId, idSet);
      const list = weekPrayersByFeed.get(r.feedId) ?? [];
      if (list.length >= MAX_PER_FEED) continue;
      if (!list.find((p) => p.id === r.userId)) {
        list.push({ id: r.userId, name: r.name, avatarUrl: r.avatarUrl });
        weekPrayersByFeed.set(r.feedId, list);
      }
    }
  }

  // Upcoming published events per subscribed feed, batched in one
  // query and capped to the soonest 3 per feed so the dashboard can
  // render them without an extra round trip.
  const eventsByFeed = new Map<number, Array<{
    id: number; title: string; startsAt: string; endsAt: string | null;
    location: string | null; joinUrl: string | null;
  }>>();
  if (feedIdsForRoster.length > 0) {
    const eventRows = await db
      .select({
        id: prayerFeedEventsTable.id,
        feedId: prayerFeedEventsTable.feedId,
        title: prayerFeedEventsTable.title,
        startsAt: prayerFeedEventsTable.startsAt,
        endsAt: prayerFeedEventsTable.endsAt,
        location: prayerFeedEventsTable.location,
        joinUrl: prayerFeedEventsTable.joinUrl,
      })
      .from(prayerFeedEventsTable)
      .where(and(
        inArray(prayerFeedEventsTable.feedId, feedIdsForRoster),
        eq(prayerFeedEventsTable.state, "published"),
        sql`COALESCE(${prayerFeedEventsTable.endsAt}, ${prayerFeedEventsTable.startsAt}) >= NOW()`,
      ))
      .orderBy(asc(prayerFeedEventsTable.startsAt));
    const PER_FEED = 3;
    for (const e of eventRows) {
      const list = eventsByFeed.get(e.feedId) ?? [];
      if (list.length >= PER_FEED) continue;
      list.push({
        id: e.id,
        title: e.title,
        startsAt: e.startsAt.toISOString(),
        endsAt: e.endsAt ? e.endsAt.toISOString() : null,
        location: e.location,
        joinUrl: e.joinUrl,
      });
      eventsByFeed.set(e.feedId, list);
    }
  }

  // Feeds are a flat ongoing list now — there is no per-day entry, so
  // the dashboard card previews the intercession the VIEWER is "due"
  // next per their personal rotation (least-recently-prayed first,
  // never-prayed cards leading). Previously we just took `list[0]`,
  // which was newest-by-createdAt — meaning the card stuck on the
  // same intercession after the user prayed it until a newer one
  // landed on the feed. The slideshow path always rotated; this is
  // the parity fix so the dashboard preview matches.
  const out = subs.map(({ feed }) => {
    const list = byFeed.get(feed.id) ?? [];
    const rotated = rotateForUser(list);
    const upNext = rotated[0] ?? null;
    // Intercessions the viewer has NEVER prayed (no check-in row on
    // any date). Drives the "X New Prayers" pulse on FeedPrayerCard.
    const unprayedCount = list.reduce((n, it) => n + (it.everPrayed ? 0 : 1), 0);
    return {
      feed,
      todayEntry: upNext
        ? {
            id: upNext.id,
            entryDate: todayInZone(feed.timezone),
            title: upNext.title,
            body: upNext.body,
            scriptureRef: null as string | null,
            prayCount: upNext.prayCount,
          }
        : null,
      prayedToday: upNext?.prayedToday ?? false,
      weekPrayers: weekPrayersByFeed.get(feed.id) ?? [],
      weekPrayerCount: weekPrayerIdsByFeed.get(feed.id)?.size ?? 0,
      unprayedCount,
      upcomingEvents: eventsByFeed.get(feed.id) ?? [],
    };
  });
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
  // Permission: the caller must be an ADMIN of the TARGET group — they are
  // the ones whose members are about to be auto-subscribed. Being the
  // feed's creator does NOT authorize this: otherwise any beta user could
  // mint a throwaway feed (becoming its creator) and force-subscribe ANY
  // community to it by its public slug, then push-spam the whole roster.
  // Feed-creator-ship governs the feed side, not the conscription of an
  // arbitrary community's members.
  const [membership] = await db
    .select({ role: groupMembersTable.role })
    .from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, group.id),
      eq(groupMembersTable.userId, byUserId),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
    ));
  const isGroupAdmin = membership?.role === "admin" || membership?.role === "hidden_admin";
  if (!isGroupAdmin) throw new Error("forbidden");

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
router.get("/prayer-feeds/:slug", async (req, res): Promise<void> => {
  // Anonymous callers are allowed when the feed is live + public —
  // backs the /feed/:slug shareable landing page. Private and draft
  // feeds still 404 for anon.
  const user = getUser(req);
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }

  if (!user) {
    if (feed.state !== "live" || feed.visibility !== "public") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({
      feed,
      isCreator: false,
      isSubscribed: false,
      mutedUntil: null,
    });
    return;
  }

  const isCreator = await canEditFeed(user.id, feed);
  // Draft feeds are hidden from non-editors; private feeds are hidden
  // from everyone but beta members and existing subscribers.
  if (!(await canViewFeed(user.id, feed, isCreator))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [sub] = await db.select().from(prayerFeedSubscriptionsTable)
    .where(and(
      eq(prayerFeedSubscriptionsTable.feedId, feed.id),
      eq(prayerFeedSubscriptionsTable.userId, user.id),
    ));

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
  res.json({ ok: true });
});

// GET /api/prayer-feeds/:slug/entries — list entries in a date range.
// Editors see every state; non-editors see only published.
router.get("/prayer-feeds/:slug/entries", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const isCreator = await canEditFeed(user.id, feed);
  if (!isCreator && feed.state !== "live") {
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
router.get("/prayer-feeds/:slug/intercessions", async (req, res): Promise<void> => {
  // Anonymous callers may read the active intercessions of a live
  // public feed — backs the /feed/:slug shareable page's intercession
  // list. Drafts + private feeds still 404 for anon.
  const user = getUser(req);
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }

  let isCreator = false;
  if (user) {
    isCreator = await canEditFeed(user.id, feed);
    if (!(await canViewFeed(user.id, feed, isCreator))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
  } else {
    if (feed.state !== "live" || feed.visibility !== "public") {
      res.status(404).json({ error: "Not found" });
      return;
    }
  }
  // Surface today's date-programmed entry (if any) as this feed's live
  // intercession before listing — keeps the slideshow + detail in step with
  // "what they have that day."
  await ensureDailyMomentsForFeeds([feed.id]);
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
      learnMoreTitle: sharedMomentsTable.learnMoreTitle,
      state: sharedMomentsTable.state,
      createdAt: sharedMomentsTable.createdAt,
      // Needed by the feed slideshow so each Continue can POST an amen
      // via /api/moment/:momentToken/amen — that's what makes the
      // dashboard's "Prayer completed ✓" pill flip after a walk.
      momentToken: sharedMomentsTable.momentToken,
    })
    .from(sharedMomentsTable)
    .where(and(...conditions))
    .orderBy(desc(sharedMomentsTable.createdAt));

  // Compute weekPrayCount per intercession in a single grouped query
  // so the slideshow can show "N people have prayed this this week."
  // Count distinct userToken values from moment_posts in the rolling
  // 7-day window — matches the same heuristic prayer-mode uses
  // (line ~2155 in prayer-mode.tsx, `prayedThisWeek`).
  //
  // isCheckin = 1 is required so this count matches the weekPrayers
  // avatar list in /prayer-feeds/subscribed (which already filters
  // check-ins). Without this filter, reflection posts would inflate
  // the slide's count over the dashboard's avatar count for the same
  // window, and the user would see two different numbers for the
  // same fact.
  let countById = new Map<number, number>();
  if (rows.length > 0) {
    // Count people who prayed TODAY's intercession, scoped to today's window
    // date (in the feed's timezone). A feed's intercession lives on an evergreen
    // moment whose content is swapped daily (feedDailyPromotion), so a rolling
    // 7-day count would lump together people who prayed DIFFERENT days'
    // intercessions ("prayed the feed") rather than today's specific one.
    const today = todayInZone(feed.timezone || "UTC");
    const grouped = await db
      .select({
        momentId: momentPostsTable.momentId,
        n: sql<number>`count(distinct ${momentPostsTable.userToken})::int`,
      })
      .from(momentPostsTable)
      .where(and(
        inArray(momentPostsTable.momentId, rows.map((r) => r.id)),
        eq(momentPostsTable.isCheckin, 1),
        eq(momentPostsTable.windowDate, today),
      ))
      .groupBy(momentPostsTable.momentId);
    countById = new Map(grouped.map((g) => [g.momentId, Number(g.n) || 0]));
  }
  // Per-user last-prayed time per intercession (epoch ms) — drives the
  // viewer's personal rotation below. Anon viewers have none, so they
  // fall back to the stable newest-first order.
  const lastPrayedById = new Map<number, number>();
  if (user && rows.length > 0) {
    const viewerEmail = (await viewerEmailFor(user.id)).toLowerCase();
    const mine = await db
      .select({
        momentId: momentPostsTable.momentId,
        lastAt: sql<string>`max(${momentPostsTable.createdAt})`,
      })
      .from(momentPostsTable)
      .innerJoin(momentUserTokensTable, eq(momentUserTokensTable.userToken, momentPostsTable.userToken))
      .where(and(
        inArray(momentPostsTable.momentId, rows.map((r) => r.id)),
        eq(momentPostsTable.isCheckin, 1),
        sql`lower(${momentUserTokensTable.email}) = ${viewerEmail}`,
      ))
      .groupBy(momentPostsTable.momentId);
    for (const m of mine) {
      const t = m.lastAt ? new Date(m.lastAt).getTime() : 0;
      if (Number.isFinite(t) && t > 0) lastPrayedById.set(m.momentId, t);
    }
  }
  const intercessions = rows.map((r) => ({
    ...r,
    weekPrayCount: countById.get(r.id) ?? 0,
    lastPrayedAt: lastPrayedById.get(r.id) ?? null,
  }));

  // Order by the viewer's personal rotation: the intercessions they've
  // prayed least recently lead (never-prayed first, newest first), so
  // the slideshow, the feed-detail list, and the offices-only home
  // Prayer List all walk fresh ground first and advance as the viewer
  // prays — rather than on a shared calendar cursor. The first
  // FEED_DAILY_LIMIT are "today's slice." Editors (isCreator) get the
  // raw newest-first list so the management view stays stable.
  if (!isCreator) {
    res.json({ intercessions: rotateForUser(intercessions) });
    return;
  }

  res.json({ intercessions });
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

  // 15-minute grace window before the "new intercession" push fans
  // out to subscribers. Stamping this column (rather than pushing
  // synchronously) lets the editor fix a typo, edit the body, or
  // delete the moment entirely before anyone gets pinged — the
  // bellSender scanner picks the row up once the window elapses.
  const GRACE_MS = 15 * 60 * 1000;
  const notifyAt = new Date(Date.now() + GRACE_MS);
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
      notifySubscribersAt: notifyAt,
      // Recorded so the scanner can exclude this user from the
      // fan-out push — otherwise the publisher gets pinged 15
      // minutes later about their own intercession.
      publishedByUserId: user.id,
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

  // (The "new intercession" push is NOT fired here. We stamped
  // notify_subscribers_at above so bellSender.runFeedIntercessionPushSender
  // sends it ~15 minutes later — gives the editor a grace window to
  // edit the body or delete a mis-published intercession before
  // subscribers get pinged.)

  // Auto-fetch the linked article's title AFTER responding so the
  // admin's save isn't blocked on a (possibly slow) outbound fetch.
  // Best-effort: a null result leaves learnMoreTitle null and the
  // slide shows the bare pill. Fire-and-forget — the Express process
  // stays alive between requests, so the update lands shortly after.
  if (normalizedUrl) {
    void (async () => {
      try {
        const { fetchArticleTitle } = await import("../lib/articleTitle");
        const title = await fetchArticleTitle(normalizedUrl);
        if (title) {
          await db.update(sharedMomentsTable)
            .set({ learnMoreTitle: title })
            .where(eq(sharedMomentsTable.id, moment.id));
        }
      } catch (err) {
        console.warn("[feed intercession] article-title fetch failed:", err);
      }
    })();
  }
});

// PATCH /api/prayer-feeds/:slug/intercessions/:id — editor-only. Lets a
// feed manager edit the copy (title, body, source pill, learn-more URL)
// of an already-published intercession. Partial: any subset of the four
// fields can change. We don't touch notify_subscribers_at — if the
// edit happens inside the 15-minute grace window the scheduled push
// just sends whatever the latest title is; if it's later, the push
// already went and the edit is a quiet correction.
const feedIntercessionPatchSchema = z.object({
  source: z.enum(["bcp", "custom", "action"]).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  fullText: z.string().trim().min(1).max(4000).optional(),
  // null explicitly clears the URL; undefined leaves it unchanged.
  learnMoreUrl: z.string().trim().max(500).optional().nullable(),
}).refine(
  (v) => v.source !== undefined || v.title !== undefined || v.fullText !== undefined || v.learnMoreUrl !== undefined,
  { message: "Nothing to update." },
);
router.patch("/prayer-feeds/:slug/intercessions/:id", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "You don't have permission to edit this feed." });
    return;
  }
  const momentId = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(momentId)) {
    res.status(400).json({ error: "Invalid intercession id." });
    return;
  }
  const parsed = feedIntercessionPatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }

  // Pull the current row so we can validate the EFFECTIVE state after
  // the patch (e.g. switching source → "action" requires a URL; if the
  // editor changes only the title we still need to check the existing
  // URL is valid).
  const [current] = await db
    .select({
      id: sharedMomentsTable.id,
      prayerFeedId: sharedMomentsTable.prayerFeedId,
      templateType: sharedMomentsTable.templateType,
      intercessionSource: sharedMomentsTable.intercessionSource,
      learnMoreUrl: sharedMomentsTable.learnMoreUrl,
    })
    .from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.id, momentId))
    .limit(1);
  if (!current || current.templateType !== "intercession" || current.prayerFeedId !== feed.id) {
    res.status(404).json({ error: "Intercession not found on this feed." });
    return;
  }

  const next = {
    source: parsed.data.source ?? current.intercessionSource,
    // learnMoreUrl: undefined → keep current; null → clear; string → normalize
    rawUrl: parsed.data.learnMoreUrl === undefined ? current.learnMoreUrl : parsed.data.learnMoreUrl,
  };
  const normalizedUrl = next.rawUrl == null ? null : normalizeLearnMoreUrl(next.rawUrl);
  if (next.source === "action" && !normalizedUrl) {
    res.status(400).json({ error: "An action intercession needs a valid link." });
    return;
  }

  // Build the partial update set — only the columns the patch actually
  // touched, so an unrelated DB-side default (or trigger) on the
  // untouched columns stays out of the way.
  const updates: Partial<typeof sharedMomentsTable.$inferInsert> = {};
  if (parsed.data.source !== undefined) updates.intercessionSource = parsed.data.source;
  if (parsed.data.title !== undefined) {
    updates.name = parsed.data.title;
    updates.intention = parsed.data.title;
    updates.intercessionTopic = parsed.data.title;
  }
  if (parsed.data.fullText !== undefined) updates.intercessionFullText = parsed.data.fullText;
  if (parsed.data.learnMoreUrl !== undefined) {
    updates.learnMoreUrl = normalizedUrl;
    // Reset the cached article title — the background fetch below will
    // refresh it. Without this, an edit from URL A to URL B would keep
    // showing A's title until manual refresh.
    updates.learnMoreTitle = null;
  }

  await db
    .update(sharedMomentsTable)
    .set(updates)
    .where(eq(sharedMomentsTable.id, momentId));

  res.json({ ok: true });

  // Re-fetch the article title in the background if the URL changed.
  // Same fire-and-forget pattern as the create path.
  if (parsed.data.learnMoreUrl !== undefined && normalizedUrl) {
    void (async () => {
      try {
        const { fetchArticleTitle } = await import("../lib/articleTitle");
        const articleTitle = await fetchArticleTitle(normalizedUrl);
        if (articleTitle) {
          await db.update(sharedMomentsTable)
            .set({ learnMoreTitle: articleTitle })
            .where(eq(sharedMomentsTable.id, momentId));
        }
      } catch (err) {
        console.warn("[feed intercession PATCH] article-title fetch failed:", err);
      }
    })();
  }
});

// ─── Feed events ────────────────────────────────────────────────────────────
//
// A feed manager attaches time-bound events (vigils, days of prayer,
// webinars, local actions) to their feed; subscribers see them in-app.
// Announce-only in v1 — no RSVP, no calendar fan-out. Same permission
// gate as intercessions (requireBeta middleware + canEditFeed). Reads
// are subscribers-only (canViewFeed); there is intentionally NO anon
// branch — feed events do not appear on the public /feed/:slug page.

const feedEventSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  joinUrl: z.string().trim().url().max(500).optional().nullable(),
});
const updateFeedEventSchema = feedEventSchema.partial().extend({
  state: z.enum(["published", "cancelled"]).optional(),
});

// GET /api/prayer-feeds/:slug/events — list this feed's events.
// Editors see all states; subscribers see published. Defaults to
// upcoming (coalesce(ends_at, starts_at) >= now); editors can pass
// ?all=1 to include past events in the management view.
router.get("/prayer-feeds/:slug/events", requireAuth, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  const isCreator = await canEditFeed(user.id, feed);
  if (!(await canViewFeed(user.id, feed, isCreator))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const includeAll = isCreator && req.query.all === "1";
  const conditions = [eq(prayerFeedEventsTable.feedId, feed.id)];
  if (!isCreator) conditions.push(eq(prayerFeedEventsTable.state, "published"));
  if (!includeAll) {
    conditions.push(sql`COALESCE(${prayerFeedEventsTable.endsAt}, ${prayerFeedEventsTable.startsAt}) >= NOW()`);
  }
  const events = await db
    .select()
    .from(prayerFeedEventsTable)
    .where(and(...conditions))
    .orderBy(asc(prayerFeedEventsTable.startsAt));

  res.json({ events });
});

// POST /api/prayer-feeds/:slug/events — manager creates an event.
router.post("/prayer-feeds/:slug/events", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "You don't have permission to publish to this feed." });
    return;
  }
  const parsed = feedEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { title, description, startsAt, endsAt, location, joinUrl } = parsed.data;
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
    res.status(400).json({ error: "End time must be after the start time." });
    return;
  }

  const [event] = await db
    .insert(prayerFeedEventsTable)
    .values({
      feedId: feed.id,
      createdByUserId: user.id,
      title,
      description: description ?? null,
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      location: location ?? null,
      joinUrl: joinUrl ?? null,
      state: "published",
    })
    .returning();

  res.status(201).json({ event });

  // Fire-and-forget creation push to every subscriber. Best-effort —
  // the response already went out, so a push failure never blocks save.
  void (async () => {
    try {
      const { sendNewFeedEventPush } = await import("../lib/pushSender");
      await sendNewFeedEventPush(feed.id, {
        feedSlug: feed.slug,
        feedTitle: feed.title,
        eventTitle: event.title,
        eventId: event.id,
      });
    } catch (err) {
      console.warn("[feed event] creation push failed:", err);
    }
  })();
});

// PATCH /api/prayer-feeds/:slug/events/:id — edit or cancel an event.
router.patch("/prayer-feeds/:slug/events/:id", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "You don't have permission to edit this feed." });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(prayerFeedEventsTable)
    .where(eq(prayerFeedEventsTable.id, id));
  if (!existing || existing.feedId !== feed.id) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const parsed = updateFeedEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const d = parsed.data;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (d.title !== undefined) patch.title = d.title;
  if (d.description !== undefined) patch.description = d.description ?? null;
  if (d.startsAt !== undefined) patch.startsAt = new Date(d.startsAt);
  if (d.endsAt !== undefined) patch.endsAt = d.endsAt ? new Date(d.endsAt) : null;
  if (d.location !== undefined) patch.location = d.location ?? null;
  if (d.joinUrl !== undefined) patch.joinUrl = d.joinUrl ?? null;
  if (d.state !== undefined) patch.state = d.state;

  const [event] = await db
    .update(prayerFeedEventsTable)
    .set(patch)
    .where(eq(prayerFeedEventsTable.id, id))
    .returning();
  res.json({ event });
});

// DELETE /api/prayer-feeds/:slug/events/:id — hard-remove an event.
// (The manage UI's "Cancel" uses PATCH→cancelled for a soft cancel;
// this is the "remove entirely" path.)
router.delete("/prayer-feeds/:slug/events/:id", requireBeta, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (!(await canEditFeed(user.id, feed))) {
    res.status(403).json({ error: "You don't have permission to edit this feed." });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  await db.delete(prayerFeedEventsTable).where(and(
    eq(prayerFeedEventsTable.id, id),
    eq(prayerFeedEventsTable.feedId, feed.id),
  ));
  res.json({ ok: true });
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
      // Pulled for the fan-out push below — the subscribers who get
      // notified should see WHAT they're being asked to pray for, not
      // a generic "new intercession" headline.
      intercessionTopic: sharedMomentsTable.intercessionTopic,
      name: sharedMomentsTable.name,
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
  // Attach + start the 15-minute grace window in the same write.
  // Same rationale as the fresh-create path: gives the editor a buffer
  // to revert if they attached the wrong intercession or want to edit
  // it before subscribers see the push. publishedByUserId is the
  // attaching editor (not the original community creator) — they're
  // the one taking the action whose push we're deduping.
  const GRACE_MS = 15 * 60 * 1000;
  await db
    .update(sharedMomentsTable)
    .set({
      prayerFeedId: feed.id,
      notifySubscribersAt: new Date(Date.now() + GRACE_MS),
      publishedByUserId: user.id,
    })
    .where(eq(sharedMomentsTable.id, moment.id));
  const { reconcileFeedPracticeMembers } = await import("./groups");
  await reconcileFeedPracticeMembers(moment.id);
  res.json({ ok: true });

  // (Push is deferred to bellSender.runFeedIntercessionPushSender per
  // the notify_subscribers_at timestamp above.)
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
router.post("/prayer-feeds/:slug/subscribe", requireAuth, async (req, res): Promise<void> => {
  const user = getUser(req)!;
  const feed = await getFeedBySlug(String(req.params.slug));
  if (!feed) { res.status(404).json({ error: "Not found" }); return; }
  if (feed.state !== "live") {
    res.status(400).json({ error: "This feed is not currently accepting subscribers." });
    return;
  }
  // Non-beta accounts (incl. the offices-only tier) may only subscribe
  // to feeds the creator has marked public.
  if (feed.visibility !== "public" && !(await isBetaUser(user.id))) {
    res.status(403).json({ error: "This feed is private." });
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
router.delete("/prayer-feeds/:slug/subscribe", requireAuth, async (req, res): Promise<void> => {
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
  if (!isCreator && feed.state !== "live") {
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
      // No email here: this roster only needs name + avatar (matching the
      // WeekPrayer roster elsewhere). Returning account emails to every
      // feed viewer over-exposes PII for no UI need.
      name: usersTable.name,
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
