import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A Prayer Feed is a subscribable cause (e.g. "Climate Justice", "Persecuted
// Church", "Unborn Children") where the creator publishes a new specific
// intention every day. Subscribers pray for today's intention — think
// Operation World, the Anglican Cycle of Prayer, or Voice of the Martyrs
// daily prayer guides, but native and social.
//
// Shape:
//   - One feed = one cause (title + tagline + cover)
//   - Many `prayer_feed_entries` per feed — one per day — carrying the
//     specific intention for that date.
//   - `prayer_feed_subscriptions` link users to feeds they follow.
//   - `prayer_feed_prayers` logs the "who prayed today" roster (mirrors
//     the moment_posts pattern for intercessions).
//
// State machine:
//   - draft:  invisible to everyone but the creator; used before launch
//   - live:   published and subscribable
//   - paused: still visible to existing subscribers but hidden from
//             discovery and daily pushes are suppressed
//
// Slugs are globally unique to keep URLs clean (`/prayer-feeds/climate-justice`).
export const prayerFeedsTable = pgTable(
  "prayer_feeds",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    tagline: text("tagline"),
    coverEmoji: text("cover_emoji"),
    coverImageUrl: text("cover_image_url"),
    creatorUserId: integer("creator_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Timezone the creator uses for scheduling — all entry dates are
    // interpreted as calendar days in this zone, so "today's entry" is
    // stable regardless of where subscribers live.
    timezone: text("timezone").notNull().default("America/New_York"),
    state: text("state").notNull().default("draft"), // draft | live | paused
    subscriberCount: integer("subscriber_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("uniq_prayer_feeds_slug").on(t.slug),
  }),
);

export type PrayerFeedState = "draft" | "live" | "paused";
