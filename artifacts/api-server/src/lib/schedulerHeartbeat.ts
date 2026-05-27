// Heartbeat wrapper for the scheduler senders. Each sender call gets
// wrapped so we can answer two questions later:
//   1. "Did the bell sender actually run this morning?" (audit) →
//      SELECT * FROM scheduler_runs WHERE sender_name = 'bell' AND
//      started_at::date = CURRENT_DATE ORDER BY started_at DESC;
//   2. "Why did the bell sender fail?" (alert) → Sentry has the
//      exception, this table has the timestamp + duration + the
//      first ~500 chars of the error message.
//
// The wrapper is intentionally light:
//   - INSERT a "running" row at start
//   - UPDATE to "completed" or "failed" at end
//   - Swallow the underlying sender's exceptions so a failure in one
//     sender doesn't break the others on the same tick (the legacy
//     .catch() handlers in startBellScheduler did this; we preserve
//     that behavior)
//
// If the DB itself is down, the heartbeat insert throws and we
// degrade to "log + Sentry only" — the sender still runs (we don't
// gate execution on the heartbeat write succeeding).

import { pool } from "@workspace/db";
import { logger } from "./logger";
import { captureError } from "./sentry";

export async function withSchedulerLog<T>(
  senderName: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const startedAt = Date.now();
  let runId: number | null = null;
  try {
    const result = await pool.query(
      `INSERT INTO scheduler_runs (sender_name, status) VALUES ($1, 'running') RETURNING id`,
      [senderName],
    );
    runId = result.rows[0]?.id ?? null;
  } catch (err) {
    // DB write failed — log but keep going. Better to run the sender
    // without a heartbeat record than to skip the sender entirely.
    logger.warn({ err, senderName }, "[scheduler-heartbeat] insert failed");
  }

  try {
    const value = await fn();
    const durationMs = Date.now() - startedAt;
    if (runId != null) {
      try {
        await pool.query(
          `UPDATE scheduler_runs SET completed_at = NOW(), duration_ms = $1, status = 'completed' WHERE id = $2`,
          [durationMs, runId],
        );
      } catch (err) {
        logger.warn({ err, senderName, runId }, "[scheduler-heartbeat] complete update failed");
      }
    }
    logger.info({ senderName, durationMs }, "[scheduler] sender completed");
    return value;
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const errorMessage = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
    if (runId != null) {
      try {
        await pool.query(
          `UPDATE scheduler_runs SET completed_at = NOW(), duration_ms = $1, status = 'failed', error_message = $2 WHERE id = $3`,
          [durationMs, errorMessage, runId],
        );
      } catch (updateErr) {
        logger.warn({ err: updateErr, senderName, runId }, "[scheduler-heartbeat] failed-update failed");
      }
    }
    // Send to Sentry with sender tag so it lands grouped per-sender,
    // not mashed into a generic "scheduler error" bucket.
    captureError(err, { sender: senderName, durationMs, proc: "worker" });
    return undefined;
  }
}
