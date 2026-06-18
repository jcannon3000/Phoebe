import { pgTable, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { fellowPlansTable } from "./fellow_plans";

// A candidate time for a plan that's still being scheduled. A plan with 0 rows
// here behaves exactly like today (uses its own startsAt/whenText). A plan with
// 2+ rows is "deciding": fellows lean toward the times that work (per-time RSVPs
// in fellow_plan_rsvps), and when the host resolves, the chosen time is copied
// to fellow_plans.startsAt and these rows are deleted. Deliberately minimal —
// just the proposed instants.
export const fellowPlanTimesTable = pgTable("fellow_plan_times", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull().references(() => fellowPlansTable.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byPlan: index("idx_fellow_plan_times_plan").on(t.planId),
}));

export type FellowPlanTime = typeof fellowPlanTimesTable.$inferSelect;
