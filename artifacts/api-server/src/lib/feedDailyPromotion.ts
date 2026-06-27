// Date-programmed prayer feeds → today's live intercession.
//
// A feed's editor programs one (or a few slots) per calendar day in
// prayer_feed_entries (the "what they have that day" model). But the
// subscriber surfaces — /prayer-feeds/today, the queue=feed slideshow, the
// feed detail — all read intercessions from shared_moments. Rather than teach
// every one of those surfaces (and the pray path) about date entries, we
// MIRROR today's programmed entry into a single evergreen moment per (feed,
// slot). The whole existing moment/pray/slideshow stack then shows exactly
// today's intention, and a feed with no entry today simply has its evergreen
// moment archived (falling back to whatever other moments it carries).
//
// Idempotent + cheap: guarded by an in-process per-day cache, and the upsert is
// keyed on a deterministic token so re-runs just refresh the content.
import { db, prayerFeedsTable, prayerFeedEntriesTable, sharedMomentsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { todayInZone } from "./tz";

// feedId → the YYYY-MM-DD this process last promoted, so the work runs at most
// once per feed per local day per process (reads happen far more often).
const promotedToday = new Map<number, string>();

const tokenFor = (feedId: number, slot: number) => `feeddaily:${feedId}:${slot}`;

// Ensure each given feed's evergreen "today" moment reflects today's programmed
// entry. Best-effort: a failure for one feed never blocks the read that called us.
export async function ensureDailyMomentsForFeeds(feedIds: number[]): Promise<void> {
  if (feedIds.length === 0) return;
  const feeds = await db
    .select({ id: prayerFeedsTable.id, timezone: prayerFeedsTable.timezone })
    .from(prayerFeedsTable)
    .where(inArray(prayerFeedsTable.id, feedIds));
  for (const f of feeds) {
    const today = todayInZone(f.timezone || "UTC");
    if (promotedToday.get(f.id) === today) continue;
    try {
      await promoteFeed(f.id, f.timezone || "UTC", today);
      promotedToday.set(f.id, today);
    } catch (err) {
      console.error("[feed-daily] promote failed for feed", f.id, err);
    }
  }
}

async function promoteFeed(feedId: number, timezone: string, today: string): Promise<void> {
  // Today's published, programmed entries (one per slot).
  const entries = await db
    .select({
      slot: prayerFeedEntriesTable.slot,
      title: prayerFeedEntriesTable.title,
      body: prayerFeedEntriesTable.body,
      learnMoreUrl: prayerFeedEntriesTable.learnMoreUrl,
    })
    .from(prayerFeedEntriesTable)
    .where(and(
      eq(prayerFeedEntriesTable.feedId, feedId),
      eq(prayerFeedEntriesTable.entryDate, today),
      eq(prayerFeedEntriesTable.state, "published"),
    ));

  // Existing evergreen moments for this feed (our token namespace only).
  const evergreen = await db
    .select({ id: sharedMomentsTable.id, token: sharedMomentsTable.momentToken, state: sharedMomentsTable.state })
    .from(sharedMomentsTable)
    .where(and(
      eq(sharedMomentsTable.prayerFeedId, feedId),
      sql`${sharedMomentsTable.momentToken} LIKE ${`feeddaily:${feedId}:%`}`,
    ));
  const existingTokens = new Set(evergreen.map((m) => m.token));

  const todaySlots = new Set(entries.map((e) => e.slot));
  const newTokens: string[] = [];

  // Upsert one evergreen moment per programmed slot, carrying today's content.
  for (const e of entries) {
    const token = tokenFor(feedId, e.slot);
    if (!existingTokens.has(token)) newTokens.push(token);
    await db
      .insert(sharedMomentsTable)
      .values({
        prayerFeedId: feedId,
        groupId: null,
        name: e.title,
        intention: e.title,
        intercessionTopic: e.title,
        intercessionFullText: e.body,
        intercessionSource: "custom",
        templateType: "intercession",
        loggingType: "photo",
        frequency: "daily",
        scheduledTime: "08:00",
        timezone,
        windowMinutes: 60,
        goalDays: 365,
        state: "active",
        momentToken: token,
        learnMoreUrl: e.learnMoreUrl ?? null,
        notifySubscribersAt: null,
        publishedByUserId: null,
      })
      .onConflictDoUpdate({
        target: sharedMomentsTable.momentToken,
        set: {
          name: sql`excluded.name`,
          intention: sql`excluded.intention`,
          intercessionTopic: sql`excluded.intercession_topic`,
          intercessionFullText: sql`excluded.intercession_full_text`,
          learnMoreUrl: sql`excluded.learn_more_url`,
          state: sql`excluded.state`,
        },
      });
  }

  // Any evergreen moment whose slot isn't programmed today drops out of the
  // subscriber surfaces (archived), so a gap day shows the feed's other
  // moments / nothing rather than yesterday's stale intention.
  const staleIds = evergreen
    .filter((m) => {
      const slot = Number(m.token.split(":")[2]);
      return !todaySlots.has(slot) && m.state !== "archived";
    })
    .map((m) => m.id);
  if (staleIds.length > 0) {
    await db.update(sharedMomentsTable)
      .set({ state: "archived" })
      .where(inArray(sharedMomentsTable.id, staleIds));
  }

  // Grant subscriber tokens for freshly-created moments so they're prayable.
  if (newTokens.length > 0) {
    try {
      const { reconcileAllPracticesForFeed } = await import("../routes/groups");
      await reconcileAllPracticesForFeed(feedId);
    } catch { /* tokens reconcile on next subscribe */ }
  }
}
