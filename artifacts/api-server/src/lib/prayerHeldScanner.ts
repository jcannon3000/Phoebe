import { db, prayerHeldNotificationsTable, usersTable } from "@workspace/db";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { sendHeldInPrayerPush } from "./pushSender";
import { logger } from "./logger";

// Two hours — the batching window. We accumulate amens during this
// window so a burst from morning prayer (where the whole circle prays
// in 15 minutes) becomes a single "Sara and 7 others prayed for you
// today" push rather than 8 separate pings. After this many ms, the
// scanner claims the row and sends.
const BATCH_WINDOW_MS = 2 * 60 * 60 * 1000;

// Upper bound on how old a row may be and still be worth sending. The push is
// a "you've been held in prayer TODAY" digest, so a row older than this is
// stale — e.g. a backlog that built up while the scanner wasn't running. Stale
// rows are still CLAIMED (sent_at stamped) so they never fire and never
// re-process, but no (wrong, days-old) push goes out and no old request gets
// deep-linked. 26h covers a late "today" + the 2h window + timezone spread.
const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

// Run interval — every 10 minutes. The 2-hour window is coarse enough
// that 10 minutes of jitter on the "send" side is invisible to the
// user; ticking more often would just spin the DB for nothing.
const TICK_MS = 10 * 60 * 1000;

// On boot, wait this long before the first run so app startup isn't
// competing with the scanner for DB connections during cold start.
const STARTUP_DELAY_MS = 45_000;

/**
 * Scan for pending held-in-prayer notifications whose 2-hour batching
 * window has elapsed, then send ONE consolidated push per recipient
 * covering all of their requests' rows for today. A user with two
 * active requests that both got amens today gets a single warm ping,
 * not two.
 *
 * After sending we stamp sent_at on every claimed row so they never
 * fire again. Idempotent — a crash mid-loop just means the next tick
 * re-tries unsent rows.
 *
 * Per-recipient failure isolation: a token-invalid push for one user
 * does NOT skip the rest. We catch around each recipient and continue.
 */
export async function runPrayerHeldScan(): Promise<void> {
  const cutoff = new Date(Date.now() - BATCH_WINDOW_MS);

  const pending = await db
    .select({
      id: prayerHeldNotificationsTable.id,
      requestId: prayerHeldNotificationsTable.requestId,
      recipientId: prayerHeldNotificationsTable.recipientId,
      dayKey: prayerHeldNotificationsTable.dayKey,
      firstAmenAt: prayerHeldNotificationsTable.firstAmenAt,
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

  // Group rows by recipient so we can send one combined push per user.
  // A user with two active requests that both got amens today gets a
  // single "Sara and others prayed for your requests today" push
  // instead of one per request.
  const byRecipient = new Map<number, typeof pending>();
  for (const row of pending) {
    const list = byRecipient.get(row.recipientId);
    if (list) list.push(row);
    else byRecipient.set(row.recipientId, [row]);
  }

  logger.info(
    { rows: pending.length, recipients: byRecipient.size },
    "[prayerHeldScanner] sending pending notifications",
  );

  for (const [recipientId, rows] of byRecipient) {
    try {
      // Claim all rows for this recipient atomically — set sent_at
      // before sending so a slow push doesn't get re-fired on the next
      // tick. The WHERE sent_at IS NULL guard means a concurrent
      // instance can't double-claim.
      const ids = rows.map((r) => r.id);
      const claimed = await db
        .update(prayerHeldNotificationsTable)
        .set({ sentAt: new Date() })
        .where(
          and(
            inArray(prayerHeldNotificationsTable.id, ids),
            isNull(prayerHeldNotificationsTable.sentAt),
          ),
        )
        .returning({ id: prayerHeldNotificationsTable.id });

      if (claimed.length === 0) continue;

      // Only send for rows that are still fresh enough to be "today's"
      // prayers. Older rows were claimed above (so they never fire again) but
      // we don't ping with a days-old digest or deep-link to a stale request —
      // the case the user hit when a backlog flushed after the scanner came
      // back up.
      const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
      const freshRows = rows.filter((r) => r.firstAmenAt >= staleBefore);
      if (freshRows.length === 0) continue;

      // The "first" pray-er is the one whose amen kicked off the
      // earliest row of the batch — feels chronologically true and
      // lets the subtitle name a real person rather than a count.
      const sortedByFirstAmen = [...freshRows].sort(
        (a, b) => a.firstAmenAt.getTime() - b.firstAmenAt.getTime(),
      );
      const earliest = sortedByFirstAmen[0];
      const [firstAmenUser] = await db
        .select({ name: usersTable.name, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(eq(usersTable.id, earliest.firstAmenUserId));

      const totalAmens = freshRows.reduce((sum, r) => sum + r.amenCount, 0);
      const requestCount = freshRows.length;
      // dayKey is the same across all rows (we claimed by recipient on
      // the same scanner tick, and the upsert is keyed by day in the
      // recipient's tz). Use any row's dayKey for collapseId.
      const dayKey = earliest.dayKey;

      // The push always deep-links to a single prayer slide showing the
      // faces of who prayed — the same detail view as tapping the
      // prayer-request card. When the batch spans several requests we
      // land on the one with the most amens (the richest "who prayed"
      // wall); ties break to the earliest-prayed request.
      const deepLinkRequest = [...freshRows].sort(
        (a, b) =>
          b.amenCount - a.amenCount ||
          a.firstAmenAt.getTime() - b.firstAmenAt.getTime(),
      )[0];

      await sendHeldInPrayerPush(recipientId, {
        firstAmenName: firstAmenUser?.name || "Someone",
        firstAmenAvatarUrl: firstAmenUser?.avatarUrl ?? null,
        amenCount: totalAmens,
        requestCount,
        prayerRequestId: deepLinkRequest.requestId,
        localYmd: dayKey,
      });
    } catch (err) {
      logger.warn({ err, recipientId }, "[prayerHeldScanner] send failed");
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
