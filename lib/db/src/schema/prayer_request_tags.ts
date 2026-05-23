import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { prayerRequestsTable } from "./prayer_requests";

// A "tag" on a prayer request — the owner explicitly named someone
// (e.g. "praying for my friend Matthew") so that person is folded
// into the request:
//   • Visibility — the tagged user can see the request even if
//     they're not in any community / garden / fellow link with the
//     owner. Drives /api/prayer-requests filtering server-side.
//   • Notifications — first-amen + words-of-comfort pushes fan out
//     to tagged users in addition to the owner. (A periodic daily
//     summary digest for subsequent amens is a future addition.)
//   • Opt-out — the tagged user can remove themselves; `removed_at`
//     marks that without dropping the audit row.
//
// Distinct from Fellows: tags are per-request and one-directional
// (owner → recipient), not a durable person-to-person link.
export const prayerRequestTagsTable = pgTable("prayer_request_tags", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => prayerRequestsTable.id, { onDelete: "cascade" }),
  taggedUserId: integer("tagged_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Who tagged them — usually the request owner, kept here for the
  // audit trail and to support owner-admin tools later.
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  removedAt: timestamp("removed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Same person can't be re-tagged on the same request twice (a
  // re-tag flow lifts removed_at back to NULL instead of inserting).
  uniq: unique().on(t.requestId, t.taggedUserId),
}));
