// Podcast content — shows registry + browse/listen API.
//
// Phoebe hosts a small curated set of podcasts you can browse and play
// IN-APP (think Hallow-style content, not just outbound links):
//   • Forward Movement daily offices (Morning / Evening Prayer, read
//     aloud) — also surfaced on the prayer chooser + offices page.
//   • Center for Action and Contemplation — their full slate of shows.
//   • Washington National Cathedral — the "Crossroads" podcast.
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
import { db, fddAudioMarksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { safeFetch } from "../lib/ssrfGuard";
import { rateLimit } from "../lib/rate-limit";

const router: IRouter = Router();

export type Show = {
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
  // When true, the show's artwork is used as the imageUrl for EVERY
  // episode, ignoring per-episode <itunes:image> tags. Useful when the
  // feed omits episode art (or uses generic imagery) but we have a good
  // canonical portrait for the host — e.g. Bishop Budde's photo.
  overrideEpisodeArtwork?: boolean;
};

// Show-level theme tags (slug → theme keys). A theme search surfaces a
// tagged show + ALL its episodes even when individual episode titles /
// descriptions don't contain the theme's keywords — e.g. "Roundtables
// on Race" is entirely about race/justice, but episode titles like
// "Judaism" or "Season Wrap-up" wouldn't keyword-match on their own.
// Centralized here (rather than a field per show) to keep tagging in
// one place.
const SHOW_THEMES: Record<string, string[]> = {
  "roundtables-on-race": ["justice", "go", "bless"],
  "cac-love-period": ["justice", "bless"],
  "cac-cosmic-we": ["justice", "contemplation", "pray"],
  // Way of Love is literally Bishop Curry's whole subject — tag every stage.
  "way-of-love-curry": ["justice", "prayer", "turn", "learn", "pray", "worship", "bless", "go", "rest"],
  "cac-learning-how-to-see": ["justice", "contemplation", "learn"],
  "cac-turning-to-the-mystics": ["contemplation", "mystics", "pray", "rest"],
  "cac-everything-belongs": ["contemplation", "rest"],
  "cac-another-name": ["contemplation", "pray"],
  // Bishop Budde — discipleship, spiritual practice, encountering Jesus.
  "experiencing-jesus": ["scripture", "prayer", "pray", "learn", "turn", "worship"],
  "morning-office": ["pray", "worship"],
  "evening-office": ["pray", "worship", "rest"],
  "nc-crossroads": ["learn", "worship"],
  "living-church": ["learn", "worship"],
  "national-cathedral-sermons": ["learn", "worship"],
  "ssje-sermons": ["learn", "worship"],
  "grace-church-nyc": ["learn", "worship"],
  "forward-day-by-day": ["pray", "learn"],
  "scripture-day-by-day": ["pray", "learn", "scripture"],
};
function showThemes(slug: string): string[] {
  return SHOW_THEMES[slug] ?? [];
}

// Ordered list of shows per publisher drives the browse grid.
// Browse-grid order (publisher object insertion order drives the cascade):
//   Way of Love → Sermons → Forward → From around the church → CAC.
// The offices publisher stays first but is filtered out of Discover (both its
// shows are HIDDEN_FROM_DISCOVER), so it never renders a section.
const PUBLISHERS: Record<string, { title: string; emoji: string; showSlugs: string[] }> = {
  "forward-movement": {
    title: "Forward Movement",
    emoji: "📖",
    showSlugs: ["morning-office", "evening-office"],
  },
  // Way of Love — The Episcopal Church's Rule of Life. Leads the grid; the
  // first two shows are Bishop Budde's rule-of-life series and Presiding
  // Bishop Curry's Way of Love.
  "way-of-love": {
    title: "Way of Love",
    emoji: "❤️",
    showSlugs: [
      "experiencing-jesus",
      "way-of-love-curry",
    ],
  },
  // Sermons — preaching from around the Episcopal world.
  sermons: {
    title: "Sermons",
    emoji: "🎙️",
    showSlugs: [
      "national-cathedral-sermons",
      "grace-church-nyc",
    ],
  },
  // Forward — Forward Movement's daily devotionals (Forward Day by Day +
  // Scripture Day by Day).
  "forward-movement-shows": {
    title: "Forward",
    emoji: "📖",
    showSlugs: [
      "forward-day-by-day",
      "scripture-day-by-day",
    ],
  },
  // From around the church — the rest of the Episcopal-world shows.
  "around-the-church": {
    title: "From around the church",
    emoji: "⛪",
    showSlugs: [
      "green-lectionary",
      "nc-crossroads",
      "roundtables-on-race",
      "living-church",
    ],
  },
  cac: {
    title: "Center for Action and Contemplation",
    emoji: "🌵",
    showSlugs: [
      "cac-everything-belongs",
      "cac-turning-to-the-mystics",
      "cac-another-name",
      "cac-learning-how-to-see",
      "cac-love-period",
      "cac-cosmic-we",
    ],
  },
};

// Shows that power the daily offices on the prayer chooser / office
// player. They have their own home there, so we keep them OUT of the
// Discover browse + search — the SHOWS entries stay (so
// /podcast/:show/today still serves them), they're just not listed.
const HIDDEN_FROM_DISCOVER = new Set<string>(["morning-office", "evening-office", "ssje-sermons"]);

// Individual episodes hidden by title (matched apostrophe- and
// whitespace-insensitively). Filtered out when the feed is parsed, so
// they never surface in the show list, search, or "today".
function normEpisodeTitle(t: string): string {
  return t.toLowerCase().replace(/[‘’']/g, "").replace(/\s+/g, " ").trim();
}
const HIDDEN_EPISODE_TITLES = new Set<string>([
  normEpisodeTitle("The Presiding Bishop's Christmas Message: A Sign for You"),
]);
function isHiddenEpisode(title: string | null): boolean {
  return !!title && HIDDEN_EPISODE_TITLES.has(normEpisodeTitle(title));
}

// Thematic filter pills for the Discover page. Each searches episode
// titles + descriptions across the whole library for ANY of its
// keywords (case-insensitive substring). Keywords are deliberately
// broad/stemmed (e.g. "contempl" catches contemplate/contemplation/
// contemplative).
const THEMES: Array<{ key: string; label: string; emoji: string; keywords: string[] }> = [
  // ── Way of Love — the 7 stages of The Episcopal Church's Rule of Life ──
  // These surface as the primary suggestion pills on the podcast Discover
  // page. Keywords are intentionally broad so they catch episode-level
  // matching even when a show isn't explicitly tagged.
  { key: "turn", label: "Turn", emoji: "🔄",
    keywords: ["repent", "return", "conversion", "transform", "renewal", "new life", "metanoia", "turning", "begin again", "reconcil", "confession"] },
  { key: "learn", label: "Learn", emoji: "📖",
    keywords: ["formation", "discipleship", "study", "discern", "education", "catechesis", "scripture", "gospel", "bible", "lectionary", "reading", "teaching", "baptism", "confirmation"] },
  { key: "pray", label: "Pray", emoji: "🙏",
    keywords: ["prayer", "pray", "contemplat", "intercession", "spiritual practice", "daily office", "morning prayer", "evening prayer", "compline", "vespers", "rule of life", "examen", "rosary"] },
  { key: "worship", label: "Worship", emoji: "⛪",
    keywords: ["worship", "eucharist", "liturgy", "preach", "sermon", "sunday", "praise", "hymn", "sacrament", "communion", "gathering", "mass", "rite", "blessing"] },
  { key: "bless", label: "Bless", emoji: "🤲",
    keywords: ["bless", "neighbor", "welcome", "hospitality", "generosity", "stewardship", "tithe", "community", "service", "care", "beloved"] },
  { key: "go", label: "Go", emoji: "🌍",
    keywords: ["mission", "witness", "justice", "reconcil", "outreach", "evangelism", "serve", "immigrant", "poverty", "racial", "equity", "liberation", "peace"] },
  { key: "rest", label: "Rest", emoji: "🌙",
    keywords: ["sabbath", "rest", "retreat", "sabbatical", "solitude", "silence", "renewal", "delight", "play", "joy", "nature", "creation", "stillness", "sabbath"] },
  // ── Deeper thematic search (still used by future search UI if needed) ──
  { key: "contemplation", label: "Contemplation", emoji: "🕯️",
    keywords: ["contempl", "silence", "mystic", "meditat", "stillness", "presence", "centering prayer", "solitude"] },
  { key: "justice", label: "Justice & Race", emoji: "🫱🏽‍🫲🏿",
    keywords: ["justice", "race", "racism", "racial", "poverty", "oppress", "liberation", "equity", "beloved community", "reparation", "immigra"] },
  { key: "scripture", label: "Scripture", emoji: "📖",
    keywords: ["scripture", "gospel", "bible", "biblical", "psalm", "lectionary", "epistle", "parable", "exodus", "genesis"] },
  { key: "creation", label: "Creation", emoji: "🌎",
    keywords: ["creation", "ecolog", "earth", "climate", "environment", "nature", "creature", "land", "wilderness", "season"] },
  { key: "mystics", label: "Saints & Mystics", emoji: "😇",
    keywords: ["mystic", "saint", "merton", "julian of norwich", "teresa", "john of the cross", "francis", "desert", "hildegard", "eckhart", "thérèse", "therese"] },
  { key: "healing", label: "Grief & Healing", emoji: "🕊️",
    keywords: ["grief", "loss", "healing", "lament", "suffering", "comfort", "wholeness", "trauma", "mourning", "death"] },
  { key: "prayer", label: "Prayer", emoji: "🙏",
    keywords: ["prayer", "pray", "intercession", "examen", "rule of life", "spiritual practice", "morning prayer", "evening prayer", "compline"] },
];

export const SHOWS: Record<string, Show> = {
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
  // ── Creation Justice Ministries — The Green Lectionary ──────────────
  "green-lectionary": {
    slug: "green-lectionary",
    title: "The Green Lectionary Podcast",
    artist: "Creation Justice Ministries",
    publisher: "around-the-church",
    feedUrl: "https://feed.podbean.com/greenlectionary/feed.xml",
    artwork: "/podcast-art/green-lectionary.jpg",
  },
  // ── Washington National Cathedral ───────────────────────────────────
  "nc-crossroads": {
    slug: "nc-crossroads",
    title: "Crossroads with Dean Randy Hollerith",
    artist: "Washington National Cathedral",
    publisher: "around-the-church",
    feedUrl: "https://feed.podbean.com/crossroadsWNC/feed.xml",
    artwork: "/podcast-art/nc-crossroads.jpg",
  },
  // ── Diocese of Washington — Bishop Mariann Budde ────────────────────
  "experiencing-jesus": {
    slug: "experiencing-jesus",
    title: "Introduction to The Way of Love",
    artist: "Diocese of Washington",
    publisher: "way-of-love",
    feedUrl: "https://feeds.simplecast.com/1CBZhkXf",
    artwork: "/podcast-art/budde.jpg",
    // Use her portrait for every episode — the feed provides no per-episode
    // art and the generic show graphic is less recognizable than her face.
    overrideEpisodeArtwork: true,
  },
  // ── The Episcopal Church — Presiding Bishop Michael Curry ───────────
  "way-of-love-curry": {
    slug: "way-of-love-curry",
    title: "The Way of Love with Bishop Michael Curry",
    artist: "The Episcopal Church",
    publisher: "way-of-love",
    feedUrl: "https://feeds.megaphone.fm/the-way-of-love",
    artwork: "/podcast-art/curry.jpg",
  },
  // ── The Living Church ───────────────────────────────────────────────
  "living-church": {
    slug: "living-church",
    title: "The Living Church Podcast",
    artist: "The Living Church",
    publisher: "around-the-church",
    feedUrl: "https://feeds.redcircle.com/2583ed91-dcdb-44c3-b2b1-13bff24fe10c",
    artwork: "/podcast-art/living-church.jpg",
  },
  // ── Episcopal Diocese of North Carolina ─────────────────────────────
  // No RSS feed — scraped from the diocese's WordPress page.
  "roundtables-on-race": {
    slug: "roundtables-on-race",
    title: "Roundtables on Race",
    artist: "Episcopal Diocese of North Carolina",
    publisher: "around-the-church",
    feedUrl: "https://episdionc.org/podcast-roundtables-on-race/",
    artwork: "/podcast-art/roundtables.jpg",
    kind: "scrape-roundtables",
  },
  // ── Forward + affiliated podcasts (Discover section under CAC) ──────
  "forward-day-by-day": {
    slug: "forward-day-by-day",
    title: "Forward Day by Day",
    artist: "Forward Movement",
    publisher: "forward-movement-shows",
    feedUrl: "https://feeds.megaphone.fm/forwarddaybyday",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/b5/43/37/b5433758-400b-4d1b-c397-d3e6190ea0e7/mza_10011273729972074725.jpg/600x600bb.jpg",
  },
  // Grace Church in New York — preaching from the Episcopal parish in
  // Greenwich Village (Broadway at 10th, a Greenwich Village fixture since 1846).
  // SoundCloud-hosted audio feed.
  "grace-church-nyc": {
    slug: "grace-church-nyc",
    title: "Grace Church in New York",
    artist: "Grace Church in New York",
    publisher: "sermons",
    feedUrl: "https://feeds.soundcloud.com/users/soundcloud:users:666827156/sounds.rss",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/21/b8/b5/21b8b58d-7660-78b9-581e-a0266581e72f/mza_5763349292259453824.jpg/600x600bb.jpg",
  },
  // SSJE Sermons — preaching from the Society of Saint John the Evangelist
  // (the Cambridge MA Episcopal monastery). WordPress/Blubrry audio feed.
  "ssje-sermons": {
    slug: "ssje-sermons",
    title: "SSJE Sermons",
    artist: "Society of Saint John the Evangelist",
    publisher: "around-the-church",
    feedUrl: "https://www.ssje.org/category/sermon/feed/",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/7c/c6/91/7cc69120-abbd-ab9f-b7fd-6e8cb8c7c4ab/mza_6967511385700327856.jpg/600x600bb.jpg",
  },
  // Sermons by Washington National Cathedral — Sunday + feast-day preaching.
  "national-cathedral-sermons": {
    slug: "national-cathedral-sermons",
    title: "National Cathedral Sermons",
    artist: "Washington National Cathedral",
    publisher: "sermons",
    feedUrl: "https://feed.podbean.com/nationalcathedral/feed.xml",
    artwork: "https://pbcdn1.podbean.com/imglogo/image-logo/5314698/Sermons_by_WNC6eo25.jpg",
  },
  // Scripture Day by Day — Fr. Wiley Ammons reads the day's lectionary
  // scripture aloud. Forward Movement / Megaphone, a fresh daily episode.
  "scripture-day-by-day": {
    slug: "scripture-day-by-day",
    title: "Scripture Day by Day",
    artist: "Forward Movement",
    publisher: "forward-movement-shows",
    feedUrl: "https://feeds.megaphone.fm/scripturedbd",
    artwork: "https://megaphone.imgix.net/podcasts/7bdb8cac-f23e-11ec-bd3d-6b7860fd93ef/image/RCL-bg.jpg?ixlib=rails-4.3.1&max-w=600&max-h=600&fit=crop&auto=format,compress",
  },
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type EpisodeFull = {
  id: string;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  description: string | null;
  imageUrl: string | null;
  // <itunes:season> — CAC's shows use this to mark which teaching series
  // (e.g. which mystic, which Rohr book) an episode belongs to. Most other
  // shows in the registry don't set it, so this is null there.
  season: number | null;
};
export type ParsedFeed = {
  feedTitle: string | null;
  feedImage: string | null;
  feedDescription: string | null;
  episodes: EpisodeFull[];
};

const TTL_MS = 30 * 60_000;
const cache = new Map<string, { at: number; data: ParsedFeed }>();

// Feed fetches hit fixed, trusted hosts (the static SHOWS registry — never a
// user-supplied URL), so this isn't an SSRF surface. These bounds are
// availability hardening: a hung or oversized trusted feed must not stall a
// request thread or exhaust memory. Feeds are light XML, so 8 MB / 10 s is
// generous headroom.
const FEED_TIMEOUT_MS = 10_000;
const FEED_MAX_BYTES = 8 * 1024 * 1024;

export async function fetchFeedText(url: string): Promise<string> {
  // SSRF-safe: follow redirects manually, re-validating each hop against the
  // public-address allowlist. Feeds can be user-supplied (weekly-plan episode
  // resolve), so a 30x to 169.254.169.254 / 127.0.0.1 / an internal host must
  // never be followed. safeFetch enforces assertPublicHttpUrl on every hop and
  // owns the request timeout.
  const res = await safeFetch(url, {
    timeoutMs: FEED_TIMEOUT_MS,
    headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, text/html" },
  });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  // Reject early when the server declares an oversized body…
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > FEED_MAX_BYTES) {
    throw new Error(`feed too large: ${declared} bytes`);
  }
  // …and bound the actual read too, since Content-Length can be absent
  // (chunked) or lie. Stream the body and stop once the cap is exceeded.
  const reader = res.body?.getReader();
  if (!reader) return await res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > FEED_MAX_BYTES) {
        await reader.cancel();
        throw new Error("feed exceeded size cap");
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function parseDurationSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(t)) return null;
  const parts = t.split(":").map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

function fromCodePoint(cp: number): string {
  try { return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""; } catch { return ""; }
}
function decodeXmlText(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    // Numeric character refs — without these, en-dashes / curly quotes
    // leak as literal "&#8211;" / "&#8217;" in episode titles.
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCodePoint(parseInt(d, 10)))
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

export function parseFeed(xml: string, limit: number): ParsedFeed {
  const channelPart = xml.split(/<item[\s>]/)[0] ?? "";
  const feedTitle = firstMatch(channelPart, /<title>([\s\S]*?)<\/title>/);
  const feedImageRaw =
    firstMatch(channelPart, /<itunes:image[^>]*\bhref="([^"]+)"/i) ??
    firstMatch(channelPart, /<image>[\s\S]*?<url>([\s\S]*?)<\/url>/i);
  // Channel-level blurb for the show header — same cleanup as episode
  // descriptions (decode entities + CDATA, strip HTML, truncate).
  const feedDescRaw =
    firstMatch(channelPart, /<itunes:summary>([\s\S]*?)<\/itunes:summary>/i) ??
    firstMatch(channelPart, /<description>([\s\S]*?)<\/description>/i);

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
    const seasonRaw = firstMatch(item, /<itunes:season>([\s\S]*?)<\/itunes:season>/i);
    const season = seasonRaw && /^\d+$/.test(seasonRaw.trim()) ? parseInt(seasonRaw.trim(), 10) : null;
    const decodedTitle = title ? decodeXmlText(title) : null;
    if (isHiddenEpisode(decodedTitle)) continue; // blocklisted episode
    episodes.push({
      id: (guid ? decodeXmlText(guid) : null) || decodeXmlText(enclosure),
      title: decodedTitle,
      audioUrl: decodeXmlText(enclosure),
      durationSeconds: parseDurationSeconds(duration),
      publishedAt: pub ? pub.trim() : null,
      description: plainTextPreview(desc),
      imageUrl: itemImage ? decodeXmlText(itemImage) : null,
      season,
    });
  }
  return {
    feedTitle: feedTitle ? decodeXmlText(feedTitle) : null,
    feedImage: feedImageRaw ? decodeXmlText(feedImageRaw) : null,
    feedDescription: plainTextPreview(feedDescRaw, 360),
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
    season: null,
  }));
  return { feedTitle: fallbackTitle, feedImage: null, feedDescription: null, episodes };
}

// Apply show-level artwork overrides to a parsed feed — called after
// every fetch/parse and before caching, so the override is baked in and
// callers never need to think about it.
function applyShowOverrides(data: ParsedFeed, show: Show): ParsedFeed {
  if (!show.overrideEpisodeArtwork || !show.artwork) return data;
  const art = show.artwork;
  return {
    ...data,
    episodes: data.episodes.map((ep) => ({ ...ep, imageUrl: art })),
  };
}

export async function loadFeed(show: Show, limit: number): Promise<ParsedFeed> {
  const hit = cache.get(show.slug);
  // Cache stores the largest parse we've done; a small-limit request can
  // be served from a larger cached parse by slicing.
  if (hit && Date.now() - hit.at < TTL_MS && hit.data.episodes.length >= Math.min(limit, 1)) {
    return { ...hit.data, episodes: hit.data.episodes.slice(0, limit) };
  }
  try {
    const body = await fetchFeedText(show.feedUrl);
    const parsed = show.kind === "scrape-roundtables"
      ? scrapeRoundtables(body, show.title)
      : parseFeed(body, Math.max(limit, 50));
    const data = applyShowOverrides(parsed, show);
    cache.set(show.slug, { at: Date.now(), data });
    return { ...data, episodes: data.episodes.slice(0, limit) };
  } catch (err) {
    logger.warn({ err, show: show.slug }, "[podcast] feed fetch failed");
    if (hit) return { ...hit.data, episodes: hit.data.episodes.slice(0, limit) }; // stale
    return { feedTitle: show.title, feedImage: show.artwork, feedDescription: null, episodes: [] };
  }
}

// Church of England — "Daily Prayer: Common Worship Morning and Evening
// Prayer." ONE Captivate feed carries BOTH offices: two episodes a day,
// titled "… Morning Prayer …" (published ~00:15 UK) and "… Evening
// Prayer …" (~12:00 UK). Unlike Forward Movement (a separate feed per
// office) we load the combined feed and filter by title to pull the
// office the player asked for. Not browsed directly, so it isn't in
// SHOWS / PUBLISHERS — it's only reachable via ?source=church-of-england
// on the office /today endpoint below.
const COE_DAILY_PRAYER_FEED = "https://feeds.captivate.fm/cofe-daily-prayer/";
const COE_SHOW: Show = {
  slug: "coe-daily-prayer",
  title: "Daily Prayer",
  artist: "Church of England",
  publisher: "forward-movement",
  feedUrl: COE_DAILY_PRAYER_FEED,
  artwork: null,
};

// "Gregory" — The Daily Office Chanted: the Episcopal Daily Office sung in
// plainchant. Like the Church of England feed, ONE combined feed carries all
// the day's offices (Morning Prayer ~3am, Evening Prayer ~3pm, Compline ~6pm),
// each episode titled by its office, so we load the feed and filter by title.
const GREGORY_FEED = "https://feed.podbean.com/thedailyofficechanted/feed.xml";
const GREGORY_SHOW: Show = {
  slug: "gregory-daily-office",
  title: "The Daily Office Chanted",
  artist: "The Daily Office Chanted",
  publisher: "forward-movement",
  feedUrl: GREGORY_FEED,
  artwork: "https://pbcdn1.podbean.com/imglogo/image-logo/21622684/Logo_2048x2048.jpg",
};

// Sources whose feed carries BOTH offices in one channel, filtered by episode
// title (vs Forward Movement's separate feed per office). Keyed by the client's
// ?source= value.
const COMBINED_OFFICE_SOURCES: Record<string, { show: Show; feedTitle: string }> = {
  "church-of-england": { show: COE_SHOW, feedTitle: "Daily Prayer · Church of England" },
  "gregory": { show: GREGORY_SHOW, feedTitle: "The Daily Office Chanted" },
};

// ── GET /api/podcast/:show/today — newest episode (offices) ──────────────
// ?source=church-of-england swaps the Forward Movement office feed for
// the Church of England's Common Worship audio for the same office. Any
// other / missing source keeps the existing Forward Movement behaviour,
// so older clients are unaffected.
router.get("/podcast/:show/today", async (req: Request, res: Response): Promise<void> => {
  const slug = String(req.params.show ?? "");
  const show = SHOWS[slug];
  if (!show) { res.status(404).json({ error: "Unknown show" }); return; }
  res.setHeader("Cache-Control", "public, max-age=600");

  const source = String(req.query.source ?? "forward-movement");
  const isOffice = slug === "morning-office" || slug === "evening-office";
  const combined = COMBINED_OFFICE_SOURCES[source];
  if (combined && isOffice) {
    // Combined-feed sources (Church of England, Gregory) carry both offices in
    // one channel. Pull a handful of the newest episodes and pick the first
    // whose title names this office — robust to the morning/evening/compline
    // ordering within the day (today's later offices sit above today's morning).
    const feed = await loadFeed(combined.show, 10);
    const want = slug === "morning-office" ? "morning prayer" : "evening prayer";
    const ep = feed.episodes.find((e) => (e.title ?? "").toLowerCase().includes(want)) ?? null;
    res.json({
      feedTitle: combined.feedTitle,
      title: ep?.title ?? null,
      audioUrl: ep?.audioUrl ?? null,
      durationSeconds: ep?.durationSeconds ?? null,
      publishedAt: ep?.publishedAt ?? null,
      // Offices: prefer the show's channel cover over the per-episode image —
      // these feeds give each episode a generic image, not the show cover.
      imageUrl: feed.feedImage ?? ep?.imageUrl ?? null,
    });
    return;
  }

  const feed = await loadFeed(show, 1);
  const ep = feed.episodes[0];

  // Forward Day by Day: attach the precomputed skip-marks (scripture start +
  // donation-appeal start) so Reflect & Sit can skip the intro/outro. Matched
  // to today's episode by guid; absent until the worker has analyzed it (and
  // it stays absent when transcription isn't provisioned — the client then
  // just plays the whole episode).
  let scriptureStartSec: number | null = null;
  let appealStartSec: number | null = null;
  if (slug === "forward-day-by-day") {
    try {
      const guid = ep?.id ?? ep?.audioUrl ?? null;
      const today = new Date().toISOString().slice(0, 10);
      const [mark] = await db
        .select()
        .from(fddAudioMarksTable)
        .where(eq(fddAudioMarksTable.episodeDate, today));
      if (mark && mark.status === "done" && (mark.episodeGuid == null || mark.episodeGuid === guid)) {
        scriptureStartSec = mark.scriptureStartSec;
        appealStartSec = mark.appealStartSec;
      } else if (!mark || mark.status === "pending") {
        // On-demand fallback (no worker): kick off the transcribe+detect in
        // the background so a later poll / the next open gets the marks. The
        // dynamic import breaks a circular dependency — buildFddAlignment
        // imports SHOWS/loadFeed from this file.
        const { triggerOnce } = await import("../lib/transcription/alignInFlight");
        const { buildFddAlignment } = await import("../lib/transcription/buildFddAlignment");
        triggerOnce(`fdd:${today}`, () => buildFddAlignment());
      }
    } catch (err) {
      logger.warn({ err }, "[podcast] fdd marks lookup failed");
    }
  }

  res.json({
    feedTitle: feed.feedTitle ?? show.title,
    title: ep?.title ?? null,
    audioUrl: ep?.audioUrl ?? null,
    durationSeconds: ep?.durationSeconds ?? null,
    publishedAt: ep?.publishedAt ?? null,
    // Offices show the recognizable channel cover (their per-episode art is
    // a generic image); other shows keep their per-episode image.
    imageUrl: isOffice
      ? (feed.feedImage ?? show.artwork ?? ep?.imageUrl ?? null)
      : (ep?.imageUrl ?? feed.feedImage ?? show.artwork ?? null),
    scriptureStartSec,
    appealStartSec,
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
    publishers: Object.entries(PUBLISHERS)
      .map(([key, pub]) => ({
        slug: key,
        title: pub.title,
        emoji: pub.emoji,
        shows: pub.showSlugs
          .map((s) => SHOWS[s])
          .filter((s): s is Show => !!s && !HIDDEN_FROM_DISCOVER.has(s.slug))
          .map((s) => ({ slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork })),
      }))
      .filter((p) => p.shows.length > 0),
    // Thematic filter pills for the Discover page. Tapping one runs an
    // episode search across the whole library (see /podcasts/search).
    themes: THEMES.map((t) => ({ key: t.key, label: t.label, emoji: t.emoji })),
  });
});

// Relevancy score for a free-text query against an episode/show. A title
// hit outweighs a body hit; a leading/exact match outweighs a mid-string
// one; repeated body mentions add a small capped boost. Returns 0 when q
// is empty (theme-only search keeps its recency ordering).
function relevance(q: string, title: string, body: string): number {
  if (!q) return 0;
  const t = title.toLowerCase();
  const b = body.toLowerCase();
  let score = 0;
  if (t.includes(q)) {
    score += 10;
    if (t.startsWith(q)) score += 6;
    if (t === q) score += 10;
  }
  if (b.includes(q)) {
    score += 3;
    if (q.length >= 3) score += Math.min(b.split(q).length - 1, 5);
  }
  return score;
}

// ── GET /api/podcasts/search — search SHOWS + EPISODES ───────────────────
// `?q=` is free-text; `?theme=` is one of the THEMES keys. Either or both
// (AND-combined). Episodes are matched on title + description across the
// whole library; shows on title/artist (free-text only). Loads every
// feed (cached per show) in parallel — the first search warms the cache,
// the rest are instant.
// Unauthenticated (search is open to guests) — rate-limited per IP so it
// can't be used to force repeated cache-miss feed fetches. Feed loads are
// cached (loadFeed, TTL-based) so a single warm search is cheap, but a
// scripted client sending many distinct queries in a burst before the
// cache warms would otherwise cost unbounded outbound fetches.
router.get("/podcasts/search", rateLimit({
  name: "podcasts_search",
  max: 60,
  windowMs: 60 * 1000,
  message: "Too many searches — please slow down and try again shortly.",
}), async (req: Request, res: Response): Promise<void> => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const themeKey = String(req.query.theme ?? "").trim();
  const theme = THEMES.find((t) => t.key === themeKey) ?? null;
  res.setHeader("Cache-Control", "public, max-age=300");

  if (!q && !theme) { res.json({ shows: [], episodes: [] }); return; }

  // Matching shows: free-text matches on title/artist, PLUS shows tagged
  // with the active theme (so a thematically-relevant show like
  // "Roundtables on Race" surfaces under "Justice & Race" even though
  // its episode titles don't keyword-match).
  const showMatches = Object.values(SHOWS)
    .filter((s) => {
      if (HIDDEN_FROM_DISCOVER.has(s.slug)) return false;
      if (q && (s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q))) return true;
      if (theme && showThemes(s.slug).includes(theme.key)) return true;
      return false;
    })
    .sort((a, b) => relevance(q, b.title, b.artist) - relevance(q, a.title, a.artist))
    .map((s) => ({ slug: s.slug, title: s.title, artist: s.artist, artwork: s.artwork }));

  // Aggregate episodes across all shows (cached feeds), filtered by q AND
  // theme (whichever are set). Office shows are excluded — they live on
  // the office screen, not in the podcast library.
  const all = Object.values(SHOWS).filter((s) => !HIDDEN_FROM_DISCOVER.has(s.slug));
  const feeds = await Promise.all(all.map(async (s) => {
    try { return { s, f: await loadFeed(s, 50) }; }
    catch { return { s, f: { feedTitle: null, feedImage: null, feedDescription: null, episodes: [] as EpisodeFull[] } }; }
  }));

  type Hit = EpisodeFull & { show: { slug: string; title: string; artist: string; artwork: string | null } };
  const scored: Array<{ hit: Hit; score: number }> = [];
  for (const { s, f } of feeds) {
    const showArt = f.feedImage ?? s.artwork ?? null;
    // A whole show tagged with the active theme contributes ALL its
    // episodes (covers shows whose episode titles don't keyword-match).
    const showTagged = !!theme && showThemes(s.slug).includes(theme.key);
    for (const ep of f.episodes) {
      const hay = `${ep.title ?? ""} ${ep.description ?? ""}`.toLowerCase();
      const matchesQ = !q || hay.includes(q);
      const matchesTheme = !theme || showTagged || theme.keywords.some((k) => hay.includes(k));
      if (matchesQ && matchesTheme) {
        scored.push({
          hit: { ...ep, show: { slug: s.slug, title: s.title, artist: s.artist, artwork: showArt } },
          score: relevance(q, ep.title ?? "", ep.description ?? ""),
        });
      }
    }
  }
  // Free-text: rank by relevancy, recency as tiebreaker. Theme-only (no
  // q): pure recency. Cap so a broad theme doesn't return hundreds.
  scored.sort((a, b) => {
    if (q && b.score !== a.score) return b.score - a.score;
    return new Date(b.hit.publishedAt ?? 0).getTime() - new Date(a.hit.publishedAt ?? 0).getTime();
  });

  res.json({ shows: showMatches, episodes: scored.slice(0, 80).map((x) => x.hit) });
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
      publisherTitle: pub?.title || show.artist,
      emoji: pub?.emoji ?? "🎧",
      description: feed.feedDescription ?? null,
    },
    episodes: feed.episodes,
  });
});

// Some CAC shows (e.g. "Turning to the Mystics") dedicate each whole season
// to one named subject — a mystic, a book — so a bare "Season 6" undersells
// what's actually there ("Julian of Norwich"). Episode titles usually name
// that subject somewhere ("Julian of Norwich: Listener Questions", "A
// Coaching Session on Brother Lawrence", …), so we extract the leading
// name-like phrase from each title, take the season's most frequent
// candidate, and only trust it when it's a clear majority — other shows
// (e.g. "Another Name For Every Thing") mix several guests/topics per
// season with no single dominant subject, and a low-confidence guess there
// would be worse than just "Season N".
const SEASON_NAME_STOP = /^(bonus|dialogue \d+|a coaching session|listener questions|introduction|part \d+|session \d+|the practice|questions about|coming soon)/i;
function seasonNameCandidates(title: string): string[] {
  const out: string[] = [];
  const leading = title.match(/^([A-Z][\w.'’ ]{2,40}?):\s/);
  if (leading && !SEASON_NAME_STOP.test(leading[1])) out.push(leading[1].trim());
  const onPhrase = title.match(/\bon ([A-Z][\w.'’]+(?: [A-Z][\w.'’]+){0,3})\b/);
  if (onPhrase) out.push(onPhrase[1].trim());
  const studyingPhrase = title.match(/\bStudying ([A-Z][\w.'’]+(?: [A-Z][\w.'’]+){0,3})/);
  if (studyingPhrase) out.push(studyingPhrase[1].trim());
  return out;
}
function deriveSeasonName(episodes: EpisodeFull[]): string | null {
  const counts = new Map<string, number>();
  for (const ep of episodes) {
    if (!ep.title) continue;
    for (const name of seasonNameCandidates(ep.title)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) { best = name; bestCount = count; }
  }
  // Require real majority support, not just "mentioned more than others" —
  // a single stray match out of 15 episodes shouldn't become the label.
  if (best && episodes.length > 0 && bestCount >= 3 && bestCount / episodes.length >= 0.3) {
    return best;
  }
  return null;
}

// ── GET /api/podcasts/cac/courses — CAC shows grouped into season "courses" ──
// Beta feature. CAC's own shows tag episodes with <itunes:season> (each
// season is one teaching series — a mystic, a Rohr book, …); we group by
// season and hand back one "course" per (show, season), oldest episode
// first, so the client can walk it Coursera-style using the existing
// course-progress + podcast-player plumbing (see PlayingEpisode.courseComplete,
// the same mechanism way-of-love-course.tsx already uses).
export type CacCourse = {
  id: string;
  showSlug: string;
  showTitle: string;
  author: string;
  artwork: string | null;
  season: number;
  title: string;
  episodes: EpisodeFull[];
};

router.get("/podcasts/cac/courses", async (_req: Request, res: Response): Promise<void> => {
  res.setHeader("Cache-Control", "public, max-age=600");
  const showSlugs = PUBLISHERS.cac?.showSlugs ?? [];
  const courses: CacCourse[] = [];
  // Fetch all 6 shows' feeds concurrently — each is an independent external
  // request, so awaiting them one at a time in a for-loop meant a cold cache
  // (server just started, or the 30-min per-show TTL lapsed) paid the sum of
  // all 6 round-trips instead of just the slowest one.
  const showsWithFeeds = await Promise.all(
    showSlugs
      .map((slug) => SHOWS[slug])
      .filter((show): show is Show => !!show)
      .map(async (show) => ({ show, feed: await loadFeed(show, 400) })),
  );
  for (const { show, feed } of showsWithFeeds) {
    const slug = show.slug;
    // Prefer the curated SHOWS registry artwork over the feed's own channel
    // image — most CAC shows' feeds match it anyway, but "Love Period"'s
    // Podbean feed serves a different (non-branded) channel logo that broke
    // the otherwise-consistent CAC cover look across the course grid.
    const artwork = show.artwork ?? feed.feedImage ?? null;
    // Some feeds tag every real episode with a season but leave trailers /
    // bonus one-offs untagged — grouping those under a fabricated "Season 1"
    // would invent a season that never existed (e.g. a show whose real
    // seasons start at 3). So: if ANY episode in the feed carries a season
    // tag, drop the untagged stragglers entirely (they're still reachable
    // via the normal /podcasts/show browse page, just not as a "course").
    // Only when a show has NO season tags at all do we fall back to one
    // single course covering the whole feed, so nothing goes unorganized.
    const anyTagged = feed.episodes.some((ep) => ep.season !== null);
    const bySeason = new Map<number, EpisodeFull[]>();
    for (const ep of feed.episodes) {
      if (ep.season === null) {
        if (anyTagged) continue; // untagged straggler — skip, not a real season
        const list = bySeason.get(1) ?? [];
        list.push(ep);
        bySeason.set(1, list);
        continue;
      }
      const list = bySeason.get(ep.season) ?? [];
      list.push(ep);
      bySeason.set(ep.season, list);
    }
    const seasons = [...bySeason.keys()].sort((a, b) => a - b);
    for (const season of seasons) {
      // The feed lists newest-first; a course plays oldest-first.
      const episodes = [...(bySeason.get(season) ?? [])].reverse();
      if (episodes.length === 0) continue;
      const seasonName = seasons.length > 1 ? deriveSeasonName(episodes) : null;
      courses.push({
        id: `${slug}-s${season}`,
        showSlug: slug,
        showTitle: show.title,
        author: show.artist,
        artwork,
        season,
        title: seasons.length <= 1 ? show.title : seasonName ? `Season ${season}: ${seasonName}` : `Season ${season}`,
        episodes,
      });
    }
  }
  res.json({ courses });
});

export default router;
