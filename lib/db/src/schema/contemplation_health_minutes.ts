import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// External mindful minutes synced from Apple Health (Calm, Insight Timer,
// Apple Mindfulness — everything EXCEPT Phoebe's own sits, which the client
// excludes before uploading so they're never double-counted). One row per
// (user, local day).
//
// Why a server-side store at all? The Contemplation goal card already folds
// today's Health minutes into its progress client-side, but the ~7pm goal
// nudge (lib/bellSender → runContemplationGoalSender) and the contemplation
// stats endpoint run server-side with no access to HealthKit. The iOS client
// best-effort uploads today's external total here (PUT
// /api/me/contemplation-health-minutes) so both can count "done today" the
// same way the card does — otherwise the nudge fires even when the user hit
// their goal via another meditation app.
//
// `day` is the user's LOCAL calendar day as YYYY-MM-DD (the client computes it
// in device-local time; the server keys off the same string). This matches the
// TEXT local-day convention used by practice_completion and the goal dedup
// columns on users, so the nudge's todayInZone(tz) string compares directly.
export const contemplationHealthMinutesTable = pgTable(
  "contemplation_health_minutes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // YYYY-MM-DD in the user's timezone.
    day: text("day").notNull(),
    // External mindful minutes for that day (Phoebe's own sits excluded).
    minutes: integer("minutes").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One row per user per local day — also the upsert target for the PUT.
    userDayUk: uniqueIndex("contemplation_health_minutes_user_day_uk").on(t.userId, t.day),
  }),
);
