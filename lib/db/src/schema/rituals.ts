import { pgTable, serial, text, integer, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const ritualsTable = pgTable("rituals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  frequency: text("frequency").notNull(),
  dayPreference: text("day_preference"),
  intention: text("intention"),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  location: text("location"),
  // Video-call link for "online" gatherings. When set, the gathering
  // is a video call (Zoom / Meet / Teams / etc.) rather than an
  // in-person meet — its cards render a "Join call" button instead of
  // a location line. One stable link reused for every occurrence.
  // Null for in-person gatherings.
  meetingUrl: text("meeting_url"),
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
  // Optional link to a community. When set, this gathering shows up on
  // the community's Gatherings tab. Null for "personal" gatherings that
  // aren't scoped to a community.
  groupId: integer("group_id"),
});

export const insertRitualSchema = createInsertSchema(ritualsTable).omit({ id: true, createdAt: true });
export type InsertRitual = z.infer<typeof insertRitualSchema>;
export type Ritual = typeof ritualsTable.$inferSelect;
