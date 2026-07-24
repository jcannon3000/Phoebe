import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
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
          (surface IN ('morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion') AND completed = TRUE)
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
  const [sitRows, healthRows] = await Promise.all([
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
    db.execute<{ day: string; minutes: number }>(sql`
      SELECT day, COALESCE(SUM(minutes), 0) AS minutes FROM contemplation_health_minutes
      WHERE user_id = ${userId} AND minutes > 0 AND day >= ${fromYmd} AND day <= ${yesterday}
      GROUP BY day
    `),
  ]);
  const minByDay = new Map<string, number>();
  for (const r of sitRows.rows) minByDay.set(r.day, Math.floor(Number(r.secs) / 60));
  for (const r of healthRows.rows) minByDay.set(r.day, (minByDay.get(r.day) ?? 0) + Number(r.minutes));

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
    const [todaySits, todayHealth] = await Promise.all([
      db.execute<{ secs: number }>(sql`SELECT COALESCE(SUM(duration_seconds),0) AS secs FROM prayer_sessions WHERE user_id = ${sessionUserId} AND surface = 'contemplation' AND (ended_at AT TIME ZONE ${tz})::date = ${todayYmd}::date`),
      db.execute<{ minutes: number }>(sql`SELECT COALESCE(SUM(minutes),0) AS minutes FROM contemplation_health_minutes WHERE user_id = ${sessionUserId} AND day = ${todayYmd}`),
    ]);
    const todayMinutes = Math.floor(Number(todaySits.rows[0]?.secs ?? 0) / 60) + Number(todayHealth.rows[0]?.minutes ?? 0);
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
    const rows = await db.execute<{ day: string; side: string }>(sql`
      SELECT DISTINCT
        to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
        CASE
          WHEN surface IN ('morning-prayer', 'morning-devotion', 'national-cathedral', 'morning-office-podcast') THEN 'morning'
          WHEN surface IN ('evening-prayer', 'early-evening-devotion', 'evening-office-podcast') THEN 'evening'
        END AS side
      FROM prayer_sessions
      WHERE user_id = ${sessionUserId}
        AND (
          -- The office/devotion only counts once the slideshow is finished
          -- (closing Amen/Done or the book attestation set completed=TRUE).
          -- A partial sit that auto-commits on unmount has completed=FALSE.
          (surface IN ('morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion') AND completed = TRUE)
          OR (surface = 'national-cathedral' AND duration_seconds >= 180)
          -- Listening to the read-aloud office podcast counts once the listener
          -- crosses 60% — the client posts that row with completed = TRUE.
          OR (surface IN ('morning-office-podcast', 'evening-office-podcast') AND completed = TRUE)
        )
        AND ended_at >= NOW() - INTERVAL '8 days'
    `);
    const byDay = new Map<string, { morning: boolean; evening: boolean }>();
    for (const r of rows.rows) {
      const slot = byDay.get(r.day) ?? { morning: false, evening: false };
      if (r.side === "morning") slot.morning = true;
      if (r.side === "evening") slot.evening = true;
      byDay.set(r.day, slot);
    }
    // Build the 7-day window in user-tz, oldest first.
    const todayYmd = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const [ty, tm, td] = todayYmd.split("-").map((n) => parseInt(n, 10));
    const days: { ymd: string; morning: boolean; evening: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date(Date.UTC(ty, tm - 1, td));
      dt.setUTCDate(dt.getUTCDate() - i);
      const ymd = dt.toISOString().slice(0, 10);
      const slot = byDay.get(ymd) ?? { morning: false, evening: false };
      days.push({ ymd, morning: slot.morning, evening: slot.evening });
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
      .select({ timezone: usersTable.timezone, contemplationGoalMinutes: usersTable.contemplationGoalMinutes })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUserId));
    const tz = meTz?.timezone || "UTC";
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
    const [officeRows, contRows, healthRows, reflRows, cacRows, pcRows, breathRows] = await Promise.all([
      // Office, by side — same surfaces + completed gate as office-history-week.
      db.execute<{ day: string; side: string }>(sql`
        SELECT DISTINCT
          to_char((ended_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
          CASE
            WHEN surface IN ('morning-prayer', 'morning-devotion', 'national-cathedral') THEN 'morning'
            WHEN surface IN ('evening-prayer', 'early-evening-devotion') THEN 'evening'
          END AS side
        FROM prayer_sessions
        WHERE user_id = ${sessionUserId}
          AND (
            (surface IN ('morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion') AND completed = TRUE)
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
      // External Apple Health mindful minutes (day is already a tz-local ymd),
      // summed per day to fold into the day's contemplative total.
      db.execute<{ day: string; minutes: number }>(sql`
        SELECT day, COALESCE(SUM(minutes), 0) AS minutes FROM contemplation_health_minutes
        WHERE user_id = ${sessionUserId} AND minutes > 0 AND day >= ${oldestYmd}
        GROUP BY day
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
        WHERE user_id = ${sessionUserId} AND section IN ('examen', 'guided-prayer', 'listening', 'reading', 'podcasts', 'walk', 'prayer-list') AND local_date >= ${oldestYmd}
      `),
      // Co-Breathe sits live in breath_sessions (one row per local day), not
      // practice_completion, so they need their own pull to fill the grid row.
      db.execute<{ day: string }>(sql`
        SELECT DISTINCT day FROM breath_sessions
        WHERE user_id = ${sessionUserId} AND day >= ${oldestYmd}
      `),
    ]);

    const morning = new Set<string>();
    const evening = new Set<string>();
    for (const r of officeRows.rows) {
      if (r.side === "morning") morning.add(r.day);
      if (r.side === "evening") evening.add(r.day);
    }
    // Total contemplative minutes per local day (in-app sits + Apple Health),
    // then fill the day only when it meets the daily goal. No goal set → any
    // logged minute counts, preserving the old behaviour for goal-less users.
    const contemplationMinByDay = new Map<string, number>();
    for (const r of contRows.rows) {
      contemplationMinByDay.set(r.day, (contemplationMinByDay.get(r.day) ?? 0) + (Number(r.secs) || 0) / 60);
    }
    for (const r of healthRows.rows) {
      contemplationMinByDay.set(r.day, (contemplationMinByDay.get(r.day) ?? 0) + (Number(r.minutes) || 0));
    }
    const contemplation = new Set<string>();
    for (const [day, mins] of contemplationMinByDay) {
      // TODAY reflects the CURRENT goal (so the dot tracks today's progress).
      // PAST days are never re-judged against a goal you raised later — a day
      // you already sat stands as kept, even if it wouldn't meet today's higher
      // goal. (We don't store the goal that was in effect on each past day, so
      // "any sit that day" is the stable, non-retroactive rule.)
      const met = day === todayYmd
        ? (contemplationGoalMin > 0 ? mins >= contemplationGoalMin : mins > 0)
        : mins > 0;
      if (met) contemplation.add(day);
    }
    const reflection = new Set<string>();
    for (const r of reflRows.rows) reflection.add(r.ymd);
    for (const r of cacRows.rows) reflection.add(r.ymd);
    const examen = new Set<string>();
    const guidedPrayer = new Set<string>();
    const listening = new Set<string>();
    const reading = new Set<string>();
    const podcasts = new Set<string>();
    const walk = new Set<string>();
    const prayerList = new Set<string>();
    for (const r of pcRows.rows) {
      if (r.section === "examen") examen.add(r.local_date);
      if (r.section === "guided-prayer") guidedPrayer.add(r.local_date);
      if (r.section === "listening") listening.add(r.local_date);
      if (r.section === "reading") reading.add(r.local_date);
      if (r.section === "podcasts") podcasts.add(r.local_date);
      if (r.section === "walk") walk.add(r.local_date);
      if (r.section === "prayer-list") prayerList.add(r.local_date);
    }
    const cobreathe = new Set<string>();
    for (const r of breathRows.rows) cobreathe.add(r.day);
    const days = ymds.map((ymd) => ({
      ymd,
      morning: morning.has(ymd),
      evening: evening.has(ymd),
      contemplation: contemplation.has(ymd),
      reflection: reflection.has(ymd),
      listening: listening.has(ymd),
      examen: examen.has(ymd),
      guidedPrayer: guidedPrayer.has(ymd),
      reading: reading.has(ymd),
      podcasts: podcasts.has(ymd),
      walk: walk.has(ymd),
      cobreathe: cobreathe.has(ymd),
      prayerList: prayerList.has(ymd),
    }));
    res.json({ days });
  } catch (err) {
    console.error("[practice-week] failed:", err);
    res.status(500).json({ error: "Failed to load practice week" });
  }
});

export default router;
