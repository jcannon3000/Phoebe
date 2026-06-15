import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { dailyPrayersTable } from "./daily_prayers";

// prayer_attentions — the attention/"view receipt" record.
//
// When the partner opens a daily prayer, the client accumulates how long it
// was actually attended (timer pauses when the app backgrounds / tab hides).
// Once attention crosses the threshold (>=3s) it COUNTS as praying — that's
// the moment `countedAt` is stamped. The author is never push-notified about
// this, but they CAN see the receipt (viewed + counted) on their own prayer.
//
// One row per (daily_prayer, viewer); attentionSeconds is monotonic (max of
// what's reported), so repeated POSTs only ever raise it.
export const prayerAttentionsTable = pgTable("prayer_attentions", {
  id: serial("id").primaryKey(),
  dailyPrayerId: integer("daily_prayer_id").notNull().references(() => dailyPrayersTable.id, { onDelete: "cascade" }),
  viewerId: integer("viewer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }).notNull().defaultNow(),
  attentionSeconds: integer("attention_seconds").notNull().default(0),
  // Set the first time attentionSeconds reaches the threshold — the "prayed"
  // moment. Null = opened but not yet held long enough to count.
  countedAt: timestamp("counted_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueViewer: uniqueIndex("prayer_attentions_prayer_viewer").on(t.dailyPrayerId, t.viewerId),
  byViewer: index("prayer_attentions_viewer").on(t.viewerId),
}));

export type PrayerAttention = typeof prayerAttentionsTable.$inferSelect;
