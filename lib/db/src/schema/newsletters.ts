import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A newsletter-style email composed by an admin and sent to Phoebe
// users. Recipients are resolved at send time either from all users
// (scope = "all") or from the members of selected groups
// (scope = "groups"). One row is written per send for audit history.
export const newslettersTable = pgTable("newsletters", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  bodyMarkdown: text("body_markdown").notNull(),
  // "all" — every Phoebe user; "groups" — members of groupIds.
  recipientScope: text("recipient_scope").notNull(),
  // Group ids targeted when scope = "groups" (empty for "all").
  groupIds: jsonb("group_ids").$type<number[]>().notNull().default([]),
  // How many distinct email addresses the send attempted.
  recipientCount: integer("recipient_count").notNull().default(0),
  // How many of those sends Gmail accepted.
  sentCount: integer("sent_count").notNull().default(0),
  sentByUserId: integer("sent_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sentByName: text("sent_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
