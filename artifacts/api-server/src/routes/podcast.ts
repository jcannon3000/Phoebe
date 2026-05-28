// Daily office podcast metadata.
//
// Forward Movement publishes the BCP 1979 daily offices as audio — the
// full order of Morning / Evening Prayer, read aloud, a new episode
// every day. We surface them as options on the prayer chooser (morning
// show before noon, evening show after) and play them inline on
// /podcast/:show; this endpoint resolves TODAY'S episode for a show so
// the player has an audio URL + the chooser can show a duration badge.
//
// Resolution: each show publishes a standard podcast RSS feed on
// Megaphone. We fetch it, take the newest <item>, and pull the
// enclosure (the MP3), title, duration, and artwork. Mirrors the NCMP
// route's shape (routes/ncmp.ts) — a cached server-side fetch so we
// hit each feed at most once per TTL window per process.
//
// Caching: a short per-show TTL (not per-day) keeps it simple and
// always fresh. The feeds are light XML, the parse is a few regexes,
// and new episodes land daily — a 30-minute TTL picks up the day's
// episode well before most users open the app, without a date-key
// rollover edge case. On any fetch failure we serve the last good
// cache (even if stale) and only fall back to a null-audio payload when
// we've never succeeded.

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Known shows. The :show path param is validated against these keys, so
// adding a third office (e.g. compline / midday) later is just one more
// entry here + a chooser card. `fallbackTitle` is what the client shows
// if we've never managed a successful fetch.
const SHOWS: Record<string, { feedUrl: string; fallbackTitle: string }> = {
  "morning-office": {
    feedUrl: "https://feeds.megaphone.fm/FDMV7144883457",
    fallbackTitle: "Daily Morning Prayer from Forward Movement",
  },
  "evening-office": {
    feedUrl: "https://feeds.megaphone.fm/FDMV2784874884",
    fallbackTitle: "An Evening at Prayer",
  },
};

// Match a real browser UA — Megaphone serves the same XML either way,
// but keeps behavior predictable if they ever gate on UA.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

type Episode = {
  feedTitle: string | null;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null; // RFC-822 string from the feed's <pubDate>
  imageUrl: string | null;
};

const TTL_MS = 30 * 60_000;
// One cache slot per show.
const cache = new Map<string, { at: number; data: Episode }>();

// <itunes:duration> is either total seconds ("858") or a clock string
// ("14:18" or "1:02:30"). Normalize to seconds; null on anything weird.
function parseDurationSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(t)) return null;
  const parts = t.split(":").map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

// Strip CDATA wrappers + decode the handful of XML entities that show
// up in podcast titles. Good enough for display text; we're not
// building a general XML parser.
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

async function fetchTodaysEpisode(feedUrl: string, fallbackTitle: string): Promise<Episode> {
  const res = await fetch(feedUrl, {
    headers: {
      "user-agent": UA,
      accept: "application/rss+xml, application/xml, text/xml",
    },
  });
  if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
  const xml = await res.text();

  // Channel-level bits live before the first <item>.
  const channelPart = xml.split(/<item[\s>]/)[0] ?? "";
  const feedTitleMatch = channelPart.match(/<title>([\s\S]*?)<\/title>/);
  const channelImageMatch = channelPart.match(/<itunes:image[^>]*\bhref="([^"]+)"/i);

  // Newest episode = first <item> (Megaphone emits newest-first).
  const itemMatch = xml.match(/<item[\s>]([\s\S]*?)<\/item>/i);
  if (!itemMatch) throw new Error("feed has no <item>");
  const item = itemMatch[1] ?? "";

  const titleMatch = item.match(/<title>([\s\S]*?)<\/title>/);
  const enclosureMatch = item.match(/<enclosure[^>]*\burl="([^"]+)"/i);
  const durationMatch = item.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/i);
  const pubDateMatch = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
  const itemImageMatch = item.match(/<itunes:image[^>]*\bhref="([^"]+)"/i);

  return {
    feedTitle: feedTitleMatch ? decodeXmlText(feedTitleMatch[1]) : fallbackTitle,
    title: titleMatch ? decodeXmlText(titleMatch[1]) : null,
    audioUrl: enclosureMatch ? enclosureMatch[1] : null,
    durationSeconds: parseDurationSeconds(durationMatch ? durationMatch[1] : null),
    publishedAt: pubDateMatch ? pubDateMatch[1].trim() : null,
    imageUrl: itemImageMatch?.[1] ?? channelImageMatch?.[1] ?? null,
  };
}

// GET /api/podcast/:show/today — today's episode for a known show.
// Public (no auth); the player page is auth-gated on the client, but
// the metadata itself is harmless to serve openly and the prayer
// chooser fetches it before any session exists.
router.get("/podcast/:show/today", async (req: Request, res: Response): Promise<void> => {
  const showKey = String(req.params.show ?? "");
  const show = SHOWS[showKey];
  if (!show) {
    res.status(404).json({ error: "Unknown show" });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=600");
  try {
    const hit = cache.get(showKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      res.json(hit.data);
      return;
    }
    const data = await fetchTodaysEpisode(show.feedUrl, show.fallbackTitle);
    cache.set(showKey, { at: Date.now(), data });
    res.json(data);
  } catch (err) {
    logger.warn({ err, show: showKey }, "[podcast] failed to resolve episode");
    // Serve the last good payload if we have one — a slightly stale
    // episode is far better than a dead player. Only when we've never
    // succeeded do we return a null-audio shape the client treats as
    // "couldn't load."
    const stale = cache.get(showKey);
    if (stale) {
      res.json(stale.data);
      return;
    }
    res.json({
      feedTitle: show.fallbackTitle,
      title: null,
      audioUrl: null,
      durationSeconds: null,
      publishedAt: null,
      imageUrl: null,
    });
  }
});

export default router;
