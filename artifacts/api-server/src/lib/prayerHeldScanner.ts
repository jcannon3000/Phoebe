import { db, prayerHeldNotificationsTable, usersTable } from "@workspace/db";
import { and, eq, isNull, lt } from "drizzle-orm";
import { sendHeldInPrayerPush } from "./pushSender";
import { logger } from "./logger";

// Two hours — the batching window. We accumulate amens during this
// window so a burst from morning prayer (where the whole circle prays
// in 15 minutes) becomes a single "Sara and 7 others prayed for you
// today" push rather than 8 separate pings. After this many ms, the
// scanner claims the row and sends.
const BATCH_WINDOW_MS = 2 * 60 * 60 * 1000;

// Run interval — every 10 minutes. The 2-hour window is coarse enough
// that 10 minutes of jitter on the "send" side is invisible to the
// user; ticking more often would just spin the DB for nothing.
const TICK_MS = 10 * 60 * 1000;

// On boot, wait this long before the first run so app startup isn't
// competing with the scanner for DB connections during cold start.
const STARTUP_DELAY_MS = 45_000;

/**
 * Scan for pending held-in-prayer notifications whose 2-hour batching
 * window has elapsed, send a push for each, and stamp sent_at so the
 * row never fires again. Idempotent — a crash mid-loop just means the
 * next tick re-tries the unsent rows.
 *
 * Per-row failure isolation: a token-invalid push for one user does NOT
 * skip the remaining rows. We catch around each send and continue.
 */
export async function runPrayerHeldScan(): Promise<void> {
  const cutoff = new Date(Date.now() - BATCH_WINDOW_MS);

  const pending = await db
    .select({
      id: prayerHeldNotificationsTable.id,
      requestId: prayerHeldNotificationsTable.requestId,
      recipientId: prayerHeldNotificationsTable.recipientId,
      dayKey: prayerHeldNotificationsTable.dayKey,
      firstAmenUserId: prayerHeldNotificationsTable.firstAmenUserId,
      amenCount: prayerHeldNotificationsTable.amenCount,
    })
    .from(prayerHeldNotificationsTable)
    .where(
      and(
        isNull(prayerHeldNotificationsTable.sentAt),
        lt(prayerHeldNotificationsTable.firstAmenAt, cutoff),
      ),
    );

  if (pending.length === 0) return;

  logger.info({ count: pending.length }, "[prayerHeldScanner] sending pending notifications");

  for (const row of pending) {
    try {
      // Claim the row first — set sent_at before sending so a slow push
      // doesn't get re-fired on the next tick. If the push itself fails
      // we log it; better one missed notification than a dupe storm.
      const claimedAt = new Date();
      const claimed = await db
        .update(prayerHeldNotificationsTable)
        .set({ sentAt: claimedAt })
        .where(
          and(
            eq(prayerHeldNotificationsTable.id, row.id),
            isNull(prayerHeldNotificationsTable.sentAt),
          ),
        )
        .returning({ id: prayerHeldNotificationsTable.id });

      // Lost the race — another instance (or a retry) already claimed
      // this row. Skip.
      if (claimed.length === 0) continue;

      // Look up the first pray-er's name for the subtitle.
      const [firstAmenUser] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, row.firstAmenUserId));

      await sendHeldInPrayerPush(row.recipientId, {
        prayerRequestId: row.requestId,
        firstAmenName: firstAmenUser?.name || "Someone",
        amenCount: row.amenCount,
        localYmd: row.dayKey,
      });
    } catch (err) {
      logger.warn({ err, rowId: row.id }, "[prayerHeldScanner] send failed");
    }
  }
}

let tickHandle: ReturnType<typeof setInterval> | null = null;

export function startPrayerHeldScanner(): void {
  if (tickHandle) return;

  setTimeout(() => {
    runPrayerHeldScan().catch((err) =>
      logger.error({ err }, "[prayerHeldScanner] initial run failed"),
    );
  }, STARTUP_DELAY_MS);

  tickHandle = setInterval(() => {
    runPrayerHeldScan().catch((err) =>
      logger.error({ err }, "[prayerHeldScanner] scheduled run failed"),
    );
  }, TICK_MS);
}
