import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { fellowPlansTable } from "./fellow_plans";
import { fellowPlanTimesTable } from "./fellow_plan_times";

// One whole-plan RSVP per (plan, user) (planTimeId null) — today's behavior —
// plus optional per-candidate-time "leanings" (planTimeId set) while a plan is
// being scheduled. status is "coming" or "maybe"; clearing deletes the row. The
// host is implicitly attending and does not get a row here.
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
    // null = a whole-plan RSVP. non-null = a "this time works for me" leaning on
    // one candidate time while the plan is still being scheduled.
    planTimeId: integer("plan_time_id").references(() => fellowPlanTimesTable.id, { onDelete: "cascade" }),
    // "coming" | "maybe".
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Partial so per-time rows don't collide with the one whole-plan row.
    // Name matches migrate.ts (the prod DDL) — the old non-partial index of the
    // bare name is dropped there before this partial is created.
    uniqPlanUser: uniqueIndex("uniq_fellow_plan_rsvp_plan_user_whole").on(t.planId, t.userId).where(sql`${t.planTimeId} IS NULL`),
    uniqPlanUserTime: uniqueIndex("uniq_fellow_plan_rsvp_plan_user_time").on(t.planId, t.userId, t.planTimeId).where(sql`${t.planTimeId} IS NOT NULL`),
  }),
);

export type FellowPlanRsvp = typeof fellowPlanRsvpsTable.$inferSelect;
