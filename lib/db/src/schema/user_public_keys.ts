import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One static ECDH (P-256) PUBLIC key per user, published so a fellow can
// encrypt a voice memo to them (ECIES: sender derives a shared secret from a
// per-memo ephemeral keypair + this static public key). The matching PRIVATE
// key never leaves the user's device — the server cannot decrypt anything.
export const userPublicKeysTable = pgTable("user_public_keys", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  // The public key as a JWK JSON string (Web Crypto export).
  publicKeyJwk: text("public_key_jwk").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserPublicKey = typeof userPublicKeysTable.$inferSelect;
