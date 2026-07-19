// Fire-and-forget client crash reporter. Forwards React render crashes and
// uncaught errors / unhandled rejections to POST /api/client-error, which
// relays them to the SAME Sentry pipeline as server errors (see
// routes/health.ts). We deliberately do NOT embed a browser Sentry SDK — this
// keeps the app free of a third-party client SDK (matching the "no
// product-analytics SDKs" privacy stance) and keeps the DSN server-side.
//
// PRIVACY: only technical fields are sent — error name/message, stack, the
// React component stack, the route PATH (never the query string, which can
// carry tokens), and the user-agent. Never request bodies or prayer/journal
// text; the server does not attach the IP.
import { apiRequest } from "./queryClient";

// Dedupe identical errors within a session so a repeating crash doesn't spam
// the endpoint. Bounded so a long session can't grow the set unboundedly.
const seen = new Set<string>();

export function reportClientError(input: {
  name?: string;
  message?: string;
  stack?: string;
  componentStack?: string;
}): void {
  try {
    const message = (input.message ?? "").slice(0, 500);
    const key = `${input.name ?? ""}|${message.slice(0, 160)}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (seen.size > 50) seen.clear();

    // Route path only — never location.search (may carry invite/share tokens).
    let path: string | undefined;
    let userAgent: string | undefined;
    try { path = window.location.pathname; } catch { /* no window */ }
    try { userAgent = navigator.userAgent; } catch { /* no navigator */ }

    // apiRequest is the app's canonical API path (handles the native base URL,
    // credentials, and same-origin CSRF). Swallow every failure — a reporting
    // error must never surface or loop back through the global handlers below.
    void apiRequest("POST", "/api/client-error", {
      name: input.name,
      message,
      stack: input.stack,
      componentStack: input.componentStack,
      path,
      userAgent,
    }).catch(() => { /* ignore */ });
  } catch { /* never throw from the reporter */ }
}

// Install once: catch uncaught errors + unhandled promise rejections that never
// reach a React ErrorBoundary. Idempotent (HMR-safe).
let installed = false;
export function installGlobalErrorReporting(): void {
  if (installed) return;
  installed = true;
  try {
    window.addEventListener("error", (e) => {
      const err = e.error as Error | undefined;
      reportClientError({
        name: err?.name ?? "Error",
        message: err?.message ?? String(e.message ?? "error"),
        stack: err?.stack,
      });
    });
    window.addEventListener("unhandledrejection", (e) => {
      const reason = (e as PromiseRejectionEvent).reason;
      const err = reason instanceof Error ? reason : undefined;
      reportClientError({
        name: err?.name ?? "UnhandledRejection",
        message: err?.message ?? String(reason),
        stack: err?.stack,
      });
    });
  } catch { /* SSR / no window */ }
}
