import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  groupMembersTable,
  momentUserTokensTable,
  momentPostsTable,
  lettersTable,
  letterDraftsTable,
  correspondenceMembersTable,
} from "@workspace/db";
import { revokeGoogleTokensFor } from "../lib/googleOauthRevoke";
import { exportUserData } from "../lib/userDataExport";
import { normalizePhone, hashPhone } from "../lib/phone";

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
    // 1) Remove every group_members row for this user — BOTH rows with
    //    a user_id FK (already joined) AND rows identified only by
    //    email (invited but never joined).
    await db.delete(groupMembersTable).where(
      sql`${groupMembersTable.userId} = ${user.id} OR LOWER(${groupMembersTable.email}) = ${emailLower}`,
    );

    // 2) Find every moment_user_tokens row for this user, then delete
    //    the posts keyed off those tokens before dropping the tokens
    //    themselves. Order matters because moment_posts has no FK to
    //    moment_user_tokens — the token is a string.
    const participantRows = await db
      .select({ userToken: momentUserTokensTable.userToken })
      .from(momentUserTokensTable)
      .where(sql`LOWER(${momentUserTokensTable.email}) = ${emailLower}`);
    const userTokens = participantRows.map(r => r.userToken);
    if (userTokens.length > 0) {
      await db.delete(momentPostsTable).where(inArray(momentPostsTable.userToken, userTokens));
    }
    await db.delete(momentUserTokensTable)
      .where(sql`LOWER(${momentUserTokensTable.email}) = ${emailLower}`);

    // 3) Letters (privacy audit #3 + DB audit #4). letters.author_user_id
    //    and correspondence_members.user_id reference users(id) with NO
    //    onDelete clause, so the bare `DELETE FROM users` below would
    //    throw a foreign-key violation for anyone who has ever written
    //    a letter or joined a correspondence — i.e. account deletion was
    //    silently BROKEN for letter-writers (it 500'd and rolled back).
    //
    //    We UNLINK rather than hard-delete letter bodies: a 1:1 letter
    //    has two parties, and the surviving correspondent legitimately
    //    keeps their copy of the exchange. author_email + author_name
    //    stay on the row for display; only the account link is severed.
    //    Drafts are the deleting user's own private unsent WIP, so those
    //    DO get hard-deleted.
    await db.update(lettersTable)
      .set({ authorUserId: null })
      .where(eq(lettersTable.authorUserId, user.id));
    await db.delete(letterDraftsTable)
      .where(sql`${letterDraftsTable.authorUserId} = ${user.id} OR LOWER(${letterDraftsTable.authorEmail}) = ${emailLower}`);
    await db.update(correspondenceMembersTable)
      .set({ userId: null })
      .where(eq(correspondenceMembersTable.userId, user.id));

    // 4) Finally drop the user — cascades handle the rest (prayer
    //    requests/words/amens, device tokens, etc. all declare
    //    ON DELETE CASCADE).
    await db.delete(usersTable).where(eq(usersTable.id, user.id));
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

// ─── Phone-number set / clear ──────────────────────────────────────────────
//
// POST   /users/me/phone   { phone: string }
// DELETE /users/me/phone
//
// Stores the caller's phone number in three forms (raw display,
// normalized E.164, and SHA-256 hash) so the contact-match endpoint
// can resolve uploaded device-contact hashes back to a user. The
// unique index on phone_number_normalized means a given number can
// only be associated with one account at a time — re-claiming an
// existing number would 409.
//
// Verification (SMS) is intentionally not part of this v1. Callers
// should warn users at entry that contacts will be able to find them
// by this number, and that they should use their own real phone.
router.post("/users/me/phone", async (req, res): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const raw = String((req.body as { phone?: unknown } | null)?.phone ?? "");
  const normalized = normalizePhone(raw);
  if (!normalized) {
    res.status(400).json({
      error: "invalid_phone",
      message: "That doesn't look like a valid phone number. Try including the country code, e.g. +1 555 123 4567.",
    });
    return;
  }

  const hash = hashPhone(normalized);

  // Check for collision with another user (the unique index would
  // throw, but a friendly 409 is nicer than a 500 from a constraint
  // violation). A collision means someone else already claimed this
  // number — which in v1 (no SMS verification) might just mean a
  // typo or a recycled number; we tell the user to contact support.
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phoneNumberNormalized, normalized));
  if (existing && existing.id !== sessionUser.id) {
    res.status(409).json({
      error: "phone_taken",
      message: "Another account is using this number. If that's you, please contact support.",
    });
    return;
  }

  await db.update(usersTable)
    .set({
      phoneNumber: raw.trim(),
      phoneNumberNormalized: normalized,
      phoneHash: hash,
    })
    .where(eq(usersTable.id, sessionUser.id));

  res.json({ ok: true, phoneNumber: raw.trim(), phoneNumberNormalized: normalized });
});

router.delete("/users/me/phone", async (req, res): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db.update(usersTable)
    .set({
      phoneNumber: null,
      phoneNumberNormalized: null,
      phoneHash: null,
    })
    .where(eq(usersTable.id, sessionUser.id));

  res.json({ ok: true });
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
        sharePrayLocation: usersTable.sharePrayLocation,
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
      morning: u?.morning ?? "none",
      evening: u?.evening ?? "none",
      morningTime: u?.morningTime ?? null,
      eveningTime: u?.eveningTime ?? null,
      showConfession: u?.showConfession ?? false,
      defaultPrayerLevel: u?.defaultPrayerLevel ?? "ask",
      contemplationGoalMinutes: u?.contemplationGoalMinutes ?? 0,
      contemplationReminderEnabled: u?.contemplationReminderEnabled ?? true,
      weeklyReviewReminder: u?.weeklyReviewReminder ?? true,
      sharePrayLocation: u?.sharePrayLocation ?? false,
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
  const allowedLevels = new Set(["ask", "devotion", "office", "intercessions", "reflect-sit", "journal"]);
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
  // Opt-in to attach a coarse (~1 mile) location when tapping Amen, which
  // powers the personal "places I've been prayed for" map. Default off.
  if (typeof body.sharePrayLocation === "boolean") {
    update.sharePrayLocation = body.sharePrayLocation;
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
          WHEN surface IN ('morning-prayer', 'morning-devotion', 'national-cathedral') THEN 'morning'
          WHEN surface IN ('evening-prayer', 'early-evening-devotion') THEN 'evening'
        END AS side
      FROM prayer_sessions
      WHERE user_id = ${sessionUserId}
        AND (
          -- The office/devotion only counts once the slideshow is finished
          -- (closing Amen/Done or the book attestation set completed=TRUE).
          -- A partial sit that auto-commits on unmount has completed=FALSE.
          (surface IN ('morning-prayer', 'morning-devotion', 'evening-prayer', 'early-evening-devotion') AND completed = TRUE)
          OR (surface = 'national-cathedral' AND duration_seconds >= 180)
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
    const [officeRows, contRows, healthRows, reflRows, cacRows, pcRows] = await Promise.all([
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
        WHERE user_id = ${sessionUserId} AND section IN ('gratitude', 'examen') AND local_date >= ${oldestYmd}
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
      const met = contemplationGoalMin > 0 ? mins >= contemplationGoalMin : mins > 0;
      if (met) contemplation.add(day);
    }
    const reflection = new Set<string>();
    for (const r of reflRows.rows) reflection.add(r.ymd);
    for (const r of cacRows.rows) reflection.add(r.ymd);
    const gratitude = new Set<string>();
    const examen = new Set<string>();
    for (const r of pcRows.rows) {
      if (r.section === "gratitude") gratitude.add(r.local_date);
      if (r.section === "examen") examen.add(r.local_date);
    }

    const days = ymds.map((ymd) => ({
      ymd,
      morning: morning.has(ymd),
      evening: evening.has(ymd),
      contemplation: contemplation.has(ymd),
      reflection: reflection.has(ymd),
      gratitude: gratitude.has(ymd),
      examen: examen.has(ymd),
    }));
    res.json({ days });
  } catch (err) {
    console.error("[practice-week] failed:", err);
    res.status(500).json({ error: "Failed to load practice week" });
  }
});

export default router;
