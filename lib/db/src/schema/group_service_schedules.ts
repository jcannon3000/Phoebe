import { pgTable, serial, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { groupsTable } from "./groups";
import { usersTable } from "./users";

// A group can have one recurring service schedule — e.g. "Sunday Services"
// with service times at 8am, 10am, and 12pm. Rendered as ONE card on the
// dashboard (not one card per service time); clicking the card reveals
// every time in the schedule. Admin-only edit.
//
// Times are stored as a JSON array of
//   { label: string; time: "HH:MM"; location?: string }
// in the group's implied local timezone (no tz column on groups yet; we
// treat times as naive clock-times, which is how church service bulletins
// actually express them).
//
// `dayOfWeek` is 0 (Sunday) .. 6 (Saturday). Defaults to 0 because this
// feature was born as "Sunday Services", but any day-of-week is valid so
// groups with a Wednesday-night or Saturday-vigil cadence can use it too.
export const groupServiceSchedulesTable = pgTable(
  "group_service_schedules",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Sunday Services"),
    // Schedule-level location — a single place for the whole day's services
    // so the dashboard card can cycle it in its split-flap line. Per-time
    // locations (inside `times`) still override when the 10am and 8am
    // services happen in different sanctuaries.
    location: text("location"),
    dayOfWeek: integer("day_of_week").notNull().default(0),
    times: jsonb("times").notNull().default([]),
    updatedByUserId: integer("updated_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One schedule per group for now — the card model assumes one.
    groupUnique: uniqueIndex("uniq_group_service_schedule_group_id").on(t.groupId),
  }),
);

export type GroupServiceTime = {
  label: string;
  time: string; // "HH:MM" 24h
  location?: string;
};
