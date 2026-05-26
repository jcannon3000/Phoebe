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
  // Just opening /prayer-list counts as "praying" for the metrics
  // dashboard's Times-prayed rollup. Visit rows are exempt from the
  // 5-second minimum so a brief glance still records.
  "prayer-list",
  // Silent contemplation timer — launched from the prayer-mode pause
  // slide or the Contemplation menu entry. One row per completed (or
  // ended-early) sit; durationSeconds is the actual time spent, which
  // backs the "time in contemplation" stat on the Contemplation page.
  "contemplation",
  // Tap-out to the National Cathedral's live Morning Prayer broadcast
  // (cathedral.org, weekdays at 7 AM Eastern). We log a fixed
  // ~20-minute session on tap — same shape as the office "visit"
  // surfaces — because once the user opens the external page they're
  // engaging with Morning Prayer at the cathedral; we can't observe
  // how long they actually watch.
  "national-cathedral",
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
    // High-water mark of the slide index the user advanced to during
    // the session. Used by the metrics dashboard to tell "they
    // actually prayed an office" (≥3 slides) from "they tapped in
    // and bailed" (<3). Nullable so legacy rows pre-dating this
    // column don't have to be backfilled — the metrics query
    // treats NULL as "trust it" so old data still counts.
    slidesCompleted: integer("slides_completed"),
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
