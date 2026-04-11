import { db, sharedMomentsTable, momentUserTokensTable } from "@workspace/db";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { deleteCalendarEvent } from "./calendar";
import { logger } from "./logger";

// Two days, in milliseconds. After a moment's commitmentGoalReachedAt is older
// than this, we treat it as "not renewed" and tear down the recurring calendar
// events for every member of the practice. The user can still renew later;
// they just won't get reminders until they do.
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Cancel recurring calendar events for any practice whose group goal was
 * reached more than 2 days ago and has not been renewed (no Renew flow,
 * no Tend Freely, no extension). For each member of those practices we:
 *
 *   1. Delete their Google Calendar event (so the recurring series stops)
 *   2. Null out their googleCalendarEventId so we don't try again
 *
 * The moment row itself is left untouched apart from a stamp on the cleanup
 * column so we don't process the same moment twice on subsequent runs.
 */
export async function runGoalCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - TWO_DAYS_MS);

  // Find moments that crossed the goal more than 2 days ago and haven't
  // been renewed (commitmentGoalReachedAt still set).
  const stale = await db
    .select()
    .from(sharedMomentsTable)
    .where(
      and(
        isNotNull(sharedMomentsTable.commitmentGoalReachedAt),
        lt(sharedMomentsTable.commitmentGoalReachedAt, cutoff),
      ),
    );

  if (stale.length === 0) return;

  logger.info(
    { count: stale.length },
    "[goalCleanup] removing recurring calendar events for un-renewed goals",
  );

  for (const moment of stale) {
    try {
      const tokens = await db
        .select()
        .from(momentUserTokensTable)
        .where(eq(momentUserTokensTable.momentId, moment.id));

      for (const t of tokens) {
        if (!t.googleCalendarEventId) continue;
        try {
          await deleteCalendarEvent(0, t.googleCalendarEventId);
        } catch (err) {
          logger.warn(
            { err, momentId: moment.id, tokenId: t.id },
            "[goalCleanup] calendar delete failed (non-fatal)",
          );
        }
        await db
          .update(momentUserTokensTable)
          .set({ googleCalendarEventId: null })
          .where(eq(momentUserTokensTable.id, t.id));
      }

      // Stamp the moment so we don't reprocess it. We null out
      // commitmentGoalReachedAt to take it out of the cleanup query;
      // the goal stays reached (sessionsLogged >= sessionsGoal) until
      // the user explicitly renews.
      await db
        .update(sharedMomentsTable)
        .set({ commitmentGoalReachedAt: null })
        .where(eq(sharedMomentsTable.id, moment.id));
    } catch (err) {
      logger.error({ err, momentId: moment.id }, "[goalCleanup] moment cleanup failed");
    }
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start a polling loop that runs runGoalCleanup() every hour. The 2-day
 * window is coarse enough that hourly is overkill, but it makes the feature
 * tolerant of restarts and clock drift without needing real cron infra.
 */
export function startGoalCleanupScheduler(): void {
  if (cleanupInterval) return;

  // Run once at boot (after a small delay so app startup isn't blocked).
  setTimeout(() => {
    runGoalCleanup().catch((err) =>
      logger.error({ err }, "[goalCleanup] initial run failed"),
    );
  }, 30_000);

  cleanupInterval = setInterval(
    () => {
      runGoalCleanup().catch((err) =>
        logger.error({ err }, "[goalCleanup] scheduled run failed"),
      );
    },
    60 * 60 * 1000, // hourly
  );
}
