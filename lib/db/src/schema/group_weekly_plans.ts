import { pgTable, serial, integer, text, date, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

// Group weekly plan (NOT YET PUBLIC — client UI is behind WEEKLY_PLAN_ENABLED).
//
// A church programs a short checklist of practices for its members to keep
// BETWEEN Sundays — e.g. "Read one CAC meditation", "Pray the Creation Prayer
// once", "Sit in silence for 10 minutes", "Listen to a podcast episode".
// Leaders (group admins) author the week's items; members see the checklist
// and tap items done. One row per item per week; the week is identified by
// its Sunday (week_start, a plain date — same Sunday-start convention as
// useRhythmState's weekStartDay and bless_week).
export const groupWeeklyItemsTable = pgTable("group_weekly_items", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  // The Sunday this week's plan begins on (YYYY-MM-DD).
  weekStart: date("week_start").notNull(),
  // What kind of practice this is — drives the icon + (later) auto-credit from
  // the practice's own completion signal. Free text for forward-compat:
  // "cac" | "cobreathe" | "silence" | "podcast" | "custom" today.
  kind: text("kind").notNull().default("custom"),
  // Display label ("Sit in silence for 10 minutes").
  title: text("title").notNull(),
  // Optional subline — a note, a link, a chapter, etc.
  detail: text("detail"),
  // Numeric target where the kind has one (silence → minutes, cobreathe →
  // times). Purely informational in v1 (completion is a manual tap).
  target: integer("target").notNull().default(1),
  sort: integer("sort").notNull().default(0),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byGroupWeek: index("group_weekly_items_by_group_week").on(t.groupId, t.weekStart),
}));

// A member's completion of one item — a checklist tick, one per member per
// item (the unique index makes the toggle idempotent).
export const groupWeeklyCompletionsTable = pgTable("group_weekly_completions", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull().references(() => groupWeeklyItemsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  oneCheckPerMember: uniqueIndex("group_weekly_completions_item_user").on(t.itemId, t.userId),
  byUser: index("group_weekly_completions_by_user").on(t.userId),
}));

export type GroupWeeklyItem = typeof groupWeeklyItemsTable.$inferSelect;
export type GroupWeeklyCompletion = typeof groupWeeklyCompletionsTable.$inferSelect;
