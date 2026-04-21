import { pgTable, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prayerRequestsTable } from "./prayer_requests";

// One row per "Amen" tap. The owner of a prayer request can see a count of
// how many times their request has been prayed — both today (in their
// timezone) and all time. Non-owners never see anyone's count; we preserve
// the anonymity of praying-for-someone.
//
// Unbounded (one row per tap) so the same user tapping across days still
// accrues — the "today" bucket is derived at read time against the owner's
// timezone.
export const prayerRequestAmensTable = pgTable(
  "prayer_request_amens",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => prayerRequestsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    prayedAt: timestamp("prayed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index("idx_prayer_request_amens_request_id").on(t.requestId),
  }),
);
