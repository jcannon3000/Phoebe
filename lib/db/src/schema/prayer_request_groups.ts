import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { prayerRequestsTable } from "./prayer_requests";
import { groupsTable } from "./groups";
import { usersTable } from "./users";

// Which specific communities a shared prayer request was sent to.
// Owner: "have it have you select which communities to share it with" —
// before this table, sharing fanned out to EVERY group the requester
// belonged to (see garden.ts's getGardenUserIds, which unions peers across
// all of a viewer's group memberships); this scopes a request down to just
// the group(s) the requester actually picked when sharing.
//
// A request with NO rows here is a legacy/ungrouped request (created
// before this table existed, or shared by someone with zero groups) and
// keeps the old whole-garden visibility as a fallback — see prayer.ts's
// GET /prayer-requests and the create route's push fan-out, both of which
// branch on whether a request has any rows here.
export const prayerRequestGroupsTable = pgTable("prayer_request_groups", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => prayerRequestsTable.id, { onDelete: "cascade" }),
  groupId: integer("group_id").notNull().references(() => groupsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Owner: "an admin should be able to mute a prayer request from the
  // group" — a group admin can silence one request from THEIR group's
  // view without touching any other group it was also shared to, and
  // without muting the requester as a person (see user_mutes.ts, a
  // separate per-viewer feature). Set together; both null = not muted.
  mutedAt: timestamp("muted_at", { withTimezone: true }),
  mutedByUserId: integer("muted_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
}, (t) => ({
  uniq: unique().on(t.requestId, t.groupId),
}));
