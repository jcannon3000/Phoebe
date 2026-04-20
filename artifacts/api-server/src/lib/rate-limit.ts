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

// Railway / any reverse proxy sets X-Forwarded-For. Take the leftmost entry
// (the original client). Express's req.ip will already be correct if
// `trust proxy` is configured, but we fall back for safety.
export function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(xff) && xff.length > 0) {
    const first = xff[0]?.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
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
