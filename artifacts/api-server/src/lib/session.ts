import session from "express-session";
import connectPgSimple from "connect-pg-simple";

// The single express-session middleware, shared between the HTTP app (app.ts)
// and the WebSocket upgrade authentication (ws.ts). Pulling it out into its own
// module lets the live socket identify the user from the SAME session cookie
// instead of trusting a client-supplied user id — and avoids an app↔routes↔ws
// import cycle.
const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSession({
    conString: process.env["DATABASE_URL"],
    tableName: "user_sessions",
  }),
  secret: process.env["SESSION_SECRET"] ?? "dev-secret-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: process.env["NODE_ENV"] === "production" ? "none" : "lax",
    // Flag-gated shared-session domain (see app.ts history). Unset → cookie
    // stays scoped to the exact origin.
    ...(process.env["SESSION_COOKIE_DOMAIN"]
      ? { domain: process.env["SESSION_COOKIE_DOMAIN"] }
      : {}),
  },
});
