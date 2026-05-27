// Centralized Sentry init — call initSentry() once at process start
// (web entry, future worker entry). Safe to call without SENTRY_DSN
// set: the SDK no-ops and captureException becomes a quiet log.
//
// We init early (before Express) so unhandled errors in middleware
// boot, the bell scheduler, and the route handlers are all captured.
// The release tag uses the Railway commit SHA when available — set
// RAILWAY_GIT_COMMIT_SHA in Railway service variables (or pass it as
// a build arg) so we can blame issues on specific deploys.
//
// captureError() is a thin wrapper that lets callers report an error
// without importing @sentry/node throughout the codebase. It checks
// the init flag so calls before / without DSN configured are no-ops.

import * as Sentry from "@sentry/node";
import { logger } from "./logger";

let initialized = false;

export function initSentry(): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) {
    logger.info("[sentry] SENTRY_DSN not set — Sentry disabled (logger.error still runs).");
    return;
  }
  if (initialized) return;
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    release: process.env["RAILWAY_GIT_COMMIT_SHA"] ?? process.env["SENTRY_RELEASE"],
    // Performance tracing is off by default — we mainly want error
    // reporting, not span overhead. Flip tracesSampleRate up if/when
    // we add APM dashboards.
    tracesSampleRate: 0,
    // Don't ship every console.* call as a breadcrumb. The pino logs
    // already capture structured context per request via pinoHttp.
    integrations: (defaults) => defaults.filter((i) => i.name !== "Console"),
  });
  initialized = true;
  logger.info({ env: process.env["NODE_ENV"] ?? "development" }, "[sentry] initialized");
}

/**
 * Report an error to Sentry. Safe to call before initSentry or with
 * SENTRY_DSN unset (no-op in those cases). Always logs locally too so
 * Railway logs stay populated even when Sentry is off.
 *
 * Extra context (route, userId, etc.) attaches as scope tags so issues
 * in Sentry land grouped by surface, not as one giant "Error" bucket.
 */
export function captureError(
  err: unknown,
  context?: Record<string, string | number | boolean | null | undefined>,
): void {
  logger.error({ err, ...context }, "[error]");
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (context) {
      for (const [k, v] of Object.entries(context)) {
        if (v != null) scope.setTag(k, String(v));
      }
    }
    Sentry.captureException(err);
  });
}

export { Sentry };
