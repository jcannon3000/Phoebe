import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { actionsTable } from "./actions";

// An elected official a community "action" asks members to email — a
// state legislator, a city council member, a mayor, a school-board
// member, and so on.
//
// The action's creator names the target(s) and their public email
// address (state/local officials publish real emails; members of
// Congress do not — those need the CWC channel instead). Each official
// gets an "Email …" button on the action detail page that opens the
// member's mail app pre-filled with the address, subject, and the
// note they wrote.
export const actionOfficialsTable = pgTable("action_officials", {
  id: serial("id").primaryKey(),
  actionId: integer("action_id")
    .notNull()
    .references(() => actionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // Optional role / title — e.g. "State Senator, District 5".
  title: text("title"),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActionOfficialSchema = createInsertSchema(actionOfficialsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActionOfficial = z.infer<typeof insertActionOfficialSchema>;
export type ActionOfficial = typeof actionOfficialsTable.$inferSelect;
