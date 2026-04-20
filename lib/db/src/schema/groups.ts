import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const groupsTable = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  slug: text("slug").notNull().unique(),
  emoji: text("emoji"),
  calendarUrl: text("calendar_url"),
  // Shareable community invite token. Anyone with this token can join the
  // group via /communities/join/:slug/:token — no per-email invite needed.
  // Admin-rotatable. Nullable so legacy rows keep compiling; the startup
  // migration backfills every existing group with a fresh token.
  inviteToken: text("invite_token").unique(),
  // ── Prayer Circles (beta) ─────────────────────────────────────────────
  // A prayer circle is a group with an added dimension of shared prayer:
  // a stated `intention` the circle is praying for together, optionally
  // expanded by `circleDescription`. When `isPrayerCircle` is true the
  // creation UI requires `intention` and the detail page surfaces it above
  // the regular group content. Non-circle groups leave these null and
  // behave exactly as before.
  isPrayerCircle: boolean("is_prayer_circle").notNull().default(false),
  intention: text("intention"),
  circleDescription: text("circle_description"),
  createdByUserId: integer("created_by_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Prayer Circle: daily focus ─────────────────────────────────────────────
// Each prayer circle can name — per day — the people, causes, or situations
// it is holding in prayer. Members see today's focus on the circle page and
// through the daily bell. At end of day the row stays (history is preserved)
// but the circle page shows only today's entries by default.
//
// `focusDate` is a YYYY-MM-DD string in the *adder's* timezone at the moment
// they posted it — matches how bell_notifications stores `bell_date`. Good
// enough for beta; viewers in wildly different timezones may briefly see
// "yesterday's" focus. We stay with this convention rather than introducing
// a new timezone-per-circle concept.
//
// `focusType` discriminates the card rendering:
//   - "person"    → subjectUserId points at a Phoebe user (avatar + name)
//   - "situation" → subjectText names a situation or event
//   - "cause"     → subjectText names a cause or social justice issue
//   - "custom"    → free text (person outside Phoebe, anything else)
// Exactly one of subjectUserId / subjectText is populated; the API enforces.
export const circleDailyFocusTable = pgTable("circle_daily_focus", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  focusDate: text("focus_date").notNull(), // YYYY-MM-DD, adder's timezone
  focusType: text("focus_type").notNull(), // person | situation | cause | custom
  subjectUserId: integer("subject_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  subjectText: text("subject_text"),
  addedByUserId: integer("added_by_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const groupMembersTable = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .references(() => usersTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  name: text("name"),
  role: text("role").notNull().default("member"), // "admin" | "member"
  inviteToken: text("invite_token").notNull().unique(),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Beta access — admin-managed list of users who can access demo features
export const betaUsersTable = pgTable("beta_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  addedByUserId: integer("added_by_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  isAdmin: boolean("is_admin").notNull().default(false),
  seenWelcome: boolean("seen_welcome").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Per-admin per-event acknowledgment log so the "new arrival" popup in the
// community detail view fires exactly once per admin per event. Holds a row
// the first time an admin dismisses a notification; the list endpoint
// left-anti-joins against this table to hide already-seen events. Kinds:
//   - "member_joined"  → eventId = group_members.id
//   - "prayer_request" → eventId = prayer_requests.id
// Unique index on (adminUserId, groupId, kind, eventId) enforces idempotency
// — the ack POST uses ON CONFLICT DO NOTHING so double-clicks are harmless.
export const groupAdminNotificationsAckTable = pgTable("group_admin_notifications_ack", {
  id: serial("id").primaryKey(),
  adminUserId: integer("admin_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "member_joined" | "prayer_request"
  eventId: integer("event_id").notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
});

// Lightweight announcements for group admins (simpler than full letter system)
export const groupAnnouncementsTable = pgTable("group_announcements", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
