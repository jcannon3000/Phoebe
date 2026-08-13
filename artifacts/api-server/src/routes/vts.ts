// External-link helper for Virginia Theological Seminary's Dean's
// Commentary — a weekday devotional posted to VTS's News & Publications
// blog. Mirrors routes/cac.ts: GET /api/vts/today fetches the site's
// public RSS feed, finds the newest item tagged "Dean's Commentary", and
// 302-redirects there. See that file for the fuller design rationale
// (feed-first "today" resolution, cache TTL, fallback behavior).
//
// One difference from CAC: CAC's feed URL is already scoped to its
// daily-meditations category (https://cac.org/category/daily-meditations/
// feed/), so the first <item> in the feed IS the latest meditation. VTS's
// https://vts.edu/feed/ is the SITE-WIDE feed (Dean's Commentary mixed in
// with press releases etc.), so parseFirstItem here has to additionally
// filter on each item's <category> before taking the newest match.
//
// VTS publishes on weekdays; on a weekend or a day they skip, the feed's
// newest matching item is simply Friday's (or whenever they last posted)
// — same as CAC's own behavior when nothing new has gone up, and the
// intended fallback (show the latest real commentary, not an error).

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FEED_URL = "https://vts.edu/feed/";
const FALLBACK_URL = "https://vts.edu/news-publications/?term=deans-commentary&keyword=";
const CATEGORY = "Dean's Commentary";
const FEED_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// Same reasoning as cac.ts's CACHE_TTL_MS: short enough to pick up a new
// post within minutes of it going live, long enough that normal traffic
// never hits vts.edu directly.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cached: { url: string; title: string; fetchedAt: number } | null = null;

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#8217;|&#x2019;/gi, "’")
    .replace(/&#8216;|&#x2018;/gi, "‘")
    .replace(/&#8220;|&#x201C;/gi, "“")
    .replace(/&#8221;|&#x201D;/gi, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&hellip;|&#8230;/gi, "…")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .trim();
}

// Find the newest <item> tagged with CATEGORY (an item can carry several
// <category> tags — WordPress's default RSS is newest-first, so the
// first match found walking top-to-bottom is the latest one).
function parseFirstMatchingItem(xml: string): { url: string; title: string } | null {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/g);
  if (!items) return null;
  for (const block of items) {
    const categories: string[] = block.match(/<category\b[^>]*>([\s\S]*?)<\/category>/g) ?? [];
    const hasCategory = categories.some((c) => decodeEntities(c.replace(/<\/?category[^>]*>/g, "")) === CATEGORY);
    if (!hasCategory) continue;
    const linkMatch = block.match(/<link>([^<]+)<\/link>/);
    if (!linkMatch) continue;
    const url = linkMatch[1].trim();
    // Sanity: the permalink must actually live under vts.edu. RSS allows
    // an offsite <link>; bail rather than redirect somewhere unexpected.
    if (!/^https?:\/\/(?:www\.)?vts\.edu\//i.test(url)) continue;
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? decodeEntities(titleMatch[1]) : "";
    return { url, title };
  }
  return null;
}

async function resolveToday(): Promise<{ url: string; title: string }> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { url: cached.url, title: cached.title };
  }
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
      logger.warn({ status: res.status }, "[vts] feed fetch non-ok");
      return { url: FALLBACK_URL, title: "" };
    }
    const xml = await res.text();
    const parsed = parseFirstMatchingItem(xml);
    if (!parsed) {
      logger.warn({ bytes: xml.length }, "[vts] could not find a Dean's Commentary item");
      return { url: FALLBACK_URL, title: "" };
    }
    cached = { ...parsed, fetchedAt: Date.now() };
    return parsed;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[vts] feed fetch failed");
    return { url: FALLBACK_URL, title: "" };
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/vts/today → 302 to today's Dean's Commentary permalink.
// Public, no auth. 302 (not 301) so the redirect target is never
// permanently cached by an intermediate proxy.
router.get("/vts/today", async (_req: Request, res: Response): Promise<void> => {
  const { url } = await resolveToday();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.redirect(302, url);
});

// GET /api/vts/today-meta → { title, url } — powers the home card's
// headline (today's commentary title) without embedding VTS's content.
router.get("/vts/today-meta", async (_req: Request, res: Response): Promise<void> => {
  const { url, title } = await resolveToday();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ title, url });
});

export default router;
