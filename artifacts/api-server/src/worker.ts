// Worker entry point — runs the background schedulers in a process
// separate from the web server. Deploy this as a second Railway
// service (or any background runtime) pointing at
// `node ./dist/worker.mjs`.
//
// Why split: the web process is now safe to scale horizontally (multi-
// instance) because no instance owns the schedulers. Previously
// `startBellScheduler` lived inside app.ts so every web replica would
// have fired the same 15-min ticks → every push would double / triple.
//
// What runs here:
//   • bellSender (15-min tick → bell, evening nudge, lectio reminders,
//     parish office reminders, gathering reminders, feed reminders,
//     action reminders, weekly digests, parish weekly recap, sunday
//     reflection, etc. — ~15 senders gated by their own time windows)
//   • letterWindowSender (15-min tick → letter period-open + respond
//     reminders)
//   • goalCleanup (hourly tick → cancel calendar events for stale
//     goals)
//   • prayerHeldScanner (10-min tick → batched "held in prayer" push)
//   • officeAlignmentScheduler (hourly tick → transcribe + align today's
//     Forward Movement morning/evening office episode; idempotent, skips
//     gracefully if OPENAI_API_KEY not set)
//
// What does NOT run here:
//   • Express / HTTP. This process is headless. Use the web service
//     for any HTTP-triggered work.
//   • The DB migration runner. We run migrations from the web service
//     so deploy ordering is "migrate via web → worker boots after."
//
// Local dev: `pnpm --filter @workspace/api-server run worker` boots
// just the worker against your local DB. Or run web + worker in one
// process (the legacy single-instance setup) by setting
// RUN_SCHEDULERS_IN_WEB=true and keeping the worker service stopped.

import { logger } from "./lib/logger";
import { initSentry, captureError } from "./lib/sentry";
import { startBellScheduler } from "./lib/bellSender";
import { startLetterWindowScheduler } from "./lib/letterWindowSender";
import { startGoalCleanupScheduler } from "./lib/goalCleanup";
import { startPrayerHeldScanner } from "./lib/prayerHeldScanner";
import { startMinistrySyncScheduler } from "./lib/ministryScraper";
import { startOfficeAlignmentScheduler } from "./lib/officeAlignmentScheduler";
import { startBlessReminderScheduler } from "./lib/blessReminderScheduler";

// Sentry first so any boot-time scheduler failure (DB pool exhausted,
// invalid env var, missing seed file) lands as a Sentry issue rather
// than a silent log line on Railway.
initSentry();

// Crash insurance — same pattern as the web entry. The worker stays
// up on unhandled rejections and uncaught exceptions because the
// alternative is "Railway respawns me every 30 seconds and pushes
// stop firing entirely." Sentry catches the report; humans
// investigate; the schedulers keep going.
process.on("unhandledRejection", (reason) => {
  captureError(reason, { kind: "unhandledRejection", proc: "worker" });
});
process.on("uncaughtException", (err) => {
  captureError(err, { kind: "uncaughtException", proc: "worker" });
});

logger.info("[worker] starting schedulers");
startBellScheduler();
startLetterWindowScheduler();
startGoalCleanupScheduler();
startPrayerHeldScanner();
startMinistrySyncScheduler();
startOfficeAlignmentScheduler();
startBlessReminderScheduler();
logger.info("[worker] schedulers running — process will stay alive on setIntervals");

// We don't open an HTTP port — the worker is internal-only. Railway's
// health-check on a worker service should be set to "Custom: TCP" or
// disabled outright; an HTTP probe will 502.
