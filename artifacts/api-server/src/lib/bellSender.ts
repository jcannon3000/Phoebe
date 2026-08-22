import {
  db,
  usersTable,
  bellNotificationsTable,
  prayerRequestAmensTable,
  prayerRequestsTable,
  prayerSessionsTable,
  sharedMomentsTable,
  momentUserTokensTable,
  lectionaryReadingsTable,
  prayerFeedsTable,
  meetupsTable,
  ritualsTable,
  groupMembersTable,
  groupsTable,
  betaUsersTable,
  prayerFeedSubscriptionsTable,
  prayerFeedEventsTable,
  practiceCompletionTable,
  reflectionReadsTable,
} from "@workspace/db";
import { eq, and, gte, ne, sql, isNull, inArray, isNotNull } from "drizzle-orm";
import {
  sendBellPush,
  sendEveningNudgePush,
  sendPrayerRenewalNudgePush,
  sendLifeEventFollowUpPush,
  sendParishOfficeReminderPush,
  sendContemplationGoalReminderPush,
  sendVtsCommentaryPush,
  sendWeeklyReviewPush,
  sendRoutineAuditPush,
  sendGatheringTomorrowPush,
  sendFeedEventTomorrowPush,
  sendNewFeedIntercessionPush,
  sendWeeklyDigestPush,
} from "./pushSender";
import { getGardenUserIds } from "./garden";
import { runRetentionCleanupSender } from "./retention";
import { buildRoutineAudit } from "./routineAudit";
import { logger } from "./logger";
import { loadFeedDigest } from "./feedDigest";
import { sendWeeklyDigestEmail } from "./email";
import { withSchedulerLog } from "./schedulerHeartbeat";
import { getCurrentTimeInTz, todayDateInTz, todayInZone } from "./tz";
import { getOfficeDay } from "./liturgicalCalendar";
import { getLectionaryReadings } from "./lectionary";
import { buildOfficeOrdoDay } from "./officeOrdo";
import { resolveTodayVts } from "../routes/vts";

// ─── Main bell sender ───────────────────────────────────────────────────────
//
// Push-only. Fires for every user at 09:00 local in their timezone — the
// first of two daily nudges (09:00 / 20:00). This morning slot fires
// unconditionally; the evening slot is gentler and skips users who have
// already prayed today. The midday (14:00) slot was removed per user
// direction — two nudges felt right; three was noisy. The time is global,
// not per-user. The bell is on by default for everyone;
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
// Quiet hours: never send the "your prayer is wrapping up" nudge between 8pm and
// 6am (owner-local). It used to fire at/after 20:00, which landed it in the
// night; now it fires in a calm early-evening window [6pm, 8pm) and is skipped
// entirely once quiet hours begin.
const RENEWAL_NUDGE_HOUR = 18;
const RENEWAL_NUDGE_MINUTE = 0;
const QUIET_HOURS_START = 20; // 8pm
const QUIET_HOURS_END = 6;    // 6am
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
        // Life events get their own "how did it go?" follow-up on the event
        // day — that's the only notification they should fire. Skip the
        // "wrapping up tomorrow" renewal nudge for them so the owner isn't
        // double-pinged. (IS DISTINCT FROM keeps NULL-kind regular requests.)
        sql`${prayerRequestsTable.kind} IS DISTINCT FROM 'life-event'`,
      ),
    );

  if (candidates.length === 0) return;

  for (const c of candidates) {
    try {
      const tz = c.ownerTimezone ?? "America/New_York";
      const expiresAt = c.expiresAt;
      if (!expiresAt) continue;

      // Time gate (skip if forced) — fire only in the early-evening window
      // [6pm, 8pm) local: late enough to be a calm end-of-day prompt, but never
      // during quiet hours (8pm–6am), so a prayer-wrap nudge can't arrive at night.
      if (!opts.forceNow) {
        const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
        if ((nowH * 60 + nowM) < (RENEWAL_NUDGE_HOUR * 60 + RENEWAL_NUDGE_MINUTE)) continue;
        if (nowH >= QUIET_HOURS_START || nowH < QUIET_HOURS_END) continue;
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

// ─── Life-event follow-up ("how did it go?", 8pm on the event day) ─────────
//
// Fires once per life-event prayer request at/after 20:00 owner-local on (or
// after) the calendar day the event happens. Asks the owner to share how it
// went so they can update the people who prayed. Dedup via the
// life_event_followup_sent_at column, stamped on successful dispatch.
const LIFE_EVENT_FOLLOWUP_HOUR = 20;
const LIFE_EVENT_FOLLOWUP_MINUTE = 0;
export async function runLifeEventFollowUpSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  const candidates = await db
    .select({
      id: prayerRequestsTable.id,
      ownerId: prayerRequestsTable.ownerId,
      eventDate: prayerRequestsTable.eventDate,
      eventTitle: prayerRequestsTable.eventTitle,
      ownerTimezone: usersTable.timezone,
    })
    .from(prayerRequestsTable)
    .innerJoin(usersTable, eq(usersTable.id, prayerRequestsTable.ownerId))
    .where(
      and(
        eq(prayerRequestsTable.kind, "life-event"),
        isNull(prayerRequestsTable.lifeEventFollowUpSentAt),
        isNull(prayerRequestsTable.closedAt),
        sql`${prayerRequestsTable.eventDate} IS NOT NULL`,
      ),
    );

  if (candidates.length === 0) return;

  for (const c of candidates) {
    try {
      const tz = c.ownerTimezone ?? "America/New_York";
      const eventDate = c.eventDate;
      if (!eventDate) continue;

      // Time gate — fire only at/after 20:00 owner-local, a calm end-of-day ask.
      if (!opts.forceNow) {
        const { hour: nowH, minute: nowM } = getCurrentTimeInTz(tz);
        if ((nowH * 60 + nowM) < (LIFE_EVENT_FOLLOWUP_HOUR * 60 + LIFE_EVENT_FOLLOWUP_MINUTE)) continue;
      }

      // Calendar-day diff in the owner's tz. dayDiff > 0 → the event is still in
      // the future; skip. dayDiff === 0 → event is today; <0 → already past
      // (catch-up if a tick was missed). Combined with the 20:00 gate, the ask
      // lands the evening of the event.
      const todayStr = todayDateInTz(tz);
      const eventStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(eventDate);
      const todayUtc = Date.parse(`${todayStr}T00:00:00Z`);
      const eventUtc = Date.parse(`${eventStr}T00:00:00Z`);
      const dayDiff = Math.round((eventUtc - todayUtc) / 86_400_000);
      if (!opts.forceNow && dayDiff > 0) continue;

      try {
        await sendLifeEventFollowUpPush(c.ownerId, {
          prayerRequestId: c.id,
          eventTitle: c.eventTitle,
        });
      } catch (err) {
        logger.warn({ err, requestId: c.id, ownerId: c.ownerId }, "[life-event-followup] push dispatch failed — skipping stamp so we retry next tick");
        continue;
      }

      await db.update(prayerRequestsTable)
        .set({ lifeEventFollowUpSentAt: new Date() })
        .where(eq(prayerRequestsTable.id, c.id));

      logger.info({ requestId: c.id, ownerId: c.ownerId }, "[life-event-followup] sent");
    } catch (err) {
      logger.error({ err, requestId: c.id }, "[life-event-followup] processing failed");
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

// Day-of-week in the given tz, 0 = Sunday … 6 = Saturday. Falls back to
// the server-local day if the tz is invalid.
function dowInTz(tz: string): number {
  try {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date());
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wd] ?? new Date().getDay();
  } catch { return new Date().getDay(); }
}

// Sunday (start of the local week) on-or-before today, as YYYY-MM-DD in
// the given tz. Date-only math off a UTC anchor avoids tz drift. The
// weekly-review client writes its practice_completion row with this exact
// weekStart, so matching it here keeps the "already reviewed this week"
// dedup correct even when forceNow bypasses the Sunday-only tick gate.
function weekStartInZone(tz: string): string {
  const d = new Date(`${todayInZone(tz)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dowInTz(tz)); // dowInTz: 0 = Sunday
  return d.toISOString().slice(0, 10);
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

// Owner: "if someone picks seven thirty AM, we want it to be sent at seven
// thirty AM" — the ±15-minute window above let a 7:30 pick go out anywhere
// from 7:15 to 7:45. Used only by the office-reminder senders (morning/
// evening + their two follow-ups), which run on their OWN 1-minute interval
// (see startBellScheduler below); the OTHER senders (contemplation-goal,
// weekly-review) stay on isWithinTickWindow's ±15 tolerance since they're
// still on the coarser 15-minute tick.
//
// FIRES AT-OR-JUST-AFTER, NOT ON EXACT EQUALITY. An earlier version of this
// tested `now === target` and dropped a whole day of reminders whenever the
// target minute was never sampled, which happens constantly:
//
//   • setInterval(60s) DRIFTS — Node fires timers at >=60s, never early, and
//     each tick's own async work adds latency. Ticks landing at 17:59:59.6
//     and 18:01:00.4 never observe 18:00 at all, for every user at once.
//   • The senders below call this PER USER inside a serial loop that awaits
//     DB round-trips and an APNs push each iteration. With a 60-second-wide
//     match, every user processed after the minute rolls over silently
//     missed their reminder for the day.
//
// So: match the first tick at or within GRACE minutes after the target. The
// callers' per-day sent-date columns already dedup, so a wider window can
// never double-send — it only guarantees a drifted or slow tick still
// catches the user. In the normal case the 1-minute tick lands on the
// target minute itself, so the reminder still goes out at 7:30 sharp.
//
// Callers MUST pass `now` — one instant captured at the top of the tick —
// so every user in the fan-out is judged against the same clock reading
// rather than one that advances as the loop grinds through them.
const REMINDER_GRACE_MINUTES = 10;

function isAtOrJustAfterMinute(parishTz: string, targetHHMM: string, now: Date): boolean {
  const [hStr, mStr] = targetHHMM.split(":");
  const target = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
  const { hour, minute } = getCurrentTimeInTz(parishTz, now);
  const delta = hour * 60 + minute - target;
  // Negative = target hasn't arrived yet in this zone (or the local day has
  // already wrapped past midnight, in which case the sent-date is keyed to a
  // new day anyway) — either way, don't fire.
  return delta >= 0 && delta < REMINDER_GRACE_MINUTES;
}

// Owner: "if the notification... is for them to pray the morning office or
// to do the devotions, have it in the second line of the notification
// include the psalms and the readings for the day." A compact one-line
// citation — "Psalm 34 · Genesis 1, Matthew 6" — built from the SAME 1979
// BCP lectionary the office assembler itself uses (getOfficeDay +
// getLectionaryReadings), not a separate/simplified lookup. `today` is the
// recipient's own local YYYY-MM-DD (already resolved by the caller via
// todayInZone(tz)) — constructed at noon UTC so the date itself can't drift
// across a UTC day boundary regardless of the server's own timezone.
// The side's practice, read from the synced routine — the SAME key the client
// renders the home card from ("phoebe:office:level:<side>"). Reading the very
// same value is what keeps the push and the home from ever naming different
// practices: if this is stale, both are stale together and the user can fix it
// in one place, which the old two-mirror reconciliation could never promise.
// Returns null when the routine hasn't synced, which selects the neutral copy.
function sideLevelFromRuleConfig(ruleConfig: unknown, side: "morning" | "evening"): string | null {
  try {
    const values = (ruleConfig as { values?: Record<string, string> } | null)?.values;
    const raw = values?.[`phoebe:office:level:${side}`];
    const v = typeof raw === "string" ? raw.trim() : "";
    return v.length > 0 ? v : null;
  } catch { return null; }
}

// Which practices actually read scripture, and how much of it. Owner: "if their
// practice does not include Scriptures don't have the scriptures. And if it's
// only the Psalms, [show only the psalms]."
//   full   — the office / devotion: psalms AND the lessons
//   psalms — Praying the Psalms: the psalter only
//   none   — Contemplative Prayer, the Examen, FDD, a custom anchor: no line.
//            A silent sit has no appointed reading; printing one implies work
//            the practice never asks for.
function scriptureScopeFor(level: string | null): "full" | "psalms" | "none" {
  switch (level) {
    case "office":
    case "devotion":
      return "full";
    case "psalms":
      return "psalms";
    case "readings":
      return "full";
    default:
      // Includes null (routine not synced) — say nothing rather than guess.
      return "none";
  }
}

// Owner: "have it in the second line of the notification include the psalms and
// the readings for the day" — now scoped to the practice, and to the SIDE.
//
// The side part is a bug fix: owner, "on the morning notification it showed the
// gospel reading too, which should only be shown for evening prayer." This read
// [lesson1, lesson2, lesson3] for BOTH sides, but the 1979 daily office splits
// them — Morning takes the OT + Epistle, Evening takes the Gospel (lesson3).
// buildOfficeOrdoDay is the selector the office ASSEMBLERS use (including the
// "Eve of …" evening fallback), so the citation now can't disagree with what
// the office will actually pray.
//
// `today` is the recipient's own local YYYY-MM-DD — constructed at noon UTC so
// the date can't drift across a UTC boundary regardless of the server's zone.
function officeReadingsLine(
  today: string,
  side: "morning" | "evening",
  level: string | null,
): string | null {
  const scope = scriptureScopeFor(level);
  if (scope === "none") return null;
  try {
    const date = new Date(`${today}T12:00:00Z`);
    const ordo = buildOfficeOrdoDay(date);
    const o = side === "evening" ? ordo.evening : ordo.morning;
    const psalms = (o.psalms ?? []).filter(Boolean);
    const lessons = scope === "psalms"
      ? []
      : (o.lessons ?? []).map((l) => l.ref).filter((r) => r && r.trim().length > 0 && !/^-+$/.test(r.trim()));
    if (psalms.length === 0 && lessons.length === 0) return null;
    const psalmLabel = psalms.length > 0 ? `Psalm${psalms.length > 1 ? "s" : ""} ${psalms.join(", ")}` : null;
    const lessonLabel = lessons.length > 0 ? lessons.join(", ") : null;
    return [psalmLabel, lessonLabel].filter(Boolean).join(" · ") || null;
  } catch {
    // Best-effort — a lectionary lookup failure should never block the push.
    return null;
  }
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
  // One clock reading for the whole fan-out — see isAtOrJustAfterMinute.
  const tickNow = new Date();
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
        // The synced routine (device localStorage mirrored via LWW) — carries
        // the side's REAL practice ("phoebe:office:level:morning" = office /
        // devotion / psalms / reflect-sit / fdd / examen / …), which the
        // reminder pref columns flatten to office|devotion. Used so the push
        // names what they actually practice.
        ruleConfig: usersTable.ruleConfig,
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

    // THE PUSH NO LONGER NAMES THE PRACTICE. (2026-07-21)
    //
    // It used to, by reconciling two mirrors of the routine — the flattened
    // pref column and the granular rule_config level — and naming whichever
    // "corroborated" the other. The 2026-07-21 audit established that BOTH
    // signals are meaningless for this purpose:
    //
    //   • `parish_office_*_pref = "devotion"` is the DB DEFAULT (schema
    //     users.ts, and migrate.ts backfilled every 'none' row to it), so
    //     every account starts there without choosing anything.
    //   • `= "office"` is only an ON/OFF SENTINEL — Settings offers just
    //     "No reminder" / "Notify me each morning" and writes "office" to
    //     mean *on* (settings.tsx, office-settings.tsx).
    //   • the granular level is stale-prone: guestSeed seeds "psalms" into
    //     both sides, and several routine writers never push an update.
    //
    // So a seeded "psalms" sat next to a default "devotion", the two matched
    // as one family, and users who had set the Daily Office were told
    // "Praying the Psalms". Two attempted guards failed because they were
    // built on the false premise above.
    //
    // Until the write path is fixed (one helper that updates the pref column
    // on every setSideLevel, so the level can be trusted outright), we send
    // the neutral copy: "Begin/Close your day in prayer". It is always true,
    // and it can never contradict what the user actually set. Passing no
    // `level` selects that fallback in sendParishOfficeReminderPush; the
    // per-practice copy map there is intact and returns the moment we have a
    // trustworthy signal to pass it.

    for (const r of rows) {
      const tz = r.parishTimezone || r.userTimezone || "America/New_York";
      const today = todayInZone(tz);

      // Shared: approximate UTC start of today in user-tz (covers UTC-14).
      const sinceUtc = new Date(`${today}T00:00:00Z`);
      sinceUtc.setUTCHours(sinceUtc.getUTCHours() - 14);

      // Morning side
      // A NULL pref means the side was never configured — treat it as OFF, the
      // same way the SQL filter above does (`NULL != 'none'` is NULL, not true).
      // Without the null check this fired a reminder for a side the user never
      // turned on, whenever the OTHER side qualified the row.
      if (r.morningPref && r.morningPref !== "none" && r.morningSentDate !== today) {
        const targetTime = r.morningTime || DEFAULT_MORNING_TIME;
        if (opts.forceNow || isAtOrJustAfterMinute(tz, targetTime, tickNow)) {
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
              const mLevel = sideLevelFromRuleConfig(r.ruleConfig, "morning");
              await sendParishOfficeReminderPush(r.userId, {
                side: "morning",
                parishTitle: r.parishTitle,
                level: mLevel,
                readingsLine: officeReadingsLine(today, "morning", mLevel),
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
      if (r.eveningPref && r.eveningPref !== "none" && r.eveningSentDate !== today) {
        const eveningTarget = r.eveningTime || FIXED_EVENING_TIME;
        const eveningInWindow = opts.forceNow || isAtOrJustAfterMinute(tz, eveningTarget, tickNow);
        // Diagnostic: on the tick where the evening window matches, record the
        // state so "why didn't my evening reminder fire?" is answerable from
        // the logs (pref, target time, already-prayed). Only when in-window so
        // we don't log every user every 15 min.
        if (eveningInWindow) {
          logger.info(
            { userId: r.userId, side: "evening", pref: r.eveningPref, target: eveningTarget, tz },
            "[office-reminder] evening in-window — evaluating",
          );
        }
        if (eveningInWindow) {
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
              const eLevel = sideLevelFromRuleConfig(r.ruleConfig, "evening");
              await sendParishOfficeReminderPush(r.userId, {
                side: "evening",
                parishTitle: r.parishTitle,
                level: eLevel,
                readingsLine: officeReadingsLine(today, "evening", eLevel),
              });
              logger.info({ userId: r.userId, pref: r.eveningPref }, "[office-reminder] evening push sent");
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

// ─── Evening office FOLLOW-UP reminder ──────────────────────────────────────
// A single SECOND nudge ~3h after the initial evening reminder, only if evening
// prayer still isn't done and it's before 10pm local. Deduped per local day via
// parish_office_evening_followup_sent_date, independent of the initial reminder.
// Opt-in: only fires for users on notification_style = 'nudge' (customizer's
// closing Notifications step / Settings → Daily reminders); the default
// "gentle" style gets just the one reminder per side, same as before this
// existed.
const EVENING_FOLLOWUP_HOURS_AFTER = 3;
const EVENING_FOLLOWUP_CUTOFF_HOUR = 22; // 10pm local — never nudge later

// Add whole hours to a HH:MM string, clamped to 23:59 (a follow-up that would
// roll past the cutoff simply never fires — the hour>=22 gate catches it).
function addHoursToHHMM(hhmm: string, hours: number): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = parseInt(hStr, 10) + hours;
  const hh = String(Math.min(23, Math.max(0, h))).padStart(2, "0");
  return `${hh}:${(mStr ?? "00").padStart(2, "0")}`;
}

export async function runParishOfficeEveningFollowUpSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  // One clock reading for the whole fan-out — see isAtOrJustAfterMinute.
  const tickNow = new Date();
  try {
    const rows = await db
      .select({
        userId: usersTable.id,
        userTimezone: usersTable.timezone,
        eveningPref: usersTable.parishOfficeEveningPref,
        eveningTime: usersTable.parishOfficeEveningTime,
        eveningSentDate: usersTable.parishOfficeEveningSentDate,
        followupSentDate: usersTable.parishOfficeEveningFollowupSentDate,
        // The follow-up names the same practice the initial reminder did.
        ruleConfig: usersTable.ruleConfig,
        parishFeedId: usersTable.parishFeedId,
        parishTitle: prayerFeedsTable.title,
        parishTimezone: prayerFeedsTable.timezone,
      })
      .from(usersTable)
      .leftJoin(prayerFeedsTable, and(
        eq(prayerFeedsTable.id, usersTable.parishFeedId),
        eq(prayerFeedsTable.kind, "parish"),
      ))
      .where(sql`${usersTable.parishOfficeEveningPref} != 'none' AND ${usersTable.notificationStyle} = 'nudge'`);

    for (const r of rows) {
      try {
        const tz = r.parishTimezone || r.userTimezone || "America/New_York";
        const today = todayInZone(tz);
        // At most one follow-up per local day; and only after the INITIAL evening
        // reminder has been evaluated today (so we truly follow up on a sent nudge).
        if (r.followupSentDate === today) continue;
        if (r.eveningSentDate !== today) continue;
        // Before 10pm local only.
        const { hour } = getCurrentTimeInTz(tz);
        if (hour >= EVENING_FOLLOWUP_CUTOFF_HOUR) continue;
        // ~2h after the (per-user) evening target time.
        const eveningTarget = r.eveningTime || FIXED_EVENING_TIME;
        const followupTarget = addHoursToHHMM(eveningTarget, EVENING_FOLLOWUP_HOURS_AFTER);
        if (!opts.forceNow && !isAtOrJustAfterMinute(tz, followupTarget, tickNow)) continue;

        // Still not prayed? (approximate UTC start of today in user-tz; covers UTC-14)
        const sinceUtc = new Date(`${today}T00:00:00Z`);
        sinceUtc.setUTCHours(sinceUtc.getUTCHours() - 14);
        const eveningSessions = await db
          .select({ endedAt: prayerSessionsTable.endedAt })
          .from(prayerSessionsTable)
          .where(and(
            eq(prayerSessionsTable.userId, r.userId),
            inArray(prayerSessionsTable.surface, ["evening-prayer", "early-evening-devotion"]),
            gte(prayerSessionsTable.endedAt, sinceUtc),
          ));
        const prayedEveningToday = eveningSessions.some(s => {
          if (!s.endedAt) return false;
          return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(s.endedAt) === today;
        });
        if (prayedEveningToday) {
          // Already prayed — stamp so we don't re-evaluate this user today.
          await db.update(usersTable).set({ parishOfficeEveningFollowupSentDate: today }).where(eq(usersTable.id, r.userId));
          continue;
        }
        try {
          const fLevel = sideLevelFromRuleConfig(r.ruleConfig, "evening");
          await sendParishOfficeReminderPush(r.userId, { side: "evening", parishTitle: r.parishTitle, level: fLevel, readingsLine: officeReadingsLine(today, "evening", fLevel) });
          logger.info({ userId: r.userId }, "[office-reminder] evening FOLLOW-UP push sent");
          await db.update(usersTable).set({ parishOfficeEveningFollowupSentDate: today }).where(eq(usersTable.id, r.userId));
        } catch (err) {
          logger.warn({ err, userId: r.userId }, "[office-reminder] evening follow-up push failed");
        }
      } catch (err) {
        logger.error({ err, userId: r.userId }, "[office-reminder] evening follow-up processing failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "[office-reminder] evening follow-up sender failed");
  }
}

// ─── Morning office FOLLOW-UP reminder ──────────────────────────────────────
// Mirrors the evening follow-up above for the morning side: a single SECOND
// nudge ~3h after the initial morning reminder, only if morning prayer still
// isn't done and it's before the cutoff hour. Deduped per local day via
// parish_office_morning_followup_sent_date. Opt-in via notification_style =
// 'nudge', same gate as the evening follow-up.
const MORNING_FOLLOWUP_HOURS_AFTER = 3;
const MORNING_FOLLOWUP_CUTOFF_HOUR = 12; // noon local — a morning nudge past midday stops making sense

export async function runParishOfficeMorningFollowUpSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  // One clock reading for the whole fan-out — see isAtOrJustAfterMinute.
  const tickNow = new Date();
  try {
    const rows = await db
      .select({
        userId: usersTable.id,
        userTimezone: usersTable.timezone,
        morningPref: usersTable.parishOfficeMorningPref,
        morningTime: usersTable.parishOfficeMorningTime,
        morningSentDate: usersTable.parishOfficeMorningSentDate,
        followupSentDate: usersTable.parishOfficeMorningFollowupSentDate,
        // The follow-up names the same practice the initial reminder did.
        ruleConfig: usersTable.ruleConfig,
        parishFeedId: usersTable.parishFeedId,
        parishTitle: prayerFeedsTable.title,
        parishTimezone: prayerFeedsTable.timezone,
      })
      .from(usersTable)
      .leftJoin(prayerFeedsTable, and(
        eq(prayerFeedsTable.id, usersTable.parishFeedId),
        eq(prayerFeedsTable.kind, "parish"),
      ))
      .where(sql`${usersTable.parishOfficeMorningPref} != 'none' AND ${usersTable.notificationStyle} = 'nudge'`);

    for (const r of rows) {
      try {
        const tz = r.parishTimezone || r.userTimezone || "America/New_York";
        const today = todayInZone(tz);
        // At most one follow-up per local day; and only after the INITIAL morning
        // reminder has been evaluated today (so we truly follow up on a sent nudge).
        if (r.followupSentDate === today) continue;
        if (r.morningSentDate !== today) continue;
        // Before noon local only.
        const { hour } = getCurrentTimeInTz(tz);
        if (hour >= MORNING_FOLLOWUP_CUTOFF_HOUR) continue;
        // ~3h after the (per-user) morning target time.
        const morningTarget = r.morningTime || DEFAULT_MORNING_TIME;
        const followupTarget = addHoursToHHMM(morningTarget, MORNING_FOLLOWUP_HOURS_AFTER);
        if (!opts.forceNow && !isAtOrJustAfterMinute(tz, followupTarget, tickNow)) continue;

        // Still not prayed? (approximate UTC start of today in user-tz; covers UTC-14)
        const sinceUtc = new Date(`${today}T00:00:00Z`);
        sinceUtc.setUTCHours(sinceUtc.getUTCHours() - 14);
        const morningSessions = await db
          .select({ endedAt: prayerSessionsTable.endedAt })
          .from(prayerSessionsTable)
          .where(and(
            eq(prayerSessionsTable.userId, r.userId),
            inArray(prayerSessionsTable.surface, ["morning-prayer", "morning-devotion"]),
            gte(prayerSessionsTable.endedAt, sinceUtc),
          ));
        const prayedMorningToday = morningSessions.some(s => {
          if (!s.endedAt) return false;
          return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(s.endedAt) === today;
        });
        if (prayedMorningToday) {
          // Already prayed — stamp so we don't re-evaluate this user today.
          await db.update(usersTable).set({ parishOfficeMorningFollowupSentDate: today }).where(eq(usersTable.id, r.userId));
          continue;
        }
        try {
          const fLevel = sideLevelFromRuleConfig(r.ruleConfig, "morning");
          await sendParishOfficeReminderPush(r.userId, { side: "morning", parishTitle: r.parishTitle, level: fLevel, readingsLine: officeReadingsLine(today, "morning", fLevel) });
          logger.info({ userId: r.userId }, "[office-reminder] morning FOLLOW-UP push sent");
          await db.update(usersTable).set({ parishOfficeMorningFollowupSentDate: today }).where(eq(usersTable.id, r.userId));
        } catch (err) {
          logger.warn({ err, userId: r.userId }, "[office-reminder] morning follow-up push failed");
        }
      } catch (err) {
        logger.error({ err, userId: r.userId }, "[office-reminder] morning follow-up processing failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "[office-reminder] morning follow-up sender failed");
  }
}

// ─── Daily contemplation goal — ~7pm "haven't hit your goal" nudge ──────────
// Fires for any user with contemplation_goal_minutes > 0. At ~19:00 in their
// timezone, if today's logged contemplation minutes are still below the goal,
// send one gentle nudge. Deduped per local day via contemplation_goal_sent_date
// (stamped on a successful send, or when the goal is already met).
const CONTEMPLATION_GOAL_TIME = "20:30";

// ── VTS Dean's Commentary — a daily nudge for readers who follow it ─────────
// Owner: a Dean's Commentary notification carrying today's scraped headline.
//
// Audience is the synced routine's reflection source — the SAME keys the client
// uses to decide whether to render the Dean's Commentary card, so a user who
// sees the card is exactly the user who gets the push. Weekdays only: VTS
// doesn't publish Sat/Sun, and the feed just keeps serving Friday's post, so a
// weekend send would nudge them toward something they already read.
const VTS_PUSH_TIME = "08:00";

function followsVts(ruleConfig: unknown): boolean {
  try {
    const values = (ruleConfig as { values?: Record<string, string> } | null)?.values;
    if (!values) return false;
    return values["phoebe:office:reflection-source"] === "vts"
      || values["phoebe:office:reflection:morning"] === "vts"
      || values["phoebe:office:reflection:evening"] === "vts";
  } catch { return false; }
}

export async function runVtsCommentarySender(opts: { forceNow?: boolean } = {}): Promise<void> {
  try {
    const rows = await db
      .select({
        userId: usersTable.id,
        userTimezone: usersTable.timezone,
        ruleConfig: usersTable.ruleConfig,
      })
      .from(usersTable);

    // One feed fetch for the whole fan-out (routes/vts.ts caches per day), and
    // only when someone actually qualifies — no network call on a quiet tick.
    let meta: { url: string; title: string } | null = null;

    for (const r of rows) {
      try {
        if (!followsVts(r.ruleConfig)) continue;
        const tz = r.userTimezone || "America/New_York";
        if (!opts.forceNow) {
          // Weekday check in the RECIPIENT's zone — "is it a weekday" differs
          // by timezone around midnight, and the wrong answer here sends a
          // Saturday push.
          const dow = new Date(
            new Date().toLocaleString("en-US", { timeZone: tz }),
          ).getDay();
          if (dow === 0 || dow === 6) continue;
          if (!isWithinTickWindow(tz, VTS_PUSH_TIME)) continue;
        }
        const today = todayInZone(tz);
        const dedupeKey = `${today}-vts`;

        const [already] = await db
          .select({ id: bellNotificationsTable.id })
          .from(bellNotificationsTable)
          .where(and(
            eq(bellNotificationsTable.userId, r.userId),
            eq(bellNotificationsTable.bellDate, dedupeKey),
          ));
        if (already) continue;

        // Already read it today (any device) — nothing to nudge toward.
        const [read] = await db
          .select({ id: reflectionReadsTable.id })
          .from(reflectionReadsTable)
          .where(and(
            eq(reflectionReadsTable.userId, r.userId),
            eq(reflectionReadsTable.source, "vts"),
            eq(reflectionReadsTable.ymd, today),
          ));
        if (read) continue;

        if (!meta) meta = await resolveTodayVts();

        // Dedupe row goes in only AFTER a successful send, so a transient APNs
        // failure retries next tick instead of muting the day (same rule the
        // daily bell above follows).
        try {
          await sendVtsCommentaryPush(r.userId, { articleTitle: meta.title });
        } catch (err) {
          logger.warn({ err, userId: r.userId }, "[vts-push] dispatch failed — not deduping so we retry");
          continue;
        }
        await db.insert(bellNotificationsTable).values({
          userId: r.userId,
          bellDate: dedupeKey,
          sentAt: new Date(),
        });
        logger.info({ userId: r.userId, day: today }, "[vts-push] sent Dean's Commentary");
      } catch (err) {
        logger.error({ err, userId: r.userId }, "[vts-push] user processing failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "[vts-push] sender failed");
  }
}

export async function runContemplationGoalSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  // DISABLED — this fired "you haven't hit your contemplation goal" at ~7pm, a
  // DEFICIT reminder (it nudges BECAUSE you fell short), the opposite of a bell
  // that calls you TO the practice at its hour. Silence is an invitation, not a
  // quota: the Customizer now frames the minutes as a chosen sit length, never a
  // daily target. The "sit at your chosen time" reminder (the bell) is separate
  // and still fires. Left as a no-op (body kept) so the scheduler wiring and an
  // easy revert both stay intact.
  if (!opts.forceNow || true) return;
  try {
    const rows = await db
      .select({
        userId: usersTable.id,
        userTimezone: usersTable.timezone,
        goalMinutes: usersTable.contemplationGoalMinutes,
        reminderEnabled: usersTable.contemplationReminderEnabled,
        sentDate: usersTable.contemplationGoalSentDate,
      })
      .from(usersTable)
      .where(sql`${usersTable.contemplationGoalMinutes} > 0 AND ${usersTable.contemplationReminderEnabled} = true`);

    for (const r of rows) {
      const goalMinutes = r.goalMinutes ?? 0;
      if (goalMinutes <= 0 || !r.reminderEnabled) continue;

      const tz = r.userTimezone || "America/New_York";
      const today = todayInZone(tz);
      if (r.sentDate === today) continue;
      if (!opts.forceNow && !isWithinTickWindow(tz, CONTEMPLATION_GOAL_TIME)) continue;

      // Sum today's contemplation seconds in the user's LOCAL day. Approximate
      // UTC start of today (covers UTC-14) to bound the scan, then filter to
      // the tz-local calendar day — same approach the office sender uses.
      const sinceUtc = new Date(`${today}T00:00:00Z`);
      sinceUtc.setUTCHours(sinceUtc.getUTCHours() - 14);
      const sits = await db
        .select({
          endedAt: prayerSessionsTable.endedAt,
          durationSeconds: prayerSessionsTable.durationSeconds,
        })
        .from(prayerSessionsTable)
        .where(
          and(
            eq(prayerSessionsTable.userId, r.userId),
            eq(prayerSessionsTable.surface, "contemplation"),
            gte(prayerSessionsTable.endedAt, sinceUtc),
          ),
        );
      let secondsToday = 0;
      for (const s of sits) {
        if (!s.endedAt) continue;
        if (new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(s.endedAt) === today) {
          secondsToday += s.durationSeconds ?? 0;
        }
      }
      // "Done today" is derived ONLY from the user's in-app contemplation
      // sits (prayer_sessions). Apple Health / external mindful minutes are no
      // longer read or folded in.
      const doneMinutes = Math.floor(secondsToday / 60);

      if (doneMinutes >= goalMinutes) {
        // Goal already met — stamp so we don't re-evaluate on later ticks.
        await db
          .update(usersTable)
          .set({ contemplationGoalSentDate: today })
          .where(eq(usersTable.id, r.userId));
        continue;
      }

      try {
        await sendContemplationGoalReminderPush(r.userId, { goalMinutes, doneMinutes });
        await db
          .update(usersTable)
          .set({ contemplationGoalSentDate: today })
          .where(eq(usersTable.id, r.userId));
      } catch (err) {
        // No stamp on failure → a later tick within the window may retry.
        logger.warn({ err, userId: r.userId }, "[contemplation-goal] push failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "[contemplation-goal] sender failed");
  }
}

// ─── Weekly Way of Love review — Sunday-evening examen nudge ─────────────────
// Once a week (Sunday ~20:00 in the user's tz) invite beta users who've opted in
// to look back on the week and set the one ahead. Skipped if they already did
// the review this week (a `weekly_review` practice_completion for this Sunday's
// weekStart). Deduped per Sunday via weekly_review_nudge_sent_date.
const WEEKLY_REVIEW_TIME = "20:00";

export async function runWeeklyReviewSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  try {
    const rows = await db
      .select({
        userId: usersTable.id,
        userTimezone: usersTable.timezone,
        sentDate: usersTable.weeklyReviewNudgeSentDate,
      })
      .from(usersTable)
      .innerJoin(betaUsersTable, sql`LOWER(${usersTable.email}) = LOWER(${betaUsersTable.email})`)
      .where(eq(usersTable.weeklyReviewReminder, true));

    for (const r of rows) {
      const tz = r.userTimezone || "America/New_York";
      // Sundays only (dow 0), within the ~20:00 tick window.
      if (!opts.forceNow) {
        if (dowInTz(tz) !== 0) continue;
        if (!isWithinTickWindow(tz, WEEKLY_REVIEW_TIME)) continue;
      }
      const today = todayInZone(tz);
      if (r.sentDate === today) continue;

      // Already reviewed this week? Then just stamp and skip the nudge.
      // The client records weekly_review keyed to this week's Sunday, which
      // equals `today` on a real Sunday tick but not when forceNow fires the
      // sender off-Sunday — so match on the computed weekStart, not today.
      const weekStart = weekStartInZone(tz);
      const reviewed = await db
        .select({ userId: practiceCompletionTable.userId })
        .from(practiceCompletionTable)
        .where(
          and(
            eq(practiceCompletionTable.userId, r.userId),
            eq(practiceCompletionTable.section, "weekly_review"),
            eq(practiceCompletionTable.weekStart, weekStart),
          ),
        )
        .limit(1);
      if (reviewed.length > 0) {
        await db.update(usersTable).set({ weeklyReviewNudgeSentDate: today }).where(eq(usersTable.id, r.userId));
        continue;
      }

      try {
        await sendWeeklyReviewPush(r.userId);
        await db.update(usersTable).set({ weeklyReviewNudgeSentDate: today }).where(eq(usersTable.id, r.userId));
      } catch (err) {
        logger.warn({ err, userId: r.userId }, "[weekly-review] push failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "[weekly-review] sender failed");
  }
}

// ─── Weekly routine audit — Sunday-evening "does your rule still fit?" ───────
//
// Owner: "the app once a week would analyze that data compared to what they
// have programmed, and make suggestions how to adjust it."
//
// SUPER ADMINS ONLY (owner: "this should be only for super admins"), matching
// the gate on both /me/routine-audit endpoints. The join to beta_users is what
// enforces it here, so the sender can't outlive the page's own restriction.
//
// The audit RUNS before the push is sent, and no push goes out when it finds
// nothing. A notification that opens a page saying "your rule matches your
// week" spends someone's attention to tell them nothing — and for a suggestion
// feature, being silent when there's nothing to suggest is most of what makes
// it tolerable weekly. It costs one query per admin per Sunday; at super-admin
// scale that's nothing, and it's the only way to know whether to send.
const ROUTINE_AUDIT_TIME = "19:00";

export async function runRoutineAuditSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  try {
    const rows = await db
      .select({
        userId: usersTable.id,
        userTimezone: usersTable.timezone,
        sentDate: usersTable.routineAuditNudgeSentDate,
      })
      .from(usersTable)
      .innerJoin(betaUsersTable, sql`LOWER(${usersTable.email}) = LOWER(${betaUsersTable.email})`)
      .where(eq(betaUsersTable.isAdmin, true));

    for (const r of rows) {
      const tz = r.userTimezone || "America/New_York";
      if (!opts.forceNow) {
        if (dowInTz(tz) !== 0) continue;                      // Sundays only
        if (!isWithinTickWindow(tz, ROUTINE_AUDIT_TIME)) continue;
      }
      const today = todayInZone(tz);
      if (r.sentDate === today) continue;

      try {
        const findings = await buildRoutineAudit(r.userId);
        // Stamp either way: a quiet week is a decided outcome, not a retry.
        // Without this the next tick would re-run the audit for everyone whose
        // rule already fits, every 15 minutes until Sunday ends.
        await db.update(usersTable)
          .set({ routineAuditNudgeSentDate: today })
          .where(eq(usersTable.id, r.userId));
        if (findings.length === 0) continue;
        await sendRoutineAuditPush(r.userId, { count: findings.length });
      } catch (err) {
        logger.warn({ err, userId: r.userId }, "[routine-audit] push failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "[routine-audit] sender failed");
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

let bellInterval: ReturnType<typeof setInterval> | null = null;
let officeReminderInterval: ReturnType<typeof setInterval> | null = null;

// Each sender wrapped via withSchedulerLog: insert a "running" row in
// scheduler_runs at start, update to "completed" or "failed" at end.
// Failures also push to Sentry tagged with the sender name so issues
// land per-sender (not in one giant "scheduler error" bucket).
//
// To audit "did the bell sender run today?":
//   SELECT sender_name, started_at, duration_ms, status, error_message
//   FROM scheduler_runs
//   WHERE sender_name = 'bell' AND started_at::date = CURRENT_DATE
//   ORDER BY started_at DESC;
const SCHEDULER_SENDERS: Array<{ name: string; run: () => Promise<void> }> = [
  { name: "bell",                  run: runBellSender },
  { name: "bell-evening",          run: runEveningNudgeSender },
  // The "your prayer is wrapping up tomorrow" renewal nudge is intentionally
  // NOT scheduled — per request, a prayer request should only ever notify when
  // it's finished/answered, never a wrapping-up reminder. (runPrayerRenewalNudge
  // -Sender is kept for manual/forceNow use but no longer fires on the cron.)
  // The life-event "how did it go?" follow-up push is intentionally NOT
  // scheduled — per request, we don't notify when your prayer request is over.
  // (runLifeEventFollowUpSender is kept for manual/forceNow use but no longer
  // fires on the cron.)
  // { name: "life-event-followup",   run: runLifeEventFollowUpSender },
  // parish-office / parish-office-followup / parish-office-morning-followup
  // moved to their OWN 1-minute interval below (officeReminderInterval) —
  // owner: "if someone picks seven thirty AM, we want it to be sent at seven
  // thirty AM," which needs a tick fine enough to land on the user's chosen
  // minute, not this list's 15-minute cadence.
  { name: "contemplation-goal",    run: runContemplationGoalSender },
  // VTS Dean's Commentary — weekday ~8am nudge for readers who follow it.
  { name: "vts-commentary",        run: runVtsCommentarySender },
  // Weekly review + weekly digest are turned OFF for now (the settings
  // UI for both was removed). Re-add these lines to bring them back.
  // { name: "weekly-review",         run: runWeeklyReviewSender },
  // Weekly routine audit — Sunday ~19:00, super admins only, and silent when
  // the audit finds nothing.
  { name: "routine-audit",         run: runRoutineAuditSender },
  { name: "gathering-reminder",    run: runGatheringReminderSender },
  { name: "feed-event-reminder",   run: runFeedEventReminderSender },
  { name: "feed-intercession-push", run: runFeedIntercessionPushSender },
  // { name: "digest",                run: runWeeklyDigestSender },
  { name: "retention-cleanup",     run: runRetentionCleanupSender },
];

// Morning/evening office reminders + their two follow-ups — split onto their
// own 1-minute tick so a reminder lands on the user's chosen minute, instead
// of the ±15 spread the shared 15-minute SCHEDULER_SENDERS tick allowed.
// Each sender's own per-day sent-date columns dedup, so ticking 15x more
// often can't double-send. The tick is only a SAMPLING rate, never the
// correctness guarantee — isAtOrJustAfterMinute's grace window is what
// ensures a drifted or slow tick still catches every user.
const OFFICE_REMINDER_SENDERS: Array<{ name: string; run: () => Promise<void> }> = [
  { name: "parish-office",         run: runParishOfficeReminderSender },
  { name: "parish-office-followup", run: runParishOfficeEveningFollowUpSender },
  { name: "parish-office-morning-followup", run: runParishOfficeMorningFollowUpSender },
];

// Senders currently mid-run. The office reminders tick every 60 SECONDS, but a
// fan-out over the whole user base is serial and can take longer than that —
// and dedupe is a read-then-write (the sent-date is stamped AFTER the push), so
// an overlapping tick re-reads the same unstamped rows and sends the reminder
// again, up to once a minute across the grace window. A name-keyed in-flight
// guard is the cheap half of the fix; the APNs timeout is the other half.
const inFlight = new Set<string>();

function fireSenderList(senders: Array<{ name: string; run: () => Promise<void> }>): void {
  for (const sender of senders) {
    if (inFlight.has(sender.name)) {
      logger.warn({ sender: sender.name }, "[scheduler] previous run still in flight — skipping this tick");
      continue;
    }
    // withSchedulerLog already swallows exceptions internally so a
    // failure in one sender doesn't break the others. We still
    // attach a tail .catch as belt-and-suspenders for the case
    // where the heartbeat insert itself throws synchronously.
    inFlight.add(sender.name);
    void withSchedulerLog(sender.name, sender.run)
      .catch(() => { /* unreachable — withSchedulerLog never rejects */ })
      .finally(() => { inFlight.delete(sender.name); });
  }
}

export function startBellScheduler(): void {
  if (bellInterval) return;
  logger.info("[bell-scheduler] started — first run in 45s, then every 15 min; office reminders every 1 min");
  setTimeout(() => fireSenderList(SCHEDULER_SENDERS), 45_000);
  bellInterval = setInterval(() => fireSenderList(SCHEDULER_SENDERS), 15 * 60 * 1000);
  setTimeout(() => fireSenderList(OFFICE_REMINDER_SENDERS), 15_000);
  officeReminderInterval = setInterval(() => fireSenderList(OFFICE_REMINDER_SENDERS), 60 * 1000);
}
