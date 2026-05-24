import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per user per 15-minute window in which they opened/foregrounded
// the app. The client pings POST /api/app-open on launch + resume; the
// server stamps `bucket = floor(epoch_seconds / 900)` and the unique
// (user_id, bucket) index collapses rapid re-opens within the same window
// to a single row — so "times opened" counts once every 15 minutes, and
// "people who opened" is COUNT(DISTINCT user_id). Backs the two app-open
// rows on the admin metrics page. Signed-in users only (an anonymous
// open can't be attributed to a person).
export const appOpensTable = pgTable(
  "app_opens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // 15-minute window index: floor(epoch_seconds / 900). Comfortably
    // within int range for centuries (~1.84M today, +35k/year).
    bucket: integer("bucket").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userBucket: uniqueIndex("uniq_app_opens_user_bucket").on(t.userId, t.bucket),
    openedAtIdx: index("idx_app_opens_opened_at").on(t.openedAt),
  }),
);

export type AppOpen = typeof appOpensTable.$inferSelect;
