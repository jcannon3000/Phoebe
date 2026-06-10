import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prayerRequestsTable } from "./prayer_requests";

// Daily "you've been held in prayer today" notification queue.
//
// One row per (request, recipient, day in recipient's tz) — created on the
// first non-owner amen of the day, incremented on each subsequent amen during
// the 2-hour batching window, then claimed and pushed by the background
// scanner once first_amen_at is older than 2h.
//
// The 2-hour delay coalesces a burst of community amens (think morning
// prayer where the whole circle prays in the same 20-minute window)
// into a single "Sara and 7 others prayed for you today" push instead
// of eight separate pings. After sent_at is stamped, further amens
// on the same day do NOT re-trigger — the requester gets one push per
// request per day, no more.
export const prayerHeldNotificationsTable = pgTable(
  "prayer_held_notifications",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .notNull()
      .references(() => prayerRequestsTable.id, { onDelete: "cascade" }),
    recipientId: integer("recipient_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // YYYY-MM-DD in the recipient's timezone. Day boundary tracks the
    // requester's wall clock so a midnight burst doesn't accidentally
    // produce two notifications.
    dayKey: text("day_key").notNull(),
    firstAmenAt: timestamp("first_amen_at", { withTimezone: true }).notNull(),
    firstAmenUserId: integer("first_amen_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    amenCount: integer("amen_count").notNull().default(1),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => ({
    // Recipient-scoped: one request can notify multiple tagged recipients,
    // each once per day (the "praying for my friend Matthew" feature), so the
    // unique key includes recipient_id. Matches migrate.ts and the amen
    // upsert's ON CONFLICT (request_id, recipient_id, day_key). The earlier
    // narrow (request_id, day_key) index was replaced — declaring it here let
    // `drizzle-kit push --force` (run on every deploy) fight migrate.ts.
    uniqRequestRecipientDay: uniqueIndex("uniq_phn_request_recipient_day").on(t.requestId, t.recipientId, t.dayKey),
    pendingIdx: index("idx_phn_pending").on(t.sentAt, t.firstAmenAt),
  }),
);
