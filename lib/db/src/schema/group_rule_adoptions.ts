import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prescribedRoutinesTable } from "./prescribed_routines";

// Someone who has taken up a group's rule of life. One row per (rule, user) —
// the unique index makes adopting idempotent, so the "N follow this rhythm"
// count on a PUBLIC group page can't be inflated by re-tapping, and the card
// knows whether the viewer already follows it (viewerAdopted) instead of
// guessing from local state.
//
// Keyed on the prescribed_routines row (the rule) rather than the group, so a
// group REPLACING its rule starts adoption fresh — which is right: the new
// rhythm is a different thing to have taken up.
//
// Mirrors parish_rule_adoptions, which is the same idea for a congregation.
export const groupRuleAdoptionsTable = pgTable(
  "group_rule_adoptions",
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
    uniquePair: uniqueIndex("uniq_group_rule_adoption_pair").on(t.ruleId, t.userId),
  }),
);
