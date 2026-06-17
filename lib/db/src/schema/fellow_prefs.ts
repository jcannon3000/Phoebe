import { pgTable, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// fellow_prefs — the OWNER's per-fellow sharing settings (one row per (owner,
// fellow); a missing row means defaults). This is one-directional: it's how
// `ownerId` chooses to share with `fellowUserId`, independent of the reverse.
//
//   • samePlace  — subjective "this fellow lives in the same place as me" (the
//     user just says so; we never derive it from location). Default false.
//   • sharePlans — whether my fellow_plans are visible to this fellow. Default
//     TRUE (today every fellow sees them), so turning it OFF scopes plans down
//     to the people near you. Plans are local by nature, so the natural pairing
//     is: keep it on for same-place fellows, off for far-away ones.
//
// "Share daily progress" is intentionally NOT stored here — that lives in
// walk_pairings (Walking together), which is a MUTUAL opt-in, not a one-way flag.
export const fellowPrefsTable = pgTable(
  "fellow_prefs",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    fellowUserId: integer("fellow_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    samePlace: boolean("same_place").notNull().default(false),
    sharePlans: boolean("share_plans").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqOwnerFellow: uniqueIndex("fellow_prefs_owner_fellow").on(t.ownerId, t.fellowUserId),
  }),
);

export type FellowPref = typeof fellowPrefsTable.$inferSelect;
