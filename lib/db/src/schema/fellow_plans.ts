import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A Fellow "plan" — the "How About" surface. One person shares something
// they're going to ("Evensong at the Cathedral, Thursday 6pm") and their
// active Fellows see it and can say they'll come. Deliberately lightweight
// and personal: a plan is hosted by ONE user and is visible only to that
// host and the host's Fellows (1:1 connections) — it is NOT a community
// event (those live in actions / rituals / gathers with their own RSVPs).
//
// when — kept loose on purpose. `startsAt` is an optional exact time (lets
// us sort + expire); `whenText` is the casual free-form alternative
// ("Saturday morning") for plans that don't have a precise time. A plan
// needs neither — just a title.
export const fellowPlansTable = pgTable("fellow_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  note: text("note"),
  location: text("location"),
  emoji: text("emoji"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  whenText: text("when_text"),
  // "open" | "cancelled". Cancelled plans drop out of the feed but the row
  // is kept so anyone who'd RSVP'd can still see it was called off.
  status: text("status").notNull().default("open"),
  // Public share token — minted lazily the first time the host shares the
  // plan (e.g. texting a fellow). The /plans/:token landing reads it pre-auth
  // to show the plan card; a signed-in fellow can RSVP from there.
  shareToken: text("share_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byHost: index("idx_fellow_plans_user").on(t.userId),
}));

export type FellowPlan = typeof fellowPlansTable.$inferSelect;
