import { pgTable, serial, integer, text, timestamp, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { scheduledGatheringsTable } from "./gatherings";

export const gatheringMembersTable = pgTable("gathering_members", {
  id: serial("id").primaryKey(),
  gatheringId: integer("gathering_id").notNull().references(() => scheduledGatheringsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"), // leader | member
  inviteStatus: text("invite_status").notNull().default("invited"), // invited | joined | declined
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.gatheringId, t.userId),
  idxUser: index("idx_gathering_members_user").on(t.userId),
}));

export type GatheringMember = typeof gatheringMembersTable.$inferSelect;
