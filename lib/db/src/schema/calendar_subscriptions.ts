import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const calendarSubscriptionsTable = pgTable("calendar_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),          // iCal (.ics) feed URL
  name: text("name").notNull().default(""),
  colorHex: text("color_hex"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CalendarSubscription = typeof calendarSubscriptionsTable.$inferSelect;
