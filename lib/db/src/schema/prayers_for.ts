import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// prayers_for — private, directed prayers one user holds for another.
// Completely distinct from prayer_requests: the pray-er writes the text,
// the recipient never sees the text, only the presence of the prayer.
export const prayersForTable = pgTable("prayers_for", {
  id: serial("id").primaryKey(),
  prayerUserId: integer("prayer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipientUserId: integer("recipient_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  prayerText: text("prayer_text").notNull(),
  durationDays: integer("duration_days").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // When the pray-er acknowledges the end (via "Done" or "Pray another N days").
  // Until then a prayer past its expiresAt surfaces as a renewal prompt.
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
