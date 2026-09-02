// External-link helper for Grist's daily climate reporting.
//
// Mirrors routes/nouwen.ts and routes/vts.ts: GET /api/grist/today reads the
// public RSS feed, takes the newest item, and 302-redirects there. Phoebe never
// reproduces Grist's writing — their site serves it, and the reader view only
// restyles the page in the reader's own browser.
//
// WHY THIS ROUTE EXISTS — a two-year-old newsletter was being served.
//
// The client used to point straight at
// https://go.grist.org/newsletter/preview/the-daily, with a comment claiming it
// "always renders the current issue, so no resolution is needed". That was
// simply untrue: measured 2026-09-02, that page renders the issue of
// **25 January 2024**. It is a preview of one captured issue, not a live one.
// Every reader who opened Grist in Phoebe got news that was nearly two years
// old, presented as "the day's climate reporting" — and nothing errored, which
// is why it went unnoticed. Owner: "Grist is stale too … it's supposed to
// update once a day."
//
// AND WHY NOT THE NEWSLETTER. There is no public archive to resolve against:
// go.grist.org/newsletter/archive and .../archive/the-daily both 302 to
// grist.org, so the frozen preview is the only newsletter surface Grist
// exposes. The RSS feed is current (verified: an item timestamped the morning
// of 2026-09-02) and is the only server-readable index of what they published
// today. The menu row already calls this "The day's climate reporting", which
// is what this now delivers.
//
// Grist publishes every weekday and often at weekends, so there is no weekday
// rule to honour — "newest item" is the whole rule. If the feed is unreachable
// the fallback is grist.org itself, which is a real page rather than an error.

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const FEED_URL = "https://grist.org/feed/";
const INDEX_URL = "https://grist.org/";
const UA = "PhoebeBot/1.0 (+https://withphoebe.app)";

type Resolved = { url: string; title: string | null };

/** Cached for a few minutes — one fetch serves every device, as CAC/VTS do. */
let cache: { at: number; value: Resolved } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * The newest <item> in the feed.
 *
 * Scoped to <item> blocks deliberately: the channel header carries its own
 * <title>Grist</title> and <link>https://grist.org/</link>, so a naive
 * first-<link> match would resolve to the homepage every time and look like it
 * was working. Matching the item block first is what makes this a real answer.
 */
function firstItem(xml: string): Resolved | null {
  const block = /<item>([\s\S]*?)<\/item>/i.exec(xml);
  if (!block) return null;
  const it = block[1] ?? "";
  const link = /<link>([\s\S]*?)<\/link>/i.exec(it)?.[1]?.trim();
  const rawTitle = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(it)?.[1]?.trim();
  if (!link || !/^https?:\/\//i.test(link)) return null;
  return { url: link, title: rawTitle || null };
}

export async function resolveTodayGrist(): Promise<Resolved> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`grist feed ${res.status}`);
    const found = firstItem(await res.text());
    const value = found ?? { url: INDEX_URL, title: null };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    // Never fail the tap: grist.org is a real page they can read from.
    return { url: INDEX_URL, title: null };
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/grist/today → 302 to the newest piece. Public, no auth.
// 302 (not 301) so no intermediary caches the target permanently — the whole
// point of this route is that the target changes daily.
router.get("/grist/today", async (_req: Request, res: Response): Promise<void> => {
  const { url } = await resolveTodayGrist();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.redirect(302, url);
});

// GET /api/grist/today-meta → { title, url }, for a card headline without
// embedding any of their text.
router.get("/grist/today-meta", async (_req: Request, res: Response): Promise<void> => {
  const { url, title } = await resolveTodayGrist();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ title, url });
});

export default router;
