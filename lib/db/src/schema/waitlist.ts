import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// People who asked to join Phoebe before they had a way in. Captured from
// the public homepage. The `source` column lets us distinguish later flows
// (e.g. an embedded form vs the homepage CTA) without another migration.
export const waitlistTable = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  reason: text("reason"),
  source: text("source").notNull().default("homepage"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
