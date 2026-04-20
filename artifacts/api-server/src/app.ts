import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { db, groupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PgSession = connectPgSimple(session);

if (process.env["NODE_ENV"] === "production" && !process.env["SESSION_SECRET"]) {
  throw new Error("SESSION_SECRET must be set in production");
}

const app: Express = express();
app.set("trust proxy", 1);

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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

app.use("/api", router);

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
  app.use(express.static(frontendDist, { maxAge: 0 }));

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

  // Community invite links — render "Pray with <community> with Phoebe"
  // so an iMessage/Slack preview names the specific community rather than
  // the generic landing-page copy. Matches both:
  //   /communities/join/:slug/:token
  //   /communities/join/:slug  (legacy / bare-slug forms)
  const invitePathRe = /^\/communities\/join\/([a-z0-9][a-z0-9-]*)\b/i;

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
          const title = `Pray with ${group.name} with Phoebe`;
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

    // 3) Default: just ship the SPA shell unchanged.
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
