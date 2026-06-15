import { pgTable, serial, integer, text, timestamp, uniqueIndex, index, doublePrecision } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Breathing Together (beta) — "con-spire", from Latin con + spirare, to
// breathe together. Once a day a person sits through a short guided breath
// for justice; afterwards they're told how many other people breathed that
// same day. Not synchronized in time — the point is the asynchronous body:
// everyone who held the practice today shares one breath count, an embodied
// recognition of interconnection (Kearns, "Con-spiring Together: Breathing
// for Justice").
//
// One row per (user, local day). `day` is the user's LOCAL calendar day as
// YYYY-MM-DD — same TEXT local-day convention as practice_completion and
// contemplation_health_minutes. The "breathed with N people" count is simply
// COUNT(*) of rows for that day string across all users.
export const breathSessionsTable = pgTable(
  "breath_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // YYYY-MM-DD in the user's timezone.
    day: text("day").notNull(),
    // Length of the guided breath actually kept, for future stats.
    seconds: integer("seconds").notNull().default(0),
    // Optional, opt-in coarse (~1 mile) location of the day's cobreathe, plus the
    // Google Place the user anchored it to (a nearby church). All nullable — set
    // only when the user has location sharing on. Powers "your churches" history
    // and the per-church counts among people you're connected with.
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    placeId: text("place_id"),
    placeName: text("place_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One breath per user per local day — also the upsert target.
    userDayUk: uniqueIndex("breath_sessions_user_day_uk").on(t.userId, t.day),
    // The daily count query scans by day string.
    dayIdx: index("breath_sessions_day_idx").on(t.day),
    // Per-church lookups (history counts + "who's at this church").
    placeIdx: index("breath_sessions_place_idx").on(t.placeId),
  }),
);
