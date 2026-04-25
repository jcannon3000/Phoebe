import { db, usersTable, bellNotificationsTable, prayerRequestAmensTable } from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { sendBellPush, sendEveningNudgePush } from "./pushSender";
import { logger } from "./logger";

// ─── Timezone helpers ───────────────────────────────────────────────────────

function getCurrentTimeInTz(timezone: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(new Date());
    const hour = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
    const minute = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
    return { hour: isNaN(hour) ? 0 : hour, minute: isNaN(minute) ? 0 : minute };
  } catch {
    const now = new Date();
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
  }
}

function todayDateInTz(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ─── Main bell sender ───────────────────────────────────────────────────────
//
// Push-only. Fires for any user with bellEnabled = true inside the 0-14
// minute window past their dailyBellTime in their local timezone.
// De-duped via a `bell_notifications` row keyed on (userId, todayStr).
// `forceNow: true` bypasses both the time-window check and the dedup —
// used by the /api/bell/fire-now debug endpoint.

export async function runBellSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  const bellUsers = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      dailyBellTime: usersTable.dailyBellTime,
      timezone: usersTable.timezone,
    })
    .from(usersTable)
    .where(eq(usersTable.bellEnabled, true));

  if (bellUsers.length === 0) return;

  for (const user of bellUsers) {
    try {
      const tz = user.timezone ?? "America/New_York";
      const bellTime = user.dailyBellTime ?? "07:00";
      const todayStr = todayDateInTz(tz);

      if (!opts.forceNow) {
        const [existing] = await db
          .select()
          .from(bellNotificationsTable)
          .where(
            and(
              eq(bellNotificationsTable.userId, user.id),
              eq(bellNotificationsTable.bellDate, todayStr),
            ),
          );
        if (existing) continue;

        const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
        const [bellH, bellM] = bellTime.split(":").map(Number);
        const diff = (nowH * 60 + nowM) - (bellH * 60 + bellM);
        if (diff < 0 || diff >= 15) continue;
      }

      try {
        await sendBellPush(user.id);
      } catch (err) {
        logger.warn({ err, userId: user.id }, "[bell] push dispatch failed");
      }

      await db.insert(bellNotificationsTable).values({
        userId: user.id,
        bellDate: todayStr,
        sentAt: new Date(),
      });

      logger.info({ userId: user.id, bellDate: todayStr }, "[bell] sent daily bell");
    } catch (err) {
      logger.error({ err, userId: user.id }, "[bell] user bell processing failed");
    }
  }
}

// ─── Evening nudge (7 PM local, push-only, skip if prayed today) ────────────
//
// Fires for any bellEnabled user inside the 19:00–19:14 window in their
// local timezone, *unless* they've already logged a prayer ("amen") today —
// in that case they've already tended to their practice and the nudge would
// be noise. De-duped via a `"${date}-evening"` row in bell_notifications.

export async function runEveningNudgeSender(): Promise<void> {
  const bellUsers = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      timezone: usersTable.timezone,
    })
    .from(usersTable)
    .where(eq(usersTable.bellEnabled, true));

  if (bellUsers.length === 0) return;

  for (const user of bellUsers) {
    try {
      const tz = user.timezone ?? "America/New_York";

      const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
      if (nowH !== 19 || nowM >= 15) continue;

      const todayStr = todayDateInTz(tz);
      const eveningKey = `${todayStr}-evening`;

      const [existing] = await db
        .select()
        .from(bellNotificationsTable)
        .where(
          and(
            eq(bellNotificationsTable.userId, user.id),
            eq(bellNotificationsTable.bellDate, eveningKey),
          ),
        );
      if (existing) continue;

      // Skip if they've already prayed today.
      const sinceUtc = new Date(`${todayStr}T00:00:00Z`);
      sinceUtc.setUTCHours(sinceUtc.getUTCHours() - 14);
      const recent = await db
        .select({ prayedAt: prayerRequestAmensTable.prayedAt })
        .from(prayerRequestAmensTable)
        .where(
          and(
            eq(prayerRequestAmensTable.userId, user.id),
            gte(prayerRequestAmensTable.prayedAt, sinceUtc),
          ),
        );
      const prayedToday = recent.some((r) => {
        if (!r.prayedAt) return false;
        const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(r.prayedAt);
        return ymd === todayStr;
      });
      if (prayedToday) continue;

      try {
        await sendEveningNudgePush(user.id);
      } catch (err) {
        logger.warn({ err, userId: user.id }, "[bell-evening] push dispatch failed");
      }

      await db.insert(bellNotificationsTable).values({
        userId: user.id,
        bellDate: eveningKey,
        sentAt: new Date(),
      });

      logger.info({ userId: user.id, eveningKey }, "[bell-evening] sent evening nudge");
    } catch (err) {
      logger.error({ err, userId: user.id }, "[bell-evening] user processing failed");
    }
  }
}

void sql;

// ─── Scheduler ──────────────────────────────────────────────────────────────

let bellInterval: ReturnType<typeof setInterval> | null = null;

export function startBellScheduler(): void {
  if (bellInterval) return;
  logger.info("[bell-scheduler] started — first run in 45s, then every 15 min");

  setTimeout(() => {
    runBellSender().catch((err) =>
      logger.error({ err }, "[bell] initial run failed"),
    );
    runEveningNudgeSender().catch((err) =>
      logger.error({ err }, "[bell-evening] initial run failed"),
    );
  }, 45_000);

  bellInterval = setInterval(
    () => {
      runBellSender().catch((err) =>
        logger.error({ err }, "[bell] scheduled run failed"),
      );
      runEveningNudgeSender().catch((err) =>
        logger.error({ err }, "[bell-evening] scheduled run failed"),
      );
    },
    15 * 60 * 1000,
  );
}
