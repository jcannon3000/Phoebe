// In-memory rate limiter. Phoebe runs as a single Railway instance so a
// shared store isn't required yet; if we ever scale horizontally, swap the
// `stores` map for a Redis-backed equivalent and everything else stays
// untouched.
//
// Used to blunt signup spam / credential stuffing on the three write paths
// that face the public internet: register, login, and community-invite
// join. Always fail-open on internal errors — we'd rather let a legit user
// through than kick them out because the limiter itself glitched.

import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

// One sub-store per named limiter so counts from different routes don't
// cross-contaminate. E.g. "auth_register" and "groups_join" keep their own
// maps keyed by whatever identifier each route cares about.
const stores = new Map<string, Map<string, Bucket>>();

export interface RateLimitOptions {
  name: string;
  max: number;
  windowMs: number;
  // Key extractor. Default is the client IP. Use this to rate-limit per
  // email, per community slug, etc.
  keyFn?: (req: Request) => string | null;
  message?: string;
}

export function rateLimit(options: RateLimitOptions) {
  const store = stores.get(options.name) ?? new Map<string, Bucket>();
  stores.set(options.name, store);

  return (req: Request, res: Response, next: NextFunction): void => {
    let key: string | null;
    try {
      key = options.keyFn ? options.keyFn(req) : getClientIp(req);
    } catch {
      // Key extraction blew up (e.g. missing body). Fail open.
      next();
      return;
    }
    // No key → nothing to limit against. Fail open rather than block.
    if (!key) { next(); return; }

    const now = Date.now();
    let bucket = store.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      store.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > options.max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      res.status(429).json({
        error: options.message ?? "Too many requests. Please try again later.",
        retryAfter,
      });
      return;
    }
    next();
  };
}

// Use Express's req.ip for the client identity. With `trust proxy` set
// (app.ts: app.set("trust proxy", 1)), Express derives req.ip from the
// X-Forwarded-For entry contributed by the single trusted hop (Railway's
// proxy) — i.e. the real client as the proxy saw it.
//
// We deliberately do NOT parse X-Forwarded-For ourselves and take the
// leftmost entry: that entry is fully CLIENT-controlled (anyone can send
// `X-Forwarded-For: <anything>`), so trusting it let an attacker rotate the
// value on every request to land in a fresh rate-limit bucket and bypass
// all IP-based limits — including the brute-force guards on login,
// password reset, and magic-code verification.
export function getClientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

// Convenience wrapper for authenticated write endpoints. Keys by user
// id (so two users on the same WiFi don't share a bucket), and falls
// back to IP for unauthenticated callers. Use this whenever a route
// already runs after passport / session middleware — i.e. anything
// where req.user is populated.
//
// Example:
//   router.post("/prayer-requests", perUserRateLimit("prayer_requests_create", {
//     max: 20, windowMs: 60 * 60 * 1000,
//   }), async (req, res) => { ... });
export function perUserRateLimit(
  name: string,
  opts: { max: number; windowMs: number; message?: string },
) {
  return rateLimit({
    name,
    max: opts.max,
    windowMs: opts.windowMs,
    message: opts.message,
    keyFn: (req) => {
      const uid = (req.user as { id?: number } | undefined)?.id;
      return uid ? `u:${uid}` : `ip:${getClientIp(req)}`;
    },
  });
}

// Periodic cleanup of expired buckets so memory doesn't grow unbounded when
// many unique keys hit a limiter and then never come back.
const CLEANUP_INTERVAL_MS = 60_000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, bucket] of store.entries()) {
      if (bucket.resetAt <= now) store.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();
