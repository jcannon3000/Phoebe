import { pgTable, serial, integer, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Gather — propose a get-together, collect availability, converge, confirm ──
//
// The actuator for the Way of Love "Worship & gather" intention: a member
// proposes a few time options for a small get-together, shares an unguessable
// link, members AND guests (no account) mark their availability, the organizer
// converges on a time and confirms — then it surfaces as an event and credits
// the weekly Worship completion.
//
// NOTE on naming: this is deliberately NOT the existing `scheduled_gatherings`
// / `gathering_members` tables (a community-scoped, leader-run availability
// poll). This `gather_*` family is the ad-hoc, guest-friendly, share-token
// flow — a different shape (per-option datetimes, guest responders, per-response
// edit tokens). Routes live under /api/gather and /gather (singular).

export const gatherTable = pgTable("gather", {
  id: serial("id").primaryKey(),
  organizerUserId: integer("organizer_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  note: text("note"),
  place: text("place"),
  // open | confirmed | cancelled
  status: text("status").notNull().default("open"),
  // unguessable; grants RESPONSE access only (never edit/confirm)
  shareToken: text("share_token").notNull().unique(),
  // the option the organizer converged on (set on confirm)
  confirmedOptionId: integer("confirmed_option_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gatherOptionTable = pgTable("gather_option", {
  id: serial("id").primaryKey(),
  gatherId: integer("gather_id").notNull().references(() => gatherTable.id, { onDelete: "cascade" }),
  // the proposed datetime
  datetime: timestamp("datetime", { withTimezone: true }).notNull(),
  // optional human label (e.g. "Lunch")
  label: text("label"),
});

export const gatherResponseTable = pgTable("gather_response", {
  id: serial("id").primaryKey(),
  gatherId: integer("gather_id").notNull().references(() => gatherTable.id, { onDelete: "cascade" }),
  // null = guest (identified by guest_name); set = a Phoebe member
  respondentUserId: integer("respondent_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  guestName: text("guest_name"),
  guestEmail: text("guest_email"),
  // optional free-text "suggest another time"
  suggestedTime: text("suggested_time"),
  // per-response edit token — in the responder's revisit link / a cookie, so
  // anyone (member or guest) can come back and change their answer.
  responseToken: text("response_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const gatherResponseOptionTable = pgTable("gather_response_option", {
  responseId: integer("response_id").notNull().references(() => gatherResponseTable.id, { onDelete: "cascade" }),
  optionId: integer("option_id").notNull().references(() => gatherOptionTable.id, { onDelete: "cascade" }),
  // yes | maybe | no
  availability: text("availability").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.responseId, t.optionId] }),
}));

// Optional known invite list — members the organizer pulled in (push targets +
// nudge non-responders), or guest emails added by the organizer.
export const gatherInviteeTable = pgTable("gather_invitee", {
  id: serial("id").primaryKey(),
  gatherId: integer("gather_id").notNull().references(() => gatherTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  email: text("email"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
});
