import {
  db,
  usersTable,
  bellNotificationsTable,
  prayerRequestAmensTable,
  prayerRequestsTable,
  prayerSessionsTable,
  sharedMomentsTable,
  momentUserTokensTable,
  lectioReflectionsTable,
  lectionaryReadingsTable,
  prayerFeedsTable,
  meetupsTable,
  ritualsTable,
  groupMembersTable,
  groupsTable,
  actionsTable,
  betaUsersTable,
  prayerFeedSubscriptionsTable,
  prayerFeedEventsTable,
} from "@workspace/db";
import { eq, and, gte, ne, sql, isNull, inArray, isNotNull } from "drizzle-orm";
import {
  sendBellPush,
  sendEveningNudgePush,
  sendLectioReminderPush,
  sendLectioEveningReminderPush,
  sendPrayerRenewalNudgePush,
  sendParishOfficeReminderPush,
  sendParishEveningRecapPush,
  sendGatheringTomorrowPush,
  sendFeedEventTomorrowPush,
  sendSundayReflectionPush,
  sendNewFeedIntercessionPush,
  sendActionReminderPush,
  sendWeeklyDigestPush,
  sendParishWeeklyRecapPush,
} from "./pushSender";
import { nextSundayDate, getReadingForSunday } from "./rclLectionary";
import { getGardenUserIds } from "./garden";
import { logger } from "./logger";
import { PHOEBE_PARISH_ENABLED } from "./parishFlag";
import { loadFeedDigest } from "./feedDigest";
import { sendWeeklyDigestEmail } from "./email";

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
// Push-only. Fires for every user at 09:00 local in their timezone — the
// first of two daily nudges (09:00 / 20:00). This morning slot fires
// unconditionally; the evening slot is gentler and skips users who have
// already prayed today. The midday (14:00) slot was removed per user
// direction — two nudges felt right; three was noisy. The time is global — the
// per-user `dailyBellTime` column is still in the schema for now but is
// no longer read here. The bell is on by default for everyone;
// `sendPushToUser` no-ops for users without an active device token, so
// users who haven't installed the app simply don't receive anything.
// De-duped via a `bell_notifications` row keyed on (userId, todayStr).
// `forceNow: true` bypasses both the time-window check and the dedup —
// used by the /api/bell/fire-now debug endpoint.
//
// Deep-links to /prayer-chooser, the time-of-day picker (Community
// Intercessions / Devotion / Office) — landing the user on the
// "choose how to pray today" screen rather than dropping straight
// into the slideshow.

const DAILY_BELL_HOUR = 9;
const DAILY_BELL_MINUTE = 0;

export async function runBellSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  // The 9 AM daily bell is OFF per user direction. The scheduled
  // 15-min tick calls this without `forceNow`, so it returns
  // immediately and no morning push goes out. `forceNow` callers
  // (the /api/bell/fire-now debug endpoint) still run end-to-end so
  // the path stays testable, and flipping this guard re-enables the
  // bell for everyone.
  if (!opts.forceNow) return;

  // Single bell for all users now. Climate-enrolled users used to be
  // disjoined here so a parallel runClimateDailySender could fire a
  // climate-themed push at the same slot, but Phoebe Climate has
  // collapsed back into the regular dashboard / prayer-mode flow:
  // climate users see feed-scoped intercessions in their normal slideshow,
  // so the regular morning bell is the right (and only) push to fire.
  //
  // Skip users who have set their OWN office reminder (Reminders pill
  // in Settings → parish_office_morning_pref / parish_office_evening_pref
  // != 'none'). They already get sendParishOfficeReminderPush at their
  // chosen time downstream; the 9 AM bell would be a duplicate.
  const bellUsers = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      timezone: usersTable.timezone,
    })
    .from(usersTable)
    .where(and(
      sql`(${usersTable.parishOfficeMorningPref} IS NULL OR ${usersTable.parishOfficeMorningPref} = 'none')`,
      sql`(${usersTable.parishOfficeEveningPref} IS NULL OR ${usersTable.parishOfficeEveningPref} = 'none')`,
    ));

  if (bellUsers.length === 0) return;

  for (const user of bellUsers) {
    try {
      const tz = user.timezone ?? "America/New_York";
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
        const diff = (nowH * 60 + nowM) - (DAILY_BELL_HOUR * 60 + DAILY_BELL_MINUTE);
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

// ─── Day-call sender (evening 20:00) ───────────────────────────────────────
//
// One follow-up nudge that gently re-invites a user back to prayer if the
// 07:00 morning bell didn't catch them. Fires inside its 15-minute window
// (so the cron tick at any minute lands a single send), skips users who
// have already prayed today (any amen tap that day in the user's
// timezone is enough), and dedups via a slot-keyed `bell_notifications`
// row so a refire on the next tick can't double-send. The morning bell
// fires unconditionally because it's the wake-up call; this one is
// softer because it's catching people who missed it. (A midday 14:00
// nudge used to live here too; it was removed per user direction —
// the morning bell + evening catch-up was the rhythm they wanted.)

async function runDayCallSender(opts: {
  hour: number;
  slotKey: "evening";
  logTag: string;
}): Promise<void> {
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
      if (nowH !== opts.hour || nowM >= 15) continue;

      const todayStr = todayDateInTz(tz);
      const slotBellDate = `${todayStr}-${opts.slotKey}`;

      const [existing] = await db
        .select()
        .from(bellNotificationsTable)
        .where(
          and(
            eq(bellNotificationsTable.userId, user.id),
            eq(bellNotificationsTable.bellDate, slotBellDate),
          ),
        );
      if (existing) continue;

      // Skip if they've already prayed today (any amen in user-tz).
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

      // Social-proof copy: "Join N people from your community who have
      // prayed together today." Garden = group peers + letter
      // correspondents (the same visibility set that drives the
      // recipient's prayer-list feed). We count DISTINCT garden user
      // IDs that have at least one amen logged today in the
      // recipient's tz. If nobody has prayed yet, skip the push
      // entirely — "Join 0 people" reads broken, and the social
      // signal is the whole point of this nudge.
      const gardenIds = await getGardenUserIds(user.id);
      let communityPrayerCount = 0;
      if (gardenIds.length > 0) {
        const gardenAmens = await db
          .select({ userId: prayerRequestAmensTable.userId, prayedAt: prayerRequestAmensTable.prayedAt })
          .from(prayerRequestAmensTable)
          .where(
            and(
              inArray(prayerRequestAmensTable.userId, gardenIds),
              gte(prayerRequestAmensTable.prayedAt, sinceUtc),
            ),
          );
        const distinctTodayUsers = new Set<number>();
        for (const r of gardenAmens) {
          if (!r.prayedAt) continue;
          const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(r.prayedAt);
          if (ymd === todayStr) distinctTodayUsers.add(r.userId);
        }
        communityPrayerCount = distinctTodayUsers.size;
      }
      if (communityPrayerCount === 0) {
        // No social signal yet — don't fire the evening nudge today.
        // The morning bell already pinged this user; this slot is
        // purely a community-prayed-together invitation.
        continue;
      }

      try {
        await sendEveningNudgePush(user.id, communityPrayerCount);
      } catch (err) {
        logger.warn({ err, userId: user.id, slot: opts.slotKey }, `${opts.logTag} push dispatch failed — skipping dedup insert so we retry next tick`);
        continue;
      }

      await db.insert(bellNotificationsTable).values({
        userId: user.id,
        bellDate: slotBellDate,
        sentAt: new Date(),
      });

      logger.info({ userId: user.id, slot: opts.slotKey, slotBellDate }, `${opts.logTag} sent`);
    } catch (err) {
      logger.error({ err, userId: user.id, slot: opts.slotKey }, `${opts.logTag} user processing failed`);
    }
  }
}

export async function runEveningNudgeSender(): Promise<void> {
  // The 8 PM evening nudge is OFF per user direction — the only
  // daily-prayer pushes that should fire are the office / devotion
  // reminders each user sets for themselves in Settings (those run
  // in runParishOfficeReminderSender, untouched). To re-enable the
  // catch-up nudge, restore the call:
  //   return runDayCallSender({ hour: 20, slotKey: "evening", logTag: "[bell-evening]" });
}
// Keep runDayCallSender referenced while the evening nudge is off so
// the unused-symbol check stays quiet (same idiom as `void sql` below).
void runDayCallSender;

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

// `forceNow` skips the time-window and dedup gates so an admin debug
// endpoint can fire a missed tick. `bypassReflectionGate` *additionally*
// skips the "this user has already submitted that stage this week" gate,
// for verifying push delivery end-to-end without having to delete the
// reflection row first. Default is the safe behavior that production
// uses on every tick.
export async function runLectioReminderSender(
  opts: { forceNow?: boolean; bypassReflectionGate?: boolean } = {},
): Promise<void> {
  // Lectio reminder pushes are OFF per user direction — the lectio
  // surface is reachable from the home and direct deep-links and
  // doesn't need its own daily nudge. forceNow callers (manual
  // triggers from the admin endpoint) still go through, so the
  // path remains testable. Flip this guard to re-enable.
  if (!opts.forceNow) {
    logger.info("[lectio-reminder] disabled — skipping run");
    return;
  }
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
    // Case-insensitive email join. moment_user_tokens.email is inserted
    // verbatim from invite payloads (sometimes mixed-case) while
    // users.email is normalized to lowercase on signup, so a strict
    // equality join silently dropped invitees whose casing didn't match.
    .innerJoin(usersTable, sql`LOWER(${usersTable.email}) = LOWER(${momentUserTokensTable.email})`)
    .where(
      and(
        eq(sharedMomentsTable.templateType, "lectio-divina"),
        eq(sharedMomentsTable.state, "active"),
      ),
    );

  if (memberships.length === 0) return;

  // Cache the Sunday's reading once per tick — every member of every
  // circle keys off the same upcoming-Sunday date. Use getReadingForSunday
  // (NOT a raw DB query) so we fall back to bundled seed data when the
  // lectionary_readings row hasn't been populated yet — otherwise the
  // entire run aborts and NO member of ANY lectio circle gets a push.
  // That's the bug we shipped originally: dashboard worked because it
  // used the helper, the cron didn't.
  const sundayDateObj = nextSundayDate();
  const sundayStr = sundayDateObj.toISOString().slice(0, 10);
  let gospelReference: string | null = null;
  try {
    const reading = await getReadingForSunday(sundayDateObj);
    gospelReference = reading.gospelReference;
  } catch (err) {
    logger.warn({ err, sundayStr }, "[lectio-reminder] reading lookup failed — skipping run");
    return;
  }
  if (!gospelReference) {
    logger.warn({ sundayStr }, "[lectio-reminder] reading has no gospelReference — skipping run");
    return;
  }

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
      // Admin debug callers can pass `bypassReflectionGate: true` to
      // verify delivery without first deleting the reflection row.
      if (!opts.bypassReflectionGate) {
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
      }

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
  // Evening lectio reminder also off — same rationale as the morning
  // sender above: lectio surfaces are reachable from home + deep
  // links, no need for its own nudge.
  if (!opts.forceNow) {
    logger.info("[lectio-evening-reminder] disabled — skipping run");
    return;
  }
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
    // Same case-insensitive join as runLectioReminderSender — see note there.
    .innerJoin(usersTable, sql`LOWER(${usersTable.email}) = LOWER(${momentUserTokensTable.email})`)
    .where(
      and(
        eq(sharedMomentsTable.templateType, "lectio-divina"),
        eq(sharedMomentsTable.state, "active"),
      ),
    );

  if (memberships.length === 0) return;

  // Same fallback story as runLectioReminderSender — use the helper so
  // we don't bail when only seed data exists for this Sunday.
  const sundayDateObj = nextSundayDate();
  const sundayStr = sundayDateObj.toISOString().slice(0, 10);
  let gospelReference: string | null = null;
  try {
    const reading = await getReadingForSunday(sundayDateObj);
    gospelReference = reading.gospelReference;
  } catch (err) {
    logger.warn({ err, sundayStr }, "[lectio-evening] reading lookup failed — skipping run");
    return;
  }
  if (!gospelReference) {
    logger.warn({ sundayStr }, "[lectio-evening] reading has no gospelReference — skipping run");
    return;
  }

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

// ─── Prayer-request renewal nudge (8pm on the last day) ────────────────────
//
// Fires once per active prayer request at 20:00 owner-local on the last
// calendar day of the request's lifetime — i.e. expiresAt's calendar
// date in the owner's tz equals today's calendar date. Push body names
// the running amen count so the owner sees that what they shared has
// been carried before deciding whether to renew or release. Dedup is
// via the `renewal_nudge_sent_at` column on prayer_requests, stamped
// on successful push dispatch.
//
// 20:00 owner-local mirrors the evening-nudge cadence: a single calm
// end-of-day prompt, not a daytime interruption.
const RENEWAL_NUDGE_HOUR = 20;
const RENEWAL_NUDGE_MINUTE = 0;
export async function runPrayerRenewalNudgeSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  // Pull every active, unstamped, not-yet-released request with an
  // expiresAt set. We project the expiry into each owner's local tz
  // below and only fire when the calendar-date diff is exactly 1.
  const candidates = await db
    .select({
      id: prayerRequestsTable.id,
      ownerId: prayerRequestsTable.ownerId,
      expiresAt: prayerRequestsTable.expiresAt,
      ownerTimezone: usersTable.timezone,
    })
    .from(prayerRequestsTable)
    .innerJoin(usersTable, eq(usersTable.id, prayerRequestsTable.ownerId))
    .where(
      and(
        isNull(prayerRequestsTable.closedAt),
        isNull(prayerRequestsTable.renewalNudgeSentAt),
        eq(prayerRequestsTable.isAnswered, false),
        sql`${prayerRequestsTable.expiresAt} IS NOT NULL`,
      ),
    );

  if (candidates.length === 0) return;

  for (const c of candidates) {
    try {
      const tz = c.ownerTimezone ?? "America/New_York";
      const expiresAt = c.expiresAt;
      if (!expiresAt) continue;

      // Time gate (skip if forced) — fire only at/after 20:00 local so
      // the nudge lands as a calm end-of-day prompt, not midday.
      if (!opts.forceNow) {
        const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
        if ((nowH * 60 + nowM) < (RENEWAL_NUDGE_HOUR * 60 + RENEWAL_NUDGE_MINUTE)) continue;
      }

      // Calendar-day diff in the owner's tz. We extract YYYY-MM-DD
      // strings on both sides so DST and TZ offsets don't slip the
      // boundary. Diff is computed by parsing the two strings as UTC
      // midnights — the strings come from the same tz formatter so the
      // arithmetic is purely about calendar days.
      const todayStr = todayDateInTz(tz);
      const expiryStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(expiresAt);
      const todayUtc = Date.parse(`${todayStr}T00:00:00Z`);
      const expiryUtc = Date.parse(`${expiryStr}T00:00:00Z`);
      const dayDiff = Math.round((expiryUtc - todayUtc) / 86_400_000);
      // dayDiff === 0 → expiresAt is today in owner-tz, i.e. this is
      // the last day of the request's lifetime. Combined with the 20:00
      // gate above, the nudge lands ~evening of the final day.
      if (!opts.forceNow && dayDiff !== 0) continue;

      // Pull the amen count to put a number in the push body. Throttled
      // POST means each row is an eligible amen; total count is just
      // COUNT(*).
      const amenRows = await db
        .select({ id: prayerRequestAmensTable.id })
        .from(prayerRequestAmensTable)
        .where(eq(prayerRequestAmensTable.requestId, c.id));
      const amenCountTotal = amenRows.length;

      try {
        await sendPrayerRenewalNudgePush(c.ownerId, {
          prayerRequestId: c.id,
          amenCountTotal,
        });
      } catch (err) {
        logger.warn({ err, requestId: c.id, ownerId: c.ownerId }, "[renewal-nudge] push dispatch failed — skipping stamp so we retry next tick");
        continue;
      }

      // Stamp once the push lands so we don't re-fire on the next 15-min
      // tick. A renewal clears this column server-side so subsequent
      // cycles get their own nudge.
      await db.update(prayerRequestsTable)
        .set({ renewalNudgeSentAt: new Date() })
        .where(eq(prayerRequestsTable.id, c.id));

      logger.info({ requestId: c.id, ownerId: c.ownerId, amenCountTotal }, "[renewal-nudge] sent");
    } catch (err) {
      logger.error({ err, requestId: c.id }, "[renewal-nudge] processing failed");
    }
  }
}

// ─── Phoebe Parish — office reminder push ──────────────────────────────────
//
// Runs every 15 minutes alongside the other bell-style senders. Fires
// per-user pushes when:
//   • the user is in the parish-only tier (parish_feed_id set)
//   • their pref for this side of the day isn't "none"
//   • their parish's local time is within ±15min of the chosen reminder
//     hour (default 07:00 morning, fixed 18:00 evening for v1)
//   • we haven't already fired this side's push today (idempotent via
//     parish_office_*_sent_date)
//
// Push deep-links straight into the chosen liturgy via
// sendParishOfficeReminderPush.

function todayInZone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Default morning hour when the user hasn't set parish_office_morning_time.
// 07:00 lines up with the existing daily-prayer bell default.
const DEFAULT_MORNING_TIME = "07:00";
// Fixed evening reminder hour. Could be made configurable later but
// the v1 spec is "evening = 18:00 in parish TZ".
const FIXED_EVENING_TIME = "18:00";

// ±15 min window around the target time — matches the bell scheduler
// tick rate, so a single tick that lands within the window fires
// exactly once.
function isWithinTickWindow(
  parishTz: string,
  targetHHMM: string,
): boolean {
  const [hStr, mStr] = targetHHMM.split(":");
  const target = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
  const { hour, minute } = getCurrentTimeInTz(parishTz);
  const now = hour * 60 + minute;
  return Math.abs(now - target) <= 15;
}

// (Removed: an OFFICE_REMINDERS_ENABLED env-var kill switch that
// gated the office-reminder fan-out until the App Store rollout
// completed. The new app is live on the App Store and every user
// now has the in-app Settings → Daily reminders surface to opt
// out — the gate has done its job and the cron should fan reminders
// out to anyone with a non-"none" morning or evening pref.)

export async function runParishOfficeReminderSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  // Generalized — fires for any user with at least one non-"none"
  // office pref, regardless of whether they're in a parish. The
  // column names still carry the parish_office_ prefix because they
  // were originally added for the parish tier; renaming them would
  // be a migration cost we don't need yet. Functionally these are
  // the user's office-reminder prefs full stop. When a parish is
  // attached we use parish title + timezone in the push; otherwise
  // we fall back to "your community" + the user's own timezone.
  void opts; // kept for callers that still pass { forceNow }; behaviour is identical now that the gate is gone.
  try {
    const rows = await db
      .select({
        userId: usersTable.id,
        userTimezone: usersTable.timezone,
        morningPref: usersTable.parishOfficeMorningPref,
        eveningPref: usersTable.parishOfficeEveningPref,
        morningTime: usersTable.parishOfficeMorningTime,
        eveningTime: usersTable.parishOfficeEveningTime,
        morningSentDate: usersTable.parishOfficeMorningSentDate,
        eveningSentDate: usersTable.parishOfficeEveningSentDate,
        parishFeedId: usersTable.parishFeedId,
        parishTitle: prayerFeedsTable.title,
        parishTimezone: prayerFeedsTable.timezone,
      })
      .from(usersTable)
      .leftJoin(prayerFeedsTable, and(
        eq(prayerFeedsTable.id, usersTable.parishFeedId),
        eq(prayerFeedsTable.kind, "parish"),
      ))
      .where(sql`(${usersTable.parishOfficeMorningPref} != 'none' OR ${usersTable.parishOfficeEveningPref} != 'none')`);

    for (const r of rows) {
      const tz = r.parishTimezone || r.userTimezone || "America/New_York";
      const today = todayInZone(tz);
      const communityTitle = r.parishTitle ?? "your community";

      // Shared: approximate UTC start of today in user-tz (covers UTC-14).
      const sinceUtc = new Date(`${today}T00:00:00Z`);
      sinceUtc.setUTCHours(sinceUtc.getUTCHours() - 14);

      // Morning side
      if (r.morningPref !== "none" && r.morningSentDate !== today) {
        const targetTime = r.morningTime || DEFAULT_MORNING_TIME;
        if (opts.forceNow || isWithinTickWindow(tz, targetTime)) {
          const morningSessions = await db
            .select({ endedAt: prayerSessionsTable.endedAt })
            .from(prayerSessionsTable)
            .where(
              and(
                eq(prayerSessionsTable.userId, r.userId),
                inArray(prayerSessionsTable.surface, ["morning-prayer", "morning-devotion"]),
                gte(prayerSessionsTable.endedAt, sinceUtc),
              ),
            );
          const prayedMorningToday = morningSessions.some(s => {
            if (!s.endedAt) return false;
            return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(s.endedAt) === today;
          });
          if (!prayedMorningToday) {
            try {
              await sendParishOfficeReminderPush(r.userId, {
                side: "morning",
                pref: r.morningPref as "office" | "devotion",
                parishTitle: communityTitle,
              });
              await db
                .update(usersTable)
                .set({ parishOfficeMorningSentDate: today })
                .where(eq(usersTable.id, r.userId));
            } catch (err) {
              logger.warn({ err, userId: r.userId }, "[office-reminder] morning push failed");
            }
          } else {
            // Stamp sent-date so we don't re-evaluate on later ticks today.
            await db
              .update(usersTable)
              .set({ parishOfficeMorningSentDate: today })
              .where(eq(usersTable.id, r.userId));
            logger.info({ userId: r.userId }, "[office-reminder] morning skip — already prayed");
          }
        }
      }

      // Evening side
      if (r.eveningPref !== "none" && r.eveningSentDate !== today) {
        const eveningTarget = r.eveningTime || FIXED_EVENING_TIME;
        if (opts.forceNow || isWithinTickWindow(tz, eveningTarget)) {
          const eveningSessions = await db
            .select({ endedAt: prayerSessionsTable.endedAt })
            .from(prayerSessionsTable)
            .where(
              and(
                eq(prayerSessionsTable.userId, r.userId),
                inArray(prayerSessionsTable.surface, ["evening-prayer", "early-evening-devotion"]),
                gte(prayerSessionsTable.endedAt, sinceUtc),
              ),
            );
          const prayedEveningToday = eveningSessions.some(s => {
            if (!s.endedAt) return false;
            return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(s.endedAt) === today;
          });
          if (!prayedEveningToday) {
            try {
              await sendParishOfficeReminderPush(r.userId, {
                side: "evening",
                pref: r.eveningPref as "office" | "devotion",
                parishTitle: communityTitle,
              });
              await db
                .update(usersTable)
                .set({ parishOfficeEveningSentDate: today })
                .where(eq(usersTable.id, r.userId));
            } catch (err) {
              logger.warn({ err, userId: r.userId }, "[office-reminder] evening push failed");
            }
          } else {
            await db
              .update(usersTable)
              .set({ parishOfficeEveningSentDate: today })
              .where(eq(usersTable.id, r.userId));
            logger.info({ userId: r.userId }, "[office-reminder] evening skip — already prayed");
          }
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "[office-reminder] sender failed");
  }
}

// ─── Phoebe Parish — 8pm prayed-today recap ────────────────────────────────
//
// Once per parish per local day, when the parish's clock crosses 20:00,
// we fan out a recap push to every parishioner who prayed today —
// provided 4+ distinct parishioners prayed (the user + 3+ others). Body
// reads "N others from your parish prayed today." Tap deep-links to
// /parish/celebration which shows the avatar rail of who.
//
// Threshold (4+) keeps the push from feeling lonely on quiet days — the
// "more than three other people pray also from that parish" rule.
//
// Idempotency: prayer_feeds.parish_evening_recap_sent_date stamped with
// today (parish TZ) on first fire, checked before re-firing.
const PARISH_EVENING_HOUR = "20:00";
const PARISH_EVENING_MIN_PARTICIPANTS = 4;

export async function runParishEveningRecapSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  if (!PHOEBE_PARISH_ENABLED) return;
  try {
    const parishes = await db
      .select({
        id: prayerFeedsTable.id,
        title: prayerFeedsTable.title,
        timezone: prayerFeedsTable.timezone,
        sentDate: prayerFeedsTable.parishEveningRecapSentDate,
      })
      .from(prayerFeedsTable)
      .where(and(
        eq(prayerFeedsTable.kind, "parish"),
        eq(prayerFeedsTable.state, "live"),
      ));

    for (const p of parishes) {
      const tz = p.timezone || "America/New_York";
      const today = todayInZone(tz);
      if (p.sentDate === today && !opts.forceNow) continue;
      if (!opts.forceNow && !isWithinTickWindow(tz, PARISH_EVENING_HOUR)) continue;

      // Distinct user_ids from this parish who prayed today.
      const rows = await db.execute<{ user_id: number }>(sql`
        SELECT DISTINCT ps.user_id
        FROM prayer_sessions ps
        INNER JOIN prayer_feed_subscriptions pfs
          ON pfs.user_id = ps.user_id AND pfs.feed_id = ${p.id}
        WHERE (ps.ended_at AT TIME ZONE ${tz})::date = ${today}::date
      `);
      const userIds = rows.rows.map((r) => r.user_id);
      const count = userIds.length;

      if (count >= PARISH_EVENING_MIN_PARTICIPANTS) {
        for (const uid of userIds) {
          try {
            await sendParishEveningRecapPush(uid, {
              parishTitle: p.title,
              prayedTodayCount: count,
            });
          } catch (err) {
            logger.warn({ err, userId: uid, parishId: p.id }, "[parish-evening] push failed");
          }
        }
        logger.info({ parishId: p.id, count }, "[parish-evening] fan-out sent");
      } else {
        logger.info({ parishId: p.id, count }, "[parish-evening] threshold not met — skipped");
      }

      // Stamp regardless of whether we fanned out. The threshold check
      // is "did enough pray today" — if not, we shouldn't re-evaluate
      // on every later tick within the same day; once 8pm passes the
      // window is closed.
      await db
        .update(prayerFeedsTable)
        .set({ parishEveningRecapSentDate: today })
        .where(eq(prayerFeedsTable.id, p.id));
    }
  } catch (err) {
    logger.error({ err }, "[parish-evening] sender failed");
  }
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

// ─── Day-before gathering reminder ─────────────────────────────────────────
//
// Runs on every scheduler tick. Finds community meetups (ritual.groupId set)
// whose scheduledDate is tomorrow (UTC date) and haven't had a reminder sent
// yet. Pushes every joined group member once, then stamps reminder_sent_at.
// Uses UTC date comparison — no per-gathering timezone; close enough given
// gatherings are multi-day events and the push fires early in the UTC day.
export async function runGatheringReminderSender(): Promise<void> {
  try {
    // Tomorrow's date as YYYY-MM-DD in UTC.
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    // Meetups whose scheduled_date starts with tomorrow's date string,
    // belong to a community gathering (ritual.group_id IS NOT NULL),
    // and haven't had a reminder sent yet.
    const rows = await db
      .select({
        meetupId: meetupsTable.id,
        meetupLocation: meetupsTable.location,
        ritualId: ritualsTable.id,
        ritualName: ritualsTable.name,
        ritualLocation: ritualsTable.location,
        groupId: ritualsTable.groupId,
      })
      .from(meetupsTable)
      .innerJoin(ritualsTable, eq(ritualsTable.id, meetupsTable.ritualId))
      .where(and(
        sql`${meetupsTable.scheduledDate} LIKE ${tomorrowStr + "%"}`,
        sql`${meetupsTable.reminderSentAt} IS NULL`,
        sql`${meetupsTable.status} = 'planned'`,
        isNotNull(ritualsTable.groupId),
      ));

    for (const row of rows) {
      if (!row.groupId) continue;

      const [group] = await db
        .select({ slug: groupsTable.slug })
        .from(groupsTable)
        .where(eq(groupsTable.id, row.groupId));
      if (!group) continue;

      const members = await db
        .select({ userId: groupMembersTable.userId })
        .from(groupMembersTable)
        .where(and(
          eq(groupMembersTable.groupId, row.groupId),
          sql`${groupMembersTable.joinedAt} IS NOT NULL`,
        ));

      const location = row.meetupLocation ?? row.ritualLocation ?? null;

      await Promise.allSettled(
        members
          .filter(m => typeof m.userId === "number")
          .map(m => sendGatheringTomorrowPush(m.userId as number, {
            meetupId: row.meetupId,
            ritualId: row.ritualId,
            groupSlug: group.slug,
            gatheringName: row.ritualName,
            location,
          }))
      );

      await db
        .update(meetupsTable)
        .set({ reminderSentAt: new Date() })
        .where(eq(meetupsTable.id, row.meetupId));

      logger.info({ meetupId: row.meetupId, ritualName: row.ritualName }, "[gathering-reminder] sent day-before push");
    }
  } catch (err) {
    logger.error({ err }, "[gathering-reminder] sender failed");
  }
}

// ─── Prayer-feed event reminders ────────────────────────────────────────────
//
// Day-before reminder for published feed events. Fires once per event,
// deduped via prayer_feed_events.reminder_sent_at. Fans to every feed
// subscriber (handled inside sendFeedEventTomorrowPush). UTC calendar-
// date comparison, same as the gathering/action reminders.
export async function runFeedEventReminderSender(): Promise<void> {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const rows = await db
      .select({
        eventId: prayerFeedEventsTable.id,
        feedId: prayerFeedEventsTable.feedId,
        title: prayerFeedEventsTable.title,
        location: prayerFeedEventsTable.location,
        feedSlug: prayerFeedsTable.slug,
      })
      .from(prayerFeedEventsTable)
      .innerJoin(prayerFeedsTable, eq(prayerFeedsTable.id, prayerFeedEventsTable.feedId))
      .where(and(
        eq(prayerFeedEventsTable.state, "published"),
        isNull(prayerFeedEventsTable.reminderSentAt),
        sql`to_char(${prayerFeedEventsTable.startsAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD') = ${tomorrowStr}`,
      ));

    for (const row of rows) {
      await sendFeedEventTomorrowPush(row.feedId, {
        feedSlug: row.feedSlug,
        eventTitle: row.title,
        eventId: row.eventId,
        location: row.location,
      });
      await db
        .update(prayerFeedEventsTable)
        .set({ reminderSentAt: new Date() })
        .where(eq(prayerFeedEventsTable.id, row.eventId));
      logger.info({ eventId: row.eventId, title: row.title }, "[feed-event-reminder] sent day-before push");
    }
  } catch (err) {
    logger.error({ err }, "[feed-event-reminder] sender failed");
  }
}

// ─── Delayed feed-intercession push ─────────────────────────────────────────
//
// When an editor publishes (or attaches) a feed intercession, we stamp
// shared_moments.notify_subscribers_at = NOW() + 15min instead of pushing
// immediately. This scanner picks up rows whose grace window has elapsed
// and fans the "new intercession" push out to subscribers, then NULLs the
// column so we don't re-fire on the next tick. The 15-min delay gives the
// editor time to fix a typo / delete the moment before subscribers get
// pinged; since the scanner runs every 15 min, real-world latency is
// 15–30 min, which fits the "at least 15 minutes grace" goal.
//
// If the editor deletes the moment within the window, the row is gone and
// nothing fires. If they edit the body, the new copy is what subscribers
// see when they tap through (the push body itself names the feed, not the
// edited text, so the push wording stays valid through edits).
//
// shared_moments.published_by_user_id is the editor who triggered the
// schedule (fresh-create OR attach), threaded through to
// sendNewFeedIntercessionPush as excludeUserId so the publisher doesn't
// get pinged 15 minutes later about their own action. Null for rows
// that pre-date the column — in that case we just don't exclude, which
// matches the old immediate-push behavior.
export async function runFeedIntercessionPushSender(): Promise<void> {
  try {
    const now = new Date();
    const rows = await db
      .select({
        momentId: sharedMomentsTable.id,
        feedId: sharedMomentsTable.prayerFeedId,
        topic: sharedMomentsTable.intercessionTopic,
        name: sharedMomentsTable.name,
        publisherUserId: sharedMomentsTable.publishedByUserId,
        feedSlug: prayerFeedsTable.slug,
        feedTitle: prayerFeedsTable.title,
      })
      .from(sharedMomentsTable)
      .innerJoin(prayerFeedsTable, eq(prayerFeedsTable.id, sharedMomentsTable.prayerFeedId))
      .where(and(
        isNotNull(sharedMomentsTable.notifySubscribersAt),
        sql`${sharedMomentsTable.notifySubscribersAt} <= ${now}`,
        eq(sharedMomentsTable.state, "active"),
        eq(sharedMomentsTable.templateType, "intercession"),
      ));

    for (const row of rows) {
      if (row.feedId == null) continue; // satisfies the type narrower; the join already filters nulls
      const title = row.topic || row.name || "New intercession";
      try {
        await sendNewFeedIntercessionPush(row.feedId, {
          feedSlug: row.feedSlug,
          feedTitle: row.feedTitle,
          intercessionTitle: title,
          intercessionId: row.momentId,
          excludeUserId: row.publisherUserId ?? undefined,
        });
      } catch (err) {
        logger.warn({ err, momentId: row.momentId }, "[feed-intercession-push] send failed");
      }
      // NULL the column regardless of send success — a transient push
      // failure shouldn't park the row in "pending" forever. The push
      // layer already has its own retry / token-invalidation logic.
      await db
        .update(sharedMomentsTable)
        .set({ notifySubscribersAt: null })
        .where(eq(sharedMomentsTable.id, row.momentId));
      logger.info({ momentId: row.momentId, title }, "[feed-intercession-push] fired");
    }

    // Orphan cleanup: if a feed was deleted while one of its moments
    // still had a pending notify_subscribers_at, the ON DELETE SET NULL
    // on prayer_feed_id leaves the row with no feed and a stuck timer.
    // The INNER JOIN above filters those out (nothing to push since
    // there's no feed slug/title), but the column itself stays
    // non-null, so the partial index keeps indexing dead rows. One
    // cheap UPDATE per tick clears them.
    await db
      .update(sharedMomentsTable)
      .set({ notifySubscribersAt: null })
      .where(and(
        isNotNull(sharedMomentsTable.notifySubscribersAt),
        isNull(sharedMomentsTable.prayerFeedId),
      ));
  } catch (err) {
    logger.error({ err }, "[feed-intercession-push] sender failed");
  }
}

// ─── Action advance reminders ──────────────────────────────────────────────
//
// Runs on every scheduler tick. For each active community action:
//   - ~7 days out → "is next week" push (deduped via week_reminder_sent_at)
//   - ~1 day out  → "is tomorrow"  push (deduped via day_reminder_sent_at)
// Both fan out to every joined member of the host community. UTC calendar-
// date comparison — no per-community timezone; the push lands early in the
// UTC day (evening across the Americas), which reads fine for an advance
// nudge. Actions created inside the reminder window get their sent-at
// columns pre-stamped at creation so the on-creation push isn't doubled.
export async function runActionReminderSender(): Promise<void> {
  try {
    const now = new Date();
    const dateUTC = (d: Date) => d.toISOString().slice(0, 10);
    const plusDaysUTC = (n: number) => {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() + n);
      return dateUTC(d);
    };
    const tomorrowStr = plusDaysUTC(1);
    const weekOutStr = plusDaysUTC(7);

    // Active actions whose event hasn't passed yet.
    const actions = await db
      .select({
        id: actionsTable.id,
        title: actionsTable.title,
        location: actionsTable.location,
        eventAt: actionsTable.eventAt,
        groupId: actionsTable.groupId,
        weekReminderSentAt: actionsTable.weekReminderSentAt,
        dayReminderSentAt: actionsTable.dayReminderSentAt,
      })
      .from(actionsTable)
      .where(and(
        eq(actionsTable.state, "active"),
        gte(actionsTable.eventAt, now),
      ));

    for (const action of actions) {
      const eventDateStr = dateUTC(new Date(action.eventAt));
      let lead: "week" | "day" | null = null;
      if (eventDateStr === tomorrowStr && action.dayReminderSentAt == null) {
        lead = "day";
      } else if (eventDateStr === weekOutStr && action.weekReminderSentAt == null) {
        lead = "week";
      }
      if (!lead) continue;

      const members = await db
        .select({ userId: groupMembersTable.userId })
        .from(groupMembersTable)
        .where(and(
          eq(groupMembersTable.groupId, action.groupId),
          sql`${groupMembersTable.joinedAt} IS NOT NULL`,
        ));

      await Promise.allSettled(
        members
          .filter((m) => typeof m.userId === "number")
          .map((m) =>
            sendActionReminderPush(m.userId as number, {
              actionId: action.id,
              actionTitle: action.title,
              lead: lead as "week" | "day",
              location: action.location,
            }),
          ),
      );

      await db
        .update(actionsTable)
        .set(
          lead === "day"
            ? { dayReminderSentAt: new Date() }
            : { weekReminderSentAt: new Date() },
        )
        .where(eq(actionsTable.id, action.id));

      logger.info({ actionId: action.id, lead }, "[action-reminder] sent advance push");
    }
  } catch (err) {
    logger.error({ err }, "[action-reminder] sender failed");
  }
}

// ─── Weekly prayer-feed digest sender ─────────────────────────────────────────
// Fires Tuesday at 18:00 in each opted-in subscriber's local TZ.
// Sends one push + one email summarising the intercessions that have
// landed on their subscribed feeds since the previous digest, with
// action-type intercessions called out separately. The push deep-links
// to /prayer-mode?queue=feed-digest so the slide walker plays the same
// set as the email. Empty weeks are silent — last_digest_sent_date
// only moves forward on a non-empty week so the next non-empty week
// still fires.
export async function runWeeklyDigestSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  const force = opts.forceNow === true;
  try {
    // Beta-only for now — the digest is a beta-cohort feature while
    // we refine cadence + content. innerJoin against beta_users
    // (email-keyed, lowercased) drops non-beta accounts at query time.
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        timezone: usersTable.timezone,
        lastDigestSentDate: usersTable.lastDigestSentDate,
      })
      .from(usersTable)
      .innerJoin(
        betaUsersTable,
        sql`LOWER(${usersTable.email}) = LOWER(${betaUsersTable.email})`,
      )
      .where(eq(usersTable.weeklyDigestEnabled, true));

    for (const user of users) {
      const tz = user.timezone ?? "America/New_York";
      const todayStr = todayDateInTz(tz);

      if (!force) {
        // Tuesday at 18:00, first 15 minutes of the hour. 0=Sun, 2=Tue.
        // Reading getUTCDay from noon-UTC of the local date is the
        // pattern other senders use to avoid cross-midnight surprises.
        const weekday = new Date(`${todayStr}T12:00:00Z`).getUTCDay();
        if (weekday !== 2) continue;
        const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
        if (nowH !== 18 || nowM >= 15) continue;
      }
      // Idempotent: once per local-TZ Tuesday.
      if (user.lastDigestSentDate === todayStr) continue;

      // Cutoff for "new since": the previous digest's stamp, or 7 days
      // ago for a first-ever digest. UTC midnight of the local stamp
      // is slightly over-inclusive across the international date line,
      // which is fine — we'd rather over-show than skip an item.
      const since = user.lastDigestSentDate
        ? new Date(`${user.lastDigestSentDate}T00:00:00Z`)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const digest = await loadFeedDigest(user.id, since);
      if (digest.entries.length === 0) continue;

      try {
        await sendWeeklyDigestPush(user.id, {
          count: digest.entries.length,
          actionCount: digest.actionEntries.length,
        });
      } catch (err) {
        logger.error({ err, userId: user.id }, "[digest] push failed");
      }
      try {
        await sendWeeklyDigestEmail({
          to: user.email,
          recipientName: user.name,
          digest,
        });
      } catch (err) {
        logger.error({ err, userId: user.id }, "[digest] email failed");
      }

      // Stamp only when the week was non-empty.
      await db
        .update(usersTable)
        .set({ lastDigestSentDate: todayStr })
        .where(eq(usersTable.id, user.id));

      logger.info({ userId: user.id, count: digest.entries.length, actionCount: digest.actionEntries.length }, "[digest] sent");
    }
  } catch (err) {
    logger.error({ err }, "[digest] sender failed");
  }
}

// ─── Parish weekly recap sender ───────────────────────────────────────────────
// Fires Saturday at 18:00 in each parish's local TZ — closes out the
// liturgical week with "N parishioners prayed with you this week." for
// every subscriber. Mirrors the daily evening recap's per-parish fan-
// out (lines 967-1032 above) but at a weekly cadence; idempotency
// lives per-user on users.parish_weekly_recap_sent_date so a
// parishioner added to the parish later in the day still gets the
// recap if it hasn't been sent to them yet.
export async function runParishWeeklyRecapSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  const force = opts.forceNow === true;
  try {
    const parishes = await db
      .select({
        id: prayerFeedsTable.id,
        title: prayerFeedsTable.title,
        slug: prayerFeedsTable.slug,
        timezone: prayerFeedsTable.timezone,
      })
      .from(prayerFeedsTable)
      .where(and(
        eq(prayerFeedsTable.kind, "parish"),
        eq(prayerFeedsTable.state, "live"),
      ));

    for (const parish of parishes) {
      const tz = parish.timezone ?? "America/New_York";
      const todayStr = todayDateInTz(tz);

      if (!force) {
        // Saturday at 18:00 (first 15 min). Sun=0, Sat=6 — read from
        // noon-UTC of the local date to avoid cross-midnight surprises.
        const weekday = new Date(`${todayStr}T12:00:00Z`).getUTCDay();
        if (weekday !== 6) continue;
        const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
        if (nowH !== 18 || nowM >= 15) continue;
      }

      // Solidarity count: distinct parishioners who completed a
      // prayer_sessions row in the last 7 days. Matches the count
      // the parish dashboard + post-Office celebration already show.
      const [weekRow] = await db
        .select({ count: sql<number>`count(distinct ${prayerSessionsTable.userId})::int` })
        .from(prayerSessionsTable)
        .innerJoin(
          prayerFeedSubscriptionsTable,
          and(
            eq(prayerFeedSubscriptionsTable.userId, prayerSessionsTable.userId),
            eq(prayerFeedSubscriptionsTable.feedId, parish.id),
          ),
        )
        .where(sql`${prayerSessionsTable.endedAt} > NOW() - INTERVAL '7 days'`);
      const weekCount = weekRow?.count ?? 0;
      if (weekCount === 0) continue; // empty week — skip silently.

      const parishioners = await db
        .select({
          id: usersTable.id,
          weeklyStamp: usersTable.parishWeeklyRecapSentDate,
        })
        .from(usersTable)
        .where(eq(usersTable.parishFeedId, parish.id));

      for (const u of parishioners) {
        if (u.weeklyStamp === todayStr) continue;
        try {
          await sendParishWeeklyRecapPush(u.id, {
            parishTitle: parish.title,
            parishSlug: parish.slug,
            weekCount,
          });
        } catch (err) {
          logger.error({ err, userId: u.id, parishId: parish.id }, "[parish-weekly] push failed");
        }
        await db.update(usersTable)
          .set({ parishWeeklyRecapSentDate: todayStr })
          .where(eq(usersTable.id, u.id));
      }
      logger.info({ parishId: parish.id, weekCount, parishioners: parishioners.length }, "[parish-weekly] sent");
    }
  } catch (err) {
    logger.error({ err }, "[parish-weekly] sender failed");
  }
}

// ─── Sunday Service Reflection push ─────────────────────────────────────────
//
// Sunday-evening push inviting every joined member of an opted-in
// community to write a reflection on this week's service. Fires once
// per community per Sunday — deduped via groups.sunday_reflection_notified_at.
//
// Timing: fires when the SERVER's local clock reads Sunday 18:00–23:00.
// We use the server clock (not per-user timezone) because a community
// has many members across many zones and the natural anchor is "Sunday
// evening as the community publishes it." The push body is calm enough
// that a member in a different zone seeing it as Monday morning is fine.
//
// The 5-hour window is wide so the 15-min interval has plenty of chances
// to fire if the bell scheduler restarts mid-evening. The dedup column
// stops it from re-firing the same week — the column gets reset
// implicitly when the next Sunday rolls over since we only fire when
// notified_at is older than this week's Sunday.
export async function runSundayReflectionPushSender(): Promise<void> {
  try {
    const now = new Date();
    if (now.getDay() !== 0) return; // 0 = Sunday in server local time
    const hour = now.getHours();
    if (hour < 18 || hour >= 23) return;

    // Find this week's Sunday anchor (UTC midnight of today's date).
    const sundayAnchor = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    // Communities opted-in to the feature and not yet notified for THIS
    // Sunday. The < sundayAnchor check works because the column gets
    // stamped with `now` which is always > the Sunday-midnight anchor
    // we set after the first notification.
    const groups = await db.select({
      id: groupsTable.id,
      slug: groupsTable.slug,
      name: groupsTable.name,
    }).from(groupsTable).where(and(
      eq(groupsTable.sundayReflectionsEnabled, true),
      sql`(${groupsTable.sundayReflectionNotifiedAt} IS NULL OR ${groupsTable.sundayReflectionNotifiedAt} < ${sundayAnchor})`,
    ));

    for (const g of groups) {
      // Joined-member roster for the push.
      const members = await db.select({ userId: groupMembersTable.userId })
        .from(groupMembersTable)
        .where(and(
          eq(groupMembersTable.groupId, g.id),
          isNotNull(groupMembersTable.joinedAt),
          isNotNull(groupMembersTable.userId),
        ));
      const userIds = members.map(m => m.userId).filter((id): id is number => id !== null);

      await sendSundayReflectionPush(userIds, {
        groupSlug: g.slug,
        groupName: g.name,
      });

      await db.update(groupsTable)
        .set({ sundayReflectionNotifiedAt: new Date() })
        .where(eq(groupsTable.id, g.id));

      logger.info({ groupId: g.id, slug: g.slug, recipients: userIds.length },
        "[sunday-reflection] sent Sunday-evening push");
    }
  } catch (err) {
    logger.error({ err }, "[sunday-reflection] sender failed");
  }
}

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
    runPrayerRenewalNudgeSender().catch((err) =>
      logger.error({ err }, "[renewal-nudge] initial run failed"),
    );
    runParishOfficeReminderSender().catch((err) =>
      logger.error({ err }, "[parish-office] initial run failed"),
    );
    runParishEveningRecapSender().catch((err) =>
      logger.error({ err }, "[parish-evening] initial run failed"),
    );
    runGatheringReminderSender().catch((err) =>
      logger.error({ err }, "[gathering-reminder] initial run failed"),
    );
    runFeedEventReminderSender().catch((err) =>
      logger.error({ err }, "[feed-event-reminder] initial run failed"),
    );
    runSundayReflectionPushSender().catch((err) =>
      logger.error({ err }, "[sunday-reflection] initial run failed"),
    );
    runFeedIntercessionPushSender().catch((err) =>
      logger.error({ err }, "[feed-intercession-push] initial run failed"),
    );
    runActionReminderSender().catch((err) =>
      logger.error({ err }, "[action-reminder] initial run failed"),
    );
    runWeeklyDigestSender().catch((err) =>
      logger.error({ err }, "[digest] initial run failed"),
    );
    runParishWeeklyRecapSender().catch((err) =>
      logger.error({ err }, "[parish-weekly] initial run failed"),
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
      runPrayerRenewalNudgeSender().catch((err) =>
        logger.error({ err }, "[renewal-nudge] scheduled run failed"),
      );
      runParishOfficeReminderSender().catch((err) =>
        logger.error({ err }, "[parish-office] scheduled run failed"),
      );
      runParishEveningRecapSender().catch((err) =>
        logger.error({ err }, "[parish-evening] scheduled run failed"),
      );
      runGatheringReminderSender().catch((err) =>
        logger.error({ err }, "[gathering-reminder] scheduled run failed"),
      );
      runFeedEventReminderSender().catch((err) =>
        logger.error({ err }, "[feed-event-reminder] scheduled run failed"),
      );
      runSundayReflectionPushSender().catch((err) =>
        logger.error({ err }, "[sunday-reflection] scheduled run failed"),
      );
      runFeedIntercessionPushSender().catch((err) =>
        logger.error({ err }, "[feed-intercession-push] scheduled run failed"),
      );
      runActionReminderSender().catch((err) =>
        logger.error({ err }, "[action-reminder] scheduled run failed"),
      );
      runWeeklyDigestSender().catch((err) =>
        logger.error({ err }, "[digest] scheduled run failed"),
      );
      runParishWeeklyRecapSender().catch((err) =>
        logger.error({ err }, "[parish-weekly] scheduled run failed"),
      );
    },
    15 * 60 * 1000,
  );
}
