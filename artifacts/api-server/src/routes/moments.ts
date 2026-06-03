import { getInviteBaseUrl } from "../lib/urls";
import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db, ritualsTable, inviteTokensTable, usersTable, meetupsTable,
  sharedMomentsTable, momentUserTokensTable, momentPostsTable, momentWindowsTable,
  momentCalendarEventsTable, momentRenewalsTable, userConnectionsCacheTable,
  lectioReflectionsTable, groupsTable, groupMembersTable, momentGroupsTable,
  prayerFeedSubscriptionsTable, prayerFeedsTable, betaUsersTable,
  prayerRequestsTable, prayerRequestAmensTable,
} from "@workspace/db";
import { pool } from "@workspace/db";
import { createCalendarEvent as _createCalendarEvent, deleteCalendarEvent, createAllDayCalendarEvent as _createAllDayCalendarEvent, addAttendeesToCalendarEvent, removeAttendeesFromCalendarEvent, getCalendarEvent, updateCalendarEvent } from "../lib/calendar";
import { getReadingForSunday, nextSundayDate } from "../lib/rclLectionary";
import { reconcileGroupPracticeMembers, reconcileFeedPracticeMembers } from "./groups";
import { getGardenUserIds } from "../lib/garden";
import { sendNewGroupMomentPush, sendIntercessionGoalReachedPush } from "../lib/pushSender";
import { perUserRateLimit } from "../lib/rate-limit";
import crypto from "crypto";
import { broadcastLog } from "../lib/ws";

// ─── Bell-aware calendar creation ───────────────────────────────────────────
// Users with the Daily Bell enabled use a single bell event instead of
// individual per-practice calendar events. These wrappers filter out
// bell-enabled users from attendee lists so others still receive invites.

async function isEmailBellEnabled(email: string): Promise<boolean> {
  try {
    const lower = email.toLowerCase();
    const userResult = await pool.query(`SELECT bell_enabled FROM users WHERE LOWER(email) = $1`, [lower]);
    return userResult.rows.length > 0 && userResult.rows[0].bell_enabled === true;
  } catch { return false; }
}

async function filterBellAttendees(attendees: string[] | undefined): Promise<string[]> {
  if (!attendees || attendees.length === 0) return [];
  const filtered: string[] = [];
  for (const email of attendees) {
    if (!(await isEmailBellEnabled(email))) filtered.push(email);
  }
  return filtered;
}

async function createCalendarEvent(userId: number, opts: Parameters<typeof _createCalendarEvent>[1]): Promise<string | null> {
  const attendees = await filterBellAttendees(opts.attendees);
  if (attendees.length === 0) return null; // all attendees use the bell
  return _createCalendarEvent(userId, { ...opts, attendees });
}

async function createAllDayCalendarEvent(userId: number, opts: Parameters<typeof _createAllDayCalendarEvent>[1]): Promise<string | null> {
  const attendees = await filterBellAttendees(opts.attendees);
  if (attendees.length === 0) return null;
  return _createAllDayCalendarEvent(userId, { ...opts, attendees });
}

// ─── Moment management auth ──────────────────────────────────────────────────
//
// "Can this user manage (edit / archive / delete) this moment?"
//
//   - The creator (smallest-id token, identified by email) always can.
//   - Any admin or hidden-admin of the moment's PRIMARY group also can.
//     This is the rule the user spec'd for community intercessions:
//     once an admin schedules one in their parish, every other admin
//     of that parish can edit or delete it.
//   - Admins of SECONDARY (junction) groups do NOT inherit edit/delete.
//     They can only detach their own group via
//     DELETE /moments/:id/groups/:groupId.
//
// Used by PATCH /moments/:id, PATCH /moments/:id/goal,
// PATCH /moments/:id/archive, PATCH /moments/:id/unarchive,
// DELETE /moments/:id.
async function canManageMoment(opts: {
  userId: number;
  userEmail: string;
  momentId: number;
  primaryGroupId: number | null;
}): Promise<boolean> {
  // Creator check — same "smallest-id token by email" rule used
  // throughout the moments routes (line 3704, line 2630).
  const tokens = await db
    .select({ id: momentUserTokensTable.id, email: momentUserTokensTable.email })
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, opts.momentId));
  if (tokens.length > 0) {
    const creator = tokens.reduce((min, t) => (t.id < min.id ? t : min), tokens[0]);
    if (creator.email.toLowerCase() === opts.userEmail.toLowerCase()) return true;
  }
  // Primary-group admin check.
  if (opts.primaryGroupId != null) {
    const [adminRow] = await db
      .select({ id: groupMembersTable.id })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, opts.primaryGroupId),
        eq(groupMembersTable.userId, opts.userId),
        sql`${groupMembersTable.role} IN ('admin', 'hidden_admin')`,
      ))
      .limit(1);
    if (adminRow) return true;
  }
  return false;
}

// Monastic wisdom: depth over breadth. A person may only hold three Lectio
// Divina groups at once — the discipline is to go deep with a few, not shallow
// with many.
const LECTIO_GROUP_LIMIT = 3;

const router: IRouter = Router();

// ─── /moments read-path reconcile cooldown ───────────────────────────────────
// GET /api/moments used to reconcile every group- and feed-linked practice on
// EVERY read — a heavy write fan-out on one of the hottest dashboard paths.
// Write paths (join/leave/subscribe, publish, roster edits) already reconcile
// synchronously, so the read-time reconcile is only a freshness safety net for
// drift the write paths somehow missed. We keep that safety net but throttle it
// to at most once per user per minute: the first /moments call after the TTL
// reconciles and refreshes the response, subsequent calls within the window
// serve straight from existing tokens. Memory-only (resets on deploy), which is
// fine — a deploy just means everyone reconciles once on their next load.
const RECONCILE_TTL_MS = 60_000;
// Bound the map so a long-lived instance serving many distinct users can't grow
// it without limit. Entries are just a last-reconciled timestamp per user.
const RECONCILE_CACHE_MAX = 50_000;
const lastReconciledByUser = new Map<number, number>();

function generateToken() {
  return crypto.randomBytes(16).toString("hex");
}

// Saves bidirectional connection pairs between all members (so recommendations persist after deletion).
async function saveConnectionCache(members: Array<{ email: string; name: string | null }>) {
  if (members.length < 2) return;
  try {
    const pairs: Array<[string, string, string | null]> = [];
    for (const a of members) {
      for (const b of members) {
        if (a.email !== b.email) pairs.push([a.email, b.email, b.name]);
      }
    }
    if (pairs.length === 0) return;
    await db.execute(
      sql`INSERT INTO user_connections_cache (user_email, contact_email, contact_name, last_seen_at)
          VALUES ${sql.join(
            pairs.map(([ue, ce, cn]) => sql`(${ue}, ${ce}, ${cn}, NOW())`),
            sql`, `
          )}
          ON CONFLICT (user_email, contact_email) DO UPDATE
            SET contact_name = EXCLUDED.contact_name, last_seen_at = NOW()`
    );
  } catch { /* non-fatal */ }
}

// ─── Timezone-aware time helpers ─────────────────────────────────────────────

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

// ─── Current window date (YYYY-MM-DD) — falls back to UTC ───────────────────
function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Is the posting window currently open? — all-day for all practices ────────
// Log any time on a practice day.
function isWindowOpen(_moment: { scheduledTime: string; windowMinutes: number; timezone?: string | null }): boolean {
  return true;
}

// ─── Day-of-week check (timezone-aware) ──────────────────────────────────────
const RRULE_DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DOW_LC: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function getCurrentDayOfWeekInTz(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).formatToParts(new Date());
    const name = (parts.find(p => p.type === "weekday")?.value ?? "").toLowerCase();
    return DOW_LC[name] ?? new Date().getDay();
  } catch { return new Date().getDay(); }
}

function isPracticeDayInTz(moment: { frequency: string; dayOfWeek?: string | null; practiceDays?: string | null; timezone?: string | null }): boolean {
  if (moment.frequency !== "weekly") return true;
  const todayDow = getCurrentDayOfWeekInTz(moment.timezone || "UTC");
  // Check practiceDays JSON array (RRULE codes like ["MO","WE"])
  if (moment.practiceDays) {
    try {
      const days: string[] = JSON.parse(moment.practiceDays);
      if (days.length > 0) {
        return days.some(d => {
          const up = d.toUpperCase(); if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === todayDow;
          return DOW_LC[d.toLowerCase()] === todayDow;
        });
      }
    } catch { /* ignore */ }
  }
  // Fallback: single dayOfWeek
  if (moment.dayOfWeek) {
    const up = moment.dayOfWeek.toUpperCase();
    if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === todayDow;
    return DOW_LC[moment.dayOfWeek.toLowerCase()] === todayDow;
  }
  return true;
}

// ─── Combined open check: must be both a practice day AND within window ───────
function computeWindowOpen(moment: { scheduledTime: string; windowMinutes: number; timezone?: string | null; frequency: string; dayOfWeek?: string | null; practiceDays?: string | null }): boolean {
  if (!isPracticeDayInTz(moment)) return false;
  return isWindowOpen(moment);
}

// ─── Day-of-month in tz — used by fasting's monthly option ───────────────────
function getCurrentDayOfMonthInTz(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).formatToParts(new Date());
    return parseInt(parts.find(p => p.type === "day")?.value ?? "1", 10);
  } catch { return new Date().getDate(); }
}

// ─── Is a fasting practice actionable on a date offset from today? ────────────
// Fasts store their cadence in their own fields (`fastingFrequency`,
// `fastingDate`, `fastingDay`, `fastingDayOfMonth`) — `frequency`/`dayOfWeek`
// aren't always mirrored, so the generic path misroutes them. We check the
// fasting-specific fields directly.
function isFastingActionableOnOffset(moment: {
  fastingFrequency?: string | null;
  fastingDate?: string | null;
  fastingDay?: string | null;
  fastingDayOfMonth?: number | null;
  timezone?: string | null;
}, dayOffset: number): boolean {
  const tz = moment.timezone || "UTC";
  if (moment.fastingFrequency === "specific" && moment.fastingDate) {
    // Compute the target date-in-tz `dayOffset` days from now.
    const target = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
    const targetStr = (() => {
      try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(target); }
      catch { return target.toISOString().slice(0, 10); }
    })();
    return targetStr === moment.fastingDate;
  }
  if (moment.fastingFrequency === "weekly" && moment.fastingDay) {
    const todayDow = getCurrentDayOfWeekInTz(tz);
    const targetDow = (todayDow + dayOffset + 7) % 7;
    const wanted = DOW_LC[moment.fastingDay.toLowerCase()];
    return wanted !== undefined && wanted === targetDow;
  }
  if (moment.fastingFrequency === "monthly" && moment.fastingDayOfMonth) {
    // Approximate — check target's day-of-month in tz. For dayOffset 0/1 this
    // is exact; longer offsets would need calendar math (not needed here).
    const target = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
    const dom = (() => {
      try {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).formatToParts(target);
        return parseInt(parts.find(p => p.type === "day")?.value ?? "0", 10);
      } catch { return target.getDate(); }
    })();
    return dom === moment.fastingDayOfMonth;
  }
  return false;
}

// ─── Is this practice actionable TODAY for dashboard bucketing? ──────────────
// Separate from windowOpen because: (a) lectio-divina has a weekday-across-the-
// week rhythm that doesn't map to a single "today" window, and (b) the user's
// stated intent is "all active practices show up on the home screen today" —
// so we deliberately don't gate by time-of-day bands here. Time-of-day gating
// (intercession morning window, etc.) belongs on the detail page, not the card.
function isActionableToday(moment: {
  templateType: string | null;
  frequency: string;
  dayOfWeek?: string | null;
  practiceDays?: string | null;
  timezone?: string | null;
  fastingFrequency?: string | null;
  fastingDate?: string | null;
  fastingDay?: string | null;
  fastingDayOfMonth?: number | null;
}): boolean {
  // Lectio Divina: actionable on the three stage days (Mon/Wed/Fri) only.
  // Tue/Thu/Sat are evening-reminder catch-up days, not primary action days,
  // so they shouldn't surface a "Today" card. Sunday is the communal reveal.
  if (moment.templateType === "lectio-divina") {
    const dow = getCurrentDayOfWeekInTz(moment.timezone || "UTC");
    return dow === 1 || dow === 3 || dow === 5;
  }
  // Fasting: day-of-cadence lives in its own fields. Specific-date fasts are
  // only "today" on their exact date; weekly fasts on their weekday; monthly
  // on their day-of-month.
  if (moment.templateType === "fasting") {
    return isFastingActionableOnOffset(moment, 0);
  }
  // Everything else: actionable iff it's a practice day in the practice's TZ.
  // Daily practices are always actionable; weekly practices only on their day.
  return isPracticeDayInTz(moment);
}

// ─── Is this practice actionable TOMORROW? ───────────────────────────────────
// Parallel to isActionableToday, but looks one day ahead in the practice's TZ.
// Used by the beta-only "Tomorrow" dashboard section so users see what's on
// the horizon without waiting for the day to flip. For daily practices this
// is always true; for weekly practices it's true iff tomorrow's DOW matches.
function isActionableTomorrow(moment: {
  templateType: string | null;
  frequency: string;
  dayOfWeek?: string | null;
  practiceDays?: string | null;
  timezone?: string | null;
  fastingFrequency?: string | null;
  fastingDate?: string | null;
  fastingDay?: string | null;
  fastingDayOfMonth?: number | null;
}): boolean {
  const tz = moment.timezone || "UTC";
  const todayDow = getCurrentDayOfWeekInTz(tz);
  const tomorrowDow = (todayDow + 1) % 7;

  if (moment.templateType === "lectio-divina") {
    // Only flag the next fresh stage day (Mon/Wed/Fri). Tue/Thu/Sat are
    // evening catch-up days, not the next "window".
    return tomorrowDow === 1 || tomorrowDow === 3 || tomorrowDow === 5;
  }
  // Fasting: cadence lives in fasting-specific fields.
  if (moment.templateType === "fasting") {
    return isFastingActionableOnOffset(moment, 1);
  }
  if (moment.frequency !== "weekly") return true;
  // Weekly: check practiceDays (RRULE codes) or fallback dayOfWeek against tomorrow's DOW.
  if (moment.practiceDays) {
    try {
      const days: string[] = JSON.parse(moment.practiceDays);
      if (days.length > 0) {
        return days.some(d => {
          const up = d.toUpperCase();
          if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === tomorrowDow;
          return DOW_LC[d.toLowerCase()] === tomorrowDow;
        });
      }
    } catch { /* ignore */ }
  }
  if (moment.dayOfWeek) {
    const up = moment.dayOfWeek.toUpperCase();
    if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === tomorrowDow;
    return DOW_LC[moment.dayOfWeek.toLowerCase()] === tomorrowDow;
  }
  return true;
}

// ─── Intercession window: open during a generous band around time-of-day ─────
// Intercession stores scheduledTime="00:00"/windowMinutes=1440 so we gate by
// a real-world time-of-day band instead of the raw window.
const TOD_WINDOW_RANGES: Record<string, [number, number]> = {
  "early-morning": [5, 9], "morning": [6, 11], "midday": [10, 14],
  "afternoon": [12, 18], "late-afternoon": [14, 20], "evening": [17, 23], "night": [20, 24],
};
function isIntercessionWindowOpen(timeOfDay: string | null | undefined, timezone: string): boolean {
  if (!timeOfDay) return true; // no time set → always accessible
  const range = TOD_WINDOW_RANGES[timeOfDay];
  if (!range) return true;
  const { hour } = getCurrentTimeInTz(timezone);
  return hour >= range[0] && hour < range[1];
}

// ─── Minutes remaining in window — returns time until end of day ─────────────
function minutesRemaining(moment: { scheduledTime: string; windowMinutes: number; timezone?: string | null }): number {
  const tz = moment.timezone || "UTC";
  const { hour, minute } = getCurrentTimeInTz(tz);
  return Math.max(0, 1439 - (hour * 60 + minute));
}

// ─── Event duration by practice template ─────────────────────────────────────
function practiceEventDurationMins(templateType: string | null | undefined): number {
  if (templateType === "intercession") return 5;
  if (templateType === "morning-prayer" || templateType === "evening-prayer" || templateType === "contemplative") return 20;
  return 60;
}

// ─── Build local datetime strings for calendar events ────────────────────────
function buildLocalEventTimes(
  hh: number,
  mm: number,
  timezone: string,
  durationMins = 60,
): { startLocalStr: string; endLocalStr: string } {
  const { hour: curH, minute: curM } = getCurrentTimeInTz(timezone);
  const hasPassed = (curH * 60 + curM) >= (hh * 60 + mm);

  const localToday = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  let startDay = localToday;

  if (hasPassed) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    startDay = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(tomorrow);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const endTotalMins = hh * 60 + mm + durationMins;
  const endH = Math.floor(endTotalMins / 60) % 24;
  const endM = endTotalMins % 60;

  return {
    startLocalStr: `${startDay}T${pad(hh)}:${pad(mm)}:00`,
    endLocalStr: `${startDay}T${pad(endH)}:${pad(endM)}:00`,
  };
}

// ─── Evaluate window and update streak ──────────────────────────────────────
async function evaluateWindow(momentId: number, windowDate: string) {
  const posts = await db.select().from(momentPostsTable)
    .where(and(eq(momentPostsTable.momentId, momentId), eq(momentPostsTable.windowDate, windowDate)));

  const postCount = posts.length;
  const allMembersForMoment = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));
  const groupSize = allMembersForMoment.length;
  // Threshold: intercessions bloom on a single prayer (community prayer
  // is "we lifted it" not "a majority participated"). Other practice
  // templates require a majority.
  const [evalMoment] = await db.select({ templateType: sharedMomentsTable.templateType })
    .from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  const isIntercessionEval = evalMoment?.templateType === "intercession";
  const bloomThreshold = isIntercessionEval
    ? 1
    : Math.max(2, Math.ceil(groupSize / 2));
  const status = postCount >= bloomThreshold ? "bloom" : postCount === 1 ? "solo" : "wither";

  // Upsert window record
  const existing = await db.select().from(momentWindowsTable)
    .where(and(eq(momentWindowsTable.momentId, momentId), eq(momentWindowsTable.windowDate, windowDate)));

  if (existing.length === 0) {
    await db.insert(momentWindowsTable).values({
      momentId, windowDate, status, postCount, closedAt: new Date(),
    });
  } else {
    await db.update(momentWindowsTable)
      .set({ status, postCount, closedAt: new Date() })
      .where(eq(momentWindowsTable.id, existing[0].id));
  }

  // Update streak on the moment — only when the window TRANSITIONS to bloom.
  // If the window was already "bloom" from a prior post, don't increment again.
  const previousStatus = existing.length > 0 ? existing[0].status : null;
  const justBloomed = status === "bloom" && previousStatus !== "bloom";
  if (justBloomed) {
    const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (moment) {
      const newStreak = moment.currentStreak + 1;
      const newLongest = Math.max(newStreak, moment.longestStreak);
      const newState = (moment.state === "needs_water" || moment.state === "dormant") ? "active" : moment.state;
      const goalHit = moment.goalDays > 0 && newStreak >= moment.goalDays;
      const newBlooms = goalHit ? moment.totalBlooms + 1 : moment.totalBlooms;
      // Reset streak after goal completion so the next cycle starts fresh
      const nextStreak = goalHit ? 0 : newStreak;
      const nextState = goalHit ? "active" : newState;
      // Increment progressive session counter
      const newSessionsLogged = ((moment as Record<string, unknown>).commitmentSessionsLogged as number ?? 0) + 1;
      // Stamp commitmentGoalReachedAt the moment sessionsLogged first crosses the
      // commitment goal — used by the goal-cleanup job to remove recurring
      // calendar events 2 days later if no one renews. If already stamped (or no
      // goal set, or already past goal) leave it alone.
      const sessionsGoal = (moment as Record<string, unknown>).commitmentSessionsGoal as number | null;
      const prevReachedAt = (moment as Record<string, unknown>).commitmentGoalReachedAt as Date | null;
      const justCrossedGoal =
        sessionsGoal != null &&
        sessionsGoal > 0 &&
        newSessionsLogged >= sessionsGoal &&
        !prevReachedAt;
      // For intercessions: stamp goal-reached when the streak hits goalDays,
      // so the 1-day grace period logic can hide/archive it afterward.
      const intercessionGoalHit =
        moment.templateType === "intercession" &&
        goalHit &&
        !prevReachedAt;
      await db.update(sharedMomentsTable)
        .set({
          currentStreak: nextStreak, longestStreak: newLongest, totalBlooms: newBlooms, state: nextState,
          commitmentSessionsLogged: newSessionsLogged,
          ...((justCrossedGoal || intercessionGoalHit) ? { commitmentGoalReachedAt: new Date() } : {}),
        } as Record<string, unknown>)
        .where(eq(sharedMomentsTable.id, momentId));

      // Goal-reached push for intercessions: every participant who
      // actually prayed (any moment_post with isCheckin=1) gets a
      // "you prayed with N other people" notification. Fires exactly
      // once — gated on !prevReachedAt so re-evaluating an already-
      // completed window doesn't re-ping. Fire-and-forget so a slow
      // push doesn't block the window update.
      if (intercessionGoalHit) {
        (async () => {
          try {
            // Distinct check-in userTokens for this intercession,
            // joined back to moment_user_tokens to recover the email,
            // and from email to users.id. Members with zero check-ins
            // never enter this list — silent for non-participants.
            const checkinRows = await db
              .select({ userToken: momentPostsTable.userToken })
              .from(momentPostsTable)
              .where(and(
                eq(momentPostsTable.momentId, momentId),
                eq(momentPostsTable.isCheckin, 1),
              ));
            const tokenSet = new Set(checkinRows.map(r => r.userToken));
            if (tokenSet.size === 0) return;

            const tokenRows = await db
              .select({ userToken: momentUserTokensTable.userToken, email: momentUserTokensTable.email })
              .from(momentUserTokensTable)
              .where(eq(momentUserTokensTable.momentId, momentId));
            const emailsThatPrayed = tokenRows
              .filter(t => tokenSet.has(t.userToken))
              .map(t => t.email.toLowerCase());
            if (emailsThatPrayed.length === 0) return;

            const userRows = await db
              .select({ id: usersTable.id, email: usersTable.email })
              .from(usersTable)
              .where(inArray(usersTable.email, emailsThatPrayed));

            const totalPrayers = userRows.length;
            for (const u of userRows) {
              const otherCount = totalPrayers - 1;
              sendIntercessionGoalReachedPush(u.id, {
                momentId,
                intercessionName: moment.name,
                otherPrayerCount: otherCount,
              }).catch((err) => console.warn("[moments] goal-reached push failed:", err));
            }
          } catch (err) {
            console.warn("[moments] goal-reached push dispatch failed:", err);
          }
        })();
      }
    }
  } else if (status === "wither") {
    const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (moment) {
      // Check for consecutive withers
      const recentWindows = await db.select().from(momentWindowsTable)
        .where(eq(momentWindowsTable.momentId, momentId));
      const sortedWindows = recentWindows
        .sort((a, b) => b.windowDate.localeCompare(a.windowDate))
        .slice(0, 3);

      const consecutiveWithers = sortedWindows.filter(w => w.status === "wither").length;

      if (consecutiveWithers >= 2) {
        await db.update(sharedMomentsTable)
          .set({ currentStreak: 0, state: "dormant" })
          .where(eq(sharedMomentsTable.id, momentId));
      } else if (consecutiveWithers === 1) {
        await db.update(sharedMomentsTable)
          .set({ state: "needs_water" })
          .where(eq(sharedMomentsTable.id, momentId));
      }
    }
  }
}

// ─── POST /api/rituals/:id/moments — plant a shared moment ──────────────────
const PlantSchema = z.object({
  name: z.string().min(1).max(100),
  intention: z.string().min(1).max(140),
  loggingType: z.enum(["photo", "reflection", "both", "checkin"]),
  reflectionPrompt: z.string().max(100).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  goalDays: z.number().int().min(1).max(365).default(30),
  commitmentSessionsGoal: z.number().int().min(0).max(365).nullable().optional(),
});

router.post("/rituals/:id/moments", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PlantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual) { res.status(404).json({ error: "Ritual not found" }); return; }
  if (ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { name, intention, loggingType, reflectionPrompt, frequency, scheduledTime, goalDays, commitmentSessionsGoal } = parsed.data;

  const momentToken = generateToken();

  const [moment] = await db.insert(sharedMomentsTable).values({
    ritualId,
    name,
    intention,
    loggingType,
    reflectionPrompt: reflectionPrompt ?? null,
    frequency,
    scheduledTime,
    goalDays,
    momentToken,
    windowMinutes: 240,
    ...(commitmentSessionsGoal !== undefined ? { commitmentSessionsGoal } : {}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).returning();

  // Get the organizer's info
  const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));

  // Get all circle members (invite_tokens) + organizer
  const inviteTokens = await db.select().from(inviteTokensTable).where(eq(inviteTokensTable.ritualId, ritualId));

  // Build member list: organizer + all invitees
  const members: Array<{ email: string; name: string }> = [
    { email: organizer.email, name: organizer.name ?? organizer.email },
    ...inviteTokens.map(t => ({ email: t.email, name: t.name ?? t.email })),
  ];

  // Deduplicate by email
  const seen = new Set<string>();
  const uniqueMembers = members.filter(m => {
    if (seen.has(m.email)) return false;
    seen.add(m.email);
    return true;
  });

  // Create moment_user_tokens for each member
  const baseUrl = `${getInviteBaseUrl()}/moment`;

  const memberTokenRows = uniqueMembers.map(m => ({
    momentId: moment.id,
    email: m.email.toLowerCase(),
    name: m.name,
    userToken: generateToken(),
  }));

  const insertedTokens = await db.insert(momentUserTokensTable).values(memberTokenRows).returning();

  // Calendar setup
  const recurrenceRule = frequency === "daily"
    ? ["RRULE:FREQ=DAILY"]
    : frequency === "weekly"
    ? ["RRULE:FREQ=WEEKLY"]
    : ["RRULE:FREQ=MONTHLY"];

  const [hh, mm] = scheduledTime.split(":").map(Number);
  const startDate = new Date();
  startDate.setHours(hh, mm, 0, 0);
  if (startDate < new Date()) startDate.setDate(startDate.getDate() + 1);
  const endDate = new Date(startDate.getTime() + 60 * 60_000);

  const organizerName = organizer.name ?? organizer.email ?? "Phoebe";
  const creatorFirst = organizerName.split(" ")[0];
  const tradMemberNames = uniqueMembers.map(m => m.name.split(" ")[0]).join(", ");
  const tradGoalSessions = commitmentSessionsGoal ?? goalDays ?? null;
  // (dividers removed — they render inline in email clients)

  // Calendar invites for non-organizer members only.
  // The organizer gets their own bell event — not a duplicate invite event.
  const nonOrganizerTokens = insertedTokens.filter(t => t.email !== organizer.email);
  let gcalCreated = false;

  for (const t of nonOrganizerTokens) {
    const shortLink = `${getInviteBaseUrl()}/m/${t.userToken}`;
    const tradFreqLabel = frequency === "daily" ? "Daily" : frequency === "weekly" ? "Weekly" : "Monthly";
    const tradStartDate = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const tradTimeLabel = (() => {
      const period = hh < 12 ? "AM" : "PM";
      const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
      const minStr = String(mm).padStart(2, "0");
      return minStr === "00" ? `${h12} ${period}` : `${h12}:${minStr} ${period}`;
    })();

    const description = [
      `${creatorFirst} invited you to practice together.`,
      `Open in Phoebe → ${shortLink}`,
      "",
      ...(intention ? [`"${intention}"`, ""] : []),
      `When: ${tradFreqLabel} at ${tradTimeLabel} · Starting ${tradStartDate}`,
      `Who: ${tradMemberNames}`,
    ].join("\n");

    const eventId = await createCalendarEvent(sessionUserId, {
      summary: `🌱 ${name} with ${creatorFirst}`,
      description,
      startDate,
      endDate,
      attendees: [t.email],
      recurrence: recurrenceRule,
      colorId: "2",
      reminders: [
        { method: "popup", minutes: 5 },
      ],
    }).catch(() => null);

    if (eventId) {
      await db.update(momentUserTokensTable)
        .set({ googleCalendarEventId: eventId })
        .where(eq(momentUserTokensTable.id, t.id));
      gcalCreated = true;
    }
  }

  res.status(201).json({
    moment: { ...moment },
    memberCount: uniqueMembers.length,
    gcalCreated,
  });
});

// ─── POST /api/moments — plant a standalone shared moment ───────────────────
const SPIRITUAL_TEMPLATE_IDS = new Set(["morning-prayer", "evening-prayer", "intercession", "contemplative", "fasting", "lectio-divina", "custom"]);
const BCP_TEMPLATE_IDS = new Set(["morning-prayer", "evening-prayer"]);

const StandalonePlantSchema = z.object({
  name: z.string().min(1).max(100),
  intention: z.string().min(1).max(500),
  loggingType: z.enum(["photo", "reflection", "both", "checkin"]),
  reflectionPrompt: z.string().max(300).optional(),
  templateType: z.string().optional(),
  intercessionTopic: z.string().max(300).optional(),
  intercessionSource: z.enum(["bcp", "custom", "action"]).optional(),
  intercessionFullText: z.string().optional(),
  // Optional outbound URL — set when an admin creates an "action"
  // intercession (a prayer + a link to learn more / take action).
  // Slideshow renders this as a "Take action →" pill on the slide.
  learnMoreUrl: z.string().url().optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  dayOfWeek: z.enum(["MO","TU","WE","TH","FR","SA","SU"]).optional(),
  goalDays: z.number().int().min(0).max(365).default(7),
  timezone: z.string().default("UTC"),
  timeOfDay: z.enum(["early-morning", "morning", "midday", "afternoon", "late-afternoon", "evening", "night"]).optional(),
  participants: z.array(z.object({ name: z.string(), email: z.string().min(3) })).max(20).default([]),
  // BCP-specific fields
  frequencyType: z.string().optional(),
  frequencyDaysPerWeek: z.number().int().min(1).max(7).optional(),
  practiceDays: z.string().optional(),
  // Optional link to a tradition/circle
  ritualId: z.number().int().positive().optional(),
  // Contemplative Prayer duration
  contemplativeDurationMinutes: z.number().int().min(1).max(60).optional(),
  // Fasting-specific fields
  fastingType: z.enum(["meat", "custom"]).optional(),
  fastingFrom: z.string().max(140).optional(),
  fastingIntention: z.string().max(200).optional(),
  fastingFrequency: z.enum(["specific", "weekly", "monthly"]).optional(),
  fastingDate: z.string().optional(),
  fastingDay: z.string().optional(),
  fastingDayOfMonth: z.number().int().min(1).max(31).optional(),
  // Commitment fields
  commitmentDuration: z.number().int().min(0).max(365).optional(),
  // Progressive goal fields
  commitmentSessionsGoal: z.number().int().min(0).max(365).nullable().optional(),
  // Group practice — only group admins can create
  groupId: z.number().int().positive().optional(),
  // Additional groups an intercession is shared with. Each must be a
  // group where the creator is an admin. Stored in moment_groups
  // (primary ownership stays on shared_moments.group_id).
  additionalGroupIds: z.array(z.number().int().positive()).max(10).optional(),
});

router.post("/moments", perUserRateLimit("moments_create", {
  // Practice creation fan-outs to every member of the chosen group(s)
  // — emails + (potentially) pushes. 15/hour per user means a power
  // user adding a few practices to multiple communities is fine; a
  // script trying to mass-create gets cut off quickly.
  max: 15, windowMs: 60 * 60 * 1000,
  message: "You've created a lot of practices in the last hour. Please try again later.",
}), async (req, res): Promise<void> => {
  try {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = StandalonePlantSchema.safeParse(req.body);
  if (!parsed.success) {
    console.error("POST /api/moments validation error:", parsed.error.flatten());
    res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() }); return;
  }

  const { name, intention, loggingType, reflectionPrompt, templateType, intercessionTopic, intercessionSource, intercessionFullText, learnMoreUrl, frequency, scheduledTime, dayOfWeek, goalDays, timezone, timeOfDay, participants, frequencyType, frequencyDaysPerWeek, practiceDays, ritualId: providedRitualId, contemplativeDurationMinutes, fastingType, fastingFrom, fastingIntention, fastingFrequency, fastingDate, fastingDay, fastingDayOfMonth, commitmentDuration, commitmentSessionsGoal, groupId, additionalGroupIds } = parsed.data;

  // An "action" intercession is a prayer + a take-action link — the
  // link is what makes it an action, so reject one without a URL
  // rather than shipping an action with no "Take action" pill.
  if (intercessionSource === "action" && !learnMoreUrl) {
    res.status(400).json({ error: "An action needs a link." }); return;
  }

  // ── Group practice validation — only admins can create ──
  let groupMembers: Array<{ email: string; name: string }> | null = null;
  // Captured for push dispatch after the moment is created.
  let groupPushContext: { slug: string; memberUserIds: number[] } | null = null;
  if (groupId) {
    const [group] = await db.select().from(groupsTable).where(eq(groupsTable.id, groupId));
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }

    const [membership] = await db.select().from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, sessionUserId)));
    if (!membership || (membership.role !== "admin" && membership.role !== "hidden_admin")) {
      res.status(403).json({ error: "Only group admins can create group practices" }); return;
    }

    // Auto-add all joined group members as participants
    const members = await db.select().from(groupMembersTable)
      .where(and(eq(groupMembersTable.groupId, groupId), sql`${groupMembersTable.joinedAt} IS NOT NULL`));
    groupMembers = members.map(m => ({ email: m.email, name: m.name ?? m.email }));
    groupPushContext = {
      slug: group.slug,
      memberUserIds: members
        .map(m => m.userId)
        .filter((id): id is number => id != null && id !== sessionUserId),
    };
  }

  // ── Additional groups (multi-group intercessions) validation ──
  // The creator must be an admin (visible or hidden) of every additional
  // group they're attaching. We gather those members here so we can add
  // them as participants below alongside the primary group's members.
  let additionalGroupRows: Array<{ groupId: number; slug: string; members: typeof groupMembersTable.$inferSelect[] }> = [];
  if (additionalGroupIds && additionalGroupIds.length > 0) {
    // Dedupe + strip the primary group so we don't double-insert.
    const extraIds = [...new Set(additionalGroupIds.filter(id => id !== groupId))];
    if (extraIds.length > 0) {
      const extraGroups = await db.select().from(groupsTable).where(inArray(groupsTable.id, extraIds));
      if (extraGroups.length !== extraIds.length) {
        res.status(404).json({ error: "One or more groups not found" });
        return;
      }
      const myMemberships = await db.select().from(groupMembersTable)
        .where(and(
          inArray(groupMembersTable.groupId, extraIds),
          eq(groupMembersTable.userId, sessionUserId),
        ));
      const adminOf = new Set(
        myMemberships
          .filter(m => m.role === "admin" || m.role === "hidden_admin")
          .map(m => m.groupId),
      );
      for (const g of extraGroups) {
        if (!adminOf.has(g.id)) {
          res.status(403).json({ error: `You must be an admin of ${g.name} to attach a practice to it` });
          return;
        }
      }
      // Collect each group's joined members so they all get a user token
      // below. A single person who sits in two attached groups still only
      // gets one token (we dedupe by email in `groupMembers`).
      const extraMemberRows = await db.select().from(groupMembersTable)
        .where(and(
          inArray(groupMembersTable.groupId, extraIds),
          sql`${groupMembersTable.joinedAt} IS NOT NULL`,
        ));
      additionalGroupRows = extraGroups.map(g => ({
        groupId: g.id,
        slug: g.slug,
        members: extraMemberRows.filter(m => m.groupId === g.id),
      }));
      // Merge into the groupMembers list that gets turned into participants.
      const byEmail = new Map<string, { email: string; name: string }>();
      for (const m of (groupMembers ?? [])) byEmail.set(m.email.toLowerCase(), m);
      for (const row of extraMemberRows) {
        const k = row.email.toLowerCase();
        if (!byEmail.has(k)) byEmail.set(k, { email: row.email, name: row.name ?? row.email });
      }
      if (byEmail.size > 0) groupMembers = [...byEmail.values()];
    }
  }

  // Enforce the Lectio Divina group limit — depth, not breadth.
  if (templateType === "lectio-divina") {
    const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (creator) {
      const myTokens = await db.select().from(momentUserTokensTable)
        .where(eq(momentUserTokensTable.email, creator.email));
      const myMomentIds = [...new Set(myTokens.map(t => t.momentId))];
      if (myMomentIds.length > 0) {
        const myLectio = (await db.select().from(sharedMomentsTable)
          .where(inArray(sharedMomentsTable.id, myMomentIds)))
          .filter(m => m.templateType === "lectio-divina" && m.state !== "archived");
        if (myLectio.length >= LECTIO_GROUP_LIMIT) {
          res.status(400).json({
            error: "lectio_group_limit",
            message: `You can hold up to ${LECTIO_GROUP_LIMIT} Lectio Divina groups at a time. The discipline is depth, not breadth — leave one to begin another.`,
          });
          return;
        }
      }
    }
  }

  // Compute commitment end date if a duration was provided
  const commitmentEndDate = (commitmentDuration && commitmentDuration > 0)
    ? (() => {
        const d = new Date();
        d.setDate(d.getDate() + commitmentDuration);
        return d.toISOString().slice(0, 10);
      })()
    : null;
  const isFasting = templateType === "fasting";

  const isSpiritual = SPIRITUAL_TEMPLATE_IDS.has(templateType ?? "");
  const isBcp = BCP_TEMPLATE_IDS.has(templateType ?? "");
  const momentToken = generateToken();

  // Resolve organizer + the deduped participant list BEFORE the write
  // transaction — these are reads/computation, no reason to hold them
  // inside the tx. The member token rows reference moment.id, so they
  // get built inside the tx once the moment row exists.
  const [organizer] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));

  // Merge organizer into participants, deduplicate by email
  // For group practices, use group members instead of manually invited participants
  const participantList = groupMembers ?? participants.map(p => ({ email: p.email, name: p.name || p.email }));
  const allMembers: Array<{ email: string; name: string }> = [
    { email: organizer.email, name: organizer.name ?? organizer.email },
    ...participantList,
  ];
  const seen = new Set<string>();
  const uniqueMembers = allMembers.filter(m => {
    if (seen.has(m.email)) return false;
    seen.add(m.email);
    return true;
  });

  const baseUrl = `${getInviteBaseUrl()}/moment`;

  // Atomic create: the moment row, its additional-group junction rows,
  // and every member's access token commit together. Previously these
  // ran as three independent statements — a failure after the moment
  // insert but before the token insert left a practice that NOBODY
  // (including the creator) could open, because access is gated on a
  // momentUserTokens row. Calendar events + emails + pushes stay
  // OUTSIDE the tx below (external API calls with no rollback).
  const { moment, insertedTokens } = await db.transaction(async (tx) => {
    const [insertedMoment] = await tx.insert(sharedMomentsTable).values({
      ritualId: providedRitualId ?? null,
      groupId: groupId ?? null,
      name,
      intention,
      loggingType,
      reflectionPrompt: reflectionPrompt ?? null,
      templateType: templateType ?? null,
      intercessionTopic: intercessionTopic ?? null,
      intercessionSource: intercessionSource ?? null,
      intercessionFullText: intercessionFullText ?? null,
      frequency,
      scheduledTime,
      dayOfWeek: dayOfWeek ?? null,
      goalDays,
      timezone,
      timeOfDay: isSpiritual ? (timeOfDay ?? null) : null,
      momentToken,
      windowMinutes: isBcp ? 1440 : (isSpiritual ? 1440 : 240),
      // Anchor the cycle window at creation. The read filter hides
      // intercessions once now > cycleStartedAt + goalDays.
      commitmentCycleStartedAt: new Date(),
      ...(frequencyType !== undefined ? { frequencyType } : {}),
      ...(frequencyDaysPerWeek !== undefined ? { frequencyDaysPerWeek } : {}),
      ...(practiceDays !== undefined ? { practiceDays } : {}),
      ...(contemplativeDurationMinutes !== undefined ? { contemplativeDurationMinutes } : {}),
      ...(fastingType !== undefined ? { fastingType } : {}),
      ...(fastingFrom !== undefined ? { fastingFrom } : {}),
      ...(fastingIntention !== undefined ? { fastingIntention } : {}),
      ...(fastingFrequency !== undefined ? { fastingFrequency } : {}),
      ...(fastingDate !== undefined ? { fastingDate } : {}),
      ...(fastingDay !== undefined ? { fastingDay } : {}),
      ...(fastingDayOfMonth !== undefined ? { fastingDayOfMonth } : {}),
      ...(commitmentDuration !== undefined ? { commitmentDuration } : {}),
      ...(commitmentEndDate ? { commitmentEndDate } : {}),
      ...(commitmentSessionsGoal !== undefined ? { commitmentSessionsGoal } : {}),
      ...(learnMoreUrl !== undefined ? { learnMoreUrl } : {}),
    }).returning();

    // Link any additional groups via the junction table. Primary group
    // stays on sharedMoments.groupId — we skip it here to avoid a
    // redundant "also visible from" row pointing at the owner group.
    if (additionalGroupRows.length > 0) {
      await tx.insert(momentGroupsTable).values(
        additionalGroupRows.map(row => ({ momentId: insertedMoment.id, groupId: row.groupId })),
      );
    }

    const memberTokenRows = uniqueMembers.map(m => ({
      momentId: insertedMoment.id,
      email: m.email.toLowerCase(),
      name: m.name,
      userToken: generateToken(),
    }));
    const tokens = await tx.insert(momentUserTokensTable).values(memberTokenRows).returning();

    return { moment: insertedMoment, insertedTokens: tokens };
  });

  // ─── Friendly schedule label (time-of-day language, never clock times) ──────
  const TOD_LABELS: Record<string, string> = {
    "early-morning": "early morning", "morning": "morning", "midday": "midday",
    "afternoon": "afternoon", "late-afternoon": "late afternoon", "evening": "evening", "night": "night",
  };
  const DAY_NAMES_SHORT: Record<string, string> = {
    MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday", FR: "Friday", SA: "Saturday", SU: "Sunday",
  };
  function clockToTod(time: string): string {
    const [h] = time.split(":").map(Number);
    if (h < 6) return "early morning";
    if (h < 12) return "morning";
    if (h < 14) return "midday";
    if (h < 17) return "afternoon";
    if (h < 20) return "evening";
    return "night";
  }
  function buildFrequencyLabel(): string {
    const tod = timeOfDay ? (TOD_LABELS[timeOfDay] ?? timeOfDay) : clockToTod(scheduledTime);
    if (frequency === "daily") return `Every ${tod}`;
    if (frequency === "weekly") {
      let days: string[] = [];
      if (practiceDays) {
        try { days = JSON.parse(practiceDays); } catch { days = []; }
      } else if (dayOfWeek) {
        days = [dayOfWeek];
      }
      const dayStr = days.map((d: string) => DAY_NAMES_SHORT[d.toUpperCase()] ?? d).join(", ");
      return dayStr ? `${dayStr} · ${tod}` : `Every week · ${tod}`;
    }
    return `Monthly · ${tod}`;
  }
  const scheduleLabel = buildFrequencyLabel();

  const recurrenceRule = frequency === "daily"
    ? ["RRULE:FREQ=DAILY"]
    : frequency === "weekly"
    ? [`RRULE:FREQ=WEEKLY${dayOfWeek ? `;BYDAY=${dayOfWeek}` : ""}`]
    : ["RRULE:FREQ=MONTHLY"];

  const tz = timezone || "UTC";
  const [hh, mm] = scheduledTime.split(":").map(Number);
  // Map time-of-day label to a representative clock hour for calendar events
  const TOD_CLOCK_HOURS: Record<string, [number, number]> = {
    "early-morning": [6, 0], "morning": [8, 0], "midday": [12, 0],
    "afternoon": [14, 0], "late-afternoon": [16, 0], "evening": [19, 0], "night": [21, 0],
  };
  // Spiritual practices store scheduledTime="00:00"; derive actual hour from timeOfDay
  const hhEff = (hh === 0 && mm === 0 && isSpiritual)
    ? (TOD_CLOCK_HOURS[timeOfDay ?? ""] ?? TOD_CLOCK_HOURS["morning"])[0]
    : hh;
  const mmEff = (hh === 0 && mm === 0 && isSpiritual)
    ? (TOD_CLOCK_HOURS[timeOfDay ?? ""] ?? TOD_CLOCK_HOURS["morning"])[1]
    : mm;
  const { startLocalStr, endLocalStr } = buildLocalEventTimes(hhEff, mmEff, tz, practiceEventDurationMins(templateType));
  const startDate = new Date(); // fallback

  function formatTimeForTitle(h: number, m: number): string {
    const period = h < 12 ? "AM" : "PM";
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const minStr = String(m).padStart(2, "0");
    return minStr === "00" ? `${hour12} ${period}` : `${hour12}:${minStr} ${period}`;
  }
  const calTimeLabel = formatTimeForTitle(hhEff, mmEff);
  const creatorFirstName = (organizer.name ?? organizer.email ?? "Phoebe").split(" ")[0];
  function buildEventTitle(): string {
    if (templateType === "morning-prayer") return `✨ Morning Prayer with ${creatorFirstName}`;
    if (templateType === "evening-prayer") return `🌙 Evening Prayer with ${creatorFirstName}`;
    if (templateType === "intercession") {
      const isCustom = intercessionSource !== "bcp";
      return isCustom && intention ? `🙏🏽 ${intention}` : `Praying ${name}`;
    }
    if (templateType === "contemplative") return `🕯️ ${name}`;
    if (templateType === "fasting") {
      const invFirst = (organizer.name ?? "Someone").split(" ")[0];
      return `${invFirst} invited you to conserve water together`;
    }
    return `🌱 ${name} with ${creatorFirstName}`;
  }

  // ─── Warm, human calendar description for each member ─────────────────────
  const memberNames = uniqueMembers.map(m => m.name.split(" ")[0]);
  const memberListStr = memberNames.join(", ");
  const goalSessions = commitmentSessionsGoal ?? goalDays ?? null;
  function humanStartDate(): string {
    const d = new Date();
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  const freqLabel = frequency === "daily" ? "Daily" : frequency === "weekly" ? "Weekly" : "Monthly";

  function buildDescription(memberToken: string, _memberName: string, inviterName: string, _isOrganizer: boolean): string {
    const shortLink = `${getInviteBaseUrl()}/m/${memberToken}`;
    const invFirst = inviterName.split(" ")[0];

    if (templateType === "intercession") {
      const lines: string[] = [];
      lines.push(`🙏🏽 ${invFirst} invited you to pray with them.`);
      lines.push(shortLink);
      lines.push("");
      if (intention) {
        lines.push(`${invFirst} is praying for ${intention}. They want you alongside them.`);
        lines.push("");
      }
      lines.push(`When: ${freqLabel} at ${calTimeLabel} · Starting ${humanStartDate()}`);
      return lines.join("\n");
    }

    if (templateType === "morning-prayer") {
      return [
        `✨ ${invFirst} invited you to pray the Daily Office together.`,
        shortLink,
        "",
        `Each morning, ${invFirst} will be praying Morning Prayer from the Book of Common Prayer. Wherever you are, at the same time of day — knowing the other is doing the same.`,
        "",
        `When: ${freqLabel} at ${calTimeLabel} · Starting ${humanStartDate()}`,
      ].join("\n");
    }

    if (templateType === "evening-prayer") {
      return [
        `🌙 ${invFirst} invited you to pray the Daily Office together.`,
        shortLink,
        "",
        `Each evening, ${invFirst} will be praying Evening Prayer from the Book of Common Prayer. Wherever you are, at the same time of day — knowing the other is doing the same.`,
        "",
        `When: ${freqLabel} at ${calTimeLabel} · Starting ${humanStartDate()}`,
      ].join("\n");
    }

    if (templateType === "contemplative") {
      const durStr = contemplativeDurationMinutes ? `${contemplativeDurationMinutes} minutes of silence together` : "A shared time of silence";
      return [
        `🕯️ ${invFirst} invited you to sit in silence together.`,
        shortLink,
        "",
        `${durStr}. Wherever you are, at the same time of day — knowing the other is present too.`,
        "",
        `When: ${freqLabel} at ${calTimeLabel} · Starting ${humanStartDate()}`,
      ].join("\n");
    }

    if (templateType === "lectio-divina") {
      return [
        `📜 ${invFirst} invited you to pray Lectio Divina together.`,
        shortLink,
        "",
        `On Mondays, Wednesdays, and Fridays, sit with the week's gospel reading. Slowly, attentively — letting the word read you.`,
        "",
        `When: Mon · Wed · Fri · Starting ${humanStartDate()}`,
      ].join("\n");
    }

    // Default / custom practice
    return [
      `🌱 ${invFirst} invited you to practice together.`,
      shortLink,
      "",
      ...(intention ? [`"${intention}"`, ""] : []),
      `When: ${freqLabel} at ${calTimeLabel} · Starting ${humanStartDate()}`,
    ].join("\n");
  }

  // ─── Helper for Lectio Divina all-day event start date ────────────────────
  // Returns the next upcoming Mon/Wed/Fri in the target timezone as YYYY-MM-DD,
  // including today if today is already Mon/Wed/Fri.
  function getNextLectioDateStr(tz: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short",
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === "year")?.value ?? "2026";
    const mo = parts.find(p => p.type === "month")?.value ?? "01";
    const day = parts.find(p => p.type === "day")?.value ?? "01";
    const wd = parts.find(p => p.type === "weekday")?.value ?? "Mon";
    const DOW: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
    const LECTIO_DAYS = new Set([1, 3, 5]); // Mon, Wed, Fri
    const startDow = DOW[wd] ?? 1;
    let offset = 0;
    while (!LECTIO_DAYS.has((startDow + offset) % 7)) offset++;
    const dt = new Date(`${y}-${mo}-${day}T00:00:00Z`);
    dt.setUTCDate(dt.getUTCDate() + offset);
    return dt.toISOString().split("T")[0];
  }

  // ─── Helpers for fasting all-day event date ─────────────────────────────────
  function getFastingStartDateStr(): string {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    if (fastingFrequency === "specific" && fastingDate) return fastingDate;
    if (fastingFrequency === "weekly" && fastingDay) {
      const DAY_MAP: Record<string, number> = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };
      const target = DAY_MAP[fastingDay.toLowerCase()] ?? 5;
      const d = new Date(today);
      const diff = (target - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
      return d.toISOString().split("T")[0];
    }
    if (fastingFrequency === "monthly" && fastingDayOfMonth) {
      const d = new Date(today.getFullYear(), today.getMonth(), fastingDayOfMonth);
      if (d <= today) d.setMonth(d.getMonth() + 1);
      return d.toISOString().split("T")[0];
    }
    return todayStr;
  }

  function getFastingRecurrence(): string[] {
    if (fastingFrequency === "specific") return [];
    if (fastingFrequency === "weekly" && fastingDay) {
      const DAY_RRULE: Record<string, string> = { sunday:"SU", monday:"MO", tuesday:"TU", wednesday:"WE", thursday:"TH", friday:"FR", saturday:"SA" };
      const byday = DAY_RRULE[fastingDay.toLowerCase()] ?? "FR";
      return [`RRULE:FREQ=WEEKLY;BYDAY=${byday}`];
    }
    if (fastingFrequency === "monthly" && fastingDayOfMonth) {
      return [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${fastingDayOfMonth}`];
    }
    return [];
  }

  function buildFastingDescription(memberToken: string, inviterName: string, _isOrganizer: boolean): string {
    const shortLink = `${getInviteBaseUrl()}/m/${memberToken}`;
    const invFirst = inviterName.split(" ")[0];

    // Day of week label
    const dayLabel = fastingDay
      ? fastingDay.charAt(0).toUpperCase() + fastingDay.slice(1)
      : fastingFrequency === "specific" && fastingDate
        ? new Date(fastingDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : "a set day";

    // Starting date (next occurrence)
    const startDateStr = getFastingStartDateStr();
    const startDateLabel = new Date(startDateStr + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const freqDisplay = fastingFrequency === "weekly" ? "Weekly" : fastingFrequency === "monthly" ? "Monthly" : "One time";

    // Collective impact line — based on total group size
    const totalPeople = insertedTokens.length;
    const weeklyGallons = (totalPeople * 400).toLocaleString();
    const collectiveLine = `If ${totalPeople} ${totalPeople === 1 ? "person fasts" : "people fast"} together once a week, your group will conserve approximately ${weeklyGallons} gallons of water every week.`;

    return [
      `${invFirst} invited you to fast from meat on ${dayLabel}.`,
      "",
      "Together, you can make a measurable difference.",
      "",
      "The University of Colorado has found that fasting from meat for one day conserves approximately 400 gallons of water per person.",
      "",
      "When you fast together, Phoebe tracks your collective water impact — this week, this month, and all time.",
      "",
      `Join ${invFirst}'s fast:`,
      shortLink,
      "",
      collectiveLine,
      "",
      "———",
      "",
      `When: ${freqDisplay} · Starting ${startDateLabel}`,
      "",
      "———",
      "",
      "Phoebe · A place set apart for connection",
    ].join("\n");
  }

  // ─── Create ONE group calendar event with all members ──────────────────────
  const organizerName = organizer.name ?? organizer.email ?? "Phoebe";
  const attendeeEmails = insertedTokens.map(t => t.email); // All members get invites from scheduler
  let gcalCreated = false;

  // Reminders: 5 min popup + 1 day email
  const practiceReminders = [
    { method: "popup", minutes: 5 },
    { method: "email", minutes: 1440 },
  ];

  try {
    const eventTitle = buildEventTitle();
    // Organizer gets their own personalised description too
    const orgToken = insertedTokens.find(t => t.email === organizer.email);
    const orgDescription = orgToken
      ? buildDescription(orgToken.userToken, organizer.name ?? "You", organizerName, true)
      : `Open Phoebe → ${getInviteBaseUrl()}/moments/${moment.id}`;

    if (isFasting) {
      const fastingDateStr = getFastingStartDateStr();
      const fastingRec = getFastingRecurrence();
      const fastingTitle = buildEventTitle();
      const fastOrgDesc = orgToken
        ? buildFastingDescription(orgToken.userToken, organizerName, true)
        : orgDescription;
      const eventId = await createAllDayCalendarEvent(sessionUserId, {
        summary: fastingTitle,
        description: fastOrgDesc,
        dateStr: fastingDateStr,
        attendees: attendeeEmails,
        recurrence: fastingRec,
        reminders: [
          { method: "popup", minutes: 240 }, // 8pm evening before (4h before midnight)
          { method: "popup", minutes: 0 },   // morning of
        ],
        transparency: "transparent",
      }).catch(() => null);

      if (eventId) {
        if (orgToken) {
          await db.update(momentUserTokensTable)
            .set({ googleCalendarEventId: eventId })
            .where(eq(momentUserTokensTable.id, orgToken.id));
        }
        gcalCreated = true;
      }
    } else if (templateType === "intercession") {
      const todayStr = new Date().toISOString().split("T")[0];
      // Cap the recurrence at goalDays so the event disappears from the calendar
      // after the commitment period ends (e.g. RRULE:FREQ=DAILY;COUNT=3)
      const intercessionRecurrence = goalDays > 0
        ? [`RRULE:FREQ=DAILY;COUNT=${goalDays}`]
        : recurrenceRule;
      const eventId = await createAllDayCalendarEvent(sessionUserId, {
        summary: eventTitle,
        description: orgDescription,
        dateStr: todayStr,
        attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
        recurrence: intercessionRecurrence,
        reminders: [{ method: "popup", minutes: 0 }], // morning of
        transparency: "transparent",
      }).catch(() => null);

      if (eventId) {
        if (orgToken) {
          await db.update(momentUserTokensTable)
            .set({ googleCalendarEventId: eventId })
            .where(eq(momentUserTokensTable.id, orgToken.id));
        }
        gcalCreated = true;
      }
    } else if (templateType === "lectio-divina") {
      // Lectio Divina: all-day events on Mon/Wed/Fri.
      // Day-of only — no day-before reminder.
      const lectioDateStr = getNextLectioDateStr(tz);
      const lectioTitle = `📜 ${name} — Lectio Divina`;
      const eventId = await createAllDayCalendarEvent(sessionUserId, {
        summary: lectioTitle,
        description: orgDescription,
        dateStr: lectioDateStr,
        attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
        recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"],
        reminders: [{ method: "popup", minutes: 0 }], // morning of only
        transparency: "transparent",
      }).catch(() => null);

      if (eventId) {
        if (orgToken) {
          await db.update(momentUserTokensTable)
            .set({ googleCalendarEventId: eventId })
            .where(eq(momentUserTokensTable.id, orgToken.id));
        }
        gcalCreated = true;
      }
    } else {
      const eventId = await createCalendarEvent(sessionUserId, {
        summary: eventTitle,
        description: orgDescription,
        startDate,
        startLocalStr,
        endLocalStr,
        timeZone: tz,
        attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
        recurrence: recurrenceRule,
        colorId: "2",
        reminders: practiceReminders,
      }).catch(() => null);

      if (eventId) {
        if (orgToken) {
          await db.update(momentUserTokensTable)
            .set({ googleCalendarEventId: eventId })
            .where(eq(momentUserTokensTable.id, orgToken.id));
        }
        gcalCreated = true;
      }
    }
  } catch (calErr) {
    console.error("Practice calendar event creation failed (non-fatal):", calErr);
  }

  // Group-scoped push: every joined member of the group except the creator
  // gets a "new practice" notification. Fire-and-forget; one bad device
  // token can't break the response.
  if (groupPushContext && groupPushContext.memberUserIds.length > 0) {
    (async () => {
      try {
        const [creatorRow] = await db.select({ name: usersTable.name })
          .from(usersTable).where(eq(usersTable.id, sessionUserId));
        const creatorName = creatorRow?.name ?? "Someone";
        for (const uid of groupPushContext.memberUserIds) {
          sendNewGroupMomentPush(uid, {
            groupSlug: groupPushContext.slug,
            momentName: moment.name,
            templateType: moment.templateType ?? "",
            creatorName,
          }).catch((err) => console.warn("[moments] group push failed:", err));
        }
      } catch (err) {
        console.warn("[moments] group push dispatch setup failed:", err);
      }
    })();
  }

  res.status(201).json({
    moment: { ...moment },
    memberCount: uniqueMembers.length,
    gcalCreated,
  });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("POST /api/moments error:", msg);
    if (!res.headersSent) res.status(500).json({ error: msg });
  }
});

// ─── GET /api/moments/past-intercessions ─────────────────────────────────────
//
// Returns the backlog of community intercessions the viewer once had a hand
// in but that have since been retired (state = "archived"). Surfaces only
// to admins:
//   • Group-scoped intercessions: viewer must be an admin of the owning
//     group (group_members.role === "admin").
//   • Feed-scoped intercessions: limited to platform-owned feeds whose
//     admin gate is the beta_users.is_admin flag (currently just the
//     phoebe-climate feed). User-created feeds aren't admin-gated yet so
//     they don't surface here either way.
//
// Mirrors the "past prayers received" pattern on the prayer-list page —
// read-only, faded card treatment on the client. We don't include posts,
// streak data, or token rows; consumers just need enough to render the
// card and remember what the community used to be praying for.
router.get("/moments/past-intercessions", async (req, res): Promise<void> => {
  try {
    const sessionUserId = req.user ? (req.user as { id: number }).id : null;
    if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [me] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (!me) { res.status(404).json({ error: "User not found" }); return; }

    // Beta admin → also see archived feed-scoped intercessions for
    // platform-owned feeds (e.g. Phoebe Climate).
    const [betaRow] = await db
      .select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, (me.email ?? "").toLowerCase()));
    const isBetaAdmin = !!betaRow?.isAdmin;

    // "Past" = archived OR cycle-window expired. Mirror the same logic
    // the active filter uses so we catch everything the list hides.
    const now = new Date();
    const graceMs = 2 * 24 * 60 * 60 * 1000;

    function isExpiredIntercession(m: typeof sharedMomentsTable.$inferSelect): boolean {
      if (m.state === "archived") return true;
      const mAny = m as Record<string, unknown>;
      const reachedAt = mAny.commitmentGoalReachedAt as Date | null;
      if (reachedAt && (now.getTime() - new Date(reachedAt).getTime()) > graceMs) return true;
      const cycleStartedAt = mAny.commitmentCycleStartedAt as Date | null;
      if (!reachedAt && m.goalDays > 0 && cycleStartedAt) {
        const cycleEndMs = new Date(cycleStartedAt).getTime() + m.goalDays * 24 * 60 * 60 * 1000;
        if (now.getTime() > cycleEndMs) return true;
      }
      return false;
    }

    // Use moment_user_tokens as the source of truth — if the user has
    // a token they participated regardless of which group is primary vs
    // secondary. This catches multi-group intercessions where the user
    // is only in one of the additional communities.
    const userTokenRows = await db
      .select({ momentId: momentUserTokensTable.momentId })
      .from(momentUserTokensTable)
      .where(sql`LOWER(${momentUserTokensTable.email}) = LOWER(${me.email ?? ""})`);
    const participatedIds = [...new Set(userTokenRows.map((r) => r.momentId))];

    if (participatedIds.length === 0 && !isBetaAdmin) {
      res.json({ intercessions: [] });
      return;
    }

    const candidateRows: Array<typeof sharedMomentsTable.$inferSelect> = [];
    if (participatedIds.length > 0) {
      const rows = await db
        .select()
        .from(sharedMomentsTable)
        .where(
          and(
            eq(sharedMomentsTable.templateType, "intercession"),
            inArray(sharedMomentsTable.id, participatedIds),
          ),
        );
      candidateRows.push(...rows.filter(isExpiredIntercession));
    }
    if (isBetaAdmin) {
      // Platform-owned feeds (creatorUserId = null).
      const platformFeeds = await db
        .select({ id: prayerFeedsTable.id })
        .from(prayerFeedsTable)
        .where(sql`${prayerFeedsTable.creatorUserId} IS NULL`);
      const platformFeedIds = platformFeeds.map((f) => f.id);
      if (platformFeedIds.length > 0) {
        const rows = await db
          .select()
          .from(sharedMomentsTable)
          .where(
            and(
              eq(sharedMomentsTable.templateType, "intercession"),
              inArray(sharedMomentsTable.prayerFeedId, platformFeedIds),
            ),
          );
        candidateRows.push(...rows.filter(isExpiredIntercession));
      }
    }

    // Resolve the owning group / feed so the card can show "where" the
    // intercession lived (e.g. "Vine Community" or "Phoebe Climate").
    const groupIds = [...new Set(candidateRows.map((m) => m.groupId).filter((g): g is number => g != null))];
    const feedIds = [...new Set(candidateRows.map((m) => m.prayerFeedId).filter((f): f is number => f != null))];
    const groupRows = groupIds.length > 0
      ? await db.select({ id: groupsTable.id, name: groupsTable.name, slug: groupsTable.slug })
          .from(groupsTable)
          .where(inArray(groupsTable.id, groupIds))
      : [];
    const feedRows = feedIds.length > 0
      ? await db.select({ id: prayerFeedsTable.id, slug: prayerFeedsTable.slug, title: prayerFeedsTable.title })
          .from(prayerFeedsTable)
          .where(inArray(prayerFeedsTable.id, feedIds))
      : [];
    const groupById = new Map(groupRows.map((g) => [g.id, g]));
    const feedById = new Map(feedRows.map((f) => [f.id, f]));

    // De-dupe (a moment shouldn't appear in both sets, but defensive)
    // and sort newest-first by createdAt.
    const seen = new Set<number>();
    const unique = candidateRows.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
    unique.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({
      intercessions: unique.map((m) => ({
        id: m.id,
        name: m.name,
        intention: m.intention,
        intercessionTopic: m.intercessionTopic,
        intercessionFullText: m.intercessionFullText,
        intercessionSource: m.intercessionSource,
        learnMoreUrl: m.learnMoreUrl,
        customEmoji: m.customEmoji,
        createdAt: m.createdAt.toISOString(),
        group: m.groupId
          ? (groupById.get(m.groupId)
              ? { id: m.groupId, name: groupById.get(m.groupId)!.name, slug: groupById.get(m.groupId)!.slug }
              : null)
          : null,
        feed: m.prayerFeedId
          ? (feedById.get(m.prayerFeedId)
              ? { id: m.prayerFeedId, title: feedById.get(m.prayerFeedId)!.title, slug: feedById.get(m.prayerFeedId)!.slug }
              : null)
          : null,
      })),
    });
  } catch (err) {
    console.error("[GET /api/moments/past-intercessions]", err);
    res.status(500).json({ error: "Failed to load past intercessions" });
  }
});

// ─── GET /api/moments — list all standalone moments the user participates in ─
router.get("/moments", async (req, res): Promise<void> => {
  try {
    const sessionUserId = req.user ? (req.user as { id: number }).id : null;
    if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // Throttle the read-time reconcile to once per user per minute (see
    // RECONCILE_TTL_MS note above). Both the pre-reconcile and post-reconcile
    // passes below are gated on this flag together — the post-pass dedups
    // against the Sets the pre-pass fills, so they must run (or skip) as a
    // unit or the post-pass would re-do everything the pre-pass would have
    // skipped. Stamp the time up front so concurrent requests from the same
    // user (a dashboard fires several /moments-adjacent calls at once) don't
    // all decide to reconcile.
    const nowMs = Date.now();
    const shouldReconcile =
      nowMs - (lastReconciledByUser.get(sessionUserId) ?? 0) > RECONCILE_TTL_MS;
    if (shouldReconcile) {
      // Prune stale entries before letting the map grow past its cap. Anything
      // older than the TTL belongs to a user who'd reconcile on their next visit
      // anyway, so dropping it is free — and unlike clear() it keeps currently
      // active users' cooldowns intact (no reconcile stampede after a flush).
      if (lastReconciledByUser.size > RECONCILE_CACHE_MAX) {
        const cutoff = nowMs - RECONCILE_TTL_MS;
        for (const [uid, ts] of lastReconciledByUser) if (ts < cutoff) lastReconciledByUser.delete(uid);
      }
      lastReconciledByUser.set(sessionUserId, nowMs);
    }

    // Reconcile every practice attached to any group this user belongs to.
    // This runs BEFORE we read tokens so a user newly added to a group picks
    // up that group's practices on their very next /moments request — no
    // refresh, no delay, no dependency on the eager helpers firing.
    // Track which practices we've already reconciled this request so the
    // post-reconcile pass below doesn't redo the same writes (both passes
    // are gated on shouldReconcile, so when we skip we skip both). The pre-
    // reconcile (by group/feed membership) and post-reconcile (by the
    // moments the viewer holds tokens for) overlap almost entirely —
    // reconciling twice per dashboard load was pure waste. Dedup keeps
    // the exact same set of practices synced (freshness guarantee
    // intact) at roughly half the write fan-out.
    const reconciledGroupPracticeIds = new Set<number>();
    const reconciledFeedPracticeIds = new Set<number>();
    if (shouldReconcile) try {
      const myGroupRows = await db.select({ groupId: groupMembersTable.groupId })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.userId, sessionUserId));
      const myGroupIds = [...new Set(myGroupRows.map(r => r.groupId))];
      if (myGroupIds.length > 0) {
        // Practices where one of the viewer's groups is PRIMARY.
        const primaryPractices = await db.select({ id: sharedMomentsTable.id })
          .from(sharedMomentsTable)
          .where(and(
            inArray(sharedMomentsTable.groupId, myGroupIds),
            sql`${sharedMomentsTable.state} != 'archived'`,
          ));
        // Practices where one of the viewer's groups is a SECONDARY link
        // (moment_groups junction). Multi-group intercessions must
        // reconcile here too or secondary-group members never get tokens
        // and the practice silently skips their dashboard + slideshow.
        const secondaryPractices = await db.select({ id: sharedMomentsTable.id })
          .from(sharedMomentsTable)
          .innerJoin(momentGroupsTable, eq(momentGroupsTable.momentId, sharedMomentsTable.id))
          .where(and(
            inArray(momentGroupsTable.groupId, myGroupIds),
            sql`${sharedMomentsTable.state} != 'archived'`,
          ));
        const allPracticeIds = Array.from(new Set([
          ...primaryPractices.map(p => p.id),
          ...secondaryPractices.map(p => p.id),
        ]));
        await Promise.all(allPracticeIds.map(id => reconcileGroupPracticeMembers(id)));
        for (const id of allPracticeIds) reconciledGroupPracticeIds.add(id);
      }

      // Same pre-reconcile pattern for feed-scoped intercessions:
      // every feed the viewer subscribes to has its intercessions
      // synced against the current subscriber roster before we read
      // tokens. Keeps newly-published feed intercessions instantly
      // visible without waiting for a per-moment write to fire.
      const myFeedRows = await db.select({ feedId: prayerFeedSubscriptionsTable.feedId })
        .from(prayerFeedSubscriptionsTable)
        .where(eq(prayerFeedSubscriptionsTable.userId, sessionUserId));
      const myFeedIds = [...new Set(myFeedRows.map(r => r.feedId))];
      if (myFeedIds.length > 0) {
        const feedPractices = await db.select({ id: sharedMomentsTable.id })
          .from(sharedMomentsTable)
          .where(and(
            inArray(sharedMomentsTable.prayerFeedId, myFeedIds),
            sql`${sharedMomentsTable.state} != 'archived'`,
          ));
        await Promise.all(feedPractices.map(p => reconcileFeedPracticeMembers(p.id)));
        for (const p of feedPractices) reconciledFeedPracticeIds.add(p.id);
      }
    } catch (err) {
      console.error("[GET /api/moments] pre-reconcile failed:", err);
    }

    // Find all moment_user_tokens for this user's email. Compared
    // case-insensitively because moment_user_tokens.email is written
    // straight from group_members.email (preserved-case from invites),
    // while users.email may have been normalised differently at signup.
    // A casing mismatch here makes community intercessions silently
    // invisible to the recipient even though their token row exists.
    const userTokenRows = await db.select().from(momentUserTokensTable)
      .where(sql`LOWER(${momentUserTokensTable.email}) = LOWER(${user.email})`);

    const momentIds = [...new Set(userTokenRows.map(t => t.momentId))];
    if (momentIds.length === 0) { res.json({ moments: [] }); return; }

    const now = new Date();
    // Keep aligned with dashboard GoalReachedModal renewal window (2 days).
    const graceMs = 2 * 24 * 60 * 60 * 1000;
    const rawMoments = await db.select().from(sharedMomentsTable)
      .where(inArray(sharedMomentsTable.id, momentIds));
    // A prayer feed turned "off" (state != 'live', e.g. paused) must drop
    // out of the slideshow/timeline even for already-subscribed users.
    // Feed intercessions flow through here as shared_moments, so this is
    // where the full-off rule has to apply on the read path (discovery,
    // /today, /subscribed, the office, and digests are filtered elsewhere).
    // Nothing is deleted — flipping the feed back to live restores them.
    const momentFeedIds = [...new Set(
      rawMoments.map(m => m.prayerFeedId).filter((f): f is number => f != null),
    )];
    const offFeedIds = new Set<number>();
    if (momentFeedIds.length > 0) {
      const feedStateRows = await db
        .select({ id: prayerFeedsTable.id, state: prayerFeedsTable.state })
        .from(prayerFeedsTable)
        .where(inArray(prayerFeedsTable.id, momentFeedIds));
      for (const f of feedStateRows) if (f.state !== "live") offFeedIds.add(f.id);
    }
    const flatMoments = rawMoments
      .filter(m => {
        if (m.ritualId !== null || m.state === "archived") return false;
        if (m.prayerFeedId != null && offFeedIds.has(m.prayerFeedId)) return false;
        // Intercessions: hide once the current cycle window expires.
        // The window is [cycleStartedAt, cycleStartedAt + goalDays).
        // Past the end → hide regardless of bloom count, streak, or
        // anything else. A renewal restarts the window by writing
        // a fresh cycleStartedAt; an unextended intercession ages
        // out naturally without any cleanup job needing to fire.
        //
        // The reachedAt grace check stays so the 2-day window after
        // hitting the goal keeps the moment visible long enough for
        // the admin to see the Extend popup, even if the cycle is
        // technically over.
        if (m.templateType === "intercession") {
          const mAny = m as Record<string, unknown>;
          const reachedAt = mAny.commitmentGoalReachedAt as Date | null;
          const cycleStartedAt = mAny.commitmentCycleStartedAt as Date | null;
          if (reachedAt && (now.getTime() - new Date(reachedAt).getTime()) > graceMs) return false;
          if (!reachedAt && m.goalDays > 0 && cycleStartedAt) {
            const cycleEndMs = new Date(cycleStartedAt).getTime() + m.goalDays * 24 * 60 * 60 * 1000;
            if (now.getTime() > cycleEndMs) return false;
          }
        }
        return true;
      });

    // If any practices are Lectio Divina, fetch the current Sunday's reading
    // once and reuse it across all of them.
    const anyLectio = flatMoments.some(m => m.templateType === "lectio-divina");
    let lectioReadingMeta: { sundayDate: string; sundayName: string | null; gospelReference: string | null; gospelText: string | null } | null = null;
    if (anyLectio) {
      try {
        const reading = await getReadingForSunday(nextSundayDate());
        lectioReadingMeta = {
          sundayDate: reading.sundayDate,
          sundayName: reading.sundayName,
          gospelReference: reading.gospelReference,
          gospelText: reading.gospelText,
        };
      } catch (err) {
        console.warn("[moments] lectio reading fetch failed:", err);
      }
    }

    // Reconcile membership for every group-linked AND feed-linked
    // practice. Practices attached to a group reflect the group's current
    // roster; feed-scoped intercessions reflect the feed's subscribers.
    // Either way, this is the authoritative sync point so a stale eager
    // path can't leak into the response.
    // Post-reconcile — only practices NOT already synced by the pre-
    // reconcile above. This catches the edge cases the membership-based
    // pre-pass misses (e.g. a token lingering from a group the viewer
    // has since left), without re-running the writes for everything the
    // pre-pass already handled. Gated on the same shouldReconcile flag as
    // the pre-pass so a throttled read does zero reconcile writes.
    if (shouldReconcile) {
      await Promise.all(
        flatMoments
          .filter(m => m.groupId !== null && m.groupId !== undefined && !reconciledGroupPracticeIds.has(m.id))
          .map(m => reconcileGroupPracticeMembers(m.id))
      );
      await Promise.all(
        flatMoments
          .filter(m => m.prayerFeedId !== null && m.prayerFeedId !== undefined && !reconciledFeedPracticeIds.has(m.id))
          .map(m => reconcileFeedPracticeMembers(m.id))
      );
    }

    // Build a set of emails that have actual user accounts (i.e. have signed up).
    // Used to show "invited" vs "joined" status on member lists.
    const allMemberTokens = await db.select({ email: momentUserTokensTable.email })
      .from(momentUserTokensTable)
      .where(inArray(momentUserTokensTable.momentId, flatMoments.map(m => m.id)));
    const uniqueMemberEmails = [...new Set(allMemberTokens.map(t => t.email.toLowerCase()))];
    const registeredUsers = uniqueMemberEmails.length > 0
      ? await db.select({ email: usersTable.email, avatarUrl: usersTable.avatarUrl }).from(usersTable)
          .where(inArray(usersTable.email, uniqueMemberEmails))
      : [];
    const registeredEmails = new Set(registeredUsers.map(u => u.email.toLowerCase()));
    const avatarByEmailList = new Map(registeredUsers.map(u => [u.email.toLowerCase(), u.avatarUrl]));

    // Batch-fetch group info for all group-linked practices. "Linked"
    // means either via the primary sharedMoments.group_id OR via the
    // moment_groups junction (multi-group intercessions). Both sources
    // need to be represented in the response so the community-home
    // filter (m.group?.slug === slug || m.additionalGroups[].slug)
    // can find a moment that was attached post-creation to a second
    // community.
    const flatMomentIds = flatMoments.map(m => m.id);
    const extraLinkRows = flatMomentIds.length > 0
      ? await db.select().from(momentGroupsTable).where(inArray(momentGroupsTable.momentId, flatMomentIds))
      : [];

    // Hidden-admin visibility filter. A user who is hidden_admin in
    // a group should NOT see that group's content in their feed —
    // the role is purely managerial. We drop any moment whose only
    // path to this user runs through a hidden-admin membership: if
    // the moment is in a single group and the user is hidden_admin
    // there, hide it; if it spans multiple groups, keep it as long
    // as the user is a regular (non-hidden_admin) member somewhere.
    const myMembershipRows = await db
      .select({ groupId: groupMembersTable.groupId, role: groupMembersTable.role })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, sessionUserId));
    const hiddenAdminGroupSet = new Set(
      myMembershipRows.filter(r => r.role === "hidden_admin").map(r => r.groupId),
    );
    const visibleGroupSet = new Set(
      myMembershipRows.filter(r => r.role !== "hidden_admin").map(r => r.groupId),
    );
    if (hiddenAdminGroupSet.size > 0) {
      // momentId → set of groupIds this moment is linked to.
      const linkedByMoment = new Map<number, Set<number>>();
      for (const m of flatMoments) {
        const set = new Set<number>();
        if (typeof m.groupId === "number") set.add(m.groupId);
        linkedByMoment.set(m.id, set);
      }
      for (const link of extraLinkRows) {
        const set = linkedByMoment.get(link.momentId);
        if (set) set.add(link.groupId);
      }
      // Keep a moment iff it has no group attachment (personal
      // practice — visibility comes from token alone) OR at least
      // one of its groups is one where the viewer is NOT
      // hidden_admin.
      const visibleMomentIds = new Set<number>();
      for (const [momentId, groupIds] of linkedByMoment.entries()) {
        if (groupIds.size === 0) { visibleMomentIds.add(momentId); continue; }
        let hasVisiblePath = false;
        for (const gid of groupIds) {
          if (!hiddenAdminGroupSet.has(gid) || visibleGroupSet.has(gid)) {
            hasVisiblePath = true;
            break;
          }
        }
        if (hasVisiblePath) visibleMomentIds.add(momentId);
      }
      // In-place filter; downstream code reads from flatMoments.
      for (let i = flatMoments.length - 1; i >= 0; i--) {
        if (!visibleMomentIds.has(flatMoments[i].id)) flatMoments.splice(i, 1);
      }
    }
    const primaryIds = flatMoments.map(m => m.groupId).filter((id): id is number => id !== null);
    const extraIds = extraLinkRows.map(r => r.groupId);
    const groupIds = [...new Set([...primaryIds, ...extraIds])];
    const groupMap = new Map<number, { id: number; name: string; slug: string; emoji: string | null }>();
    if (groupIds.length > 0) {
      const groups = await db.select().from(groupsTable).where(inArray(groupsTable.id, groupIds));
      for (const g of groups) groupMap.set(g.id, { id: g.id, name: g.name, slug: g.slug, emoji: g.emoji });
    }
    // momentId → additional groups (excluding the primary if the
    // junction row duplicates it, which shouldn't happen but costs
    // nothing to guard).
    const additionalGroupsByMomentId = new Map<number, Array<{ id: number; name: string; slug: string; emoji: string | null }>>();
    for (const link of extraLinkRows) {
      const g = groupMap.get(link.groupId);
      if (!g) continue;
      const primaryForMoment = flatMoments.find(m => m.id === link.momentId)?.groupId ?? null;
      if (primaryForMoment === link.groupId) continue;
      const arr = additionalGroupsByMomentId.get(link.momentId) ?? [];
      if (!arr.some(x => x.id === g.id)) arr.push(g);
      additionalGroupsByMomentId.set(link.momentId, arr);
    }

    // Derive an "effective group" for practices that don't have groupId
    // stamped in the DB yet. If every member of the practice belongs to
    // exactly one shared community, we use that community as the card's
    // anchor — matches how the frontend already treats group-stamped
    // practices. This heals legacy practices created before the group-attach
    // flow existed without requiring a destructive migration.
    //
    // Strategy:
    //   1. Pull all group memberships for all token emails across all
    //      ungrouped practices (one query).
    //   2. For each practice, compute the intersection of group IDs that
    //      every member belongs to. If that intersection has exactly one
    //      group, that's the effective group.
    const ungroupedMomentIds = flatMoments.filter(m => !m.groupId).map(m => m.id);
    const effectiveGroupByMomentId = new Map<number, { id: number; name: string; slug: string; emoji: string | null }>();
    if (ungroupedMomentIds.length > 0) {
      // All token rows across all ungrouped practices (we already fetch
      // per-moment later but doing it once here avoids an N+1 for group
      // membership lookups).
      const tokenRows = await db.select({
        momentId: momentUserTokensTable.momentId,
        email: momentUserTokensTable.email,
      })
        .from(momentUserTokensTable)
        .where(inArray(momentUserTokensTable.momentId, ungroupedMomentIds));

      const emailsByMoment = new Map<number, Set<string>>();
      const allEmails = new Set<string>();
      for (const t of tokenRows) {
        const e = t.email.toLowerCase();
        if (!emailsByMoment.has(t.momentId)) emailsByMoment.set(t.momentId, new Set());
        emailsByMoment.get(t.momentId)!.add(e);
        allEmails.add(e);
      }

      if (allEmails.size > 0) {
        // Resolve emails → userIds (only registered users have groups)
        const users = await db.select({ id: usersTable.id, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.email, Array.from(allEmails)));
        const userIdByEmail = new Map(users.map(u => [u.email.toLowerCase(), u.id]));

        if (users.length > 0) {
          // Only joined group memberships count — pending invites don't
          // make the group "shared".
          const memberships = await db.select({
            userId: groupMembersTable.userId,
            groupId: groupMembersTable.groupId,
          })
            .from(groupMembersTable)
            .where(and(
              inArray(groupMembersTable.userId, users.map(u => u.id)),
              sql`${groupMembersTable.joinedAt} IS NOT NULL`,
            ));
          const groupIdsByUserId = new Map<number, Set<number>>();
          for (const m of memberships) {
            // userId is nullable on pending invites — skip those.
            if (m.userId == null) continue;
            if (!groupIdsByUserId.has(m.userId)) groupIdsByUserId.set(m.userId, new Set());
            groupIdsByUserId.get(m.userId)!.add(m.groupId);
          }

          // Fetch group metadata for any newly-referenced groups
          const allGroupIds = new Set<number>();
          for (const set of groupIdsByUserId.values()) for (const id of set) allGroupIds.add(id);
          const missing = [...allGroupIds].filter(id => !groupMap.has(id));
          if (missing.length > 0) {
            const extra = await db.select().from(groupsTable).where(inArray(groupsTable.id, missing));
            for (const g of extra) groupMap.set(g.id, { id: g.id, name: g.name, slug: g.slug, emoji: g.emoji });
          }

          // For each ungrouped moment, compute the intersection of its
          // members' group IDs. If the intersection has exactly one
          // group, use it.
          for (const [momentId, emails] of emailsByMoment.entries()) {
            const memberGroupSets: Set<number>[] = [];
            let anyUnregistered = false;
            for (const email of emails) {
              const uid = userIdByEmail.get(email);
              if (uid == null) { anyUnregistered = true; break; }
              const s = groupIdsByUserId.get(uid);
              if (!s || s.size === 0) { anyUnregistered = true; break; }
              memberGroupSets.push(s);
            }
            if (anyUnregistered || memberGroupSets.length === 0) continue;
            // Intersect all member sets
            const [first, ...rest] = memberGroupSets;
            const intersection = new Set<number>();
            for (const id of first) {
              if (rest.every(s => s.has(id))) intersection.add(id);
            }
            if (intersection.size === 1) {
              const [gid] = [...intersection];
              const g = groupMap.get(gid);
              if (g) effectiveGroupByMomentId.set(momentId, g);
            }
          }
        }
      }
    }

    // Batch-load members / windows / posts for ALL moments in one query each
    // (grouped by moment id below), instead of 3-4 per-moment round-trips
    // inside the map. This endpoint backs the dashboard + /practices, so that
    // per-moment fan-out was the app's hottest N+1.
    const _allMomentIds = flatMoments.map((m) => m.id);
    const _membersAll = _allMomentIds.length
      ? await db.select().from(momentUserTokensTable).where(inArray(momentUserTokensTable.momentId, _allMomentIds))
      : [];
    const _windowsAll = _allMomentIds.length
      ? await db.select().from(momentWindowsTable).where(inArray(momentWindowsTable.momentId, _allMomentIds))
      : [];
    const _postsAll = _allMomentIds.length
      ? await db.select().from(momentPostsTable).where(inArray(momentPostsTable.momentId, _allMomentIds))
      : [];
    const _membersByMoment = new Map<number, typeof _membersAll>();
    const _windowsByMoment = new Map<number, typeof _windowsAll>();
    const _postsByMoment = new Map<number, typeof _postsAll>();
    for (const r of _membersAll) { const a = _membersByMoment.get(r.momentId); if (a) a.push(r); else _membersByMoment.set(r.momentId, [r]); }
    for (const r of _windowsAll) { const a = _windowsByMoment.get(r.momentId); if (a) a.push(r); else _windowsByMoment.set(r.momentId, [r]); }
    for (const r of _postsAll) { const a = _postsByMoment.get(r.momentId); if (a) a.push(r); else _postsByMoment.set(r.momentId, [r]); }

    // Enrich each moment INDEPENDENTLY. If any single moment's enrichment
    // throws (bad timezone, computeWindowOpen edge case, a null-dereference
    // we didn't anticipate, etc.), we log it and fall back to the raw row
    // so the rest of the user's practices still appear. Without this,
    // one broken moment takes down the entire dashboard + /practices page.
    const enriched = await Promise.all(flatMoments.map(async (m) => {
      try {
        const allMembers = _membersByMoment.get(m.id) ?? [];

        const todayPosts = (_postsByMoment.get(m.id) ?? []).filter(
          (p) => p.windowDate === todayDateInTz(m.timezone || "UTC"),
        );

        // slice() — the streak/bloom code below sorts + splices this in place.
        const windows = (_windowsByMoment.get(m.id) ?? []).slice();
        const latestWindow = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate))[0] ?? null;

        const myToken = userTokenRows.find(t => t.momentId === m.id);

        // Personal streak
        const todayDate = todayDateInTz(m.timezone || "UTC");
        const allPosts = _postsByMoment.get(m.id) ?? [];
        const myPostDates = new Set(allPosts.filter(p => p.userToken === myToken?.userToken).map(p => p.windowDate));
        const todayILogged = myPostDates.has(todayDate);

        // Back-fill missing past window records so the streak walk below is accurate.
        // evaluateWindow only fires when a window closes or bloom threshold is hit;
        // posts made to still-open windows leave no window row, breaking the streak.
        {
          const existingWindowDates = new Set(windows.map(w => w.windowDate));
          const allPastPostDates = [...new Set(
            allPosts.filter(p => p.windowDate !== "seed" && p.windowDate < todayDate).map(p => p.windowDate)
          )];
          const missingDates = allPastPostDates.filter(d => !existingWindowDates.has(d));
          if (missingDates.length > 0) {
            for (const d of missingDates) {
              try { await evaluateWindow(m.id, d); } catch { /* non-fatal */ }
            }
            const refetched = await db.select().from(momentWindowsTable).where(eq(momentWindowsTable.momentId, m.id));
            windows.splice(0, windows.length, ...refetched);
          }
        }

        let myStreak = todayILogged ? 1 : 0;
        const sortedWindows = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate));
        for (const w of sortedWindows) {
          if (w.windowDate === todayDate) continue;
          if (myPostDates.has(w.windowDate)) { myStreak++; } else { break; }
        }

        // Compute group streak from actual window bloom data — not the
        // currentStreak field which can be corrupted by double-bloom bugs
        // or reset by goal hits. Walk backwards through bloom windows.
        //
        // Threshold semantics:
        // - Intercessions: ≥2 distinct users praying *and* ≥2 members.
        //   A *group* streak is a together streak — one solo prayer
        //   shouldn't bloom the day for the community, otherwise a
        //   single-member intercession would silently rack up a fake
        //   group streak. (The personal streak still counts solo prayers.)
        // - Everything else (practices): majority threshold
        //   ceil(members/2), min 2, requires ≥2 members.
        const isIntercessionMoment = m.templateType === "intercession";
        const uniqueUsersOnDate = (date: string) => {
          const set = new Set<string>();
          for (const p of allPosts) {
            if (p.windowDate === date) set.add(p.userToken);
          }
          return set.size;
        };
        const bloomThreshold = isIntercessionMoment
          ? 2
          : Math.max(2, Math.ceil(allMembers.length / 2));
        const todayBloom = allMembers.length >= 2 &&
          (isIntercessionMoment
            ? uniqueUsersOnDate(todayDate) >= bloomThreshold
            : todayPosts.length >= bloomThreshold);
        // Past-day bloom: for intercessions, recompute from posts
        // (uniqueUsers≥2) instead of trusting w.status, since legacy
        // windows were evaluated against the old single-prayer rule and
        // would inflate the streak.
        const isBloomDay = (w: { windowDate: string; status: string }) =>
          isIntercessionMoment
            ? (allMembers.length >= 2 && uniqueUsersOnDate(w.windowDate) >= 2)
            : w.status === "bloom";
        let groupStreak = todayBloom ? 1 : 0;
        for (const w of sortedWindows) {
          if (w.windowDate === todayDate) continue;
          if (isBloomDay(w)) { groupStreak++; } else { break; }
        }

        // Actual session count from window bloom data — the DB field
        // commitmentSessionsLogged may be corrupted by the double-bloom bug.
        const computedSessionsLogged = sortedWindows.filter(
          w => w.windowDate !== todayDate && w.status === "bloom"
        ).length + (todayBloom ? 1 : 0);

        // Most recent post the current user made on this practice. The
        // prayer list card uses this to render "Last prayed 3 days ago"
        // and anything else that wants to show "when did *you* last
        // pray through this?" — distinct from the group's latestWindow.
        const myPosts = allPosts.filter(p => p.userToken === myToken?.userToken && p.windowDate !== "seed");
        const myLastPostAt: string | null = myPosts.length > 0
          ? myPosts.reduce<Date>((latest, p) => {
              const ts = p.createdAt ? new Date(p.createdAt) : null;
              if (!ts) return latest;
              return ts > latest ? ts : latest;
            }, new Date(0)).toISOString()
          : null;

        // Most recent PAST window's group activity — used by the dashboard
        // card to replace "0 of 2 have prayed today" with a truthful
        // "2 prayed Wednesday" on days the intercession isn't happening.
        // We derive this from actual posts (not window.postCount, which is
        // stale until evaluateWindow fires) so it's accurate the moment
        // someone logs a prayer.
        const postsByWindow = new Map<string, Set<string>>();
        for (const p of allPosts) {
          if (p.windowDate === "seed") continue;
          if (!postsByWindow.has(p.windowDate)) postsByWindow.set(p.windowDate, new Set());
          postsByWindow.get(p.windowDate)!.add(p.userToken);
        }
        // Rolling 7-day unique-prayer count. Used by the prayer-list slideshow
        // to tell viewers "3 people have prayed this this week" under each
        // intercession — a gentler signal than the daily count because it
        // still shows warmth on days with zero check-ins yet. Dates are
        // YYYY-MM-DD strings in the moment's timezone, so lex-compare matches
        // calendar order.
        const weekCutoff = (() => {
          const [y, m2, d] = todayDate.split("-").map(Number);
          const t = Date.UTC(y!, (m2 ?? 1) - 1, d ?? 1) - 6 * 86_400_000;
          const dt = new Date(t);
          return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
        })();
        const weekUserTokens = new Set<string>();
        for (const [date, tokens] of postsByWindow.entries()) {
          if (date >= weekCutoff && date <= todayDate) {
            for (const t of tokens) weekUserTokens.add(t);
          }
        }
        const weekPostCount = weekUserTokens.size;
        const pastWindowDatesWithPosts = [...postsByWindow.keys()]
          .filter(d => d !== todayDate)
          .sort((a, b) => b.localeCompare(a));
        const lastWindowDate: string | null = pastWindowDatesWithPosts[0] ?? null;
        const lastWindowPostCount: number = lastWindowDate
          ? postsByWindow.get(lastWindowDate)!.size
          : 0;

        // Lectio-specific enrichment: this week's reading + how many members have
        // submitted any reflection for the current Sunday anchor.
        let lectioSundayName: string | null = null;
        let lectioGospelReference: string | null = null;
        let lectioGospelText: string | null = null;
        let lectioResponseCount = 0;
        // Whether *this user* has submitted the current stage's reflection for
        // this week. Used by the dashboard to move the card out of "today" once
        // they've reflected (since lectio reflections don't write to
        // moment_posts, todayPostCount alone never moves it).
        let lectioMyStageDone = false;
        // Current stage label ("Lectio" / "Meditatio" / "Oratio") and a short
        // "next time" hint ("Wed · Meditatio") for the dashboard card.
        let lectioCurrentStageLabel: string | null = null;
        let lectioNextStageLabel: string | null = null;
        if (m.templateType === "lectio-divina" && lectioReadingMeta) {
          lectioSundayName = lectioReadingMeta.sundayName;
          lectioGospelReference = lectioReadingMeta.gospelReference;
          lectioGospelText = lectioReadingMeta.gospelText;
          // Reflections count query is isolated in its own try/catch so a
          // schema drift (missing column, bad migration) on lectio_reflections
          // can't wipe out the gospel text on the card. The count is a nice-
          // to-have; the verses are the point of the card.
          try {
            const weekReflections = await db.select().from(lectioReflectionsTable)
              .where(and(
                eq(lectioReflectionsTable.momentId, m.id),
                eq(lectioReflectionsTable.sundayDate, lectioReadingMeta.sundayDate),
              ));
            lectioResponseCount = new Set(weekReflections.map(r => r.userToken)).size;

            // Determine the current stage for this practice's timezone:
            // Mon/Tue → lectio, Wed/Thu → meditatio, Fri/Sat → oratio,
            // Sun → no current stage (gathering day, nothing for the card).
            const dow = getCurrentDayOfWeekInTz(m.timezone || "UTC");
            const currentStage =
              dow === 1 || dow === 2 ? "lectio" :
              dow === 3 || dow === 4 ? "meditatio" :
              dow === 5 || dow === 6 ? "oratio" : null;
            // Check which stages the user has completed this week
            const myStages = myToken
              ? new Set(weekReflections.filter(r => r.userToken === myToken.userToken).map(r => r.stage))
              : new Set<string>();
            const allThreeDone = myStages.has("lectio") && myStages.has("meditatio") && myStages.has("oratio");

            if (currentStage && myToken) {
              lectioMyStageDone = myStages.has(currentStage);
            } else if (!currentStage) {
              // Sunday: not actionable; treat as done so it doesn't sit in "today".
              lectioMyStageDone = true;
            }

            // Friendly labels for the dashboard card. "Completed" only shows
            // when the user has actually submitted all three stages this week.
            const STAGE_LABEL = { lectio: "Stage 1", meditatio: "Stage 2", oratio: "Stage 3" } as const;
            lectioCurrentStageLabel = allThreeDone
              ? "Completed"
              : currentStage ? STAGE_LABEL[currentStage] : (myStages.size > 0 ? `${myStages.size} of 3` : "Stage 1");
            // Next reflection day — Lectio Divina only reflects on Mon/Wed/Fri,
            // so this is the next of those three days strictly after today.
            // Friday → Monday (not Sunday, since Sunday has no reflection).
            if (dow === 0) lectioNextStageLabel = "Monday";            // Sun → Mon
            else if (dow === 1 || dow === 2) lectioNextStageLabel = "Wednesday"; // Mon/Tue → Wed
            else if (dow === 3 || dow === 4) lectioNextStageLabel = "Friday";    // Wed/Thu → Fri
            else lectioNextStageLabel = "Monday";                       // Fri/Sat → next Mon
          } catch (reflErr) {
            console.warn(`[moments] lectio reflections count failed for moment ${m.id}:`, reflErr);
            lectioResponseCount = 0;
          }
        }

        // Creator = member with smallest token id (matches single-moment endpoint)
        const creatorToken = allMembers.length > 0
          ? allMembers.reduce((min, mt) => mt.id < min.id ? mt : min, allMembers[0])
          : null;
        const isCreator = (myToken?.email ?? "").toLowerCase() === (creatorToken?.email ?? "").toLowerCase();

        return {
          ...m,
          // Whether the viewer has already logged a prayer for this
          // intercession today. Drives the prayer-feed rotating deck
          // in the slideshow — un-prayed cards bubble to the top.
          myPrayedToday: todayILogged,
          group: m.groupId ? groupMap.get(m.groupId) ?? null : effectiveGroupByMomentId.get(m.id) ?? null,
          additionalGroups: additionalGroupsByMomentId.get(m.id) ?? [],
          memberCount: allMembers.length,
          members: allMembers.map(t => ({
            name: t.name,
            email: t.email,
            joined: registeredEmails.has(t.email.toLowerCase()),
            avatarUrl: avatarByEmailList.get(t.email.toLowerCase()) ?? null,
            // Did this member actually post within the rolling 7-day
            // window? The slideshow face stack uses this so only
            // people who have prayed recently appear — matches the
            // "N have prayed this week" line beneath the faces.
            prayedThisWeek: weekUserTokens.has(t.userToken),
          })),
          todayPostCount: todayPosts.length,
          weekPostCount,
          windowOpen: computeWindowOpen(m),
          isActionableToday: isActionableToday(m),
          isActionableTomorrow: isActionableTomorrow(m),
          minutesLeft: minutesRemaining(m),
          latestWindow,
          myUserToken: myToken?.userToken ?? null,
          myStreak,
          groupStreak,
          computedSessionsLogged,
          myLastPostAt,
          lastWindowDate,
          lastWindowPostCount,
          isCreator,
          lectioSundayName,
          lectioGospelReference,
          lectioGospelText,
          lectioResponseCount,
          lectioMyStageDone,
          lectioCurrentStageLabel,
          lectioNextStageLabel,
          // Fasting stats — weekly numbers drive the dashboard card's flap
          // line 1 ("💧 1,200 gallons saved this week"), all-time numbers
          // drive line 2 ("💧 6,800 gallons saved all time"), and
          // myLoggedToday swaps line 3 into "Fasted today ✓" once the
          // current viewer has posted a check-in for today's fast.
          ...(m.templateType === "fasting" ? (() => {
            const GALLONS_PER_FAST = 400;
            const isMeat = (m as Record<string, unknown>).fastingType === "meat";
            const now = new Date();
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
            const weekStr = startOfWeek.toISOString().split("T")[0];
            let weekFastCount = 0;
            let allTimeFastCount = 0;
            for (const [date, tokens] of postsByWindow.entries()) {
              allTimeFastCount += tokens.size;
              if (date >= weekStr) weekFastCount += tokens.size;
            }
            const myLoggedToday = !!myToken && (postsByWindow.get(todayDate)?.has(myToken.userToken) ?? false);
            return {
              weekFastCount,
              weekGallonsSaved: isMeat ? weekFastCount * GALLONS_PER_FAST : 0,
              allTimeFastCount,
              allTimeGallonsSaved: isMeat ? allTimeFastCount * GALLONS_PER_FAST : 0,
              myLoggedToday,
            };
          })() : {}),
        };
      } catch (err) {
        console.error(`[moments] enrichment failed for moment ${m.id} (${m.templateType}):`, err);
        // Minimal fallback — return the raw row with safe defaults so the
        // card still renders (missing badges/counts, but visible). We still
        // compute isActionableToday from the base row because it only needs
        // templateType/frequency/timezone/practiceDays — none of which require
        // additional DB reads — so the card lands in the right bucket even
        // when enrichment fails.
        const myToken = userTokenRows.find(t => t.momentId === m.id);
        return {
          ...m,
          group: m.groupId ? groupMap.get(m.groupId) ?? null : effectiveGroupByMomentId.get(m.id) ?? null,
          additionalGroups: additionalGroupsByMomentId.get(m.id) ?? [],
          memberCount: 0,
          members: [],
          todayPostCount: 0,
          weekPostCount: 0,
          windowOpen: false,
          isActionableToday: isActionableToday(m),
          isActionableTomorrow: isActionableTomorrow(m),
          minutesLeft: 0,
          latestWindow: null,
          myUserToken: myToken?.userToken ?? null,
          myStreak: 0,
          myLastPostAt: null,
          lastWindowDate: null,
          lastWindowPostCount: 0,
          isCreator: false,
          lectioSundayName: null,
          lectioGospelReference: null,
          lectioGospelText: null,
          lectioResponseCount: 0,
          lectioMyStageDone: false,
          lectioCurrentStageLabel: null,
          lectioNextStageLabel: null,
        };
      }
    }));

    res.json({ moments: enriched });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/moments] top-level failure:", err);
    if (!res.headersSent) res.status(500).json({ error: "moments_list_failed", detail: msg });
  }
});

// ─── GET /api/moments/:id — full detail for one moment ──────────────────────
router.get("/moments/:id", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // If the practice is attached to a group, the member roster derives from the
  // group — reconcile before the auth check so newly-added members are
  // recognized and removed members are rejected.
  await reconcileGroupPracticeMembers(momentId);

  // Auth: must be a participant
  const myTokenRow = await db.select().from(momentUserTokensTable)
    .where(and(eq(momentUserTokensTable.momentId, momentId), sql`LOWER(${momentUserTokensTable.email}) = LOWER(${user.email})`));
  if (myTokenRow.length === 0) { res.status(403).json({ error: "Forbidden" }); return; }

  const allMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));

  // Check which members have actual user accounts (signed up) — also grab avatarUrl
  const memberEmails = allMembers.map(t => t.email.toLowerCase());
  const registeredUsersDetail = memberEmails.length > 0
    ? await db.select({ email: usersTable.email, avatarUrl: usersTable.avatarUrl }).from(usersTable)
        .where(inArray(usersTable.email, memberEmails))
    : [];
  const registeredEmailsDetail = new Set(registeredUsersDetail.map(u => u.email.toLowerCase()));
  const avatarByEmail = new Map(registeredUsersDetail.map(u => [u.email.toLowerCase(), u.avatarUrl]));

  // All windows sorted newest first
  let windows = await db.select().from(momentWindowsTable)
    .where(eq(momentWindowsTable.momentId, momentId));

  // All posts ever
  const allPosts = await db.select().from(momentPostsTable)
    .where(eq(momentPostsTable.momentId, momentId));

  // Group posts by windowDate, separate out seed posts
  const postsByDate: Record<string, typeof allPosts> = {};
  const seedPosts: typeof allPosts = [];
  for (const post of allPosts) {
    if (post.windowDate === "seed") {
      seedPosts.push(post);
    } else {
      if (!postsByDate[post.windowDate]) postsByDate[post.windowDate] = [];
      postsByDate[post.windowDate].push(post);
    }
  }

  // ── Back-fill missing past windows ──────────────────────────────────────
  // evaluateWindow only runs when a post closes a window or hits the bloom
  // threshold. If a user logs during an open window that never gets another
  // post, no window record is ever created — which meant yesterday's log
  // would vanish from the timeline and break the streak. Retroactively
  // evaluate any past date that has posts but no window record.
  {
    const tzForBackfill = moment.timezone || "UTC";
    const todayStrForBackfill = todayDateInTz(tzForBackfill);
    const existingWindowDates = new Set(windows.map(w => w.windowDate));
    const missingPastDates = Object.keys(postsByDate).filter(
      d => d < todayStrForBackfill && !existingWindowDates.has(d),
    );
    if (missingPastDates.length > 0) {
      for (const d of missingPastDates) {
        try {
          await evaluateWindow(momentId, d);
        } catch (err) {
          console.warn("Back-fill evaluateWindow failed for", d, err);
        }
      }
      // Re-fetch windows so the synthesized entries are included
      windows = await db.select().from(momentWindowsTable)
        .where(eq(momentWindowsTable.momentId, momentId));
      // Refresh moment because evaluateWindow may have mutated streak/state
      const [refreshedMoment] = await db.select().from(sharedMomentsTable)
        .where(eq(sharedMomentsTable.id, momentId));
      if (refreshedMoment) Object.assign(moment, refreshedMoment);
    }
  }
  const sortedWindows = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate));

  const windowsWithPosts = sortedWindows.map(w => ({
    ...w,
    posts: (postsByDate[w.windowDate] ?? []).map(p => ({
      guestName: p.guestName,
      photoUrl: p.photoUrl,
      reflectionText: p.reflectionText,
      isCheckin: p.isCheckin === 1,
      loggedAt: p.createdAt?.toISOString() ?? null,
    })),
  }));

  // Today's open window (may not have a record yet if no posts)
  const tz = moment.timezone || "UTC";
  const windowDate = todayDateInTz(tz);
  const todayPosts = postsByDate[windowDate] ?? [];
  const windowOpen = computeWindowOpen(moment);
  const minsLeft = minutesRemaining(moment);

  // Per-member today log status — match by guestName
  const todayLogs = allMembers.map(member => {
    const memberName = (member.name ?? member.email).toLowerCase();
    const post = todayPosts.find(p => (p.guestName ?? "").toLowerCase() === memberName);
    return {
      name: member.name ?? member.email,
      email: member.email,
      avatarUrl: avatarByEmail.get(member.email.toLowerCase()) ?? null,
      loggedAt: post?.createdAt?.toISOString() ?? null,
      reflectionText: post?.reflectionText ?? null,
      isCheckin: post ? post.isCheckin === 1 : false,
    };
  });

  // Per-member 7-day log status — for the "prayed this week" pill row on
  // the intercession detail view. A member qualifies if they have any post
  // in the last 7 calendar days, even if they didn't pray today. We return
  // `loggedAt` as the most-recent post in the window (null if none) so the
  // client can render a pill row for everyone who's shown up this week.
  const weekCutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekLogs = allMembers.map(member => {
    const memberName = (member.name ?? member.email).toLowerCase();
    const memberPosts = allPosts
      .filter(p =>
        (p.guestName ?? "").toLowerCase() === memberName &&
        p.createdAt && new Date(p.createdAt).getTime() >= weekCutoffMs
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const mostRecent = memberPosts[0];
    return {
      name: member.name ?? member.email,
      email: member.email,
      avatarUrl: avatarByEmail.get(member.email.toLowerCase()) ?? null,
      loggedAt: mostRecent?.createdAt?.toISOString() ?? null,
    };
  });

  // Determine creator — member with the smallest token id
  const creatorToken = allMembers.length > 0
    ? allMembers.reduce((min, m) => m.id < min.id ? m : min, allMembers[0])
    : null;
  const isCreator = myTokenRow[0]?.email.toLowerCase() === creatorToken?.email.toLowerCase();
  // Drives the edit / archive / delete UI. Mirrors the server-side
  // canManageMoment helper: creator OR admin of the primary group.
  // For a community intercession scheduled inside a parish, every
  // admin of that parish gets the edit affordance, not just whoever
  // happened to tap "create."
  const canManage = await canManageMoment({
    userId: sessionUserId,
    userEmail: user.email,
    momentId,
    primaryGroupId: moment.groupId,
  });

  // Check if the creator's calendar event was deleted
  let calendarEventMissing = false;
  const myEventId = myTokenRow[0]?.googleCalendarEventId;
  if (isCreator && myEventId && myTokenRow[0]?.calendarConnected) {
    const calEvent = await getCalendarEvent(sessionUserId, myEventId);
    if (!calEvent) calendarEventMissing = true;
  }

  // Personal streak: consecutive closed windows (newest first) where current user posted
  const myUserTokenValue = myTokenRow[0]?.userToken ?? null;
  const myPostDates = new Set(
    allPosts.filter(p => p.userToken === myUserTokenValue).map(p => p.windowDate)
  );
  // Include today if I've already logged
  const todayILogged = myPostDates.has(windowDate);
  let myStreak = todayILogged ? 1 : 0;
  // Walk through past closed windows in order
  for (const w of sortedWindows) {
    if (w.windowDate === windowDate) continue; // skip today (counted above)
    if (myPostDates.has(w.windowDate)) {
      myStreak++;
    } else {
      break;
    }
  }

  // Compute group streak from actual window bloom data — not the
  // currentStreak field which can be corrupted by double-bloom bugs
  // or reset by goal hits. Walk backwards through bloom windows.
  //
  // Intercessions: a *group* streak only makes sense when the group
  // actually prayed together — one solo prayer per day shouldn't bloom
  // the day for the group, otherwise a single-member intercession
  // accrues a fake "group streak" indistinguishable from the personal
  // one. Require ≥2 distinct users praying that day, AND a community
  // of ≥2 members. (My-streak still counts solo prayers.)
  const isIntercessionMoment = moment.templateType === "intercession";
  const uniqueUsersOnDate = (date: string) => {
    const set = new Set<string>();
    for (const p of postsByDate[date] ?? []) set.add(p.userToken);
    return set.size;
  };
  const bloomThreshold = isIntercessionMoment
    ? 2
    : Math.max(2, Math.ceil(allMembers.length / 2));
  const todayBloom = allMembers.length >= 2 &&
    uniqueUsersOnDate(windowDate) >= bloomThreshold;
  // For intercessions, recompute past-day bloom from posts (uniqueUsers≥2)
  // rather than trusting w.status, since legacy windows were evaluated
  // against the old single-prayer rule and would inflate the streak.
  const isBloomDay = (w: { windowDate: string; status: string }) =>
    isIntercessionMoment
      ? (allMembers.length >= 2 && uniqueUsersOnDate(w.windowDate) >= 2)
      : w.status === "bloom";
  let groupStreak = todayBloom ? 1 : 0;
  for (const w of sortedWindows) {
    if (w.windowDate === windowDate) continue;
    if (isBloomDay(w)) { groupStreak++; } else { break; }
  }
  // Group best: longest consecutive bloom run across all windows.
  // Skip today's window in the loop (its status may be stale) and
  // append todayBloom at the end to avoid double-counting.
  let groupBest = groupStreak;
  {
    let run = 0;
    const chronological = [...sortedWindows].reverse();
    for (const w of chronological) {
      if (w.windowDate === windowDate) continue; // skip today
      if (isBloomDay(w)) { run++; if (run > groupBest) groupBest = run; }
      else { run = 0; }
    }
    // Include today's bloom if applicable
    if (todayBloom) { run++; if (run > groupBest) groupBest = run; }
  }

  // Actual session count from window bloom data — the DB field
  // commitmentSessionsLogged may be corrupted by the double-bloom bug.
  const computedSessionsLogged = sortedWindows.filter(
    w => w.windowDate !== windowDate && w.status === "bloom"
  ).length + (todayBloom ? 1 : 0);

  // ── Fasting water-conservation stats (detail view) ───────────────────────
  // Compute per-period fast-day counts so the detail page can show
  // "saved this week / this month / all time" split by you vs. the group.
  let fastingWaterStats: {
    my: { week: number; month: number; allTime: number };
    group: { week: number; month: number; allTime: number };
  } | null = null;

  if (moment.templateType === "fasting") {
    const now = new Date();
    const sunOffset = now.getDay(); // 0 = Sunday
    const startOfWeekDate = new Date(now);
    startOfWeekDate.setDate(now.getDate() - sunOffset);
    const weekStr  = startOfWeekDate.toISOString().slice(0, 10);
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // Build postsByWindow: windowDate → number of unique users who logged
    const postsByWindowMap = new Map<string, Set<string>>();
    for (const p of allPosts) {
      if (!p.windowDate || p.windowDate === "seed") continue;
      if (!postsByWindowMap.has(p.windowDate)) postsByWindowMap.set(p.windowDate, new Set());
      postsByWindowMap.get(p.windowDate)!.add(p.userToken ?? p.guestName ?? "?");
    }

    // My days: count distinct dates in myPostDates per period
    let myWeek = 0, myMonth = 0, myAllTime = 0;
    for (const d of myPostDates) {
      if (d === "seed") continue;
      myAllTime++;
      if (d >= monthStr) myMonth++;
      if (d >= weekStr)  myWeek++;
    }

    // Group days: sum unique-user counts per window per period
    let grpWeek = 0, grpMonth = 0, grpAllTime = 0;
    for (const [date, tokens] of postsByWindowMap.entries()) {
      const n = tokens.size;
      grpAllTime += n;
      if (date >= monthStr) grpMonth += n;
      if (date >= weekStr)  grpWeek  += n;
    }

    fastingWaterStats = {
      my:    { week: myWeek,   month: myMonth,   allTime: myAllTime  },
      group: { week: grpWeek,  month: grpMonth,  allTime: grpAllTime },
    };
  }

  // Fetch group info if this is a group practice
  let group: { id: number; name: string; slug: string; emoji: string | null } | null = null;
  if (moment.groupId) {
    const [g] = await db.select().from(groupsTable).where(eq(groupsTable.id, moment.groupId));
    if (g) group = { id: g.id, name: g.name, slug: g.slug, emoji: g.emoji };
  }

  res.json({
    moment,
    group,
    members: allMembers.map(t => ({
      name: t.name,
      email: t.email,
      joined: registeredEmailsDetail.has(t.email.toLowerCase()),
      avatarUrl: avatarByEmail.get(t.email.toLowerCase()) ?? null,
    })),
    memberCount: allMembers.length,
    myUserToken: myTokenRow[0]?.userToken ?? null,
    myPersonalTime: myTokenRow[0]?.personalTime ?? null,
    myPersonalTimezone: myTokenRow[0]?.personalTimezone ?? null,
    myGoogleCalendarEventId: myTokenRow[0]?.googleCalendarEventId ?? null,
    windows: windowsWithPosts,
    seedPosts: seedPosts.map(p => ({
      guestName: p.guestName,
      photoUrl: p.photoUrl,
      reflectionText: p.reflectionText,
      isCheckin: p.isCheckin === 1,
    })),
    todayPostCount: todayPosts.length,
    windowOpen,
    minutesLeft: minsLeft,
    todayLogs,
    weekLogs,
    isCreator,
    canManage,
    myStreak,
    groupStreak,
    groupBest,
    computedSessionsLogged,
    calendarEventMissing,
    fastingWaterStats,
  });
});

// ─── POST /api/moments/:id/invite — add new participants ─────────────────────
const InviteMembersSchema = z.object({
  people: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
  })).min(1),
});

// ─── GET /api/moments/:id/groups — list groups an intercession is shared with
// Primary group (sharedMoments.groupId) + any rows in moment_groups.
router.get("/moments/:id/groups", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  const primary = moment.groupId
    ? (await db.select().from(groupsTable).where(eq(groupsTable.id, moment.groupId)))[0]
    : null;
  const extraLinks = await db.select().from(momentGroupsTable).where(eq(momentGroupsTable.momentId, momentId));
  const extraGroups = extraLinks.length > 0
    ? await db.select().from(groupsTable).where(inArray(groupsTable.id, extraLinks.map(l => l.groupId)))
    : [];

  res.json({
    primary: primary ? { id: primary.id, name: primary.name, slug: primary.slug, emoji: primary.emoji } : null,
    additional: extraGroups.map(g => ({ id: g.id, name: g.name, slug: g.slug, emoji: g.emoji })),
  });
});

// ─── POST /api/moments/:id/groups — attach an intercession to another group.
// Body: { groupId: number }. Caller must be the intercession's creator
// (their userToken row is the organizer) AND an admin of the target group.
// Adds every joined member of the target group as a participant (new
// moment_user_tokens rows for anyone not already a participant).
const attachGroupSchema = z.object({ groupId: z.number().int().positive() });
router.post("/moments/:id/groups", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = attachGroupSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  const targetGroupId = parsed.data.groupId;

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Permission has two parts:
  //   1. Caller must admin the TARGET community (so they're authorized
  //      to pull content onto their members' dashboards).
  //   2. Caller must also have authority over the MOMENT itself —
  //      either an organizer (their userToken row has organizer flag,
  //      or they own the primary group's admin role). Without this,
  //      any community admin who learned a moment id could fan a
  //      stranger's intercession into their members' feed and
  //      auto-subscribe them.
  const [targetMembership] = await db.select().from(groupMembersTable)
    .where(and(
      eq(groupMembersTable.groupId, targetGroupId),
      eq(groupMembersTable.userId, sessionUserId),
      sql`${groupMembersTable.joinedAt} IS NOT NULL`,
    ));
  if (!targetMembership || (targetMembership.role !== "admin" && targetMembership.role !== "hidden_admin")) {
    res.status(403).json({ error: "You must be an admin of that community" });
    return;
  }
  // The moment's creator is the member-token row with the smallest
  // id (same heuristic used at lines 2108-2111 and 2377). If that
  // row's email matches the caller, they're authorized on the moment.
  const [callerUser] = await db.select({ email: usersTable.email }).from(usersTable)
    .where(eq(usersTable.id, sessionUserId));
  let authorizedOnMoment = false;
  if (callerUser) {
    const allMomentMembers = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, momentId));
    const creatorToken = allMomentMembers.length > 0
      ? allMomentMembers.reduce((min, mt) => mt.id < min.id ? mt : min, allMomentMembers[0])
      : null;
    if (creatorToken && creatorToken.email.toLowerCase() === callerUser.email.toLowerCase()) {
      authorizedOnMoment = true;
    }
  }
  if (!authorizedOnMoment && moment.groupId) {
    const [primaryMembership] = await db.select().from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.groupId, moment.groupId),
        eq(groupMembersTable.userId, sessionUserId),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ));
    if (primaryMembership && (primaryMembership.role === "admin" || primaryMembership.role === "hidden_admin")) {
      authorizedOnMoment = true;
    }
  }
  if (!authorizedOnMoment) {
    res.status(403).json({ error: "You don't have permission to share this intercession" });
    return;
  }

  // No-op if target == primary or already linked.
  if (moment.groupId === targetGroupId) {
    res.json({ ok: true, alreadyLinked: true });
    return;
  }
  const [existing] = await db.select().from(momentGroupsTable)
    .where(and(eq(momentGroupsTable.momentId, momentId), eq(momentGroupsTable.groupId, targetGroupId)));
  if (existing) {
    res.json({ ok: true, alreadyLinked: true });
    return;
  }

  await db.insert(momentGroupsTable).values({ momentId, groupId: targetGroupId });

  // Add the new group's joined members as participants (skip anyone who
  // already has a moment_user_tokens row for this moment).
  const newMembers = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, targetGroupId), sql`${groupMembersTable.joinedAt} IS NOT NULL`));
  const existingTokens = await db.select({ email: momentUserTokensTable.email })
    .from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));
  const existingEmails = new Set(existingTokens.map(t => t.email.toLowerCase()));
  const toAdd = newMembers.filter(m => !existingEmails.has(m.email.toLowerCase()));
  if (toAdd.length > 0) {
    await db.insert(momentUserTokensTable).values(toAdd.map(m => ({
      momentId,
      email: m.email,
      name: m.name ?? m.email,
      userToken: generateToken(),
    })));
  }

  res.json({ ok: true, addedParticipants: toAdd.length });
});

// ─── DELETE /api/moments/:id/groups/:groupId — detach an intercession from
// a secondary group. Caller must admin the group being removed. We never
// delete the primary groupId via this endpoint — that would orphan the
// moment; the caller should archive the moment instead.
router.delete("/moments/:id/groups/:groupId", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  const targetGroupId = parseInt(req.params.groupId, 10);
  if (isNaN(momentId) || isNaN(targetGroupId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [myMembership] = await db.select().from(groupMembersTable)
    .where(and(eq(groupMembersTable.groupId, targetGroupId), eq(groupMembersTable.userId, sessionUserId)));
  if (!myMembership || (myMembership.role !== "admin" && myMembership.role !== "hidden_admin")) {
    res.status(403).json({ error: "You must be an admin of that community" });
    return;
  }

  await db.delete(momentGroupsTable)
    .where(and(eq(momentGroupsTable.momentId, momentId), eq(momentGroupsTable.groupId, targetGroupId)));

  res.json({ ok: true });
});

router.post("/moments/:id/invite", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = InviteMembersSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [myTokenRow] = await db.select().from(momentUserTokensTable)
    .where(and(eq(momentUserTokensTable.momentId, momentId), sql`LOWER(${momentUserTokensTable.email}) = LOWER(${user.email})`));
  if (!myTokenRow) { res.status(403).json({ error: "Forbidden" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  const existingMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));
  const existingEmails = new Set(existingMembers.map(m => m.email.toLowerCase()));

  // Creator = member with the smallest token id (same rule used elsewhere)
  const creatorToken = existingMembers.length > 0
    ? existingMembers.reduce((min, m) => m.id < min.id ? m : min, existingMembers[0])
    : null;
  const isCreator = creatorToken
    ? creatorToken.email.toLowerCase() === user.email.toLowerCase()
    : false;

  if (!isCreator && !moment.allowMemberInvites) {
    res.status(403).json({ error: "Only the creator can invite people to this practice" });
    return;
  }

  const newPeople = parsed.data.people.filter(p => !existingEmails.has(p.email.toLowerCase()));
  if (newPeople.length === 0) {
    res.json({ added: 0, message: "All people are already members" });
    return;
  }

  const newTokenRows = newPeople.map(p => ({
    momentId,
    email: p.email,
    name: p.name,
    userToken: generateToken(),
  }));

  const insertedNewTokens = await db.insert(momentUserTokensTable).values(newTokenRows).returning();

  // Calendar invites for the new members.
  //   - Creator inviting: add attendees to the organizer's group event.
  //   - Non-creator inviting: create a one-off calendar event per invitee
  //     from the inviter's own credentials, so the invitee sees the invite
  //     coming from the inviter (not the creator).
  try {
    if (isCreator) {
      // Find the organizer's token row (lowest ID) — they own the group event
      const organizerToken = creatorToken ?? existingMembers[0];
      const [organizer] = await db.select().from(usersTable)
        .where(eq(usersTable.email, organizerToken.email));

      if (organizer?.googleAccessToken) {
        const newEmails = insertedNewTokens.map(t => t.email);

        if (organizerToken.googleCalendarEventId) {
          await addAttendeesToCalendarEvent(organizer.id, organizerToken.googleCalendarEventId, newEmails)
            .catch(() => null);
          console.info(`Added ${newEmails.join(", ")} to GCal event ${organizerToken.googleCalendarEventId}`);
        } else {
          // No existing group event — create one now with all current members
          const allEmails = [...existingMembers.map(t => t.email), ...newEmails];
          const [hh, mm] = moment.scheduledTime.split(":").map(Number);
          const startDate = new Date();
          startDate.setHours(hh, mm, 0, 0);
          if (startDate < new Date()) startDate.setDate(startDate.getDate() + 1);
          const endDate = new Date(startDate.getTime() + practiceEventDurationMins(moment.templateType) * 60_000);
          const recurrenceRule = moment.frequency === "daily"
            ? ["RRULE:FREQ=DAILY"]
            : moment.frequency === "weekly"
            ? ["RRULE:FREQ=WEEKLY"]
            : ["RRULE:FREQ=MONTHLY"];

          const eventId = await createCalendarEvent(organizer.id, {
            summary: `🌿 ${moment.name}`,
            description: [
              `${moment.name} practice on Phoebe.`,
              ...(moment.intention ? [`"${moment.intention}"`] : []),
              "",
              `Open Phoebe → ${getInviteBaseUrl()}/moments/${momentId}`,
            ].join("\n"),
            startDate,
            endDate,
            attendees: allEmails,
            recurrence: recurrenceRule,
          }).catch(() => null);

          if (eventId) {
            await db.update(momentUserTokensTable)
              .set({ googleCalendarEventId: eventId })
              .where(eq(momentUserTokensTable.id, organizerToken.id));
            console.info(`Created new group GCal event ${eventId} for moment ${momentId}`);
          }
        }
      }
    } else if (user.googleAccessToken) {
      // Non-creator inviting — one new per-member event per invitee, owned
      // by the inviter so the calendar invite is attributed to them.
      const inviterFirst = (user.name ?? "").trim().split(/\s+/)[0] || user.name || "A friend";
      const [hh, mm] = moment.scheduledTime.split(":").map(Number);
      const startDate = new Date();
      startDate.setHours(hh, mm, 0, 0);
      if (startDate < new Date()) startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date(startDate.getTime() + practiceEventDurationMins(moment.templateType) * 60_000);
      const recurrenceRule = moment.frequency === "daily"
        ? ["RRULE:FREQ=DAILY"]
        : moment.frequency === "weekly"
        ? ["RRULE:FREQ=WEEKLY"]
        : ["RRULE:FREQ=MONTHLY"];

      for (const t of insertedNewTokens) {
        const shortLink = `${getInviteBaseUrl()}/m/${t.userToken}`;
        const description = [
          `${inviterFirst} invited you to practice together.`,
          `Open in Phoebe → ${shortLink}`,
          "",
          ...(moment.intention ? [`"${moment.intention}"`, ""] : []),
        ].join("\n");

        const eventId = await createCalendarEvent(sessionUserId, {
          summary: `🌱 ${moment.name} with ${inviterFirst}`,
          description,
          startDate,
          endDate,
          attendees: [t.email],
          recurrence: recurrenceRule,
          colorId: "2",
          reminders: [
            { method: "popup", minutes: 5 },
          ],
        }).catch(() => null);

        if (eventId) {
          await db.update(momentUserTokensTable)
            .set({ googleCalendarEventId: eventId })
            .where(eq(momentUserTokensTable.id, t.id));
        }
      }
    }
  } catch (calErr) {
    console.error("Invite calendar event update failed (non-fatal):", calErr);
  }

  // Save connections to cache so they persist even if this practice is later deleted
  try {
    const updatedMembers = await db.select({ email: momentUserTokensTable.email, name: momentUserTokensTable.name })
      .from(momentUserTokensTable).where(eq(momentUserTokensTable.momentId, momentId));
    await saveConnectionCache(updatedMembers.map(m => ({ email: m.email, name: m.name ?? null })));
  } catch { /* non-fatal */ }

  res.json({ added: newPeople.length, people: newPeople });
});

// ─── DELETE /api/moments/:id/members/:email — creator removes a member ────────
router.delete("/moments/:id/members/:email", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const emailToRemove = decodeURIComponent(req.params.email).toLowerCase();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Verify caller is the creator (lowest token ID)
  const allMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));
  if (allMembers.length === 0) { res.status(404).json({ error: "Practice not found" }); return; }

  const creatorToken = allMembers.reduce((min, m) => m.id < min.id ? m : min, allMembers[0]);
  if (creatorToken.email.toLowerCase() !== user.email.toLowerCase()) {
    res.status(403).json({ error: "Only the creator can remove members" });
    return;
  }

  // Can't remove yourself (use delete practice instead)
  if (emailToRemove === user.email.toLowerCase()) {
    res.status(400).json({ error: "Cannot remove yourself. Delete the practice instead." });
    return;
  }

  const memberToRemove = allMembers.find(m => m.email.toLowerCase() === emailToRemove);
  if (!memberToRemove) {
    res.status(404).json({ error: "Member not found in this practice" });
    return;
  }

  // Remove from calendar event
  try {
    if (creatorToken.googleCalendarEventId) {
      const [organizer] = await db.select().from(usersTable)
        .where(eq(usersTable.email, creatorToken.email));
      if (organizer?.googleAccessToken) {
        await removeAttendeesFromCalendarEvent(organizer.id, creatorToken.googleCalendarEventId, [emailToRemove]);
      }
    }
  } catch { /* non-fatal */ }

  // Delete their token row
  await db.delete(momentUserTokensTable)
    .where(and(
      eq(momentUserTokensTable.momentId, momentId),
      eq(momentUserTokensTable.email, memberToRemove.email),
    ));

  res.json({ success: true, removed: emailToRemove });
});

// ─── POST /api/moments/:id/seed-post — creator plants an example post ────────
const SeedPostSchema = z.object({
  photoUrl: z.string().url().optional(),
  reflectionText: z.string().max(500).optional(),
});

router.post("/moments/:id/seed-post", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = SeedPostSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Must be a participant
  const [myTokenRow] = await db.select().from(momentUserTokensTable)
    .where(and(eq(momentUserTokensTable.momentId, momentId), sql`LOWER(${momentUserTokensTable.email}) = LOWER(${user.email})`));
  if (!myTokenRow) { res.status(403).json({ error: "Forbidden" }); return; }

  const { photoUrl, reflectionText } = parsed.data;

  // Upsert seed post (one per user)
  const existing = await db.select().from(momentPostsTable)
    .where(and(
      eq(momentPostsTable.momentId, momentId),
      eq(momentPostsTable.windowDate, "seed"),
      eq(momentPostsTable.userToken, myTokenRow.userToken),
    ));

  if (existing.length > 0) {
    await db.update(momentPostsTable)
      .set({ photoUrl: photoUrl ?? null, reflectionText: reflectionText ?? null })
      .where(eq(momentPostsTable.id, existing[0].id));
  } else {
    await db.insert(momentPostsTable).values({
      momentId,
      windowDate: "seed",
      userToken: myTokenRow.userToken,
      guestName: myTokenRow.name ?? user.email,
      photoUrl: photoUrl ?? null,
      reflectionText: reflectionText ?? null,
      isCheckin: 0,
    });
  }

  res.status(201).json({ success: true });
});

// ─── GET /api/rituals/:id/moments — list moments for a circle ───────────────
router.get("/rituals/:id/moments", async (req, res): Promise<void> => {
  const ritualId = parseInt(req.params.id, 10);
  if (isNaN(ritualId)) { res.status(400).json({ error: "Invalid ritual id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, ritualId));
  if (!ritual || ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const moments = await db.select().from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.ritualId, ritualId));

  // For each moment, get the latest window
  const enriched = await Promise.all(moments.map(async (m) => {
    const windows = await db.select().from(momentWindowsTable)
      .where(eq(momentWindowsTable.momentId, m.id));
    const sortedWindows = windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate));
    const latestWindow = sortedWindows[0] ?? null;

    const todayPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, m.id), eq(momentPostsTable.windowDate, todayDateInTz(m.timezone || "UTC"))));

    return {
      ...m,
      latestWindow,
      todayPostCount: todayPosts.length,
      windowOpen: computeWindowOpen(m),
    };
  }));

  res.json({ moments: enriched });
});

// ─── GET /api/m/:userToken — resolve short link to momentToken/userToken ─────
router.get("/m/:userToken", async (req, res): Promise<void> => {
  const { userToken } = req.params;
  const [tokenRow] = await db.select({ momentId: momentUserTokensTable.momentId, userToken: momentUserTokensTable.userToken })
    .from(momentUserTokensTable).where(eq(momentUserTokensTable.userToken, userToken));
  if (!tokenRow) { res.status(404).json({ error: "Not found" }); return; }
  const [moment] = await db.select({ momentToken: sharedMomentsTable.momentToken, templateType: sharedMomentsTable.templateType })
    .from(sharedMomentsTable).where(eq(sharedMomentsTable.id, tokenRow.momentId));
  if (!moment) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ momentToken: moment.momentToken, userToken: tokenRow.userToken, templateType: moment.templateType });
});

// ─── GET /api/moment/:momentToken/:userToken — public posting page ───────────
router.get("/moment/:momentToken/:userToken", async (req, res): Promise<void> => {
  const { momentToken, userToken } = req.params;

  const [moment] = await db.select().from(sharedMomentsTable)
    .where(eq(sharedMomentsTable.momentToken, momentToken));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Group-linked practices reflect the group roster — reconcile so members
  // added to the group since last read are visible here, and removed members
  // can no longer hit this URL.
  await reconcileGroupPracticeMembers(moment.id);

  const [userTokenRow] = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.userToken, userToken));
  if (!userTokenRow || userTokenRow.momentId !== moment.id) {
    res.status(404).json({ error: "Invalid token" });
    return;
  }

  const ritual = moment.ritualId
    ? (await db.select().from(ritualsTable).where(eq(ritualsTable.id, moment.ritualId)))[0] ?? null
    : null;
  const windowDate = todayDateInTz(moment.timezone || "UTC");

  const allTodayPosts = await db.select().from(momentPostsTable)
    .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.windowDate, windowDate)));

  const myPost = allTodayPosts.find(p => p.userToken === userToken) ?? null;

  const allMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, moment.id));

  // Intercession uses a time-of-day band instead of raw window minutes
  const windowOpen = moment.templateType === "intercession"
    ? isPracticeDayInTz(moment) && isIntercessionWindowOpen(moment.timeOfDay, moment.timezone || "UTC")
    : computeWindowOpen(moment);
  const minsLeft = minutesRemaining(moment);

  // Fetch avatarUrl for all members
  const publicMemberEmails = allMembers.map(m => m.email.toLowerCase());
  const publicAvatarRows = publicMemberEmails.length > 0
    ? await db.select({ email: usersTable.email, avatarUrl: usersTable.avatarUrl })
        .from(usersTable)
        .where(inArray(usersTable.email, publicMemberEmails))
    : [];
  const publicAvatarByEmail = new Map(publicAvatarRows.map(u => [u.email.toLowerCase(), u.avatarUrl]));

  // Build member presence: who has prayed today
  const prayedTokens = new Set(allTodayPosts.map(p => p.userToken));
  const memberPresence = allMembers.map(m => ({
    name: m.name ?? m.email.split("@")[0],
    userToken: m.userToken,
    prayed: prayedTokens.has(m.userToken),
    avatarUrl: publicAvatarByEmail.get(m.email.toLowerCase()) ?? null,
  }));

  // Determine inviter — member with the lowest token row ID is the organizer/creator
  const organizerToken = allMembers.length > 0
    ? allMembers.reduce((min, m) => m.id < min.id ? m : min, allMembers[0])
    : null;
  const inviterName = organizerToken?.name ?? organizerToken?.email?.split("@")[0] ?? "Phoebe";

  // Group info — lets the client render "with <group name>" attribution to match
  // the prayer slideshow when the practice is attached to a group.
  let group: { id: number; name: string; slug: string; emoji: string | null } | null = null;
  if (moment.groupId) {
    const [g] = await db.select().from(groupsTable).where(eq(groupsTable.id, moment.groupId));
    if (g) group = { id: g.id, name: g.name, slug: g.slug, emoji: g.emoji };
  }

  res.json({
    group,
    moment: {
      id: moment.id,
      name: moment.name,
      intention: moment.intention,
      loggingType: moment.loggingType,
      reflectionPrompt: moment.reflectionPrompt,
      templateType: moment.templateType,
      intercessionFullText: moment.intercessionFullText,
      intercessionTopic: moment.intercessionTopic,
      intercessionSource: moment.intercessionSource,
      currentStreak: moment.currentStreak,
      longestStreak: moment.longestStreak,
      state: moment.state,
      frequency: moment.frequency,
      dayOfWeek: moment.dayOfWeek,
      practiceDays: moment.practiceDays ?? null,
      timeOfDay: moment.timeOfDay,
      contemplativeDurationMinutes: moment.contemplativeDurationMinutes ?? null,
      fastingType: (moment as Record<string, unknown>).fastingType ?? null,
      fastingFrom: moment.fastingFrom ?? null,
      fastingIntention: moment.fastingIntention ?? null,
      fastingFrequency: moment.fastingFrequency ?? null,
      fastingDate: moment.fastingDate ?? null,
      fastingDay: moment.fastingDay ?? null,
      fastingDayOfMonth: moment.fastingDayOfMonth ?? null,
    },
    ritualName: ritual?.name ?? "",
    inviterName,
    windowDate,
    windowOpen,
    minutesRemaining: minsLeft,
    memberCount: allMembers.length,
    todayPostCount: allTodayPosts.length,
    members: memberPresence,
    myPost: myPost
      ? {
          photoUrl: myPost.photoUrl,
          reflectionText: myPost.reflectionText,
          isCheckin: myPost.isCheckin === 1,
        }
      : null,
    userName: userTokenRow.name ?? userTokenRow.email,
  });
});

// ─── POST /api/moment/:momentToken/:userToken/post — submit a post ───────────
const PostSchema = z.object({
  photoUrl: z.string().optional(),
  reflectionText: z.string().max(280).optional(),
  isCheckin: z.boolean().default(false),
});

router.post("/moment/:momentToken/:userToken/post", async (req, res): Promise<void> => {
  const { momentToken, userToken } = req.params;

  const parsed = PostSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  try {
    const [moment] = await db.select().from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.momentToken, momentToken));
    if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

    const [userTokenRow] = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.userToken, userToken));
    if (!userTokenRow || userTokenRow.momentId !== moment.id) {
      res.status(404).json({ error: "Invalid token" });
      return;
    }

    const windowDate = todayDateInTz(moment.timezone || "UTC");

    // Check for existing post today from this user
    const existingPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.windowDate, windowDate)));
    const myExisting = existingPosts.find(p => p.userToken === userToken);

    const guestName = userTokenRow.name ?? userTokenRow.email;
    const { photoUrl, reflectionText, isCheckin } = parsed.data;

    if (myExisting) {
      await db.update(momentPostsTable)
        .set({
          photoUrl: photoUrl ?? null,
          reflectionText: reflectionText ?? null,
          isCheckin: isCheckin ? 1 : 0,
        })
        .where(eq(momentPostsTable.id, myExisting.id));
    } else {
      await db.insert(momentPostsTable).values({
        momentId: moment.id,
        windowDate,
        userToken,
        guestName,
        photoUrl: photoUrl ?? null,
        reflectionText: reflectionText ?? null,
        isCheckin: isCheckin ? 1 : 0,
      });
    }

    // Recount posts to get fresh total
    const allTodayPosts = await db.select().from(momentPostsTable)
      .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.windowDate, windowDate)));

    const allMembers = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, moment.id));
    const memberCount = allMembers.length;

    res.status(201).json({
      success: true,
      todayPostCount: allTodayPosts.length,
      memberCount,
    });

    // Broadcast log notification to connected clients (only for new posts, not updates)
    if (!myExisting) {
      const latestPost = await db.select().from(momentPostsTable)
        .where(and(eq(momentPostsTable.momentId, moment.id), eq(momentPostsTable.userToken, userToken)))
        .limit(1);
      broadcastLog({
        momentId: moment.id,
        postId: latestPost[0]?.id ?? 0,
        momentName: moment.name,
        templateType: moment.templateType,
        guestName,
        userEmail: userTokenRow.email,
      });
    }

    // Evaluate window: either the window has closed, OR 50% of group has logged (bloom condition met)
    const windowIsStillOpen = isWindowOpen(moment);
    const bloomThreshold50 = Math.max(2, Math.ceil(memberCount / 2));
    const halfLogged = allTodayPosts.length >= bloomThreshold50 && memberCount >= 2;
    if (!windowIsStillOpen || halfLogged) {
      evaluateWindow(moment.id, windowDate).catch(err =>
        console.warn("Window evaluation failed:", err?.message ?? err)
      );
    }

  } catch (err) {
    console.error("POST /moment/:momentToken/:userToken/post error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/moment/:momentToken/amen — auto-enrolling amen ────────────────
//
// Counterpart to /moment/:momentToken/:userToken/post for the case where
// the client doesn't have a per-moment userToken yet. The reconcile job
// (reconcileFeedPracticeMembers) is supposed to keep every Phoebe Climate
// subscriber enrolled in every active climate intercession, but races
// (subscription created between intercession-create and the next /api/moments
// fetch, or a transient reconcile error) can leave a subscriber's
// myUserToken null on the slide. With the userToken-required endpoint
// that meant their amen tap silently dropped on the floor.
//
// This endpoint:
//   1. Authenticates via the session (no token-in-URL)
//   2. Finds-or-creates a moment_user_tokens row for (moment, user.email)
//   3. Upserts today's moment_post with isCheckin=1
//
// Result: every authenticated tap counts, exactly once per (moment, user, day).
const AmenSchema = z.object({
  reflectionText: z.string().max(280).optional(),
  photoUrl: z.string().optional(),
});

// Amen tap is the most-fired user mutation in the app, but it's also
// the easiest to spam — one tap = one POST. The push side already
// dedups via the 2-hour coalescing scanner, but we still want to
// protect the DB write path. 300/hour per user is generous (an
// "amen storm" through 20 intercessions in 5 minutes is well under)
// but it caps replay attacks / runaway clients.
router.post("/moment/:momentToken/amen", perUserRateLimit("moment_amen", {
  max: 300, windowMs: 60 * 60 * 1000,
  message: "You've sent a lot of amens. Slow down — take a breath.",
}), async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = AmenSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  try {
    const [moment] = await db.select().from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.momentToken, String(req.params.momentToken)));
    if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

    const [sessionUser] = await db.select().from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }
    const email = sessionUser.email.toLowerCase();
    const name = sessionUser.name ?? sessionUser.email;

    // Find or mint a per-moment token for this user.
    let [tokenRow] = await db.select().from(momentUserTokensTable).where(and(
      eq(momentUserTokensTable.momentId, moment.id),
      eq(momentUserTokensTable.email, email),
    ));
    if (!tokenRow) {
      const [inserted] = await db.insert(momentUserTokensTable).values({
        momentId: moment.id,
        email,
        name,
        userToken: generateToken(),
      }).returning();
      tokenRow = inserted;
    }

    const windowDate = todayDateInTz(moment.timezone || "UTC");
    // Upsert today's post by (moment, userToken, windowDate). Re-tapping
    // amen on the same intercession the same day is idempotent.
    const [existing] = await db.select().from(momentPostsTable).where(and(
      eq(momentPostsTable.momentId, moment.id),
      eq(momentPostsTable.windowDate, windowDate),
      eq(momentPostsTable.userToken, tokenRow.userToken),
    ));
    if (existing) {
      await db.update(momentPostsTable).set({
        isCheckin: 1,
        photoUrl: parsed.data.photoUrl ?? existing.photoUrl,
        reflectionText: parsed.data.reflectionText ?? existing.reflectionText,
      }).where(eq(momentPostsTable.id, existing.id));
    } else {
      await db.insert(momentPostsTable).values({
        momentId: moment.id,
        windowDate,
        userToken: tokenRow.userToken,
        guestName: name,
        photoUrl: parsed.data.photoUrl ?? null,
        reflectionText: parsed.data.reflectionText ?? null,
        isCheckin: 1,
      });
    }

    const allTodayPosts = await db.select().from(momentPostsTable).where(and(
      eq(momentPostsTable.momentId, moment.id),
      eq(momentPostsTable.windowDate, windowDate),
    ));

    res.status(201).json({
      success: true,
      todayPostCount: allTodayPosts.length,
      myUserToken: tokenRow.userToken,
    });
  } catch (err) {
    console.error("POST /moment/:momentToken/amen error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/moments/:id/fasting-stats — water savings & participation ──────
router.get("/moments/:id/fasting-stats", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (!moment || moment.templateType !== "fasting") { res.status(404).json({ error: "Not found" }); return; }

    const GALLONS_PER_FAST = 400;
    const isMeat = (moment as Record<string, unknown>).fastingType === "meat";

    // All posts (check-ins) for this practice
    const allPosts = await db.select().from(momentPostsTable)
      .where(eq(momentPostsTable.momentId, momentId));
    const allMembers = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, momentId));

    // My user token
    const sessionUser = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    const myEmail = sessionUser[0]?.email?.toLowerCase() ?? "";
    const myToken = allMembers.find(t => (t.email || "").toLowerCase() === myEmail);

    // Group by windowDate
    const byDate = new Map<string, { userTokens: Set<string>; posts: typeof allPosts }>();
    for (const p of allPosts) {
      if (!byDate.has(p.windowDate)) byDate.set(p.windowDate, { userTokens: new Set(), posts: [] });
      const entry = byDate.get(p.windowDate)!;
      entry.userTokens.add(p.userToken);
      entry.posts.push(p);
    }

    // Calculate date ranges
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    const weekStr = startOfWeek.toISOString().split("T")[0];
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    let weekFasts = 0;
    let monthFasts = 0;
    let allTimeFasts = 0;
    let myAllTimeFasts = 0;

    const history: Array<{
      date: string;
      participantCount: number;
      memberCount: number;
      gallonsSaved: number;
      gratitudeNotes: Array<{ name: string; text: string }>;
    }> = [];

    for (const [date, entry] of byDate.entries()) {
      const count = entry.userTokens.size;
      allTimeFasts += count;
      if (date >= weekStr) weekFasts += count;
      if (date.startsWith(monthStr)) monthFasts += count;
      if (myToken && entry.userTokens.has(myToken.userToken)) myAllTimeFasts++;

      // Gratitude notes (reflectionText on fasting check-ins)
      const notes: Array<{ name: string; text: string }> = [];
      for (const p of entry.posts) {
        if (p.reflectionText?.trim()) {
          const member = allMembers.find(m => m.userToken === p.userToken);
          notes.push({
            name: member?.name || p.guestName || "Someone",
            text: p.reflectionText.trim(),
          });
        }
      }

      history.push({
        date,
        participantCount: count,
        memberCount: allMembers.length,
        gallonsSaved: isMeat ? count * GALLONS_PER_FAST : 0,
        gratitudeNotes: notes,
      });
    }

    // Sort history most recent first
    history.sort((a, b) => b.date.localeCompare(a.date));

    res.json({
      fastingType: (moment as Record<string, unknown>).fastingType ?? "custom",
      isMeat,
      memberCount: allMembers.length,
      createdAt: moment.createdAt,
      week: { fasts: weekFasts, gallons: isMeat ? weekFasts * GALLONS_PER_FAST : 0 },
      month: { fasts: monthFasts, gallons: isMeat ? monthFasts * GALLONS_PER_FAST : 0 },
      allTime: { fasts: allTimeFasts, gallons: isMeat ? allTimeFasts * GALLONS_PER_FAST : 0 },
      my: { fasts: myAllTimeFasts, gallons: isMeat ? myAllTimeFasts * GALLONS_PER_FAST : 0 },
      history,
    });
  } catch (err) {
    console.error("GET /moments/:id/fasting-stats error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/rituals/:id/moments/:momentId/journal — window history ─────────
router.get("/rituals/:id/moments/:momentId/journal", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.momentId, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Not found" }); return; }

  if (!moment.ritualId) { res.status(403).json({ error: "Forbidden" }); return; }
  const [ritual] = await db.select().from(ritualsTable).where(eq(ritualsTable.id, moment.ritualId));
  if (!ritual || ritual.ownerId !== sessionUserId) { res.status(403).json({ error: "Forbidden" }); return; }

  const windows = await db.select().from(momentWindowsTable)
    .where(eq(momentWindowsTable.momentId, momentId));

  const enriched = await Promise.all(
    windows.sort((a, b) => b.windowDate.localeCompare(a.windowDate)).map(async (w) => {
      const posts = await db.select().from(momentPostsTable)
        .where(and(eq(momentPostsTable.momentId, momentId), eq(momentPostsTable.windowDate, w.windowDate)));
      return { ...w, posts };
    })
  );

  res.json({ windows: enriched, moment });
});

// ─── Rolling calendar event helper ──────────────────────────────────────────

function nextOccurrences(personalTime: string, personalTimezone: string, frequency: string, dayOfWeek: string | null, count: number): Date[] {
  const [hh, mm] = personalTime.split(":").map(Number);
  const results: Date[] = [];
  const now = new Date();
  const dateWeekdayMap: Record<string, string> = { Su: "SU", Mo: "MO", Tu: "TU", We: "WE", Th: "TH", Fr: "FR", Sa: "SA" };

  let candidate = new Date();
  candidate.setUTCHours(0, 0, 0, 0);

  for (let day = 0; results.length < count && day < 730; day++) {
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: personalTimezone }).format(candidate);

    let included = false;
    if (frequency === "daily") {
      included = true;
    } else if (frequency === "weekly") {
      const wdCode = dateWeekdayMap[new Intl.DateTimeFormat("en-US", { timeZone: personalTimezone, weekday: "short" }).format(candidate).slice(0, 2)] ?? "";
      included = dayOfWeek ? wdCode === dayOfWeek : true;
    }

    if (included) {
      const tzOffsetMs = getTimezoneOffsetMs(personalTimezone, new Date(`${localDate}T00:00:00`));
      // Convert local time to UTC: local + offset = UTC (offset is positive for zones behind UTC)
      const eventUtc = new Date(`${localDate}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`);
      eventUtc.setTime(eventUtc.getTime() + tzOffsetMs);
      if (eventUtc > now) results.push(eventUtc);
    }

    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  return results;
}

function getTimezoneOffsetMs(timezone: string, date: Date): number {
  try {
    const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
    return utcDate.getTime() - tzDate.getTime();
  } catch {
    return 0;
  }
}

// ─── POST /api/moments/:id/personal-time — set organizer personal time ────────
const PersonalTimeSchema = z.object({
  personalTime: z.string().regex(/^\d{2}:\d{2}$/),
  personalTimezone: z.string(),
});

router.post("/moments/:id/personal-time", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = PersonalTimeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
    if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

    const { personalTime, personalTimezone } = parsed.data;

    // Verify the user is a member (case-insensitive email compare so
    // a casing mismatch between users.email and the token row doesn't
    // 403 a legit member).
    const allMembers = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, momentId));
    const userEmailLc = user.email.toLowerCase();
    const myTokenRow = allMembers.find(t => t.email.toLowerCase() === userEmailLc);
    if (!myTokenRow) { res.status(403).json({ error: "Not a member" }); return; }

    // Despite the "personal-time" name, this endpoint mutates the
    // PRACTICE-WIDE scheduledTime + timezone and rebuilds the group
    // calendar event for every member (lines 3545-3585 below). So we
    // gate it on the creator only — any joined member used to be able
    // to rewrite the schedule for the whole practice. Creator =
    // smallest-id token row (same heuristic used elsewhere).
    const creatorToken = allMembers.reduce(
      (min, mt) => mt.id < min.id ? mt : min,
      allMembers[0],
    );
    const isCreator = creatorToken?.email.toLowerCase() === userEmailLc;
    if (!isCreator) {
      res.status(403).json({ error: "Only the practice creator can change the time" });
      return;
    }

    // Update the practice's shared scheduled time (applies to everyone)
    await db.update(sharedMomentsTable)
      .set({ scheduledTime: personalTime, timezone: personalTimezone })
      .where(eq(sharedMomentsTable.id, momentId));

    // Build calendar event parameters
    const [hh2, mm2] = personalTime.split(":").map(Number);
    const { startLocalStr, endLocalStr } = buildLocalEventTimes(hh2, mm2, personalTimezone, practiceEventDurationMins(moment.templateType));

    const recurrence: string[] = [];
    if (moment.frequency === "daily") {
      recurrence.push("RRULE:FREQ=DAILY");
    } else if (moment.frequency === "weekly" && moment.dayOfWeek) {
      recurrence.push(`RRULE:FREQ=WEEKLY;BYDAY=${moment.dayOfWeek}`);
    } else if (moment.frequency === "weekly") {
      recurrence.push("RRULE:FREQ=WEEKLY");
    }

    // Delete ALL old calendar events for every member
    for (const member of allMembers) {
      if (member.googleCalendarEventId) {
        try {
          await deleteCalendarEvent(sessionUserId, member.googleCalendarEventId);
        } catch { /* best effort */ }
        await db.update(momentUserTokensTable)
          .set({ googleCalendarEventId: null, calendarConnected: false })
          .where(eq(momentUserTokensTable.id, member.id));
      }
    }

    // Create ONE new group calendar event on the organizer's calendar with all members
    try {
      const attendeeEmails = allMembers.map(m => m.email); // All members get invites from scheduler

      const newId = await createCalendarEvent(sessionUserId, {
        summary: `🔔 ${moment.name}`,
        description: [
          `${moment.name} practice on Phoebe.`,
          ...(moment.intention ? [`"${moment.intention}"`] : []),
          "",
          `${allMembers.length} ${allMembers.length === 1 ? "person" : "people"} practicing together.`,
          "",
          `Open Phoebe → ${getInviteBaseUrl()}/moments/${momentId}`,
        ].join("\n"),
        startDate: new Date(),
        startLocalStr,
        endLocalStr,
        timeZone: personalTimezone,
        attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
        recurrence: recurrence.length > 0 ? recurrence : undefined,
      });

      if (newId) {
        // Store the event ID on the organizer's token row
        await db.update(momentUserTokensTable)
          .set({ googleCalendarEventId: newId, calendarConnected: true })
          .where(eq(momentUserTokensTable.id, myTokenRow.id));
        console.info(`Bell: created group GCal event ${newId} for moment ${momentId} at ${startLocalStr} ${personalTimezone}`);
      }
    } catch (gcalErr) {
      console.error("Bell GCal sync error:", gcalErr);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /moments/:id/personal-time error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── GET /api/moments/:momentToken/info — public practice info ──────────────
router.get("/moments/:momentToken/info", async (req, res): Promise<void> => {
  const { momentToken } = req.params;

  try {
    const [moment] = await db.select().from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.momentToken, momentToken));
    if (!moment) { res.status(404).json({ error: "Not found" }); return; }

    const members = await db.select().from(momentUserTokensTable)
      .where(eq(momentUserTokensTable.momentId, moment.id));

    res.json({
      id: moment.id,
      name: moment.name,
      intention: moment.intention,
      templateType: moment.templateType,
      timeOfDay: moment.timeOfDay,
      frequency: moment.frequency,
      dayOfWeek: moment.dayOfWeek,
      practiceDays: moment.practiceDays,
      goalDays: moment.goalDays,
      loggingType: moment.loggingType,
      intercessionTopic: moment.intercessionTopic,
      memberCount: members.length,
    });
  } catch (err) {
    console.error("GET /moments/:momentToken/info error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/moments/:momentToken/join — join a practice ──────────────────
const JoinSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  personalTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  personalTimezone: z.string().optional(),
});

router.post("/moments/:momentToken/join", async (req, res): Promise<void> => {
  const { momentToken } = req.params;

  const parsed = JoinSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: String(parsed.error) }); return; }

  try {
    const [moment] = await db.select().from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.momentToken, momentToken));
    if (!moment) { res.status(404).json({ error: "Practice not found" }); return; }

    const { name, email, personalTime, personalTimezone } = parsed.data;

    // Case-insensitive email lookup so an existing token with a
    // differently-cased email (e.g. mixed-case from an old invite)
    // gets reused instead of producing a duplicate row.
    const existing = await db.select().from(momentUserTokensTable)
      .where(and(
        eq(momentUserTokensTable.momentId, moment.id),
        sql`LOWER(${momentUserTokensTable.email}) = LOWER(${email})`,
      ));

    let tokenRow;
    if (existing.length > 0) {
      tokenRow = existing[0];
      if (personalTime) {
        await db.update(momentUserTokensTable)
          .set({ personalTime, personalTimezone: personalTimezone ?? null, name })
          .where(eq(momentUserTokensTable.id, tokenRow.id));
        tokenRow = { ...tokenRow, personalTime, personalTimezone: personalTimezone ?? null };
      }
    } else {
      const userToken = generateToken();
      const [inserted] = await db.insert(momentUserTokensTable).values({
        momentId: moment.id,
        email,
        name,
        userToken,
        personalTime: personalTime ?? null,
        personalTimezone: personalTimezone ?? null,
      }).returning();
      tokenRow = inserted;
    }

    // Create 2 rolling calendar events if personalTime provided
    if (personalTime && personalTimezone) {
      const existingEvents = await db.select().from(momentCalendarEventsTable)
        .where(and(
          eq(momentCalendarEventsTable.sharedMomentId, moment.id),
          eq(momentCalendarEventsTable.momentMemberId, tokenRow.id),
        ));
      if (existingEvents.length === 0) {
        const occurrences = nextOccurrences(personalTime, personalTimezone, moment.frequency, moment.dayOfWeek ?? null, 2);
        for (let i = 0; i < occurrences.length; i++) {
          await db.insert(momentCalendarEventsTable).values({
            sharedMomentId: moment.id,
            momentMemberId: tokenRow.id,
            scheduledFor: occurrences[i],
            isFirstEvent: i === 0,
          });
        }
      }

      // Create a Google Calendar event on the joining member's own calendar (if logged in)
      const joinSessionUserId = req.user ? (req.user as { id: number }).id : null;
      if (joinSessionUserId && !tokenRow.googleCalendarEventId) {
        try {
          const [hh, mm] = personalTime.split(":").map(Number);
          const { startLocalStr, endLocalStr } = buildLocalEventTimes(hh, mm, personalTimezone, practiceEventDurationMins(moment.templateType));

          const recurrence: string[] = [];
          if (moment.frequency === "daily") recurrence.push("RRULE:FREQ=DAILY");
          else if (moment.frequency === "weekly" && moment.dayOfWeek) recurrence.push(`RRULE:FREQ=WEEKLY;BYDAY=${moment.dayOfWeek}`);
          else if (moment.frequency === "weekly") recurrence.push("RRULE:FREQ=WEEKLY");

          const joinShortLink = `${getInviteBaseUrl()}/m/${tokenRow.userToken}`;
          const calEventId = await createCalendarEvent(joinSessionUserId, {
            summary: `🔔 ${moment.name}`,
            description: [
              `Your ${moment.name} practice on Phoebe.`,
              ...(moment.intention ? [`"${moment.intention}"`] : []),
              "",
              "Tap to log:",
              joinShortLink,
            ].join("\n"),
            startDate: new Date(),
            startLocalStr,
            endLocalStr,
            timeZone: personalTimezone,
            recurrence: recurrence.length > 0 ? recurrence : undefined,
          });

          if (calEventId) {
            await db.update(momentUserTokensTable)
              .set({ googleCalendarEventId: calEventId, calendarConnected: true })
              .where(eq(momentUserTokensTable.id, tokenRow.id));
            console.info(`Join GCal event ${calEventId} created for ${email} on moment ${moment.id}`);
          }
        } catch (gcalErr) {
          console.error("Join GCal event creation failed (non-fatal):", gcalErr);
        }
      }
    }

    const baseUrl = `${getInviteBaseUrl()}/moment`;

    res.status(201).json({
      userToken: tokenRow.userToken,
      personalLink: `${baseUrl}/${momentToken}/${tokenRow.userToken}`,
      momentName: moment.name,
    });
  } catch (err) {
    console.error("POST /moments/:momentToken/join error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── PATCH /api/moments/:id — edit a practice ────────────────────────────────
const EditMomentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  intention: z.string().max(500).optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  dayOfWeek: z.enum(["MO","TU","WE","TH","FR","SA","SU"]).nullable().optional(),
  practiceDays: z.string().optional(),
  goalDays: z.number().int().min(0).max(365).optional(),
  commitmentSessionsGoal: z.number().int().min(0).max(365).nullable().optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  intercessionTopic: z.string().max(300).nullable().optional(),
  // The pill type ("custom" → 🙏🏽 Prayer, "action" → 🌍 Action, "bcp"
  // → BCP collect) and the body text behind the topic. Were missing
  // from this schema, which meant community-intercession admins
  // couldn't fix a typo in the prayer body OR retype an Action to a
  // Prayer through the standard PATCH — only the topic line. Added
  // here so the same fields the feed-side PATCH supports also work
  // through this endpoint.
  intercessionSource: z.enum(["bcp", "custom", "action"]).optional(),
  intercessionFullText: z.string().max(4000).nullable().optional(),
  contemplativeDurationMinutes: z.number().int().min(1).max(60).nullable().optional(),
  allowMemberInvites: z.boolean().optional(),
  customEmoji: z.string().max(10).nullable().optional(),
  // Learn-more / take-action link + the editable title of the linked
  // article. Lets a feed admin override the auto-fetched
  // learnMoreTitle (or set one when the fetch found nothing).
  learnMoreUrl: z.string().trim().max(2000).nullable().optional(),
  learnMoreTitle: z.string().trim().max(200).nullable().optional(),
});

router.patch("/moments/:id", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Creator OR admin of the primary group can edit. For a community
  // intercession scheduled inside a parish, every admin of that parish
  // can adjust the prayer or its schedule — not only the person who
  // happened to tap "create."
  const canManage = await canManageMoment({
    userId: sessionUserId,
    userEmail: user.email,
    momentId,
    primaryGroupId: moment.groupId,
  });
  if (!canManage) { res.status(403).json({ error: "Forbidden" }); return; }

  // Still needed downstream for calendar re-sync on schedule changes.
  const allTokens = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));

  const parsed = EditMomentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() }); return; }

  const updates: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.name !== undefined) updates.name = d.name;
  if (d.intention !== undefined) updates.intention = d.intention;
  if (d.frequency !== undefined) updates.frequency = d.frequency;
  if (d.dayOfWeek !== undefined) updates.dayOfWeek = d.dayOfWeek;
  if (d.practiceDays !== undefined) updates.practiceDays = d.practiceDays;
  if (d.goalDays !== undefined) updates.goalDays = d.goalDays;
  if (d.scheduledTime !== undefined) updates.scheduledTime = d.scheduledTime;
  if (d.intercessionTopic !== undefined) updates.intercessionTopic = d.intercessionTopic;
  // intercessionSource and intercessionFullText were silently accepted
  // but never written before — the schema validated them and the
  // request returned 200, but the body / pill type stayed unchanged
  // in the database. Now they actually persist, so community-
  // intercession edits via this endpoint match what the feed-side
  // PATCH /prayer-feeds/:slug/intercessions/:id has been doing.
  if (d.intercessionSource !== undefined) updates.intercessionSource = d.intercessionSource;
  if (d.intercessionFullText !== undefined) updates.intercessionFullText = d.intercessionFullText;
  if (d.contemplativeDurationMinutes !== undefined) updates.contemplativeDurationMinutes = d.contemplativeDurationMinutes;
  if (d.allowMemberInvites !== undefined) updates.allowMemberInvites = d.allowMemberInvites;
  if (d.customEmoji !== undefined) updates.customEmoji = d.customEmoji;
  if (d.learnMoreUrl !== undefined) updates.learnMoreUrl = d.learnMoreUrl ? d.learnMoreUrl.trim() : null;
  // Empty string clears the title (back to the bare pill); a value
  // overrides the auto-fetched one.
  if (d.learnMoreTitle !== undefined) updates.learnMoreTitle = d.learnMoreTitle && d.learnMoreTitle.trim() ? d.learnMoreTitle.trim() : null;

  if (Object.keys(updates).length === 0) {
    res.json({ ok: true });
    return;
  }

  await db.update(sharedMomentsTable).set(updates).where(eq(sharedMomentsTable.id, momentId));

  // If schedule-related fields changed, re-sync Google Calendar events for all members
  const needsCalSync = d.scheduledTime !== undefined || d.frequency !== undefined || d.dayOfWeek !== undefined;
  if (needsCalSync) {
    try {
      const [updated] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
      const timezone = updated.timezone ?? "America/New_York";
      const [hh, mm] = (updated.scheduledTime ?? "08:00").split(":").map(Number);
      const { startLocalStr, endLocalStr } = buildLocalEventTimes(hh, mm, timezone, practiceEventDurationMins(updated.templateType));

      const recurrence: string[] = [];
      if (updated.frequency === "daily") {
        recurrence.push("RRULE:FREQ=DAILY");
      } else if (updated.frequency === "weekly" && updated.dayOfWeek) {
        recurrence.push(`RRULE:FREQ=WEEKLY;BYDAY=${updated.dayOfWeek}`);
      } else if (updated.frequency === "weekly") {
        recurrence.push("RRULE:FREQ=WEEKLY");
      }

      // Delete all existing calendar events
      for (const member of allTokens) {
        if (member.googleCalendarEventId) {
          try { await deleteCalendarEvent(sessionUserId, member.googleCalendarEventId); } catch { /* best effort */ }
          await db.update(momentUserTokensTable)
            .set({ googleCalendarEventId: null, calendarConnected: false })
            .where(eq(momentUserTokensTable.id, member.id));
        }
      }

      // Create new group event on the requester's calendar with all members as attendees
      const myTokenRow = allTokens.find(t => t.email === user.email);
      const attendeeEmails = allTokens.map(m => m.email); // All members get invites from scheduler
      const patchSummary = (() => {
        if (updated.templateType === "intercession" && updated.intercessionSource !== "bcp" && updated.intention) {
          return `🙏🏽 ${updated.intention}`;
        }
        return `🔔 ${updated.name}`;
      })();
      const newEventId = await createCalendarEvent(sessionUserId, {
        summary: patchSummary,
        description: [
          `${updated.name} practice on Phoebe.`,
          ...(updated.intention ? [`"${updated.intention}"`] : []),
          "",
          `${allTokens.length} ${allTokens.length === 1 ? "person" : "people"} practicing together.`,
          "",
          `Open Phoebe → ${getInviteBaseUrl()}/moments/${momentId}`,
        ].join("\n"),
        startDate: new Date(),
        startLocalStr,
        endLocalStr,
        timeZone: timezone,
        attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
        recurrence: recurrence.length > 0 ? recurrence : undefined,
      });

      if (newEventId && myTokenRow) {
        await db.update(momentUserTokensTable)
          .set({ googleCalendarEventId: newEventId, calendarConnected: true })
          .where(eq(momentUserTokensTable.id, myTokenRow.id));
        console.info(`PATCH moment ${momentId}: recreated GCal event ${newEventId} at ${startLocalStr} ${timezone}`);
      }
    } catch (gcalErr) {
      console.error(`PATCH moment ${momentId} GCal sync error:`, gcalErr);
      // Non-fatal — DB update already succeeded
    }
  }

  res.json({ ok: true });
});

// ─── PATCH /api/moments/:id/goal — update progressive goal ─────────────────
const UpdateGoalSchema = z.object({
  commitmentSessionsGoal: z.number().int().min(0).max(365).nullable(),
  commitmentTendFreely: z.boolean().optional(),
});

router.patch("/moments/:id/goal", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Goal changes (extend, tend-freely) are management actions —
  // creator OR primary-group admin. Matches PATCH /moments/:id.
  const canManage = await canManageMoment({
    userId: sessionUserId,
    userEmail: user.email,
    momentId,
    primaryGroupId: moment.groupId,
  });
  if (!canManage) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateGoalSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Validation failed" }); return; }

  const updates: Record<string, unknown> = {};

  if (parsed.data.commitmentTendFreely) {
    // "Tend freely" — clear the goal, mark tend-freely. Clearing
    // commitmentGoalReachedAt cancels the 2-day calendar cleanup.
    // For intercessions, setting goalDays = 0 takes the moment out
    // of the "completed cycle" hide-filter (which gates on goalDays
    // > 0) so a tend-freely intercession stays visible without
    // touching any stats.
    updates.commitmentSessionsGoal = null;
    updates.commitmentTendFreely = true;
    updates.commitmentGoalReachedAt = null;
    // Tend-freely keeps the moment visible indefinitely — restart
    // the cycle window from "now" too, so any later goal-driven
    // renewal starts from a clean baseline.
    updates.commitmentCycleStartedAt = new Date();
    if (moment.templateType === "intercession") {
      updates.goalDays = 0;
      updates.state = "active";
    }
  } else if (parsed.data.commitmentSessionsGoal !== null) {
    // Extending the commitment — bump the goal target, clear the
    // goal-reached stamp (so cleanup stands down), bump the tier
    // counter for any tier-aware UI, and force state back to active.
    //
    // Crucially: leave commitmentSessionsLogged, currentStreak,
    // totalBlooms, and every other stat ALONE. Extending is "we're
    // still on this commitment, not done yet" — display should go
    // from "7/7" to "7/14" with the 7 preserved. The card uses
    // commitmentSessionsLogged / commitmentSessionsGoal for the
    // progress label, so leaving sessionsLogged at its accumulated
    // value is what makes the "7/14" UX work.
    updates.commitmentSessionsGoal = parsed.data.commitmentSessionsGoal;
    updates.commitmentGoalTier = (((moment as Record<string, unknown>).commitmentGoalTier as number) ?? 1) + 1;
    updates.commitmentTendFreely = false;
    updates.commitmentGoalReachedAt = null;
    // Start a new cycle window from "now" — the read filter hides
    // intercessions once now > cycleStartedAt + goalDays, and a
    // renewal restarts that window.
    updates.commitmentCycleStartedAt = new Date();
    if (moment.templateType === "intercession") {
      // Bump goalDays to match the new commitment — the frontend
      // sends the absolute new value (e.g. 14, not "+7"), so we
      // just store it. Mirrors commitmentSessionsGoal so the two
      // stay in lockstep for intercessions.
      updates.goalDays = parsed.data.commitmentSessionsGoal;
      updates.state = "active";
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.update(sharedMomentsTable).set(updates as Record<string, unknown>).where(eq(sharedMomentsTable.id, momentId));
  }

  res.json({ ok: true });
});

// ─── PATCH /api/moments/:id/archive — soft-delete a practice ─────────────────
router.patch("/moments/:id/archive", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Archive = management action. Creator OR primary-group admin.
  const canManage = await canManageMoment({
    userId: sessionUserId,
    userEmail: user.email,
    momentId,
    primaryGroupId: moment.groupId,
  });
  if (!canManage) { res.status(403).json({ error: "Forbidden" }); return; }

  await db.update(sharedMomentsTable)
    .set({ state: "archived" })
    .where(eq(sharedMomentsTable.id, momentId));

  res.json({ ok: true });
});

// ─── PATCH /api/moments/:id/unarchive — restore an archived practice ─────────
router.patch("/moments/:id/unarchive", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }
  if (moment.state !== "archived") { res.status(400).json({ error: "Not archived" }); return; }

  // Unarchive = management action. Creator OR primary-group admin.
  const canManage = await canManageMoment({
    userId: sessionUserId,
    userEmail: user.email,
    momentId,
    primaryGroupId: moment.groupId,
  });
  if (!canManage) { res.status(403).json({ error: "Forbidden" }); return; }

  // Restore to active state and clear goal-reached so it shows on the dashboard
  await db.update(sharedMomentsTable)
    .set({ state: "active", commitmentGoalReachedAt: null } as Record<string, unknown>)
    .where(eq(sharedMomentsTable.id, momentId));

  res.json({ ok: true });
});

// ─── DELETE /api/moments/:id — permanently delete a practice ─────────────────
router.delete("/moments/:id", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Delete = management action. Creator OR primary-group admin.
  // Admins of secondary (junction) groups don't get full delete —
  // they can only detach their own group via
  // DELETE /moments/:id/groups/:groupId.
  const canManage = await canManageMoment({
    userId: sessionUserId,
    userEmail: user.email,
    momentId,
    primaryGroupId: moment.groupId,
  });
  if (!canManage) { res.status(403).json({ error: "Forbidden" }); return; }

  // Member tokens are still needed below for calendar cleanup +
  // connection-cache persistence, just no longer drive the auth check.
  const allMemberTokens = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));

  try {
    // Save connections to cache before deleting (so they persist in the recommender)
    await saveConnectionCache(allMemberTokens.map(t => ({ email: t.email, name: t.name ?? null })));

    // Delete Google Calendar events for all members (best effort, non-blocking)
    const calDeletePromises = allMemberTokens
      .filter(t => t.googleCalendarEventId)
      .map(async (t) => {
        try {
          // Look up the user by email to get their userId for calendar API
          const [memberUser] = await db.select({ id: usersTable.id })
            .from(usersTable).where(eq(usersTable.email, t.email));
          if (memberUser) {
            await deleteCalendarEvent(memberUser.id, t.googleCalendarEventId!);
            console.info(`Deleted GCal event ${t.googleCalendarEventId} for ${t.email}`);
          }
        } catch { /* best effort */ }
      });
    await Promise.allSettled(calDeletePromises);

    // Also delete moment-level calendar events from momentCalendarEventsTable
    const momentCalEvents = await db.select().from(momentCalendarEventsTable)
      .where(eq(momentCalendarEventsTable.sharedMomentId, momentId));
    for (const evt of momentCalEvents) {
      if (evt.googleCalendarEventId) {
        try {
          await deleteCalendarEvent(sessionUserId, evt.googleCalendarEventId);
        } catch { /* best effort */ }
      }
    }

    // Explicitly delete child rows first (in case DB CASCADE wasn't applied via migration)
    await db.delete(momentCalendarEventsTable).where(eq(momentCalendarEventsTable.sharedMomentId, momentId));
    await db.delete(momentPostsTable).where(eq(momentPostsTable.momentId, momentId));
    await db.delete(momentWindowsTable).where(eq(momentWindowsTable.momentId, momentId));
    await db.delete(momentUserTokensTable).where(eq(momentUserTokensTable.momentId, momentId));
    // momentRenewalsTable also references shared_moments
    await db.delete(momentRenewalsTable).where(eq(momentRenewalsTable.momentId, momentId)).catch(() => {});

    await db.delete(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));

    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /moments/:id error:", err);
    res.status(500).json({ error: "Failed to delete practice" });
  }
});

// ─── GET /api/connections — return all unique people in user's moments + traditions ────
router.get("/connections", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const seen = new Set<string>([user.email]);
    // Track the most recent createdAt for each connection so we can sort
    const connectionMap = new Map<string, { name: string; email: string; recentTs: number }>();

    const addConnection = (email: string, name: string, ts: number) => {
      const key = email.toLowerCase();
      if (key === user.email.toLowerCase()) return;
      const existing = connectionMap.get(key);
      if (!existing) {
        connectionMap.set(key, { name, email, recentTs: ts });
        seen.add(key);
      } else if (ts > existing.recentTs) {
        existing.recentTs = ts;
        if (name && name !== email) existing.name = name;
      }
    };

    // Members from active practices (moments this user is currently part of)
    // — fetch with createdAt from the moment so we can sort by most recent practice
    const userTokenRows = await db.select({ momentId: momentUserTokensTable.momentId })
      .from(momentUserTokensTable)
      .where(sql`LOWER(${momentUserTokensTable.email}) = LOWER(${user.email})`);

    const momentIds = [...new Set(userTokenRows.map(r => r.momentId))];
    if (momentIds.length > 0) {
      const momentsWithMembers = await db.select({
        name: momentUserTokensTable.name,
        email: momentUserTokensTable.email,
        createdAt: sharedMomentsTable.createdAt,
      })
        .from(momentUserTokensTable)
        .innerJoin(sharedMomentsTable, eq(momentUserTokensTable.momentId, sharedMomentsTable.id))
        .where(inArray(momentUserTokensTable.momentId, momentIds));

      for (const m of momentsWithMembers) {
        if (m.email) {
          const ts = m.createdAt ? new Date(m.createdAt as unknown as string).getTime() : 0;
          addConnection(m.email, m.name ?? m.email, ts);
        }
      }
    }

    // Members from ALL traditions (owned by user OR where user is a participant)
    const allRituals = await db.select({ participants: ritualsTable.participants })
      .from(ritualsTable)
      .where(sql`owner_id = ${sessionUserId} OR participants @> ${JSON.stringify([{ email: user.email }])}::jsonb`);

    for (const r of allRituals) {
      const parts = (r.participants as Array<{ name: string; email: string }>) ?? [];
      for (const p of parts) {
        if (p.email) addConnection(p.email, p.name ?? p.email, 0);
      }
    }

    // Past connections from deleted practices (cached before deletion)
    const cached = await db.select({
      contactEmail: userConnectionsCacheTable.contactEmail,
      contactName: userConnectionsCacheTable.contactName,
    })
      .from(userConnectionsCacheTable)
      .where(eq(userConnectionsCacheTable.userEmail, user.email));

    for (const c of cached) {
      if (c.contactEmail) addConnection(c.contactEmail, c.contactName ?? c.contactEmail, 0);
    }

    // Members of any community (group) this user belongs to
    try {
      const myGroupRows = await db.select({ groupId: groupMembersTable.groupId })
        .from(groupMembersTable)
        .where(eq(groupMembersTable.userId, sessionUserId));
      const myGroupIds = myGroupRows.map(r => r.groupId);
      if (myGroupIds.length > 0) {
        const groupMembers = await db.select({
          name: groupMembersTable.name,
          email: groupMembersTable.email,
        })
          .from(groupMembersTable)
          .where(inArray(groupMembersTable.groupId, myGroupIds));
        for (const gm of groupMembers) {
          if (gm.email) addConnection(gm.email, gm.name ?? gm.email, 0);
        }
      }
    } catch (gErr) {
      console.warn("[connections] group members lookup failed:", gErr);
    }

    // Sort by most recent practice first
    const connections = [...connectionMap.values()]
      .sort((a, b) => b.recentTs - a.recentTs)
      .map(({ name, email }) => ({ name, email }));

    res.json({ connections });
  } catch (err) {
    console.error("GET /api/connections error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/moments/cleanup-calendars — delete orphaned GCal events ───────
// Finds archived practices that still have calendar event IDs on member tokens,
// deletes those events from Google Calendar, and clears the stored IDs.
router.post("/moments/cleanup-calendars", async (req, res): Promise<void> => {
  // Cron-only: this endpoint archives expired intercessions and
  // deletes calendar events globally. Anything signed-in being able
  // to fire it is a DoS vector (and changes DB state for everyone).
  // Fail-CLOSED when env var is missing, same shape as office.ts.
  const internalKey = req.headers["x-internal-key"];
  if (!process.env["INTERNAL_API_KEY"] || internalKey !== process.env["INTERNAL_API_KEY"]) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  // No caller user — the job looks up each member's userId via
  // their token's email when it needs to call deleteCalendarEvent
  // (line ~4413), so there's no shared "session user" to keep.

  try {
    // Auto-archive intercessions whose 2-day grace period has expired.
    // Aligned with dashboard GoalReachedModal renewal window.
    const graceCutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const expiredIntercessions = await db.select({ id: sharedMomentsTable.id })
      .from(sharedMomentsTable)
      .where(
        and(
          eq(sharedMomentsTable.templateType, "intercession"),
          sql`commitment_goal_reached_at IS NOT NULL AND commitment_goal_reached_at < ${graceCutoff.toISOString()}`,
          sql`state != 'archived'`
        )
      );
    if (expiredIntercessions.length > 0) {
      const expiredIds = expiredIntercessions.map(m => m.id);
      await db.update(sharedMomentsTable)
        .set({ state: "archived" })
        .where(inArray(sharedMomentsTable.id, expiredIds));
      console.info(`Cleanup: archived ${expiredIds.length} expired intercession(s) past grace period`);
    }

    // Also archive intercessions that hit their goal before the stamping code
    // was deployed (totalBlooms > 0 but no commitmentGoalReachedAt). Grace
    // period is forfeit since we don't know when they finished. Mirrors the
    // read filter in /api/moments.
    const legacyExpired = await db.select({ id: sharedMomentsTable.id })
      .from(sharedMomentsTable)
      .where(
        and(
          eq(sharedMomentsTable.templateType, "intercession"),
          sql`goal_days > 0
            AND total_blooms > 0
            AND commitment_goal_reached_at IS NULL
            AND state != 'archived'`
        )
      );
    if (legacyExpired.length > 0) {
      const legacyIds = legacyExpired.map(m => m.id);
      await db.update(sharedMomentsTable)
        .set({ state: "archived" })
        .where(inArray(sharedMomentsTable.id, legacyIds));
      console.info(`Cleanup: archived ${legacyIds.length} legacy expired intercession(s) (pre-stamping)`);
    }

    // Find all archived practices
    const archivedMoments = await db.select({ id: sharedMomentsTable.id })
      .from(sharedMomentsTable)
      .where(eq(sharedMomentsTable.state, "archived"));

    const archivedIds = archivedMoments.map(m => m.id);
    let cleaned = 0;

    if (archivedIds.length > 0) {
      // Find all member tokens for archived practices that still have calendar events
      const tokensWithEvents = await db.select()
        .from(momentUserTokensTable)
        .where(inArray(momentUserTokensTable.momentId, archivedIds));

      for (const token of tokensWithEvents) {
        if (!token.googleCalendarEventId) continue;

        // Look up the user to get their userId for calendar API
        const [memberUser] = await db.select({ id: usersTable.id })
          .from(usersTable).where(eq(usersTable.email, token.email));

        if (memberUser) {
          try {
            await deleteCalendarEvent(memberUser.id, token.googleCalendarEventId);
            console.info(`Cleanup: deleted GCal event ${token.googleCalendarEventId} for ${token.email}`);
            cleaned++;
          } catch { /* best effort */ }
        }

        // Clear the event ID regardless (event may be already gone)
        await db.update(momentUserTokensTable)
          .set({ googleCalendarEventId: null, calendarConnected: false })
          .where(eq(momentUserTokensTable.id, token.id));
      }
    }

    // Also check: member tokens pointing to moments that no longer exist at all
    const allTokens = await db.select({
      id: momentUserTokensTable.id,
      momentId: momentUserTokensTable.momentId,
      email: momentUserTokensTable.email,
      googleCalendarEventId: momentUserTokensTable.googleCalendarEventId,
    }).from(momentUserTokensTable);

    const existingMomentIds = new Set(
      (await db.select({ id: sharedMomentsTable.id }).from(sharedMomentsTable)).map(m => m.id)
    );

    for (const token of allTokens) {
      if (existingMomentIds.has(token.momentId)) continue;
      if (!token.googleCalendarEventId) continue;

      const [memberUser] = await db.select({ id: usersTable.id })
        .from(usersTable).where(eq(usersTable.email, token.email));

      if (memberUser) {
        try {
          await deleteCalendarEvent(memberUser.id, token.googleCalendarEventId);
          console.info(`Cleanup orphan: deleted GCal event ${token.googleCalendarEventId} for ${token.email}`);
          cleaned++;
        } catch { /* best effort */ }
      }
    }

    // ─── Tradition/ritual calendar cleanup ──────────────────────────────────
    // Find meetups with calendar event IDs whose rituals no longer exist
    const allMeetups = await db.select({
      id: meetupsTable.id,
      ritualId: meetupsTable.ritualId,
      googleCalendarEventId: meetupsTable.googleCalendarEventId,
    }).from(meetupsTable);

    const existingRitualIds = new Set(
      (await db.select({ id: ritualsTable.id }).from(ritualsTable)).map(r => r.id)
    );

    for (const meetup of allMeetups) {
      if (!meetup.googleCalendarEventId) continue;
      if (existingRitualIds.has(meetup.ritualId)) continue;

      // Orphaned meetup — the ritual was deleted but its calendar
      // event remains. Without a caller user (this is a cron now),
      // we don't have credentials to actually delete from GCal, so
      // just clear the stale DB reference. The orphan event itself
      // will sit on the original organizer's calendar until they
      // remove it manually or its recurrence ends.
      await db.update(meetupsTable)
        .set({ googleCalendarEventId: null })
        .where(eq(meetupsTable.id, meetup.id));
    }

    // Also clean up existing meetups for active rituals — try with the session user's credentials
    // (covers events the organizer created)
    for (const meetup of allMeetups) {
      if (!meetup.googleCalendarEventId) continue;
      if (!existingRitualIds.has(meetup.ritualId)) continue;

      // Check if this ritual still has pending/active state — skip active ones
      // Only clean events for rituals that exist but don't need them anymore
      // (We skip this for now — active tradition events should stay)
    }

    res.json({ ok: true, archivedPractices: archivedIds.length, calendarEventsDeleted: cleaned });
  } catch (err) {
    console.error("POST /moments/cleanup-calendars error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── POST /api/moments/:id/refresh-calendar — update existing event title + description ───
// Updates the calendar event on the creator's Google Calendar to reflect the current
// description format (removes old member names, applies latest copy).
router.post("/moments/:id/refresh-calendar", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  const allMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));

  const myTokenRow = allMembers.find(m => m.email.toLowerCase() === user.email.toLowerCase());
  if (!myTokenRow?.googleCalendarEventId) {
    res.status(400).json({ error: "No calendar event to update" }); return;
  }

  // Build the new title and description in current format
  const shortLink = `${getInviteBaseUrl()}/m/${myTokenRow.userToken}`;
  const freqLabel = moment.frequency === "daily" ? "Daily" : moment.frequency === "weekly" ? "Weekly" : "Monthly";
  const [h, m] = (moment.scheduledTime || "08:00").split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const calTimeLabel = `${hour12}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""} ${period}`;
  const todayStr = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const invFirst = user.name?.split(" ")[0] ?? "Someone";

  const newSummary = `🌱 ${moment.name}`;
  const newDescription = [
    `${invFirst} invited you to practice together.`,
    `Open in Phoebe → ${shortLink}`,
    "",
    ...(moment.intention ? [`"${moment.intention}"`, ""] : []),
    `When: ${freqLabel} at ${calTimeLabel} · Starting ${todayStr}`,
  ].join("\n");

  const ok = await updateCalendarEvent(sessionUserId, myTokenRow.googleCalendarEventId, {
    summary: newSummary,
    description: newDescription,
  });

  if (!ok) { res.status(500).json({ error: "Could not update calendar event" }); return; }

  res.json({ success: true });
});

// ─── POST /api/moments/:id/restore-calendar — creator restores deleted calendar event ───
router.post("/moments/:id/restore-calendar", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  const allMembers = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));

  const myTokenRow = allMembers.find(m => m.email.toLowerCase() === user.email.toLowerCase());
  if (!myTokenRow) { res.status(403).json({ error: "Not a member of this practice" }); return; }

  const creatorToken = allMembers.length > 0
    ? allMembers.reduce((min, m) => m.id < min.id ? m : min, allMembers[0])
    : null;
  if (myTokenRow.email.toLowerCase() !== creatorToken?.email.toLowerCase()) {
    res.status(403).json({ error: "Only the creator can restore the calendar event" }); return;
  }

  // Build a new calendar event using the moment's schedule
  const tz = moment.timezone || "UTC";
  const [h, m] = (moment.scheduledTime || "08:00").split(":").map(Number);
  const now = new Date();
  const startDate = new Date(now);
  startDate.setHours(h, m, 0, 0);
  if (startDate < now) startDate.setDate(startDate.getDate() + 1);
  const durationMins = 60;
  const endDate = new Date(startDate.getTime() + durationMins * 60_000);

  const recurrenceRule = moment.frequency === "daily"
    ? ["RRULE:FREQ=DAILY"]
    : moment.frequency === "weekly"
    ? ["RRULE:FREQ=WEEKLY"]
    : ["RRULE:FREQ=MONTHLY"];

  const attendeeEmails = allMembers.map(m => m.email); // All members get invites from scheduler

  const eventId = await createCalendarEvent(sessionUserId, {
    summary: `🌿 ${moment.name}`,
    description: [
      `${moment.name} practice on Phoebe — restored.`,
      moment.intention ? `"${moment.intention}"` : "",
      "",
      `Open Phoebe → ${getInviteBaseUrl()}/moments/${momentId}`,
    ].filter(Boolean).join("\n"),
    startDate,
    endDate,
    timeZone: tz,
    attendees: attendeeEmails.length > 0 ? attendeeEmails : undefined,
    recurrence: recurrenceRule,
    colorId: "2",
    reminders: [{ method: "popup", minutes: 10 }],
  });

  if (!eventId) { res.status(500).json({ error: "Could not create calendar event" }); return; }

  await db.update(momentUserTokensTable)
    .set({ googleCalendarEventId: eventId, calendarConnected: true })
    .where(eq(momentUserTokensTable.id, myTokenRow.id));

  res.json({ success: true });
});

// ─── POST /api/moments/:id/sync-calendar-title — update all members' calendar event titles ───
// Used to backfill existing events when the display title changes (e.g. custom intercession intention).
router.post("/moments/:id/sync-calendar-title", async (req, res): Promise<void> => {
  const momentId = parseInt(req.params.id, 10);
  if (isNaN(momentId)) { res.status(400).json({ error: "Invalid moment id" }); return; }

  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sessionUserId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const [moment] = await db.select().from(sharedMomentsTable).where(eq(sharedMomentsTable.id, momentId));
  if (!moment) { res.status(404).json({ error: "Moment not found" }); return; }

  // Only members can trigger this
  const allTokens = await db.select().from(momentUserTokensTable)
    .where(eq(momentUserTokensTable.momentId, momentId));
  const myToken = allTokens.find(t => t.email.toLowerCase() === user.email.toLowerCase());
  if (!myToken) { res.status(403).json({ error: "Not a member of this practice" }); return; }

  if (moment.templateType !== "intercession" || moment.intercessionSource === "bcp" || !moment.intention) {
    res.json({ updated: 0, skipped: "not a custom intercession" }); return;
  }

  const newSummary = `🙏🏽 ${moment.intention}`;
  let updated = 0;

  for (const token of allTokens) {
    if (!token.googleCalendarEventId) continue;
    const ok = await updateCalendarEvent(sessionUserId, token.googleCalendarEventId, { summary: newSummary }).catch(() => false);
    if (ok) updated++;
  }

  res.json({ updated });
});

// ─── Prayer-list streak ─────────────────────────────────────────────────────
// How many consecutive days the viewer has prayed through their list. The
// signal is any `moment_posts` row keyed to one of the user's tokens — this
// is what the "Amen" handler in prayer-mode writes (isCheckin=true) when
// someone finishes the slideshow, and also what direct posts on a practice
// record. Distinct `windowDate` values per user define prayed-days.
//
// Rules:
//   - Walk backward from today in the user's timezone.
//   - If they haven't prayed today yet, start counting from yesterday so the
//     streak doesn't vanish between midnight and their first prayer — common
//     people pray in the evening, and ticking over at midnight would feel
//     punishing.
//   - Stop on the first gap. No grace beyond the single "yet-to-pray-today"
//     allowance.
//
// Response is shallow on purpose (just `streak` + `lastPrayedDate`) — the
// dashboard pill only needs a number and we don't want to leak post history.
router.get("/prayer-streak", async (req, res): Promise<void> => {
  try {
    const sessionUserId = req.user ? (req.user as { id: number }).id : null;
    if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }

    const [u] = await db
      .select({
        email: usersTable.email,
        timezone: usersTable.timezone,
        // Fallback signal — /api/prayer-streak/log stamps these on the
        // user row when the closing slide fires. Lets us mark
        // loggedToday=true for sessions that consisted entirely of
        // request slides (no intercession check-ins, so moment_posts
        // would have nothing to say). Without this fallback the
        // dashboard sat on "Begin prayer" forever after a request-only
        // session.
        prayerStreakLastDate: usersTable.prayerStreakLastDate,
        prayerStreakCount: usersTable.prayerStreakCount,
      })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    if (!u) { res.json({ streak: 0, lastPrayedDate: null, loggedToday: false }); return; }

    const tz = u.timezone || "UTC";
    const emailLower = u.email.toLowerCase();

    const userRowToday = todayDateInTz(tz);
    const userRowLoggedToday = u.prayerStreakLastDate === userRowToday;

    // All tokens tied to this user's email across every moment they're in.
    // We lowercase in JS rather than relying on column case — the email
    // column is stored case-insensitively in practice but not all historical
    // rows agree. Safer to do the match in app code.
    const tokens = await db
      .select({ userToken: momentUserTokensTable.userToken, email: momentUserTokensTable.email })
      .from(momentUserTokensTable);
    const myTokens = tokens
      .filter(t => (t.email || "").toLowerCase() === emailLower)
      .map(t => t.userToken);
    if (myTokens.length === 0) {
      // No moments → moment_posts has nothing for us. Fall back to
      // the user-row marker so a request-only completion still flips
      // loggedToday true.
      res.json({
        streak: userRowLoggedToday ? (u.prayerStreakCount ?? 1) : 0,
        lastPrayedDate: userRowLoggedToday ? u.prayerStreakLastDate : null,
        loggedToday: userRowLoggedToday,
      });
      return;
    }

    // Distinct window dates this user has checked-in on. isCheckin=1 is the
    // signal written by prayer-mode's handleDone — one row per intercession
    // the user prayed through in the slideshow. Direct practice posts (likes,
    // reflections, text posts) don't flip isCheckin, so they don't count
    // toward this streak. This keeps "my prayer-list streak" literal: days
    // the user has walked the slideshow.
    const rows = await db
      .select({ windowDate: momentPostsTable.windowDate })
      .from(momentPostsTable)
      .where(and(
        inArray(momentPostsTable.userToken, myTokens),
        eq(momentPostsTable.isCheckin, 1),
      ));
    const dates = new Set(
      rows
        .map(r => r.windowDate)
        .filter((d): d is string => typeof d === "string" && d !== "seed" && /^\d{4}-\d{2}-\d{2}$/.test(d)),
    );
    const today = todayDateInTz(tz);
    // OR the two signals — a request-only completion writes only to
    // the user-row marker; an intercession-walking completion writes
    // to moment_posts. Either is sufficient.
    const loggedToday = dates.has(today) || userRowLoggedToday;
    if (dates.size === 0) {
      res.json({
        streak: userRowLoggedToday ? (u.prayerStreakCount ?? 1) : 0,
        lastPrayedDate: userRowLoggedToday ? u.prayerStreakLastDate : null,
        loggedToday,
      });
      return;
    }

    // Walk consecutive days backward. YYYY-MM-DD arithmetic via UTC midnight
    // is safe because we only ever add/subtract whole days.
    const stepBack = (ymd: string): string => {
      const [y, m, d] = ymd.split("-").map(Number);
      const t = Date.UTC(y, m - 1, d) - 86_400_000;
      const dt = new Date(t);
      const yy = dt.getUTCFullYear();
      const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(dt.getUTCDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    };

    // A request-only session today (POST /prayer-streak/log) writes no check-in
    // post, so `dates` won't include today even though the user prayed. Fold it
    // in so the streak walk counts today (fixes an undercount-by-1, and a false
    // 0 when today's prayer was request-only with no prior check-in days).
    if (userRowLoggedToday) dates.add(today);

    let cursor = today;
    if (!dates.has(cursor)) cursor = stepBack(cursor);
    // If the most recent candidate day still has no post, the streak is 0.
    if (!dates.has(cursor)) { res.json({ streak: 0, lastPrayedDate: null, loggedToday }); return; }

    let streak = 0;
    const lastPrayedDate = cursor;
    while (dates.has(cursor)) {
      streak++;
      cursor = stepBack(cursor);
    }

    // How many people prayed with the viewer today. Counts distinct
    // users who have engaged with the viewer's prayer life today via
    // either signal:
    //
    //   1) Tapped Amen on any of the viewer's active prayer requests
    //      (amen-based — runs across ALL prayer-request authors who
    //      can see the viewer's request, not just garden members,
    //      since "praying for me" is the user's mental model).
    //   2) Walked their own prayer slideshow today (moment-checkin-
    //      based — preserves the original signal that picks up
    //      garden members who are praying through community
    //      practices but haven't necessarily amened anything yet).
    //
    // The two sets are unioned by user id; the count is the size of
    // the union. Today is computed in the VIEWER's timezone, since
    // the "today" the viewer is asking about is their own.
    let gardenPrayedTodayCount = 0;
    try {
      const myUserRow = await db
        .select({ timezone: usersTable.timezone })
        .from(usersTable)
        .where(eq(usersTable.id, sessionUserId));
      const myTz = myUserRow[0]?.timezone || tz;
      const myToday = todayDateInTz(myTz);
      const ymdInMyTz = (d: Date) =>
        new Intl.DateTimeFormat("en-CA", {
          timeZone: myTz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(d);

      const prayedUserIds = new Set<number>();

      // ── Signal 1: amens on the viewer's active prayer requests ──
      const myRequests = await db
        .select({ id: prayerRequestsTable.id })
        .from(prayerRequestsTable)
        .where(eq(prayerRequestsTable.ownerId, sessionUserId));
      const myRequestIds = myRequests.map((r) => r.id);
      if (myRequestIds.length > 0) {
        const amenRows = await db
          .select({
            userId: prayerRequestAmensTable.userId,
            prayedAt: prayerRequestAmensTable.prayedAt,
          })
          .from(prayerRequestAmensTable)
          .where(inArray(prayerRequestAmensTable.requestId, myRequestIds));
        for (const a of amenRows) {
          if (!a.prayedAt) continue;
          if (a.userId === sessionUserId) continue; // own taps don't count
          if (ymdInMyTz(a.prayedAt) === myToday) {
            prayedUserIds.add(a.userId);
          }
        }
      }

      // ── Signal 2: garden members who did a moment check-in today ──
      const gardenIds = await getGardenUserIds(sessionUserId);
      if (gardenIds.length > 0) {
        const gardenUsers = await db
          .select({ id: usersTable.id, email: usersTable.email, timezone: usersTable.timezone })
          .from(usersTable)
          .where(inArray(usersTable.id, gardenIds));
        const emailToId = new Map<string, number>();
        for (const g of gardenUsers) {
          const e = (g.email || "").toLowerCase();
          if (e) emailToId.set(e, g.id);
        }
        const emails = Array.from(emailToId.keys());
        if (emails.length > 0) {
          const tokenRows = await db
            .select({ userToken: momentUserTokensTable.userToken, email: momentUserTokensTable.email })
            .from(momentUserTokensTable);
          const tokensByEmail = new Map<string, string[]>();
          for (const t of tokenRows) {
            const e = (t.email || "").toLowerCase();
            if (!emailToId.has(e)) continue;
            const list = tokensByEmail.get(e) ?? [];
            list.push(t.userToken);
            tokensByEmail.set(e, list);
          }
          const allGardenTokens = Array.from(tokensByEmail.values()).flat();
          if (allGardenTokens.length > 0) {
            const checkinRows = await db
              .select({
                userToken: momentPostsTable.userToken,
                windowDate: momentPostsTable.windowDate,
              })
              .from(momentPostsTable)
              .where(and(
                inArray(momentPostsTable.userToken, allGardenTokens),
                eq(momentPostsTable.isCheckin, 1),
              ));
            const tokenToEmail = new Map<string, string>();
            for (const [email, tokens] of tokensByEmail.entries()) {
              for (const tok of tokens) tokenToEmail.set(tok, email);
            }
            const todayByEmail = new Map<string, string>();
            for (const g of gardenUsers) {
              const e = (g.email || "").toLowerCase();
              if (!e) continue;
              todayByEmail.set(e, todayDateInTz(g.timezone || "UTC"));
            }
            for (const r of checkinRows) {
              const email = tokenToEmail.get(r.userToken);
              if (!email) continue;
              if (r.windowDate === todayByEmail.get(email)) {
                const uid = emailToId.get(email);
                if (uid) prayedUserIds.add(uid);
              }
            }
          }
        }
      }

      gardenPrayedTodayCount = prayedUserIds.size;
    } catch (gardenErr) {
      console.error("GET /api/prayer-streak garden count failed:", gardenErr);
    }

    res.json({ streak, lastPrayedDate, loggedToday, gardenPrayedTodayCount });
  } catch (err) {
    console.error("GET /api/prayer-streak error:", err);
    res.json({ streak: 0, lastPrayedDate: null, loggedToday: false, gardenPrayedTodayCount: 0 });
  }
});

export default router;
