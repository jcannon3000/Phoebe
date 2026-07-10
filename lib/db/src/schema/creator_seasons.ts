import { pgTable, serial, integer, text, jsonb, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";
import type { PrescribedRoutineSpec } from "./prescribed_routines";

// Creator seasons — a creator turns the practice their content inspired into a
// BOUNDED season people actually live: one-tap join link (no account wall — the
// anonymous device user carries it), a cohort-shared Day-N clock (finite is the
// point: 2–4 weeks, not forever), daily check-ins the group witnesses (today's
// count + faces, never history), and short async notes from the creator a few
// times a week. Built on the prescribed-routines spec (joining APPLIES the
// practice like a preset link) + the rhythm-party cohort shape, with the
// creator-notes feed layered on. Creation is super-admin gated for now.
export const creatorSeasonsTable = pgTable("creator_seasons", {
  id: serial("id").primaryKey(),
  // The public join-link token — /season/:token.
  token: text("token").notNull(),
  // "Building a reading practice that feels expansive"
  title: text("title").notNull(),
  // The display name viewers know — "Nina Montagne".
  creatorName: text("creator_name").notNull(),
  // A short landing-page paragraph in the creator's voice.
  description: text("description"),
  // The practice itself — same portable shape as prescribed routines, so
  // joining applies it with the same machinery ("take the practice home").
  spec: jsonb("spec").$type<PrescribedRoutineSpec>().notNull(),
  // Season length in days (14–28; three weeks is the sweet spot).
  durationDays: integer("duration_days").notNull().default(21),
  // Cohort-shared Day 1 (YYYY-MM-DD) — everyone counts from the same morning,
  // which is what makes the check-ins a shared season instead of N solo runs.
  startYmd: text("start_ymd").notNull(),
  createdByUserId: integer("created_by_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // COMMUNITY seasons — a season a group's leaders run for the whole
  // community ("we keep our rule together for these three weeks"). NULL = the
  // original creator-audience shape. A community season snapshots the group's
  // rule of life as its spec, so joining = taking up the rule for the season.
  groupId: integer("group_id").references(() => groupsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byToken: uniqueIndex("creator_seasons_token").on(t.token),
  byCreator: index("creator_seasons_by_creator").on(t.createdByUserId),
  byGroup: index("creator_seasons_by_group").on(t.groupId),
}));

export const creatorSeasonMembersTable = pgTable("creator_season_members", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull().references(() => creatorSeasonsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  oncePerSeason: uniqueIndex("creator_season_members_once").on(t.seasonId, t.userId),
  byUser: index("creator_season_members_by_user").on(t.userId),
}));

// The creator's short async notes ("showing up a few times a week") — one-way,
// read by members on the season page. Not a chat.
export const creatorSeasonNotesTable = pgTable("creator_season_notes", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull().references(() => creatorSeasonsTable.id, { onDelete: "cascade" }),
  authorUserId: integer("author_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  bySeason: index("creator_season_notes_by_season").on(t.seasonId),
}));

// One "I kept it today" per member per local day. The group sees TODAY's
// count + names — presence, not a scoreboard; no history is surfaced.
export const creatorSeasonCheckinsTable = pgTable("creator_season_checkins", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull().references(() => creatorSeasonsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // The member's local calendar day (YYYY-MM-DD), client-supplied like the
  // other viewer-tz surfaces.
  ymd: text("ymd").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  oncePerDay: uniqueIndex("creator_season_checkins_once").on(t.seasonId, t.userId, t.ymd),
  bySeasonDay: index("creator_season_checkins_by_season_day").on(t.seasonId, t.ymd),
}));

export type CreatorSeason = typeof creatorSeasonsTable.$inferSelect;
export type CreatorSeasonMember = typeof creatorSeasonMembersTable.$inferSelect;
export type CreatorSeasonNote = typeof creatorSeasonNotesTable.$inferSelect;
export type CreatorSeasonCheckin = typeof creatorSeasonCheckinsTable.$inferSelect;
