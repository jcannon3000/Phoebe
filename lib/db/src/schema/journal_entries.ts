import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Private daily journal — a personal written reflection. Strictly the
// author's own: there is no `shared` flag and no community surface, so an
// entry is only ever read back by the person who wrote it (contrast
// gratitude_responses, which can opt into the garden). `prompt` snapshots
// the reflection prompt shown that day so an entry stays legible even as
// the daily prompts rotate.
export const journalEntriesTable = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  prompt: text("prompt"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
