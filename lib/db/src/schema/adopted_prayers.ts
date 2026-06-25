import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prayerRequestsTable } from "./prayer_requests";

// adopted_prayers — when a user taps "Pray along" on someone else's prayer
// intention, they ADOPT it: the original request also joins their own prayer
// list + daily slideshow so they carry it as their own going forward. This is
// distinct from a one-day amen (prayer_request_amens, which resets daily and
// only records "I prayed for you today"). Adopting is a lasting "I'm praying
// this too" — it spreads the intention. Releasing (stop carrying) sets
// releasedAt rather than deleting, so the history is preserved.
export const adoptedPrayersTable = pgTable("adopted_prayers", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => prayerRequestsTable.id, { onDelete: "cascade" }),
  adopterUserId: integer("adopter_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  adoptedAt: timestamp("adopted_at", { withTimezone: true }).notNull().defaultNow(),
  // When the adopter stops carrying it (releases). Active adoptions have
  // releasedAt = null; a released adoption stays as a row for the record and
  // so re-adopting can revive the same row.
  releasedAt: timestamp("released_at", { withTimezone: true }),
});
