import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { migrate } from "./lib/migrate";
import { attachWebSocketServer } from "./lib/ws";
import { startGoalCleanupScheduler } from "./lib/goalCleanup";
// Bell system uses calendar events, not email cron — no scheduler needed

// ─── Crash insurance ─────────────────────────────────────────────────────
// Node 15+ terminates the process on an unhandled promise rejection by
// default. Most of our async route handlers have explicit try/catch but
// not all of them do — and a single overlooked throw (drizzle pool
// exhaustion, a third-party dependency rejecting) shouldn't take the
// whole server down on launch day. Log and keep serving. Same story for
// uncaughtException: the process state may be suspect but the
// alternative is every in-flight user request failing with ECONNRESET,
// which is worse during a launch. Railway will restart us eventually if
// something is truly broken.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection — request continues, server stays up");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException — server stays up; investigate");
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

    // Hourly job: cancel recurring calendar events for practices whose goal
    // was reached more than 2 days ago and never renewed.
    startGoalCleanupScheduler();
  })
  .catch((err) => {
    logger.error({ err }, "Failed to run migrations");
    process.exit(1);
  });
