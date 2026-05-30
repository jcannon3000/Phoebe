// Building Faith — Episcopal faith-formation articles (a Forward Movement /
// Virginia Theological Seminary resource at buildfaith.org).
//
// buildfaith.org is WordPress behind Cloudflare. We fetch its public WP REST
// API server-side (Cloudflare serves a real browser User-Agent — it only
// blocks bare/bot-shaped requests) and hand the client a slim article list.
// Tapping an article opens it in the in-app browser; the pages can't be
// reliably iframed (Cloudflare + X-Frame-Options on the block page), and
// re-hosting their article text would be a content-permission question, so
// we link out (show title + excerpt + image as a preview).
//
// Caching mirrors the podcast feed cache: a short in-process TTL, and we
// serve the last good payload on a fetch error rather than an empty list.

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// _embed=1 brings the featured image (wp:featuredmedia) + category terms
// (wp:term) back in one call. 20 recent posts is plenty for a reading list.
const API_URL = "https://buildfaith.org/wp-json/wp/v2/posts?per_page=20&_embed=1";
const SITE_URL = "https://buildfaith.org/";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

type Article = {
  id: number;
  title: string;
  excerpt: string;
  date: string; // ISO
  url: string;
  imageUrl: string | null;
  category: string | null;
};

const TTL_MS = 30 * 60_000;
let cache: { at: number; data: Article[] } | null = null;

function fromCp(cp: number): string {
  try { return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""; } catch { return ""; }
}
// WP returns rendered HTML with entities (&amp;, &#8217;, &#8220;…).
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCp(parseInt(d, 10)));
}
// Strip tags + decode + collapse whitespace, then truncate to a preview.
function plain(html: string, max = 220): string {
  const t = decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

type WpPost = {
  id: number;
  date: string;
  link: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
    "wp:term"?: Array<Array<{ taxonomy?: string; name?: string }>>;
  };
};

function mapPost(p: WpPost): Article {
  const media = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null;
  // wp:term groups are [categories, tags, …]; take the first category name.
  let category: string | null = null;
  for (const group of p._embedded?.["wp:term"] ?? []) {
    const cat = group.find((tm) => tm.taxonomy === "category" && tm.name);
    if (cat?.name) { category = decodeEntities(cat.name); break; }
  }
  return {
    id: p.id,
    title: decodeEntities((p.title?.rendered ?? "").replace(/<[^>]+>/g, "")).trim(),
    excerpt: plain(p.excerpt?.rendered ?? ""),
    date: p.date,
    url: p.link,
    imageUrl: media,
    category,
  };
}

async function loadArticles(): Promise<Article[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(API_URL, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[buildfaith] REST fetch non-ok");
      return cache?.data ?? []; // serve stale if we have it
    }
    const posts = (await res.json()) as WpPost[];
    const articles = Array.isArray(posts)
      ? posts.map(mapPost).filter((a) => a.title && a.url)
      : [];
    if (articles.length > 0) cache = { at: Date.now(), data: articles };
    return cache?.data ?? articles;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[buildfaith] fetch failed");
    return cache?.data ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/buildfaith — recent Building Faith articles. Public content.
router.get("/buildfaith", async (_req: Request, res: Response): Promise<void> => {
  const articles = await loadArticles();
  res.setHeader("Cache-Control", "public, max-age=600");
  res.json({ articles, siteUrl: SITE_URL });
});

export default router;
