import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A novena library entry — nine days of prayer toward a single intention,
// attributed to a saint/author. dayCount is stored (not hardcoded to 9) so
// the library isn't locked to the classic nine-day form.
export const novenasTable = pgTable("novenas", {
  id: serial("id").primaryKey(),
  // Stable identifier for the seeder to match on — title is a display value
  // that can be renamed at any time (e.g. "Novena of Saint Teresa" ->
  // "Novena of St. Teresa of Ávila"); matching seed rows by title meant a
  // rename never actually updated the row, it just silently seeded a
  // duplicate under the new title while the old row (with the user's real
  // progress attached) kept its stale title forever. code never changes.
  code: text("code").unique(),
  title: text("title").notNull(),
  saint: text("saint"),
  // How the text reached us — required for anything presented as a
  // historical prayer (e.g. "Public domain English translation").
  sourceNote: text("source_note"),
  dayCount: integer("day_count").notNull().default(9),
  // Shown on the preview/detail page alongside sourceNote — history is
  // about the text/devotion itself (who wrote it, when, why); intention is
  // what it's traditionally prayed for. Both nullable: a novena can ship
  // with just sourceNote until these are written.
  history: text("history"),
  intention: text("intention"),
  // Library list order — defaults to 0 (alphabetical-by-title tiebreak);
  // set higher to push a novena further down the list regardless of title.
  sortOrder: integer("sort_order").notNull().default(0),
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
  // When set, the route splices the actual BCP Psalter text (bcp_texts,
  // already-verified 1979 BCP translation) in ahead of `body` at render
  // time, rather than re-transcribing psalm text into seed data by hand.
  psalmNumber: integer("psalm_number"),
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
  // null (addition — rides alongside the routine as its own card) | "morning"
  // | "evening" (replace mode — takes over that side's anchor card/dot for
  // as long as this novena is active; the side's normal content resumes
  // automatically once status leaves "active", since nothing else reads
  // replacesSlot when there's no active novena).
  replacesSlot: text("replaces_slot"),
  // active | completed | abandoned
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  userIdx: index("idx_novena_progress_user").on(t.userId),
}));
