import { Router, type IRouter } from "express";
import { desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  prayerFeedsTable,
  groupMembersTable,
  momentUserTokensTable,
  momentPostsTable,
  morningPrayerCacheTable,
  userConnectionsCacheTable,
  waitlistTable,
  contemplationGoalHistoryTable,
} from "@workspace/db";
import { revokeGoogleTokensFor } from "../lib/googleOauthRevoke";
import { exportUserData } from "../lib/userDataExport";

const router: IRouter = Router();

// ─── GET /api/users/me/export — data portability ──────────────────────────
// Returns a JSON blob of everything we have that's tied to this user. The
// client downloads it as a timestamped file so the user can keep a copy
// before deleting their account, or just for their own records.
// Sensitive auth material (password hash, OAuth tokens, reset tokens) is
// redacted in the exporter — we return everything the *user* owns, not
// the credentials *we* use to authenticate them.
router.get("/users/me/export", async (req, res): Promise<void> => {
  const user = req.user as { id: number; email: string } | undefined;
  if (!user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }
  try {
    const data = await exportUserData(user.id, user.email);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="phoebe-export-${stamp}.json"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("[users:export-me] export failed:", err);
    res.status(500).json({ error: "export_failed" });
  }
});

// ─── DELETE /api/users/me — in-app account deletion ────────────────────────
// Apple Guideline 5.1.1(v) requires account-creating apps to offer in-app
// deletion. This endpoint:
//   1. Verifies the caller is logged in (session user).
//   2. Requires the user to type their email as a confirmation step — a
//      small but real guard against accidental taps on shared devices.
//   3. Explicitly removes the user from every community (group_members)
//      and every shared practice (moment_user_tokens + moment_posts).
//      These two surfaces are email/token-keyed rather than user_id-
//      keyed, so a FK cascade from users wouldn't reach them — and
//      some historical group_members rows are invitees with no user_id
//      FK at all. Cleanup is explicit so the user truly disappears
//      from the roster everywhere.
//   4. Hard-deletes the users row. Remaining user_id-keyed tables
//      (prayer_requests, prayer_responses, device_tokens,
//      gratitude, etc.) cascade off users.id.
//   5. Destroys the session so the app falls back to the login screen.
// External mirrors (Google Calendar events, sent emails) are not reached
// by the cleanup — those are logged and left to the user to clean up
// manually. We note this in the UI wording on the client.
router.delete("/users/me", async (req, res): Promise<void> => {
  const user = req.user as { id: number; email: string } | undefined;
  if (!user) {
    res.status(401).json({ error: "not_authenticated" });
    return;
  }

  const confirmEmail = typeof req.body?.confirmEmail === "string"
    ? req.body.confirmEmail.trim().toLowerCase()
    : "";
  if (confirmEmail !== user.email.toLowerCase()) {
    res.status(400).json({
      error: "confirm_email_mismatch",
      detail: "Type your account email to confirm deletion.",
    });
    return;
  }

  const emailLower = user.email.toLowerCase();

  // 0) Revoke any Google OAuth grant we still hold for this user before
  //    we drop the row. Best-effort — failures here shouldn't block the
  //    account deletion the user asked for.
  try {
    const [full] = await db
      .select({
        accessToken: usersTable.googleAccessToken,
        refreshToken: usersTable.googleRefreshToken,
      })
      .from(usersTable)
      .where(eq(usersTable.id, user.id));
    if (full && (full.accessToken || full.refreshToken)) {
      await revokeGoogleTokensFor({
        accessToken: full.accessToken,
        refreshToken: full.refreshToken,
      });
    }
  } catch (err) {
    console.warn("[users:delete-me] google token revoke warned:", err);
  }

  try {
    // The entire cleanup + final delete runs in ONE transaction so it is
    // all-or-nothing. Before this, ~8 independent deletes ran unwrapped and any
    // failure part-way (an FK violation, a transient error, a dropped
    // connection) left an unrecoverable HALF-deleted account the user could
    // still log into. A throw inside rolls everything back.
    await db.transaction(async (tx) => {
      // 1) Remove every group_members row for this user — BOTH rows with
      //    a user_id FK (already joined) AND rows identified only by
      //    email (invited but never joined).
      await tx.delete(groupMembersTable).where(
        sql`${groupMembersTable.userId} = ${user.id} OR LOWER(${groupMembersTable.email}) = ${emailLower}`,
      );

      // 2) Find every moment_user_tokens row for this user, then delete
      //    the posts keyed off those tokens before dropping the tokens
      //    themselves. Order matters because moment_posts has no FK to
      //    moment_user_tokens — the token is a string.
      const participantRows = await tx
        .select({ userToken: momentUserTokensTable.userToken })
        .from(momentUserTokensTable)
        .where(sql`LOWER(${momentUserTokensTable.email}) = ${emailLower}`);
      const userTokens = participantRows.map(r => r.userToken);
      if (userTokens.length > 0) {
        await tx.delete(momentPostsTable).where(inArray(momentPostsTable.userToken, userTokens));
      }
      await tx.delete(momentUserTokensTable)
        .where(sql`LOWER(${momentUserTokensTable.email}) = ${emailLower}`);

      // 3) FK columns that REFERENCE users(id) with NO onDelete clause would
      //    make the final `DELETE FROM users` throw an FK violation — i.e.
      //    account deletion was silently BROKEN (500 + rollback) for whole
      //    classes of ordinary users. Null the account link BEFORE the delete.
      //    (The Letters feature was retired 2026-07-23 and its tables dropped,
      //    so the former letters/correspondence FK-scrub here is gone.)
      //    - morning_prayer_cache.assembled_by_user_id (whoever opened the
      //      day's first Morning Prayer is stamped assembler → blocked delete).
      await tx.update(morningPrayerCacheTable)
        .set({ assembledByUserId: null })
        .where(eq(morningPrayerCacheTable.assembledByUserId, user.id));

      // 3b) Residual PII in tables keyed by email/text with NO user_id FK, so
      //     the users-row cascade never touches them. Clearing them by
      //     lowercased email is the erasure the user expects (Apple 5.1.1(v) /
      //     GDPR). Matches how moment_user_tokens is already cleared above.
      await tx.delete(userConnectionsCacheTable).where(
        sql`LOWER(${userConnectionsCacheTable.userEmail}) = ${emailLower} OR LOWER(${userConnectionsCacheTable.contactEmail}) = ${emailLower}`,
      );
      await tx.delete(waitlistTable).where(sql`LOWER(${waitlistTable.email}) = ${emailLower}`);

      // Capture the parish this user belongs to BEFORE the delete — the cascade
      // drops their prayer_feed_subscriptions row, and the denormalized
      // prayer_feeds.subscriber_count would otherwise stay permanently inflated
      // (it's only recomputed on subscribe/unsubscribe, never on account delete).
      const [meRow] = await tx.select({ parishFeedId: usersTable.parishFeedId })
        .from(usersTable).where(eq(usersTable.id, user.id));

      // 4) Finally drop the user — cascades handle the rest (prayer
      //    requests/words/amens, device tokens, etc. all declare
      //    ON DELETE CASCADE). prayer_feeds.creator_user_id is ON DELETE SET NULL,
      //    so a priest deleting their account orphans (not destroys) the parish.
      await tx.delete(usersTable).where(eq(usersTable.id, user.id));

      // Recompute the parish's subscriber count now that the subscription row is gone.
      if (meRow?.parishFeedId != null) {
        await tx.update(prayerFeedsTable)
          .set({ subscriberCount: sql`(SELECT COUNT(*) FROM prayer_feed_subscriptions WHERE feed_id = ${meRow.parishFeedId})` })
          .where(eq(prayerFeedsTable.id, meRow.parishFeedId));
      }
    });
  } catch (err) {
    console.error("[users:delete-me] delete failed:", err);
    res.status(500).json({ error: "delete_failed" });
    return;
  }

  // Log out + destroy session so the stale cookie can't be replayed.
  req.logout((logoutErr) => {
    if (logoutErr) {
      console.warn("[users:delete-me] logout after delete warned:", logoutErr);
    }
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.warn("[users:delete-me] session destroy warned:", destroyErr);
      }
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });
});

// ─── Office reminder prefs (everyone) ───────────────────────────────────
//
// Per-user prefs for the daily morning + evening office reminder push.
// Each side picks "none" / "office" / "devotion"; morning takes an
// optional time override (HH:MM in the user's timezone). Storage uses
// the parish_office_* columns — they were added for the parish tier
// originally but the rename cost isn't worth it; functionally they're
// general office prefs.
//
// GET returns the current prefs; PUT does a partial update (any keys
// present in the body merge in).
router.get("/me/office-prefs", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db
      .select({
        morning: usersTable.parishOfficeMorningPref,
        evening: usersTable.parishOfficeEveningPref,
        morningTime: usersTable.parishOfficeMorningTime,
        eveningTime: usersTable.parishOfficeEveningTime,
        showConfession: usersTable.bcpShowConfession,
        defaultPrayerLevel: usersTable.defaultPrayerLevel,
        contemplationGoalMinutes: usersTable.contemplationGoalMinutes,
        contemplationReminderEnabled: usersTable.contemplationReminderEnabled,
        weeklyReviewReminder: usersTable.weeklyReviewReminder,
        notificationStyle: usersTable.notificationStyle,
      })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));

    // Most-recent office or devotion the user has actually prayed,
    // per side. The dashboard's PrayerOfficeCard uses this to put
    // whichever the user last prayed in the *big* CTA, with the
    // other form as the small "or pray the …" link below — matches
    // the muscle memory of "pick up where I left off."
    //
    // Two queries, one per side, each pulling the most recent row
    // from prayer_sessions filtered to that side's two surfaces.
    // Returns "office" | "devotion" | null. Cheap (the index on
    // (user_id, ended_at) covers both queries).
    const lastPrayedSide = async (
      offSurface: "morning-prayer" | "evening-prayer",
      devSurface: "morning-devotion" | "early-evening-devotion",
    ): Promise<"office" | "devotion" | null> => {
      const rows = await db.execute<{ surface: string }>(sql`
        SELECT surface FROM prayer_sessions
        WHERE user_id = ${sessionUserId}
          AND surface IN (${offSurface}, ${devSurface})
        ORDER BY ended_at DESC
        LIMIT 1
      `);
      const last = rows.rows[0]?.surface ?? null;
      if (last === offSurface) return "office";
      if (last === devSurface) return "devotion";
      return null;
    };
    const [lastPrayedMorning, lastPrayedEvening] = await Promise.all([
      lastPrayedSide("morning-prayer", "morning-devotion"),
      lastPrayedSide("evening-prayer", "early-evening-devotion"),
    ]);

    // Office streak — consecutive days the user has prayed *any* of
    // the four office/devotion surfaces. Today not yet prayed
    // doesn't break the streak (we still credit yesterday's count
    // until the day rolls over). Walking the day-set in JS rather
    // than writing a recursive SQL CTE — the set is small (<= 365
    // for a year of dedicated practice) and the round-trip cost is
    // dwarfed by the dashboard render.
    //
    // A >= 3-minute National Cathedral Morning Prayer watch counts as
    // an office day too, so faithfully watching the broadcast keeps
    // the streak alive just like praying an office in-app.
    const [meTz] = await db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    const tz = meTz?.timezone || "UTC";
    const dayRows = await db.execute<{ day: string }>(sql`
      SELECT DISTINCT to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day
      FROM prayer_sessions
      WHERE user_id = ${sessionUserId}
        AND (
          -- Office/devotion counts only when the slideshow was finished
          -- (completed = TRUE); national-cathedral stays an attestation tap.
          (surface IN ('morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion', 'compline') AND completed = TRUE)
          OR (surface = 'national-cathedral' AND duration_seconds >= 180)
        )
    `);
    const officeDaySet = new Set(dayRows.rows.map((r) => r.day));
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const decrementDay = (ymd: string): string => {
      const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - 1);
      return dt.toISOString().slice(0, 10);
    };
    let officeStreak = 0;
    let cursor = todayStr;
    // Today not yet prayed? Drop the cursor to yesterday; the streak
    // is still alive until the day flips with no prayer.
    if (!officeDaySet.has(cursor)) cursor = decrementDay(cursor);
    while (officeDaySet.has(cursor)) {
      officeStreak += 1;
      cursor = decrementDay(cursor);
    }

    res.json({
      // Default daily practice for un-set-up users (null columns): Morning +
      // Evening Devotion at 7:00/6:00pm (owner: reminders on by default), a
      // 5-minute contemplation goal, a Devotion-depth office. An explicit
      // choice (non-null column) still wins.
      morning: u?.morning ?? "devotion",
      evening: u?.evening ?? "devotion",
      morningTime: u?.morningTime ?? "07:00",
      eveningTime: u?.eveningTime ?? "18:00",
      showConfession: u?.showConfession ?? false,
      // "journal" was a retired office depth (its page is gone) — fold any
      // stored value down to a safe Devotion so an old pref can't break the office.
      defaultPrayerLevel: u?.defaultPrayerLevel === "journal" ? "devotion" : (u?.defaultPrayerLevel ?? "devotion"),
      contemplationGoalMinutes: u?.contemplationGoalMinutes ?? 5,
      contemplationReminderEnabled: u?.contemplationReminderEnabled ?? true,
      weeklyReviewReminder: u?.weeklyReviewReminder ?? true,
      notificationStyle: u?.notificationStyle ?? "gentle",
      lastPrayedMorning,
      lastPrayedEvening,
      officeStreak,
    });
  } catch (err) {
    console.error("[office-prefs] GET failed:", err);
    res.status(500).json({ error: "Failed to load office prefs" });
  }
});

router.put("/me/office-prefs", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const body = req.body ?? {};
  const allowedPrefs = new Set(["none", "office", "devotion"]);
  const update: Record<string, unknown> = {};
  if (typeof body.morning === "string" && allowedPrefs.has(body.morning)) {
    update.parishOfficeMorningPref = body.morning;
  }
  if (typeof body.evening === "string" && allowedPrefs.has(body.evening)) {
    update.parishOfficeEveningPref = body.evening;
  }
  if (body.morningTime === null) {
    update.parishOfficeMorningTime = null;
  } else if (typeof body.morningTime === "string" && /^\d{2}:\d{2}$/.test(body.morningTime)) {
    update.parishOfficeMorningTime = body.morningTime;
  }
  if (body.eveningTime === null) {
    update.parishOfficeEveningTime = null;
  } else if (typeof body.eveningTime === "string" && /^\d{2}:\d{2}$/.test(body.eveningTime)) {
    update.parishOfficeEveningTime = body.eveningTime;
  }
  if (typeof body.showConfession === "boolean") {
    update.bcpShowConfession = body.showConfession;
  }
  // Default prayer level — Settings picker. Strict allowlist so an
  // arbitrary string can't be written.
  const allowedLevels = new Set(["ask", "devotion", "office", "intercessions", "reflect-sit"]);
  if (typeof body.defaultPrayerLevel === "string" && allowedLevels.has(body.defaultPrayerLevel)) {
    update.defaultPrayerLevel = body.defaultPrayerLevel;
  }
  // Daily contemplation goal in minutes (0 = off). Clamp to a sane 0–180 so a
  // stray value can't be written; the UI offers 5/10/15/20/30 presets.
  if (typeof body.contemplationGoalMinutes === "number" && Number.isFinite(body.contemplationGoalMinutes)) {
    update.contemplationGoalMinutes = Math.max(0, Math.min(180, Math.round(body.contemplationGoalMinutes)));
  }
  if (typeof body.contemplationReminderEnabled === "boolean") {
    update.contemplationReminderEnabled = body.contemplationReminderEnabled;
  }
  if (typeof body.weeklyReviewReminder === "boolean") {
    update.weeklyReviewReminder = body.weeklyReviewReminder;
  }
  // "gentle" (one reminder per side) vs "nudge" (also send the morning/evening
  // follow-up ~3h later if that side still isn't done). Customizer + Settings.
  if (typeof body.notificationStyle === "string" && (body.notificationStyle === "gentle" || body.notificationStyle === "nudge")) {
    update.notificationStyle = body.notificationStyle;
  }
  if (Object.keys(update).length === 0) { res.json({ ok: true }); return; }
  try {
    await db.update(usersTable).set(update).where(eq(usersTable.id, sessionUserId));
    res.json({ ok: true });
  } catch (err) {
    console.error("[office-prefs] PUT failed:", err);
    res.status(500).json({ error: "Failed to save office prefs" });
  }
});

// ── "Grow my silence" ladder ────────────────────────────────────────────────
// The opt-in guided program: the daily contemplation goal auto-advances 5→30 min
// — a week (7 counted days) per rung; one missed day is forgiven, two misses in
// a row ease back a rung (floor 5). When enabled the ladder DRIVES the user's
// contemplationGoalMinutes (= current level), so the existing Silence card + goal
// nudge just reflect the rung. State lives in users.silence_ladder and is caught
// up lazily on GET (each COMPLETED day since lastEvalDate is scored — today is
// still in progress, so it isn't scored until tomorrow).
type LadderState = { enabled: boolean; level: number; levelDays: number; missStreak: number; lastEvalDate: string };
const LADDER_MIN = 5, LADDER_MAX = 30, LADDER_STEP = 5, LADDER_WEEK = 7;
function ladderYmd(tz: string, d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}
function ladderAddDays(ymd: string, days: number): string {
  const [y, m, dd] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
// Catch the ladder up to "yesterday"; also keeps contemplationGoalMinutes = level.
async function evalLadder(userId: number, tz: string, state: LadderState, todayYmd: string): Promise<LadderState> {
  const yesterday = ladderAddDays(todayYmd, -1);
  if (state.lastEvalDate >= yesterday) return state; // already scored through yesterday
  let fromYmd = ladderAddDays(state.lastEvalDate, 1);
  // Bound a long absence so the loop + scan can't run away.
  if (ladderAddDays(fromYmd, 90) < yesterday) fromYmd = ladderAddDays(yesterday, -90);
  // Apple Health / HealthKit integration was removed (privacy simplification)
  // and contemplation_health_minutes was DROPPED in migrate.ts — this used to
  // also query that table and 500 on every call, silently breaking the
  // Silence Ladder's catch-up eval. In-app contemplation sits (prayer_sessions)
  // are now the sole source.
  const [sitRows] = await Promise.all([
    db.execute<{ day: string; secs: number }>(sql`
      SELECT to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(duration_seconds), 0) AS secs
      FROM prayer_sessions
      WHERE user_id = ${userId} AND surface = 'contemplation'
        AND ended_at >= NOW() - INTERVAL '95 days'
        AND (ended_at AT TIME ZONE ${tz})::date >= ${fromYmd}::date
        AND (ended_at AT TIME ZONE ${tz})::date <= ${yesterday}::date
      GROUP BY 1
    `),
  ]);
  const minByDay = new Map<string, number>();
  for (const r of sitRows.rows) minByDay.set(r.day, Math.floor(Number(r.secs) / 60));

  let { level, levelDays, missStreak } = state;
  for (let day = fromYmd; day <= yesterday; day = ladderAddDays(day, 1)) {
    const mins = minByDay.get(day) ?? 0;
    if (mins >= level) {
      missStreak = 0; // an isolated miss is healed by the next counted day
      levelDays += 1;
      if (levelDays >= LADDER_WEEK) { level = Math.min(LADDER_MAX, level + LADDER_STEP); levelDays = 0; }
    } else {
      missStreak += 1; // one miss forgiven; the second in a row eases back
      if (missStreak >= 2) { level = Math.max(LADDER_MIN, level - LADDER_STEP); levelDays = 0; missStreak = 0; }
    }
  }
  const next: LadderState = { enabled: true, level, levelDays, missStreak, lastEvalDate: yesterday };
  await db.update(usersTable).set({ silenceLadder: next, contemplationGoalMinutes: level }).where(eq(usersTable.id, userId));
  return next;
}

router.get("/me/silence-ladder", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [u] = await db.select({ timezone: usersTable.timezone, silenceLadder: usersTable.silenceLadder }).from(usersTable).where(eq(usersTable.id, sessionUserId));
    const tz = u?.timezone || "UTC";
    const state = (u?.silenceLadder as LadderState | null) ?? null;
    if (!state || !state.enabled) { res.json({ enabled: false }); return; }
    const todayYmd = ladderYmd(tz, new Date());
    const evaled = await evalLadder(sessionUserId, tz, state, todayYmd);
    // Apple Health integration removed — contemplation_health_minutes was
    // dropped in migrate.ts; this query against it 500'd this whole endpoint
    // on every call. In-app sits are now the sole source (see evalLadder).
    const [todaySits] = await Promise.all([
      db.execute<{ secs: number }>(sql`SELECT COALESCE(SUM(duration_seconds),0) AS secs FROM prayer_sessions WHERE user_id = ${sessionUserId} AND surface = 'contemplation' AND (ended_at AT TIME ZONE ${tz})::date = ${todayYmd}::date`),
    ]);
    const todayMinutes = Math.floor(Number(todaySits.rows[0]?.secs ?? 0) / 60);
    res.json({
      enabled: true,
      level: evaled.level,
      levelDays: evaled.levelDays,
      daysToNext: evaled.level >= LADDER_MAX ? 0 : LADDER_WEEK - evaled.levelDays,
      nextLevel: Math.min(LADDER_MAX, evaled.level + LADDER_STEP),
      atMax: evaled.level >= LADDER_MAX,
      todayMinutes,
      todayMet: todayMinutes >= evaled.level,
    });
  } catch (err) {
    console.error("[silence-ladder] GET failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.put("/me/silence-ladder", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const enabled = (req.body as { enabled?: unknown })?.enabled === true;
  try {
    const [u] = await db.select({ timezone: usersTable.timezone, silenceLadder: usersTable.silenceLadder }).from(usersTable).where(eq(usersTable.id, sessionUserId));
    const tz = u?.timezone || "UTC";
    const prev = (u?.silenceLadder as LadderState | null) ?? null;
    const todayYmd = ladderYmd(tz, new Date());
    if (!enabled) {
      const next: LadderState = prev ? { ...prev, enabled: false } : { enabled: false, level: LADDER_MIN, levelDays: 0, missStreak: 0, lastEvalDate: todayYmd };
      await db.update(usersTable).set({ silenceLadder: next }).where(eq(usersTable.id, sessionUserId));
      res.json({ ok: true, enabled: false });
      return;
    }
    // Enable: resume from the saved rung (or start at 5). lastEvalDate =
    // YESTERDAY so the day they turn it on still gets scored once it completes
    // (tomorrow's catch-up scores today). Setting it to today skipped the
    // enable day entirely — "I kept it 2 days but it still says 7" — because
    // that day was never counted.
    const level = prev && prev.level >= LADDER_MIN && prev.level <= LADDER_MAX ? prev.level : LADDER_MIN;
    const next: LadderState = { enabled: true, level, levelDays: prev?.levelDays ?? 0, missStreak: 0, lastEvalDate: ladderAddDays(todayYmd, -1) };
    await db.update(usersTable).set({ silenceLadder: next, contemplationGoalMinutes: level }).where(eq(usersTable.id, sessionUserId));
    res.json({ ok: true, enabled: true, level });
  } catch (err) {
    console.error("[silence-ladder] PUT failed:", err);
    res.status(500).json({ error: "internal_error" });
  }
});

// GET /me/office-history-week — past 7 days (today inclusive) of
// office/devotion completions for the current user, broken down by
// side (morning / evening). Drives the "Your prayer rhythm" habit
// slide so it reflects sessions logged on any device, not just the
// localStorage flags from this browser. Day strings are user-tz
// YYYY-MM-DD; today sits at index 6 (last).
router.get("/me/office-history-week", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [meTz] = await db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    const tz = meTz?.timezone || "UTC";
    // One row per (day, side). The CASE collapses the four surfaces
    // into "morning" or "evening"; DISTINCT folds duplicate sessions
    // for the same side on the same day into one.
    // Watching National Cathedral Morning Prayer for >= 3 min counts as
    // a morning office here (the "national-cathedral" surface, gated on
    // duration so a quick tap-away doesn't light up the rhythm grid).
    // It maps to the 'morning' side in the CASE below; the duration
    // gate lives in the WHERE so the CASE can stay surface-only.
    const rows = await db.execute<{ day: string; side: string; surface: string }>(sql`
      SELECT DISTINCT
        to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
        CASE
          WHEN surface IN ('morning-prayer', 'morning-devotion', 'national-cathedral', 'morning-office-podcast') THEN 'morning'
          WHEN surface IN ('evening-prayer', 'early-evening-devotion', 'evening-office-podcast') THEN 'evening'
          -- Compline is its OWN side, never folded into 'evening'. It can be
          -- either the evening ANCHOR (a user whose evening BCP form is
          -- Compline) or a standalone add-on card alongside Evening Prayer —
          -- only the client knows which. Reporting it separately lets the
          -- client credit the right thing; folding it into 'evening' here
          -- would tick Evening Prayer for every add-on user.
          WHEN surface = 'compline' THEN 'compline'
        END AS side,
        -- The RAW surface too, alongside the folded side. Reported: a
        -- secondary practice (a devotion alongside a Morning Prayer anchor)
        -- logged correctly on the phone but read back on web as the ANCHOR
        -- being done — because this endpoint only ever reported "was ANY
        -- known surface logged for this side", which a side's SECOND
        -- practice satisfies just as well as its anchor does. The folded
        -- boolean stays (the weekly grid only wants "something happened"),
        -- but useRhythmState now also gets the specific surface(s) so it can
        -- tell anchor-done from extra-done, the same distinction
        -- anchorModesFor/extraModesFor already draw from the LOCAL flags.
        surface
      FROM prayer_sessions
      WHERE user_id = ${sessionUserId}
        AND (
          -- The office/devotion only counts once the slideshow is finished
          -- (closing Amen/Done or the book attestation set completed=TRUE).
          -- A partial sit that auto-commits on unmount has completed=FALSE.
          (surface IN ('morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion', 'compline') AND completed = TRUE)
          OR (surface = 'national-cathedral' AND duration_seconds >= 180)
          -- Listening to the read-aloud office podcast counts once the listener
          -- crosses 60% — the client posts that row with completed = TRUE.
          OR (surface IN ('morning-office-podcast', 'evening-office-podcast') AND completed = TRUE)
        )
        AND ended_at >= NOW() - INTERVAL '8 days'
    `);
    const byDay = new Map<string, { morning: boolean; evening: boolean; compline: boolean; surfaces: string[] }>();
    for (const r of rows.rows) {
      const slot = byDay.get(r.day) ?? { morning: false, evening: false, compline: false, surfaces: [] };
      if (r.side === "morning") slot.morning = true;
      if (r.side === "evening") slot.evening = true;
      if (r.side === "compline") slot.compline = true;
      if (r.surface && !slot.surfaces.includes(r.surface)) slot.surfaces.push(r.surface);
      byDay.set(r.day, slot);
    }
    // Build the 7-day window in user-tz, oldest first.
    const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const [ty, tm, td] = todayYmd.split("-").map((n) => parseInt(n, 10));
    const days: { ymd: string; morning: boolean; evening: boolean; compline: boolean; surfaces: string[] }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.UTC(ty, tm - 1, td));
      dt.setUTCDate(dt.getUTCDate() - i);
      const ymd = dt.toISOString().slice(0, 10);
      const slot = byDay.get(ymd) ?? { morning: false, evening: false, compline: false, surfaces: [] };
      days.push({ ymd, morning: slot.morning, evening: slot.evening, compline: slot.compline, surfaces: slot.surfaces });
    }
    res.json({ days });
  } catch (err) {
    console.error("[office-history-week] failed:", err);
    res.status(500).json({ error: "Failed to load office history" });
  }
});

// GET /me/practice-week — the last 7 days (today inclusive), and for each day
// which of the trackable practices the user completed. Drives the weekly
// practice grid on Daily Progress (one row per practice the user keeps, seven
// dots across). One unified matrix so the card doesn't have to stitch four
// endpoints together client-side. Day strings are user-tz YYYY-MM-DD; today
// sits at index 6 (last). Per-practice keys:
//   morning / evening — a finished office on that side (same gate as
//     office-history-week: completed office/devotion, or >=3 min of the
//     National Cathedral morning stream).
//   contemplation     — the day's total contemplative time (in-app sits +
//     external Apple Health mindful minutes) meets the user's daily goal. With
//     no goal set, any logged minute fills the day.
//   reflection        — opened the day's reflection (CAC, Forward, or SSJE).
//   gratitude / examen — the optional practices, from practice_completion.
// The CLIENT decides which rows to render from the user's rule of life; the
// server just reports completion for every practice it can see.
router.get("/me/practice-week", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [meTz] = await db
      .select({
        timezone: usersTable.timezone,
        contemplationGoalMinutes: usersTable.contemplationGoalMinutes,
        // Needed to tell a side's ANCHOR from a practice riding alongside it —
        // see the devotion note where the office rows are folded up.
        ruleConfig: usersTable.ruleConfig,
      })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    // usersTable.timezone has no writer anywhere in the codebase — nothing
    // sets it at registration or afterward, so it's NULL for most accounts
    // and every "|| UTC" fallback across the app (this route included)
    // silently buckets days in UTC instead of the user's actual zone. For a
    // US-based user that shifts anything done in the evening (after ~8pm ET)
    // into the NEXT UTC calendar day — exactly the "yesterday's evening
    // practices don't show" symptom this route was built to report on. The
    // client already resolves its own IANA zone (Intl.DateTimeFormat) for
    // this exact call but was never sending it — accept it here, prefer it
    // over the (likely absent) stored value, and opportunistically persist
    // it so every OTHER endpoint reading usersTable.timezone benefits too,
    // not just this one grid.
    const clientTz = typeof req.query.tz === "string" ? req.query.tz : null;
    const clientTzValid = (() => {
      if (!clientTz) return false;
      try { new Intl.DateTimeFormat("en-CA", { timeZone: clientTz }); return true; }
      catch { return false; }
    })();
    const tz = (clientTzValid ? clientTz : null) || meTz?.timezone || "UTC";
    if (clientTzValid && clientTz !== meTz?.timezone) {
      // Best-effort — a failed write here shouldn't break the response,
      // since `tz` above already has the correct value for THIS request
      // regardless of whether the persist succeeds.
      db.update(usersTable).set({ timezone: clientTz }).where(eq(usersTable.id, sessionUserId))
        .catch((err) => console.error("[practice-week] timezone backfill failed:", err));
    }
    // Daily contemplation goal (minutes; 0 = none). The weekly grid only fills
    // a day's contemplation dot once the day's total contemplative time meets
    // this goal — not on any logged minute. With no goal set, any sit counts.
    const contemplationGoalMin = meTz?.contemplationGoalMinutes ?? 0;

    // Build the 7-day window in user-tz, oldest first, up front — we need the
    // oldest ymd to bound the text-keyed (YYYY-MM-DD) tables below.
    const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const [ty, tm, td] = todayYmd.split("-").map((n) => parseInt(n, 10));
    const ymds: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.UTC(ty, tm - 1, td));
      dt.setUTCDate(dt.getUTCDate() - i);
      ymds.push(dt.toISOString().slice(0, 10));
    }
    const oldestYmd = ymds[0];

    // Each query returns the set of local days a practice was completed.
    // NOTE: this used to also query contemplation_health_minutes (Apple
    // Health mindful minutes) — that table was DROPPED in migrate.ts when
    // HealthKit integration was removed for privacy, but this route was
    // never updated, so the whole endpoint has been throwing a 500 on
    // every call since. In-app contemplation sits (prayer_sessions) are
    // now the sole source of contemplative minutes.
    const [officeRows, contRows, reflRows, cacRows, pcRows, breathRows, vtsRows] = await Promise.all([
      // Office, by side — same surfaces + completed gate as office-history-week.
      db.execute<{ day: string; side: string; surface: string }>(sql`
        SELECT DISTINCT
          to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
          CASE
            WHEN surface IN ('morning-prayer', 'morning-devotion', 'national-cathedral') THEN 'morning'
            WHEN surface IN ('evening-prayer', 'early-evening-devotion') THEN 'evening'
            -- Its own side, never folded into 'evening' — see office-history-week.
            WHEN surface = 'compline' THEN 'compline'
          END AS side,
          surface
        FROM prayer_sessions
        WHERE user_id = ${sessionUserId}
          AND (
            (surface IN ('morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion', 'compline') AND completed = TRUE)
            OR (surface = 'national-cathedral' AND duration_seconds >= 180)
          )
          AND ended_at >= NOW() - INTERVAL '8 days'
      `),
      // Contemplation sits logged in-app — summed per local day so we can
      // measure each day's total against the daily goal (not just presence).
      db.execute<{ day: string; secs: number }>(sql`
        SELECT to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(duration_seconds), 0) AS secs
        FROM prayer_sessions
        WHERE user_id = ${sessionUserId}
          AND surface = 'contemplation'
          AND ended_at >= NOW() - INTERVAL '8 days'
        GROUP BY 1
      `),
      // Reflection reads — Forward / SSJE.
      db.execute<{ ymd: string }>(sql`
        SELECT DISTINCT ymd FROM reflection_reads
        WHERE user_id = ${sessionUserId} AND source IN ('fdd', 'ssje') AND ymd >= ${oldestYmd}
      `),
      // CAC reads — its own table.
      db.execute<{ ymd: string }>(sql`
        SELECT DISTINCT ymd FROM cac_reads
        WHERE user_id = ${sessionUserId} AND ymd >= ${oldestYmd}
      `),
      // Optional practices.
      db.execute<{ section: string; local_date: string }>(sql`
        SELECT DISTINCT section, local_date FROM practice_completion
        WHERE user_id = ${sessionUserId} AND section IN ('examen', 'listening', 'reading', 'podcasts', 'walk', 'prayer-list') AND local_date >= ${oldestYmd}
      `),
      // Co-Breathe sits live in breath_sessions (one row per local day), not
      // practice_completion, so they need their own pull to fill the grid row.
      db.execute<{ day: string }>(sql`
        SELECT DISTINCT day FROM breath_sessions
        WHERE user_id = ${sessionUserId} AND day >= ${oldestYmd}
      `),
      // VTS reflection reads — kept separate from the collapsed `reflection`
      // set above (which is deliberately fdd/ssje/cac only) so the VTS
      // weekly-progress card can report specifically on the Dean's
      // Commentary, not "any reflection."
      db.execute<{ ymd: string }>(sql`
        SELECT DISTINCT ymd FROM reflection_reads
        WHERE user_id = ${sessionUserId} AND source = 'vts' AND ymd >= ${oldestYmd}
      `),
    ]);

    /**
     * A side's dot belongs to that side's ANCHOR.
     *
     * Owner: "the main thing they chose is the anchor, which goes in their
     * weekly practice, and the devotion would show up as an additional
     * practice that is not their anchor."
     *
     * The SQL folds morning-prayer and morning-devotion into one 'morning'
     * bucket, which was right while a side could hold only one of them. Now
     * that a devotion can ride alongside the office, that fold would let a
     * two-minute devotion fill Morning Prayer's weekly dot. So the devotion
     * surface counts for the anchor only when the devotion IS the anchor.
     * Mirrors anchorModesFor() on the client, which does the same for today.
     */
    const rcValues = ((meTz?.ruleConfig as { values?: Record<string, string> } | null)?.values) ?? {};
    const DEVOTION_SURFACE: Record<string, string> = {
      morning: "morning-devotion",
      evening: "early-evening-devotion",
    };
    /**
     * The devotion SURFACE is shared by most non-office practices.
     *
     * Psalms, Simple Guided Prayer, the day's Readings, Forward Day by Day and
     * a custom practice all POST surface "morning-devotion" — it's the bucket
     * every older rollup already agreed on, not a claim that the person prays
     * the short devotion. The shipped DEFAULT rule is guided-prayer in the
     * morning and readings in the evening, so both default sides log there.
     *
     * An earlier version of this filter only accepted that surface when the
     * level was literally "devotion", which silently emptied the Morning and
     * Evening rows of the weekly grid for every user on the default rule.
     *
     * So the exclusion is narrow, and covers only the case it was written for:
     * when the anchor is the FULL OFFICE, a devotion prayed alongside it is an
     * additional practice and must not fill the office's dot. Every other
     * level owns that surface.
     */
    const countsForAnchor = (side: "morning" | "evening", surface: string): boolean => {
      if (surface !== DEVOTION_SURFACE[side]) return true;
      return rcValues[`phoebe:office:level:${side}`] !== "office";
    };

    const morning = new Set<string>();
    const evening = new Set<string>();
    const compline = new Set<string>();
    /**
     * …and the SECOND practice's own days — the exact inverse of the test
     * above. countsForAnchor is false only for a devotion-surface row prayed
     * on a side whose anchor is the full office, which is precisely what an
     * additional practice is. The anchor rows already refuse to count it; it
     * simply had nowhere else to go, so a second practice showed a card on the
     * home and no row in the weekly grid at all.
     */
    const morningExtra = new Set<string>();
    const eveningExtra = new Set<string>();
    for (const r of officeRows.rows) {
      if (r.side === "morning") {
        if (countsForAnchor("morning", r.surface)) morning.add(r.day);
        else morningExtra.add(r.day);
      }
      if (r.side === "evening") {
        if (countsForAnchor("evening", r.surface)) evening.add(r.day);
        else eveningExtra.add(r.day);
      }
      if (r.side === "compline") compline.add(r.day);
    }
    // Total contemplative minutes per local day (in-app sits only — Apple
    // Health integration was removed, see the note above), then fill the day
    // only when it meets the daily goal. No goal set → any logged minute
    // counts, preserving the old behaviour for goal-less users.
    const contemplationMinByDay = new Map<string, number>();
    for (const r of contRows.rows) {
      contemplationMinByDay.set(r.day, (contemplationMinByDay.get(r.day) ?? 0) + (Number(r.secs) || 0) / 60);
    }
    /**
     * Each day is judged against the goal that was in force ON THAT DAY.
     *
     * Both of the owner's rules hold together this way. A day short of its own
     * goal stays half-shaded when it rolls into the past — and raising the goal
     * from 20 to 45 no longer reaches back and un-keeps a fortnight of days
     * that genuinely met 20. Judging history by today's rule let the app
     * rewrite someone's past to say they'd fallen short of something that
     * didn't exist yet.
     *
     * Today's goal is recorded here, on read, rather than at the five places
     * that write users.contemplation_goal_minutes — one read-side choke point
     * can't be forgotten by the sixth writer.
     */
    try {
      await db
        .insert(contemplationGoalHistoryTable)
        .values({ userId: sessionUserId, ymd: todayYmd, goalMinutes: contemplationGoalMin })
        .onConflictDoUpdate({
          target: [contemplationGoalHistoryTable.userId, contemplationGoalHistoryTable.ymd],
          set: { goalMinutes: contemplationGoalMin },
        });
    } catch (err) {
      // Never fail the weekly grid over its own bookkeeping.
      console.warn("[practice-week] goal-history write failed:", err);
    }

    // Bounded: the window plus a small run-up. This table gains a row per user
    // per day forever, and goalOn() scans it per day — unbounded, a long-lived
    // account would load thousands of rows on every home view. The rows OLDER
    // than the window still matter (they carry the goal in force before it), so
    // take a slice rather than only the seven days, and fall back to the
    // earliest row we did load.
    const goalHistory = await db
      .select({
        ymd: contemplationGoalHistoryTable.ymd,
        goalMinutes: contemplationGoalHistoryTable.goalMinutes,
      })
      .from(contemplationGoalHistoryTable)
      .where(eq(contemplationGoalHistoryTable.userId, sessionUserId))
      .orderBy(desc(contemplationGoalHistoryTable.ymd))
      .limit(60);
    goalHistory.sort((a, b) => (a.ymd < b.ymd ? -1 : a.ymd > b.ymd ? 1 : 0));

    // The goal in force on `day`: the most recent record dated on or before it.
    // For days BEFORE we started recording, use the earliest record rather than
    // today's goal — those days were kept under some older rule we never saw,
    // and the current one is the least likely candidate.
    const goalOn = (day: string): number => {
      if (goalHistory.length === 0) return contemplationGoalMin;
      let g = goalHistory[0]!.goalMinutes;
      for (const row of goalHistory) {
        if (row.ymd > day) break;
        g = row.goalMinutes;
      }
      return g;
    };

    const contemplation = new Set<string>();
    const contemplationPartial = new Set<string>();
    for (const [day, mins] of contemplationMinByDay) {
      const dayGoal = goalOn(day);
      const met = dayGoal > 0 ? mins >= dayGoal : mins > 0;
      if (met) contemplation.add(day);
      else if (mins > 0) contemplationPartial.add(day);
    }
    const reflection = new Set<string>();
    for (const r of reflRows.rows) reflection.add(r.ymd);
    for (const r of cacRows.rows) reflection.add(r.ymd);
    const examen = new Set<string>();
    const listening = new Set<string>();
    const reading = new Set<string>();
    const podcasts = new Set<string>();
    const walk = new Set<string>();
    const prayerList = new Set<string>();
    for (const r of pcRows.rows) {
      if (r.section === "examen") examen.add(r.local_date);
      if (r.section === "listening") listening.add(r.local_date);
      if (r.section === "reading") reading.add(r.local_date);
      if (r.section === "podcasts") podcasts.add(r.local_date);
      if (r.section === "walk") walk.add(r.local_date);
      if (r.section === "prayer-list") prayerList.add(r.local_date);
    }
    const cobreathe = new Set<string>();
    for (const r of breathRows.rows) cobreathe.add(r.day);
    const vts = new Set<string>();
    for (const r of vtsRows.rows) vts.add(r.ymd);
    const days = ymds.map((ymd) => ({
      ymd,
      morning: morning.has(ymd),
      evening: evening.has(ymd),
      morningExtra: morningExtra.has(ymd),
      eveningExtra: eveningExtra.has(ymd),
      compline: compline.has(ymd),
      contemplation: contemplation.has(ymd),
      // "Started but short of the goal" — the weekly grid's half-shaded dot,
      // now honored for past days too, not just today.
      contemplationPartial: contemplationPartial.has(ymd),
      reflection: reflection.has(ymd),
      listening: listening.has(ymd),
      examen: examen.has(ymd),
      reading: reading.has(ymd),
      podcasts: podcasts.has(ymd),
      walk: walk.has(ymd),
      cobreathe: cobreathe.has(ymd),
      prayerList: prayerList.has(ymd),
      vts: vts.has(ymd),
    }));
    res.json({ days });
  } catch (err) {
    console.error("[practice-week] failed:", err);
    res.status(500).json({ error: "Failed to load practice week" });
  }
});

// GET /me/yesterday-order — the order (earliest first) in which the user's
// optional/anytime practices were actually completed YESTERDAY (user-tz),
// keyed to match DailyProgressBody's card `key`s. Drives the Next list's
// middle group (the anytime/midday/afternoon-slotted cards, sandwiched
// between the fixed morning and evening anchors): the client re-sorts that
// group to echo yesterday's real order instead of a fixed feature order.
// Only practices with a real per-completion timestamp are reportable —
// novenas and custom anchors are tracked by DAY only (no time-of-day), so
// they're simply absent here; the client leaves those at the end of the
// group, same as any other practice that wasn't done yesterday at all.
router.get("/me/yesterday-order", async (req, res): Promise<void> => {
  const sessionUserId = req.user ? (req.user as { id: number }).id : null;
  if (!sessionUserId) { res.status(401).json({ error: "Unauthorized" }); return; }
  try {
    const [meTz] = await db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    const tz = meTz?.timezone || "UTC";
    const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const [ty, tm, td] = todayYmd.split("-").map((n) => parseInt(n, 10));
    const yDate = new Date(Date.UTC(ty, tm - 1, td));
    yDate.setUTCDate(yDate.getUTCDate() - 1);
    const yesterdayYmd = yDate.toISOString().slice(0, 10);

    const [officeRows, contRows, sideContRows, reflectRows, breathRows, pcRows] = await Promise.all([
      // The office anchors — owner: "there should be endpoints in that when
      // they're completed... so you know when they're completed." They ARE
      // recorded (prayer_sessions, completed = TRUE, with ended_at), so they
      // rank like everything else rather than being the one thing that can't.
      //
      // Surface→side and the completed/duration gates are copied verbatim from
      // the office-history query above — that's the authoritative definition of
      // "the office counts", and a second, looser one here would credit a
      // partial sit the rest of the app treats as unprayed. Compline stays its
      // OWN side for the same reason it does there: folding it into 'evening'
      // would rank Evening Prayer off a Compline-only night.
      db.execute<{ side: string; at: string }>(sql`
        SELECT
          CASE
            WHEN surface IN ('morning-prayer', 'morning-devotion', 'national-cathedral', 'morning-office-podcast') THEN 'morning'
            WHEN surface IN ('evening-prayer', 'early-evening-devotion', 'evening-office-podcast') THEN 'evening'
            WHEN surface = 'compline' THEN 'compline'
          END AS side,
          MIN(ended_at) AS at
        FROM prayer_sessions
        WHERE user_id = ${sessionUserId}
          AND (
            (surface IN ('morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion', 'compline') AND completed = TRUE)
            OR (surface = 'national-cathedral' AND duration_seconds >= 180)
            OR (surface IN ('morning-office-podcast', 'evening-office-podcast') AND completed = TRUE)
          )
          AND (ended_at AT TIME ZONE ${tz})::date = ${yesterdayYmd}::date
        GROUP BY 1
      `),
      // The "Contemplation" (silence) anytime card — earliest sit yesterday.
      // Only the SIDELESS sits: a per-side sit belongs to its own card below,
      // and counting it here too would rank both cards off the same moment.
      db.execute<{ at: string }>(sql`
        SELECT MIN(ended_at) AS at FROM prayer_sessions
        WHERE user_id = ${sessionUserId} AND surface = 'contemplation'
          AND contemplation_side IS NULL
          AND (ended_at AT TIME ZONE ${tz})::date = ${yesterdayYmd}::date
      `),
      // Per-side Contemplative Prayer — the morning/evening Contemplation
      // cards complete independently, so each ranks off its own earliest sit.
      db.execute<{ side: string; at: string }>(sql`
        SELECT contemplation_side AS side, MIN(ended_at) AS at FROM prayer_sessions
        WHERE user_id = ${sessionUserId} AND surface = 'contemplation'
          AND contemplation_side IN ('morning', 'evening')
          AND (ended_at AT TIME ZONE ${tz})::date = ${yesterdayYmd}::date
        GROUP BY contemplation_side
      `),
      // Daily reflections (Dean's Commentary, Forward Day by Day, SSJE …).
      // Owner: "I'll do contemplation first and then Dean's Commentary, and
      // they show up 2nd and 4th the next day." Reflections were absent from
      // this feed entirely, so their cards could never be ranked. One row per
      // (user, source, day) inserted on the FIRST read, so created_at is
      // exactly when they opened it.
      db.execute<{ source: string; at: string }>(sql`
        SELECT source, MIN(created_at) AS at FROM reflection_reads
        WHERE user_id = ${sessionUserId} AND ymd = ${yesterdayYmd}
        GROUP BY source
      `),
      // Co-Breathe — one row per local day already.
      db.execute<{ at: string }>(sql`
        SELECT created_at AS at FROM breath_sessions
        WHERE user_id = ${sessionUserId} AND day = ${yesterdayYmd}
        LIMIT 1
      `),
      // Audio Divina / Reading / Podcasts / Contemplative Walk.
      db.execute<{ section: string; at: string }>(sql`
        SELECT section, MIN(created_at) AS at FROM practice_completion
        WHERE user_id = ${sessionUserId} AND section IN ('listening', 'reading', 'podcasts', 'walk')
          AND local_date = ${yesterdayYmd}
        GROUP BY section
      `),
    ]);

    // Keys MUST match DailyProgressBody's card `key`s exactly — that map lookup
    // is the whole mechanism, and a key that doesn't match simply ranks
    // Infinity and sorts last, silently.
    const entries: Array<{ key: string; at: string }> = [];
    // 'morning' | 'evening' | 'compline' are already the card keys verbatim.
    for (const r of officeRows.rows) {
      if (r.at && r.side) entries.push({ key: r.side, at: r.at });
    }
    if (contRows.rows[0]?.at) entries.push({ key: "silence", at: contRows.rows[0].at });
    if (breathRows.rows[0]?.at) entries.push({ key: "cobreathe", at: breathRows.rows[0].at });
    for (const r of sideContRows.rows) {
      if (r.at && r.side) entries.push({ key: `contemplation-${r.side}`, at: r.at });
    }
    for (const r of reflectRows.rows) {
      if (r.at && r.source) entries.push({ key: `reflect-${r.source}`, at: r.at });
    }
    for (const r of pcRows.rows) {
      if (r.at) entries.push({ key: r.section, at: r.at });
    }
    entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    res.json({ order: entries.map((e) => e.key) });
  } catch (err) {
    console.error("[yesterday-order] failed:", err);
    res.status(500).json({ error: "Failed to load yesterday's order" });
  }
});

export default router;
