import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// prayer_partnerships — the 1:1 prayer-partner bond.
//
// The new prayer model is a back-and-forth between TWO people (not the old
// broadcast feed). Each person has at most ONE active partner. The pair is
// stored normalized (lo id, hi id) with a single row, so "is X my partner"
// is one lookup and the unique index forbids a duplicate bond. Direction of
// the *invite* is kept on invitedById (the normalized pair loses sender/
// recipient ordering).
//
//   status: 'pending'  — invited, awaiting the other person's accept
//           'active'   — both consented; the live partnership
//           'ended'    — one person ended it (kept for history, not reused)
export const prayerPartnershipsTable = pgTable("prayer_partnerships", {
  id: serial("id").primaryKey(),
  // Normalized pair — userLoId < userHiId, always. Use the helper in the
  // route layer to order a pair before insert/lookup.
  userLoId: integer("user_lo_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  userHiId: integer("user_hi_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  invitedById: integer("invited_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endedById: integer("ended_by_id").references(() => usersTable.id, { onDelete: "set null" }),
}, (t) => ({
  // At most one bond row per pair (across all statuses; an ended bond is
  // revived rather than duplicated when the pair reconnects).
  uniquePair: uniqueIndex("prayer_partnerships_pair").on(t.userLoId, t.userHiId),
  byLo: index("prayer_partnerships_lo").on(t.userLoId),
  byHi: index("prayer_partnerships_hi").on(t.userHiId),
}));

export type PrayerPartnership = typeof prayerPartnershipsTable.$inferSelect;
