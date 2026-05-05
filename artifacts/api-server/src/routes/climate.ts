import { Router } from "express";
import {
  db,
  usersTable,
  prayerFeedsTable,
  prayerFeedEntriesTable,
  prayerFeedPrayersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

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

// GET /api/climate/today — today's entry plus this user's prayed status
router.get("/climate/today", requireClimate, async (req, res): Promise<void> => {
  try {
    const userId = (req.user as { id: number }).id;
    const { feed, entry, dayLocal } = await loadTodayContext();

    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }

    let prayedToday = false;
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
    }

    res.json({ entry, prayedToday, dayLocal });
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

// Suppress unused-import warning if drizzle helpers aren't all consumed
// by every code path (defensive — used inline above).
void usersTable;

export default router;
