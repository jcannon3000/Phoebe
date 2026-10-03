import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

// One row per view of a public page we want a count for - the About page and its deck to
// start with (owner, 2026-10-03: "an metric for views on the about page").
//
// No account is needed to look at those pages and most people who do have none, so a view is
// recorded without a user. `visitor` is a random id the browser makes for itself (never an IP
// address or anything about the person), which lets the admin page say how many DIFFERENT
// visitors there were as well as how many views. The server ignores a second view of the same
// page by the same visitor within half an hour, so a refresh is not a view.
export const pageViewsTable = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    page: text("page").notNull(),
    visitor: text("visitor").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pageWhen: index("idx_page_views_page_when").on(t.page, t.viewedAt),
    visitorWhen: index("idx_page_views_visitor_when").on(t.visitor, t.page, t.viewedAt),
  }),
);
