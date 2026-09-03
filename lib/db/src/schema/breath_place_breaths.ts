import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { breathPlacesTable } from "./breath_places";

/**
 * HOW MANY BREATHS were taken at a designated place — the number the place's
 * slide actually shows ("N breaths at The Flamingo today").
 *
 * Why this isn't a column on breath_sessions: that table is ONE ROW PER PERSON
 * PER DAY and exists only for a COMPLETED set — it is the "did I breathe today"
 * record that marks the card done and feeds the communal count. Counting its
 * rows at a place therefore gave person-days, not breaths (twelve breaths read
 * as "1 breaths"), and a set ended before the twelfth breath never reached the
 * server at all (owner, 2026-09-03, watching the simulator: "it did 3 breathes
 * but says zero"). A tally has different rules — every breath counts, partial
 * sets count, a second set the same day adds on — so it gets its own table,
 * and breath_sessions keeps its completion semantics untouched.
 *
 * One row per person per place per day, `breaths` accumulating across sets.
 * Old sessions are backfilled once from their seconds (migrate.ts).
 */
export const breathPlaceBreathsTable = pgTable(
  "breath_place_breaths",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    placeId: integer("place_id")
      .notNull()
      .references(() => breathPlacesTable.id, { onDelete: "cascade" }),
    // YYYY-MM-DD in the user's timezone — the same `day` breath_sessions uses.
    day: text("day").notNull(),
    // Breaths taken at this place on this day, summed across every set.
    breaths: integer("breaths").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("breath_place_breaths_user_place_day_unique").on(t.userId, t.placeId, t.day),
    index("breath_place_breaths_place_day_idx").on(t.placeId, t.day),
  ],
);
