import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { prayerFeedsTable } from "./prayer_feeds";
import { usersTable } from "./users";

// An EVENT attached to a prayer feed by its manager — a time-bound
// happening tied to the cause (a prayer vigil, a day of prayer, a
// webinar, a local action). Distinct from the community events system
// (rituals + meetups + ritual_groups + meetup_rsvps): that one is
// membership-coupled and assumes small communities, whereas feed
// subscriber sets are a different, often large (offices-only)
// population. This is a lean, announce-only model — no RSVP, no
// calendar fan-out in v1 — surfaced to subscribers in-app.
export const prayerFeedEventsTable = pgTable("prayer_feed_events", {
  id: serial("id").primaryKey(),
  feedId: integer("feed_id").notNull()
    .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
  // The manager who created it. SET NULL (not cascade) so deleting a
  // user doesn't wipe the feed's event history.
  createdByUserId: integer("created_by_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  // Optional end time. Null = a point-in-time / open-ended event.
  endsAt: timestamp("ends_at", { withTimezone: true }),
  // Optional free-text location (in-person events).
  location: text("location"),
  // Optional join link (video / external page). Tapped → opens
  // external (SFSafariViewController on iOS).
  joinUrl: text("join_url"),
  // published | cancelled. Cancel is soft so subscribers who already
  // saw the event get a "Cancelled" badge rather than a vanishing card.
  state: text("state").notNull().default("published"),
  // Stamped when the day-before reminder push has fired — dedup for the
  // bell scanner. Mirrors meetups.reminder_sent_at.
  reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PrayerFeedEvent = typeof prayerFeedEventsTable.$inferSelect;
