import { pgTable, serial, integer, text, jsonb, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prescribedRoutinesTable } from "./prescribed_routines";

// A LEADER'S PAGE. A priest / chaplain / admin has a public page at /with/:slug
// where anyone can answer five questions about how they want to pray. The
// answers land in that leader's inbox (routine_intakes), who designs a routine
// for the person and sends it by link or to their account.
export const leaderProfilesTable = pgTable("leader_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  // A line or two the leader writes to whoever opens the page.
  welcome: text("welcome"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One person's answers to the five questions. They come from a signed-in
// ACCOUNT, so name and email are always there for the leader to write back.
export const routineIntakesTable = pgTable("routine_intakes", {
  id: serial("id").primaryKey(),
  leaderProfileId: integer("leader_profile_id").notNull().references(() => leaderProfilesTable.id, { onDelete: "cascade" }),
  // Whoever answered MUST have an account (owner, 2026-10-04): the routine is
  // delivered to it as well as emailed. name/email are copied from the account
  // when they answer, so the leader can write back even if the account changes.
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  morning: text("morning").notNull().default(""),
  evening: text("evening").notNull().default(""),
  connect: text("connect").notNull().default(""),
  grow: text("grow").notNull().default(""),
  newsletters: jsonb("newsletters").$type<string[]>().notNull().default([]),
  // new → crafted (a routine was designed) → sent (delivered to them)
  status: text("status").notNull().default("new"),
  prescribedRoutineId: integer("prescribed_routine_id").references(() => prescribedRoutinesTable.id, { onDelete: "set null" }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byLeader: index("routine_intakes_by_leader").on(t.leaderProfileId),
}));

export type LeaderProfile = typeof leaderProfilesTable.$inferSelect;
export type RoutineIntake = typeof routineIntakesTable.$inferSelect;
