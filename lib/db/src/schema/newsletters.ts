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
  // Emails the background fan-out couldn't deliver (Gmail returned an
  // error). Captured so admins can see exactly which recipients failed
  // without spelunking Railway logs. Stored as a jsonb array of strings.
  failedRecipients: jsonb("failed_recipients").$type<string[]>().notNull().default([]),
  // Nullable: an audit row outlives the admin who composed the send.
  // Cascade-on-delete would have wiped the whole history when the
  // user was removed; SET NULL keeps the row + preserves the snapshot
  // of sentByName so we always know who sent it (just lose the link).
  sentByUserId: integer("sent_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  sentByName: text("sent_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
