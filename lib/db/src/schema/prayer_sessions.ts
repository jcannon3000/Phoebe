import { pgTable, serial, integer, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
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
  // In-app listen to Forward Movement's daily Episcopal office podcasts
  // (BCP 1979 Morning / Evening Prayer, read aloud). The listen page
  // tracks real foreground audio time and commits one row on leave,
  // same watch-time model as national-cathedral. A session >= 180s
  // counts as the matching office (see users.ts office-history gates):
  // morning-office-podcast → morning side, evening-office-podcast →
  // evening side.
  "morning-office-podcast",
  "evening-office-podcast",
  // Generic in-app podcast listening (the browse-and-play content from
  // CAC, National Cathedral, VTS, etc. — see routes/podcast.ts). Logs
  // real listen time toward the "time praying" rollup, but does NOT
  // credit a daily office the way the office-podcast surfaces do — this
  // is general spiritual content, not Morning/Evening Prayer.
  "podcast",
  // Private daily journal — time spent writing a reflection entry. Logs
  // toward the "time praying" rollup like the other contemplative
  // surfaces. Entries live in journal_entries (see routes/journal.ts).
  "journal",
  /**
   * THE THREE THE CLIENT HAS BEEN POSTING ALL ALONG.
   *
   * `POST /api/prayer-sessions` rejects an unknown surface with a 400, and
   * `sessionOutbox` treats a 4xx as permanent and drops it — so these three
   * were never recorded, silently. The office flipped its local flag, the
   * person saw it kept, and no row was ever written: nothing on another
   * device, nothing in office history, nothing in the weekly grid.
   *
   * The READ side already expected them — routes/users.ts and routes/groups.ts
   * all include 'compline' in their completed-office gates — and this file's
   * own comment said the column is text "so the enum can grow (e.g. adding
   * 'compline' later)". It never did.
   *
   *   compline   — the night office (bcp-daily-office.tsx, officeManualLog)
   *   examen     — the Examen (pages/examen.tsx); not beta-gated, so this
   *                has been losing its "time praying" credit for everyone
   *   scripture  — Daily Scripture Reading, the reading deck
   */
  "compline",
  "examen",
  "scripture",
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
    // True only when the user finished the office/devotion slideshow (reached
    // the closing Amen/Done, or attested "I prayed this" from the book). The
    // office-history / "prayed today" rollups require this for the four office
    // surfaces, so a partial sit that auto-commits on unmount no longer counts
    // the office. Default false; non-office surfaces ignore it.
    completed: boolean("completed").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    // Per-session visibility. When true, the session is hidden from
    // other users' "who sat with me" companion lists (the contemplation
    // summary screen + history overlap row). The viewer always sees
    // their own private sits in their own history. Default false so
    // existing rows behave as before; the toggle on the contemplation
    // summary screen flips this for individual sits.
    isPrivate: boolean("is_private").notNull().default(false),
    // Display tag for where a contemplation sit came from, distinct from
    // `surface` (which stays "contemplation" so the goal/stats/streak rollups
    // keep counting it). Today only "cobreathe" is set, so the Contemplation
    // history can label a Cobreathe sit. NULL = a plain silent sit.
    source: text("source"),
    // Which per-side contemplation card ("morning" | "evening") this sit was
    // attributed to — set by the client at POST time using the same rule the
    // local attribution applies (explicit ?side= wins, else the first undone
    // active side). Lets /api/me/contemplation-sides-today echo per-side
    // done-state to the user's OTHER devices (the localStorage flag alone made
    // a sit done on the iPhone read undone on the web). NULL = a sit that
    // isn't a per-side card (offices, slideshow, older rows).
    contemplationSide: text("contemplation_side"),
  },
  (t) => ({
    // Metrics queries filter by user + ended_at window. The composite
    // index covers both axes so a "this week" rollup for one user is
    // an index-only scan.
    userEndedIdx: index("idx_prayer_sessions_user_ended").on(t.userId, t.endedAt),
  }),
);
