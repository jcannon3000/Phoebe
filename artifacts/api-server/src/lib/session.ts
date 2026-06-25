import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { Request } from "express";

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

/**
 * Establish an authenticated session while defeating SESSION FIXATION: rotate
 * the session id BEFORE writing the login identity, so a pre-login
 * (attacker-planted) session id can never carry into the authenticated session.
 * Use this in place of a bare `req.login(...)` on every auth-completion path
 * (password login, register, token exchange, Google/Apple sign-in).
 *
 * `regenerate()` swaps in a fresh empty session (new id); the subsequent
 * `req.login` persists `passport.user` into THAT new session.
 */
export function loginFreshSession(
  req: Request,
  user: Express.User,
  done: (err?: unknown) => void,
): void {
  req.session.regenerate((rerr) => {
    if (rerr) { done(rerr); return; }
    req.login(user, (lerr) => done(lerr ?? undefined));
  });
}
