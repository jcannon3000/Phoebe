import { pgTable, serial, integer, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Rhythm parties — "keeping a rhythm together": 2–3 people sharing one 30-day
// commitment (the Duolingo-friend-streak shape, in the church's oldest form —
// nobody kept the hours alone). The creator commits to a rhythm and shares an
// invite link that CARRIES THE RULE ITSELF (the preset id): accepting applies
// the same rhythm and aligns everyone to one Day-N counter. Presence over
// surveillance: companions ever see only TODAY's kept-ring, never history.
export const rhythmPartiesTable = pgTable("rhythm_parties", {
  id: serial("id").primaryKey(),
  createdById: integer("created_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // The share-link token (URL-safe, unguessable) — /companion/:token.
  token: text("token").notNull(),
  // Which starter rule the party keeps (RULE_PRESETS id on the client, e.g.
  // "psalms-daily" | "centering" | "offices" | "morning-anchor").
  presetId: text("preset_id").notNull(),
  // The trial length in days (30 for the month-of-days commitment).
  days: integer("days").notNull().default(30),
  // YYYY-MM-DD everyone counts Day 1 from — stamped when the FIRST companion
  // accepts (until then the party is pending and the creator's solo local
  // commitment carries them). Late joiners share the same start.
  startYmd: text("start_ymd"),
  // pending (no companion yet) → active → ended.
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => ({
  byToken: uniqueIndex("rhythm_parties_token").on(t.token),
  byCreator: index("rhythm_parties_by_creator").on(t.createdById),
}));

export const rhythmPartyMembersTable = pgTable("rhythm_party_members", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id").notNull().references(() => rhythmPartiesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  onePerParty: uniqueIndex("rhythm_party_members_once").on(t.partyId, t.userId),
  byUser: index("rhythm_party_members_by_user").on(t.userId),
}));

export type RhythmParty = typeof rhythmPartiesTable.$inferSelect;
export type RhythmPartyMember = typeof rhythmPartyMembersTable.$inferSelect;
