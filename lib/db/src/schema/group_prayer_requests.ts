import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { groupsTable } from "./groups";
import { usersTable } from "./users";

/**
 * A parish prayer list, with a leader between the form and the congregation.
 *
 * Owner: "instead of users just sending it out to the whole group, but just
 * like in a parish community where they have a prayer list submission form —
 * you submit the prayer request and an admin approves it and an admin manages
 * the list."
 *
 * MODERATION IS THE SAFER DESIGN, not the riskier one, and the reason is
 * practical rather than legal. The sharpest risk on a parish prayer list is not
 * defamation, it is THIRD-PARTY HEALTH INFORMATION: "pray for my neighbour,
 * who has just been diagnosed with…" about someone who never consented and may
 * not know they are on a list. An admin reading it first is the only point
 * where that gets caught, which is why `body` is EDITABLE by the admin rather
 * than only approvable — they need to be able to soften a request rather than
 * face a choice between publishing it as written and refusing it.
 *
 * It follows that the pending queue is itself sensitive: unreviewed, unconsented
 * detail sitting in a table. It should live under the same retention rules as
 * everything else, not accumulate for ever.
 */
export const groupPrayerRequestsTable = pgTable(
  "group_prayer_requests",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id").notNull()
      .references(() => groupsTable.id, { onDelete: "cascade" }),
    /** Null for a request an admin wrote themselves, or an anonymous one. */
    submittedByUserId: integer("submitted_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    /** Shown to the admin in the queue; never published with the request. */
    submitterName: text("submitter_name"),
    /** The request as it will be prayed. Editable by the admin — see above. */
    body: text("body").notNull(),
    /** As submitted, kept when an admin edits, so the change is visible. */
    originalBody: text("original_body"),
    /**
     * "pending" — waiting for a leader. Never visible to the group.
     * "approved" — on the list.
     * "declined" — refused; kept rather than deleted so the same request
     *   arriving three times isn't re-reviewed three times from scratch.
     * "archived" — answered, or simply finished.
     */
    status: text("status").notNull().default("pending"),
    reviewedByUserId: integer("reviewed_by_user_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /**
     * The admin's own ordering. Lower first; ties fall back to newest.
     * Owner asked for the leader to be able to "preference them" — a prayer
     * list is not a feed, and the person keeping it knows what belongs at the
     * top this week.
     */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // The two questions asked of this table: the group's approved list, and
    // the group's pending queue. Both are (group, status).
    byGroupStatus: index("idx_group_prayer_requests_group_status").on(t.groupId, t.status),
  }),
);
