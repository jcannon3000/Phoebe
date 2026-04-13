import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

export const ritualsTable = pgTable("rituals", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  frequency: text("frequency").notNull(),
  dayPreference: text("day_preference"),
  participants: jsonb("participants").notNull().default([]),
  intention: text("intention"),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  location: text("location"),
  proposedTimes: jsonb("proposed_times").notNull().default([]),
  confirmedTime: text("confirmed_time"),
  scheduleToken: text("schedule_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Phoebe gathering fields
  rhythm: text("rhythm").notNull().default("fortnightly"),
  hasIntercession: boolean("has_intercession").notNull().default(false),
  hasFasting: boolean("has_fasting").notNull().default(false),
  intercessionIntention: text("intercession_intention"),
  fastingDescription: text("fasting_description"),
  // Onboarding template the creator picked (coffee, meal, walk, book_club, custom).
  // Used so the dashboard can show a matching emoji (e.g. 🚶🏽 for a walk).
  template: text("template"),
  // Toggle: when true, any member of the gathering can invite new people.
  // When false, only the owner can. Default is open.
  allowMemberInvites: boolean("allow_member_invites").notNull().default(true),
});

export const insertRitualSchema = createInsertSchema(ritualsTable).omit({ id: true, createdAt: true });
export type InsertRitual = z.infer<typeof insertRitualSchema>;
export type Ritual = typeof ritualsTable.$inferSelect;
