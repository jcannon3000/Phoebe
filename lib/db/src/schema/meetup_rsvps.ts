import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { meetupsTable } from "./meetups";
import { usersTable } from "./users";

// One RSVP per (meetup, user).
//
// status is "going" or "maybe" — there is no explicit "not going";
// clearing an RSVP simply deletes the row. RSVPs are public within the
// community: the gathering's detail page lists everyone who's going
// and everyone who's maybe so members can see who else will be there.
//
// Mirrors actionRsvpsTable — same shape, different parent entity.
export const meetupRsvpsTable = pgTable(
  "meetup_rsvps",
  {
    id: serial("id").primaryKey(),
    meetupId: integer("meetup_id")
      .notNull()
      .references(() => meetupsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // "going" | "maybe".
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqMeetupUser: uniqueIndex("uniq_meetup_rsvp_meetup_user").on(
      t.meetupId,
      t.userId,
    ),
  }),
);

export const insertMeetupRsvpSchema = createInsertSchema(meetupRsvpsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertMeetupRsvp = z.infer<typeof insertMeetupRsvpSchema>;
export type MeetupRsvp = typeof meetupRsvpsTable.$inferSelect;
