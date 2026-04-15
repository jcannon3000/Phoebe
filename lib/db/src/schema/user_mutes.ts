import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userMutesTable = pgTable("user_mutes", {
  id: serial("id").primaryKey(),
  muterId: integer("muter_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  mutedUserId: integer("muted_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unique: unique().on(t.muterId, t.mutedUserId),
}));
