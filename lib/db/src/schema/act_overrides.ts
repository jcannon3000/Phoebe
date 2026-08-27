import { pgTable, integer, boolean, timestamp } from "drizzle-orm/pg-core";

// The owner's runtime curation of the ACT art library (the admin
// art-library tool): a work can be DELETED from every surface (`hidden`),
// or toggled into / out of the Praying-with-Icons pool (`isIcon`; null =
// leave it wherever the harvest put it). Keyed by ACT's own record id so
// the overrides survive catalogue regenerations — a re-harvest must never
// resurrect a deleted work (the whole reason this lives in a table and not
// in the generated file).
export const actOverridesTable = pgTable("act_overrides", {
  actId: integer("act_id").primaryKey(),
  hidden: boolean("hidden").notNull().default(false),
  isIcon: boolean("is_icon"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
