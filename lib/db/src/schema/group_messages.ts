import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

// Group chat — a live message stream scoped to a community (group). This is the
// "talk to each other" surface for a parish group / young-adult circle that
// would otherwise live on WhatsApp, but held inside the community frame
// alongside its prayer list, office, and rule of life.
//
// Plaintext, like beta_messages (the server can read it — NOT E2E). Membership
// in group_members (joined) is what authorizes read + write; there's no
// separate conversation/member table because the group IS the room.

export const groupMessagesTable = pgTable("group_messages", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  senderUserId: integer("sender_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Thread fetch (ordered) + unread counting.
  byGroup: index("group_messages_by_group").on(t.groupId, t.createdAt),
}));

export type GroupMessage = typeof groupMessagesTable.$inferSelect;

// Per-member read cursor for the group chat — drives the unread badge. One row
// per (group, user); upserted to NOW() whenever the member opens the chat.
export const groupMessageReadsTable = pgTable("group_message_reads", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqMember: uniqueIndex("group_message_reads_unique").on(t.groupId, t.userId),
}));

export type GroupMessageRead = typeof groupMessageReadsTable.$inferSelect;
