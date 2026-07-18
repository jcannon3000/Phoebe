import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { parishPrayerListTable } from "./parish_prayer_list";

// A parishioner praying WITH the leader on one of their prayer-list items. One
// row per (item, user) — the unique index makes tapping "Pray" idempotent and
// backs the "prayed with N" count + the viewer's own prayed state.
export const parishPrayerListPrayersTable = pgTable(
  "parish_prayer_list_prayers",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => parishPrayerListTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePair: uniqueIndex("uniq_parish_prayer_list_prayer_pair").on(t.itemId, t.userId),
  }),
);
