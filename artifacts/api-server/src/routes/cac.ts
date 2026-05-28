// External-link helpers for the Center for Action and Contemplation.
//
// The Contemplation "Learn" list points at CAC's Daily Meditations.
// Linking to https://cac.org or https://cac.org/daily-meditations/
// lands the user on a marketing index — they have to scroll and tap
// "Read full meditation" to actually reach today's piece. This route
// shortcuts that: GET /api/cac/today fetches the public RSS feed
// for the daily-meditations category, parses the first <item><link>
// (CAC always orders newest first), and 302-redirects there.
//
// CAC blocks bot-shaped requests on the HTML pages (403), but the
// /category/daily-meditations/feed/ RSS endpoint serves anyone with
// a normal browser User-Agent. The feed is the canonical machine-
// readable surface for "what's new" so this is the intended use.
//
// Response: 302 → today's permalink, or 302 → the index page on any
// failure (network, parse, empty feed). We never 500 — a "Learn"
// link that opens the index is still useful; a 500 just looks broken.

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FEED_URL = "https://cac.org/category/daily-meditations/feed/";
const FALLBACK_URL = "https://cac.org/daily-meditations/";
const FEED_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// In-memory cache with a short wall-clock TTL. The RSS feed always
// orders newest-first, so the first <item><link> is, by definition,
// the latest meditation — we don't need to reason about WHEN today's
// went live. A short TTL means: pick up today's meditation within a
// few minutes of CAC publishing it (≈2 AM ET), without hitting their
// RSS on every single tap.
//
// This replaces an earlier "publish day rolls over at 9 AM ET" scheme
// that actively served YESTERDAY's permalink until 9 AM ET — a 7-hour
// window of stale content every morning, since CAC publishes around
// 2 AM ET. The newest-item-from-the-feed approach has no artificial
// boundary: whatever's at the top of the feed right now is what we
// serve. Cache stays in-process; a redeploy invalidates it.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cached: { url: string; fetchedAt: number } | null = null;

// Pull the first <item>'s <link> out of an RSS document. We
// deliberately use a forgiving regex rather than a full XML parser
// because (a) there's no XML parser already in the dep tree and
// (b) the WordPress RSS shape is stable. The regex anchors on
// `<item>` (so we skip the channel-level <link> at the top, which
// points at cac.org/) and looks for the first <link> tag inside.
function parseFirstItemLink(xml: string): string | null {
  const firstItem = xml.match(/<item\b[^>]*>([\s\S]*?)<\/item>/);
  if (!firstItem) return null;
  const linkMatch = firstItem[1].match(/<link>([^<]+)<\/link>/);
  if (!linkMatch) return null;
  const url = linkMatch[1].trim();
  // Sanity: a daily-meditations permalink lives under cac.org. If we
  // somehow grabbed an offsite URL (RSS spec allows it) bail out so
  // we don't redirect users to a surprise destination.
  if (!/^https?:\/\/(?:www\.)?cac\.org\//i.test(url)) return null;
  return url;
}

async function resolveTodaysUrl(): Promise<string> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.url;
  }
  // Use AbortController so a slow / hanging RSS fetch doesn't keep
  // the user's tap waiting. 5s is plenty for a healthy WordPress feed
  // and short enough to fall back gracefully when CAC has a blip.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        "User-Agent": FEED_USER_AGENT,
        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[cac] feed fetch non-ok");
      // Don't poison the cache with the fallback — leave whatever was
      // there (or nothing) so the next request can try again. The
      // fallback URL is just for THIS response.
      return FALLBACK_URL;
    }
    const xml = await res.text();
    const url = parseFirstItemLink(xml);
    if (!url) {
      logger.warn({ bytes: xml.length }, "[cac] could not parse first item link");
      return FALLBACK_URL;
    }
    cached = { url, fetchedAt: Date.now() };
    return url;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[cac] feed fetch failed");
    return FALLBACK_URL;
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/cac/today → 302 to today's CAC Daily Meditation permalink.
// Public — no auth, no rate limit beyond the resolver's own cache.
// The redirect uses 302 (not 301) so a cache-miss roll-over to
// tomorrow's meditation doesn't get cached by intermediate proxies.
router.get("/cac/today", async (_req: Request, res: Response): Promise<void> => {
  const url = await resolveTodaysUrl();
  // 5-minute CDN/browser cache. The redirect target changes once a
  // day (when CAC publishes), so a long cache risks pinning
  // yesterday's permalink into this morning — exactly the staleness
  // a user hit ("CAC loaded yesterday's"). Five minutes keeps CAC
  // traffic negligible (the in-process 30-min cache already absorbs
  // the bulk) while letting the daily rollover reach every client
  // within minutes. 302 (not 301) so the redirect itself is never
  // permanently cached.
  res.setHeader("Cache-Control", "public, max-age=300");
  res.redirect(302, url);
});

export default router;
