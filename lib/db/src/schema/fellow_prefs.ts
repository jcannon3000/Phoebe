import { pgTable, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// fellow_prefs — the OWNER's per-fellow sharing settings (one row per (owner,
// fellow); a missing row means defaults). This is one-directional: it's how
// `ownerId` chooses to share with `fellowUserId`, independent of the reverse.
//
//   • samePlace  — subjective "this fellow lives in the same place as me" (the
//     user just says so; we never derive it from location). Default false.
//     Plans are local by nature, so this is also the marker for keeping local
//     plans local (the separate "share plans" flag was retired in favour of it).
//   • shareProgress — whether this fellow can see my TODAY-ONLY daily rhythm
//     dots in Walking together. Default TRUE (every fellow sees them, still
//     gated by the heart-to-heart window); turning it OFF hides my progress
//     from this one fellow. One-way: it's my choice about what I show them.
//
// `sharePlans` is retained as a column for back-compat but is no longer surfaced
// in the UI — plan visibility now follows the relationship, not a per-fellow flag.
export const fellowPrefsTable = pgTable(
  "fellow_prefs",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    fellowUserId: integer("fellow_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    samePlace: boolean("same_place").notNull().default(false),
    sharePlans: boolean("share_plans").notNull().default(true),
    shareProgress: boolean("share_progress").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqOwnerFellow: uniqueIndex("fellow_prefs_owner_fellow").on(t.ownerId, t.fellowUserId),
  }),
);

export type FellowPref = typeof fellowPrefsTable.$inferSelect;
