import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Tracks daily bell email sends. One row per user per day prevents
 * duplicate sends. The `sentAt` column is set when the email goes out;
 * if null the row was created but not yet sent (shouldn't normally happen).
 */
export const bellNotificationsTable = pgTable("bell_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  bellDate: text("bell_date").notNull(),              // YYYY-MM-DD in user's timezone
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
