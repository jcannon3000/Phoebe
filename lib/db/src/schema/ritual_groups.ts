import {
  pgTable,
  serial,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ritualsTable } from "./rituals";
import { groupsTable } from "./groups";

// Many-to-many between rituals (gatherings) and groups (communities).
//
// The PRIMARY host community stays on rituals.group_id — it drives
// "Hosted by" labels, admin permissions, and is the only community
// that survives if a single-community ritual was created the old way.
// This table holds ADDITIONAL communities that should also see / be
// invited to the same gathering, so a Zoom call can span two parishes
// without duplicating the ritual.
//
// Members of any linked community (primary OR additional) see the
// gathering on their dashboard, and the "new gathering" push fans out
// across the union of joined members — a gathering has no RSVP or
// calendar invites, it's just a posted announcement.
//
// Mirrors the "additional group ids" pattern intercessions use for
// the same multi-community case.
export const ritualGroupsTable = pgTable(
  "ritual_groups",
  {
    id: serial("id").primaryKey(),
    ritualId: integer("ritual_id")
      .notNull()
      .references(() => ritualsTable.id, { onDelete: "cascade" }),
    groupId: integer("group_id")
      .notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqRitualGroup: uniqueIndex("uniq_ritual_groups_ritual_group").on(
      t.ritualId,
      t.groupId,
    ),
  }),
);

export type RitualGroup = typeof ritualGroupsTable.$inferSelect;
