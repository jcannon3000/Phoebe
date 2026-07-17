import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prayerFeedsTable } from "./prayer_feeds";

// "Ways to get involved" — opportunities a parish admin (priest) publishes for
// their congregation: worship roles (lector, chalice bearer, usher, acolyte),
// service ministries (food pantry, hospitality), community groups, and anything
// else. Members of the parish see them on their parish dashboard and tap
// "I'm interested" (→ parish_opportunity_interests), which notifies the admins.
//
// Scoped to a Phoebe Parish feed (prayer_feeds kind="parish"), gated by
// canManageParish (routes/parish.ts) for writes — same authority model as
// parish concerns / intercessions.
export const parishOpportunitiesTable = pgTable(
  "parish_opportunities",
  {
    id: serial("id").primaryKey(),
    parishFeedId: integer("parish_feed_id")
      .notNull()
      .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    // 'worship' | 'serve' | 'community' | 'other' — a display tag, validated in
    // the route. Worship roles are just opportunities with category="worship";
    // there is no per-date serving schedule (kept intentionally simple).
    category: text("category").notNull().default("other"),
    // Free-text cadence hint shown under the title, e.g. "Sundays", "First
    // Saturday of the month". Not a real schedule — just context for the reader.
    scheduleNote: text("schedule_note"),
    // Optional contact line ("Talk to Fr. James", an email, etc.).
    contact: text("contact"),
    createdByUserId: integer("created_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    // Soft-archive instead of hard delete so a past opportunity's expressed
    // interest survives (the admin can still see who raised their hand).
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byParish: index("idx_parish_opportunities_feed").on(t.parishFeedId),
  }),
);
