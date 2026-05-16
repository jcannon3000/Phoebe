import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { actionsTable } from "./actions";

// One RSVP per (action, user).
//
// status is "coming" or "maybe" — there is no explicit "not coming";
// clearing an RSVP simply deletes the row. RSVPs are public within the
// community: the action's detail page lists everyone who's coming or
// maybe-coming so members can see who else will be there.
export const actionRsvpsTable = pgTable(
  "action_rsvps",
  {
    id: serial("id").primaryKey(),
    actionId: integer("action_id")
      .notNull()
      .references(() => actionsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // "coming" | "maybe".
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqActionUser: uniqueIndex("uniq_action_rsvp_action_user").on(
      t.actionId,
      t.userId,
    ),
  }),
);

export const insertActionRsvpSchema = createInsertSchema(actionRsvpsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertActionRsvp = z.infer<typeof insertActionRsvpSchema>;
export type ActionRsvp = typeof actionRsvpsTable.$inferSelect;
