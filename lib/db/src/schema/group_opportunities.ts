import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

// "Ways to get involved" — an admin publishes opportunities (worship roles,
// service ministries, community groups, anything) scoped to a single group;
// members tap "I'm interested", which notifies the group's admins. Rebuilt
// here from the deleted Phoebe Parish system's parish_opportunities /
// parish_opportunity_interests tables (commit 094181c0), scoped to groupId
// instead of a parish's prayerFeedId — see memory project_groups_followers_members_tier.
export const groupOpportunitiesTable = pgTable("group_opportunities", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  // "worship" | "serve" | "community" | "other"
  category: text("category").notNull().default("other"),
  scheduleNote: text("schedule_note"),
  contact: text("contact"),
  createdByUserId: integer("created_by_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  // Soft-archive, not hard delete — keeps interest history intact.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  groupIdx: index("idx_group_opportunities_group").on(t.groupId),
}));

export const groupOpportunityInterestsTable = pgTable("group_opportunity_interests", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").notNull()
    .references(() => groupOpportunitiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Name/email snapshot at the time of interest, so the admin roster still
  // reads sensibly even if the user later changes their display name.
  name: text("name"),
  email: text("email"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Idempotent "I'm interested" — a second tap updates the existing row
  // instead of creating a duplicate.
  uniqPair: uniqueIndex("uniq_group_opp_interest_pair").on(t.opportunityId, t.userId),
}));
