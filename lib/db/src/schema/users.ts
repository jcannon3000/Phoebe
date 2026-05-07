import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

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
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiry: timestamp("google_token_expiry", { withTimezone: true }),
  passwordHash: text("password_hash"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry", { withTimezone: true }),
  showPresence: boolean("show_presence").notNull().default(true),
  correspondenceImprintCompleted: boolean("correspondence_imprint_completed").notNull().default(false),
  gatheringImprintCompleted: boolean("gathering_imprint_completed").notNull().default(false),
  bellEnabled: boolean("bell_enabled").notNull().default(false),
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
  // ── Phoebe Parish: office reminder preferences ───────────────────────────
  // Each side of the day picks one of three values:
  //   "none"     — do not push at the morning/evening reminder hour
  //   "office"   — push the full Daily Office (Morning Prayer / Evening Prayer)
  //   "devotion" — push the abbreviated Devotion (BCP pp. 137 / 139)
  // The push fires from a per-user cron at the user's stored
  // `dailyBellTime` (morning) or a fixed evening hour (in their TZ),
  // and deep-links straight into the chosen liturgy. Default "none"
  // for legacy rows so we don't start pinging anyone without consent.
  parishOfficeMorningPref: text("parish_office_morning_pref").notNull().default("none"),
  parishOfficeEveningPref: text("parish_office_evening_pref").notNull().default("none"),
  // Optional override of the morning push time (HH:MM, parish TZ). If
  // null, falls back to dailyBellTime (the existing daily-prayer-list
  // bell). Evening push is fixed at 18:00 in the parish TZ for v1.
  parishOfficeMorningTime: text("parish_office_morning_time"),
  // YYYY-MM-DD (parish TZ) of the last morning / evening reminder we
  // fired for this user. Idempotency for the 15-min scheduler tick:
  // we only push once per local day. NULL = never sent.
  parishOfficeMorningSentDate: text("parish_office_morning_sent_date"),
  parishOfficeEveningSentDate: text("parish_office_evening_sent_date"),
  // BCP-47 locale code (e.g. "en", "es"). Drives i18next on the client
  // and template selection in pushSender / email senders. Beta users
  // can flip this to "es" via Settings → Language; non-beta accounts
  // stay on "en". Default English so legacy rows don't need a backfill.
  locale: text("locale").notNull().default("en"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
