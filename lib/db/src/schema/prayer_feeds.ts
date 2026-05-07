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
    // Nullable: platform-owned feeds (e.g. phoebe-climate) have no human
    // creator. User-created feeds set this to the creator's user id.
    creatorUserId: integer("creator_user_id")
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Timezone the creator uses for scheduling — all entry dates are
    // interpreted as calendar days in this zone, so "today's entry" is
    // stable regardless of where subscribers live.
    timezone: text("timezone").notNull().default("America/New_York"),
    state: text("state").notNull().default("draft"), // draft | live | paused
    // Feed taxonomy. "general" feeds are what the system has had since
    // day one — anyone can subscribe, content is curated by the
    // creator. "parish" feeds are Phoebe Parish congregations: each
    // user can be subscribed to AT MOST ONE parish (the canonical
    // pointer lives on users.parish_feed_id), and the parish powers
    // the simplified parish-only signup flow + admin metrics. Phoebe
    // staff provision parishes manually for now (no self-serve
    // parish creation in the UI).
    kind: text("kind").notNull().default("general"), // general | parish
    // Phoebe Parish — last YYYY-MM-DD (parish TZ) we fired the 8pm
    // recap push for this parish. Idempotency for the bell-scheduler
    // tick; only used when kind="parish".
    parishEveningRecapSentDate: text("parish_evening_recap_sent_date"),
    subscriberCount: integer("subscriber_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("uniq_prayer_feeds_slug").on(t.slug),
  }),
);

export type PrayerFeedState = "draft" | "live" | "paused";
export type PrayerFeedKind = "general" | "parish";
