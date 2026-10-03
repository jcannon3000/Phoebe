import { pgTable, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Per-person switches for kinds of notification, beyond the master one on the user row.
//
// invitations_enabled: the EXTRA notifications that invite you to a practice rather than
// remind you of one you keep - the Feast Day note, "A moment to reflect", "Want to take a
// moment to breathe" (owner, 2026-10-03: people can turn "invitations" off in Settings).
// No row means ON, so nobody has to be migrated; sendPushToUser reads it for any push
// marked `invitation`.
export const notificationPrefsTable = pgTable("notification_prefs", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  invitationsEnabled: boolean("invitations_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPrefs = typeof notificationPrefsTable.$inferSelect;
