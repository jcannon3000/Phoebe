import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A directional Fellow link. Stored as two rows per connection
// (A→B and B→A) so "my fellows" is a single-sided WHERE query.
// UNIQUE on (user_id, fellow_user_id) dedupes accidental
// double-insert; one half can be missing for a brief window during
// the share-link signup flow before the linker fills the mirror.
//
// source — how this fellow link was created:
//   "shared_prayer" — visitor amened a shared request and signed up
//   (currently the only path in v1; manual add is a future addition).
export const fellowsTable = pgTable("fellows", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  fellowUserId: integer("fellow_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  note: text("note"),
  source: text("source").notNull().default("shared_prayer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unique: unique().on(t.userId, t.fellowUserId),
}));
