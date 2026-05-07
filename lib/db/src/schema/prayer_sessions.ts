import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-user prayer-time ledger. One row per finished session in:
//   • prayer-mode (the daily prayer slideshow at /prayer-mode)
//   • the four Daily Office / Devotion liturgies in OfficeViewer
//
// Sessions are committed when the React component unmounts (or when
// the user explicitly exits via the "Done" button). If the user
// backgrounds the app and never comes back, the in-flight session is
// lost — that's intentional, since we don't want to credit prayer
// time for a phone left on a slide overnight.
//
// `durationSeconds` is the only metric we read in aggregate; the
// startedAt / endedAt timestamps are kept for ad-hoc inspection if
// the metrics ever look off. `surface` lets the metrics page break
// down totals by where the time was spent.

export const prayerSurfaces = [
  "slideshow",
  "morning-prayer",
  "evening-prayer",
  "morning-devotion",
  "early-evening-devotion",
] as const;
export type PrayerSurface = (typeof prayerSurfaces)[number];

export const prayerSessionsTable = pgTable(
  "prayer_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // Stored as plain text so the enum can grow (e.g. adding "compline"
    // later) without a schema migration. The client + metrics queries
    // both treat this as opaque.
    surface: text("surface").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    // Metrics queries filter by user + ended_at window. The composite
    // index covers both axes so a "this week" rollup for one user is
    // an index-only scan.
    userEndedIdx: index("idx_prayer_sessions_user_ended").on(t.userId, t.endedAt),
  }),
);
