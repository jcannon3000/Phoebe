import { getFrontendUrl, getInviteBaseUrl } from "../lib/urls";
import { sendPasswordResetEmail } from "../lib/email";
import { Router, type IRouter, type Request } from "express";
import passport from "passport";
import { loginFreshSession } from "../lib/session";
import { Strategy as GoogleStrategy, type Profile } from "passport-google-oauth20";
import { google } from "googleapis";
import { db, usersTable, betaUsersTable, groupsTable, groupMembersTable, fellowsTable, fellowInvitesTable, waitlistTable, persistentAuthTokensTable } from "@workspace/db";
import { eq, and, or, gt, sql, isNull, inArray } from "drizzle-orm";
import { notifyAdminsOfNewMember } from "./groups";
import { rateLimit, getClientIp } from "../lib/rate-limit";
import { getUserAccessTier } from "../lib/parishGate";
import { PHOEBE_PARISH_ENABLED } from "../lib/parishFlag";
import { revokeGoogleTokensFor } from "../lib/googleOauthRevoke";
import { scrypt, randomBytes, timingSafeEqual, createHash } from "crypto";
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
        // Pass `req` into verify so we can see the CURRENT session — an
        // anonymous device guest signing up via Google should upgrade that
        // same row in place (keep their streak), not mint a fresh account.
        passReqToCallback: true,
      },
      async (
        req: Request,
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
          // Never let a Google sign-in clobber a custom uploaded avatar. Only
          // adopt Google's photo when the user has no avatar yet, or their
          // current one is itself a Google photo (so it can refresh). A custom
          // upload (data: URI or any non-Google URL) is preserved — otherwise
          // every Google re-auth reverted the user's chosen picture everywhere.
          const keepAvatar = (prev: { avatarUrl: string | null }): string | null => {
            const cur = prev.avatarUrl;
            const isGoogle = !!cur && cur.startsWith("https://lh3.googleusercontent.com");
            if (cur && !isGoogle) return cur; // custom upload — keep it
            return avatarUrl ?? cur;          // adopt Google's, but never null out
          };
          const existing = await db.select().from(usersTable).where(eq(usersTable.googleId, googleId));
          if (existing.length > 0) {
            const prev = existing[0];
            const [user] = await db
              .update(usersTable)
              .set({ avatarUrl: keepAvatar(prev) })
              .where(eq(usersTable.id, prev.id))
              .returning();
            return done(null, user);
          }

          const byEmail = await db.select().from(usersTable).where(eq(usersTable.email, email));
          if (byEmail.length > 0) {
            // Only link this Google identity to a pre-existing account when
            // Google has VERIFIED the email. Otherwise a Google account that
            // merely claims a victim's address (e.g. an unverified custom
            // Workspace domain) could take over the victim's password account.
            const emailVerified = (profile as { _json?: { email_verified?: boolean } })._json?.email_verified === true;
            if (!emailVerified) {
              return done(null, undefined);
            }
            const [user] = await db
              .update(usersTable)
              .set({ googleId, avatarUrl: keepAvatar(byEmail[0]) })
              .where(eq(usersTable.id, byEmail[0].id))
              .returning();
            return done(null, user);
          }

          // Anonymous device guest signing up via Google → upgrade that same
          // row in place (keeps streak / history / push token / rule; id
          // unchanged), mirroring /auth/register + Apple. Only reached when the
          // email is free (byEmail miss above), so there's no takeover risk.
          const anonId = req.user && (req.user as { isAnonymous?: boolean }).isAnonymous
            ? (req.user as { id: number }).id
            : null;
          if (anonId != null) {
            const [upgraded] = await db
              .update(usersTable)
              .set({ name, email, avatarUrl, googleId, isAnonymous: false })
              .where(and(eq(usersTable.id, anonId), eq(usersTable.isAnonymous, true)))
              .returning();
            if (upgraded) return done(null, upgraded);
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

// ─── deserializeUser cache ───────────────────────────────────────────────────
// passport.deserializeUser runs a `SELECT * FROM users` on EVERY authenticated
// request. A single dashboard load fires ~17-19 requests, so that's ~17-19
// identical user reads per load, per user — pure overhead at scale. Cache the
// row per user for a few seconds so a burst shares one read.
//
// Correctness:
//  - We hand every request a shallow CLONE, never the shared row. A handful of
//    write endpoints mutate req.user in place (req.user.x = y); mutating a
//    shared cached object would leak across concurrent requests.
//  - Any mutating (non-GET) request busts the user's entry on response finish
//    (the bust-on-write middleware in app.ts), so a write is always followed
//    by a fresh read. Residual staleness is bounded by the short TTL and only
//    touches preference flags — no authorization is decided off req.user.
const USER_CACHE_TTL_MS = 5_000;
const USER_CACHE_MAX = 10_000;
const userRowCache = new Map<number, { row: Express.User; expires: number }>();

export function bustUserCache(id: number): void {
  userRowCache.delete(id);
}

passport.deserializeUser(async (id: number, done) => {
  try {
    const cached = userRowCache.get(id);
    if (cached && cached.expires > Date.now()) {
      done(null, { ...(cached.row as object) } as Express.User);
      return;
    }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { done(null, null); return; }
    // Hard cap so the map can't grow without bound under a large user base;
    // entries are short-lived (TTL + bust-on-write) so a flush is cheap.
    if (userRowCache.size > USER_CACHE_MAX) userRowCache.clear();
    userRowCache.set(id, { row: user as Express.User, expires: Date.now() + USER_CACHE_TTL_MS });
    done(null, { ...(user as object) } as Express.User);
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
    // passport.authenticate has already logged the user in; rotate the session
    // id (re-logging into the fresh session) to defeat fixation, then save
    // before redirect to avoid a race.
    const u = req.user as Express.User | undefined;
    if (!u) { res.redirect(`${frontendURL}/?error=auth_failed`); return; }
    loginFreshSession(req, u, (err) => {
      if (err) { res.redirect(`${frontendURL}/?error=auth_failed`); return; }
      req.session.save(() => {
        res.redirect(`${frontendURL}/dashboard`);
      });
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

router.get("/auth/me", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const u = req.user as {
    id: number; name: string; email: string; avatarUrl: string | null;
    isAnonymous: boolean;
    googleId: string | null; showPresence: boolean; shareBreathLocation: boolean;
    correspondenceImprintCompleted: boolean; gatheringImprintCompleted: boolean;
    onboardingCompleted: boolean; dailyBellTime: string | null;
    prayerInviteLastShownDate: string | null;
    prayerInviteLastShownAt: Date | string | null;
    phoneNumber: string | null;
    phoneVerifiedAt: Date | string | null;
    discoverableByPhone: boolean;
    climateEnrolled: boolean;
    climateOnboardingCompleted: boolean;
    climateOnly: boolean;
    jardinEnrolled: boolean;
    jardinOnly: boolean;
    parishId: number | null;
    parishFeedId: number | null;
    bellEnabled: boolean;
    locale: string | null;
    homeFeedId: number | null;
    feedFirstHome: boolean;
    homeLayout: { order: string[]; hidden: string[]; v?: number } | null;
    customAnchors: { defs: unknown[]; log: Record<string, unknown>; updatedAt?: number; tombstones?: Record<string, number> } | null;
    ruleConfig: { values: Record<string, string>; updatedAt: number } | null;
    silenceLadder: { enabled: boolean; level: number; levelDays: number; missStreak: number; lastEvalDate: string } | null;
    restDays: number[];
    pushEnabled: boolean;
    emailEnabled: boolean;
  };
  // Phoebe Parish access tier. Computed server-side so every page that
  // calls useAuth() knows immediately whether to render the simplified
  // parish-only UI or the full app — no per-page round-trip needed.
  // Gated by the parish feature flag — when off (the current default
  // while Parish is tucked away) every existing user reads as "full"
  // tier, no DB round-trip, no behavior change.
  const access = PHOEBE_PARISH_ENABLED
    ? await getUserAccessTier(u.id)
    : { tier: "full" as const, parishFeedId: null, parishSlug: null };
  // Live El Jardín seal: a Jardín-origin account that has JOINED any
  // focus='jardin' group is restricted to the Jardín experience app-wide.
  // Derived here so every useAuth() consumer re-gates the shell the moment the
  // membership changes — join/leave invalidates /api/auth/me. Reversible:
  // leaving every Jardín group flips this back to false and restores the app.
  // These six lookups are INDEPENDENT — none uses another's result — yet this is
  // the hottest authenticated endpoint (every app/PWA open). Running them
  // sequentially made the handler's latency the SUM of six round-trips; issuing
  // them together (Promise.all) collapses it to ~one. Flags derived below:
  //  • inJardinGroup — joined any focus='jardin' group → sealed Jardín shell
  //  • isCommunityMember — joined any group → keeps the FULL app
  //  • inPilotGroup — joined a pilot group → keeps FULL app when guest flag flips
  //  • isSuperAdmin — beta_users.is_admin (table may be absent in a fresh env)
  //  • hasFellowConnection — an accepted fellow OR a pending invite → FULL app
  const [
    jardinGroupRows,
    communityMemberRows,
    pilotGroupRows,
    betaRow,
    fellowRows,
    fellowInviteRows,
  ] = await Promise.all([
    db.select({ id: groupMembersTable.id })
      .from(groupMembersTable)
      .innerJoin(groupsTable, eq(groupMembersTable.groupId, groupsTable.id))
      .where(and(
        eq(groupMembersTable.userId, u.id),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
        eq(groupsTable.focus, "jardin"),
      ))
      .limit(1),
    db.select({ id: groupMembersTable.id })
      .from(groupMembersTable)
      .where(and(
        eq(groupMembersTable.userId, u.id),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
      ))
      .limit(1),
    db.select({ id: groupMembersTable.id })
      .from(groupMembersTable)
      .innerJoin(groupsTable, eq(groupMembersTable.groupId, groupsTable.id))
      .where(and(
        eq(groupMembersTable.userId, u.id),
        sql`${groupMembersTable.joinedAt} IS NOT NULL`,
        eq(groupsTable.isPilotGroup, true),
      ))
      .limit(1),
    // beta_users can be absent in a fresh env — swallow to "not super admin".
    db.select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable)
      .where(eq(betaUsersTable.email, u.email.toLowerCase()))
      .then((rows) => rows[0])
      .catch(() => undefined),
    db.select({ id: fellowsTable.id })
      .from(fellowsTable)
      .where(eq(fellowsTable.userId, u.id))
      .limit(1),
    db.select({ id: fellowInvitesTable.id })
      .from(fellowInvitesTable)
      .where(and(
        eq(fellowInvitesTable.recipientId, u.id),
        eq(fellowInvitesTable.status, "pending"),
      ))
      .limit(1),
  ]);
  const inJardinGroup = jardinGroupRows.length > 0;
  const isCommunityMember = communityMemberRows.length > 0;
  const inPilotGroup = pilotGroupRows.length > 0;
  const isSuperAdmin = betaRow?.isAdmin === true;
  const hasFellowConnection = fellowRows.length > 0 || fellowInviteRows.length > 0;
  res.json({
    isCommunityMember,
    inPilotGroup,
    isSuperAdmin,
    hasFellowConnection,
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatarUrl,
    isAnonymous: u.isAnonymous ?? false,
    googleId: u.googleId,
    showPresence: u.showPresence,
    shareBreathLocation: u.shareBreathLocation ?? false,
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
    // Verified = an SMS code was confirmed (boolean for the client; the
    // timestamp stays server-side). discoverableByPhone is the opt-in that
    // makes a verified number findable by contacts.
    phoneVerified: !!u.phoneVerifiedAt,
    discoverableByPhone: u.discoverableByPhone ?? false,
    climateEnrolled: u.climateEnrolled ?? false,
    climateOnboardingCompleted: u.climateOnboardingCompleted ?? false,
    climateOnly: u.climateOnly ?? false,
    jardinEnrolled: u.jardinEnrolled ?? false,
    jardinOnly: u.jardinOnly ?? false,
    // Derived (not a column): member of at least one focus='jardin' group.
    inJardinGroup,
    parishId: u.parishId ?? null,
    bellEnabled: u.bellEnabled ?? false,
    locale: u.locale ?? "en",
    // Phoebe Parish — flat fields the client uses to decide UI shape.
    accessTier: access.tier,
    parishFeedId: access.parishFeedId,
    parishSlug: access.parishSlug,
    // Feed-first home — which feed (if any) leads the home screen and
    // whether the layout is currently switched on. The dashboard pairs
    // homeFeedId against the subscribed-feeds list to render the tall
    // featured card in place of the office card.
    homeFeedId: u.homeFeedId ?? null,
    feedFirstHome: u.feedFirstHome ?? true,
    // Home-screen layout (Customize page). null = not customized; the
    // dashboard derives a default from feedFirstHome.
    homeLayout: u.homeLayout ?? null,
    // Custom rituals + per-day state, synced across devices (lib/customAnchors).
    customAnchors: u.customAnchors ?? null,
    // Routine settings (office levels, slots, etc.), synced (lib/routineSync).
    ruleConfig: u.ruleConfig ?? null,
    // "Grow my silence" ladder state (enabled + current rung). Eval runs on
    // GET /api/me/silence-ladder; this is the read-only snapshot.
    silenceLadder: u.silenceLadder ?? null,
    // Phone-sabbath rest days (weekday numbers 0=Sun..6=Sat).
    restDays: Array.isArray(u.restDays) ? u.restDays : [],
    // Master notifications switch (Settings → Notifications).
    pushEnabled: u.pushEnabled ?? true,
    // Master switch for non-essential email (Settings → Emails / the
    // Unsubscribe link). Transactional mail is unaffected.
    emailEnabled: u.emailEnabled ?? true,
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

// PATCH /auth/me/breath-location — opt in/out of the Cobreathe "same air"
// feature (coarse, in-memory-only proximity; see usersTable.shareBreathLocation).
// Mirrors the presence toggle; the deserializeUser cache is busted after the
// mutating request so the next /auth/me reflects it.
router.patch("/auth/me/breath-location", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { shareBreathLocation } = req.body;
  if (typeof shareBreathLocation !== "boolean") {
    res.status(400).json({ error: "shareBreathLocation must be a boolean" });
    return;
  }
  await db.update(usersTable).set({ shareBreathLocation } as Record<string, unknown>).where(eq(usersTable.id, userId));
  if (req.user) (req.user as Record<string, unknown>).shareBreathLocation = shareBreathLocation;
  res.json({ shareBreathLocation });
});

// PATCH /auth/me/bell-enabled — simple on/off for the daily push. The full
// /api/bell/preferences endpoint also touches calendar event ids and the
// daily_bell_time string; this is a lighter affordance the climate
// settings UI uses to mute the 7am push without dragging the calendar
// integration into the toggle.
router.patch("/auth/me/bell-enabled", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { bellEnabled } = req.body;
  if (typeof bellEnabled !== "boolean") {
    res.status(400).json({ error: "bellEnabled must be a boolean" });
    return;
  }
  await db.update(usersTable).set({ bellEnabled } as Record<string, unknown>).where(eq(usersTable.id, userId));
  if (req.user) {
    (req.user as Record<string, unknown>).bellEnabled = bellEnabled;
  }
  res.json({ bellEnabled });
});

// PATCH /auth/me/email-enabled — master opt-in/out for non-essential email
// (newsletters, the weekly digest, announcements, prayer-invite prompts). The
// email footer's Unsubscribe link sets this false without a login; this is the
// in-app equivalent (Settings → Emails). Transactional mail (password resets,
// magic links) is never gated by this flag.
router.patch("/auth/me/email-enabled", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { emailEnabled } = req.body as { emailEnabled?: unknown };
  if (typeof emailEnabled !== "boolean") {
    res.status(400).json({ error: "emailEnabled must be a boolean" });
    return;
  }
  await db.update(usersTable).set({ emailEnabled } as Record<string, unknown>).where(eq(usersTable.id, userId));
  if (req.user) {
    (req.user as Record<string, unknown>).emailEnabled = emailEnabled;
  }
  res.json({ emailEnabled });
});

// PATCH /auth/me/locale — switch the user's UI language. Currently
// only "en" and "es" are accepted; "es" is beta-gated client-side
// (the settings toggle is hidden unless useBetaStatus().rawIsBeta is
// true). The API itself is permissive — it'll accept "es" from any
// signed-in user — so a future rollout doesn't need a server change.
router.patch("/auth/me/locale", async (req, res): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = (req.user as { id: number }).id;
  const { locale } = req.body as { locale?: unknown };
  if (typeof locale !== "string" || (locale !== "en" && locale !== "es")) {
    res.status(400).json({ error: "locale must be 'en' or 'es'" });
    return;
  }
  await db.update(usersTable).set({ locale } as Record<string, unknown>).where(eq(usersTable.id, userId));
  res.json({ locale });
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
    // Data-URI avatars must be a raster image. Rejects data:text/html and
    // data:image/svg+xml so a crafted data URI can't smuggle markup/script
    // into any render context that isn't a plain <img> (defense-in-depth).
    if (avatarUrl && avatarUrl.startsWith("data:") && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(avatarUrl)) {
      res.status(400).json({ error: "Avatar must be a PNG, JPEG, WebP, or GIF image" }); return;
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
  // Revoke the persistent token for this device, if the client sent one.
  // Tokens are per-device, so other signed-in devices keep working.
  const { persistentToken } = (req.body ?? {}) as { persistentToken?: string };
  if (typeof persistentToken === "string" && persistentToken.length >= 32) {
    await revokePersistentToken(persistentToken).catch((err) => {
      console.warn("[auth/logout] failed to revoke persistent token:", err);
    });
  }

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

// ─── Persistent auth tokens ──────────────────────────────────────────────────
// Long-lived per-device tokens that outlast the session cookie. The client
// stashes one in a durable store (Capacitor Preferences on iOS, mirrored
// from localStorage with the `phoebe:persist:` prefix) right after a
// successful login, and replays it on /auth/exchange-token if /auth/me
// ever comes back 401 — typically after an iOS app upgrade purges the
// WKWebView cookie jar, or NSHTTPCookieStorage drops a cookie that hadn't
// been flushed to disk before the user force-quit the app. See the
// rationale in lib/db/src/schema/persistent_auth_tokens.ts.
//
// Each call rotates the token (one-time-use) so a stolen value can't be
// replayed forever. We don't expire tokens by time — the whole point is
// to outlast cookies. Explicit logout revokes a single device's token;
// password change / account delete revokes all tokens for the user.

// SHA-256 of a persistent token (hex). We store ONLY the hash at rest, so a DB
// leak can't be replayed against /exchange-token — the plaintext lives solely
// in the client's durable store. The token is 256 bits of CSPRNG output, so a
// plain hash (no salt/iteration) is sufficient and keeps lookup a single index
// hit.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Persistent tokens get a 90-day TTL. They rotate on every exchange, so an
// active user's token is continually refreshed; the TTL only reaps a token for
// a device that hasn't reached for one in 90 days.
const PERSISTENT_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Mint a fresh persistent token for a user. Returns the PLAINTEXT (shipped to
// the client); the DB only ever holds its hash + a hard expiry. The plaintext
// is never persisted anywhere but the response.
async function mintPersistentToken(userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.insert(persistentAuthTokensTable).values({
    userId,
    token: hashToken(token),
    expiresAt: new Date(Date.now() + PERSISTENT_TOKEN_TTL_MS),
  });
  return token;
}

// Revoke a single token (e.g. on logout from this device). Idempotent —
// safe to call with a stale/unknown value. Matches the stored hash (new rows)
// or the raw value (legacy plaintext rows that haven't rotated yet).
async function revokePersistentToken(token: string): Promise<void> {
  await db
    .update(persistentAuthTokensTable)
    .set({ revokedAt: new Date() })
    .where(and(
      or(
        eq(persistentAuthTokensTable.token, hashToken(token)),
        eq(persistentAuthTokensTable.token, token),
      ),
      isNull(persistentAuthTokensTable.revokedAt),
    ));
}

// Revoke EVERY token for a user. Call on password change / account delete /
// "sign me out of all devices" so a compromised token can't keep a
// foothold after the user has rotated their credentials.
export async function revokeAllPersistentTokensForUser(userId: number): Promise<void> {
  await db
    .update(persistentAuthTokensTable)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(persistentAuthTokensTable.userId, userId),
      isNull(persistentAuthTokensTable.revokedAt),
    ));
}

// ─── Password helpers ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
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

// ─── POST /api/auth/persistent-token ─────────────────────────────────────────
// Mints a new long-lived token for the authenticated user. The client
// should call this right after every successful login (password, Google,
// Apple, magic-link, registration) and stash the returned token in a
// durable store. See the comment block above `mintPersistentToken` for the
// full rationale.
router.post("/auth/persistent-token", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const userId = (req.user as { id: number }).id;
  try {
    const token = await mintPersistentToken(userId);
    res.json({ token });
  } catch (err) {
    console.error("[auth/persistent-token] mint failed:", err);
    res.status(500).json({ error: "Failed to mint token." });
  }
});

// ─── POST /api/auth/exchange-token ───────────────────────────────────────────
// Anonymous endpoint. Accepts a previously-minted persistent token and, if
// it's still valid + non-revoked, logs the user in via Passport so the
// browser picks up a fresh session cookie. Rotates the token on success
// (one-time-use) and returns the replacement so the client can keep its
// durable store in sync. A failed exchange returns 401 and the client
// should clear its stored token to avoid replaying a known-bad value.
router.post(
  "/auth/exchange-token",
  // Same conservative cap as password login — a leaked token is still a
  // credential, and brute-forcing the 256-bit token space is impractical,
  // but the rate limit makes that extra impossible.
  rateLimit({
    name: "auth_exchange_token",
    max: 30,
    windowMs: 15 * 60 * 1000,
    message: "Too many session refresh attempts. Please try again in a few minutes.",
  }),
  async (req, res): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== "string" || token.length < 32) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  // Atomic claim: revoke the row in the same statement that checks it's
  // still active. Two concurrent /exchange-token requests with the same
  // token can otherwise both pass the "is it revoked?" read, both
  // rotate, both mint replacement tokens, and double-revoke the
  // original — wasting a second mint and leaving stale rows behind.
  // RETURNING * tells us whether OUR statement was the one that
  // flipped revokedAt; if not, somebody else won the race and we 401.
  const nowTs = new Date();
  const [claimed] = await db
    .update(persistentAuthTokensTable)
    .set({ revokedAt: nowTs, lastUsedAt: nowTs })
    .where(and(
      // New tokens are stored hashed; legacy rows may still be plaintext.
      or(
        eq(persistentAuthTokensTable.token, hashToken(token)),
        eq(persistentAuthTokensTable.token, token),
      ),
      isNull(persistentAuthTokensTable.revokedAt),
      // TTL: reject an expired token. Legacy rows (NULL expiresAt) are
      // grandfathered until they next rotate into a TTL'd replacement.
      or(
        isNull(persistentAuthTokensTable.expiresAt),
        gt(persistentAuthTokensTable.expiresAt, nowTs),
      ),
    ))
    .returning({
      id: persistentAuthTokensTable.id,
      userId: persistentAuthTokensTable.userId,
    });

  if (!claimed) {
    res.status(401).json({ error: "invalid_or_revoked" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, claimed.userId));
  if (!user) {
    res.status(401).json({ error: "user_missing" });
    return;
  }
  let nextToken: string;
  try {
    nextToken = await mintPersistentToken(user.id);
  } catch (err) {
    console.error("[auth/exchange-token] mint replacement failed:", err);
    res.status(500).json({ error: "internal_error" });
    return;
  }

  loginFreshSession(req, user as Express.User, (err) => {
    if (err) {
      console.error("[auth/exchange-token] req.login failed:", err);
      res.status(500).json({ error: "login_failed" });
      return;
    }
    req.session.save(() => res.json({ ok: true, token: nextToken }));
  });
});

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
  const { email, name, password, groupSlug, groupInviteToken, website, officesOnly, subscribeToFeedSlug, anonAmenSessionId } = (req.body ?? {}) as {
    email?: string; name?: string; password?: string;
    groupSlug?: string; groupInviteToken?: string;
    // Honeypot: a hidden field no real browser user will ever fill in.
    // Bots that blindly fill every input trigger this and get a 400 that
    // looks identical to a validation failure (no tell-tale "bot detected"
    // response, so they won't adapt).
    website?: string;
    // Set true by the public /pray sign-up — creates a limited
    // "offices-only" account (Daily Office / Devotion only; no groups,
    // no prayer requests). Self-limiting, so it's safe to honor from an
    // unauthenticated request. If a community invite is also present
    // the user joins the group and the derived tier becomes "full" —
    // community membership wins (see lib/parishGate.ts).
    officesOnly?: boolean;
    // Set by the public /feed/:slug landing page — auto-subscribes the
    // new account to that specific feed atomically with creation. Only
    // honored for live + public feeds (server-verified); a stray slug
    // for a private/draft feed is silently ignored.
    subscribeToFeedSlug?: string;
    // Set by the public /p/:token share-link signup flow. Tells the
    // server to claim every anonymous_amens row keyed to this visitor's
    // localStorage session and fan them out into real
    // prayer_request_amens rows + Fellow pairs with each unique owner
    // the visitor amened. Best-effort: a failure here doesn't unwind
    // account creation, the user can still re-amen in-app afterwards.
    anonAmenSessionId?: string;
  };

  // Honeypot trip — silently reject with a generic validation error.
  if (website && website.trim().length > 0) {
    res.status(400).json({ error: "Invalid submission." }); return;
  }

  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." }); return;
  }
  // The client forms (Onboarding, public-prayer, public-feed,
  // community-join, public-letters) join first + last with a space
  // before posting. Reject anything that's empty after trimming AND
  // collapse zero-width / control characters that a bot could use to
  // submit a "visually empty" name. Also cap at 120 chars so a runaway
  // paste can't bloat the row.
  const trimmedName = typeof name === "string"
    ? name.replace(/[​-‍﻿]/g, "").trim()
    : "";
  if (trimmedName.length < 1) {
    res.status(400).json({ error: "Your name is required." }); return;
  }
  if (trimmedName.length > 120) {
    res.status(400).json({ error: "Please use a shorter name." }); return;
  }
  if (!password || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." }); return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
  if (existing) {
    res.status(400).json({ error: "An account with that email already exists." }); return;
  }

  // ── Eligibility ────────────────────────────────────────────────────────
  // Open signup. Anyone can create an account; the post-signup welcome
  // flow funnels them to climate (one-tap) or community discovery
  // (admin-approved request). The legacy beta_users / invite-token gate
  // is preserved here only for its side effect of auto-joining the
  // group at registration time when an invite link IS used. That branch
  // still works, but no longer GATES signup.
  let inviteMember: { id: number; groupId: number; email: string } | null = null;
  let inviteGroupSlug: string | null = null;
  let communityWideGroupId: number | null = null;
  if (groupSlug && groupInviteToken) {
    const [group] = await db.select({
      id: groupsTable.id,
      slug: groupsTable.slug,
      inviteToken: groupsTable.inviteToken,
    }).from(groupsTable).where(eq(groupsTable.slug, groupSlug));
    if (group) {
      // A. Community-wide token
      if (group.inviteToken && group.inviteToken === groupInviteToken) {
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
          inviteMember = member;
          inviteGroupSlug = group.slug;
        }
      }
    }
  }

  // ── Create (or upgrade) the user ───────────────────────────────────────
  const passwordHash = await hashPassword(password);
  // If this request already holds an ANONYMOUS DEVICE session (the public
  // no-login guest signing up to "save" their practice), UPGRADE that same
  // user row in place rather than minting a fresh account. Because the id is
  // unchanged, everything already keyed to it — the streak / prayer_sessions,
  // contemplation minutes, Co-Breathe log, push tokens (and thus the daily
  // bell), and the server rule_config — carries straight into the real
  // account, with nothing to migrate. The email-uniqueness check above already
  // proved `normalizedEmail` is free, so claiming it on the anon row is safe.
  // We keep onboarding_completed=true (it was, as a guest) so the converting
  // user lands right back on their home instead of being bounced into the
  // new-account tour. A truly logged-out visitor still gets a fresh insert.
  const anonUserId =
    req.user && (req.user as { isAnonymous?: boolean }).isAnonymous
      ? (req.user as { id: number }).id
      : null;
  let user: typeof usersTable.$inferSelect | undefined;
  if (anonUserId != null) {
    [user] = await db
      .update(usersTable)
      .set({
        email: normalizedEmail,
        name: trimmedName,
        passwordHash,
        isAnonymous: false,
        officesOnly: officesOnly === true,
      })
      .where(and(eq(usersTable.id, anonUserId), eq(usersTable.isAnonymous, true)))
      .returning();
  }
  // Fresh visitor, or the in-place upgrade didn't match a row (raced to
  // non-anon / swept) — mint a new account so registration never no-ops.
  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({ email: normalizedEmail, name: trimmedName, passwordHash, officesOnly: officesOnly === true })
      .returning();
  }

  // If they were on the waitlist, drop their entry — they have an account
  // now, so the list shouldn't keep their email indefinitely.
  try {
    await db.delete(waitlistTable).where(eq(waitlistTable.email, normalizedEmail));
  } catch (err) {
    console.error("[auth/register] waitlist cleanup failed:", err);
  }

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

  // Public-feed auto-subscribe — a visitor who landed via /feed/:slug
  // and signed up there keeps following that feed without a follow-up
  // tap. Mirrors the /api/prayer-feeds/:slug/subscribe handler's
  // reconcile step so the new subscriber's moment_user_tokens are
  // minted in lockstep with the subscription row. Best-effort: a
  // failure here doesn't unwind the account creation.
  if (typeof subscribeToFeedSlug === "string" && subscribeToFeedSlug.length > 0) {
    try {
      const { prayerFeedsTable, prayerFeedSubscriptionsTable } = await import("@workspace/db");
      const [feed] = await db
        .select({ id: prayerFeedsTable.id, state: prayerFeedsTable.state, visibility: prayerFeedsTable.visibility })
        .from(prayerFeedsTable)
        .where(eq(prayerFeedsTable.slug, subscribeToFeedSlug));
      if (feed && feed.state === "live" && feed.visibility === "public") {
        await db.insert(prayerFeedSubscriptionsTable).values({
          feedId: feed.id,
          userId: user.id,
        }).onConflictDoNothing();
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(prayerFeedSubscriptionsTable)
          .where(eq(prayerFeedSubscriptionsTable.feedId, feed.id));
        await db.update(prayerFeedsTable)
          .set({ subscriberCount: count, updatedAt: new Date() })
          .where(eq(prayerFeedsTable.id, feed.id));
        const { reconcileAllPracticesForFeed } = await import("./groups");
        await reconcileAllPracticesForFeed(feed.id);
        // Feed-first home: a portal sign-up came here FOR this feed, so
        // make it the featured card on their home screen (the slot the
        // office card normally holds). feed_first_home defaults true, so
        // setting home_feed_id is all it takes to flip the layout; the
        // user can turn it off in Settings → Home screen.
        await db.update(usersTable)
          .set({ homeFeedId: feed.id })
          .where(eq(usersTable.id, user.id));
      }
    } catch (err) {
      console.error("[auth/register] auto-subscribe to feed failed:", err);
    }
  }

  // Claim any anonymous Amens this visitor tapped from a /p/:token
  // share link. We:
  //   1. Find every unclaimed anonymous_amens row keyed to their
  //      session_id (the localStorage hex).
  //   2. INSERT a real prayer_request_amens row for each
  //      (request, user) pair — ON CONFLICT DO NOTHING so re-runs
  //      after a partial failure stay idempotent.
  //   3. Stamp claimed_by_user_id + claimed_at on the anon row so
  //      a re-run skips them and a future sweep can prune.
  //   4. For each DISTINCT request owner the visitor amened (and not
  //      themselves), insert a two-row Fellow pair (A→B, B→A) so the
  //      connection works as a single-side query on either side.
  if (typeof anonAmenSessionId === "string" && anonAmenSessionId.length >= 16) {
    try {
      const { anonymousAmensTable, prayerRequestAmensTable, prayerRequestsTable, fellowsTable } = await import("@workspace/db");
      const rows = await db
        .select({
          id: anonymousAmensTable.id,
          requestId: anonymousAmensTable.requestId,
          ownerId: prayerRequestsTable.ownerId,
        })
        .from(anonymousAmensTable)
        .innerJoin(prayerRequestsTable, eq(prayerRequestsTable.id, anonymousAmensTable.requestId))
        .where(and(
          eq(anonymousAmensTable.sessionId, anonAmenSessionId),
          isNull(anonymousAmensTable.claimedAt),
        ));

      if (rows.length > 0) {
        // Fan out into prayer_request_amens. ON CONFLICT lets the
        // unique (request_id, user_id) constraint dedupe if the
        // visitor somehow also amened in-app later under the same
        // account — shouldn't happen on first signup, but the
        // constraint keeps us safe.
        await db
          .insert(prayerRequestAmensTable)
          .values(rows.map(r => ({ requestId: r.requestId, userId: user.id })))
          .onConflictDoNothing();

        // Mark every anon row as claimed.
        const anonIds = rows.map(r => r.id);
        await db
          .update(anonymousAmensTable)
          .set({ claimedByUserId: user.id, claimedAt: new Date() })
          .where(inArray(anonymousAmensTable.id, anonIds));

        // Two-row Fellow pairs for each unique owner. Skip self
        // (an owner could share their own link to themselves while
        // logged out — degenerate case, just ignore).
        const distinctOwners = Array.from(new Set(rows.map(r => r.ownerId))).filter(oid => oid !== user.id);
        if (distinctOwners.length > 0) {
          const fellowRows = distinctOwners.flatMap(oid => [
            { userId: user.id, fellowUserId: oid, source: "shared_prayer" },
            { userId: oid, fellowUserId: user.id, source: "shared_prayer" },
          ]);
          await db
            .insert(fellowsTable)
            .values(fellowRows)
            .onConflictDoNothing();
        }
      }
    } catch (err) {
      console.error("[auth/register] anon-amen claim failed:", err);
    }
  }

  loginFreshSession(req, user as Express.User, (err) => {
    if (err) { res.status(500).json({ error: "Login failed after registration." }); return; }
    req.session.save(() => res.json({ ok: true, joinedGroupSlug: inviteGroupSlug }));
  });
});

// ─── POST /api/auth/anonymous ─────────────────────────────────────────────────
// PUBLIC no-login version: silently provision an ANONYMOUS DEVICE USER on first
// guest boot — no credentials, a synthetic unique email, is_anonymous=true —
// and issue the normal session cookie. This is what makes guest push tokens,
// the daily-reminder bell, and prefs/routine sync work through the existing
// user-keyed machinery while the UX stays completely login-free ("the device
// inherently has a user id"). Anonymous users: never discoverable, always the
// light app shape (useGuestMode), swept by retention when long idle. A later
// real sign-in/sign-up simply replaces the session. Rate-limited per-IP —
// device provisioning is once-ever per install, so 5/hour is ample.
router.post(
  "/auth/anonymous",
  rateLimit({
    name: "auth_anonymous",
    max: 5,
    windowMs: 60 * 60 * 1000,
    message: "Too many attempts from your network. Please try again in an hour.",
  }),
  async (req, res): Promise<void> => {
    // Already signed in (anonymous or real) — this device is provisioned.
    if (req.user) { res.json({ ok: true, already: true }); return; }
    const [user] = await db
      .insert(usersTable)
      .values({
        // "Friend" — the warm generic the app already uses for the unnamed.
        name: "Friend",
        // Synthetic, unique, and self-describing; satisfies the NOT NULL +
        // UNIQUE email column while never colliding with a real address.
        email: `anon-${randomBytes(16).toString("hex")}@device.withphoebe.app`,
        isAnonymous: true,
        // The device lands STRAIGHT on the seeded home — an anonymous user
        // must never be bounced into the account onboarding tour (the
        // dashboard redirects any signed-in user without this flag).
        onboardingCompleted: true,
      })
      .returning();
    loginFreshSession(req, user as Express.User, (err) => {
      if (err) { res.status(500).json({ error: "Could not start a session." }); return; }
      req.session.save(() => res.json({ ok: true, id: user.id }));
    });
  },
);

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
  const { email, password } = (req.body ?? {}) as { email?: string; password?: string };

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

  loginFreshSession(req, user as Express.User, (err) => {
    if (err) { res.status(500).json({ error: "Login failed." }); return; }
    req.session.save(() => res.json({ ok: true }));
  });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
// Rate-limited tightly. The endpoint always returns ok: true to prevent email
// enumeration, which makes it a tempting target for two abuses:
//   • Email-bombing — flooding a known user's inbox with reset links
//   • Token-rotation — repeatedly invalidating a user's outstanding reset
//     token (each successful call overwrites resetToken on the row)
// Three caps:
//   • Per-IP: 10 / hour (typical user issues 1, abusers issue many)
//   • Per-email: 5 / hour (a real user typo-ing into a different address
//     can still recover; an abuser knowing one email can't bomb it)
//   • Global: keeps the Gmail send quota safe
router.post(
  "/auth/forgot-password",
  rateLimit({
    name: "auth_forgot_password_ip",
    max: 10,
    windowMs: 60 * 60 * 1000,
    message: "Too many password reset requests from your network. Please try again later.",
  }),
  rateLimit({
    name: "auth_forgot_password_email",
    max: 5,
    windowMs: 60 * 60 * 1000,
    keyFn: (req) => {
      const e = (req.body as { email?: string } | undefined)?.email;
      return typeof e === "string" && e.length > 0 ? e.trim().toLowerCase() : null;
    },
    message: "Too many password reset requests for this account. Please try again later.",
  }),
  async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." }); return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));

  // Always return success to prevent email enumeration. Two cases bail
  // here without sending mail: (a) no account, (b) account exists but
  // was created via OAuth and has no passwordHash — the reset flow would
  // create a half-state where they can password-login an account they
  // only ever used Google for, which is surprising. They should keep
  // using Google sign-in. Logged at info so ops can diagnose "I never
  // got my reset email" reports — the user still sees the generic ok:
  // true, so no enumeration leak.
  if (!user) {
    console.info(`[forgot-password] No matching account — silent no-op`);
    res.json({ ok: true }); return;
  }
  if (!user.passwordHash) {
    console.info(`[forgot-password] user ${user.id} is OAuth-only (no passwordHash) — silent no-op`);
    res.json({ ok: true }); return;
  }

  const token = randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  // Store only the SHA-256 HASH of the token, never the token itself. The raw
  // token is a live ~1-hour account-takeover credential; keeping just its hash
  // at rest means a leaked DB backup (or a read-only SQL leak) can't be used to
  // reset anyone's password. The raw token goes to the user's email only, and
  // reset-password below re-hashes the incoming token to look the row up.
  await db.update(usersTable)
    .set({ resetToken: hashToken(token), resetTokenExpiry: expiry } as Record<string, unknown>)
    .where(eq(usersTable.id, user.id));

  const resetUrl = `${getInviteBaseUrl()}/reset-password?token=${token}`;

  // sendPasswordResetEmail returns false on failure (it doesn't throw).
  // NEVER log the resetUrl/token or the email: the token is a live ~1-hour
  // account-takeover credential and the logs are operator-readable. On
  // failure, log only the userId — an admin can re-trigger the reset email
  // rather than reconstruct the link from logs.
  const sent = await sendPasswordResetEmail({
    to: normalizedEmail,
    name: user.name,
    resetUrl,
  });
  if (sent) {
    console.info(`[forgot-password] reset email sent to user ${user.id}`);
  } else {
    console.warn(`[forgot-password] reset email send FAILED for user ${user.id}`);
  }

  res.json({ ok: true });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
router.post(
  "/auth/reset-password",
  // Per-IP cap. The token is 256-bit random (guessing is infeasible), so this
  // exists only to bound password-hashing CPU from a flood of reset attempts.
  rateLimit({
    name: "auth_reset_password_ip",
    max: 20,
    windowMs: 60 * 60 * 1000,
    message: "Too many password reset attempts from your network. Please try again later.",
  }),
  async (req, res): Promise<void> => {
  const { token, password } = req.body as { token?: string; password?: string };

  if (!token) { res.status(400).json({ error: "Reset token is required." }); return; }
  if (!password || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." }); return;
  }

  // Look up by the token's hash — the DB stores only the hash (see
  // forgot-password above). A 256-bit random token means no collision risk.
  const [user] = await db.select().from(usersTable).where(eq(usersTable.resetToken, hashToken(token)));

  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    res.status(400).json({ error: "This reset link has expired or is invalid." }); return;
  }

  const passwordHash = await hashPassword(password);
  // A password change is a credential rotation — the old set of
  // devices must be fully evicted before we tell the user the reset
  // succeeded, otherwise a stolen persistent token could still
  // /exchange-token its way back into a session under the new
  // password's account. Wrap both writes in a transaction so either
  // both land or neither does; a failed revoke must NOT leave the
  // password changed and the stolen tokens still valid.
  try {
    await db.transaction(async (tx) => {
      await tx.update(usersTable)
        .set({ passwordHash, resetToken: null, resetTokenExpiry: null } as Record<string, unknown>)
        .where(eq(usersTable.id, user.id));
      await tx
        .update(persistentAuthTokensTable)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(persistentAuthTokensTable.userId, user.id),
          isNull(persistentAuthTokensTable.revokedAt),
        ));
    });
  } catch (err) {
    console.error("[auth/reset-password] transaction failed:", err);
    res.status(500).json({ error: "Couldn't reset your password. Please try again." });
    return;
  }

  res.json({ ok: true });
});

export { passport };
export default router;
