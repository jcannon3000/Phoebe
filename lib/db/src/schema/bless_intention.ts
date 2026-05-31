import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Bless intentions — the weekly "bless your community" cycle ─────────────
//
// Each row = one concrete way to serve others, set for a given week. The
// person sets a few each week (an encouraging note, a visit, a gift, a meal),
// ticks them off through the week, reviews at week's end, and carries over or
// releases what's unfinished. Gracious by design — invitations, not
// obligations; incompletes carry over or release without guilt.
//
// week_start is the Sunday that begins the intention's week, computed in the
// user's own timezone (the app's Sunday-start convention, aligned with Sunday
// worship). The sub-screen owns the week's intentions; the home card renders
// from them.
export const blessIntentionTable = pgTable("bless_intention", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  weekStart: text("week_start").notNull(),
  text: text("text").notNull(),
  // note | visit | give | serve | other (optional)
  type: text("type"),
  // free text, or a name chosen from the prayer list / community (optional)
  recipient: text("recipient"),
  // HH:MM (24h, user-local) reminder time (optional)
  reminderTime: text("reminder_time"),
  // YYYY-MM-DD (user-local) the reminder push was last sent — fire-once dedup
  // for the bless reminder scheduler; null = never fired.
  reminderFiredDate: text("reminder_fired_date"),
  // when the person marked it done (null = open)
  doneAt: timestamp("done_at", { withTimezone: true }),
  // the intention id this one was carried over from, if any (gracious carry-over)
  carriedFrom: integer("carried_from"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
