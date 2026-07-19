import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  prayerFeedsTable,
  groupMembersTable,
  momentUserTokensTable,
  momentPostsTable,
  lettersTable,
  letterDraftsTable,
  correspondenceMembersTable,
  correspondencesTable,
  morningPrayerCacheTable,
  userConnectionsCacheTable,
  waitlistTable,
  lectioReflectionsTable,
  scheduleResponsesTable,
  ritualTimeSuggestionsTable,
} from "@workspace/db";
import { revokeGoogleTokensFor } from "../lib/googleOauthRevoke";
import { exportUserData } from "../lib/userDataExport";
import { normalizePhone, hashPhone } from "../lib/phone";
import { isVerifyConfigured, startVerification, checkVerification } from "../lib/twilioVerify";
import { rateLimit } from "../lib/rate-limit";

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
      //    - letters.author_user_id / correspondence_members.user_id (the
      //      Letters feature is retired; we ALSO scrub the retained author
      //      email/name here — dead PII with no UI reading it — since keeping
      //      it defeated erasure).
      //    - correspondences.created_by_user_id (a sibling FK the earlier fix
      //      missed — every correspondence creator FK-blocked their own delete).
      //    - morning_prayer_cache.assembled_by_user_id (whoever opened the
      //      day's first Morning Prayer is stamped assembler → blocked delete).
      await tx.update(lettersTable)
        .set({ authorUserId: null, authorEmail: "[deleted]", authorName: "Deleted user" })
        .where(eq(lettersTable.authorUserId, user.id));
      await tx.delete(letterDraftsTable)
        .where(sql`${letterDraftsTable.authorUserId} = ${user.id} OR LOWER(${letterDraftsTable.authorEmail}) = ${emailLower}`);
      await tx.update(correspondenceMembersTable)
        .set({ userId: null })
        .where(eq(correspondenceMembersTable.userId, user.id));
      await tx.update(correspondencesTable)
        .set({ createdByUserId: null })
        .where(eq(correspondencesTable.createdByUserId, user.id));
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
      await tx.delete(ritualTimeSuggestionsTable)
        .where(sql`LOWER(${ritualTimeSuggestionsTable.suggestedByEmail}) = ${emailLower}`);
      await tx.update(lectioReflectionsTable)
        .set({ userEmail: null })
        .where(sql`LOWER(${lectioReflectionsTable.userEmail}) = ${emailLower}`);
      await tx.update(scheduleResponsesTable)
        .set({ guestEmail: null })
        .where(sql`LOWER(${scheduleResponsesTable.guestEmail}) = ${emailLower}`);

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

  // When SMS verification is configured, this self-attest setter is
  // disabled — the number must go through /phone/start + /phone/verify so
  // we only ever store a number the user proved they control. The client
  // is expected to use the verify flow; this guard is the server backstop.
  if (isVerifyConfigured()) {
    res.status(400).json({
      error: "verification_required",
      message: "Please verify this number with the code we text you.",
    });
    return;
  }

  const hash = hashPhone(normalized);

  // Check for collision with another user (the unique index would
  // throw, but a friendly 409 is nicer than a 500 from a constraint
  // violation).
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

  // No-Twilio fallback (dev / self-host without an account): treat the
  // self-attested number as verified-at-now so end-to-end contact discovery
  // still works locally. Deployments with Twilio configured never reach here.
  await db.update(usersTable)
    .set({
      phoneNumber: raw.trim(),
      phoneNumberNormalized: normalized,
      phoneHash: hash,
      phoneVerifiedAt: new Date(),
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
      phoneVerifiedAt: null,
      // Removing the number also removes discoverability — can't be findable
      // by a number you no longer have on file.
      discoverableByPhone: false,
    })
    .where(eq(usersTable.id, sessionUser.id));

  res.json({ ok: true });
});

// ─── SMS phone verification (Twilio Verify) ────────────────────────────────
//
// POST /users/me/phone/start   { phone }          → texts a 6-digit code
// POST /users/me/phone/verify  { phone, code }     → on "approved", stores
//                                                     the number + marks it
//                                                     verified
//
// We only persist the number (display + normalized + hash) once a texted
// code is confirmed, so a stored number always belongs to whoever holds the
// SIM. The code itself is generated, sent, and checked by Twilio — it never
// touches our database.
router.post("/users/me/phone/start", rateLimit({
  // A handful of code requests per number/account per window is plenty for a
  // legitimate verify (Twilio adds its own per-number throttle on top).
  name: "phone_verify_start",
  max: 6,
  windowMs: 15 * 60 * 1000,
  keyFn: (req) => {
    const u = (req as { user?: { id?: number } }).user;
    return u?.id ? `u:${u.id}` : null;
  },
  message: "Too many code requests — please wait a few minutes and try again.",
}), rateLimit({
  // Per-DESTINATION-NUMBER cap, across ALL accounts. The per-user limit above
  // only bounds one account; without this, an attacker rotating accounts (or a
  // buggy client) could pump SMS at a single victim's number (SMS bombing) or
  // drive toll fraud to a premium destination. 5/hour per number is generous
  // for a real verify while cutting the abuse curve. A null key (no/invalid
  // phone in the body) skips this limit; the handler 400s on it anyway.
  name: "phone_verify_start_number",
  max: 5,
  windowMs: 60 * 60 * 1000,
  keyFn: (req) => {
    const raw = String((req.body as { phone?: unknown } | null)?.phone ?? "");
    const n = normalizePhone(raw);
    return n ? `p:${n}` : null;
  },
  message: "This number has received several codes recently. Please wait a bit before requesting another.",
}), async (req, res): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!isVerifyConfigured()) {
    res.status(503).json({ error: "verification_unavailable", message: "Phone verification isn't available right now." });
    return;
  }

  const raw = String((req.body as { phone?: unknown } | null)?.phone ?? "");
  const normalized = normalizePhone(raw);
  if (!normalized) {
    res.status(400).json({ error: "invalid_phone", message: "That doesn't look like a valid phone number. Try +1 555 123 4567." });
    return;
  }

  // Reject up-front if a DIFFERENT account already verified this number, so the
  // user doesn't burn an SMS just to fail at the verify step.
  const [existing] = await db
    .select({ id: usersTable.id, verifiedAt: usersTable.phoneVerifiedAt })
    .from(usersTable)
    .where(eq(usersTable.phoneNumberNormalized, normalized));
  if (existing && existing.id !== sessionUser.id && existing.verifiedAt) {
    res.status(409).json({ error: "phone_taken", message: "Another account is using this number. If that's you, please contact support." });
    return;
  }

  const result = await startVerification(normalized);
  if (!result.ok) {
    if (result.reason === "invalid_number") { res.status(400).json({ error: "invalid_phone", message: "We couldn't text that number. Double-check it and try again." }); return; }
    if (result.reason === "rate_limited") { res.status(429).json({ error: "rate_limited", message: "Too many attempts on this number. Please wait a bit." }); return; }
    res.status(502).json({ error: "send_failed", message: "We couldn't send a code right now. Please try again." });
    return;
  }
  res.json({ ok: true });
});

router.post("/users/me/phone/verify", rateLimit({
  name: "phone_verify_check",
  max: 10,
  windowMs: 15 * 60 * 1000,
  keyFn: (req) => {
    const u = (req as { user?: { id?: number } }).user;
    return u?.id ? `u:${u.id}` : null;
  },
  message: "Too many attempts — please request a new code in a few minutes.",
}), async (req, res): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (!isVerifyConfigured()) {
    res.status(503).json({ error: "verification_unavailable", message: "Phone verification isn't available right now." });
    return;
  }

  const body = (req.body ?? {}) as { phone?: unknown; code?: unknown };
  const normalized = normalizePhone(String(body.phone ?? ""));
  const code = String(body.code ?? "").trim();
  if (!normalized) { res.status(400).json({ error: "invalid_phone", message: "That doesn't look like a valid phone number." }); return; }
  if (!/^\d{4,10}$/.test(code)) { res.status(400).json({ error: "invalid_code", message: "Enter the code we texted you." }); return; }

  const check = await checkVerification(normalized, code);
  if (!check.ok) {
    if (check.reason === "expired") { res.status(410).json({ error: "code_expired", message: "That code expired. Tap Resend to get a new one." }); return; }
    res.status(502).json({ error: "verify_failed", message: "We couldn't check that code right now. Please try again." }); return;
  }
  if (!check.approved) {
    res.status(400).json({ error: "code_incorrect", message: "That code wasn't right. Check it and try again." });
    return;
  }

  // Approved — claim the number. Re-check the collision under the unique index
  // (another account could have verified it between /start and now).
  const [existing] = await db
    .select({ id: usersTable.id, verifiedAt: usersTable.phoneVerifiedAt })
    .from(usersTable)
    .where(eq(usersTable.phoneNumberNormalized, normalized));
  if (existing && existing.id !== sessionUser.id && existing.verifiedAt) {
    res.status(409).json({ error: "phone_taken", message: "Another account just verified this number." });
    return;
  }

  const raw = String(body.phone ?? "").trim();
  await db.update(usersTable)
    .set({
      phoneNumber: raw,
      phoneNumberNormalized: normalized,
      phoneHash: hashPhone(normalized),
      phoneVerifiedAt: new Date(),
    })
    .where(eq(usersTable.id, sessionUser.id));

  res.json({ ok: true, phoneNumber: raw, phoneNumberNormalized: normalized, phoneVerified: true });
});

// ─── Discoverable-by-phone opt-in ──────────────────────────────────────────
// PATCH /users/me/discoverable-by-phone { enabled: boolean }
// Verifying a number does NOT make you findable; this explicit toggle does.
// Can only be turned ON for a verified number.
router.patch("/users/me/discoverable-by-phone", async (req, res): Promise<void> => {
  const sessionUser = req.user as { id: number } | undefined;
  if (!sessionUser) { res.status(401).json({ error: "Unauthorized" }); return; }

  const enabled = !!(req.body as { enabled?: unknown } | null)?.enabled;

  if (enabled) {
    const [me] = await db
      .select({ verifiedAt: usersTable.phoneVerifiedAt })
      .from(usersTable)
      .where(eq(usersTable.id, sessionUser.id));
    if (!me?.verifiedAt) {
      res.status(400).json({ error: "phone_unverified", message: "Verify your phone number before turning this on." });
      return;
    }
  }

  await db.update(usersTable)
    .set({ discoverableByPhone: enabled })
    .where(eq(usersTable.id, sessionUser.id));

  res.json({ ok: true, discoverableByPhone: enabled });
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
        dailyStepGoal: usersTable.dailyStepGoal,
        dailyStepReachedDate: usersTable.dailyStepReachedDate,
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
      // Default daily practice for un-set-up users (null columns): Morning +
      // Evening Devotion at 7:00/6:00pm (owner: reminders on by default), a
      // 5-minute contemplation goal, a Devotion-depth office. An explicit
      // choice (non-null column) still wins.
      morning: u?.morning ?? "devotion",
      evening: u?.evening ?? "devotion",
      morningTime: u?.morningTime ?? "07:00",
      eveningTime: u?.eveningTime ?? "18:00",
      showConfession: u?.showConfession ?? false,
      defaultPrayerLevel: u?.defaultPrayerLevel ?? "devotion",
      contemplationGoalMinutes: u?.contemplationGoalMinutes ?? 5,
      contemplationReminderEnabled: u?.contemplationReminderEnabled ?? true,
      dailyStepGoal: u?.dailyStepGoal ?? 0,
      dailyStepReachedDate: u?.dailyStepReachedDate ?? null,
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
  // Daily steps goal (0 = off). Clamp to 0–200k; the UI offers preset goals.
  if (typeof body.dailyStepGoal === "number" && Number.isFinite(body.dailyStepGoal)) {
    update.dailyStepGoal = Math.max(0, Math.min(200000, Math.round(body.dailyStepGoal)));
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
        WHERE user_id = ${sessionUserId} AND section IN ('gratitude', 'examen', 'listening', 'journaling', 'lectio', 'reading', 'podcasts', 'walk', 'prayer-list') AND local_date >= ${oldestYmd}
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
    const gratitude = new Set<string>();
    const examen = new Set<string>();
    const listening = new Set<string>();
    const journaling = new Set<string>();
    const lectio = new Set<string>();
    const reading = new Set<string>();
    const podcasts = new Set<string>();
    const walk = new Set<string>();
    const prayerList = new Set<string>();
    for (const r of pcRows.rows) {
      if (r.section === "gratitude") gratitude.add(r.local_date);
      if (r.section === "examen") examen.add(r.local_date);
      if (r.section === "listening") listening.add(r.local_date);
      if (r.section === "journaling") journaling.add(r.local_date);
      if (r.section === "lectio") lectio.add(r.local_date);
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
      gratitude: gratitude.has(ymd),
      examen: examen.has(ymd),
      journaling: journaling.has(ymd),
      lectio: lectio.has(ymd),
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
