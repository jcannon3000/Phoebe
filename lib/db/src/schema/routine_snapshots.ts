import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// A backlog of the routines a person has kept, so a change to their rule of
// life is never a one-way door.
//
// Owner: "a third option where it says revert to past routine, and we have a
// backlog that we saves routines. Every time they get the customizer."
//
// A snapshot is taken BEFORE a routine changes — opening the customizer, or
// accepting an AI-built one — so what's stored is the rhythm they actually
// lived with, not the one they're about to try. Restoring takes a snapshot of
// the current state first, which makes reverting itself revertible.
//
// `spec` holds a whole PrescribedRoutineSpec (see api-server lib/routineSpec.ts)
// — the same shape prescribed routines and the interview already use, so
// restoring is just applyRoutineSpecToUser with an older spec. Stored as jsonb
// rather than mirroring the users columns because those columns are what the
// spec captures; keeping a second copy of the shape would guarantee drift the
// first time one of them changes.
export const routineSnapshotsTable = pgTable(
  "routine_snapshots",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    spec: jsonb("spec").notNull(),
    // Where the snapshot came from — shown to the person as context for which
    // past routine they're looking at ("before you rebuilt it by hand").
    source: text("source").notNull().default("customizer"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    // The only read pattern: this user's snapshots, newest first.
    userCreatedIdx: index("routine_snapshots_user_created_idx").on(t.userId, t.createdAt),
  }),
);
