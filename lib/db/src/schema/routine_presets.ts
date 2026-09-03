import { pgTable, serial, text, jsonb, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * THE STARTER RHYTHMS, AS DATA — so a super admin can edit them without a
 * deploy.
 *
 * Owner: "I want an admin tool where I could edit the preset routines
 * including the default one."
 *
 * The presets themselves still ship in code (mymonastery lib/rulePresets.ts's
 * RULE_PRESETS) and that list stays the FALLBACK: a device with no network, a
 * cold first open, or an empty table gets exactly what it gets today. A row
 * here is an OVERLAY on that list, keyed by the preset's own id:
 *
 *   · a row whose slug matches a built-in REPLACES it (edit the VTS rule)
 *   · a row with a new slug ADDS a preset (a season, a parish's rhythm)
 *   · `hidden` takes a built-in off the picker without deleting anything
 *   · slug "__default__" is THE DEFAULT RHYTHM — what a new device seeds and
 *     what "reset routine to default" returns to (guestSeed.ts). It is not one
 *     of the picker's rules, which is why it needs a reserved slug rather than
 *     a flag on one of them.
 *
 * `body` is a whole RulePreset object (the client's own type), stored as JSON
 * rather than columns: that type carries fourteen optional fields — day rules,
 * custom anchors, per-side names, anchor reflections, practice slots,
 * relational practices — and a column per field would go stale the first time
 * one is added, silently dropping it on save. The server validates the shape
 * on write (routes/routine-presets.ts) and the client merges by id.
 */
export const routinePresetsTable = pgTable("routine_presets", {
  id: serial("id").primaryKey(),
  /** The RulePreset id it overrides or adds ("morning-anchor", "vts"), or the
   *  reserved "__default__". */
  slug: text("slug").notNull().unique(),
  /** A whole RulePreset (or, for "__default__", the seed shape). Untyped here
   *  on purpose — the shape belongs to the client and is validated on write. */
  body: jsonb("body").$type<Record<string, unknown>>().notNull(),
  /** Take a built-in off the picker. A hidden row keeps its body, so turning
   *  it back on is one tap rather than retyping the rule. */
  hidden: boolean("hidden").notNull().default(false),
  /** Where it sits in the picker. Built-ins keep their code order; a row's
   *  order only matters among added ones (null = after the built-ins). */
  sortOrder: integer("sort_order"),
  updatedByUserId: integer("updated_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  bySlug: index("routine_presets_by_slug").on(t.slug),
}));

export type RoutinePresetRow = typeof routinePresetsTable.$inferSelect;
