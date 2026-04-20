import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  googleId: text("google_id").unique(),
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
  // popup on the dashboard. Account-scoped gate so dismissing on desktop
  // also silences the phone for the rest of the day.
  prayerInviteLastShownDate: text("prayer_invite_last_shown_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
