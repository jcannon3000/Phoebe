import {
  db,
  usersTable,
  bellNotificationsTable,
  prayerRequestAmensTable,
  sharedMomentsTable,
  momentUserTokensTable,
  lectioReflectionsTable,
  lectionaryReadingsTable,
} from "@workspace/db";
import { eq, and, gte, ne, sql } from "drizzle-orm";
import { sendBellPush, sendEveningNudgePush, sendLectioReminderPush, sendLectioEveningReminderPush } from "./pushSender";
import { nextSundayDate } from "./rclLectionary";
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
// Push-only. Fires for every user inside the 0-14 minute window past their
// dailyBellTime (default 07:00) in their local timezone. The bell is on by
// default for everyone — if their phone allows notifications, they get it.
// `sendPushToUser` no-ops for users without an active device token, so
// users who haven't installed the app simply don't receive anything.
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
    .from(usersTable);

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

      // Dedup row is inserted ONLY after a successful push. If APNs
      // throws (rare but happens — token rotation, network blip), we
      // leave the slate clean so the next 15-min tick can retry.
      // Inserting on failure means a single transient error silently
      // mutes the user for the rest of the day.
      try {
        await sendBellPush(user.id);
      } catch (err) {
        logger.warn({ err, userId: user.id }, "[bell] push dispatch failed — skipping dedup insert so we retry next tick");
        continue;
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
// Fires for every user inside the 19:00–19:14 window in their local
// timezone, *unless* they've already logged a prayer ("amen") today —
// in that case they've already tended to their practice and the nudge would
// be noise. De-duped via a `"${date}-evening"` row in bell_notifications.

export async function runEveningNudgeSender(): Promise<void> {
  const bellUsers = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      timezone: usersTable.timezone,
    })
    .from(usersTable);

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
        logger.warn({ err, userId: user.id }, "[bell-evening] push dispatch failed — skipping dedup insert so we retry next tick");
        continue;
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

// ─── Lectio Divina stage reminder (Mon/Wed/Fri 09:30 local) ────────────────
//
// Push-only. For every member of an active lectio-divina circle who has a
// Phoebe account (matched by email to usersTable), fires at ~09:30 in the
// user's local timezone on:
//   Monday    → Stage 1 (lectio)
//   Wednesday → Stage 2 (meditatio)
//   Friday    → Stage 3 (oratio)
// Only sends if the user hasn't already submitted that stage this week.
// De-duped via a `bell_notifications` row keyed on
// `${date}-lectio-${momentId}-${stage}` so retries don't double-send.

const LECTIO_DOW_TO_STAGE: Record<number, { stage: "lectio" | "meditatio" | "oratio"; stageNumber: 1 | 2 | 3 }> = {
  1: { stage: "lectio",    stageNumber: 1 },
  3: { stage: "meditatio", stageNumber: 2 },
  5: { stage: "oratio",    stageNumber: 3 },
};

function dowInTz(timezone: string): number {
  try {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
    return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[wd] ?? new Date().getUTCDay();
  } catch {
    return new Date().getUTCDay();
  }
}

export async function runLectioReminderSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  // Pull every membership in any lectio-divina moment, joined to the
  // matching registered user (by email). Email-only invitees with no
  // account get skipped — pushes need a userId to resolve device tokens.
  const memberships = await db
    .select({
      userId: usersTable.id,
      userEmail: usersTable.email,
      userTimezone: usersTable.timezone,
      personalTimezone: momentUserTokensTable.personalTimezone,
      momentId: sharedMomentsTable.id,
      momentToken: sharedMomentsTable.momentToken,
      momentName: sharedMomentsTable.name,
      momentTimezone: sharedMomentsTable.timezone,
      userToken: momentUserTokensTable.userToken,
    })
    .from(momentUserTokensTable)
    .innerJoin(sharedMomentsTable, eq(sharedMomentsTable.id, momentUserTokensTable.momentId))
    .innerJoin(usersTable, eq(usersTable.email, momentUserTokensTable.email))
    .where(
      and(
        eq(sharedMomentsTable.templateType, "lectio-divina"),
        eq(sharedMomentsTable.state, "active"),
      ),
    );

  if (memberships.length === 0) return;

  // Cache the Sunday's reading once per tick — every member of every
  // circle keys off the same upcoming-Sunday date, and the lectionary
  // table is small but the lookup repeats per row otherwise.
  const sundayDateObj = nextSundayDate();
  const sundayStr = sundayDateObj.toISOString().slice(0, 10);
  const [reading] = await db
    .select({ gospelReference: lectionaryReadingsTable.gospelReference })
    .from(lectionaryReadingsTable)
    .where(eq(lectionaryReadingsTable.sundayDate, sundayStr));
  if (!reading) {
    logger.warn({ sundayStr }, "[lectio-reminder] no lectionary reading cached yet — skipping run");
    return;
  }
  const gospelReference = reading.gospelReference;

  for (const m of memberships) {
    try {
      // Prefer the per-circle override, then the user's account TZ, then
      // the moment's TZ, then NY (matches sendBellPush behavior).
      const tz = m.personalTimezone ?? m.userTimezone ?? m.momentTimezone ?? "America/New_York";

      const dow = dowInTz(tz);
      const stageInfo = LECTIO_DOW_TO_STAGE[dow];
      if (!stageInfo) continue;

      // Fire any time at-or-after 9:30 local on the stage day. The
      // dedup row below guarantees once-per-user-per-day, so a missed
      // tick (server restart, GC pause, late deploy) self-heals on the
      // next 15-min cycle instead of silently swallowing the day.
      if (!opts.forceNow) {
        const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
        if ((nowH * 60 + nowM) < (9 * 60 + 30)) continue;
      }

      const todayStr = todayDateInTz(tz);
      const dedupKey = `${todayStr}-lectio-${m.momentId}-${stageInfo.stage}`;

      if (!opts.forceNow) {
        const [existing] = await db
          .select()
          .from(bellNotificationsTable)
          .where(
            and(
              eq(bellNotificationsTable.userId, m.userId),
              eq(bellNotificationsTable.bellDate, dedupKey),
            ),
          );
        if (existing) continue;
      }

      // Skip if the user already submitted this stage for this week.
      const [existingReflection] = await db
        .select({ id: lectioReflectionsTable.id })
        .from(lectioReflectionsTable)
        .where(
          and(
            eq(lectioReflectionsTable.momentId, m.momentId),
            eq(lectioReflectionsTable.sundayDate, sundayStr),
            eq(lectioReflectionsTable.userToken, m.userToken),
            eq(lectioReflectionsTable.stage, stageInfo.stage),
          ),
        );
      if (existingReflection) continue;

      try {
        await sendLectioReminderPush(m.userId, {
          momentToken: m.momentToken,
          userToken: m.userToken,
          momentId: m.momentId,
          stageNumber: stageInfo.stageNumber,
          gospelReference,
          communityName: m.momentName,
          sundayDate: sundayStr,
          stage: stageInfo.stage,
        });
      } catch (err) {
        logger.warn({ err, userId: m.userId, momentId: m.momentId, stage: stageInfo.stage }, "[lectio-reminder] push dispatch failed — skipping dedup insert so we retry next tick");
        continue;
      }

      await db.insert(bellNotificationsTable).values({
        userId: m.userId,
        bellDate: dedupKey,
        sentAt: new Date(),
      });

      logger.info({ userId: m.userId, momentId: m.momentId, stage: stageInfo.stage, dedupKey }, "[lectio-reminder] sent stage reminder");
    } catch (err) {
      logger.error({ err, userId: m.userId, momentId: m.momentId }, "[lectio-reminder] member processing failed");
    }
  }
}

// ─── Lectio Divina evening catch-up (Tue/Thu/Sat 19:30 local) ──────────────
//
// Day-after nudge for circle members who missed the morning reminder. Maps
// the prior morning's stage day → today: Tue covers Mon's Stage 1, Thu
// covers Wed's Stage 2, Sat covers Fri's Stage 3. Same Sunday's reading
// applies (nextSundayDate is unchanged Mon→Sat). Copy branches on the
// number of *other* circle members who have already submitted that stage
// this week — the count is the social pull ("Join 4 others…"); zero
// flips to first-mover framing ("Join {community} for Lectio Divina").
//
// De-dup key is distinct from the morning push so missing the morning
// doesn't suppress the evening, and vice versa.

const LECTIO_EVENING_DOW_TO_STAGE: Record<number, { stage: "lectio" | "meditatio" | "oratio"; stageNumber: 1 | 2 | 3 }> = {
  2: { stage: "lectio",    stageNumber: 1 },
  4: { stage: "meditatio", stageNumber: 2 },
  6: { stage: "oratio",    stageNumber: 3 },
};

export async function runLectioEveningReminderSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  const memberships = await db
    .select({
      userId: usersTable.id,
      userEmail: usersTable.email,
      userTimezone: usersTable.timezone,
      personalTimezone: momentUserTokensTable.personalTimezone,
      momentId: sharedMomentsTable.id,
      momentToken: sharedMomentsTable.momentToken,
      momentName: sharedMomentsTable.name,
      momentTimezone: sharedMomentsTable.timezone,
      userToken: momentUserTokensTable.userToken,
    })
    .from(momentUserTokensTable)
    .innerJoin(sharedMomentsTable, eq(sharedMomentsTable.id, momentUserTokensTable.momentId))
    .innerJoin(usersTable, eq(usersTable.email, momentUserTokensTable.email))
    .where(
      and(
        eq(sharedMomentsTable.templateType, "lectio-divina"),
        eq(sharedMomentsTable.state, "active"),
      ),
    );

  if (memberships.length === 0) return;

  const sundayDateObj = nextSundayDate();
  const sundayStr = sundayDateObj.toISOString().slice(0, 10);
  const [reading] = await db
    .select({ gospelReference: lectionaryReadingsTable.gospelReference })
    .from(lectionaryReadingsTable)
    .where(eq(lectionaryReadingsTable.sundayDate, sundayStr));
  if (!reading) {
    logger.warn({ sundayStr }, "[lectio-evening] no lectionary reading cached yet — skipping run");
    return;
  }
  const gospelReference = reading.gospelReference;

  // (momentId, stage) → number of distinct userTokens with a reflection
  // submitted this week. Cached per tick so we don't re-COUNT for every
  // member of the same circle.
  const completionCache = new Map<string, number>();
  async function othersCompleted(momentId: number, stage: string, exceptUserToken: string): Promise<number> {
    const cacheKey = `${momentId}-${stage}`;
    let total = completionCache.get(cacheKey);
    if (total === undefined) {
      const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(lectioReflectionsTable)
        .where(
          and(
            eq(lectioReflectionsTable.momentId, momentId),
            eq(lectioReflectionsTable.sundayDate, sundayStr),
            eq(lectioReflectionsTable.stage, stage),
          ),
        );
      total = Number(row?.c ?? 0);
      completionCache.set(cacheKey, total);
    }
    // Subtract one if the recipient themselves has reflected — they
    // shouldn't be counted in their own "others" tally. We check
    // separately rather than filtering in SQL to keep the cache shared
    // across recipients in the same circle.
    const [self] = await db
      .select({ id: lectioReflectionsTable.id })
      .from(lectioReflectionsTable)
      .where(
        and(
          eq(lectioReflectionsTable.momentId, momentId),
          eq(lectioReflectionsTable.sundayDate, sundayStr),
          eq(lectioReflectionsTable.stage, stage),
          eq(lectioReflectionsTable.userToken, exceptUserToken),
        ),
      );
    return self ? Math.max(0, total - 1) : total;
  }

  for (const m of memberships) {
    try {
      const tz = m.personalTimezone ?? m.userTimezone ?? m.momentTimezone ?? "America/New_York";

      const dow = dowInTz(tz);
      const stageInfo = LECTIO_EVENING_DOW_TO_STAGE[dow];
      if (!stageInfo) continue;

      // Fire any time at-or-after 19:30 local on the catch-up day. The
      // dedup row below ensures once-per-user-per-day so a missed tick
      // doesn't drop the reminder for the entire evening.
      if (!opts.forceNow) {
        const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
        if ((nowH * 60 + nowM) < (19 * 60 + 30)) continue;
      }

      const todayStr = todayDateInTz(tz);
      const dedupKey = `${todayStr}-lectio-evening-${m.momentId}-${stageInfo.stage}`;

      if (!opts.forceNow) {
        const [existing] = await db
          .select()
          .from(bellNotificationsTable)
          .where(
            and(
              eq(bellNotificationsTable.userId, m.userId),
              eq(bellNotificationsTable.bellDate, dedupKey),
            ),
          );
        if (existing) continue;
      }

      // Skip if the user already did this stage — the catch-up is for
      // people who haven't, period.
      const [existingReflection] = await db
        .select({ id: lectioReflectionsTable.id })
        .from(lectioReflectionsTable)
        .where(
          and(
            eq(lectioReflectionsTable.momentId, m.momentId),
            eq(lectioReflectionsTable.sundayDate, sundayStr),
            eq(lectioReflectionsTable.userToken, m.userToken),
            eq(lectioReflectionsTable.stage, stageInfo.stage),
          ),
        );
      if (existingReflection) continue;

      const othersCount = await othersCompleted(m.momentId, stageInfo.stage, m.userToken);

      try {
        await sendLectioEveningReminderPush(m.userId, {
          momentToken: m.momentToken,
          userToken: m.userToken,
          momentId: m.momentId,
          stageNumber: stageInfo.stageNumber,
          gospelReference,
          communityName: m.momentName,
          sundayDate: sundayStr,
          stage: stageInfo.stage,
          othersCompletedCount: othersCount,
        });
      } catch (err) {
        logger.warn({ err, userId: m.userId, momentId: m.momentId, stage: stageInfo.stage }, "[lectio-evening] push dispatch failed — skipping dedup insert so we retry next tick");
        continue;
      }

      await db.insert(bellNotificationsTable).values({
        userId: m.userId,
        bellDate: dedupKey,
        sentAt: new Date(),
      });

      logger.info({ userId: m.userId, momentId: m.momentId, stage: stageInfo.stage, othersCount, dedupKey }, "[lectio-evening] sent evening reminder");
    } catch (err) {
      logger.error({ err, userId: m.userId, momentId: m.momentId }, "[lectio-evening] member processing failed");
    }
  }
}

void sql;
void ne;

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
    runLectioReminderSender().catch((err) =>
      logger.error({ err }, "[lectio-reminder] initial run failed"),
    );
    runLectioEveningReminderSender().catch((err) =>
      logger.error({ err }, "[lectio-evening] initial run failed"),
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
      runLectioReminderSender().catch((err) =>
        logger.error({ err }, "[lectio-reminder] scheduled run failed"),
      );
      runLectioEveningReminderSender().catch((err) =>
        logger.error({ err }, "[lectio-evening] scheduled run failed"),
      );
    },
    15 * 60 * 1000,
  );
}
