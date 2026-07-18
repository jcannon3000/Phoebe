import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prayerFeedsTable } from "./prayer_feeds";

// The leader's prayer list — ongoing prayer intentions a parish admin (priest)
// keeps and invites the whole congregation to carry WITH them. Distinct from the
// day-scoped intercession slots (prayer_feed_entries) and the private pastoral
// concerns (parishioner→priest): this is the priest's own list, top-down, that
// parishioners "pray with" (→ parish_prayer_list_prayers) so the priest sees how
// many are praying alongside them. Gated by canManageParish for writes.
export const parishPrayerListTable = pgTable(
  "parish_prayer_list",
  {
    id: serial("id").primaryKey(),
    parishFeedId: integer("parish_feed_id")
      .notNull()
      .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // Soft-archive instead of hard delete so an item can be retired without
    // losing the record of who prayed it.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byParish: index("idx_parish_prayer_list_feed").on(t.parishFeedId),
  }),
);
