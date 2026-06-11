import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-(user, source, local day) marker that the user opened a daily
// reflection. CAC has its own richer cac_reads table (it also powers
// community read-presence — who in your garden read today); this table
// covers the other sources — Forward Day by Day ("fdd") and SSJE ("ssje") —
// which previously tracked reads in localStorage only, so the daily-progress
// Reflect anchor didn't sync across devices for them.
//
// `ymd` is the user's LOCAL calendar day as YYYY-MM-DD, matching the TEXT
// local-day convention used elsewhere (cac_reads, practice_completion). The
// unique (user, source, day) index makes a repeat open a no-op.
export const reflectionReadsTable = pgTable(
  "reflection_reads",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // 'fdd' | 'ssje'
    ymd: text("ymd").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userSourceDayUk: uniqueIndex("reflection_reads_user_source_ymd_uk").on(t.userId, t.source, t.ymd),
  }),
);
