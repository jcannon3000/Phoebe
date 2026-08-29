import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { groupsTable } from "./groups";
import { usersTable } from "./users";

/**
 * A weekly reflection written by a group's admin, delivered to that group's
 * members as an INBOX item.
 *
 * Owner: "for admin could do a weekly reflection. That would work just like
 * the taize one, and it would go into the inbox of all the people in the
 * group."
 *
 * So the behaviour is the inbox's, not a daily practice's: it sits in Next
 * until each person reads it, moves to Done, and stays there until the admin
 * posts the next one. Missing a day costs nothing.
 *
 * WHAT IS DIFFERENT FROM TAIZÉ, and why this needs a table rather than a
 * parser: the item is AUTHORED here rather than found on someone's website,
 * it is scoped to a group, and "has this person read it" has to be a fact
 * about the PERSON rather than the device. The other inboxes remember what
 * they have read in localStorage, which is right for a public newsletter and
 * wrong for something a priest wrote for a named congregation — read it on
 * your phone and it should be read on your laptop.
 */
export const groupReflectionsTable = pgTable("group_reflections", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  /** The admin who wrote it. Kept for attribution on the card. */
  authorUserId: integer("author_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  authorName: text("author_name"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /**
   * When it goes out. Nullable so a reflection can be drafted and published
   * later; the feed only ever returns rows with this set and in the past.
   */
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Who has read which reflection — per USER, so it follows the account across
 * devices, which is the whole reason this isn't localStorage like the other
 * inboxes.
 */
export const groupReflectionReadsTable = pgTable("group_reflection_reads", {
  id: serial("id").primaryKey(),
  reflectionId: integer("reflection_id").notNull()
    .references(() => groupReflectionsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One row per person per reflection — marking read twice is a no-op rather
  // than a second row, so a double tap can't make the count lie.
  oncePerUser: uniqueIndex("group_reflection_reads_once").on(t.reflectionId, t.userId),
}));
