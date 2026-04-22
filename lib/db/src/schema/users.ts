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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
