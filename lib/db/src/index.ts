import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Pool sizing (DB audit, finding #5). node-postgres defaults to max:10
// with no timeouts, which has two failure modes on Railway: (1) the web
// service + worker service + WS server all share Postgres, so 10 ×
// replicas can exhaust Postgres max_connections; (2) with no
// connectionTimeoutMillis a pool-exhaustion event makes requests HANG
// indefinitely instead of failing fast. Configurable via env so we can
// tune per-service (the worker needs far fewer connections than web)
// without a redeploy of the shared package.
//   DB_POOL_MAX                 default 10
//   DB_POOL_CONN_TIMEOUT_MS     default 5000 (fail fast, don't hang)
//   DB_POOL_IDLE_TIMEOUT_MS     default 30000 (release idle conns)
const poolMax = Number(process.env.DB_POOL_MAX ?? "10");
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONN_TIMEOUT_MS ?? "5000"),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? "30000"),
});

// Pool-level error handler so a dropped backend connection (Railway
// Postgres restart, idle reap) is logged rather than crashing the
// process via an unhandled 'error' event on an idle client.
pool.on("error", (err) => {
  console.error("[db] idle client error (non-fatal):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
