// Podcast content — shows registry + browse/listen API.
//
// Phoebe hosts a small curated set of podcasts you can browse and play
// IN-APP (think Hallow-style content, not just outbound links):
//   • Forward Movement daily offices (Morning / Evening Prayer, read
//     aloud) — also surfaced on the prayer chooser + offices page.
//   • Center for Action and Contemplation — their full slate of shows.
//   • Washington National Cathedral — the "Crossroads" podcast.
//   • Virginia Theological Seminary — "Love Your Neighbor."
//
// Each SHOW is one RSS feed. PUBLISHERS group shows for the browse UI.
// Endpoints:
//   GET /api/podcast/:show/today        — newest episode of a show
//                                         (offices use this on the
//                                         chooser + player).
//   GET /api/podcasts/publisher/:pub    — a publisher + its show list
//                                         (registry metadata only; no
//                                         feed fetch, so it's instant).
//   GET /api/podcasts/show/:slug        — a show + its recent episodes
//                                         (fetches + parses the feed,
//                                         cached per show).
//
// Caching: per-feed short TTL. Feeds are light XML; the parse is a few
// regexes. On fetch failure we serve the last good cache (even stale)
// and only fall back to an empty payload when we've never succeeded.
//
// URL entity-decoding: enclosure + image URLs in feeds arrive XML-
// escaped (e.g. ...mp3?a=1&amp;b=2). A literal "&amp;" is a malformed
// URL the browser can't load — so every URL pulled from the XML is run
// through decodeXmlText before we hand it to the client.

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type Show = {
  slug: string;
  title: string;
  artist: string;
  publisher: string; // PUBLISHERS key
  feedUrl: string;
  artwork: string | null;
  // "rss" (default) = standard podcast RSS. "scrape-roundtables" =
  // the Diocese of NC's "Roundtables on Race" page, which has no RSS
  // feed — episodes are MP3s embedded on a WordPress page, so we scrape
  // them (titles + audio URLs) into the same episode shape.
  kind?: "rss" | "scrape-roundtables";
};

// Ordered list of shows per publisher drives the browse grid.
const PUBLISHERS: Record<string, { title: string; emoji: string; showSlugs: string[] }> = {
  "forward-movement": {
    title: "Forward Movement",
    emoji: "📖",
    showSlugs: ["morning-office", "evening-office"],
  },
  cac: {
    title: "Center for Action and Contemplation",
    emoji: "🌵",
    showSlugs: [
      "cac-everything-belongs",
      "cac-turning-to-the-mystics",
      "cac-another-name",
      "cac-learning-how-to-see",
      "cac-practices-learning-to-see",
      "cac-love-period",
      "cac-cosmic-we",
      "cac-homilies",
    ],
  },
  "national-cathedral": {
    title: "Washington National Cathedral",
    emoji: "🟣",
    showSlugs: ["nc-crossroads"],
  },
  vts: {
    title: "Virginia Theological Seminary",
    emoji: "🎓",
    showSlugs: ["vts-love-your-neighbor"],
  },
  "average-episcopalian": {
    title: "The Average Episcopalian",
    emoji: "⛪",
    showSlugs: ["average-episcopalian"],
  },
  "living-church": {
    title: "The Living Church",
    emoji: "📰",
    showSlugs: ["living-church"],
  },
  "diocese-nc": {
    title: "Diocese of North Carolina",
    emoji: "🫱🏽‍🫲🏿",
    showSlugs: ["roundtables-on-race"],
  },
  "and-also-with-you": {
    title: "And Also With You",
    emoji: "🕊️",
    showSlugs: ["and-also-with-you"],
  },
  "yale-fore": {
    title: "Yale Forum on Religion & Ecology",
    emoji: "🌎",
    showSlugs: ["fore-spotlights"],
  },
};

const SHOWS: Record<string, Show> = {
  // ── Forward Movement daily offices ──────────────────────────────────
  "morning-office": {
    slug: "morning-office",
    title: "Daily Morning Prayer",
    artist: "Forward Movement",
    publisher: "forward-movement",
    feedUrl: "https://feeds.megaphone.fm/FDMV7144883457",
    artwork: null,
  },
  "evening-office": {
    slug: "evening-office",
    title: "An Evening at Prayer",
    artist: "Forward Movement",
    publisher: "forward-movement",
    feedUrl: "https://feeds.megaphone.fm/FDMV2784874884",
    artwork: null,
  },
  // ── Center for Action and Contemplation ─────────────────────────────
  "cac-everything-belongs": {
    slug: "cac-everything-belongs",
    title: "Everything Belongs",
    artist: "Center for Action and Contemplation",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC1704856390",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/93/ab/ef/93abef60-62cc-b944-ebee-8a30ce7508ff/mza_15647178321033802345.jpg/600x600bb.jpg",
  },
  "cac-turning-to-the-mystics": {
    slug: "cac-turning-to-the-mystics",
    title: "Turning to the Mystics",
    artist: "James Finley · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC7039433581",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/97/c9/52/97c95240-d332-155a-e2a4-c6a951b3d6f1/mza_6610056226181262829.jpg/600x600bb.jpg",
  },
  "cac-another-name": {
    slug: "cac-another-name",
    title: "Another Name For Every Thing",
    artist: "Richard Rohr · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC4279918867",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/1c/17/2e/1c172e85-cf25-c2c8-aa77-162c7c6d68c9/mza_9011558391357149453.jpg/600x600bb.jpg",
  },
  "cac-learning-how-to-see": {
    slug: "cac-learning-how-to-see",
    title: "Learning How to See",
    artist: "Brian McLaren · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC3846301578",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/cf/ff/bb/cfffbb3b-144c-743c-b707-d051eabbf59e/mza_13929123429956003752.jpg/600x600bb.jpg",
  },
  "cac-practices-learning-to-see": {
    slug: "cac-practices-learning-to-see",
    title: "Practices for Learning How to See",
    artist: "Brian McLaren · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC4203774721",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/bd/06/f2/bd06f237-d464-9cf7-5b5c-bec2b348ef7d/mza_16894994872515457789.jpg/600x600bb.jpg",
  },
  "cac-love-period": {
    slug: "cac-love-period",
    title: "Love Period",
    artist: "Jacqui Lewis · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC7740854822",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/b1/88/59/b1885906-bb3c-5c03-9c01-4cc643489757/mza_10724753065665227728.jpg/600x600bb.jpg",
  },
  "cac-cosmic-we": {
    slug: "cac-cosmic-we",
    title: "The Cosmic We",
    artist: "Barbara Holmes · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC6648912537",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/79/46/12/794612f8-accf-5683-521e-5805da51ae5d/mza_4535843137584053387.jpg/600x600bb.jpg",
  },
  "cac-homilies": {
    slug: "cac-homilies",
    title: "Homilies by Fr. Richard Rohr",
    artist: "Richard Rohr · CAC",
    publisher: "cac",
    feedUrl: "https://feeds.megaphone.fm/CFAC9780328291",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/6c/4b/c4/6c4bc43b-5697-d33d-2f5a-cd9addf702c0/mza_2580995343840293724.jpg/600x600bb.jpg",
  },
  // ── Washington National Cathedral ───────────────────────────────────
  "nc-crossroads": {
    slug: "nc-crossroads",
    title: "Crossroads",
    artist: "Washington National Cathedral",
    publisher: "national-cathedral",
    feedUrl: "https://feed.podbean.com/crossroadsWNC/feed.xml",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/b0/ff/05/b0ff0511-10a5-d169-4e36-a204aa204768/mza_9682335394332764792.jpg/600x600bb.jpg",
  },
  // ── Virginia Theological Seminary ───────────────────────────────────
  "vts-love-your-neighbor": {
    slug: "vts-love-your-neighbor",
    title: "Love Your Neighbor",
    artist: "Ross Kane · VTS",
    publisher: "vts",
    feedUrl: "https://rosskane.com/feed/podcast/",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/61/7b/c0/617bc035-10b1-2044-40f8-41be97f388c7/mza_11235952246385245389.jpg/600x600bb.jpg",
  },
  // ── The Average Episcopalian ────────────────────────────────────────
  "average-episcopalian": {
    slug: "average-episcopalian",
    title: "The Average Episcopalian",
    artist: "Kate Greer & Annie Hodges",
    publisher: "average-episcopalian",
    feedUrl: "https://rss.libsyn.com/shows/350996/destinations/2868101.xml",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/8c/6c/d2/8c6cd27c-a22d-3369-94a1-a1404d50b695/mza_1877788517495835005.png/600x600bb.jpg",
  },
  // ── The Living Church ───────────────────────────────────────────────
  "living-church": {
    slug: "living-church",
    title: "The Living Church Podcast",
    artist: "The Living Church",
    publisher: "living-church",
    feedUrl: "https://feeds.redcircle.com/2583ed91-dcdb-44c3-b2b1-13bff24fe10c",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/ac/d5/fa/acd5fa11-17c0-999d-068d-308ca424c764/mza_9623362144424080574.jpg/600x600bb.jpg",
  },
  // ── Episcopal Diocese of North Carolina ─────────────────────────────
  // No RSS feed — scraped from the diocese's WordPress page.
  "roundtables-on-race": {
    slug: "roundtables-on-race",
    title: "Roundtables on Race",
    artist: "Episcopal Diocese of North Carolina",
    publisher: "diocese-nc",
    feedUrl: "https://episdionc.org/podcast-roundtables-on-race/",
    artwork: null,
    kind: "scrape-roundtables",
  },
  // ── And Also With You ───────────────────────────────────────────────
  "and-also-with-you": {
    slug: "and-also-with-you",
    title: "And Also With You",
    artist: "Lizzie McManus-Dail & Laura Di Panfilo",
    publisher: "and-also-with-you",
    feedUrl: "https://feeds.simplecast.com/2MOSOCPL",
    artwork: "https://image.simplecastcdn.com/images/8bd398a2-dfc3-4662-bb8a-b7e502e69031/8c23cf47-3ad0-4f08-b7d6-81b5b82ca030/3000x3000/aawy-artwork.jpg",
  },
  // ── Yale Forum on Religion & Ecology ────────────────────────────────
  "fore-spotlights": {
    slug: "fore-spotlights",
    title: "FORE Spotlights",
    artist: "Sam Mickey · Yale Forum on Religion & Ecology",
    publisher: "yale-fore",
    feedUrl: "https://rss.buzzsprout.com/1269704.rss",
    artwork: "https://storage.buzzsprout.com/1fuajatyj5gvhanfncdbry3iljeb?.jpg",
  },
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

type EpisodeFull = {
  id: string;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  description: string | null;
  imageUrl: string | null;
};
type ParsedFeed = {
  feedTitle: string | null;
  feedImage: string | null;
  episodes: EpisodeFull[];
};

const TTL_MS = 30 * 60_000;
const cache = new Map<string, { at: number; data: ParsedFeed }>();

function parseDurationSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(t)) return null;
  const parts = t.split(":").map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function decodeXmlText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .trim();
}

// Strip HTML tags from a feed description + collapse whitespace, then
// truncate. Feed descriptions are often full HTML show notes; we only
// want a one/two-line preview on the episode row.
function plainTextPreview(raw: string | null, max = 280): string | null {
  if (!raw) return null;
  const text = decodeXmlText(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function firstMatch(block: string, re: RegExp): string | null {
  const m = block.match(re);
  return m ? m[1] : null;
}

function parseFeed(xml: string, limit: number): ParsedFeed {
  const channelPart = xml.split(/<item[\s>]/)[0] ?? "";
  const feedTitle = firstMatch(channelPart, /<title>([\s\S]*?)<\/title>/);
  const feedImageRaw =
    firstMatch(channelPart, /<itunes:image[^>]*\bhref="([^"]+)"/i) ??
    firstMatch(channelPart, /<image>[\s\S]*?<url>([\s\S]*?)<\/url>/i);

  const episodes: EpisodeFull[] = [];
  const itemRe = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && episodes.length < limit) {
    const item = m[1] ?? "";
    const enclosure = firstMatch(item, /<enclosure[^>]*\burl="([^"]+)"/i);
    if (!enclosure) continue; // no audio → skip (e.g. a text-only post)
    const guid = firstMatch(item, /<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const title = firstMatch(item, /<title>([\s\S]*?)<\/title>/);
    const duration = firstMatch(item, /<itunes:duration>([\s\S]*?)<\/itunes:duration>/i);
    const pub = firstMatch(item, /<pubDate>([\s\S]*?)<\/pubDate>/i);
    const desc =
      firstMatch(item, /<itunes:summary>([\s\S]*?)<\/itunes:summary>/i) ??
      firstMatch(item, /<description>([\s\S]*?)<\/description>/i);
    const itemImage = firstMatch(item, /<itunes:image[^>]*\bhref="([^"]+)"/i);
    episodes.push({
      id: (guid ? decodeXmlText(guid) : null) || decodeXmlText(enclosure),
      title: title ? decodeXmlText(title) : null,
      audioUrl: decodeXmlText(enclosure),
      durationSeconds: parseDurationSeconds(duration),
      publishedAt: pub ? pub.trim() : null,
      description: plainTextPreview(desc),
      imageUrl: itemImage ? decodeXmlText(itemImage) : null,
    });
  }
  return {
    feedTitle: feedTitle ? decodeXmlText(feedTitle) : null,
    feedImage: feedImageRaw ? decodeXmlText(feedImageRaw) : null,
    episodes,
  };
}

// "Roundtables on Race" has no RSS feed — episodes are MP3s embedded on
// a WordPress page, each with a title="RoR – Season N, Episode M: …"
// (or "Season N, …") attribute. Titles and MP3 URLs both appear
// newest-first in document order, so we extract each list (de-duped,
// order-preserving) and zip them by index.
function scrapeRoundtables(html: string, fallbackTitle: string): ParsedFeed {
  const titles: string[] = [];
  const seenTitle = new Set<string>();
  const titleRe = /title="((?:RoR|Season)[^"]+)"/gi;
  let tm: RegExpExecArray | null;
  while ((tm = titleRe.exec(html)) !== null) {
    const t = decodeXmlText(tm[1] ?? "").replace(/^RoR\s*[–—-]\s*/i, "");
    if (t && !seenTitle.has(t)) { seenTitle.add(t); titles.push(t); }
  }
  const urls: string[] = [];
  const seenUrl = new Set<string>();
  const urlRe = /https?:\/\/episdionc\.org\/wp-content\/uploads\/[^"'\s)]+\.mp3/gi;
  let um: RegExpExecArray | null;
  while ((um = urlRe.exec(html)) !== null) {
    const u = um[0];
    if (!seenUrl.has(u)) { seenUrl.add(u); urls.push(u); }
  }
  const episodes: EpisodeFull[] = urls.map((url, i) => ({
    id: url,
    title: titles[i] ?? `Episode ${urls.length - i}`,
    audioUrl: url,
    durationSeconds: null,
    publishedAt: null,
    description: null,
    imageUrl: null,
  }));
  return { feedTitle: fallbackTitle, feedImage: null, episodes };
}

async function loadFeed(show: Show, limit: number): Promise<ParsedFeed> {
  const hit = cache.get(show.slug);
  // Cache stores the largest parse we've done; a small-limit request can
  // be served from a larger cached parse by slicing.
  if (hit && Date.now() - hit.at < TTL_MS && hit.data.episodes.length >= Math.min(limit, 1)) {
    return { ...hit.data, episodes: hit.data.episodes.slice(0, limit) };
  }
  try {
    const res = await fetch(show.feedUrl, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, text/html" },
    });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    const body = await res.text();
    const data = show.kind === "scrape-roundtables"
      ? scrapeRoundtables(body, show.title)
      : parseFeed(body, Math.max(limit, 50));
    cache.set(show.slug, { at: Date.now(), data });
    return { ...data, episodes: data.episodes.slice(0, limit) };
  } catch (err) {
    logger.warn({ err, show: show.slug }, "[podcast] feed fetch failed");
    if (hit) return { ...hit.data, episodes: hit.data.episodes.slice(0, limit) }; // stale
    return { feedTitle: show.title, feedImage: show.artwork, episodes: [] };
  }
}

// ── GET /api/podcast/:show/today — newest episode (offices) ──────────────
router.get("/podcast/:show/today", async (req: Request, res: Response): Promise<void> => {
  const show = SHOWS[String(req.params.show ?? "")];
  if (!show) { res.status(404).json({ error: "Unknown show" }); return; }
  res.setHeader("Cache-Control", "public, max-age=600");
  const feed = await loadFeed(show, 1);
  const ep = feed.episodes[0];
  res.json({
    feedTitle: feed.feedTitle ?? show.title,
    title: ep?.title ?? null,
    audioUrl: ep?.audioUrl ?? null,
    durationSeconds: ep?.durationSeconds ?? null,
    publishedAt: ep?.publishedAt ?? null,
    imageUrl: ep?.imageUrl ?? feed.feedImage ?? show.artwork ?? null,
  });
});

// ── GET /api/podcasts — the full library, grouped by publisher ──────────
// Powers the Discover index. Registry metadata only (no feed fetch), so
// it's instant and long-cacheable. Order follows the PUBLISHERS object's
// declaration order, which is intentionally curated (Forward Movement /
// the offices first).
router.get("/podcasts", (_req: Request, res: Response): void => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    publishers: Object.entries(PUBLISHERS).map(([key, pub]) => ({
      slug: key,
      title: pub.title,
      emoji: pub.emoji,
      shows: pub.showSlugs
        .map((s) => SHOWS[s])
        .filter((s): s is Show => !!s)
        .map((s) => ({ slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork })),
    })),
  });
});

// ── GET /api/podcasts/publisher/:publisher — publisher + show list ───────
router.get("/podcasts/publisher/:publisher", (req: Request, res: Response): void => {
  const key = String(req.params.publisher ?? "");
  const pub = PUBLISHERS[key];
  if (!pub) { res.status(404).json({ error: "Unknown publisher" }); return; }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    slug: key,
    title: pub.title,
    emoji: pub.emoji,
    shows: pub.showSlugs
      .map((s) => SHOWS[s])
      .filter((s): s is Show => !!s)
      .map((s) => ({ slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork })),
  });
});

// ── GET /api/podcasts/show/:slug — show + recent episodes ────────────────
router.get("/podcasts/show/:slug", async (req: Request, res: Response): Promise<void> => {
  const show = SHOWS[String(req.params.slug ?? "")];
  if (!show) { res.status(404).json({ error: "Unknown show" }); return; }
  res.setHeader("Cache-Control", "public, max-age=600");
  const feed = await loadFeed(show, 50);
  const pub = PUBLISHERS[show.publisher];
  res.json({
    show: {
      slug: show.slug,
      title: show.title,
      artist: show.artist,
      artwork: feed.feedImage ?? show.artwork ?? null,
      publisher: show.publisher,
      publisherTitle: pub?.title ?? show.artist,
      emoji: pub?.emoji ?? "🎧",
    },
    episodes: feed.episodes,
  });
});

export default router;
