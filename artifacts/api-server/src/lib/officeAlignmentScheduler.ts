// ── Office alignment scheduler ──────────────────────────────────────────────
//
// Runs hourly and attempts to transcribe + align today's Forward Movement
// episode for both morning and evening office.
//
// buildOfficeAlignment() is idempotent: if the current episode guid is already
// aligned it returns { cached: true } in < 1s. This means it's safe to call
// on every tick — real transcription work (Whisper + alignment) only happens
// once per day when a new episode appears in the feed.
//
// If OPENAI_API_KEY is not set, buildOfficeAlignment() records a "pending"
// row and returns { status: "skipped" } — no error, no retry storm.
//
// Time gating:
//   • Morning office: only attempt between 09:00–18:00 UTC (5am–2pm Eastern).
//     FM typically releases the morning episode around 5–7am Eastern.
//   • Evening office: only attempt between 20:00–04:00 UTC (4pm–midnight Eastern).
//     FM typically releases the evening episode around 4–6pm Eastern.
//
// This keeps the worker quiet overnight and avoids repeatedly hitting the
// podcast feed when no new episode could have been published yet.

import { buildOfficeAlignment } from "./transcription/buildOfficeAlignment";
import { buildFddAlignment } from "./transcription/buildFddAlignment";
import { logger } from "./logger";

const MORNING_UTC_START = 9;
const MORNING_UTC_END = 18;
const EVENING_UTC_START = 20;

function utcHour(): number {
  return new Date().getUTCHours();
}

function shouldRunMorning(): boolean {
  const h = utcHour();
  return h >= MORNING_UTC_START && h < MORNING_UTC_END;
}

function shouldRunEvening(): boolean {
  const h = utcHour();
  return h >= EVENING_UTC_START || h < 4; // wraps past midnight
}

async function runOfficeAlignment(): Promise<void> {
  const morning = shouldRunMorning();
  const evening = shouldRunEvening();

  if (!morning && !evening) {
    logger.debug("[office-align-sched] outside time windows — skipping");
    return;
  }

  const tasks: Array<{ side: string; show: "morning-office" | "evening-office" }> = [];
  if (morning) tasks.push({ side: "morning", show: "morning-office" });
  if (evening) tasks.push({ side: "evening", show: "evening-office" });

  await Promise.all(
    tasks.map(async ({ side, show }) => {
      try {
        const result = await buildOfficeAlignment({ show });
        if (result.cached) {
          logger.debug({ show }, "[office-align-sched] already aligned — cached");
        } else {
          logger.info({ show, status: result.status, aligner: result.aligner }, `[office-align-sched] ${side} office ${result.status}`);
        }
      } catch (err) {
        logger.error({ err, show }, `[office-align-sched] ${side} office alignment failed`);
      }
    }),
  );

  // Forward Day by Day skip-marks (Reflect & Sit). FDD publishes once daily;
  // buildFddAlignment is idempotent on the episode guid, so attempting it on
  // any daytime tick costs a real Whisper pass only when a new episode lands.
  try {
    const fdd = await buildFddAlignment();
    if (fdd.cached) {
      logger.debug("[office-align-sched] FDD marks already computed — cached");
    } else {
      logger.info({ status: fdd.status, scriptureStartSec: fdd.scriptureStartSec, appealStartSec: fdd.appealStartSec }, `[office-align-sched] FDD ${fdd.status}`);
    }
  } catch (err) {
    logger.error({ err }, "[office-align-sched] FDD alignment failed");
  }
}

let alignInterval: ReturnType<typeof setInterval> | null = null;

export function startOfficeAlignmentScheduler(): void {
  if (alignInterval) return;

  // First attempt after 60s so the server is fully booted and the
  // DB pool is warm before we make the first Whisper call.
  setTimeout(() => {
    runOfficeAlignment().catch((err) =>
      logger.error({ err }, "[office-align-sched] initial run failed"),
    );
  }, 60_000);

  alignInterval = setInterval(
    () => {
      runOfficeAlignment().catch((err) =>
        logger.error({ err }, "[office-align-sched] scheduled run failed"),
      );
    },
    60 * 60 * 1000, // hourly
  );

  logger.info("[office-align-sched] started — first attempt in 60s, then hourly");
}
