import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { migrate } from "./lib/migrate";
import { attachWebSocketServer } from "./lib/ws";
import { startGoalCleanupScheduler } from "./lib/goalCleanup";
import { startPrayerHeldScanner } from "./lib/prayerHeldScanner";
import { startMinistrySyncScheduler } from "./lib/ministryScraper";
import { startOfficeAlignmentScheduler } from "./lib/officeAlignmentScheduler";
import { captureError } from "./lib/sentry";
// Bell system uses calendar events, not email cron — no scheduler needed

// ─── Crash insurance ─────────────────────────────────────────────────────
// Node 15+ terminates the process on an unhandled promise rejection by
// default. Most of our async route handlers have explicit try/catch but
// not all of them do — and a single overlooked throw (drizzle pool
// exhaustion, a third-party dependency rejecting) shouldn't take the
// whole server down on launch day. Log AND forward to Sentry (with a
// "kind" tag so unhandled rejections land in their own Sentry issue
// group, not mixed in with route errors). Server keeps serving;
// Railway will restart us eventually if something is truly broken.
process.on("unhandledRejection", (reason) => {
  captureError(reason, { kind: "unhandledRejection" });
});
process.on("uncaughtException", (err) => {
  captureError(err, { kind: "uncaughtException" });
});

const rawPort = process.env["PORT"] ?? "3001";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

migrate()
  .then(() => {
    const server = createServer(app);
    attachWebSocketServer(server);

    server.listen(port, () => {
      logger.info({ port }, "Server listening");
    });

    // Scheduler ownership: see the matching comment in app.ts. The hourly
    // goal-cleanup + 10-min prayer-held scanner can also live in a worker
    // service, but we now run them in the web process BY DEFAULT (opt-out via
    // RUN_SCHEDULERS_IN_WEB="false") so they fire even when no worker service
    // is deployed — which was silently dropping the "you've been held in
    // prayer today" pushes. Double-running alongside a worker is safe: the
    // scanner claims rows atomically (WHERE sent_at IS NULL) and the cleanup /
    // sync jobs are idempotent.
    const runInWeb =
      process.env["DISABLE_BELL_SCHEDULER"] !== "true" &&
      process.env["RUN_SCHEDULERS_IN_WEB"] !== "false";
    if (runInWeb) {
      // Hourly job: cancel recurring calendar events for practices whose
      // goal was reached more than 2 days ago and never renewed.
      startGoalCleanupScheduler();
      // Every 10 min: send batched "you've been held in prayer today"
      // pushes for amens whose 2-hour coalescing window has elapsed.
      startPrayerHeldScanner();
      // Daily: re-scrape enabled ministry websites into draft events.
      startMinistrySyncScheduler();
      // Hourly (morning/evening windows): transcribe + align the day's office
      // and FDD audio so the read-aloud word-highlighting / skip markers are
      // BUILT IN THE MORNING and ready the moment someone opens the office —
      // rather than being computed on-demand on first open. Lived only in the
      // (undeployed) worker before, so it never ran in this web-only deploy.
      // Idempotent on the episode guid: a real Whisper pass happens once per
      // new episode.
      startOfficeAlignmentScheduler();
    }
  })
  .catch((err) => {
    logger.error({ err }, "Failed to run migrations");
    process.exit(1);
  });
