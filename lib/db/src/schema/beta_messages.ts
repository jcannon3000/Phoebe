import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Beta Messages (beta-only).
//
// A lightweight 1:1 messaging feature for beta users — the same
// letter-like UI as Letters (correspondence + thread), but WITHOUT the
// fortnightly cadence limit. Beta users can send as many messages as
// they want, back and forth, like email/chat. Deliberately separate
// from `letters` so the constrained, sacred-cadence Letters model stays
// untouched; this is the "just talk to each other" surface.
//
// Model mirrors Letters at a smaller scale:
//   beta_conversations         — one row per 1:1 thread
//   beta_conversation_members  — two rows per conversation (the pair),
//                                each carrying that user's read cursor
//   beta_messages              — the messages themselves (no period
//                                bucketing, no rate limit)
//
// One conversation per pair is enforced in the route layer (start-or-
// reuse), not by a DB constraint, since the pair lives across two
// member rows rather than two columns.

export const betaConversationsTable = pgTable("beta_conversations", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Bumped on every new message so the inbox can sort most-recent-first
  // without a per-conversation aggregate query.
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BetaConversation = typeof betaConversationsTable.$inferSelect;

export const betaConversationMembersTable = pgTable("beta_conversation_members", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull()
    .references(() => betaConversationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // The member's read cursor — messages with createdAt > lastReadAt that
  // weren't sent by this member count as unread. Null = never read.
  lastReadAt: timestamp("last_read_at", { withTimezone: true }),
  // Soft "remove from my inbox" — the other member still sees the thread.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One membership row per (conversation, user).
  uniqueMember: uniqueIndex("beta_conv_members_unique").on(t.conversationId, t.userId),
  // "my conversations" lookup.
  byUser: index("beta_conv_members_by_user").on(t.userId),
}));

export type BetaConversationMember = typeof betaConversationMembersTable.$inferSelect;

export const betaMessagesTable = pgTable("beta_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull()
    .references(() => betaConversationsTable.id, { onDelete: "cascade" }),
  senderUserId: integer("sender_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Thread fetch (ordered) + unread counting.
  byConversation: index("beta_messages_by_conversation").on(t.conversationId, t.createdAt),
}));

export type BetaMessage = typeof betaMessagesTable.$inferSelect;
