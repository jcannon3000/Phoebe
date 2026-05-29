/**
 * Lightweight Forward Day by Day episode fetcher.
 *
 * Fetches the Forward Day by Day Megaphone RSS feed and returns the most
 * recent episode. A 30-minute in-memory TTL cache prevents hammering the
 * feed endpoint; on failure the last-good value is returned so a transient
 * outage doesn't remove the slide from an assembled office.
 *
 * FDD publishes at ~05:00 ET, so the 30-minute TTL means users praying
 * after ~05:30 ET will reliably get today's episode even if the office
 * assembly cache was warmed at midnight.
 */

const FEED_URL = "https://feeds.megaphone.fm/forwarddaybyday";
const TTL_MS = 30 * 60_000; // 30 minutes

export type FddEpisode = {
  title: string | null;
  audioUrl: string;
  durationSeconds: number | null;
  description: string | null;
  publishedAt: string | null;
};

let _cache: { at: number; episode: FddEpisode } | null = null;

// ── XML helpers (mirrors the subset used in podcast.ts) ──────────────────────

function fromCodePoint(cp: number): string {
  try { return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""; } catch { return ""; }
}

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCodePoint(parseInt(d, 10)))
    .trim();
}

function parseDuration(raw: string | null): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(t)) return null;
  const parts = t.split(":").map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function plainPreview(raw: string | null, max = 220): string | null {
  if (!raw) return null;
  const text = decodeXml(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the most recent FDD episode, using a 30-minute in-memory cache.
 * Returns null only when the feed has never been successfully fetched AND
 * the current attempt fails — callers should treat null as "gracefully omit."
 */
export async function getTodayFddEpisode(): Promise<FddEpisode | null> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.episode;
  try {
    const res = await fetch(FEED_URL, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
          "(KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        accept: "application/rss+xml, application/xml, text/xml, text/html",
      },
    });
    if (!res.ok) throw new Error(`FDD feed HTTP ${res.status}`);
    const xml = await res.text();

    // Parse the first <item> only — the feed is newest-first.
    const itemMatch = xml.match(/<item[\s>]([\s\S]*?)<\/item>/i);
    if (!itemMatch) throw new Error("No FDD items found");
    const item = itemMatch[1] ?? "";

    const enclosure = item.match(/<enclosure[^>]*\burl="([^"]+)"/i)?.[1];
    if (!enclosure) throw new Error("No enclosure in FDD item");

    const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? null;
    const duration = item.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/i)?.[1] ?? null;
    const pub = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? null;
    const desc =
      item.match(/<itunes:summary>([\s\S]*?)<\/itunes:summary>/i)?.[1] ??
      item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ??
      null;

    const episode: FddEpisode = {
      title: title ? decodeXml(title) : null,
      audioUrl: decodeXml(enclosure),
      durationSeconds: parseDuration(duration),
      description: plainPreview(desc),
      publishedAt: pub ? pub.trim() : null,
    };
    _cache = { at: Date.now(), episode };
    return episode;
  } catch (err) {
    // Return stale cache on failure rather than nothing.
    if (_cache) return _cache.episode;
    console.warn("[fddFetcher] fetch failed, no cache:", err);
    return null;
  }
}
