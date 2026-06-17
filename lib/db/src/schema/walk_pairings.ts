import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// walk_pairings — "Walking together": a mutual-opt-in layer ON TOP of the
// Fellow bond letting two people see each other's TODAY-ONLY rhythm dots and
// send a one-tap word of encouragement.
//
// This is companionship, not surveillance. Being fellows is REQUIRED but NOT
// sufficient — both must additionally consent here. Nothing is shared until
// status='active'. Stored normalized (lo < hi) as a single row mirroring
// prayer_partnerships, so "are we walking together" is one lookup.
//
// Deliberately NOT modeled (anti-patterns we never build): streaks across
// users, history/calendars, exact times, leaderboards, "they're behind"
// comparisons. Only TODAY's kept-anchor booleans are ever shared.
//
//   status: 'pending'  — one invited, awaiting the other's accept (NO sharing)
//           'active'   — both consented; today-dots visible BOTH ways
//           'paused'   — reversibly frozen by either side (NO sharing, symmetric)
//           'ended'    — one stopped it; revived (not duplicated) on reconnect
export const walkPairingsTable = pgTable("walk_pairings", {
  id: serial("id").primaryKey(),
  // Normalized pair — userLoId < userHiId, always (use normalizePair()).
  userLoId: integer("user_lo_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  userHiId: integer("user_hi_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  invitedById: integer("invited_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  // Optional "why now?" one-liner — seeds a shared intention (companionship,
  // not a metric). Shown as a quiet caption on the companion row.
  intention: text("intention"),
  // Who paused (so the resume copy can be tailored); visibility is symmetric.
  pausedById: integer("paused_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  // Celebration-push idempotency (cron deferred; columns shipped now so wiring
  // it later needs no migration): last YYYY-MM-DD we pushed "kept their whole
  // day" about lo / about hi — at most once per day per direction, positive-only.
  loCelebratedDate: text("lo_celebrated_date"),
  hiCelebratedDate: text("hi_celebrated_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  endedById: integer("ended_by_id").references(() => usersTable.id, { onDelete: "set null" }),
}, (t) => ({
  uniquePair: uniqueIndex("walk_pairings_pair").on(t.userLoId, t.userHiId),
  byLo: index("walk_pairings_lo").on(t.userLoId),
  byHi: index("walk_pairings_hi").on(t.userHiId),
}));

export type WalkPairing = typeof walkPairingsTable.$inferSelect;

// walk_nudges — a lightweight one-tap encouragement between walking companions
// ("praying for you", "glad you're here", "thinking of you"). NOT a chat (no
// threading); pre-written kinds only in beta. Free text escalates to Messages.
export const walkNudgesTable = pgTable("walk_nudges", {
  id: serial("id").primaryKey(),
  pairId: integer("pair_id").notNull().references(() => walkPairingsTable.id, { onDelete: "cascade" }),
  fromUserId: integer("from_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  toUserId: integer("to_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "praying" | "cheer" | "thinking"
  seenAt: timestamp("seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byTo: index("walk_nudges_to").on(t.toUserId),
  byPair: index("walk_nudges_pair").on(t.pairId),
}));

export type WalkNudge = typeof walkNudgesTable.$inferSelect;
