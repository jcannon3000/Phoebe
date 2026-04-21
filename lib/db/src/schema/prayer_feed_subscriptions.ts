import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { prayerFeedsTable } from "./prayer_feeds";
import { usersTable } from "./users";

// A user's subscription to a Prayer Feed. Today's entry from every
// subscribed feed appears on the user's dashboard alongside their
// practices and gatherings.
//
// `muted_until` lets a subscriber temporarily hide a feed without
// losing their subscription (vacation, tough week, etc.). After the
// timestamp passes the feed reappears automatically.
export const prayerFeedSubscriptionsTable = pgTable(
  "prayer_feed_subscriptions",
  {
    id: serial("id").primaryKey(),
    feedId: integer("feed_id")
      .notNull()
      .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    feedUserUnique: uniqueIndex("uniq_prayer_feed_subscriptions_feed_user").on(t.feedId, t.userId),
    userIdx: index("idx_prayer_feed_subscriptions_user").on(t.userId),
  }),
);
