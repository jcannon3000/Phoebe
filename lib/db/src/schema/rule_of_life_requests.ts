import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

// Rule-of-life requests (BETA) — a community member asks their community's
// clergy / leaders to help them build a daily prayer routine ("rule of life").
// This is the THREAD, not the discernment: the actual conversation happens with
// a real person; the app just carries the ask + lets the leaders see + respond.
// Principle 5 ("the body forms it; the thread only carries it"): no AI, no
// auto-matching — the request goes to the leaders of a community the member is
// ALREADY in.
export const ruleOfLifeRequestsTable = pgTable("rule_of_life_requests", {
  id: serial("id").primaryKey(),
  // The community the member belongs to (its admins/clergy are the responders).
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  // The member asking for help.
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Optional: what they'd like to talk about / where they are in prayer.
  note: text("note"),
  // requested → accepted (a leader will reach out) | completed | declined.
  status: text("status").notNull().default("requested"),
  // The leader who responded (acknowledged / scheduled / completed / declined).
  respondedByUserId: integer("responded_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (t) => ({
  byGroup: index("rule_of_life_requests_by_group").on(t.groupId, t.status),
  byUser: index("rule_of_life_requests_by_user").on(t.userId),
}));

export type RuleOfLifeRequest = typeof ruleOfLifeRequestsTable.$inferSelect;
