import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Browser Web Push subscriptions (VAPID).
 *
 * One row per (userId, endpoint). The endpoint is the unique URL the
 * browser hands us when it registers — Chrome's lives under
 * `https://fcm.googleapis.com/fcm/send/...`, Firefox/Mozilla lives
 * under `https://updates.push.services.mozilla.com/...`. We POST a
 * signed Web Push payload to that URL when it's time to send.
 *
 * Used for Android web users primarily — iOS Safari only honours
 * Web Push when the app has been "Add to Home Screen"-installed,
 * which we don't push users toward (we point them at the App Store
 * instead). Desktop browsers (Chrome / Firefox / Edge) also work.
 *
 * `invalidatedAt` is set when the push service returns 404/410 —
 * meaning the user revoked permission, cleared site data, or the
 * subscription expired. Sender code skips invalidated rows.
 */
export const webPushSubscriptionsTable = pgTable(
  "web_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // The push endpoint URL the browser handed us. Unique per
    // (userId, endpoint) so re-registering the same browser is an
    // idempotent upsert.
    endpoint: text("endpoint").notNull(),
    // Crypto material for payload encryption. p256dh is the
    // browser's ECDH public key; auth is the auth secret. Both are
    // base64url-encoded strings, fed straight into web-push's
    // sendNotification.
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    // Captured at registration so we can debug "why is this
    // browser failing" later — e.g. is this a Samsung Internet
    // user-agent, an old Chrome, etc.
    userAgent: text("user_agent"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  },
  (t) => ({
    uniqByUserEndpoint: uniqueIndex("web_push_subscriptions_user_endpoint_idx")
      .on(t.userId, t.endpoint),
  }),
);
