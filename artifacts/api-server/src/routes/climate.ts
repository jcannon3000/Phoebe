import { Router } from "express";
import {
  db,
  usersTable,
  groupsTable,
  groupAnnouncementsTable,
  betaUsersTable,
  prayerFeedsTable,
  prayerFeedEntriesTable,
  prayerFeedPrayersTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, asc, desc, isNotNull } from "drizzle-orm";
import { hashPassword } from "./auth";
import { rateLimit } from "../lib/rate-limit";

const router = Router();

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
// reusing beta_users.is_admin keeps the auth surface minimal; if climate
// curation needs to delegate beyond beta admins later we'll add a
// dedicated climate_admins table.
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
  } catch (err) {
    res.status(500).json({ error: "Failed to verify admin access" });
  }
}

// Today in a tz as a YYYY-MM-DD string. Inlined here (not shared with
// bellSender) to keep this route's dependencies obvious.
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

// Look up the phoebe-climate feed and today's published entry (if any).
// Shared by GET /climate/today and POST /climate/today/pray so the two
// endpoints agree on what "today's entry" means.
async function loadTodayContext(): Promise<{
  feed: { id: number; timezone: string } | null;
  entry: { id: number; title: string; body: string; scriptureRef: string | null } | null;
  dayLocal: string;
}> {
  const [feed] = await db
    .select({ id: prayerFeedsTable.id, timezone: prayerFeedsTable.timezone })
    .from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.slug, "phoebe-climate"));

  if (!feed) {
    return { feed: null, entry: null, dayLocal: todayInTz("America/New_York") };
  }

  const dayLocal = todayInTz(feed.timezone);
  const [entry] = await db
    .select({
      id: prayerFeedEntriesTable.id,
      title: prayerFeedEntriesTable.title,
      body: prayerFeedEntriesTable.body,
      scriptureRef: prayerFeedEntriesTable.scriptureRef,
    })
    .from(prayerFeedEntriesTable)
    .where(
      and(
        eq(prayerFeedEntriesTable.feedId, feed.id),
        eq(prayerFeedEntriesTable.entryDate, dayLocal),
        eq(prayerFeedEntriesTable.state, "published"),
      ),
    );

  return { feed, entry: entry ?? null, dayLocal };
}

// GET /api/climate/feed — returns the phoebe-climate feed for enrolled users
router.get("/climate/feed", requireClimate, async (req, res): Promise<void> => {
  try {
    const [feed] = await db
      .select({
        id: prayerFeedsTable.id,
        slug: prayerFeedsTable.slug,
        title: prayerFeedsTable.title,
        tagline: prayerFeedsTable.tagline,
        coverEmoji: prayerFeedsTable.coverEmoji,
        state: prayerFeedsTable.state,
        subscriberCount: prayerFeedsTable.subscriberCount,
      })
      .from(prayerFeedsTable)
      .where(eq(prayerFeedsTable.slug, "phoebe-climate"));

    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    res.json({ feed });
  } catch (err) {
    res.status(500).json({ error: "Failed to load climate feed" });
  }
});

// GET /api/climate/today — today's entry, this user's prayed status, and
// the dual counters that drive the closing slide:
//   • globalCount — how many distinct people prayed today's entry globally
//   • parish     — { name, count } scoped to the caller's parish, or null
//                  if the caller has no parish_id set yet
router.get("/climate/today", requireClimate, async (req, res): Promise<void> => {
  try {
    const u = req.user as { id: number; parishId: number | null };
    const userId = u.id;
    const parishId = u.parishId ?? null;

    const { feed, entry, dayLocal } = await loadTodayContext();

    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }

    let prayedToday = false;
    let globalCount = 0;
    let parish: { name: string; count: number } | null = null;

    if (entry) {
      const [prayer] = await db
        .select({ id: prayerFeedPrayersTable.id })
        .from(prayerFeedPrayersTable)
        .where(
          and(
            eq(prayerFeedPrayersTable.entryId, entry.id),
            eq(prayerFeedPrayersTable.userId, userId),
          ),
        );
      prayedToday = !!prayer;

      // Global count: distinct people who prayed today's entry. Each
      // entry corresponds to one calendar day in the feed's TZ, so this
      // is equivalent to "how many people have prayed today globally."
      // We rely on the (entry_id, user_id) unique index — a plain COUNT
      // is already distinct.
      const [{ count: gc }] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(prayerFeedPrayersTable)
        .where(eq(prayerFeedPrayersTable.entryId, entry.id));
      globalCount = Number(gc) || 0;

      if (parishId) {
        const [parishRow] = await db
          .select({ id: groupsTable.id, name: groupsTable.name })
          .from(groupsTable)
          .where(eq(groupsTable.id, parishId));

        if (parishRow) {
          const [{ count: pc }] = await db
            .select({ count: sql<number>`COUNT(*)::int` })
            .from(prayerFeedPrayersTable)
            .innerJoin(usersTable, eq(usersTable.id, prayerFeedPrayersTable.userId))
            .where(
              and(
                eq(prayerFeedPrayersTable.entryId, entry.id),
                eq(usersTable.parishId, parishId),
              ),
            );
          parish = { name: parishRow.name, count: Number(pc) || 0 };
        }
      }
    }

    res.json({ entry, prayedToday, dayLocal, globalCount, parish });
  } catch (err) {
    res.status(500).json({ error: "Failed to load today's climate entry" });
  }
});

// POST /api/climate/today/pray — log a prayer for today's entry
router.post("/climate/today/pray", requireClimate, async (req, res): Promise<void> => {
  try {
    const userId = (req.user as { id: number }).id;
    const { feed, entry, dayLocal } = await loadTodayContext();

    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    if (!entry) {
      res.status(409).json({ error: "No prayer entry for today" }); return;
    }

    // ON CONFLICT DO NOTHING on the (entry_id, user_id) unique index.
    // `returning` lets us know whether a new row was actually inserted —
    // we only bump pray_count when we're sure this is a first-time
    // log (otherwise tapping Pray twice would inflate the counter).
    const inserted = await db
      .insert(prayerFeedPrayersTable)
      .values({
        feedId: feed.id,
        entryId: entry.id,
        userId,
        dayLocal,
      })
      .onConflictDoNothing({
        target: [prayerFeedPrayersTable.entryId, prayerFeedPrayersTable.userId],
      })
      .returning({ id: prayerFeedPrayersTable.id });

    if (inserted.length > 0) {
      await db
        .update(prayerFeedEntriesTable)
        .set({ prayCount: sql`${prayerFeedEntriesTable.prayCount} + 1` })
        .where(eq(prayerFeedEntriesTable.id, entry.id));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to log prayer" });
  }
});

// ─── POST /api/climate/signup ────────────────────────────────────────────────
// Climate-only account creation. Distinct from /api/auth/register because:
//   • No invite-token / beta_users gate — climate enrollment is its own
//     authorization, not Phoebe-beta authorization
//   • Sets climate_enrolled = true at creation
//   • Sets onboarding_completed = true so the new user lands directly in
//     /climate without seeing Phoebe's general onboarding tour (climate
//     gets its own onboarding in a future session)
//   • Honeypot + rate-limit mirror auth/register's anti-abuse posture
//
// Manual gate for the W&W cohort: a new account is created freely here,
// but only after Jeremy/admin flips climate_enrolled later... no wait,
// we're enrolling at signup. The expectation is a closed marketing URL
// for now; if the page is shared more widely we'll add an invite-token
// requirement here.
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
      // Honeypot — same shape as auth/register.
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
        // bellEnabled drives the 7am climate push. On by default at signup
        // — users can mute it later from settings.
        bellEnabled: true,
        // Skip Phoebe's general onboarding tour. Climate has its own.
        onboardingCompleted: true,
        // climateOnboardingCompleted defaults false — the new user will
        // see ClimateOnboarding once before landing on the tab.
        // climateOnly distinguishes signups via /climate from existing
        // Phoebe users who later get climate_enrolled flipped on.
        climateOnly: true,
      })
      .returning();

    req.login(user, (err) => {
      if (err) { res.status(500).json({ error: "Login failed after signup." }); return; }
      req.session.save(() => res.json({ ok: true }));
    });
  },
);

// GET /api/climate/walks — upcoming prayer walks across all groups.
// Climate-enrolled users see every walk regardless of group membership;
// these are public-by-design events the climate community can join.
// Returns the next 10 walks sorted ascending by event_at, joined to the
// hosting group's name + slug + emoji for the card display.
router.get("/climate/walks", requireClimate, async (req, res): Promise<void> => {
  try {
    const now = new Date();
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
      })
      .from(groupAnnouncementsTable)
      .innerJoin(groupsTable, eq(groupsTable.id, groupAnnouncementsTable.groupId))
      .where(
        and(
          eq(groupAnnouncementsTable.kind, "prayer_walk"),
          isNotNull(groupAnnouncementsTable.eventAt),
          gte(groupAnnouncementsTable.eventAt, now),
        ),
      )
      .orderBy(asc(groupAnnouncementsTable.eventAt))
      .limit(10);

    res.json({ walks: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to load prayer walks" });
  }
});

// POST /api/climate/enroll-self — self-enroll an existing Phoebe user.
// Symmetric with the unauth signup at /climate: anyone with the URL can
// opt in. No invite-token gate today; if the URL spreads we'll add one.
// climate_only stays false for existing Phoebe users — they keep their
// regular drawer and gain Phoebe Climate as an additional surface.
router.post("/climate/enroll-self", async (req, res): Promise<void> => {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Not authenticated" }); return;
  }
  const userId = (req.user as { id: number }).id;
  // Also flip bell_enabled=true so the 7am climate push reaches them —
  // opting in to climate implies wanting the daily ping. They can mute
  // it later from settings if they change their mind.
  await db
    .update(usersTable)
    .set({ climateEnrolled: true, bellEnabled: true })
    .where(eq(usersTable.id, userId));
  if (req.user) {
    (req.user as Record<string, unknown>).climateEnrolled = true;
    (req.user as Record<string, unknown>).bellEnabled = true;
  }
  res.json({ ok: true });
});

// GET /api/climate/parishes — list groups available as parishes. We use
// every non-prayer-circle group; prayer circles are tighter cells, not
// parishes. Filter on isPrayerCircle keeps the picker focused without
// requiring a separate is_parish flag for v1.
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
  } catch (err) {
    res.status(500).json({ error: "Failed to load parishes" });
  }
});

// PATCH /api/climate/me/parish — set or clear the caller's parish_id.
// Body: { parishId: number | null }. Sending null disconnects from the
// current parish (the parish counter on the closing slide goes hidden).
router.patch("/climate/me/parish", requireClimate, async (req, res): Promise<void> => {
  try {
    const userId = (req.user as { id: number }).id;
    const body = req.body as { parishId?: number | null };
    const parishId =
      body.parishId === null || body.parishId === undefined
        ? null
        : Number(body.parishId);

    if (parishId !== null) {
      // Verify the target group exists and isn't a prayer circle. Stops
      // a malicious caller from pointing parish_id at an arbitrary row.
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
  } catch (err) {
    res.status(500).json({ error: "Failed to update parish" });
  }
});

// ─── Climate admin: prayer entry curation ──────────────────────────────
// Beta admins manage the phoebe-climate feed's daily entries. Distinct
// from the generic /prayer-feeds/:slug/manage flow because phoebe-climate
// is platform-owned (creator_user_id NULL) and the existing route gates
// on creator identity. These endpoints touch the same prayer_feed_entries
// table directly so the slideshow + push picks up changes immediately.

// GET /api/climate/admin — feed metadata for the admin (admins-only check
// returns 403 for non-admins, distinct from the public GET /climate/feed)
router.get("/climate/admin", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const [feed] = await db
      .select({
        id: prayerFeedsTable.id,
        slug: prayerFeedsTable.slug,
        title: prayerFeedsTable.title,
        timezone: prayerFeedsTable.timezone,
        state: prayerFeedsTable.state,
        subscriberCount: prayerFeedsTable.subscriberCount,
      })
      .from(prayerFeedsTable)
      .where(eq(prayerFeedsTable.slug, "phoebe-climate"));
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    res.json({ feed });
  } catch (err) {
    res.status(500).json({ error: "Failed to load feed" });
  }
});

// GET /api/climate/admin/entries — list entries in a date range (defaults
// to last 7 days through next 30 days if no params given). Admins see
// every state — drafts, scheduled, published.
router.get("/climate/admin/entries", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const [feed] = await db
      .select({ id: prayerFeedsTable.id, timezone: prayerFeedsTable.timezone })
      .from(prayerFeedsTable)
      .where(eq(prayerFeedsTable.slug, "phoebe-climate"));
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }

    const today = todayInTz(feed.timezone);
    const fromRaw = typeof req.query.from === "string" ? req.query.from : null;
    const toRaw = typeof req.query.to === "string" ? req.query.to : null;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;

    // Default window: 7 days back through 30 days forward.
    const todayDate = new Date(today + "T00:00:00Z");
    const defaultFrom = new Date(todayDate);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 7);
    const defaultTo = new Date(todayDate);
    defaultTo.setUTCDate(defaultTo.getUTCDate() + 30);

    const from = fromRaw && dateRe.test(fromRaw)
      ? fromRaw
      : defaultFrom.toISOString().slice(0, 10);
    const to = toRaw && dateRe.test(toRaw)
      ? toRaw
      : defaultTo.toISOString().slice(0, 10);

    const entries = await db
      .select()
      .from(prayerFeedEntriesTable)
      .where(
        and(
          eq(prayerFeedEntriesTable.feedId, feed.id),
          gte(prayerFeedEntriesTable.entryDate, from),
          lte(prayerFeedEntriesTable.entryDate, to),
        ),
      )
      .orderBy(desc(prayerFeedEntriesTable.entryDate));

    res.json({ entries, today });
  } catch (err) {
    res.status(500).json({ error: "Failed to load entries" });
  }
});

// POST /api/climate/admin/entries — upsert an entry by date. Body:
//   { entryDate, title, body, scriptureRef?, state }
// where state is "draft" | "scheduled" | "published".
router.post("/climate/admin/entries", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const userId = (req.user as { id: number }).id;
    const body = req.body as {
      entryDate?: string;
      title?: string;
      body?: string;
      scriptureRef?: string | null;
      state?: "draft" | "scheduled" | "published";
    };
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!body.entryDate || !dateRe.test(body.entryDate)) {
      res.status(400).json({ error: "entryDate must be YYYY-MM-DD" }); return;
    }
    if (!body.title || body.title.trim().length === 0) {
      res.status(400).json({ error: "Title is required" }); return;
    }
    if (typeof body.body !== "string") {
      res.status(400).json({ error: "Body is required" }); return;
    }
    const state = body.state ?? "draft";
    if (!["draft", "scheduled", "published"].includes(state)) {
      res.status(400).json({ error: "Invalid state" }); return;
    }

    const [feed] = await db
      .select({ id: prayerFeedsTable.id })
      .from(prayerFeedsTable)
      .where(eq(prayerFeedsTable.slug, "phoebe-climate"));
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }

    const publishedAt = state === "published" ? new Date() : null;
    const [row] = await db
      .insert(prayerFeedEntriesTable)
      .values({
        feedId: feed.id,
        entryDate: body.entryDate,
        title: body.title,
        body: body.body,
        scriptureRef: body.scriptureRef ?? null,
        state,
        createdByUserId: userId,
        publishedAt,
      })
      .onConflictDoUpdate({
        target: [prayerFeedEntriesTable.feedId, prayerFeedEntriesTable.entryDate],
        set: {
          title: body.title,
          body: body.body,
          scriptureRef: body.scriptureRef ?? null,
          state,
          updatedAt: new Date(),
          // Stamp publishedAt the first time we go to published; preserve
          // the original timestamp on subsequent edits to a published entry.
          publishedAt: sql`CASE WHEN ${prayerFeedEntriesTable.publishedAt} IS NULL AND ${state === "published"} THEN NOW() ELSE ${prayerFeedEntriesTable.publishedAt} END`,
        },
      })
      .returning();
    res.json({ entry: row });
  } catch (err) {
    res.status(500).json({ error: "Failed to save entry" });
  }
});

// DELETE /api/climate/admin/entries/:date — remove an entry. Idempotent.
router.delete("/climate/admin/entries/:date", requireClimateAdmin, async (req, res): Promise<void> => {
  try {
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const date = req.params.date;
    if (!date || !dateRe.test(date)) {
      res.status(400).json({ error: "Invalid date" }); return;
    }
    const [feed] = await db
      .select({ id: prayerFeedsTable.id })
      .from(prayerFeedsTable)
      .where(eq(prayerFeedsTable.slug, "phoebe-climate"));
    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    await db
      .delete(prayerFeedEntriesTable)
      .where(
        and(
          eq(prayerFeedEntriesTable.feedId, feed.id),
          eq(prayerFeedEntriesTable.entryDate, date),
        ),
      );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

// PATCH /api/climate/onboarding — mark the climate-specific onboarding
// flow complete. Called once after the user finishes the intro slides.
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

export default router;
