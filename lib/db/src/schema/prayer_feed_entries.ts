import { pgTable, serial, text, integer, timestamp, date, uniqueIndex, index } from "drizzle-orm/pg-core";
import { prayerFeedsTable } from "./prayer_feeds";
import { usersTable } from "./users";

// One row per day's intention within a Prayer Feed. The creator can
// compose these ahead of time (state = "scheduled"), leave them as
// drafts, or publish them immediately.
//
// `entry_date` is a naive calendar date (no time, no zone) — it's meant
// to be interpreted in the parent feed's timezone so subscribers all
// see the same "today's intention" regardless of where they are.
//
// Exactly one entry per (feed, date). That's the discipline of the
// Prayer Feed — one intention, one day.
export const prayerFeedEntriesTable = pgTable(
  "prayer_feed_entries",
  {
    id: serial("id").primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    scriptureRef: text("scripture_ref"),
    imageUrl: text("image_url"),
    state: text("state").notNull().default("draft"), // draft | scheduled | published
    prayCount: integer("pray_count").notNull().default(0),
    createdByUserId: integer("created_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => ({
    feedDateUnique: uniqueIndex("uniq_prayer_feed_entries_feed_date").on(t.feedId, t.entryDate),
    feedDateIdx: index("idx_prayer_feed_entries_feed_date").on(t.feedId, t.entryDate),
  }),
);

export type PrayerFeedEntryState = "draft" | "scheduled" | "published";
