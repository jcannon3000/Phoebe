import { pgTable, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A one-tap "🙌 encouragement" sent from one Fellow to another. Unlike the
// mutual-opt-in Walking Together nudge, this is a direct, always-available
// gesture: tap the hands on any fellow and they get "{Name} encouraged you —
// keep growing with Phoebe." No pairing, no accountability contract, just a
// little lift. One row per send; `seenAt` flips when the recipient's app
// surfaces it so we can show an unseen banner without re-showing it forever.
export const fellowEncouragementsTable = pgTable("fellow_encouragements", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  toUserId: integer("to_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  seenAt: timestamp("seen_at", { withTimezone: true }),
}, (t) => ({
  byRecipient: index("idx_fellow_encouragements_to").on(t.toUserId),
}));

export type FellowEncouragement = typeof fellowEncouragementsTable.$inferSelect;
