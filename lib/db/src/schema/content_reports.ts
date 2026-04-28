import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// User reports of objectionable content. Required by App Store review
// (Guideline 1.2): apps with user-generated content must let users flag
// it so the operator can review and act within 24 hours.
//
// Phoebe's UGC surfaces are prayer requests, prayer-request words
// (comments), and letters. Each report records WHO reported, WHAT they
// reported (kind + targetId), and WHY (free-text reason).
//
// `kind` is a small enum-as-string so we can add new surfaces later
// without a migration. `targetId` is the row id in the appropriate
// table (e.g. prayer_requests.id when kind='prayer_request'). We
// don't FK-link it because we want the report to survive even if the
// reported content is later deleted by the author.
//
// `status` lifecycle: 'open' on insert; 'reviewed' once an operator
// has acted; 'dismissed' for false alarms. Indexed so the eventual
// admin dashboard can paginate the queue cheaply.
export const contentReportsTable = pgTable("content_reports", {
  id: serial("id").primaryKey(),
  reporterUserId: integer("reporter_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // e.g. 'prayer_request' | 'prayer_word' | 'letter'
  targetId: integer("target_id").notNull(),
  reason: text("reason"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (t) => ({
  byStatus: index("idx_content_reports_status_created").on(t.status, t.createdAt),
  byReporter: index("idx_content_reports_reporter").on(t.reporterUserId),
}));
