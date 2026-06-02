import { pgTable, serial, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { encryptedText } from "./encrypted-text";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  googleId: text("google_id").unique(),
  // Apple Sign In "sub" claim from the verified identity token — stable
  // per Apple ID. Null for users who only signed in via Google or
  // email/password. Mirrors googleId so native auth paths stay parallel.
  appleId: text("apple_id").unique(),
  // Encrypted at rest (AES-256-GCM) via the transparent column type when
  // TOKEN_ENC_KEY is set; plaintext passthrough otherwise. Reads/writes
  // are transparent to every consumer.
  googleAccessToken: encryptedText("google_access_token"),
  googleRefreshToken: encryptedText("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry", { withTimezone: true }),
  passwordHash: text("password_hash"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry", { withTimezone: true }),
  showPresence: boolean("show_presence").notNull().default(true),
  correspondenceImprintCompleted: boolean("correspondence_imprint_completed").notNull().default(false),
  gatheringImprintCompleted: boolean("gathering_imprint_completed").notNull().default(false),
  bellEnabled: boolean("bell_enabled").notNull().default(false),
  // Master notifications switch (Settings → Notifications). When false,
  // every push is suppressed — the single gate in sendPushToUser checks
  // this, so it silences the bell, reminders, digests, prayer-for-you,
  // words of comfort, everything. Default true so existing users keep
  // receiving notifications until they opt out.
  pushEnabled: boolean("push_enabled").notNull().default(true),
  // Master switch for non-essential ("bulk") EMAIL — newsletters,
  // announcements, the weekly prayer-feed digest, and community
  // prayer-invite prompts. The email-channel sibling of pushEnabled:
  // when false those sends are suppressed (the single gate lives in
  // lib/email.ts). Transactional mail (password reset, magic links) is
  // NOT gated — it always sends. Default true so existing users keep
  // receiving until they unsubscribe (the footer link on every bulk
  // email, or Settings → Emails). The unsubscribe link flips this false.
  emailEnabled: boolean("email_enabled").notNull().default(true),
  dailyBellTime: text("daily_bell_time"),           // HH:MM format, e.g. "07:00"
  timezone: text("timezone"),                        // IANA timezone, e.g. "America/New_York"
  bellCalendarEventId: text("bell_calendar_event_id"), // Google Calendar event ID for the daily bell
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  // Last local date (YYYY-MM-DD) we showed the daily prayer-slideshow invite
  // popup on the dashboard. Kept for historical reference — the live gate
  // is prayerInviteLastShownAt below, which re-shows the popup every six
  // hours if the user still hasn't prayed.
  prayerInviteLastShownDate: text("prayer_invite_last_shown_date"),
  // Timestamp of the last time the daily-prayer-list popup was shown.
  // The dashboard gate is: if the user hasn't prayed today AND the
  // popup was last shown more than 6 hours ago (or never), show it
  // again. Server-truth so every device sees the same cooldown.
  prayerInviteLastShownAt: timestamp("prayer_invite_last_shown_at", { withTimezone: true }),
  // Daily prayer-list streak. Incremented once per local-TZ day when the
  // user completes their prayer list; resets to 1 if a day is missed.
  // prayerStreakLastDate is YYYY-MM-DD in the user's timezone.
  prayerStreakCount: integer("prayer_streak_count").notNull().default(0),
  prayerStreakLastDate: text("prayer_streak_last_date"),
  // ── Phone-number contact discovery ───────────────────────────────────────
  // phoneNumber is the display form (what the user typed); normalized is
  // the canonical E.164 ("+15555550123") used for the unique-per-account
  // index; phoneHash is SHA-256(normalized), the only column we read from
  // when matching uploaded device-contact hashes. Verification (SMS) is
  // deferred — for the v1 trust model we always render the matched user's
  // own Phoebe display name + avatar, never the uploader's contact-book
  // label, so an impersonator can't masquerade as someone else's contact
  // entry. See routes/users.ts (POST /me/phone) and routes/contacts.ts
  // (POST /match) for the matching pipeline.
  phoneNumber: text("phone_number"),
  phoneNumberNormalized: text("phone_number_normalized"),
  phoneHash: text("phone_hash"),
  climateEnrolled: boolean("climate_enrolled").notNull().default(false),
  // Distinct from `onboardingCompleted` (Phoebe's general onboarding tour).
  // Climate has its own short intro shown once after signup; this column
  // tracks completion of THAT flow. Climate users skip Phoebe's general
  // onboarding entirely (onboardingCompleted is set true at signup).
  climateOnboardingCompleted: boolean("climate_onboarding_completed").notNull().default(false),
  // True for users created via /climate signup. Distinguishes "climate-only"
  // members from existing Phoebe users who later got climate_enrolled.
  // Used in the drawer/nav to hide non-climate surfaces from the W&W
  // cohort while leaving dual users' experience intact.
  climateOnly: boolean("climate_only").notNull().default(false),
  parishId: integer("parish_id"),  // FK to groups.id, enforced only in migration SQL — no .references() here to avoid circular import
  // ── Phoebe Parish ─────────────────────────────────────────────────────────
  // FK to prayer_feeds.id when the feed has kind="parish". This is the
  // canonical "my parish" pointer — there's also a row in
  // prayer_feed_subscriptions so the feed system's many-to-many
  // infrastructure (today's intentions, etc.) keeps working, but
  // parish_feed_id is the unique cap (one parish per user). Non-null
  // means the user signed up via the Parish flow; combined with "no
  // beta_users row + no group_members rows" they get the simplified
  // parish-only UI. Joining a community via invite link unlocks the
  // full app (the gate is a derived state, no separate flag flip
  // needed). FK constraint is added in migration SQL to avoid a
  // circular import between this schema file and prayer_feeds.
  parishFeedId: integer("parish_feed_id"),
  // True for accounts created via the public /pray page — a limited
  // tier that only has the Daily Office / Daily Devotion: no groups,
  // no prayer requests. Drives accessTier = "offices-only" (see
  // api-server/src/lib/parishGate.ts) and the social-route block in
  // api-server/src/routes/index.ts. Joining a community later still
  // upgrades them to full (the tier is derived; full wins).
  officesOnly: boolean("offices_only").notNull().default(false),
  // ── BCP Daily Office customisation ───────────────────────────────────────
  // Whether to include the BCP Confession of Sin + Absolution at the top
  // of Morning and Evening Prayer. Default ON — the office opens with the
  // penitential rite (Confession → Absolution → Opening Sentence) the way
  // most parishes pray it (BCP p. 79–80 / p. 116–117, "may be said"). The
  // user can flip the Settings toggle if they'd rather begin at the
  // Opening Sentence. (Migration at the bottom of migrate.ts flips both
  // the default and existing rows from FALSE to TRUE.)
  bcpShowConfession: boolean("bcp_show_confession").notNull().default(true),
  // The user's preferred default prayer "depth" — drives where the
  // home-screen office card's CTA sends them when they tap "Begin
  // prayer." Settings has a picker that writes this column. Values:
  //   "devotion"      — Daily Devotion (BCP short form). DEFAULT.
  //   "office"        — Full Morning/Evening Prayer (BCP long form).
  //   "intercessions" — Community Intercessions slideshow (/prayer-mode).
  // Other surfaces (the chooser screen, the office's first-slide
  // skip-pills) stay available; this just picks what the home card's
  // "Begin prayer" CTA does in a single tap.
  //   "ask"           — show the prayer chooser (the default; the
  //                     options screen with the last-prayed depth on top)
  //   "devotion"      — skip the chooser, open the BCP short form
  //   "office"        — skip the chooser, open full Morning/Evening Prayer
  //   "intercessions" — skip the chooser, open the community slideshow
  // Defaults to "ask" — the chooser is the out-of-box experience; a
  // fixed depth is an opt-in shortcut. (A one-time migration moves the
  // historical silent "devotion" default to "ask"; see migrate.ts.)
  defaultPrayerLevel: text("default_prayer_level").notNull().default("ask"),
  // ── Phoebe Parish: office reminder preferences ───────────────────────────
  // Each side of the day picks one of three values:
  //   "none"     — do not push at the morning/evening reminder hour
  //   "office"   — push the full Daily Office (Morning Prayer / Evening Prayer)
  //   "devotion" — push the abbreviated Devotion (BCP pp. 137 / 139)
  // The push fires from a per-user cron at the user's stored
  // `dailyBellTime` (morning) or a fixed evening hour (in their TZ),
  // and deep-links straight into the chosen liturgy. Default "none"
  // for legacy rows so we don't start pinging anyone without consent.
  // Morning side defaults to "devotion" — the abbreviated BCP
  // morning office (~2-3 min). The whole pitch of Phoebe is the
  // daily rhythm, and a fresh user sitting on "none" never feels
  // it. Push only fires after the user has granted notification
  // permission, so this is not a covert ping. Anyone who doesn't
  // want it flips to "none" in Settings → Daily reminders.
  // Evening stays "none" by default — two unsolicited daily pushes
  // is heavier than the warmth we're aiming for.
  parishOfficeMorningPref: text("parish_office_morning_pref").notNull().default("devotion"),
  parishOfficeEveningPref: text("parish_office_evening_pref").notNull().default("none"),
  // Optional override of the morning / evening push times (HH:MM,
  // user TZ). If null, the cron falls back to its built-in defaults
  // (dailyBellTime / 18:00). Both sides are independently set from
  // Settings → Daily reminders.
  parishOfficeMorningTime: text("parish_office_morning_time"),
  parishOfficeEveningTime: text("parish_office_evening_time"),
  // YYYY-MM-DD (parish TZ) of the last morning / evening reminder we
  // fired for this user. Idempotency for the 15-min scheduler tick:
  // we only push once per local day. NULL = never sent.
  parishOfficeMorningSentDate: text("parish_office_morning_sent_date"),
  parishOfficeEveningSentDate: text("parish_office_evening_sent_date"),
  // Daily contemplation goal, in minutes. 0 = off (no goal set → no nudge).
  // When > 0 the user gets a gentle ~7pm reminder on days they haven't yet
  // reached this many minutes of silent prayer.
  contemplationGoalMinutes: integer("contemplation_goal_minutes").notNull().default(0),
  // YYYY-MM-DD (user TZ) of the last contemplation-goal nudge we fired.
  // Idempotency for the 15-min scheduler tick — at most one nudge per local
  // day. NULL = never sent.
  contemplationGoalSentDate: text("contemplation_goal_sent_date"),
  // Whether the ~7pm "haven't hit your goal" nudge is on. Defaults true so a
  // freshly-set goal nudges by default; the user can keep a goal for tracking
  // while silencing the reminder from Settings → Daily reminders.
  contemplationReminderEnabled: boolean("contemplation_reminder_enabled").notNull().default(true),
  // Weekly Way of Love review (the Sunday-evening examen). Reminder on by
  // default; opt out in Settings. The sent-date (YYYY-MM-DD of the Sunday we
  // last nudged, user TZ) dedups the once-a-week push across 15-min ticks.
  weeklyReviewReminder: boolean("weekly_review_reminder").notNull().default(true),
  weeklyReviewNudgeSentDate: text("weekly_review_nudge_sent_date"),
  // YYYY-MM-DD (parish TZ) of the last Saturday-evening "your parish
  // prayed with you this week" recap we fired for this user. NULL =
  // never sent. Idempotent on the local Saturday so a parishioner
  // doesn't get two recap pushes in the same evening window.
  parishWeeklyRecapSentDate: text("parish_weekly_recap_sent_date"),
  // YYYY-MM-DD (UTC) of the last "How can we pray for you?" email this
  // user received. Per-user daily dedup so that if they belong to two
  // groups and both admins send the prompt on the same day, the user
  // gets the EMAIL only from the first group. Push notifications are
  // not gated by this — those still fan out per-group (an admin's
  // community shouldn't disappear just because a sibling group fired
  // earlier).
  lastPrayerInviteEmailDate: text("last_prayer_invite_email_date"),
  // ── Weekly prayer-feed digest ───────────────────────────────────────────
  // Fires Tuesday evening (user TZ) when the subscriber has any new
  // intercessions on their subscribed feeds since the previous digest.
  // The push + email + slideshow share the same "since" cutoff, which is
  // this column: YYYY-MM-DD in user-TZ of the last digest we fired.
  // NULL = never sent (first-ever digest uses a 7-day lookback). The
  // sender skips a tick when there's nothing new, so this column only
  // moves forward on a non-empty week.
  lastDigestSentDate: text("last_digest_sent_date"),
  // Per-user opt-out for the weekly digest email + push. Default on so
  // a new subscriber gets the rhythm; flipped from Settings → Weekly
  // digest. Disabling stops both channels, not just one — the digest is
  // one unified prompt.
  weeklyDigestEnabled: boolean("weekly_digest_enabled").notNull().default(true),
  // ── Feed-first home ──────────────────────────────────────────────────────
  // The prayer feed to feature in the big primary slot on the home
  // screen — the slot the Book of Common Prayer / Daily Office card
  // normally occupies. Set at signup to whichever feed's public portal
  // created the account (the /feed/:slug landing posts subscribeToFeedSlug
  // to /auth/register; that feed's id lands here). NULL = no featured
  // feed, normal office-led home. FK to prayer_feeds.id enforced in
  // migration SQL only (same circular-import dodge as parish_feed_id).
  homeFeedId: integer("home_feed_id"),
  // Toggle for the feed-first home layout. Default on so a portal
  // sign-up lands on the feed they came for; the user flips it from
  // Settings → Home screen. Only meaningful when home_feed_id is set —
  // with no featured feed the home is office-led regardless. When on
  // AND the featured feed is in the user's subscriptions, the feed gets
  // the tall PrayerOfficeCard-style card and the office card is hidden.
  feedFirstHome: boolean("feed_first_home").notNull().default(true),
  // Home-screen layout customization (Customize page, reached from the
  // "Customize" pill at the bottom of the home). Shape:
  //   { order: string[]; hidden: string[] }
  // where each entry is a home-module key ("office" | "feeds" |
  // "contemplation" | "requests"). `order` defines vertical order +
  // which module leads (first visible); `hidden` is the set switched
  // off. NULL = the user hasn't customized, so the dashboard derives a
  // sensible default from feed_first_home (preserving today's layout).
  homeLayout: jsonb("home_layout").$type<{ order: string[]; hidden: string[] }>(),
  // BCP-47 locale code (e.g. "en", "es"). Drives i18next on the client
  // and template selection in pushSender / email senders. Beta users
  // can flip this to "es" via Settings → Language; non-beta accounts
  // stay on "en". Default English so legacy rows don't need a backfill.
  locale: text("locale").notNull().default("en"),
  // ── "Places I've been prayed for" map ────────────────────────────────────
  // Opt-in, default OFF: when on AND the OS grants location permission,
  // tapping Amen attaches a coarse (~1 mile) location to that amen, so the
  // person being prayed for can see a map of where their prayers came from.
  // Location is sensitive, so this stays off until the user explicitly
  // enables it (Settings) and the OS permission prompt is granted.
  sharePrayLocation: boolean("share_pray_location").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
