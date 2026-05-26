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

// In-memory cache. CAC publishes once a day at ~6 AM UTC (≈2 AM ET).
// Rather than a wall-clock TTL — which can race the morning publish
// and serve yesterday's permalink for the first hour of the day — we
// cache by "publish day" where the day rolls over at 9 AM ET. That
// guarantees we only re-fetch once per day, always well after CAC's
// daily post has gone live. Cache stays in-process; a redeploy
// invalidates it, which is fine.
//
// The publishDay key is computed in America/New_York: if it's
// currently before 9 AM ET, we use YESTERDAY's date (still serving
// yesterday's URL — the new one might be live but the boundary is
// the safe choice). After 9 AM ET, we use today's date.
function publishDayKey(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = parseInt(get("hour"), 10);
  // Before 9 AM ET → roll back to yesterday's key. Doing the date math
  // through UTC midnight-noon avoids the DST surprises a naive
  // setDate would hit on spring-forward / fall-back mornings.
  if (hour < 9) {
    const utcNoon = new Date(`${year}-${month}-${day}T12:00:00Z`);
    utcNoon.setUTCDate(utcNoon.getUTCDate() - 1);
    return utcNoon.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

let cached: { url: string; day: string } | null = null;

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
  const today = publishDayKey();
  if (cached && cached.day === today) {
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
    cached = { url, day: today };
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
  // 1 hour CDN cache: short enough that the 9 AM ET rollover
  // propagates to all users within an hour or two of the new
  // meditation going live, long enough that the world doesn't ping
  // CAC every time a phone wakes up. The in-process cache above
  // protects us from intra-deploy CAC traffic regardless.
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.redirect(302, url);
});

export default router;
