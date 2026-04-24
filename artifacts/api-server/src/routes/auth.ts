import { getFrontendUrl, getInviteBaseUrl } from "../lib/urls";
import { sendEmail } from "../lib/email";
import { Router, type IRouter } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { google } from "googleapis";
import { db, usersTable, betaUsersTable, groupsTable, groupMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { notifyAdminsOfNewMember } from "./groups";
import { rateLimit, getClientIp } from "../lib/rate-limit";
import { revokeGoogleTokensFor } from "../lib/googleOauthRevoke";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const router: IRouter = Router();

const GOOGLE_CONFIGURED =
  !!process.env["GOOGLE_CLIENT_ID"] && !!process.env["GOOGLE_CLIENT_SECRET"];

if (process.env["NODE_ENV"] === "production" && !process.env["GOOGLE_REDIRECT_URI"]) {
  throw new Error("GOOGLE_REDIRECT_URI must be set in production");
}
const callbackURL = process.env["GOOGLE_REDIRECT_URI"] ?? "http://localhost:3001/api/auth/google/callback";
const frontendURL = getFrontendUrl();

if (GOOGLE_CONFIGURED) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env["GOOGLE_CLIENT_ID"]!,
        clientSecret: process.env["GOOGLE_CLIENT_SECRET"]!,
        callbackURL,
        scope: ["profile", "email"],
      },
      async (
        accessToken: string,
        refreshToken: string,
        profile: Profile,
        done: (err: Error | null, user?: Express.User) => void
      ) => {
        try {
          const email = profile.emails?.[0]?.value ?? "";
          const name = profile.displayName ?? email;
          const avatarUrl = profile.photos?.[0]?.value ?? null;
          const googleId = profile.id;

          // Calendar tokens no longer stored per-user — scheduler account handles all events.
          const existing = await db.select().from(usersTable).where(eq(usersTable.googleId, googleId));
          if (existing.length > 0) {
            const prev = existing[0];
            const [user] = await db
              .update(usersTable)
              .set({ avatarUrl })
              .where(eq(usersTable.id, prev.id))
              .returning();
            return done(null, user);
          }

          const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, email));
          if (byEmail.length > 0) {
            const [user] = await db
              .update(usersTable)
              .set({ googleId, avatarUrl })
              .where(eq(usersTable.id, byEmail[0].id))
              .returning();
            return done(null, user);
          }

          const [user] = await db
            .insert(usersTable)
            .values({ name, email, avatarUrl, googleId })
            .returning();
          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
}

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as { id: number }).id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    done(null, user ?? null);
  } catch (err) {
    done(err);
  }
});

router.get("/auth/google", (_req, res, next) => {
  if (!GOOGLE_CONFIGURED) {
    res.status(503).send("Google Sign-In is not configured. Please add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
    return;
  }
  passport.authenticate("google", { accessType: "offline" })(res.req, res, next);
});

router.get(
  "/auth/google/callback",
  (req, res, next) => {
    if (!GOOGLE_CONFIGURED) { res.redirect("/?error=auth_failed"); return; }
    passport.authenticate("google", { failureRedirect: `${frontendURL}/?error=auth_failed` })(req, res, next);
  },
  (req, res) => {
    // Explicitly save session before redirect to avoid race condition
    req.session.save(() => {
      res.redirect(`${frontendURL}/dashboard`);
    });
  }
);

// ─── Outbound-mail account setup (one-time) ─────────────────────────────────
// Visit /api/auth/scheduler/setup while logged into Google Workspace as
// invites@withphoebe.app to authorize the mailbox. The returned refresh
// token should be stored as INVITES_GOOGLE_REFRESH_TOKEN. (The route is
// still named "scheduler" for historical reasons — it's account-agnostic;
// it just mints a refresh token for whichever Google account you're
// signed into at the time.)
const schedulerCallbackURL = callbackURL.replace("/auth/google/callback", "/auth/scheduler/callback");

router.get("/auth/scheduler/setup", (_req, res) => {
  if (!GOOGLE_CONFIGURED) {
    res.status(503).send("Google OAuth not configured."); return;
  }
  const oauth2 = new google.auth.OAuth2(
    process.env["GOOGLE_CLIENT_ID"]!,
    process.env["GOOGLE_CLIENT_SECRET"]!,
    schedulerCallbackURL
  );
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/gmail.send",
    ],
  });
  res.redirect(url);
});

router.get("/auth/scheduler/callback", async (req, res): Promise<void> => {
  const code = req.query.code as string;
  if (!code) { res.status(400).send("No code returned from Google."); return; }

  try {
    const oauth2 = new google.auth.OAuth2(
      process.env["GOOGLE_CLIENT_ID"]!,
      process.env["GOOGLE_CLIENT_SECRET"]!,
      callbackURL.replace("/auth/google/callback", "/auth/scheduler/callback")
    );
    const { tokens } = await oauth2.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      res.status(400).send("No refresh token returned. Make sure you revoked previous access at https://myaccount.google.com/permissions and try again.");
      return;
    }

    res.send(`
      <html><body style="font-family: system-ui; padding: 2rem; max-width: 600px; margin: 0 auto;">
        <h2>✅ Outbound-mail account authorized</h2>
        <p>Set this as your <code>INVITES_GOOGLE_REFRESH_TOKEN</code> environment variable on Railway:</p>
        <pre style="background: #f5f5f5; padding: 1rem; border-radius: 8px; word-break: break-all; font-size: 14px;">${refreshToken}</pre>
        <p style="color: #666; font-size: 14px;">Once set, Phoebe will send every outbound email (invites, magic links, calendar invitations, letters) from <strong>invites@withphoebe.app</strong>.</p>
      </body></html>
    `);
  } catch (err) {
    console.error("Scheduler OAuth callback error:", err);
    res.status(500).send("Failed to exchange code for tokens.");
  }
});

router.get("/auth/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const u = req.user as {
    id: number; name: string; email: string; avatarUrl: string | null;
    googleId: string | null; showPresence: boolean;
    correspondenceImprintCompleted: boolean; gatheringImprintCompleted: boolean;
    onboardingCompleted: boolean; dailyBellTime: string | null;
    prayerInviteLastShownDate: string | null;
    prayerInviteLastShownAt: Date | string | null;
    phoneNumber: string | null;
  };
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    googleId: u.googleId,
    showPresence: u.showPresence,
    correspondenceImprintCompleted: u.correspondenceImprintCompleted ?? false,
    gatheringImprintCompleted: u.gatheringImprintCompleted ?? false,
    onboardingCompleted: u.onboardingCompleted ?? false,
    dailyBellTime: u.dailyBellTime ?? null,
    prayerInviteLastShownDate: u.prayerInviteLastShownDate ?? null,
    // ISO 8601 string the client parses with Date.parse() to compute
    // hours-since-shown for the re-show gate.
    prayerInviteLastShownAt: u.prayerInviteLastShownAt
      ? (u.prayerInviteLastShownAt instanceof Date
          ? u.prayerInviteLastShownAt.toISOString()
          : String(u.prayerInviteLastShownAt))
      : null,
    phoneNumber: u.phoneNumber ?? null,
  });
});

router.patch("/auth/me/onboarding", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  await db.update(usersTable).set({ onboardingCompleted: true } as Record<string, unknown>).where(eq(usersTable.id, userId));
  if (req.user) {
    (req.user as Record<string, unknown>).onboardingCompleted = true;
  }
  res.json({ ok: true });
});

router.patch("/auth/me/imprints", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { type } = req.body;
  if (type !== "correspondence" && type !== "gathering") {
    res.status(400).json({ error: "type must be 'correspondence' or 'gathering'" });
    return;
  }
  const field = type === "correspondence"
    ? "correspondenceImprintCompleted"
    : "gatheringImprintCompleted";
  await db.update(usersTable).set({ [field]: true } as Record<string, unknown>).where(eq(usersTable.id, userId));
  // Update session user so /me reflects the change immediately
  if (req.user) {
    (req.user as Record<string, unknown>)[field] = true;
  }
  res.json({ ok: true });
});

router.patch("/auth/me/presence", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { showPresence } = req.body;
  if (typeof showPresence !== "boolean") {
    res.status(400).json({ error: "showPresence must be a boolean" });
    return;
  }
  await db.update(usersTable).set({ showPresence } as Record<string, unknown>).where(eq(usersTable.id, userId));
  res.json({ showPresence });
});

// PATCH /auth/me/prayer-invite-shown — record that the daily prayer-list
// popup was just shown. The dashboard re-shows it every 6 hours of idle
// when the user still hasn't prayed, so we stamp a timestamp rather than
// a date. We also keep the legacy date column in sync for any downstream
// tool that still reads it.
router.patch("/auth/me/prayer-invite-shown", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { date, at } = req.body as { date?: string; at?: string };

  // Server-truth timestamp. Clients can submit `at` (ISO), but we ignore
  // it and stamp now() so skewed device clocks can't extend the cooldown.
  const nowIso = new Date().toISOString();
  void at;

  // Preserve the YYYY-MM-DD legacy column — still accepted so old builds
  // can roll in gradually. If the client doesn't send one, derive from
  // the current UTC date (close enough — the new gate uses the timestamp).
  const today = (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))
    ? date
    : nowIso.slice(0, 10);

  await db.update(usersTable)
    .set({
      prayerInviteLastShownDate: today,
      prayerInviteLastShownAt: new Date(nowIso),
    } as Record<string, unknown>)
    .where(eq(usersTable.id, userId));
  if (req.user) {
    (req.user as Record<string, unknown>).prayerInviteLastShownDate = today;
    (req.user as Record<string, unknown>).prayerInviteLastShownAt = nowIso;
  }
  res.json({
    prayerInviteLastShownDate: today,
    prayerInviteLastShownAt: nowIso,
  });
});

// PATCH /auth/me/profile — update name and/or avatar
router.patch("/auth/me/profile", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { name, avatarUrl } = req.body as { name?: string; avatarUrl?: string | null };

  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    const trimmed = (name ?? "").trim();
    if (trimmed.length < 1 || trimmed.length > 100) {
      res.status(400).json({ error: "Name must be 1–100 characters" }); return;
    }
    updates.name = trimmed;
  }

  if (avatarUrl !== undefined) {
    // Accept null (remove avatar), a URL, or a base64 data URI
    if (avatarUrl !== null && typeof avatarUrl !== "string") {
      res.status(400).json({ error: "avatarUrl must be a string or null" }); return;
    }
    // Limit data URI size to ~5MB (base64) — client compresses images before upload
    if (avatarUrl && avatarUrl.startsWith("data:") && avatarUrl.length > 7_000_000) {
      res.status(400).json({ error: "Avatar too large" }); return;
    }
    updates.avatarUrl = avatarUrl;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" }); return;
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));

  // Update session so /me reflects changes immediately
  for (const [k, v] of Object.entries(updates)) {
    (req.user as Record<string, unknown>)[k] = v;
  }

  res.json({ ok: true, ...updates });
});

router.post("/auth/logout", async (req, res, next) => {
  // Best-effort Google token revocation before destroying the session.
  // Most users no longer have per-user Google tokens (scheduler account
  // handles calendar writes), but legacy rows may still hold them —
  // revoke them so the grant isn't left dangling.
  const u = req.user as {
    id?: number;
    googleAccessToken?: string | null;
    googleRefreshToken?: string | null;
  } | undefined;
  if (u?.id && (u.googleAccessToken || u.googleRefreshToken)) {
    await revokeGoogleTokensFor({
      accessToken: u.googleAccessToken,
      refreshToken: u.googleRefreshToken,
    });
    try {
      await db
        .update(usersTable)
        .set({
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiry: null,
        } as Record<string, unknown>)
        .where(eq(usersTable.id, u.id));
    } catch (err) {
      console.warn("[auth/logout] failed to clear google tokens on user row:", err);
    }
  }

  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
});

// ─── Password helpers ─────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  const storedBuf = Buffer.from(hashed, "hex");
  return buf.length === storedBuf.length && timingSafeEqual(buf, storedBuf);
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────
// Account creation is invite-only right now. Two ways in:
//   1. The email is in beta_users (pilot users — added by an admin).
//   2. The request includes a valid groupSlug + groupInviteToken pair, and
//      the email matches the pre-invited member row. After successful
//      registration the new user is auto-joined to that community.
// Anyone else is sent to the waitlist.
//
// Rate limit: 5 registrations per hour per IP. The invite-only gate already
// blocks most abuse, but a leaked community link could let a bot blast
// accounts — throttling per-IP means any one abuser is capped at 120
// accounts/day, plenty of runway for the admin to rotate the link.
router.post(
  "/auth/register",
  rateLimit({
    name: "auth_register",
    max: 5,
    windowMs: 60 * 60 * 1000,
    message: "Too many signup attempts from your network. Please try again in an hour.",
  }),
  async (req, res): Promise<void> => {
  const { email, name, password, groupSlug, groupInviteToken, website } = req.body as {
    email?: string; name?: string; password?: string;
    groupSlug?: string; groupInviteToken?: string;
    // Honeypot: a hidden field no real browser user will ever fill in.
    // Bots that blindly fill every input trigger this and get a 400 that
    // looks identical to a validation failure (no tell-tale "bot detected"
    // response, so they won't adapt).
    website?: string;
  };

  // Honeypot trip — silently reject with a generic validation error.
  if (website && website.trim().length > 0) {
    res.status(400).json({ error: "Invalid submission." }); return;
  }

  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." }); return;
  }
  if (!name || name.trim().length < 1) {
    res.status(400).json({ error: "Your name is required." }); return;
  }
  if (!password || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." }); return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing) {
    res.status(400).json({ error: "An account with that email already exists." }); return;
  }

  // ── Eligibility check ──────────────────────────────────────────────────
  // Pilot/beta path
  let allowed = false;
  let inviteMember: { id: number; groupId: number; email: string } | null = null;
  let inviteGroupSlug: string | null = null;
  try {
    const [beta] = await db.select({ email: betaUsersTable.email })
      .from(betaUsersTable).where(eq(betaUsersTable.email, normalizedEmail));
    if (beta) allowed = true;
  } catch {
    // beta_users table missing — fall through to invite check
  }

  // Community-invite path — two flavors:
  //   A. Community-wide token (new primary): group.invite_token matches.
  //      No email-match check; anyone with the link can sign up.
  //   B. Per-member token (legacy): group_members.invite_token matches AND
  //      the invitee email matches the email being registered.
  let communityWideGroupId: number | null = null;
  if (!allowed && groupSlug && groupInviteToken) {
    const [group] = await db.select({
      id: groupsTable.id,
      slug: groupsTable.slug,
      inviteToken: groupsTable.inviteToken,
    }).from(groupsTable).where(eq(groupsTable.slug, groupSlug));
    if (group) {
      // A. Community-wide token
      if (group.inviteToken && group.inviteToken === groupInviteToken) {
        allowed = true;
        communityWideGroupId = group.id;
        inviteGroupSlug = group.slug;
      } else {
        // B. Per-member token (legacy)
        const [member] = await db.select({
          id: groupMembersTable.id, groupId: groupMembersTable.groupId, email: groupMembersTable.email,
        })
          .from(groupMembersTable)
          .where(and(
            eq(groupMembersTable.groupId, group.id),
            eq(groupMembersTable.inviteToken, groupInviteToken),
          ));
        if (member && member.email.toLowerCase() === normalizedEmail) {
          allowed = true;
          inviteMember = member;
          inviteGroupSlug = group.slug;
        }
      }
    }
  }

  if (!allowed) {
    res.status(403).json({
      error: "Phoebe is invite-only right now. Join the waitlist and we'll be in touch as we open seats.",
    });
    return;
  }

  // ── Create the user ────────────────────────────────────────────────────
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ email: normalizedEmail, name: name.trim(), passwordHash })
    .returning();

  // If this was a community-invite signup, auto-join the group so the new
  // user shows up as a member immediately.
  //
  //   - Per-member token (inviteMember set): UPDATE the pending row in place.
  //   - Community-wide token (communityWideGroupId set): INSERT a fresh
  //     membership row. group_members.invite_token is NOT NULL UNIQUE so
  //     we mint a per-row random token just to satisfy the constraint.
  if (inviteMember) {
    try {
      await db.update(groupMembersTable)
        .set({ userId: user.id, joinedAt: new Date(), name: user.name })
        .where(eq(groupMembersTable.id, inviteMember.id));
      const [group] = await db.select({ name: groupsTable.name, slug: groupsTable.slug })
        .from(groupsTable).where(eq(groupsTable.id, inviteMember.groupId));
      notifyAdminsOfNewMember(
        inviteMember.groupId,
        group?.name ?? inviteGroupSlug ?? "your community",
        { name: user.name, email: user.email },
        group?.slug ?? inviteGroupSlug ?? undefined,
      ).catch(err => console.error("[auth/register] notify admins failed:", err));
    } catch (err) {
      console.error("[auth/register] failed to link group member:", err);
      // Non-fatal: the user account exists; they can still tap the
      // invite link again to complete the join.
    }
  } else if (communityWideGroupId) {
    try {
      await db.insert(groupMembersTable).values({
        groupId: communityWideGroupId,
        userId: user.id,
        email: user.email.toLowerCase(),
        name: user.name,
        role: "member",
        inviteToken: randomBytes(16).toString("hex"),
        joinedAt: new Date(),
      });
      const [group] = await db.select({ name: groupsTable.name, slug: groupsTable.slug })
        .from(groupsTable).where(eq(groupsTable.id, communityWideGroupId));
      notifyAdminsOfNewMember(
        communityWideGroupId,
        group?.name ?? inviteGroupSlug ?? "your community",
        { name: user.name, email: user.email },
        group?.slug ?? inviteGroupSlug ?? undefined,
      ).catch(err => console.error("[auth/register] notify admins failed:", err));
    } catch (err) {
      console.error("[auth/register] failed to insert community-wide member:", err);
      // Non-fatal: the user account exists; they can click the link
      // again from the authenticated flow to complete the join.
    }
  }

  req.login(user, (err) => {
    if (err) { res.status(500).json({ error: "Login failed after registration." }); return; }
    req.session.save(() => res.json({ ok: true, joinedGroupSlug: inviteGroupSlug }));
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Rate-limited per-email to defend existing accounts against credential
// stuffing. 10 attempts per 15 minutes is generous for legit typo-prone users
// while making brute force economically painful. We also bucket per-IP with a
// looser cap as a backstop against enumeration attacks that rotate emails.
router.post(
  "/auth/login",
  rateLimit({
    name: "auth_login_ip",
    max: 50,
    windowMs: 15 * 60 * 1000,
    message: "Too many login attempts from your network. Please try again in a few minutes.",
  }),
  rateLimit({
    name: "auth_login_email",
    max: 10,
    windowMs: 15 * 60 * 1000,
    keyFn: (req) => {
      const e = (req.body as { email?: string } | undefined)?.email;
      return typeof e === "string" && e.length > 0 ? e.trim().toLowerCase() : null;
    },
    message: "Too many login attempts for this account. Please try again in a few minutes.",
  }),
  async (req, res): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." }); return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Incorrect email or password." }); return;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Incorrect email or password." }); return;
  }

  req.login(user, (err) => {
    if (err) { res.status(500).json({ error: "Login failed." }); return; }
    req.session.save(() => res.json({ ok: true }));
  });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." }); return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  // Always return success to prevent email enumeration
  if (!user || !user.passwordHash) {
    res.json({ ok: true }); return;
  }

  const token = randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await db.update(usersTable)
    .set({ resetToken: token, resetTokenExpiry: expiry } as Record<string, unknown>)
    .where(eq(usersTable.id, user.id));

  const resetUrl = `${getInviteBaseUrl()}/reset-password?token=${token}`;

  // Try to send email; fall back to logging locally
  try {
    await sendEmail({
      to: normalizedEmail,
      subject: "Reset your Phoebe password",
      text: `Hi ${user.name},\n\nClick the link below to reset your password. It expires in 1 hour.\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.\n\n— Phoebe`,
      html: `<p>Hi ${user.name},</p><p>Click the link below to reset your password. It expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p><p>— Phoebe</p>`,
    });
  } catch {
    console.info(`[forgot-password] Reset link for ${normalizedEmail}: ${resetUrl}`);
  }

  res.json({ ok: true });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };

  if (!token) { res.status(400).json({ error: "Reset token is required." }); return; }
  if (!password || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." }); return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.resetToken, token));

  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    res.status(400).json({ error: "This reset link has expired or is invalid." }); return;
  }

  const passwordHash = await hashPassword(password);
  await db.update(usersTable)
    .set({ passwordHash, resetToken: null, resetTokenExpiry: null } as Record<string, unknown>)
    .where(eq(usersTable.id, user.id));

  res.json({ ok: true });
});

export { passport };
export default router;
