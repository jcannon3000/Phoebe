import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prescribedRoutinesTable } from "./prescribed_routines";

// A parishioner who has taken up the parish's standing rhythm. One row per
// (rule, user) — the unique index makes adopting idempotent, so the parish-wide
// adopt count can't be inflated by re-tapping, and each member's card knows
// whether they've already adopted (viewerAdopted). Keyed on the prescribed_routines
// row (the rule) rather than the parish, so replacing the rhythm resets adoption.
export const parishRuleAdoptionsTable = pgTable(
  "parish_rule_adoptions",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => prescribedRoutinesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePair: uniqueIndex("uniq_parish_rule_adoption_pair").on(t.ruleId, t.userId),
  }),
);
