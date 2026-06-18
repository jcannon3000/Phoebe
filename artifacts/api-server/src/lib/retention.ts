import { and, isNotNull, lt, inArray, sql } from "drizzle-orm";
import {
  db,
  prayerRequestsTable,
  prayerRequestAmensTable,
  prayerSessionsTable,
  anonymousAmensTable,
  bellNotificationsTable,
  appOpensTable,
  breathSessionsTable,
  voiceMemosTable,
} from "@workspace/db";
import { logger } from "./logger";

// ─── Retention cleanup ──────────────────────────────────────────────────────
//
// A daily pass that prunes the high-churn tables which otherwise grow forever
// (one row per amen / sit / app-open / bell). Without this they balloon into
// tens of millions of rows and slow every query that touches them.
//
// Every statement is an idempotent DELETE (the rows are gone after the first
// run), so the 15-minute scheduler harmlessly re-running inside the window is a
// no-op the second time. Gated to ~04:00–04:15 UTC — a low-traffic hour — so a
// large first sweep never competes with peak load. Each step is isolated in its
// own try/catch so one failure doesn't abort the rest.
//
// Retention policy (deliberately conservative — only clearly-dead data):
//   • bell_notifications / app_opens   — 90 days  (pure bookkeeping/analytics)
//   • anonymous_amens (already claimed) — 60 days  (already fanned into real rows)
//   • prayer_sessions / breath_sessions — 1 year   (old history; streak + recent
//                                                   stats are unaffected)
//   • prayer_request_amens             — only for requests that ENDED (closed or
//                                         expired) over a year ago, so an active
//                                         request's count is never touched.
export async function runRetentionCleanupSender(opts: { forceNow?: boolean } = {}): Promise<void> {
  if (!opts.forceNow) {
    const now = new Date();
    if (now.getUTCHours() !== 4 || now.getUTCMinutes() >= 15) return;
  }

  const ago = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);
  const YEAR = ago(365);
  const D90 = ago(90);
  const D60 = ago(60);
  // breath_sessions keys on a TEXT YYYY-MM-DD local day; ISO date strings sort
  // chronologically, so a lexical "<" comparison is a date comparison.
  const yearAgoYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(YEAR);

  const steps: Array<[string, () => Promise<unknown>]> = [
    ["bell_notifications>90d", () =>
      db.delete(bellNotificationsTable).where(lt(bellNotificationsTable.createdAt, D90))],
    ["app_opens>90d", () =>
      db.delete(appOpensTable).where(lt(appOpensTable.openedAt, D90))],
    ["anonymous_amens claimed>60d", () =>
      db.delete(anonymousAmensTable).where(and(
        isNotNull(anonymousAmensTable.claimedAt),
        lt(anonymousAmensTable.claimedAt, D60),
      ))],
    ["prayer_sessions>1y", () =>
      db.delete(prayerSessionsTable).where(lt(prayerSessionsTable.endedAt, YEAR))],
    ["breath_sessions>1y", () =>
      db.delete(breathSessionsTable).where(lt(breathSessionsTable.day, yearAgoYmd))],
    ["amens on requests ended>1y", () =>
      db.delete(prayerRequestAmensTable).where(inArray(
        prayerRequestAmensTable.requestId,
        db.select({ id: prayerRequestsTable.id }).from(prayerRequestsTable)
          .where(sql`COALESCE(${prayerRequestsTable.closedAt}, ${prayerRequestsTable.expiresAt}) < ${YEAR}`),
      ))],
    // Ephemeral voice memos: hard-delete anything past its TTL (the recipient
    // listening already deletes it immediately — this catches the unheard).
    ["voice_memos past TTL", () =>
      db.delete(voiceMemosTable).where(lt(voiceMemosTable.expiresAt, new Date()))],
  ];

  for (const [label, fn] of steps) {
    try {
      await fn();
    } catch (err) {
      logger.warn({ err, step: label }, "[retention] step failed");
    }
  }
  logger.info("[retention] daily cleanup pass complete");
}
