// External-link helper for the Henri Nouwen Society's Daily Meditation.
//
// Mirrors routes/vts.ts and routes/cac.ts: GET /api/nouwen/today fetches the
// site's public RSS feed, takes the newest item, and 302-redirects there. The
// app never reproduces the meditation — Nouwen's site serves it, and Phoebe's
// reader view only restyles the page in the reader's own browser.
//
// WHY A REDIRECT ROUTE AT ALL. Nouwen's permalinks are opaque Squarespace
// slugs ("/daily-meditations/g932eld8rh8msa2-z8the-d4r9d-…"), so unlike
// Sojourners' Verse and Voice there is no URL to derive from the date. And the
// /daily-meditations/ index renders its list client-side, so fetching that
// page server-side returns no post links at all (measured: zero). The RSS feed
// is the only server-readable index — 20 items, newest first, with real
// permalinks and pubDates.
//
// They publish daily including weekends (verified: Sat 29 Aug present), so
// unlike VTS there is no weekday rule to honour. If the feed is unreachable
// the fallback is the meditations index, which is a real page rather than an
// error.

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const FEED_URL = "https://www.henrinouwen.org/daily-meditations?format=rss";
const INDEX_URL = "https://www.henrinouwen.org/daily-meditations/";
const UA = "PhoebeBot/1.0 (+https://withphoebe.app)";

type Resolved = { url: string; title: string | null };

/** Cached for the day — one fetch serves every device, as CAC/VTS do. */
let cache: { at: number; value: Resolved } | null = null;
const TTL_MS = 5 * 60 * 1000;

function firstItem(xml: string): Resolved | null {
  const block = /<item>([\s\S]*?)<\/item>/i.exec(xml);
  if (!block) return null;
  const it = block[1] ?? "";
  const link = /<link>([\s\S]*?)<\/link>/i.exec(it)?.[1]?.trim();
  const rawTitle = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(it)?.[1]?.trim();
  if (!link || !/^https?:\/\//i.test(link)) return null;
  return { url: link, title: rawTitle || null };
}

export async function resolveTodayNouwen(): Promise<Resolved> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`nouwen feed ${res.status}`);
    const found = firstItem(await res.text());
    const value = found ?? { url: INDEX_URL, title: null };
    cache = { at: Date.now(), value };
    return value;
  } catch {
    // Never fail the tap: the index is a real page they can read from.
    return { url: INDEX_URL, title: null };
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/nouwen/today → 302 to today's meditation. Public, no auth.
// 302 (not 301) so no intermediary caches the target permanently.
router.get("/nouwen/today", async (_req: Request, res: Response): Promise<void> => {
  const { url } = await resolveTodayNouwen();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.redirect(302, url);
});

// GET /api/nouwen/today-meta → { title, url }, for a card headline without
// embedding any of their text.
router.get("/nouwen/today-meta", async (_req: Request, res: Response): Promise<void> => {
  const { url, title } = await resolveTodayNouwen();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ title, url });
});

export default router;
