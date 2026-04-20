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
  createdByUserId: integer("created_by_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
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
