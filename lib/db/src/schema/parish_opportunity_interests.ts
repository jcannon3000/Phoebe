import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { parishOpportunitiesTable } from "./parish_opportunities";

// A parishioner raising their hand for an opportunity ("I'm interested").
// One row per (opportunity, user) — the unique index makes tapping the button
// idempotent. Notifies the parish admins on first insert. name/email are
// snapshotted so the admin's "who's interested" roster survives the member
// later renaming their account or leaving.
export const parishOpportunityInterestsTable = pgTable(
  "parish_opportunity_interests",
  {
    id: serial("id").primaryKey(),
    opportunityId: integer("opportunity_id")
      .notNull()
      .references(() => parishOpportunitiesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name"),
    email: text("email"),
    // Optional free-text note the member can leave ("I can do mornings").
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePair: uniqueIndex("uniq_parish_opp_interest_pair").on(t.opportunityId, t.userId),
  }),
);
