import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Long-lived auth tokens issued after a successful login (password, Google,
// Apple, magic-link, etc.) and stored on the client side in a durable
// location (Capacitor Preferences on iOS / localStorage on web). The web
// session cookie remains the day-to-day auth credential; this token only
// gets used when the cookie is missing — e.g. iOS app upgrade purges the
// WebView cookie jar, or NSHTTPCookieStorage drops a cookie that hadn't
// yet been written to disk before the user force-quit the app.
//
// On a 401 from /api/auth/me, the client POSTs the token to
// /api/auth/exchange-token, which (if valid + not revoked) logs the user
// back in and issues a fresh session cookie. The previous token is rotated
// on every exchange to limit the blast radius of a stolen value.
//
// Tokens are revoked on explicit logout, on password change, and on
// account deletion. Without an explicit revoke they live indefinitely —
// the whole point is to outlast a session cookie. If you need a hard
// expiry, add an `expiresAt` column and check it in the exchange endpoint.
export const persistentAuthTokensTable = pgTable(
  "persistent_auth_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // SHA-256 hash (hex) of the 32-byte random token. We store ONLY the hash —
    // the plaintext lives in the client's durable store and is hashed here for
    // lookup, so a DB leak can't be replayed. (Legacy rows may still hold a
    // plaintext value until they rotate; the exchange matches either.)
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Hard expiry (90 days from mint) — tokens past this are rejected at
    // /exchange-token. NULL on legacy rows, grandfathered until they rotate.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => ({
    userIdx: index("persistent_auth_tokens_user_id_idx").on(table.userId),
  }),
);

export type PersistentAuthToken = typeof persistentAuthTokensTable.$inferSelect;
