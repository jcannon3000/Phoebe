import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { fellowPlansTable } from "./fellow_plans";

// One RSVP per (plan, user). status is "coming" or "maybe" — there is no
// explicit "not coming"; clearing an RSVP deletes the row. The host is
// implicitly attending their own plan and does not get a row here. Mirrors
// the action_rsvps shape so the UI/semantics feel consistent.
export const fellowPlanRsvpsTable = pgTable(
  "fellow_plan_rsvps",
  {
    id: serial("id").primaryKey(),
    planId: integer("plan_id")
      .notNull()
      .references(() => fellowPlansTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // "coming" | "maybe".
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqPlanUser: uniqueIndex("uniq_fellow_plan_rsvp_plan_user").on(t.planId, t.userId),
  }),
);

export type FellowPlanRsvp = typeof fellowPlanRsvpsTable.$inferSelect;
