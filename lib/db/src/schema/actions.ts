import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { groupsTable } from "./groups";
import { sharedMomentsTable } from "./shared_moments";

// A community "action" — an advocacy / community-action event (showing
// up to a city council meeting, a volunteer day, a witness vigil).
//
// Unlike a gathering (ritual), an action surfaces a dedicated detail
// PAGE with a description, a "Learn more" link, persisted RSVPs visible
// to the whole community, and an optionally attached intercession the
// community can pray toward the action. Actions are admin-created and
// always community-scoped.
export const actionsTable = pgTable("actions", {
  id: serial("id").primaryKey(),
  // Host community. Every action belongs to exactly one group.
  groupId: integer("group_id")
    .notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  creatorUserId: integer("creator_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  // Optional "Learn more" destination — opened in the in-app browser
  // from the detail page. Null hides the button.
  learnMoreUrl: text("learn_more_url"),
  location: text("location"),
  // When the action happens. Drives dashboard date-bucketing and the
  // week-before / day-before reminder pushes.
  eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
  // Optional intercession the community prays toward this action. Points
  // at a shared_moments row (typically in the same community). Null means
  // no attached prayer. ON DELETE SET NULL so deleting the intercession
  // doesn't take the action down with it.
  attachedMomentId: integer("attached_moment_id").references(
    () => sharedMomentsTable.id,
    { onDelete: "set null" },
  ),
  // "active" | "archived". Archived actions drop off the dashboard but
  // keep their RSVP history intact.
  state: text("state").notNull().default("active"),
  // Stamped when the ~7-days-before reminder push has gone out, so the
  // cron never double-fires. Null = not yet sent.
  weekReminderSentAt: timestamp("week_reminder_sent_at", { withTimezone: true }),
  // Stamped when the ~1-day-before reminder push has gone out.
  dayReminderSentAt: timestamp("day_reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActionSchema = createInsertSchema(actionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAction = z.infer<typeof insertActionSchema>;
export type Action = typeof actionsTable.$inferSelect;
