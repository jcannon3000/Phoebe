import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

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
//   - paused: the creator-facing "Off" switch. The feed disappears
//             everywhere a non-creator could see it — discovery, the
//             community/group pages it's bound to, AND the daily
//             surface + dashboard of people already subscribed — and
//             daily pushes are suppressed. Subscriptions and bindings
//             are kept untouched, so flipping back to `live` restores
//             the feed for everyone instantly. Still visible to the
//             creator in "Manage Prayer Feeds" so they can turn it on.
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
    // SET NULL, not CASCADE: a parish/feed is a SHARED object owned by many.
    // If the creating priest deletes their account, the feed must ORPHAN (a
    // staff admin can reassign a new priest), never be destroyed out from under
    // its whole congregation. The actual FK is switched to SET NULL in migrate.
    creatorUserId: integer("creator_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
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
    // Discovery visibility. "private" (default) — the feed is reachable
    // only by its creator, bound communities, and beta users; it does
    // not appear in public discovery. "public" — anyone with an account
    // (including the limited offices-only tier) can find it in
    // /prayer-feeds and subscribe. The feed creator toggles this from
    // the manage page. Existing feeds default private so nothing
    // becomes discoverable without a deliberate flip.
    visibility: text("visibility").notNull().default("private"), // public | private
    // Phoebe Parish — last YYYY-MM-DD (parish TZ) we fired the 8pm
    // recap push for this parish. Idempotency for the bell-scheduler
    // tick; only used when kind="parish".
    parishEveningRecapSentDate: text("parish_evening_recap_sent_date"),
    // Parish standing rule of life — the always-on daily rhythm the priest sets
    // for the whole congregation (kind="parish" only). Points at a
    // prescribed_routines row; parishioners adopt it in one tap and then get a
    // "you prayed with your parish this week" signal. PLAIN integer (no drizzle
    // FK — prescribed_routines already imports groups; the FK constraint lives
    // in migrate SQL, placed after the prescribed_routines table, mirroring
    // groups.rule_routine_id).
    ruleRoutineId: integer("rule_routine_id"),
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
export type PrayerFeedVisibility = "public" | "private";

// Many-to-many between prayer feeds and groups. A feed can be
// "within" multiple groups; a group can carry multiple feeds.
// Binding a group to a feed auto-subscribes every joined member of
// the group to the feed (the bind handler enforces this).
//
// Add path: feed creator OR a community admin of the target group
// can add the group. Remove path: same. Removing a binding does NOT
// unsubscribe individuals — manually-subscribed users stay
// subscribed; we just stop the auto-subscribe of future joiners.
// Recurring entries. Unlike prayer_feed_entries (which pin to a
// specific calendar date), these are templates that auto-expand
// onto the daily slide deck. Two flavors:
//   • daily    — fires on every future day in slot N
//   • weekly   — fires on every day matching weekdaysMask in slot N
// Concrete prayer_feed_entries (one_time) win over recurring
// templates when both exist on the same (date, slot) — the admin
// can override a daily template for a specific date by writing a
// one-time entry.
export const prayerFeedRecurringEntriesTable = pgTable(
  "prayer_feed_recurring_entries",
  {
    id: serial("id").primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    // 'daily' or 'weekly'.
    recurrenceKind: text("recurrence_kind").notNull(),
    // Bitmask: bit 0 = Sunday, 1 = Monday, … 6 = Saturday.
    // 'daily' kind sets this to 127 (all days). 'weekly' kind sets
    // the bits for the chosen weekdays.
    weekdaysMask: integer("weekdays_mask").notNull().default(127),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    learnMoreUrl: text("learn_more_url"),
    // "custom" | "action" — same meaning as on prayer_feed_entries.
    source: text("source").notNull().default("custom"),
    state: text("state").notNull().default("live"), // draft | live
    createdByUserId: integer("created_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const prayerFeedGroupsTable = pgTable(
  "prayer_feed_groups",
  {
    id: serial("id").primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    addedByUserId: integer("added_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    feedGroupUnique: uniqueIndex("uniq_prayer_feed_groups_pair").on(t.feedId, t.groupId),
  }),
);
