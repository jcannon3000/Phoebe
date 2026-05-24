import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const gratitudeResponsesTable = pgTable("gratitude_responses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  // Gratitude is private by default — a personal journal entry. The user
  // can opt to share an entry to the garden (where the community sees
  // it), at write time or later. Only shared=true rows appear on the
  // garden wall; private ones live only on the author's own journal.
  shared: boolean("shared").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gratitudeSeenTable = pgTable("gratitude_seen", {
  id: serial("id").primaryKey(),
  gratitudeId: integer("gratitude_id").notNull().references(() => gratitudeResponsesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
});
