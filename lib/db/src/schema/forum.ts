import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

// ── Group forum ──────────────────────────────────────────────────────────────
//
// A simple message board scoped to a group — the "forum inside groups" that
// the El Jardín portal wants, but reusable by any community. Modeled on
// group_reflections + comments: a post (optional title + body) with a flat
// list of replies (no nesting). Read/write is gated at request time on group
// membership (joined member of the group), not at the schema level.
//
// Scoped by groupId, so the same forum machinery works for a Jardín-flavored
// group or any other community; the portal simply lists the groups it cares
// about and opens this forum inside them.

export const forumPostsTable = pgTable("forum_posts", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Optional thread title; many forum posts are just a body.
  title: text("title"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // The common "this group's posts, newest first" query.
  byGroup: index("forum_posts_by_group").on(t.groupId, t.createdAt),
}));

export type ForumPost = typeof forumPostsTable.$inferSelect;

// Flat replies under a post — any joined member of the post's group may
// reply; ordered by createdAt ascending in the thread view.
export const forumRepliesTable = pgTable("forum_replies", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull()
    .references(() => forumPostsTable.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byPost: index("forum_replies_by_post").on(t.postId, t.createdAt),
}));

export type ForumReply = typeof forumRepliesTable.$inferSelect;
