import { pgTable, integer, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// What a person's daily silence goal WAS on a given day.
//
// Owner: "if the contemplation quota is increased to where it's higher than a
// previous day, and on that previous day they met the quota, those previous
// days shouldn't be half shaded. Each day should pertain to the quota that was
// set on that day."
//
// Without this the weekly grid judges every day against the CURRENT goal, so
// raising it from 20 to 45 retroactively un-keeps a fortnight of days someone
// actually kept — the app quietly rewriting their history to say they'd fallen
// short of a rule that didn't exist yet.
//
// One row per user per local day, written lazily whenever the practice week is
// computed (see routes/users.ts). Lazy rather than on every write of
// users.contemplation_goal_minutes because that value is set from five
// different places; a single read-side choke point can't be forgotten by the
// sixth.
export const contemplationGoalHistoryTable = pgTable(
  "contemplation_goal_history",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Local calendar day (YYYY-MM-DD) in the user's own timezone — the same
    // grain the weekly grid is keyed by.
    ymd: text("ymd").notNull(),
    goalMinutes: integer("goal_minutes").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.ymd] }) }),
);
