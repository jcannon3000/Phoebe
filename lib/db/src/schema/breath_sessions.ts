import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { breathPlacesTable } from "./breath_places";

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
    /**
     * WHERE they breathed, when they chose a designated place — see
     * breath_places. Null is the normal case: breathing anywhere at all is
     * still the practice, and a place is an option, never a requirement.
     */
    placeId: integer("place_id").references(() => breathPlacesTable.id, { onDelete: "set null" }),
    /**
     * Did the device confirm they were actually within the place's radius?
     *
     * The CHECK happens on-device — the app compares its own coordinates to
     * the place's and sends only this boolean. Coordinates are never
     * transmitted or stored, which is what keeps this clear of the location
     * surface removed in f900693b.
     *
     * False is a real and expected state, not a failure: permission denied,
     * no fix indoors, or genuinely praying with a place in mind from
     * elsewhere. The breath still counts — only the "verified here today"
     * tally distinguishes them.
     */
    placeVerified: boolean("place_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // One breath per user per local day — also the upsert target.
    userDayUk: uniqueIndex("breath_sessions_user_day_uk").on(t.userId, t.day),
    // The daily count query scans by day string.
    dayIdx: index("breath_sessions_day_idx").on(t.day),
    // "Who breathed HERE today" — the place page's only query.
    placeDayIdx: index("breath_sessions_place_day_idx").on(t.placeId, t.day),
  }),
);
