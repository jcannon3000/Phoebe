import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { actionsTable } from "./actions";
import { actionOfficialsTable } from "./action_officials";

// One row each time a member opens a pre-filled email to an action's
// official from the detail page.
//
// We can't see inside the device mail app, so this can't confirm the
// message was actually sent — it tracks "emails started," which is the
// count the action surfaces ("N emails sent") and the same proxy every
// advocacy tool counts.
export const actionEmailSendsTable = pgTable("action_email_sends", {
  id: serial("id").primaryKey(),
  actionId: integer("action_id")
    .notNull()
    .references(() => actionsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  // Which official this send was addressed to. Nullable + ON DELETE SET
  // NULL so removing an official later doesn't erase the historical
  // count.
  officialId: integer("official_id").references(
    () => actionOfficialsTable.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertActionEmailSendSchema = createInsertSchema(actionEmailSendsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActionEmailSend = z.infer<typeof insertActionEmailSendSchema>;
export type ActionEmailSend = typeof actionEmailSendsTable.$inferSelect;
