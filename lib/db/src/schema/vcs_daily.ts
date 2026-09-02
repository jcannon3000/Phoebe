import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// ── The Visual Commentary on Scripture — "Bible and Art Daily" ───────────────
//
// One row = "on this day, VCS appointed this commentary."
//
// WHY THIS IS A TABLE AND NOT A RESOLVER.
//
// Every other external reflection in Phoebe is resolved live: Nouwen and Grist
// read an RSS feed, VTS reads an index page, Sojourners probes a derivable URL
// (see routes/nouwen.ts, grist.ts, vts.ts, sojo.ts). None of that is possible
// here. thevcs.org answers **403 to server-side requests** — measured
// 2026-09-02 with both a bot user-agent and a full Safari one, on
// /bible-and-art-daily, /feed and /rss alike. There is no index we are allowed
// to read.
//
// What VCS does offer is a daily email. So the pipeline is inverted: rather
// than Phoebe fetching the day's commentary, VCS delivers it, and this table is
// where the delivered answer is kept. Owner: "what the newsletter does is link
// to a specific commentary, so what we want to do is not show the user the
// newsletter, but get it internally and take the user to that commentary they
// have appointed for the day."
//
// So the newsletter itself is never shown to anyone. It is parsed on arrival
// (routes/inbound-email.ts), the appointed commentary link is lifted out, and
// the reader is sent straight to that — the same shape as every other
// reflection source, just with email as the transport instead of HTTP.
//
// ONE ROW PER DAY, keyed on `ymd`, upserted: a newsletter that arrives twice
// (providers retry) must not create a second appointment for the same day, and
// a corrected re-send should win rather than be ignored.

export const vcsDailyTable = pgTable("vcs_daily", {
  id: serial("id").primaryKey(),
  /** YYYY-MM-DD the commentary is appointed FOR — the day the mail arrived. */
  ymd: text("ymd").notNull(),
  /** The commentary permalink lifted out of the newsletter. */
  url: text("url").notNull(),
  /** The work/commentary title, when the mail gives us one. */
  title: text("title"),
  /** Kept for debugging a bad parse without re-reading anyone's mailbox. */
  sourceSubject: text("source_subject"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ymdUnique: uniqueIndex("vcs_daily_ymd_unique").on(t.ymd),
}));
