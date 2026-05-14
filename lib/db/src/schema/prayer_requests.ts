import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

export const prayerRequestsTable = pgTable("prayer_requests", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Optional group scope. When set, the request lives on that community's
  // prayer wall; when null it's a personal request. Nullable to keep
  // existing rows valid through the migration.
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "cascade" }),
  // Optional parish scope — a "pastoral concern" submitted from the
  // Phoebe Parish flow. When set, the request is visible ONLY to the
  // requester themselves and the parish admin(s); it never enters the
  // garden, slideshow, or any other parishioner's prayer list. FK is
  // enforced in the migration SQL (not via .references() here) to
  // avoid a circular import with prayer_feeds. Mutually exclusive
  // with groupId in practice — a row should set at most one scope.
  parishFeedId: integer("parish_feed_id"),
  body: text("body").notNull(),
  // The author's framing when they submitted: "request" (default), "life-event",
  // or "justice". Drives the optional pill on cards / slideshow ("Life event"
  // or "For justice"); plain "request" rows show no pill. Stored as text so
  // we can introduce new flavors without schema work.
  kind: text("kind").notNull().default("request"),
  createdByName: text("created_by_name"),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  isAnswered: boolean("is_answered").notNull().default(false),
  answeredAt: timestamp("answered_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closeReason: text("close_reason"),
  // Timestamp of when the owner dismissed the "your request has been
  // released" popup on /prayer-list. Null means the popup still needs
  // to fire the next time they visit after expiresAt passes. We
  // deliberately don't auto-set closedAt on expiry — the row stays
  // visible to the user in "released" state until they acknowledge it.
  releasePopupSeenAt: timestamp("release_popup_seen_at", { withTimezone: true }),
  // Stamped when the 1-day-left "your prayer is wrapping up" push goes
  // out. Cron checks this before sending so we don't double-fire on
  // a request that already got its nudge.
  renewalNudgeSentAt: timestamp("renewal_nudge_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prayerWordsTable = pgTable("prayer_words", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => prayerRequestsTable.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  authorName: text("author_name").notNull(),
  content: text("content").notNull(),
  // When true, the word is visible only to the request owner + the
  // author. When false (the default, matching legacy behavior) it
  // appears to everyone who can see the prayer request itself. Author
  // sets the visibility at submit time via a small toggle; the request
  // owner is allowed to see private words too because the whole point
  // is to give them comfort.
  isPrivate: boolean("is_private").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
