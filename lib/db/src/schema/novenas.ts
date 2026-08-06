import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A novena library entry — nine days of prayer toward a single intention,
// attributed to a saint/author. dayCount is stored (not hardcoded to 9) so
// the library isn't locked to the classic nine-day form.
export const novenasTable = pgTable("novenas", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  saint: text("saint"),
  // How the text reached us — required for anything presented as a
  // historical prayer (e.g. "Public domain English translation").
  sourceNote: text("source_note"),
  dayCount: integer("day_count").notNull().default(9),
  // Soft-hide from the library without losing anyone's in-progress state.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const novenaDaysTable = pgTable("novena_days", {
  id: serial("id").primaryKey(),
  novenaId: integer("novena_id").notNull()
    .references(() => novenasTable.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  title: text("title"),
  body: text("body").notNull(),
}, (t) => ({
  uniqDay: uniqueIndex("uniq_novena_day").on(t.novenaId, t.dayNumber),
}));

// A user's novena state — AT MOST ONE row with status='active' per user
// (enforced by the partial unique index in migrate.ts), since only one
// novena can ride the daily routine at a time.
//
// currentDay advances ONLY when the user marks that day's prayer complete —
// never by the calendar. lastCompletedLocalDate (YYYY-MM-DD, the user's own
// timezone, same convention as practice_completion) is how "already prayed
// today's day" resets each morning without any date math server-side: the
// client just compares it to today's local date.
export const novenaProgressTable = pgTable("novena_progress", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  novenaId: integer("novena_id").notNull().references(() => novenasTable.id, { onDelete: "cascade" }),
  currentDay: integer("current_day").notNull().default(1),
  lastCompletedLocalDate: text("last_completed_local_date"),
  // active | completed | abandoned
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("idx_novena_progress_user").on(t.userId),
}));
