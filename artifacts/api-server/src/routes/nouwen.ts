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

/**
 * TODAY'S REFLECTION QUESTION, for the "A moment to reflect" notification.
 *
 * The question is one labelled line in the post's body in the same public RSS feed
 * ("Reflection Question: ..."). It is the ONE piece of their text this app copies
 * out (owner, 2026-10-03: "lets try it"), and it is always sent with their name and a
 * tap that opens their own page. Returns null when the newest post is not from the
 * last day and a half, has no such line, or the line is not a sensible length - a
 * push with nothing, or somebody else's day, in it is worse than silence.
 */
let questionCache: { at: number; value: { question: string; url: string } | null } | null = null;

function decodeEntities(t: string): string {
  return t
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&rsquo;/g, "\u2019").replace(/&lsquo;/g, "\u2018")
    .replace(/&ldquo;/g, "\u201C").replace(/&rdquo;/g, "\u201D").replace(/&mdash;/g, "\u2014")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function extractReflectionQuestion(itemXml: string): string | null {
  let body = /<content:encoded>([\s\S]*?)<\/content:encoded>/i.exec(itemXml)?.[1] ?? "";
  body = body.replace(/<!\[CDATA\[|\]\]>/g, "");
  if (!/<strong/i.test(body)) body = decodeEntities(body); // a feed that escapes its markup
  const m = /<strong[^>]*>\s*Reflection\s+Question\s*<\/strong>\s*:?\s*([\s\S]*?)<\/p>/i.exec(body);
  if (!m) return null;
  const q = decodeEntities(m[1]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return q.length >= 12 && q.length <= 260 ? q : null;
}

export async function resolveTodayNouwenQuestion(): Promise<{ question: string; url: string } | null> {
  if (questionCache && Date.now() - questionCache.at < 30 * 60 * 1000) return questionCache.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": UA }, signal: controller.signal });
    if (!res.ok) throw new Error(`nouwen feed ${res.status}`);
    const xml = await res.text();
    const item = /<item>([\s\S]*?)<\/item>/i.exec(xml)?.[1] ?? "";
    const published = Date.parse(/<pubDate>([\s\S]*?)<\/pubDate>/i.exec(item)?.[1]?.trim() ?? "");
    const question = extractReflectionQuestion(item);
    const found = firstItem(xml);
    const fresh = Number.isFinite(published) && Date.now() - published < 36 * 60 * 60 * 1000;
    const value = question && found && fresh ? { question, url: found.url } : null;
    questionCache = { at: Date.now(), value };
    return value;
  } catch {
    return null;
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
