import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Device push tokens for native mobile clients.
 *
 * One row per (userId, platform, token). `lastSeenAt` is bumped every time
 * the app resumes and re-registers — we use that to prune tokens idle
 * longer than ~60 days, which APNs returns as "unregistered" anyway. The
 * UNIQUE index on (userId, platform, token) makes re-registration a
 * no-op upsert (`ON CONFLICT (...) DO UPDATE SET last_seen_at = now()`).
 *
 * `platform` is "ios" today; "android" is reserved for when we build the
 * Android Capacitor target.
 */
export const deviceTokensTable = pgTable(
  "device_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // "ios" | "android"
    token: text("token").notNull(),
    // Useful for debugging delivery issues — e.g. "is this the token that
    // worked yesterday, or did APNs rotate it?"
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when APNs tells us the token is dead (e.g. app uninstalled).
    // Sender code treats rows with non-null `invalidatedAt` as skip.
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  },
  (t) => ({
    uniqByUserPlatformToken: uniqueIndex("device_tokens_user_platform_token_idx")
      .on(t.userId, t.platform, t.token),
  }),
);
