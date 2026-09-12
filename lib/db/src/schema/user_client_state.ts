import { pgTable, serial, integer, text, jsonb, bigint, timestamp, unique } from "drizzle-orm/pg-core";

// Small JSON blobs a DEVICE keeps and the ACCOUNT remembers — the icons you
// have sat with, first. Local-first: the device writes its own copy and
// pushes it (through the write outbox when offline); the server keeps the
// newest by updated_at_ms (last write wins); a signed-in device pulls it on
// open, so signing out and back in — or a new phone — gets it back.
// One row per (user, key). Keys are allow-listed in routes/users.ts.
export const userClientStateTable = pgTable("user_client_state", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  key: text("key").notNull(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAtMs: bigint("updated_at_ms", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqUserKey: unique().on(t.userId, t.key),
}));

export type UserClientState = typeof userClientStateTable.$inferSelect;
