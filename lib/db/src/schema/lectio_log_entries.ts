import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Lectio Divina log — the account-wide "sacred reading" journal (see
// pages/lectio-divina.tsx). A contemplative practice modeled on Audio Divina
// (listening_entries), but for Scripture: you read a passage slowly, then note
// WHAT passage and what you felt drawn to / called to do. Logging-first, append
// log (multiple sittings a day are fine), `day` is the user's LOCAL calendar
// day as YYYY-MM-DD. Private to the user — no sharing, no fellows feed.
export const lectioLogEntriesTable = pgTable(
  "lectio_log_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    passage: text("passage").notNull().default(""),
    reflection: text("reflection").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("lectio_log_entries_user_idx").on(t.userId),
    userDayIdx: index("lectio_log_entries_user_day_idx").on(t.userId, t.day),
  }),
);
