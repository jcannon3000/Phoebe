import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// An ephemeral, end-to-end-encrypted voice memo from one fellow to another.
// The audio is encrypted on the sender's device (AES-GCM, key derived via
// ECDH from a per-memo ephemeral keypair + the recipient's static public key),
// so the server only ever holds opaque ciphertext it cannot play. Rows are
// short-lived: deleted the moment the recipient listens, and hard-expired by
// the retention cron after expiresAt. We never retain playable audio.
export const voiceMemosTable = pgTable("voice_memos", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipientId: integer("recipient_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // base64 of the AES-GCM ciphertext + the 12-byte IV (base64) + the sender's
  // per-memo ephemeral public key (JWK JSON) needed to derive the shared key.
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  ephemeralPublicJwk: text("ephemeral_public_jwk").notNull(),
  mimeType: text("mime_type").notNull(),
  durationMs: integer("duration_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Hard TTL — the retention cron deletes anything past this even if unheard.
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  // Set when the recipient plays it; deletion follows immediately.
  listenedAt: timestamp("listened_at", { withTimezone: true }),
}, (t) => ({
  byRecipient: index("idx_voice_memos_recipient").on(t.recipientId),
  byExpiry: index("idx_voice_memos_expires").on(t.expiresAt),
}));

export type VoiceMemo = typeof voiceMemosTable.$inferSelect;
