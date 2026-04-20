import { getFrontendUrl, getInviteBaseUrl } from "../lib/urls";
import { sendEmail } from "../lib/email";
import { Router, type IRouter } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { google } from "googleapis";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

// PATCH /auth/me/prayer-invite-shown — stamp today's local date so the
// daily prayer-slideshow popup is silenced for the rest of the day across
// every device this account is signed into.
router.patch("/auth/me/prayer-invite-shown", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { date } = req.body as { date?: string };
  // Accept YYYY-MM-DD in the client's local timezone — the server doesn't
  // know the user's TZ reliably, so we trust the submitted date.
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" }); return;
  }
  await db.update(usersTable)
    .set({ prayerInviteLastShownDate: date } as Record<string, unknown>)
    .where(eq(usersTable.id, userId));
  if (req.user) {
    (req.user as Record<string, unknown>).prayerInviteLastShownDate = date;
  }
  res.json({ prayerInviteLastShownDate: date });
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

router.post("/auth/logout", (req, res, next) => {
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
router.post("/auth/register", async (req, res): Promise<void> => {
  const { email, name, password } = req.body as { email?: string; name?: string; password?: string };

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

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ email: normalizedEmail, name: name.trim(), passwordHash })
    .returning();

  req.login(user, (err) => {
    if (err) { res.status(500).json({ error: "Login failed after registration." }); return; }
    req.session.save(() => res.json({ ok: true }));
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post("/auth/login", async (req, res): Promise<void> => {
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
