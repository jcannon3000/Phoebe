import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One row per push notification that reached a device, and whether the person
// opened the app FROM it.
//
// WHY (owner, 2026-10-02: "a way of tracking which notifications get people to
// open the app"). Every push sent through sendPushToUser is stamped with a
// short `nid`, carried in its data and as a `?nid=` on its deep link. When the
// app is opened from the notification, the client reads `nid` off the URL and
// pings POST /api/notification-open, which sets opened_at here. So a row is
// "sent and delivered" and opened_at says it worked; the open rate of a KIND is
// opened / sent. `kind` is the push's thread id ("bell", "parish-office-morning",
// "prayed-together"...), or the first path segment when it has none.
//
// First open only: opened_at is written once. A silent push (no alert) is never
// logged, and a send that reached no device is not a row.
export const notificationSendsTable = pgTable(
  "notification_sends",
  {
    id: serial("id").primaryKey(),
    nid: text("nid").notNull(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
  },
  (t) => ({
    nid: uniqueIndex("uniq_notification_sends_nid").on(t.nid),
    kindSent: index("idx_notification_sends_kind_sent").on(t.kind, t.sentAt),
  }),
);

export type NotificationSend = typeof notificationSendsTable.$inferSelect;
