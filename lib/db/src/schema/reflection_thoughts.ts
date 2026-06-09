import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Community "thoughts" on a given day's daily reflection, for the
// newsletter-style reflections that don't already have their own store.
//
// CAC's Daily Meditation already has cac_reflections (a private/shared
// journal keyed by created_at day) — this table is the equivalent shared
// surface for the other two daily reflections: "Forward Day by Day" (fdd)
// and the Society of St John the Evangelist (ssje). One uniform endpoint
// pair (/api/reflections/:source/thoughts) reads cac_reflections for
// source "cac" and this table for "fdd"/"ssje".
//
//   source — which daily reflection ("fdd" | "ssje"). CAC never writes here.
//   day    — the newsletter day this thought is about (YYYY-MM-DD). Unlike
//            cac_reflections (which infers the day from created_at), fdd/ssje
//            carry the day explicitly so a thought always maps to the exact
//            reflection it responds to.
//   shared — thoughts are community-facing by default (the in-app reflection
//            page shows what others wrote about that day). Kept as a column
//            so a future "make private" gesture has somewhere to land.
export const reflectionThoughtsTable = pgTable("reflection_thoughts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  source: text("source").notNull(), // "fdd" | "ssje"
  day: text("day").notNull(), // YYYY-MM-DD (the newsletter day)
  text: text("text").notNull(),
  shared: boolean("shared").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  bySourceDay: index("reflection_thoughts_source_day").on(t.source, t.day),
  byUser: index("reflection_thoughts_user").on(t.userId),
}));

export type ReflectionThought = typeof reflectionThoughtsTable.$inferSelect;
