import { pgTable, serial, text, integer, timestamp, boolean, date } from "drizzle-orm/pg-core";
import { ritualsTable } from "./rituals";
import { groupsTable } from "./groups";
import { prayerFeedsTable } from "./prayer_feeds";

export const sharedMomentsTable = pgTable("shared_moments", {
  id: serial("id").primaryKey(),
  ritualId: integer("ritual_id").references(() => ritualsTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "set null" }),
  // Alternate scope: a community intercession can be attached to a prayer
  // feed instead of a group. Subscribers of the feed receive
  // moment_user_tokens via reconcileFeedPracticeMembers, so the moment
  // surfaces in /api/moments and prayer-mode just like a group's would.
  // Mutually exclusive with groupId for now (a moment is owned by one or
  // the other), enforced at the API layer rather than via a DB check.
  prayerFeedId: integer("prayer_feed_id").references(() => prayerFeedsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  intention: text("intention").notNull(),
  loggingType: text("logging_type").notNull().default("photo"),
  reflectionPrompt: text("reflection_prompt"),
  templateType: text("template_type"),
  intercessionTopic: text("intercession_topic"),
  intercessionSource: text("intercession_source"),
  intercessionFullText: text("intercession_full_text"),
  timerDurationMinutes: integer("timer_duration_minutes").notNull().default(10),
  frequency: text("frequency").notNull().default("weekly"),
  scheduledTime: text("scheduled_time").notNull().default("08:00"),
  windowMinutes: integer("window_minutes").notNull().default(60),
  goalDays: integer("goal_days").notNull().default(30),
  dayOfWeek: text("day_of_week"),
  timezone: text("timezone").notNull().default("UTC"),
  timeOfDay: text("time_of_day"),
  momentToken: text("moment_token").notNull().unique(),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  totalBlooms: integer("total_blooms").notNull().default(0),
  state: text("state").notNull().default("active"),
  frequencyType: text("frequency_type"),
  frequencyDaysPerWeek: integer("frequency_days_per_week"),
  practiceDays: text("practice_days"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Contemplative Prayer duration
  contemplativeDurationMinutes: integer("contemplative_duration_minutes"),
  // Fasting-specific fields
  fastingType: text("fasting_type"),  // "meat" | "custom"
  fastingFrom: text("fasting_from"),
  fastingIntention: text("fasting_intention"),
  fastingFrequency: text("fasting_frequency"),
  fastingDate: text("fasting_date"),
  fastingDay: text("fasting_day"),
  fastingDayOfMonth: integer("fasting_day_of_month"),
  // Commitment fields
  commitmentDuration: integer("commitment_duration"),
  commitmentEndDate: text("commitment_end_date"),
  // Progressive goal fields (Duolingo-style)
  commitmentSessionsGoal: integer("commitment_sessions_goal"),
  commitmentSessionsLogged: integer("commitment_sessions_logged").notNull().default(0),
  commitmentGoalTier: integer("commitment_goal_tier").notNull().default(1),
  commitmentTendFreely: boolean("commitment_tend_freely").notNull().default(false),
  // Stamped when sessionsLogged first crosses sessionsGoal. Cleared on renew.
  // Used by the goal-cleanup job to remove recurring calendar events for
  // members who never renew within 2 days of reaching the goal.
  commitmentGoalReachedAt: timestamp("commitment_goal_reached_at", { withTimezone: true }),
  // When the CURRENT cycle started — original creation or most recent
  // renewal. Combined with goalDays, defines the window `[cycleStartedAt,
  // cycleStartedAt + goalDays)` that an intercession is "live" for.
  // Past the end of the window, the moment is hidden from list /
  // dashboard / slideshow surfaces regardless of bloom count.
  commitmentCycleStartedAt: timestamp("commitment_cycle_started_at", { withTimezone: true }),
  // Toggle: when true, any member of the practice can invite new people.
  // When false, only the creator can. Default is open.
  allowMemberInvites: boolean("allow_member_invites").notNull().default(true),
  // Custom emoji chosen by the creator (intercessions)
  customEmoji: text("custom_emoji"),
  // Optional outbound URL — surfaces as a "Read more" link on the
  // intercession slide so a subscriber can read background on what
  // they're praying for (news article, scripture commentary, etc.).
  // Used today by climate feed admins to attach pieces from grist.org
  // or similar, but generic — group admins can use it too.
  learnMoreUrl: text("learn_more_url"),
  // Title of the linked article, auto-fetched (page <title> / og:title)
  // when the admin saves a learnMoreUrl. Surfaced above the
  // "Learn more →" pill on the intercession slide so the reader sees
  // what they're about to open. Null when the fetch found nothing
  // (paywall, JS-only page, timeout) — the slide then shows the bare
  // pill with no caption.
  learnMoreTitle: text("learn_more_title"),
});

export type SharedMoment = typeof sharedMomentsTable.$inferSelect;

export const momentRenewalsTable = pgTable("moment_renewals", {
  id: serial("id").primaryKey(),
  momentId: integer("moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  previousIntention: text("previous_intention"),
  newIntention: text("new_intention"),
  previousIntercessionTopic: text("previous_intercession_topic"),
  newIntercessionTopic: text("new_intercession_topic"),
  renewalCount: integer("renewal_count").notNull().default(1),
  renewedAt: timestamp("renewed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const momentCalendarEventsTable = pgTable("moment_calendar_events", {
  id: serial("id").primaryKey(),
  sharedMomentId: integer("shared_moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  momentMemberId: integer("moment_member_id").notNull(),
  googleCalendarEventId: text("google_calendar_event_id"),
  icsSent: boolean("ics_sent").notNull().default(false),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  isFirstEvent: boolean("is_first_event").notNull().default(false),
  logged: boolean("logged").notNull().default(false),
  loggedAt: timestamp("logged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const momentStreakDaysTable = pgTable("moment_streak_days", {
  id: serial("id").primaryKey(),
  sharedMomentId: integer("shared_moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  practiceDate: date("practice_date").notNull(),
  membersLogged: integer("members_logged").notNull().default(0),
  bloomed: boolean("bloomed").notNull().default(false),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
});

// Additional groups an intercession is shared with, beyond the primary
// sharedMomentsTable.groupId. A row here means "this moment shows up in
// this group's community view and contributes to this group's metrics".
// The primary groupId is NOT duplicated here — treat it as the "owner"
// group and this table as "also visible from".
export const momentGroupsTable = pgTable("moment_groups", {
  id: serial("id").primaryKey(),
  momentId: integer("moment_id").notNull().references(() => sharedMomentsTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
