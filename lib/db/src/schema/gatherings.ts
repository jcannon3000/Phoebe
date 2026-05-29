import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

// A leader-initiated scheduling gathering. Unlike `rituals` (which are
// confirmed, recurring meetups), a gathering starts in "forming" status while
// the leader collects availability rhythms from members, then moves to
// "scheduled" once a standing slot is confirmed.
export const scheduledGatheringsTable = pgTable("scheduled_gatherings", {
  id: serial("id").primaryKey(),
  communityId: integer("community_id").references(() => groupsTable.id, { onDelete: "set null" }),
  leaderUserId: integer("leader_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  cadence: text("cadence").notNull().default("weekly"), // weekly | fortnightly | monthly | seasonal
  durationMin: integer("duration_min").notNull().default(60),
  expectedSize: integer("expected_size"),
  needsRoom: boolean("needs_room").notNull().default(false),
  needsClergy: boolean("needs_clergy").notNull().default(false),
  visibility: text("visibility").notNull().default("community"), // public | community | private
  status: text("status").notNull().default("forming"), // forming | scheduled | active | archived
  seasonWindow: jsonb("season_window").$type<{ start: string; end: string } | null>(),
  confirmedDayOfWeek: integer("confirmed_day_of_week"),
  confirmedTime: text("confirmed_time"), // HH:MM
  confirmedStartDate: text("confirmed_start_date"), // YYYY-MM-DD
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ScheduledGathering = typeof scheduledGatheringsTable.$inferSelect;
export type InsertScheduledGathering = typeof scheduledGatheringsTable.$inferInsert;
