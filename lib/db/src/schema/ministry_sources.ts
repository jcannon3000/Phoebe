import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { prayerFeedsTable } from "./prayer_feeds";

// A ministry website Phoebe scrapes for events. Admin-managed via the
// "Scraped Ministries" screen (routes/ministries.ts). Each source publishes
// scraped events as DRAFTS on a dedicated prayer feed (feedId) for review,
// then an admin confirms the date/time/location and publishes. The scraper
// (lib/ministryScraper.ts) auto-detects structured data — schema.org Event
// JSON-LD — and falls back to an HTML heuristic when there's none.
export const ministrySourcesTable = pgTable("ministry_sources", {
  id: serial("id").primaryKey(),
  // Display name, e.g. "Rural & Migrant Ministry".
  name: text("name").notNull(),
  // The page scraped for events.
  eventsUrl: text("events_url").notNull(),
  // The prayer feed scraped events attach to — one feed per source.
  feedId: integer("feed_id").notNull()
    .references(() => prayerFeedsTable.id, { onDelete: "cascade" }),
  // Disabled sources are skipped by sync-all (and the future scheduler).
  enabled: boolean("enabled").notNull().default(true),
  // Last sync outcome, surfaced in the manager ("Found 7, added 1 draft"
  // or an error message).
  lastStatus: text("last_status"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MinistrySource = typeof ministrySourcesTable.$inferSelect;
