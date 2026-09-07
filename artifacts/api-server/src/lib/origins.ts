/**
 * The browser origins we accept requests from.
 *
 * Lives in its own module because THREE things need it and they must not
 * drift: the CORS layer, the CSRF guard, and the WebSocket upgrade check.
 * (ws.ts importing it from app.ts would be a cycle — app pulls in the routes,
 * and a route pulls in ws.)
 *
 * Requests with no Origin header (same-origin fetch, native HTTP, curl,
 * health checks) are not cross-site browser requests and are allowed.
 */
export const allowedOrigins = new Set<string>([
  "https://withphoebe.app",
  "https://www.withphoebe.app",
  "capacitor://localhost",
  "https://localhost",
  /**
   * Local development. Vite's dev/preview ports, and — the one that was
   * missing — THE PORT THIS SERVER ITSELF LISTENS ON.
   *
   * Outside production the api-server also serves the built client, so the app
   * is reachable at its own origin. That origin was not in this list, which
   * meant the locally-served app got 403 "Cross-origin request not allowed."
   * on every state-changing request: the server refused writes from the very
   * page it had just handed out. Reads worked, so it presented as "nothing I
   * change ever saves" rather than as an origin problem.
   *
   * PORT is read the same way the listener reads it, so the two cannot drift.
   * Both loopback spellings, because a browser sent to 127.0.0.1 does not send
   * an Origin of localhost.
   */
  ...(process.env["NODE_ENV"] !== "production"
    ? [
        "http://localhost:5173", "http://localhost:4173", "http://localhost:3000",
        `http://localhost:${process.env["PORT"] ?? 3001}`,
        `http://127.0.0.1:${process.env["PORT"] ?? 3001}`,
      ]
    : []),
  ...(process.env["ALLOWED_ORIGINS"]?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
]);
