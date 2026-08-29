import { pgTable, serial, integer, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { groupsTable } from "./groups";
import { usersTable } from "./users";

/**
 * A POST from a group's leader — a written reflection, a link to something
 * worth reading, or an event — delivered to that group's members as an INBOX
 * item.
 *
 * NAMED `group_posts`, NOT `group_reflections`. That name was already taken by
 * a live table with a different shape (a member's own reflection on a shared
 * meditation: user_id, reflection_date, source). Because the migration creates
 * it with CREATE TABLE IF NOT EXISTS, mine was silently never created on any
 * database that had the old one, and the ALTERs meant for mine landed on
 * theirs — a collision that neither typecheck nor build can see, since the
 * clash is between a Drizzle definition and a raw SQL migration.
 *
 * `posts` is also the truer name: only some of these are reflections.
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
export const groupPostsTable = pgTable("group_posts", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  /** The admin who wrote it. Kept for attribution on the card. */
  authorUserId: integer("author_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  authorName: text("author_name"),
  title: text("title").notNull(),
  /**
   * The reflection itself. Empty for a LINK POST — see `url`.
   */
  body: text("body").notNull(),
  /**
   * A LINK a leader posted, rather than something they wrote.
   *
   * Owner: "a leader could post a link to a material … we'd want it to show up
   * in the CAC kind of format where it's loading the page, but not a reader
   * view inherently."
   *
   * So a row with a url is not read in the app: it opens the publisher's own
   * page in the in-app browser, exactly as the CAC newsletter card does, and
   * deliberately WITHOUT Phoebe's reader view. The reader restyles pages we
   * know the shape of; a leader can post anything, and stripping an unknown
   * page to a text column is how you lose the thing that was worth sharing.
   */
  url: text("url"),
  /**
   * When it stops being shown. Owner, of link posts: "only have it last one
   * week — if it goes longer than a week, it disappears."
   *
   * Nullable, and null means no expiry: a written reflection stays until the
   * next one is posted, which is the inbox's own rule. Only link posts get a
   * clock, because a link to something timely is stale in a way a reflection
   * isn't.
   */
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  /**
   * OPEN OUTSIDE THE APP — the system browser, not Phoebe's in-app one.
   *
   * Owner: "we would wanna make sure it's not opening in an in-app browser,
   * but going to the ParishFul app, or going to whatever website outside the
   * app." An event, a giving page or a ticket link usually belongs to a
   * platform the person is already signed into, and iOS will hand the URL to
   * that app — which an in-app web view can never do. Rendering it in a web
   * view means signing in again inside a browser that forgets you.
   */
  openExternally: boolean("open_externally").notNull().default(false),
  /**
   * What the card's button says. "Learn more", "RSVP", "Give" — a leader
   * knows what they are linking to and the card shouldn't guess. Null falls
   * back to "Read".
   */
  ctaLabel: text("cta_label"),
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
export const groupPostReadsTable = pgTable("group_post_reads", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull()
    .references(() => groupPostsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One row per person per reflection — marking read twice is a no-op rather
  // than a second row, so a double tap can't make the count lie.
  oncePerUser: uniqueIndex("group_post_reads_once").on(t.postId, t.userId),
}));
