import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Daily step count synced from Apple Health (HealthKit stepCount). One row per
// (user, local day). Mirrors contemplation_health_minutes: the home card reads
// today's steps straight from HealthKit on-device, but the server needs its own
// copy so the "you hit your step goal" push can fire — the iOS client best-effort
// uploads today's total here (PUT /api/me/daily-steps) and the endpoint compares
// it to the user's goal, pushing once per day on the first crossing.
//
// `day` is the user's LOCAL calendar day as YYYY-MM-DD (same TEXT convention as
// contemplation_health_minutes and breath_sessions). `steps` is monotonic within
// the day (GREATEST upsert) so a stale read can't lower it.
export const dailyHealthStepsTable = pgTable(
  "daily_health_steps",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // YYYY-MM-DD in the user's timezone.
    day: text("day").notNull(),
    // Step count for that day from Apple Health.
    steps: integer("steps").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One row per user per local day — also the upsert target for the PUT.
    userDayUk: uniqueIndex("daily_health_steps_user_day_uk").on(t.userId, t.day),
  }),
);
