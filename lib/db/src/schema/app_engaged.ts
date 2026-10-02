import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per user per local day on which they stayed on the app for a minute
// or more. The client times its own visible, foreground seconds, and when a day
// reaches sixty it pings POST /api/app-engaged once.
//
// WHY THIS EXISTS (owner, 2026-10-01: "anyone who stayed on the app for more
// then a minute and didnt click on a practice lets just count as a practice").
// "Opened the app" was far larger than "used a practice", almost all of the gap
// people without an account who looked around and left, and the metrics had
// no way to tell a bounce from a visit. A person who stays a minute is using
// the app; this is the record that says so, and App Metrics counts it as one
// kept item (lib/appMetricsSql: the "engaged" practice, family "other").
//
// Day-keyed like practice_completion: the CLIENT supplies local_date in its own
// timezone, the server stores it. Unique per (user, local_date), so a second
// ping the same day is a no-op.
export const appEngagedTable = pgTable(
  "app_engaged",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // YYYY-MM-DD in the user's timezone.
    localDate: text("local_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userDay: uniqueIndex("uniq_app_engaged_user_day").on(t.userId, t.localDate),
  }),
);

export type AppEngaged = typeof appEngagedTable.$inferSelect;
