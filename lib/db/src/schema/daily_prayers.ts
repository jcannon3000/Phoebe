import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prayerPartnershipsTable } from "./prayer_partnerships";

// daily_prayers — one person's "prayer for the day".
//
// The heart of the new model. Once a day a person shares their prayer for
// the day with their partner. There is no "amen" — the partner OPENS it and
// giving it attention (see prayer_attentions) IS the prayer. Sharing one
// notifies the partner; viewing does not.
//
// `ymd` is the AUTHOR's local day (YYYY-MM-DD, computed server-side from
// users.timezone). The unique(author_id, ymd) is the "one per day" cap —
// authoritative regardless of the device clock.
export const dailyPrayersTable = pgTable("daily_prayers", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Denormalized partner (the recipient) for cheap "shared with me" queries.
  partnerId: integer("partner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  partnershipId: integer("partnership_id").notNull().references(() => prayerPartnershipsTable.id, { onDelete: "cascade" }),
  ymd: text("ymd").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One prayer per author per local day.
  uniquePerDay: uniqueIndex("daily_prayers_author_ymd").on(t.authorId, t.ymd),
  // Partnership timeline (history) + "what my partner shared with me".
  byPartnership: index("daily_prayers_partnership").on(t.partnershipId, t.createdAt),
  byPartner: index("daily_prayers_partner").on(t.partnerId, t.createdAt),
}));

export type DailyPrayer = typeof dailyPrayersTable.$inferSelect;
