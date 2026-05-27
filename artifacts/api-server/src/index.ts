import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { migrate } from "./lib/migrate";
import { attachWebSocketServer } from "./lib/ws";
import { startGoalCleanupScheduler } from "./lib/goalCleanup";
import { startPrayerHeldScanner } from "./lib/prayerHeldScanner";
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

    // Scheduler ownership: see the matching comment in app.ts. The
    // hourly goal-cleanup + 10-min prayer-held scanner now live in
    // the worker service. We keep the in-web boot path for local dev
    // (single-process) and as a safety hatch when the worker is down.
    const runInWeb =
      process.env["DISABLE_BELL_SCHEDULER"] !== "true" &&
      process.env["RUN_SCHEDULERS_IN_WEB"] === "true";
    if (runInWeb) {
      // Hourly job: cancel recurring calendar events for practices whose
      // goal was reached more than 2 days ago and never renewed.
      startGoalCleanupScheduler();
      // Every 10 min: send batched "you've been held in prayer today"
      // pushes for amens whose 2-hour coalescing window has elapsed.
      startPrayerHeldScanner();
    }
  })
  .catch((err) => {
    logger.error({ err }, "Failed to run migrations");
    process.exit(1);
  });
