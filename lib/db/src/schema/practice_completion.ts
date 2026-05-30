import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Practice completion (Way of Love beta home) ───────────────────────────
//
// One row = "the user marked this Way of Love section complete on this day."
// The beta home (organized by the seven Way of Love practices) reads these
// to show "done today?" (daily sections: Turn, Learn & Pray) / "done this
// week?" (weekly: Worship, Bless, Go, Rest) and a gracious "weeks kept"
// consistency count.
//
// The server is a dumb store: the CLIENT supplies local_date + week_start
// (computed in the user's own timezone, week starting Sunday to align with
// Sunday worship) and computes done/weeks-kept, since it already holds the
// timezone, the per-practice commitments (/api/rule-of-life/wol), and the
// office history (/api/me/office-history-week, which Learn & Pray derives
// from). Toggling complete inserts a row; un-toggling deletes it.
//
// Unique per (user, section, local_date) — see the index in migrate.ts.

export type PracticeSection = "turn" | "learn_pray" | "worship" | "bless" | "go" | "rest";

export const practiceCompletionTable = pgTable("practice_completion", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // turn | learn_pray | worship | bless | go | rest
  section: text("section").notNull(),
  // YYYY-MM-DD in the user's timezone — the day the section was completed.
  localDate: text("local_date").notNull(),
  // YYYY-MM-DD of the Sunday that begins local_date's week.
  weekStart: text("week_start").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
