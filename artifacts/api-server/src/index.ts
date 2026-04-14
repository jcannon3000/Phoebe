import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { migrate } from "./lib/migrate";
import { attachWebSocketServer } from "./lib/ws";
import { startGoalCleanupScheduler } from "./lib/goalCleanup";
// Bell system uses calendar events, not email cron — no scheduler needed

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
