// CSRF defense via Origin / Referer validation on state-changing
// requests. Sits alongside the CORS allowlist as defense-in-depth.
//
// Why this works for Phoebe's stack:
//   • Cross-origin XHR / fetch with credentials is already blocked by
//     the CORS allowlist in app.ts (the browser refuses to read the
//     response and the request itself is preflight-rejected for non-
//     simple methods).
//   • What CORS does NOT block is the classic CSRF vector: a
//     malicious site that submits a cross-origin <form action="…"
//     method="POST">. Forms are "simple requests" — no preflight, no
//     CORS check, but they DO send the Origin header. We just have
//     to reject the ones whose Origin isn't in our allowlist.
//   • iOS Capacitor sends Origin "capacitor://localhost" (already in
//     the CORS allowlist), so the native app keeps working.
//   • Server-to-server callers (Stripe webhooks, etc.) and curl have
//     no Origin header. We fall back to Referer when Origin is
//     absent; if BOTH are missing on a state-changing request, we
//     reject — legitimate browsers always send at least one of them
//     for cross-origin POSTs, so a writer-side request with neither
//     is either a bot or a malformed call we don't want to honor.
//
// Method gating: GET / HEAD / OPTIONS are always safe — they don't
// change state, so no CSRF check. Express's req.method is uppercased
// at the protocol layer, so a case-insensitive check isn't needed.

import type { Request, Response, NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Endpoints authenticated by a signed token in the URL (not the session
// cookie) and designed to be POSTed cross-origin by third parties — e.g. the
// RFC 8058 one-click List-Unsubscribe-Post that Gmail / Apple Mail send to
// /api/email/unsubscribe. CSRF protects cookie-authed state changes; a
// token-authed endpoint isn't a CSRF target, and an allowlist Origin check
// would only 403 the legitimate provider POST. Exempt by exact path.
const CSRF_EXEMPT_PATHS = new Set<string>(["/api/email/unsubscribe"]);

/**
 * Build the CSRF middleware. Pass the same allowed-origins set as
 * CORS so the two stay in lockstep.
 */
export function buildCsrfMiddleware(allowedOrigins: Set<string>) {
  return function csrfGuard(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method) || CSRF_EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }

    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.length > 0) {
      if (allowedOrigins.has(origin)) {
        next();
      } else {
        // Origin header present but not in allowlist — almost
        // certainly a CSRF attempt or a misconfigured client.
        res.status(403).json({ error: "Cross-origin request not allowed." });
      }
      return;
    }

    // No Origin header — fall back to Referer. Modern browsers always
    // send Origin on cross-origin POSTs, so an absent Origin means
    // either (a) same-origin request that the browser elided Origin
    // for, (b) a non-browser client (curl, server-to-server), or (c)
    // a privacy-mode browser stripping it. We accept if Referer
    // matches the allowlist OR if Referer is also missing (the curl /
    // server-to-server case). Refusing the no-headers case would
    // break health checks, internal cron callbacks, etc.
    const referer = req.headers.referer;
    if (typeof referer === "string" && referer.length > 0) {
      try {
        const url = new URL(referer);
        const refOrigin = `${url.protocol}//${url.host}`;
        if (allowedOrigins.has(refOrigin)) {
          next();
        } else {
          res.status(403).json({ error: "Cross-origin request not allowed." });
        }
        return;
      } catch {
        // Malformed Referer — treat as missing, fall through to the
        // "neither header present" branch below.
      }
    }

    // Neither Origin nor (valid) Referer. Allow — server-to-server
    // and curl land here. The session-cookie check downstream is
    // still the primary defense against unauthenticated writes; this
    // path mainly exists to not break legitimate non-browser callers.
    next();
  };
}
