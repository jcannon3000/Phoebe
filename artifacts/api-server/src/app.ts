import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import router from "./routes";
import { bustUserCache } from "./routes/auth";
import { logger } from "./lib/logger";
import { initSentry, captureError } from "./lib/sentry";
import { buildCsrfMiddleware } from "./lib/csrf";

// Initialize Sentry before any Express middleware so errors in cold-
// start code (DB connect, session store wiring, route registration)
// get reported. No-op when SENTRY_DSN is unset, so dev / preview
// deploys aren't affected. See lib/sentry.ts.
initSentry();
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { db, groupsTable, prayerRequestsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PgSession = connectPgSimple(session);

if (process.env["NODE_ENV"] === "production" && !process.env["SESSION_SECRET"]) {
  throw new Error("SESSION_SECRET must be set in production");
}

const app: Express = express();
app.set("trust proxy", 1);

// ─── www → apex 301 redirect ───────────────────────────────────────────────
// Some users (especially on desktop) type or autocomplete
// `www.withphoebe.app/...`; without this redirect the request lands on
// the same Railway app but on a hostname that breaks Universal Links,
// trips CORS, and serves the SPA from the wrong canonical URL — which
// shows up as "the link doesn't open on desktop". 301 to the apex on
// every request from the www host so anything written on the apex
// (Universal Links, share links, OAuth redirects) keeps working.
//
// This only catches the case where DNS for `www.withphoebe.app` is
// already pointed at this server. If `www.` has no DNS entry at all
// the request never hits us — that needs a DNS CNAME/ALIAS at your
// registrar pointing www → withphoebe.app (or to the Railway domain).
app.use((req: Request, res: Response, next: NextFunction) => {
  const host = req.hostname?.toLowerCase();
  if (host === "www.withphoebe.app") {
    res.redirect(301, `https://withphoebe.app${req.originalUrl}`);
    return;
  }
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// CORS: credentialed requests are allowed only from known origins.
// Previously `origin: true` reflected ANY origin with credentials, which
// (paired with sameSite:"none" cookies) let any website make
// authenticated requests to the API and read the responses. The web app
// is served same-origin (no CORS needed); the cross-origin clients are
// the native app webviews — iOS `capacitor://localhost`, Android
// `https://localhost` (androidScheme) — plus the production web origins.
// (On iOS the app routes fetch through the native HTTP stack via
// CapacitorHttp, which bypasses CORS entirely, so this is mainly the
// guard against malicious third-party sites.) Extra origins can be added
// via ALLOWED_ORIGINS (comma-separated). Requests with no Origin header
// (same-origin fetch, native HTTP, curl, health checks) are allowed.
const allowedOrigins = new Set<string>([
  "https://withphoebe.app",
  "https://www.withphoebe.app",
  // El Jardín portal subdomain (shares the same API + accounts).
  "https://eljardin.withphoebe.app",
  "capacitor://localhost",
  "https://localhost",
  ...(process.env["NODE_ENV"] !== "production"
    ? ["http://localhost:5173", "http://localhost:4173", "http://localhost:3000"]
    : []),
  ...(process.env["ALLOWED_ORIGINS"]?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
]);
app.use(cors({
  origin(origin, cb) {
    // No Origin header → not a cross-site browser request. Allow.
    if (!origin) { cb(null, true); return; }
    cb(null, allowedOrigins.has(origin));
  },
  credentials: true,
}));

// CSRF guard: rejects state-changing requests whose Origin (or
// Referer fallback) isn't in the allowlist. Sits alongside CORS — CORS
// covers fetch/XHR, this covers cross-origin <form action="…"
// method="POST"> which CORS waves through as a "simple request."
// Method-gated to POST/PUT/PATCH/DELETE; GET/HEAD/OPTIONS pass
// untouched. Same allowedOrigins set as CORS so the two stay in sync.
app.use(buildCsrfMiddleware(allowedOrigins));

// Baseline security headers (defense-in-depth). No Content-Security-
// Policy here — the SPA leans on inline styles, and a default CSP would
// break it; that's a larger, separate effort.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (process.env["NODE_ENV"] === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
// 10MB JSON cap: covers base64-encoded profile photos (the avatar
// endpoint already rejects anything past ~7MB) and the occasional
// large prayer-feed payload. Express's default 100KB was being
// silently exceeded by /auth/me/profile uploads, which then surfaced
// as a generic "Something went wrong" via the error middleware.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(
  session({
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
      // Flag-gated shared-session domain. Set SESSION_COOKIE_DOMAIN=
      // ".withphoebe.app" to share the login across subdomains (so a Phoebe
      // session is recognized on eljardin.withphoebe.app and vice versa).
      // Unset → the cookie stays scoped to the exact origin (today's
      // behavior). ⚠️ Flipping this re-scopes the cookie, so every current
      // user is logged out once — deploy it deliberately.
      ...(process.env["SESSION_COOKIE_DOMAIN"]
        ? { domain: process.env["SESSION_COOKIE_DOMAIN"] }
        : {}),
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

// Bust the deserializeUser cache for a user after any mutating request, so the
// very next read reflects the write instead of a cached pre-write row. Reads
// (GET/HEAD) hit the cache; mutations (the rare case) drop the entry on
// response finish. See the deserializeUser note in routes/auth.ts.
app.use((req, _res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.user) {
    const uid = (req.user as { id?: number }).id;
    if (typeof uid === "number") _res.on("finish", () => bustUserCache(uid));
  }
  next();
});

// Scheduler ownership. This deploy runs ONLY the web process (index.mjs) —
// there is no separate worker service (see nixpacks.toml). So the schedulers
// (the 15-min bell tick that sends office reminders, contemplation nudges,
// etc.) MUST run here, in the web process, or they never run at all — which
// is exactly the bug behind "I never get my morning reminder" (real-time
// pushes worked; nothing cron-based did).
//
// Default: run in the web process. Opt out only when:
//   • DISABLE_BELL_SCHEDULER=true — global kill switch, or
//   • RUN_SCHEDULERS_IN_WORKER=true — a dedicated worker service has been
//     added and owns the schedulers, so the web copy must stand down to avoid
//     double-sending.
// (RUN_SCHEDULERS_IN_WEB is still honored as a force-on for parity with dev,
// but it's no longer REQUIRED — relying on it left the env unset in prod and
// the scheduler silent.)
const runInWeb =
  process.env["DISABLE_BELL_SCHEDULER"] !== "true" &&
  process.env["RUN_SCHEDULERS_IN_WORKER"] !== "true";
if (runInWeb) {
  logger.warn(
    "[bell-scheduler] running in the web process (default — no dedicated worker). Set RUN_SCHEDULERS_IN_WORKER=true if you add a worker service."
  );
  // Lazy imports so importing app.ts in tests doesn't start the
  // scheduler.
  import("./lib/bellSender").then(({ startBellScheduler }) => startBellScheduler()).catch((err) => {
    logger.error({ err }, "[bell-scheduler] failed to boot");
  });
  import("./lib/letterWindowSender").then(({ startLetterWindowScheduler }) => startLetterWindowScheduler()).catch((err) => {
    logger.error({ err }, "[letter-window-scheduler] failed to boot");
  });
}

app.use("/api", router);

// ─── Universal Link association file ───────────────────────────────────────
// Apple fetches https://withphoebe.app/.well-known/apple-app-site-association
// when the Phoebe iOS app is installed and the user taps a Phoebe link
// anywhere in the system. Must be served with no redirect, no auth,
// Content-Type: application/json. Set APPLE_TEAM_ID env so the live file
// doesn't contain a placeholder; if unset we still serve a 200 so the
// route responds (Apple will just fail to associate until configured).
app.get("/.well-known/apple-app-site-association", (_req, res) => {
  const teamId = process.env["APPLE_TEAM_ID"] ?? "TEAM_ID";
  const bundleId = process.env["APPLE_BUNDLE_ID"] ?? "app.withphoebe.mobile";
  const appId = `${teamId}.${bundleId}`;
  res
    .setHeader("Content-Type", "application/json")
    .setHeader("Cache-Control", "public, max-age=3600")
    .json({
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [appId],
            // Components are the URL prefixes that should open the iOS
            // app instead of Safari when the user taps a link from
            // outside the app (Mail, Messages, an email web client, a
            // share sheet). Apple matches longest-prefix-first and
            // routes the tap through the app's universal-link handler
            // (see native-shell.ts) which maps the path into a wouter
            // route. Anything NOT listed here drops to Safari, which
            // is the right call for unrelated landing pages.
            components: [
              // ── Auth + onboarding ────────────────────────────────
              { "/": "/dashboard" },
              { "/": "/welcome" },
              { "/": "/settings" },
              // ── Prayer requests ──────────────────────────────────
              // Both the public share-link (/p/:token, served as
              // /prayer-requests/share/...) and the deep-link push
              // landing (/prayer-requests/:id) live under this prefix.
              { "/": "/prayer-requests/*" },
              // ── Letters ──────────────────────────────────────────
              // /letter/:id is the share-link landing (LetterSplash);
              // /letters/* covers the index, correspondence detail,
              // and write surfaces.
              { "/": "/letter/*" },
              { "/": "/letters/*" },
              // ── Communities ──────────────────────────────────────
              { "/": "/communities/join/*" },
              { "/": "/communities/*" },
              // ── Prayer feeds + public feed ───────────────────────
              { "/": "/prayer-feeds/*" },
              { "/": "/feed/*" },
              // ── Prayer mode (digest links, intercession walks) ──
              // The Tuesday digest + parish weekly recap email both
              // route here with ?queue=... query params.
              { "/": "/prayer-mode" },
              { "/": "/prayer-mode/*" },
              { "/": "/prayer-list" },
              // ── BCP / Daily offices ─────────────────────────────
              { "/": "/bcp" },
              { "/": "/bcp/*" },
              { "/": "/offices" },
              // ── Standalone deep-link surfaces ───────────────────
              { "/": "/m/*" },              // short-form moment invite
              { "/": "/lectio/*" },         // lectio practice
              { "/": "/moments/*" },        // practice detail
              { "/": "/parish" },
              { "/": "/parish/*" },
              { "/": "/people" },
              { "/": "/people/*" },
              // ── Unsigned-in welcome (so a fresh tap still routes
              //    through the app once installed) ─────────────────
              { "/": "/pray" },
            ],
          },
        ],
      },
      webcredentials: { apps: [appId] },
    });
});

// Serve letters-app at /mail (must come before the main app catch-all)
const lettersDist = path.resolve(__dirname, "../../letters-app/dist/public");
if (fs.existsSync(lettersDist)) {
  app.use("/mail/assets", express.static(path.join(lettersDist, "assets"), { maxAge: "1y", immutable: true }));
  app.use("/mail", express.static(lettersDist, { maxAge: 0 }));
  app.get("/mail/{*path}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(lettersDist, "index.html"));
  });
}

// Serve main app static files (catch-all — must come last)
const frontendDist = path.resolve(__dirname, "../../mymonastery/dist/public");
if (fs.existsSync(frontendDist)) {
  // Hashed assets get long cache; everything else (index.html) must revalidate
  app.use("/assets", express.static(path.join(frontendDist, "assets"), { maxAge: "1y", immutable: true }));
  app.use(express.static(frontendDist, {
    maxAge: 0,
    // `maxAge: 0` emits `Cache-Control: public, max-age=0`, which Railway's
    // edge still caches — so a directory request for "/" (served as
    // index.html here, before the SPA catch-all below) kept serving the
    // PREVIOUS build's shell for minutes after a deploy, pinning users to
    // stale hashed chunks. Force the shell HTML and the service worker to
    // revalidate every time so a new build is picked up immediately. (Deep
    // links like /dashboard already get this via the catch-all's header.)
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html") || filePath.endsWith("service-worker.js")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    },
  }));

  // Route-specific OG meta for link previews (iMessage, Slack, etc.).
  // Preview crawlers don't run JS, so they only see whatever HTML we ship
  // on the first response — dynamic content has to be baked into the
  // initial index.html before the SPA boots.
  const ogStaticOverrides: Record<string, { title: string; description: string }> = {
    "/church-deck": {
      title: "How Phoebe Cultivates Connection",
      description: "A place set apart for connection. Every day. Between Sundays.",
    },
  };

  // Minimal HTML escape for values we inject into <meta content="..."> and
  // <title>…</title>. Community names/descriptions are user-editable so we
  // can't trust them raw.
  const escapeMeta = (s: string) =>
    s.replace(/&/g, "&amp;")
     .replace(/</g, "&lt;")
     .replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;");

  function renderIndexWithOg(title: string, description: string): string {
    const indexPath = path.join(frontendDist, "index.html");
    const html = fs.readFileSync(indexPath, "utf-8");
    const t = escapeMeta(title);
    const d = escapeMeta(description);
    return html
      .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`)
      .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${t}"`)
      .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${d}"`)
      .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${t}"`)
      .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${d}"`);
  }

  // Community invite links — render "Pray Daily with <community>"
  // so an iMessage/Slack preview names the specific community rather than
  // the generic landing-page copy. Matches both:
  //   /communities/join/:slug/:token
  //   /communities/join/:slug  (legacy / bare-slug forms)
  const invitePathRe = /^\/communities\/join\/([a-z0-9][a-z0-9-]*)\b/i;

  // Public prayer-request share links — /p/:token. The owner taps
  // "Share" and sends this URL via iMessage; the recipient's phone
  // fetches this very route before the user clicks through, so the
  // preview card has to be baked into the initial HTML response.
  // Tokens are 12-byte hex (24 chars) — see prayer.ts:680.
  const prayerSharePathRe = /^\/p\/([a-f0-9]{16,})\b/i;

  app.get("/{*path}", async (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");

    // 1) Static per-path overrides (church-deck, etc.)
    const staticOverride = ogStaticOverrides[req.path];
    if (staticOverride) {
      res.type("html").send(renderIndexWithOg(staticOverride.title, staticOverride.description));
      return;
    }

    // 2) Community invite → look up the group by slug so the preview names
    // the actual community. We don't validate the token here — link preview
    // crawlers just need the metadata, and if the token is stale the SPA
    // will show the correct error once the user clicks through.
    const inviteMatch = invitePathRe.exec(req.path);
    if (inviteMatch) {
      const slug = inviteMatch[1]!.toLowerCase();
      try {
        const [group] = await db
          .select({ name: groupsTable.name, description: groupsTable.description })
          .from(groupsTable)
          .where(eq(groupsTable.slug, slug));
        if (group) {
          const title = `Pray Daily with ${group.name}`;
          const description = group.description && group.description.trim().length > 0
            ? group.description
            : "A place set apart for connection. Every day. Between Sundays.";
          res.type("html").send(renderIndexWithOg(title, description));
          return;
        }
      } catch (err) {
        // Fail open — fall through to the default index.html rather than
        // break the whole invite flow because Postgres hiccuped on a
        // metadata lookup.
        logger.warn({ err, slug }, "[og] invite preview lookup failed");
      }
    }

    // 3) Public prayer-request share → render the request body as the
    // preview title (iMessage shows og:title prominently above the
    // hostname) with "<Name> is asking for prayer" as the description.
    // Earlier we hid the body to keep prayer details off a recipient's
    // lock screen, but the SENDER chose to share — letting them choose
    // whether the body shows beats deciding for them. The body is
    // collapsed to its first non-empty line and truncated so iMessage
    // doesn't elide it mid-word.
    const prayerMatch = prayerSharePathRe.exec(req.path);
    if (prayerMatch) {
      const token = prayerMatch[1]!.toLowerCase();
      try {
        const [row] = await db
          .select({
            isAnonymous: prayerRequestsTable.isAnonymous,
            createdByName: prayerRequestsTable.createdByName,
            ownerId: prayerRequestsTable.ownerId,
            closedAt: prayerRequestsTable.closedAt,
            isAnswered: prayerRequestsTable.isAnswered,
            body: prayerRequestsTable.body,
          })
          .from(prayerRequestsTable)
          .where(eq(prayerRequestsTable.shareToken, token));
        // Closed/answered requests fall through to the default shell —
        // the SPA renders the "not found" state and the preview should
        // be generic, not "Someone is asking for prayer" for a request
        // that's already been wrapped up.
        if (row && !row.closedAt && !row.isAnswered) {
          let displayName: string | null = null;
          if (!row.isAnonymous) {
            const stored = row.createdByName?.trim();
            if (stored) {
              displayName = stored;
            } else {
              const [owner] = await db
                .select({ name: usersTable.name })
                .from(usersTable)
                .where(eq(usersTable.id, row.ownerId));
              displayName = owner?.name?.trim() || null;
            }
          }
          // First non-empty line of the body, collapsed-whitespace and
          // truncated to ~140 chars. iMessage / Slack typically only
          // render the first ~80 of og:title, but Twitter / Facebook
          // show more — 140 hits both targets without breaking either.
          const firstLine = row.body
            .split(/\r?\n/)
            .map((s) => s.trim())
            .find((s) => s.length > 0) ?? row.body.trim();
          const collapsed = firstLine.replace(/\s+/g, " ");
          const MAX = 140;
          const bodyPreview = collapsed.length > MAX
            ? `${collapsed.slice(0, MAX - 1).trimEnd()}…`
            : collapsed;
          // The body leads the preview; the "is asking for prayer"
          // framing moves to the description line, which also serves
          // as fallback copy for any previewer that ignores og:title.
          const title = bodyPreview;
          const description = displayName
            ? `${displayName} is asking for prayer on Phoebe.`
            : "Someone is asking for prayer on Phoebe.";
          res.type("html").send(renderIndexWithOg(title, description));
          return;
        }
      } catch (err) {
        logger.warn({ err, token }, "[og] prayer-share preview lookup failed");
      }
    }

    // 4) Default: just ship the SPA shell unchanged.
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// ─── JSON error handler ────────────────────────────────────────────────────
// Last middleware in the stack: catches any synchronous throw from a
// handler (or anything passed to next(err)) and returns a JSON 500
// instead of Express's default HTML error page. Paired with the
// process-level unhandledRejection guard in index.ts — together they
// make sure a surprise error on launch day returns a clean response
// the client can render, rather than either crashing the process or
// showing a "Cannot GET /api/…" HTML dump. The 4-arg signature is how
// Express recognises error middleware.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  // body-parser throws PayloadTooLargeError with a .type discriminator;
  // surface that distinctly so the client can show "image too large"
  // copy rather than a generic 500. Not Sentry-worthy — it's an
  // expected client problem, not a server bug.
  const typed = err as { type?: string; status?: number };
  if (typed?.type === "entity.too.large") {
    logger.warn({ path: req.path, method: req.method }, "[api] payload too large");
    if (!res.headersSent) {
      res.status(413).json({ error: "That file is too big. Try a smaller image." });
    }
    return;
  }
  // Real 500 — log locally AND forward to Sentry (no-op if DSN unset).
  // captureError attaches the request route + method as tags so the
  // Sentry issue lands grouped by surface, not as a generic catch-all.
  const userId = (req.user as { id?: number } | undefined)?.id;
  captureError(err, {
    path: req.path,
    method: req.method,
    userId: userId ?? null,
  });
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
