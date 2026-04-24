import { Router, type IRouter } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  groupMembersTable,
  momentUserTokensTable,
  momentPostsTable,
} from "@workspace/db";
import { UpsertUserBody, GetUserResponse, UpsertUserResponse } from "@workspace/api-zod";
import { revokeGoogleTokensFor } from "../lib/googleOauthRevoke";
import { exportUserData } from "../lib/userDataExport";
import { normalizePhone, hashPhone } from "../lib/phone";

const router: IRouter = Router();

router.get("/users/me", async (req, res): Promise<void> => {
  const email = req.query.email as string | undefined;
  if (!email) {
    res.status(400).json({ error: "email query param required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(GetUserResponse.parse(user));
});

router.put("/users/me", async (req, res): Promise<void> => {
  const parsed = UpsertUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, parsed.data.email));
  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({ name: parsed.data.name })
      .where(eq(usersTable.email, parsed.data.email))
      .returning();
    res.json(UpsertUserResponse.parse(updated));
    return;
  }

  const [created] = await db.insert(usersTable).values(parsed.data).returning();
  res.json(UpsertUserResponse.parse(created));
});

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

    // 3) Finally drop the user — cascades do the rest.
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

export default router;
