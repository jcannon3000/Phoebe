import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// daily_prayers — one person's "prayer for the day".
//
// The heart of the new model. Once a day a person shares ONE prayer for the
// day. It is AUTHOR-scoped, not partner-scoped: the same prayer is shared with
// ALL of that person's prayer partners — each partnership is its own thread,
// but the prayer text is the single prayer for the day. There is no "amen": a
// partner OPENS it and giving it attention (prayer_attentions) IS the prayer.
// Sharing notifies your partners; viewing never does.
//
// `ymd` is the AUTHOR's local day (YYYY-MM-DD, computed server-side from
// users.timezone). The unique(author_id, ymd) is the "one per day" cap.
export const dailyPrayersTable = pgTable("daily_prayers", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ymd: text("ymd").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Next-morning delivery: the prayer is sealed from partners until this instant
  // (the next morning in the author's tz), so they wake up to it. NULL = legacy
  // row → immediately visible. The author always sees their own right away.
  deliverAfter: timestamp("deliver_after", { withTimezone: true }),
  // When the deferred "new prayer" push went out (stamped by the morning sweep
  // so it fires exactly once). NULL while still pending, or on legacy rows.
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
}, (t) => ({
  // One prayer per author per local day.
  uniquePerDay: uniqueIndex("daily_prayers_author_ymd").on(t.authorId, t.ymd),
  // Author timeline — powers each thread + "what they shared".
  byAuthor: index("daily_prayers_author").on(t.authorId, t.createdAt),
}));

export type DailyPrayer = typeof dailyPrayersTable.$inferSelect;
