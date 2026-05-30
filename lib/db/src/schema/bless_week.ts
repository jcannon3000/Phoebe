import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per (user, week_start) — marks the end-of-week Bless review as done
// so the gentle review prompt fires once and the cycle advances to next week.
// reviewed_at null (or no row) = the review hasn't happened yet this week.
export const blessWeekTable = pgTable("bless_week", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
