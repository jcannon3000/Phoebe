import { pgTable, serial, integer, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Audio Divina log — the account-wide "sacred listening" journal (see
// pages/listening.tsx). The practice is logging-first: you put on music
// (streaming or an analog medium) and note WHAT you listened to + HOW. Unlike
// breath_sessions (one row per day), this is an append log — multiple sittings
// a day are fine — so there's no unique (user, day) index. `day` is the user's
// LOCAL calendar day as YYYY-MM-DD, the same TEXT local-day convention used by
// breath_sessions / practice_completion.
export const listeningEntriesTable = pgTable(
  "listening_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // YYYY-MM-DD in the user's timezone.
    day: text("day").notNull(),
    // How they listened: streaming | cd | vinyl | tape.
    medium: text("medium").notNull(),
    // What they put on (free text; streaming may carry an autocompleted title).
    what: text("what").notNull().default(""),
    // Album/track artwork URL from the Apple Music search autocomplete (https
    // mzstatic catalog URL, which loads in <img>). Empty when free-typed.
    artworkUrl: text("artwork_url").notNull().default(""),
    // Optional reflection — "what did it stir in you?".
    experience: text("experience").notNull().default(""),
    // Private by default; when shared=true the entry appears on the viewer's
    // Fellows feed (mirrors gratitude's `shared`, but scoped to fellows).
    shared: boolean("shared").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("listening_entries_user_idx").on(t.userId),
    userDayIdx: index("listening_entries_user_day_idx").on(t.userId, t.day),
  }),
);
