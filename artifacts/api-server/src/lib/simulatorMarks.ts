/**
 * Simulator marks — which (user, day) pairs came from a test run.
 *
 * Owner (2026-09-16): "we want a way to make sure simulator sessions are not
 * being counted." Nothing in a request tells the iOS Simulator's WKWebView
 * from a phone's — same user agent, same screen — so the shell says so
 * itself: MainViewController injects a flag in Simulator builds (the Android
 * emulator names itself in its user agent), native-shell's isSimulator()
 * reads it, and apiRequest sends `X-Phoebe-Simulator: 1` on every call. This
 * middleware records the signed-in user and the Eastern day, once per day per
 * process, and App Metrics (lib/appMetricsSql.ts) leaves out:
 *   - every record of a PHONE WITHOUT AN ACCOUNT that has ever been marked —
 *     a simulator's device user is a test install, not a person;
 *   - an ACCOUNT's records on the days it was marked — the owner testing his
 *     own account on the Simulator — while his other days still count.
 *
 * Nothing is deleted or altered; the marks sit beside the data.
 */
import type { RequestHandler } from "express";
import { pool } from "@workspace/db";

export const SIMULATOR_HEADER = "x-phoebe-simulator";

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});

// One INSERT per (user, day) per process; ON CONFLICT covers restarts.
const marked = new Set<string>();

export const simulatorMarkMiddleware: RequestHandler = (req, _res, next) => {
  if (req.get(SIMULATOR_HEADER) === "1") {
    const uid = (req.user as { id?: number } | undefined)?.id;
    if (typeof uid === "number") {
      const day = dayFmt.format(new Date());
      const key = `${uid}:${day}`;
      if (!marked.has(key)) {
        marked.add(key);
        if (marked.size > 5000) marked.clear();
        pool
          .query(`INSERT INTO simulator_marks (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [uid, day])
          .catch((err: unknown) => {
            marked.delete(key);
            console.warn("[simulator-marks] insert failed:", err);
          });
      }
    }
  }
  next();
};
