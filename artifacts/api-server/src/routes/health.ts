import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { captureError } from "../lib/sentry";
import { rateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// ── Client crash reporting ──────────────────────────────────────────────────
// The browser/native client forwards React render crashes + uncaught errors
// here so they reach the SAME Sentry pipeline as server errors (captureError
// no-ops if SENTRY_DSN is unset). We deliberately relay through our own server
// rather than embed a client Sentry SDK — it keeps the app free of a
// third-party browser SDK (matches the "no product-analytics SDKs" privacy
// stance) and the DSN stays server-side.
//
// PRIVACY: only short, technical fields are accepted — error name/message,
// stack, the React component stack, the route PATH (never the query string),
// and the user-agent. No request bodies, no prayer/journal text, and the IP is
// not attached. Works signed-in (tags the userId) or signed-out.
const str = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;

router.post(
  "/client-error",
  rateLimit({ name: "client_error", max: 60, windowMs: 60 * 60 * 1000 }),
  (req, res): void => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const message = str(b.message, 500) ?? "client error";
    const err = new Error(message);
    err.name = str(b.name, 100) ?? "ClientError";
    const stack = str(b.stack, 4000);
    const componentStack = str(b.componentStack, 3000);
    err.stack = [stack, componentStack && `--- component stack ---\n${componentStack}`]
      .filter(Boolean)
      .join("\n\n") || err.stack;
    const userId = (req.user as { id?: number } | undefined)?.id;
    captureError(err, {
      source: "client",
      // Route path only — the client strips the query string before sending.
      path: str(b.path, 200),
      userAgent: str(b.userAgent, 300),
      userId,
    });
    res.json({ ok: true });
  },
);

export default router;
