import { pgTable, serial, integer, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A shared append-log for simple "log what you did" practices that carry a
// title + free-text notes and an optional share-with-fellows flag. One table
// serves several practices via `kind` (e.g. "reading", "podcasts"). `day` is
// the caller's LOCAL calendar day (YYYY-MM-DD). Mirrors listening_entries but
// generic so new logging practices don't each need their own table.
export const practiceLogEntriesTable = pgTable(
  "practice_log_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "reading" | "podcasts"
    day: text("day").notNull(),
    what: text("what").notNull().default(""), // what you read / listened to
    notes: text("notes").notNull().default(""), // optional free-text notes
    shared: boolean("shared").notNull().default(false), // private by default
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userKindIdx: index("practice_log_entries_user_kind_idx").on(t.userId, t.kind),
    sharedIdx: index("practice_log_entries_shared_idx").on(t.kind, t.shared),
  }),
);
