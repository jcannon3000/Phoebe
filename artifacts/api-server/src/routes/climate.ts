import { Router } from "express";
import {
  db,
  usersTable,
  groupsTable,
  groupAnnouncementsTable,
  betaUsersTable,
  prayerFeedsTable,
  prayerFeedSubscriptionsTable,
  sharedMomentsTable,
  momentUserTokensTable,
} from "@workspace/db";
import { eq, and, sql, gte, asc, desc, isNotNull } from "drizzle-orm";
import { hashPassword } from "./auth";
import { rateLimit } from "../lib/rate-limit";
import { loginFreshSession } from "../lib/session";
import crypto from "crypto";

const router = Router();

function generateToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Validate the optional Learn-More URL on a feed intercession. Accepts
// http(s) only, prepends https:// when the user types a bare host
// (e.g. "grist.org/article"), returns null on empty/invalid input.
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

function requireClimate(req: any, res: any, next: any) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Not authenticated" }); return;
  }
  if (!(req.user as { climateEnrolled: boolean }).climateEnrolled) {
    res.status(403).json({ error: "Not enrolled in Phoebe Climate" }); return;
  }
  next();
}

// Climate admin = beta admin for v1. The audience is small enough that
// reusing beta_users.is_admin keeps the auth surface minimal.
async function requireClimateAdmin(req: any, res: any, next: any) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Not authenticated" }); return;
  }
  const u = req.user as { id: number; email: string };
  try {
    const [admin] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()));
    if (!admin?.isAdmin) {
      res.status(403).json({ error: "Climate admin access required" }); return;
    }
    next();
  } catch {
    res.status(500).json({ error: "Failed to verify admin access" });
  }
}

// Find the phoebe-climate feed. Helper because almost every route here
// needs it.
async function getClimateFeed(): Promise<{ id: number; timezone: string } | null> {
  const [feed] = await db
    .select({ id: prayerFeedsTable.id, timezone: prayerFeedsTable.timezone })
    .from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.slug, "phoebe-climate"));
  return feed ?? null;
}

// Idempotent subscribe — used at signup and enroll-self. Inserts the
// subscription, recomputes subscriberCount, and reconciles every feed
// intercession's token roster so the new subscriber lights up the
// existing ones immediately on /api/moments.
async function subscribeToClimateFeed(userId: number): Promise<void> {
  const feed = await getClimateFeed();
  if (!feed) return;
  await db
    .insert(prayerFeedSubscriptionsTable)
    .values({ feedId: feed.id, userId })
    .onConflictDoNothing();
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(prayerFeedSubscriptionsTable)
    .where(eq(prayerFeedSubscriptionsTable.feedId, feed.id));
  await db
    .update(prayerFeedsTable)
    .set({ subscriberCount: count, updatedAt: new Date() })
    .where(eq(prayerFeedsTable.id, feed.id));
  const { reconcileAllPracticesForFeed } = await import("./groups");
  await reconcileAllPracticesForFeed(feed.id);
}

// ─── POST /api/climate/signup ────────────────────────────────────────────────
// Open signup — anyone with the URL can create a climate-enrolled account.
// Auto-subscribes to phoebe-climate so feed intercessions surface on the
// regular dashboard + slideshow without any extra opt-in step.
router.post(
  "/climate/signup",
  rateLimit({
    name: "climate_signup",
    max: 5,
    windowMs: 60 * 60 * 1000,
    message: "Too many signup attempts from your network. Please try again in an hour.",
  }),
  async (req, res): Promise<void> => {
    const { email, name, password, website } = req.body as {
      email?: string; name?: string; password?: string;
      website?: string;
    };

    if (website && website.trim().length > 0) {
      res.status(400).json({ error: "Invalid submission." }); return;
    }
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "A valid email address is required." }); return;
    }
    if (!name || name.trim().length < 1) {
      res.status(400).json({ error: "Your name is required." }); return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters." }); return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail));
    if (existing) {
      res.status(400).json({ error: "An account with that email already exists." }); return;
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(usersTable)
      .values({
        email: normalizedEmail,
        name: name.trim(),
        passwordHash,
        climateEnrolled: true,
        bellEnabled: true,
        // Skip Phoebe's general onboarding tour. Climate has its own.
        onboardingCompleted: true,
        // climateOnly distinguishes signups via /climate from existing
        // Phoebe users who later get climate_enrolled flipped on.
        climateOnly: true,
      })
      .returning();

    // Auto-subscribe to the climate feed before login so the user's
    // first /api/moments query already has feed intercessions available.
    await subscribeToClimateFeed(user.id);

    // Regenerate the session id on auth to defeat session fixation — an
    // attacker who planted a known session id pre-signup must not inherit the
    // authenticated session.
    loginFreshSession(req, user as Express.User, (err) => {
      if (err) { res.status(500).json({ error: "Login failed after signup." }); return; }
      req.session.save(() => res.json({ ok: true }));
    });
  },
);

// POST /api/climate/enroll-self — existing Phoebe user opts into climate.
// climate_only stays false so they keep their full Phoebe drawer; this
// just adds climate to the surfaces they see.
router.post("/climate/enroll-self", async (req, res): Promise<void> => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Not authenticated" }); return;
  }
  const userId = (req.user as { id: number }).id;
  await db
    .update(usersTable)
    .set({ climateEnrolled: true, bellEnabled: true })
    .where(eq(usersTable.id, userId));
  if (req.user) {
    (req.user as Record<string, unknown>).climateEnrolled = true;
    (req.user as Record<string, unknown>).bellEnabled = true;
  }
  // Same auto-subscribe path as signup.
  await subscribeToClimateFeed(userId);
  res.json({ ok: true });
});

// PATCH /api/climate/onboarding — flip the post-signup intro flag.
router.patch("/climate/onboarding", requireClimate, async (req, res): Promise<void> => {
  const userId = (req.user as { id: number }).id;
  await db
    .update(usersTable)
    .set({ climateOnboardingCompleted: true })
    .where(eq(usersTable.id, userId));
  if (req.user) {
    (req.user as Record<string, unknown>).climateOnboardingCompleted = true;
  }
  res.json({ ok: true });
});

// ─── Parish picker (unchanged from earlier session) ────────────────────────

router.get("/climate/parishes", requireClimate, async (req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: groupsTable.id,
        name: groupsTable.name,
        slug: groupsTable.slug,
        emoji: groupsTable.emoji,
      })
      .from(groupsTable)
      .where(eq(groupsTable.isPrayerCircle, false))
      .orderBy(asc(groupsTable.name));
    res.json({ parishes: rows });
  } catch {
    res.status(500).json({ error: "Failed to load parishes" });
  }
});

router.patch("/climate/me/parish", requireClimate, async (req, res): Promise<void> => {
  try {
    const userId = (req.user as { id: number }).id;
    const body = req.body as { parishId?: number | null };
    const parishId =
      body.parishId === null || body.parishId === undefined
        ? null
        : Number(body.parishId);

    if (parishId !== null) {
      const [group] = await db
        .select({ id: groupsTable.id, isPrayerCircle: groupsTable.isPrayerCircle })
        .from(groupsTable)
        .where(eq(groupsTable.id, parishId));
      if (!group || group.isPrayerCircle) {
        res.status(400).json({ error: "Invalid parish" }); return;
      }
    }

    await db
      .update(usersTable)
      .set({ parishId })
      .where(eq(usersTable.id, userId));
    if (req.user) {
      (req.user as Record<string, unknown>).parishId = parishId;
    }
    res.json({ ok: true, parishId });
  } catch {
    res.status(500).json({ error: "Failed to update parish" });
  }
});

// ─── Prayer walks ──────────────────────────────────────────────────────────
// Walks live in group_announcements with kind='prayer_walk'. Two scopes:
// group-scoped (groupId set) and feed-scoped (prayerFeedId set). Climate
// users see both — group walks across all groups + feed walks on the
// climate feed. Returns a unified `host` object so the frontend renders
// "Hosted by <name>" without caring about scope.

router.get("/climate/walks", requireClimate, async (_req, res): Promise<void> => {
  try {
    const now = new Date();

    // LEFT JOIN groups (so feed-scoped walks with null groupId still
    // come back) and LEFT JOIN prayer_feeds for the host name on the
    // feed side. One row per walk; drizzle gives us nullable host
    // columns we collapse below.
    const rows = await db
      .select({
        id: groupAnnouncementsTable.id,
        title: groupAnnouncementsTable.title,
        content: groupAnnouncementsTable.content,
        eventAt: groupAnnouncementsTable.eventAt,
        location: groupAnnouncementsTable.location,
        groupName: groupsTable.name,
        groupSlug: groupsTable.slug,
        groupEmoji: groupsTable.emoji,
        feedTitle: prayerFeedsTable.title,
        feedSlug: prayerFeedsTable.slug,
        feedEmoji: prayerFeedsTable.coverEmoji,
      })
      .from(groupAnnouncementsTable)
      .leftJoin(groupsTable, eq(groupsTable.id, groupAnnouncementsTable.groupId))
      .leftJoin(prayerFeedsTable, eq(prayerFeedsTable.id, groupAnnouncementsTable.prayerFeedId))
      .where(
        and(
          eq(groupAnnouncementsTable.kind, "prayer_walk"),
          isNotNull(groupAnnouncementsTable.eventAt),
          gte(groupAnnouncementsTable.eventAt, now),
        ),
      )
      .orderBy(asc(groupAnnouncementsTable.eventAt))
      .limit(10);

    const walks = rows.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      eventAt: r.eventAt,
      location: r.location,
      hostName: r.groupName ?? r.feedTitle ?? "Phoebe",
      hostSlug: r.groupSlug ?? r.feedSlug ?? null,
      hostEmoji: r.groupEmoji ?? r.feedEmoji ?? "🚶🏽",
    }));

    res.json({ walks });
  } catch {
    res.status(500).json({ error: "Failed to load prayer walks" });
  }
});

// ─── Climate admin: prayer walks ──────────────────────────────────────────
// Same shape as the community walk-creation flow (community-detail.tsx's
// announcement form with kind=prayer_walk), just scoped to the feed.

// GET /api/climate/admin/walks — list every walk on the climate feed
// (past + upcoming), most-recent-first by event_at.
router.get("/climate/admin/walks", requireClimateAdmin, async (_req, res): Promise<void> => {
  try {
    const feed = await getClimateFeed();
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    const rows = await db
      .select({
        id: groupAnnouncementsTable.id,
        title: groupAnnouncementsTable.title,
        content: groupAnnouncementsTable.content,
        eventAt: groupAnnouncementsTable.eventAt,
        location: groupAnnouncementsTable.location,
        createdAt: groupAnnouncementsTable.createdAt,
      })
      .from(groupAnnouncementsTable)
      .where(
        and(
          eq(groupAnnouncementsTable.kind, "prayer_walk"),
          eq(groupAnnouncementsTable.prayerFeedId, feed.id),
        ),
      )
      .orderBy(desc(groupAnnouncementsTable.eventAt));
    res.json({ walks: rows });
  } catch {
    res.status(500).json({ error: "Failed to load walks" });
  }
});

// POST /api/climate/admin/walks — create a feed-scoped prayer walk.
router.post("/climate/admin/walks", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const userId = (req.user as { id: number }).id;
    const body = req.body as {
      title?: string;
      content?: string;
      eventAt?: string; // ISO 8601 string; converted to Date here
      location?: string;
    };
    if (!body.title || body.title.trim().length === 0) {
      res.status(400).json({ error: "Title is required" }); return;
    }
    if (!body.content || body.content.trim().length === 0) {
      res.status(400).json({ error: "Description is required" }); return;
    }
    if (!body.eventAt) {
      res.status(400).json({ error: "Date and time are required" }); return;
    }
    const eventAt = new Date(body.eventAt);
    if (Number.isNaN(eventAt.getTime())) {
      res.status(400).json({ error: "Invalid date/time" }); return;
    }
    const feed = await getClimateFeed();
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    const [row] = await db
      .insert(groupAnnouncementsTable)
      .values({
        groupId: null,
        prayerFeedId: feed.id,
        authorUserId: userId,
        title: body.title.trim(),
        content: body.content.trim(),
        kind: "prayer_walk",
        eventAt,
        location: body.location?.trim() || null,
      })
      .returning();
    res.json({ walk: row });
  } catch (err) {
    console.error("[climate/admin/walks] create failed", err);
    res.status(500).json({ error: "Failed to create walk" });
  }
});

// PATCH /api/climate/admin/walks/:id — edit a feed walk in place.
router.patch("/climate/admin/walks/:id", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const feed = await getClimateFeed();
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    const [existing] = await db
      .select({ id: groupAnnouncementsTable.id, prayerFeedId: groupAnnouncementsTable.prayerFeedId })
      .from(groupAnnouncementsTable)
      .where(eq(groupAnnouncementsTable.id, id));
    if (!existing || existing.prayerFeedId !== feed.id) {
      res.status(404).json({ error: "Walk not found" }); return;
    }
    const body = req.body as {
      title?: string;
      content?: string;
      eventAt?: string;
      location?: string | null;
    };
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const t = body.title.trim();
      if (!t) { res.status(400).json({ error: "Title cannot be empty" }); return; }
      patch.title = t;
    }
    if (body.content !== undefined) {
      const c = body.content.trim();
      if (!c) { res.status(400).json({ error: "Description cannot be empty" }); return; }
      patch.content = c;
    }
    if (body.eventAt !== undefined) {
      const d = new Date(body.eventAt);
      if (Number.isNaN(d.getTime())) { res.status(400).json({ error: "Invalid date/time" }); return; }
      patch.eventAt = d;
    }
    if (body.location !== undefined) {
      patch.location = body.location?.trim() || null;
    }
    if (Object.keys(patch).length === 0) {
      res.json({ ok: true }); return;
    }
    const [row] = await db
      .update(groupAnnouncementsTable)
      .set(patch as any)
      .where(eq(groupAnnouncementsTable.id, id))
      .returning();
    res.json({ walk: row });
  } catch (err) {
    console.error("[climate/admin/walks] update failed", err);
    res.status(500).json({ error: "Failed to update walk" });
  }
});

// DELETE /api/climate/admin/walks/:id — remove a walk. Hard delete here
// because there's no audit value in keeping a cancelled walk (unlike
// intercessions, which carry historical prayer counts).
router.delete("/climate/admin/walks/:id", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const feed = await getClimateFeed();
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    const [existing] = await db
      .select({ id: groupAnnouncementsTable.id, prayerFeedId: groupAnnouncementsTable.prayerFeedId })
      .from(groupAnnouncementsTable)
      .where(eq(groupAnnouncementsTable.id, id));
    if (!existing || existing.prayerFeedId !== feed.id) {
      res.status(404).json({ error: "Walk not found" }); return;
    }
    await db
      .delete(groupAnnouncementsTable)
      .where(eq(groupAnnouncementsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete walk" });
  }
});

// GET /api/climate/intercessions — public list of active feed intercessions
// for /climate hub display. Subscribers see them all as cards. Returns
// the same shape as the admin variant minus draft/archived rows.
router.get("/climate/intercessions", requireClimate, async (_req, res): Promise<void> => {
  try {
    const feed = await getClimateFeed();
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    const rows = await db
      .select({
        id: sharedMomentsTable.id,
        name: sharedMomentsTable.name,
        intercessionTopic: sharedMomentsTable.intercessionTopic,
        intercessionFullText: sharedMomentsTable.intercessionFullText,
        learnMoreUrl: sharedMomentsTable.learnMoreUrl,
        createdAt: sharedMomentsTable.createdAt,
      })
      .from(sharedMomentsTable)
      .where(
        and(
          eq(sharedMomentsTable.prayerFeedId, feed.id),
          eq(sharedMomentsTable.state, "active"),
        ),
      )
      .orderBy(desc(sharedMomentsTable.createdAt));
    res.json({ intercessions: rows });
  } catch {
    res.status(500).json({ error: "Failed to load intercessions" });
  }
});

// ─── Climate admin: feed intercession curation ─────────────────────────────
// Authoring is on community intercessions (shared_moments) scoped to the
// phoebe-climate feed. Subscribers get tokens via reconcileFeedPracticeMembers
// so the intercession surfaces on the regular dashboard + prayer-mode
// slideshow — no parallel UI, just the same primitives Phoebe already has.

// GET /api/climate/admin/intercessions — list every climate-feed
// intercession (active and archived). Admin sees all; ordered most
// recently created first.
router.get("/climate/admin/intercessions", requireClimateAdmin, async (_req, res): Promise<void> => {
  try {
    const feed = await getClimateFeed();
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    const rows = await db
      .select({
        id: sharedMomentsTable.id,
        name: sharedMomentsTable.name,
        intention: sharedMomentsTable.intention,
        intercessionTopic: sharedMomentsTable.intercessionTopic,
        intercessionFullText: sharedMomentsTable.intercessionFullText,
        intercessionSource: sharedMomentsTable.intercessionSource,
        scheduledTime: sharedMomentsTable.scheduledTime,
        frequency: sharedMomentsTable.frequency,
        state: sharedMomentsTable.state,
        learnMoreUrl: sharedMomentsTable.learnMoreUrl,
        createdAt: sharedMomentsTable.createdAt,
      })
      .from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.prayerFeedId, feed.id))
      .orderBy(desc(sharedMomentsTable.createdAt));

    // Annotate with subscriber count so the admin can see audience size.
    const [{ count: subscriberCount }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(prayerFeedSubscriptionsTable)
      .where(eq(prayerFeedSubscriptionsTable.feedId, feed.id));

    res.json({ intercessions: rows, subscriberCount: Number(subscriberCount) || 0 });
  } catch {
    res.status(500).json({ error: "Failed to load intercessions" });
  }
});

// POST /api/climate/admin/intercessions — create a new feed-scoped
// intercession. Uses the same primitives as a regular community
// intercession (templateType="intercession", scheduledTime, etc.) but
// owns no group — its participants are feed subscribers.
router.post("/climate/admin/intercessions", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const userId = (req.user as { id: number; email: string; name: string }).id;
    const adminEmail = (req.user as { email: string }).email;
    const adminName = (req.user as { name: string }).name;

    const body = req.body as {
      title?: string;
      fullText?: string;
      learnMoreUrl?: string | null;
      scheduledTime?: string;
      frequency?: string;
      timezone?: string;
    };

    if (!body.title || body.title.trim().length === 0) {
      res.status(400).json({ error: "Title is required" }); return;
    }
    if (!body.fullText || body.fullText.trim().length === 0) {
      res.status(400).json({ error: "Prayer text is required" }); return;
    }

    const feed = await getClimateFeed();
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }

    const title = body.title.trim();
    const fullText = body.fullText.trim();
    const scheduledTime = (body.scheduledTime ?? "09:30").trim();
    const frequency = (body.frequency ?? "daily").trim();
    const timezone = (body.timezone ?? feed.timezone ?? "America/New_York").trim();
    const learnMoreUrl = normalizeLearnMoreUrl(body.learnMoreUrl);

    const [moment] = await db
      .insert(sharedMomentsTable)
      .values({
        prayerFeedId: feed.id,
        groupId: null,
        name: title,
        intention: title,
        intercessionTopic: title,
        intercessionFullText: fullText,
        intercessionSource: "custom",
        templateType: "intercession",
        loggingType: "photo",
        frequency,
        scheduledTime,
        timezone,
        windowMinutes: 60,
        goalDays: 30,
        state: "active",
        momentToken: generateToken(),
        learnMoreUrl,
      })
      .returning();

    // Mint the admin's own token first so they're the organizer
    // (smallest-id token), then reconcile to add every current
    // subscriber. Reconciliation preserves the organizer regardless.
    await db.insert(momentUserTokensTable).values({
      momentId: moment.id,
      email: adminEmail.toLowerCase(),
      name: adminName,
      userToken: generateToken(),
    });

    const { reconcileFeedPracticeMembers } = await import("./groups");
    await reconcileFeedPracticeMembers(moment.id);

    res.json({ intercession: moment });
  } catch (err) {
    console.error("[climate/admin/intercessions] create failed", err);
    res.status(500).json({ error: "Failed to create intercession" });
  }
});

// PATCH /api/climate/admin/intercessions/:id — edit text/schedule.
router.patch("/climate/admin/intercessions/:id", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const feed = await getClimateFeed();
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    const [existing] = await db
      .select({ id: sharedMomentsTable.id, prayerFeedId: sharedMomentsTable.prayerFeedId })
      .from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.id, id));
    if (!existing || existing.prayerFeedId !== feed.id) {
      res.status(404).json({ error: "Intercession not found" }); return;
    }
    const body = req.body as {
      title?: string;
      fullText?: string;
      learnMoreUrl?: string | null;
      scheduledTime?: string;
      frequency?: string;
      state?: "active" | "archived";
    };
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const t = body.title.trim();
      if (t.length === 0) { res.status(400).json({ error: "Title cannot be empty" }); return; }
      patch.name = t;
      patch.intention = t;
      patch.intercessionTopic = t;
    }
    if (body.fullText !== undefined) {
      const f = body.fullText.trim();
      if (f.length === 0) { res.status(400).json({ error: "Prayer text cannot be empty" }); return; }
      patch.intercessionFullText = f;
    }
    if (body.learnMoreUrl !== undefined) {
      patch.learnMoreUrl = normalizeLearnMoreUrl(body.learnMoreUrl);
    }
    if (body.scheduledTime !== undefined) patch.scheduledTime = body.scheduledTime.trim();
    if (body.frequency !== undefined) patch.frequency = body.frequency.trim();
    if (body.state !== undefined && (body.state === "active" || body.state === "archived")) {
      patch.state = body.state;
    }
    if (Object.keys(patch).length === 0) {
      res.json({ ok: true }); return;
    }
    const [row] = await db
      .update(sharedMomentsTable)
      .set(patch as any)
      .where(eq(sharedMomentsTable.id, id))
      .returning();
    res.json({ intercession: row });
  } catch (err) {
    console.error("[climate/admin/intercessions] update failed", err);
    res.status(500).json({ error: "Failed to update intercession" });
  }
});

// DELETE /api/climate/admin/intercessions/:id — soft-archive (set state).
// Hard delete cascades into momentUserTokens / posts which is more
// destructive than we want for v1; archiving keeps the audit trail and
// hides the intercession from /api/moments.
router.delete("/climate/admin/intercessions/:id", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" }); return;
    }
    const feed = await getClimateFeed();
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    const [existing] = await db
      .select({ id: sharedMomentsTable.id, prayerFeedId: sharedMomentsTable.prayerFeedId })
      .from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.id, id));
    if (!existing || existing.prayerFeedId !== feed.id) {
      res.status(404).json({ error: "Intercession not found" }); return;
    }
    await db
      .update(sharedMomentsTable)
      .set({ state: "archived" } as any)
      .where(eq(sharedMomentsTable.id, id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to archive intercession" });
  }
});

export default router;
