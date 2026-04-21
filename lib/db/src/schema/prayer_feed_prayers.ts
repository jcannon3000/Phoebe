import { pgTable, serial, integer, timestamp, date, text, uniqueIndex, index } from "drizzle-orm/pg-core";
import { prayerFeedsTable } from "./prayer_feeds";
import { prayerFeedEntriesTable } from "./prayer_feed_entries";
import { usersTable } from "./users";

// A log of who prayed for which entry on which day. Mirrors the pattern
// we use for intercession moment_posts so the "who prayed today" chip
// list can be rendered identically.
//
// Unique on (entry_id, user_id) — a user counts once per entry, no
// matter how many times they tap "Pray 🙏🏽". `day_local` captures the
// local calendar day (in the feed's timezone) for easy grouping and
// streak math without having to re-derive it from entryDate.
export const prayerFeedPrayersTable = pgTable(
  "prayer_feed_prayers",
  {
    id: serial("id").primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
    entryId: integer("entry_id")
      .notNull()
      .references(() => prayerFeedEntriesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    dayLocal: date("day_local").notNull(),
    reflectionText: text("reflection_text"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entryUserUnique: uniqueIndex("uniq_prayer_feed_prayers_entry_user").on(t.entryId, t.userId),
    feedDayIdx: index("idx_prayer_feed_prayers_feed_day").on(t.feedId, t.dayLocal),
    userIdx: index("idx_prayer_feed_prayers_user").on(t.userId),
  }),
);
