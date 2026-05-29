import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { scheduledGatheringsTable } from "./gatherings";

// Recurring availability rhythm — not per-date. One row per (user, gathering,
// day-of-week, time-band). gathering_id nullable = a reusable global rhythm
// the user hasn't scoped to any specific gathering yet (reserved for later).
// Partial unique indexes enforce uniqueness correctly around the nullable FK:
//   uniq_avail_gathering: gathering_id IS NOT NULL
//   uniq_avail_global:    gathering_id IS NULL
// (These are added in migrate.ts, not here, because Drizzle's pgTable
// constraint builder doesn't support partial WHERE clauses yet.)
export const availabilityPatternsTable = pgTable("availability_patterns", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  gatheringId: integer("gathering_id").references(() => scheduledGatheringsTable.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday … 6 = Saturday
  timeBand: text("time_band").notNull(), // morning | afternoon | evening
  level: text("level").notNull().default("free"), // free | maybe | busy
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idxUserGathering: index("idx_avail_user_gathering").on(t.userId, t.gatheringId),
}));

export type AvailabilityPattern = typeof availabilityPatternsTable.$inferSelect;
