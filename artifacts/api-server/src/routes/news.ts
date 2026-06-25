// News & Actions — partner-org news surfaced in-app.
//
// Phoebe pulls recent stories from Episcopal-affiliated justice / ministry
// orgs and shows them on the in-app "News & Actions" page. Content comes
// from each org's standard WordPress RSS feed (no scraping, no API key) —
// we parse titles, links, dates, excerpts, and categories, and resolve a
// hero image per story from its og:image (cached) since WP feeds rarely
// carry the featured image.
//
// Multi-source ready: add an entry to SOURCES and it shows up. The page
// renders straight from /api/news, so new sources need no client change.
//
// Caching: per-feed 30-min TTL (feeds are light); per-article og:image
// cached 12h (article images rarely change). On fetch failure we serve
// the last good cache if we have one, else an empty list.

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { safeFetch } from "../lib/ssrfGuard";

const router: IRouter = Router();

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Phoebe/1.0";

type NewsSource = {
  slug: string;
  name: string;
  feedUrl: string;
  siteUrl: string; // the org's news page — a "view all" link target
  emoji: string;
};

const SOURCES: Record<string, NewsSource> = {
  rmm: {
    slug: "rmm",
    name: "Rural & Migrant Ministry",
    feedUrl: "https://ruralmigrantministry.org/feed/",
    siteUrl: "https://ruralmigrantministry.org/news-and-actions/",
    emoji: "🌾",
  },
};
// Display order for the merged /api/news list.
const SOURCE_ORDER: string[] = ["rmm"];

type NewsItem = {
  id: string;
  sourceSlug: string;
  sourceName: string;
  title: string | null;
  link: string | null;
  publishedAt: string | null; // ISO 8601
  excerpt: string | null;
  categories: string[];
  imageUrl: string | null;
};

// ── tiny XML/HTML helpers (regex parse, same shape as podcast.ts) ──
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;|&#x27;/gi, "'")
    .replace(/&#8217;|&#8216;/g, "’")
    .replace(/&#8230;/g, "…")
    .replace(/&#8211;|&#8212;/g, "—")
    .replace(/&nbsp;/g, " ")
    .trim();
}
function firstMatch(block: string, re: RegExp): string | null {
  const m = block.match(re);
  return m ? (m[1] ?? null) : null;
}
function stripHtml(s: string, max = 220): string | null {
  const text = decodeEntities(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
function toIso(pub: string | null): string | null {
  if (!pub) return null;
  const d = new Date(pub.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseFeedItems(xml: string, source: NewsSource, limit: number): NewsItem[] {
  const out: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && out.length < limit) {
    const item = m[1] ?? "";
    const link = firstMatch(item, /<link>([\s\S]*?)<\/link>/i);
    const title = firstMatch(item, /<title>([\s\S]*?)<\/title>/i);
    const pub = firstMatch(item, /<pubDate>([\s\S]*?)<\/pubDate>/i);
    const guid = firstMatch(item, /<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const desc =
      firstMatch(item, /<content:encoded>([\s\S]*?)<\/content:encoded>/i) ??
      firstMatch(item, /<description>([\s\S]*?)<\/description>/i);
    const categories = [...item.matchAll(/<category>([\s\S]*?)<\/category>/gi)]
      .map((c) => decodeEntities(c[1] ?? ""))
      .filter(Boolean)
      .slice(0, 4);
    // Prefer an inline image (media:* / enclosure / first <img>) so we can
    // skip the per-article og:image fetch when the feed already has one.
    const inlineImg =
      firstMatch(item, /<media:content[^>]*\burl="([^"]+)"/i) ??
      firstMatch(item, /<media:thumbnail[^>]*\burl="([^"]+)"/i) ??
      firstMatch(item, /<enclosure[^>]*\burl="([^"]+\.(?:jpg|jpeg|png|webp))"/i) ??
      (desc ? firstMatch(desc, /<img[^>]*\bsrc="([^"]+)"/i) : null);
    const cleanLink = link ? decodeEntities(link) : null;
    out.push({
      id: (guid ? decodeEntities(guid) : null) || cleanLink || `${source.slug}:${out.length}`,
      sourceSlug: source.slug,
      sourceName: source.name,
      title: title ? decodeEntities(title) : null,
      link: cleanLink,
      publishedAt: toIso(pub),
      excerpt: desc ? stripHtml(desc) : null,
      categories,
      imageUrl: inlineImg ? decodeEntities(inlineImg) : null,
    });
  }
  return out;
}

// ── caches ──
const FEED_TTL_MS = 30 * 60_000;
const feedCache = new Map<string, { at: number; items: NewsItem[] }>();
const IMG_TTL_MS = 12 * 60 * 60_000;
const imgCache = new Map<string, { at: number; img: string | null }>();

// Resolve a story's hero image from its page's og:image. Timeout-bounded
// and cached (including misses) so a slow article can't stall the feed.
async function resolveOgImage(url: string): Promise<string | null> {
  const hit = imgCache.get(url);
  if (hit && Date.now() - hit.at < IMG_TTL_MS) return hit.img;
  try {
    // safeFetch re-validates the host on EVERY redirect hop (not just this
    // initial feed-derived article URL), so a publisher link that 30x-redirects
    // toward an internal address still can't reach it.
    const res = await safeFetch(url, { timeoutMs: 4500, headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = (await res.text()).slice(0, 80_000); // og tags live in <head>
    const og =
      firstMatch(html, /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ??
      firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
      firstMatch(html, /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const img = og ? decodeEntities(og) : null;
    imgCache.set(url, { at: Date.now(), img });
    return img;
  } catch {
    imgCache.set(url, { at: Date.now(), img: null });
    return null;
  }
}

async function loadSource(source: NewsSource, limit = 12): Promise<NewsItem[]> {
  const hit = feedCache.get(source.slug);
  if (hit && Date.now() - hit.at < FEED_TTL_MS) return hit.items.slice(0, limit);
  try {
    const res = await fetch(source.feedUrl, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml" },
    });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseFeedItems(xml, source, Math.max(limit, 12));
    // Resolve a hero image per story (parallel; each cached + timeout-
    // bounded). Items that already had an inline image skip the fetch.
    await Promise.all(
      items.map(async (it) => {
        if (!it.imageUrl && it.link) it.imageUrl = await resolveOgImage(it.link);
      }),
    );
    feedCache.set(source.slug, { at: Date.now(), items });
    return items.slice(0, limit);
  } catch (err) {
    logger.warn({ err, source: source.slug }, "[news] feed fetch failed");
    if (hit) return hit.items.slice(0, limit); // serve stale on failure
    return [];
  }
}

function sourceMeta(s: NewsSource) {
  return { slug: s.slug, name: s.name, emoji: s.emoji, siteUrl: s.siteUrl };
}

// ── GET /api/news — every source, in website feed order ──
router.get("/news", async (_req: Request, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "public, max-age=600");
  const sources = SOURCE_ORDER.map((slug) => SOURCES[slug]).filter(Boolean) as NewsSource[];
  const lists = await Promise.all(sources.map((s) => loadSource(s)));
  // Preserve the per-source feed order (= website page order) rather than
  // re-sorting globally by date, which can reorder or bury items.
  const items = lists.flat();
  res.json({ sources: sources.map(sourceMeta), items });
});

// ── GET /api/news/:source — one source's stories ──
router.get("/news/:source", async (req: Request, res: Response): Promise<void> => {
  const source = SOURCES[String(req.params.source ?? "")];
  if (!source) { res.status(404).json({ error: "Unknown news source" }); return; }
  res.setHeader("Cache-Control", "public, max-age=600");
  const items = await loadSource(source);
  res.json({ source: sourceMeta(source), items });
});

export default router;
