import {
  db,
  usersTable,
  bellNotificationsTable,
  prayerRequestAmensTable,
  prayerRequestsTable,
  sharedMomentsTable,
  momentUserTokensTable,
  lectioReflectionsTable,
  lectionaryReadingsTable,
  prayerFeedsTable,
  prayerFeedEntriesTable,
} from "@workspace/db";
import { eq, and, gte, ne, sql, isNull } from "drizzle-orm";
import {
  sendBellPush,
  sendEveningNudgePush,
  sendLectioReminderPush,
  sendLectioEveningReminderPush,
  sendPrayerRenewalNudgePush,
  sendClimateDailyPush,
} from "./pushSender";
import { nextSundayDate, getReadingForSunday } from "./rclLectionary";
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
// Push-only. Fires for every user at 07:00 local in their timezone — the
// first of three daily nudges (07:00 / 14:00 / 20:00). This morning slot
// fires unconditionally; the midday and evening slots are gentler and
// skip users who have already prayed today. The time is global — the
// per-user `dailyBellTime` column is still in the schema for now but is
// no longer read here. The bell is on by default for everyone;
// `sendPushToUser` no-ops for users without an active device token, so
// users who haven't installed the app simply don't receive anything.
// De-duped via a `bell_notifications` row keyed on (userId, todayStr).
// `forceNow: true` bypasses both the time-window check and the dedup —
// used by the /api/bell/fire-now debug endpoint.

const DAILY_BELL_HOUR = 7;
const DAILY_BELL_MINUTE = 0;

export async function runBellSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  // Climate-enrolled users are excluded here — they receive
  // `runClimateDailySender` instead, at the same 7am local slot. We
  // disjoin the two audiences at the SQL level so a climate-enrolled
  // user never gets back-to-back duplicate pushes (the standard bell
  // immediately followed by the climate daily).
  const bellUsers = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      timezone: usersTable.timezone,
    })
    .from(usersTable)
    .where(eq(usersTable.climateEnrolled, false));

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

// ─── Day-call senders (midday 14:00, evening 20:00) ────────────────────────
//
// Two follow-up nudges that gently re-invite a user back to prayer if the
// 07:00 morning bell didn't catch them. Both share the same shape — fire
// inside their 15-minute window (so the cron tick at any minute lands a
// single send), skip users who have already prayed today (any amen tap
// that day in the user's timezone is enough), and dedup via a slot-keyed
// `bell_notifications` row so a refire on the next tick can't double-
// send. The morning bell above fires unconditionally because it's the
// wake-up call; these two are softer because they're catching people who
// missed it.

async function runDayCallSender(opts: {
  hour: number;
  slotKey: "midday" | "evening";
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

      try {
        await sendEveningNudgePush(user.id);
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

export async function runMiddayNudgeSender(): Promise<void> {
  return runDayCallSender({ hour: 14, slotKey: "midday", logTag: "[bell-midday]" });
}

export async function runEveningNudgeSender(): Promise<void> {
  return runDayCallSender({ hour: 20, slotKey: "evening", logTag: "[bell-evening]" });
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

// `forceNow` skips the time-window and dedup gates so an admin debug
// endpoint can fire a missed tick. `bypassReflectionGate` *additionally*
// skips the "this user has already submitted that stage this week" gate,
// for verifying push delivery end-to-end without having to delete the
// reflection row first. Default is the safe behavior that production
// uses on every tick.
export async function runLectioReminderSender(
  opts: { forceNow?: boolean; bypassReflectionGate?: boolean } = {},
): Promise<void> {
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

// ─── Prayer-request renewal nudge (1 day before expiry) ────────────────────
//
// Fires once per active prayer request when its expiresAt sits in the
// owner's "tomorrow" — i.e. expiresAt's calendar date in the owner's
// tz is exactly +1 day from today's calendar date. Push body names the
// running amen count so the owner sees that what they shared has been
// carried before deciding whether to renew or release. Dedup is via
// the `renewal_nudge_sent_at` column on prayer_requests, stamped on
// successful push dispatch.
//
// Uses the same 09:30-local time gate as the morning bell so the nudge
// arrives at the same calm hour, not in the middle of the night.
const RENEWAL_NUDGE_HOUR = 9;
const RENEWAL_NUDGE_MINUTE = 30;
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

      // Time gate (skip if forced) — fire only at/after 09:30 local so
      // the nudge sits with the morning bell's cadence.
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
      if (!opts.forceNow && dayDiff !== 1) continue;

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

// ─── Climate daily sender (7 AM local for climate-enrolled users) ──────────
//
// Mirrors `runBellSender` in shape and timing — fires at 07:00 in each
// user's local timezone, dedups via a slot-keyed `bell_notifications`
// row (`${todayStr}-climate`), and inserts the dedup row only after a
// successful push so transient APNs failures self-heal on the next
// 15-min tick.
//
// The phoebe-climate feed is platform-owned; today's entry is the same
// for every recipient (it's keyed by the feed's timezone, not the
// user's), so we look it up ONCE per tick before the user loop and
// reuse it across all sends. If the feed itself is missing we log and
// bail — that's a deploy-time invariant violation, not a per-user
// condition.
export async function runClimateDailySender(opts: { forceNow?: boolean } = {}): Promise<void> {
  // Look up the climate feed once per tick — id + timezone are all we
  // need to find today's entry below.
  const [feed] = await db
    .select({
      id: prayerFeedsTable.id,
      timezone: prayerFeedsTable.timezone,
    })
    .from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.slug, "phoebe-climate"));

  if (!feed) {
    logger.warn("[climate-daily] phoebe-climate feed not found — skipping run");
    return;
  }

  // Today's entry, also looked up once per tick. The entry is keyed by
  // the feed's TZ (not each user's), so all recipients see the same
  // title. If no entry has been authored/published for today we still
  // fire the push with a fallback title — better to land the daily
  // ping than to silently skip the cohort.
  const feedTodayStr = todayDateInTz(feed.timezone);
  const [entry] = await db
    .select({
      id: prayerFeedEntriesTable.id,
      title: prayerFeedEntriesTable.title,
    })
    .from(prayerFeedEntriesTable)
    .where(
      and(
        eq(prayerFeedEntriesTable.feedId, feed.id),
        eq(prayerFeedEntriesTable.entryDate, feedTodayStr),
        eq(prayerFeedEntriesTable.state, "published"),
      ),
    );
  const entryTitle: string | null = entry?.title ?? null;

  const climateUsers = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      timezone: usersTable.timezone,
    })
    .from(usersTable)
    .where(eq(usersTable.climateEnrolled, true));

  if (climateUsers.length === 0) return;

  for (const user of climateUsers) {
    try {
      const tz = user.timezone ?? "America/New_York";
      const todayStr = todayDateInTz(tz);
      const dedupKey = `${todayStr}-climate`;

      if (!opts.forceNow) {
        const [existing] = await db
          .select()
          .from(bellNotificationsTable)
          .where(
            and(
              eq(bellNotificationsTable.userId, user.id),
              eq(bellNotificationsTable.bellDate, dedupKey),
            ),
          );
        if (existing) continue;

        const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
        const diff = (nowH * 60 + nowM) - (DAILY_BELL_HOUR * 60 + DAILY_BELL_MINUTE);
        if (diff < 0 || diff >= 15) continue;
      }

      // Same dedup discipline as runBellSender: insert AFTER push
      // success so a transient APNs error doesn't mute the user for
      // the rest of the day.
      try {
        await sendClimateDailyPush(user.id, entryTitle);
      } catch (err) {
        logger.warn({ err, userId: user.id }, "[climate-daily] push dispatch failed — skipping dedup insert so we retry next tick");
        continue;
      }

      await db.insert(bellNotificationsTable).values({
        userId: user.id,
        bellDate: dedupKey,
        sentAt: new Date(),
      });

      logger.info({ userId: user.id, dedupKey, entryId: entry?.id ?? null }, "[climate-daily] sent climate daily push");
    } catch (err) {
      logger.error({ err, userId: user.id }, "[climate-daily] user processing failed");
    }
  }
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

let bellInterval: ReturnType<typeof setInterval> | null = null;

export function startBellScheduler(): void {
  if (bellInterval) return;
  logger.info("[bell-scheduler] started — first run in 45s, then every 15 min");

  setTimeout(() => {
    runBellSender().catch((err) =>
      logger.error({ err }, "[bell] initial run failed"),
    );
    runMiddayNudgeSender().catch((err) =>
      logger.error({ err }, "[bell-midday] initial run failed"),
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
    runClimateDailySender().catch((err) =>
      logger.error({ err }, "[climate-daily] initial run failed"),
    );
  }, 45_000);

  bellInterval = setInterval(
    () => {
      runBellSender().catch((err) =>
        logger.error({ err }, "[bell] scheduled run failed"),
      );
      runMiddayNudgeSender().catch((err) =>
        logger.error({ err }, "[bell-midday] scheduled run failed"),
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
      runClimateDailySender().catch((err) =>
        logger.error({ err }, "[climate-daily] scheduled run failed"),
      );
    },
    15 * 60 * 1000,
  );
}
