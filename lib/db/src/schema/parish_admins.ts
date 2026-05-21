import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prayerFeedsTable } from "./prayer_feeds";

// Parish admin roster.
//
// `prayer_feeds.creator_user_id` is the original creator and is
// implicitly an admin (no row in this table required for them — see
// `canManageParish` in routes/parish.ts). Additional admins go in this
// table: the priest who created the parish can grant the same author /
// concern-recipient powers to staff, co-pastors, deacons, etc.
//
// Why a side table and not a role column on group_members or a JSON
// array on prayer_feeds: parishes don't have a group_members analogue
// (the relationship is users.parish_feed_id, a single column), and we
// want a real audit trail (who added whom and when) plus a clean unique
// constraint on (parish, user) that an array can't enforce.
export const parishAdminsTable = pgTable(
  "parish_admins",
  {
    id: serial("id").primaryKey(),
    parishFeedId: integer("parish_feed_id")
      .notNull()
      .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Who granted this admin — typically the creator or an existing
    // admin. Nullable + SET NULL on user delete so the row survives
    // its grantor leaving Phoebe.
    addedByUserId: integer("added_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parishUserUnique: uniqueIndex("uniq_parish_admins_pair").on(t.parishFeedId, t.userId),
  }),
);
