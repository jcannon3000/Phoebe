import { pgTable, serial, text, integer, timestamp, date, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { groupsTable } from "./groups";

// Group Daily Reflections (beta).
//
// A community can pin a daily-reflection source (currently CAC Daily
// Reflection or Forward Day by Day). Members tap to open today's reading
// externally; when they come back to Phoebe they're prompted to write a
// short reflection that's shared with the rest of the community. Other
// members can comment on each reflection.
//
// The "did the user open today's reading?" signal lives client-side in
// localStorage (see `cacReadState.ts`). We don't try to mirror it to the
// server — it's a UX nudge ("Read again" vs. "Read"), not a piece of
// state worth a column. The reflection write step is what actually
// produces server-visible state.

// ── group_reflection_sources ─────────────────────────────────────────────
// One row per group that's enabled the feature. Setting the source to
// `null` is not allowed at the table level — to "turn it off", delete
// the row.
//
// Why a separate table (vs. a column on `groups`): keeps the feature
// opt-in and reversible. Existing groups without a row read as "feature
// not enabled" and don't show the card. The column approach would have
// added a nullable enum to every group row, including hundreds of
// communities that will never use this.
export const groupReflectionSourcesTable = pgTable("group_reflection_sources", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" })
    .unique(),
  // "cac" = Center for Action and Contemplation Daily Reflection.
  // "fdd" = Forward Day by Day (Forward Movement).
  // Stored as text (not an enum) so adding a third source later is a
  // server-side migration without a schema change.
  source: text("source").notNull(),
  // Who set / last changed it. Audit trail only — permissions are
  // checked at request time against the `groups` admin role.
  setByUserId: integer("set_by_user_id")
    .references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GroupReflectionSource = typeof groupReflectionSourcesTable.$inferSelect;

// ── group_reflections ────────────────────────────────────────────────────
// One reflection per user per day per group. Date is stored as a plain
// `date` (no time / no zone) — the publisher's "today" is what the
// reflection is *about*, but each user wakes into their own local day,
// and we want a user's reflection sorted under the same date string
// they see in the UI. The client computes the date from
// `new Date().toLocaleDateString("en-CA")` (en-CA renders ISO yyyy-mm-dd)
// before submitting.
//
// `source` is stored alongside the date so that if a community swaps
// from CAC to FDD mid-day, old reflections under the previous source
// don't merge into the new day's thread.
export const groupReflectionsTable = pgTable("group_reflections", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull()
    .references(() => groupsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  reflectionDate: date("reflection_date").notNull(),
  // Mirrors the same "cac" | "fdd" vocabulary as the sources table.
  source: text("source").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // One reflection per user per day per source per group. The "source"
  // is included so a community that switched sources doesn't collide
  // a user's previous-source reflection with their new-source one.
  oneReflectionPerUserPerDay: uniqueIndex("group_reflections_unique_per_day")
    .on(t.groupId, t.userId, t.reflectionDate, t.source),
  // Lookup index for the common "today's reflections in this group" query.
  byGroupAndDate: index("group_reflections_by_group_date").on(t.groupId, t.reflectionDate),
}));

export type GroupReflection = typeof groupReflectionsTable.$inferSelect;

// ── group_reflection_comments ────────────────────────────────────────────
// A comment thread under a reflection. Open to any member of the same
// group (enforced at request time, not at the schema level). No
// nesting; replies are surfaced as a flat list, ordered by createdAt
// ascending.
export const groupReflectionCommentsTable = pgTable("group_reflection_comments", {
  id: serial("id").primaryKey(),
  reflectionId: integer("reflection_id").notNull()
    .references(() => groupReflectionsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byReflection: index("group_reflection_comments_by_reflection").on(t.reflectionId, t.createdAt),
}));

export type GroupReflectionComment = typeof groupReflectionCommentsTable.$inferSelect;
