import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// One-to-one prayer friendships. A single directional row models BOTH the
// pending request and the accepted friendship:
//   • requesterId is who sent the request, addresseeId who received it.
//   • You are friends iff a row between two users has status 'accepted'
//     (in either direction).
// A reverse-pending collision (B requests A while A→B is already pending) is
// resolved at the app layer by auto-accepting rather than creating a 2nd row.
// Blocking is handled separately by user_mutes, kept out of this table.
export const friendshipsTable = pgTable("friendships", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  addresseeId: integer("addressee_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // pending | accepted | declined
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
});

export type Friendship = typeof friendshipsTable.$inferSelect;
