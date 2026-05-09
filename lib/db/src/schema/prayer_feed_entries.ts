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
// Up to three entries per (feed, date) — one per slot. Slots 1/2/3 each
// produce their own slide in the subscriber's prayer-mode deck +
// Office intercessions, so an admin can program a day with three
// distinct intentions (e.g. a morning, midday, evening focus). Older
// single-entry rows are kept on slot=1 by default.
export const prayerFeedEntriesTable = pgTable(
  "prayer_feed_entries",
  {
    id: serial("id").primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
    entryDate: date("entry_date").notNull(),
    // 1, 2, or 3. Position within the day. Render order on the
    // subscriber side is ascending. Default 1 so legacy single-slot
    // rows keep working without backfill.
    slot: integer("slot").notNull().default(1),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    scriptureRef: text("scripture_ref"),
    imageUrl: text("image_url"),
    // Optional URL to a story / article / explainer the admin wants
    // subscribers to read. Renders as a "Learn more →" pill on the
    // subscriber's intercession slide, mirroring the Bible.com pill
    // on lectionary slides — opens in SFSafariViewController so the
    // user stays inside Phoebe.
    learnMoreUrl: text("learn_more_url"),
    state: text("state").notNull().default("draft"), // draft | scheduled | published
    prayCount: integer("pray_count").notNull().default(0),
    createdByUserId: integer("created_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => ({
    // Unique on (feed, date, slot) — three rows max per day per feed.
    feedDateSlotUnique: uniqueIndex("uniq_prayer_feed_entries_feed_date_slot").on(t.feedId, t.entryDate, t.slot),
    feedDateIdx: index("idx_prayer_feed_entries_feed_date").on(t.feedId, t.entryDate),
  }),
);

export type PrayerFeedEntryState = "draft" | "scheduled" | "published";
