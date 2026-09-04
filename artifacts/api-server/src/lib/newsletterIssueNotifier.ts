import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { taizeMeditations } from "../routes/taize";
import { weeklyPosts } from "../routes/andrews";
import { sendPushToUsers } from "./pushSender";
import { isSuperAdminUser } from "./superAdmin";
import { listWeeklySources, weeklySubscriberIds } from "../routes/weeklies";
import { feedPosts } from "./weeklyFeed";
import { getCurrentTimeInTz } from "./tz";
import { logger } from "./logger";

/**
 * "Fresh Off The Presses" — a push when a WEEKLY newsletter has a new issue.
 *
 * Owner (2026-09-04): "for weekly newsletters we want to send a notification
 * when there is a new one to notify them it's ready … Have the top line say
 * Fresh Off The Presses. Then the second line say the name of the newsletter
 * and the title of the reflection that week, and say it's now available."
 *
 * Shape: every tick reads each weekly feed's NEWEST issue (the same cached
 * lists the cards and the reader's "Previous" menu use), claims that issue
 * once in newsletter_issue_pushes, and pushes to everyone who has the
 * newsletter's card on their home — the same test the Newsletters page's
 * Manage switch writes (order has the key, hidden does not). Andrew's
 * Version is super-admin-only in the app, so its push is too.
 *
 * Two guards worth knowing:
 * - FIRST SIGHTING IS A BASELINE, NOT A PUSH. The first time a source is seen
 *   (no row for it yet) its current issue is recorded silently; otherwise the
 *   first deploy would announce a week-old issue as fresh to every follower.
 *   Only an id that differs from the recorded one pushes.
 * - A WAKING-HOURS WINDOW. Feeds publish whenever they publish; a claim is
 *   only attempted while New York time is between 08:00 and 20:59, so a
 *   night-time issue is announced at the next morning tick. The owner's users
 *   are US-based; a per-user timezone spread isn't worth a per-user claim
 *   table yet.
 *
 * Claims are atomic (INSERT … ON CONFLICT DO NOTHING RETURNING), so running
 * beside a worker cannot double-send — the same argument the prayer-held
 * scanner makes.
 */

type Source = "taize" | "andrews";

const TICK_MS = 30 * 60 * 1000;
const STARTUP_DELAY_MS = 60_000;
const WINDOW_TZ = "America/New_York";
const WINDOW_FROM_HOUR = 8;
const WINDOW_UNTIL_HOUR = 21; // exclusive

const NAME: Record<Source, string> = {
  taize: "Taizé meditation",
  andrews: "Andrew's Version",
};

type Issue = { id: string; title: string; url: string };

async function latestIssue(source: Source): Promise<Issue | null> {
  const list = source === "taize" ? await taizeMeditations() : await weeklyPosts();
  const first = list[0];
  if (!first || !first.id || !first.title) return null;
  return { id: String(first.id), title: first.title, url: first.url };
}

/** Everyone with this newsletter's card on their home (order ∋ key, hidden ∌ key). */
async function followerIds(source: Source): Promise<number[]> {
  const rows = await db.execute<{ id: number }>(sql`
    SELECT id FROM users
    WHERE home_layout IS NOT NULL
      AND (home_layout->'order') ? ${source}
      AND NOT COALESCE((home_layout->'hidden') ? ${source}, false)
      AND push_enabled IS DISTINCT FROM false
  `);
  const ids = rows.rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n));
  if (source !== "andrews") return ids;
  const keep: number[] = [];
  for (const id of ids) if (await isSuperAdminUser(id)) keep.push(id);
  return keep;
}

/**
 * Record the issue. Returns "new" when this call inserted the row for an id
 * that differs from the source's previous one, "baseline" when it is the
 * first row ever for the source, and "seen" when the row already existed.
 */
async function claim(source: string, issueId: string): Promise<"new" | "baseline" | "seen"> {
  const prior = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM newsletter_issue_pushes WHERE source = ${source}
  `);
  const hadAny = Number(prior.rows[0]?.n ?? 0) > 0;
  const inserted = await db.execute<{ issue_id: string }>(sql`
    INSERT INTO newsletter_issue_pushes (source, issue_id, pushed)
    VALUES (${source}, ${issueId}, ${hadAny})
    ON CONFLICT (source, issue_id) DO NOTHING
    RETURNING issue_id
  `);
  if (inserted.rows.length === 0) return "seen";
  return hadAny ? "new" : "baseline";
}

function inWindow(now: Date): boolean {
  const { hour } = getCurrentTimeInTz(WINDOW_TZ, now);
  return hour >= WINDOW_FROM_HOUR && hour < WINDOW_UNTIL_HOUR;
}

export async function runNewsletterIssueNotifier(now: Date = new Date()): Promise<void> {
  if (!inWindow(now)) return;
  for (const source of ["taize", "andrews"] as Source[]) {
    try {
      const issue = await latestIssue(source);
      if (!issue) continue;
      const state = await claim(source, issue.id);
      if (state !== "new") {
        if (state === "baseline") logger.info({ source, issue: issue.id }, "[newsletter-push] baseline recorded, no push");
        continue;
      }
      const ids = await followerIds(source);
      if (ids.length === 0) { logger.info({ source, issue: issue.id }, "[newsletter-push] new issue, no followers"); continue; }
      await sendPushToUsers(ids, {
        title: "Fresh Off The Presses",
        body: `${NAME[source]}: "${issue.title}" is now available.`,
        path: "/menu/newsletters/weekly",
        threadId: "newsletter-weekly",
        collapseId: `newsletter-${source}-${issue.id}`,
      });
      logger.info({ source, issue: issue.id, recipients: ids.length }, "[newsletter-push] sent");
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), source }, "[newsletter-push] tick failed");
    }
  }
  await runDynamicWeeklies();
}

/**
 * The pasted-in weeklies (routes/weeklies.ts) — same claim, same window,
 * same copy; the source key is "w:<slug>" so it can never collide with the
 * two built-in sources above, and followers come from weekly_subscriptions.
 */
async function runDynamicWeeklies(): Promise<void> {
  let sources;
  try { sources = await listWeeklySources(); } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[newsletter-push] could not list weeklies");
    return;
  }
  for (const src of sources) {
    const key = `w:${src.slug}`;
    try {
      const first = (await feedPosts(src.feedUrl))[0];
      if (!first) continue;
      const state = await claim(key, first.id);
      if (state !== "new") {
        if (state === "baseline") logger.info({ source: key, issue: first.id }, "[newsletter-push] baseline recorded, no push");
        continue;
      }
      const ids = await weeklySubscriberIds(src.slug);
      if (ids.length === 0) { logger.info({ source: key, issue: first.id }, "[newsletter-push] new issue, no followers"); continue; }
      await sendPushToUsers(ids, {
        title: "Fresh Off The Presses",
        body: `${src.title}: "${first.title}" is now available.`,
        path: "/menu/newsletters/weekly",
        threadId: "newsletter-weekly",
        collapseId: `newsletter-${key}-${first.id}`,
      });
      logger.info({ source: key, issue: first.id, recipients: ids.length }, "[newsletter-push] sent");
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), source: key }, "[newsletter-push] tick failed");
    }
  }
}

export function startNewsletterIssueNotifier(): void {
  const tick = () => { void runNewsletterIssueNotifier(); };
  setTimeout(() => { tick(); setInterval(tick, TICK_MS); }, STARTUP_DELAY_MS);
  logger.info({ tickMs: TICK_MS }, "[newsletter-push] scheduler started");
}
