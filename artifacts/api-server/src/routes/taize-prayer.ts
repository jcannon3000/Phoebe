// ─── Prayer at Taizé — the community's own stream ───────────────────────────
//
// Owner, 2026-09-19: "At the bottom of practices could we have Taize prayers
// which would love there daily stream", with a link to one broadcast.
//
// IT IS NOT DAILY, and the app must not promise that it is. The channel's feed
// (checked 2026-09-19) holds nothing but "Evening prayer, Saturday <date>" —
// 19.09, 12.09, 05.09, 29.08, 22.08 … — so this is the Saturday evening prayer
// from the church at Taizé, week by week, with the occasional week missing.
// Hence: resolve the NEWEST prayer rather than pinning the owner's video, and
// hand the client the date so the page can say which prayer it is showing.
//
// Their titles are not written by a machine, so the punctuation moves:
// "Evening prayer, Saturday 19.09.2026" and "Evening prayer | Saturday
// 05.09.2026" both appear. The match is therefore on the words, not the shape.
//
// Same resolution as routes/ncmp.ts (channel RSS instead of a playlist's), and
// the same lesson learned there: a MISS is cached for a minute, never an hour,
// or one bad minute at YouTube pins "nothing to watch" at Railway's edge and
// on every phone behind it.

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { safeFetch } from "../lib/ssrfGuard";

const router: IRouter = Router();

/** The Taizé Community's channel (youtube.com/@taize). */
const CHANNEL_ID = "UC7eh2w-pOp8u8nf7afQbNgQ";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
/** Where a person goes when we cannot resolve a single prayer. */
const CHANNEL_URL = "https://www.youtube.com/@taize/streams";
/** If one is ON AIR, that is the prayer to be at. */
const LIVE_URL = "https://www.youtube.com/@taize/live";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

export type TaizePrayerMeta = {
  /** The channel's streams page — always usable, even when nothing resolves. */
  url: string;
  videoId: string | null;
  title: string | null;
  publishedAt: string | null;
  /** True when the community is praying RIGHT NOW. */
  live: boolean;
};

type Cached = { at: number; data: TaizePrayerMeta };
let cache: Cached | null = null;
/** A resolved prayer holds for half an hour; a live check is worth redoing. */
const TTL_MS = 30 * 60_000;
const LIVE_TTL_MS = 2 * 60_000;

/**
 * A prayer, by its title. Their prayers say so in words ("Evening prayer",
 * "Prayer"), and everything else on the channel — a talk, a meeting, a news
 * piece — does not. Deliberately loose about punctuation and case, because
 * theirs varies; deliberately strict about the word, so a video of something
 * else never opens as though it were the prayer.
 *
 * A VIGIL COUNTS. "Vigil of Pentecost | Saturday 23.05.2026" is the one entry
 * in their feed that is plainly a prayer service without the word "prayer" in
 * it, and on a Pentecost weekend it IS that Saturday's prayer — leaving it out
 * would have shown the week before instead.
 */
export function looksLikePrayer(title: string | null | undefined): boolean {
  if (!title) return false;
  return /\bprayer\b|\bpri[eè]re\b|\bgebet\b|\boraci[oó]n\b|\bvigil\b|\bveill[eé]e\b/i.test(title);
}

type Entry = { videoId: string; title: string | null; publishedAt: string | null };

/** Every <entry> in a YouTube feed, newest first, as the feed itself orders. */
export function parseEntries(xml: string): Entry[] {
  const out: Entry[] = [];
  const re = /<entry\b[^>]*>([\s\S]*?)<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const body = m[1];
    const videoId = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    if (!videoId) continue;
    out.push({
      videoId,
      title: body.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? null,
      publishedAt: body.match(/<published>([^<]+)<\/published>/)?.[1] ?? null,
    });
  }
  return out;
}

/**
 * IS ONE ON AIR? The channel's /live address redirects to the watch page of
 * whatever is streaming and, when nothing is, to the channel itself. So the
 * question is answered by where we land, and the id we land on is the one to
 * open — a live prayer has no feed entry until it is over.
 */
async function resolveLive(): Promise<{ videoId: string; title: string | null } | null> {
  try {
    const res = await safeFetch(LIVE_URL, {
      timeoutMs: 5_000,
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    /**
     * A live watch page says so about the video it is showing, and YouTube
     * has more than one way of saying it — the flat "isLive" and the
     * liveBroadcastDetails "isLiveNow". Both are checked, because when
     * NOTHING is live this same address still answers 200 and still carries
     * the most recent stream's id (measured 2026-09-19 on their channel), so
     * the marker is the only thing separating "praying now" from "the last
     * one, finished". Without it every visit would claim to be live.
     */
    if (!/"isLive"\s*:\s*true/.test(html) && !/"isLiveNow"\s*:\s*true/.test(html)) return null;
    const videoId = html.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/)?.[1] ?? null;
    if (!videoId) return null;
    const title = html.match(/<meta name="title" content="([^"]*)"/)?.[1] ?? null;
    return { videoId, title };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[taize] live check failed");
    return null;
  }
}

async function resolvePrayer(): Promise<TaizePrayerMeta> {
  const now = Date.now();
  if (cache && now - cache.at < (cache.data.live ? LIVE_TTL_MS : TTL_MS)) return cache.data;

  const fallback: TaizePrayerMeta = { url: CHANNEL_URL, videoId: null, title: null, publishedAt: null, live: false };

  // On air wins: the community is praying, and that is the one to join.
  const live = await resolveLive();
  if (live) {
    const data: TaizePrayerMeta = {
      url: `https://www.youtube.com/watch?v=${live.videoId}`,
      videoId: live.videoId,
      title: live.title,
      publishedAt: null,
      live: true,
    };
    cache = { at: now, data };
    return data;
  }

  try {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": UA, "Accept": "application/atom+xml, application/xml, */*" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[taize] channel RSS non-ok");
      cache = { at: now, data: fallback };
      return fallback;
    }
    const entries = parseEntries(await res.text());
    // The newest thing that is a PRAYER. Their channel is mostly prayer, but
    // a talk at the top of the feed must not be opened as one.
    const prayer = entries.find((e) => looksLikePrayer(e.title));
    if (!prayer) {
      logger.warn({ entries: entries.length }, "[taize] no prayer in the feed");
      cache = { at: now, data: fallback };
      return fallback;
    }
    const data: TaizePrayerMeta = {
      url: `https://www.youtube.com/watch?v=${prayer.videoId}`,
      videoId: prayer.videoId,
      title: prayer.title,
      publishedAt: prayer.publishedAt,
      live: false,
    };
    cache = { at: now, data };
    return data;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[taize] feed fetch failed");
    cache = { at: now, data: fallback };
    return fallback;
  }
}

/**
 * GET /api/taize/prayer → the most recent prayer from Taizé, or the one on air.
 * Public, like the other watch metadata: a guest can pray with them.
 */
router.get("/taize/prayer", async (_req: Request, res: Response): Promise<void> => {
  const meta = await resolvePrayer();
  // A resolved prayer is good for the half hour it is cached for; a miss — and
  // a live one — for a minute, so neither gets pinned at the edge.
  res.setHeader("Cache-Control", meta.videoId && !meta.live ? "public, max-age=1800" : "public, max-age=60");
  res.json(meta);
});

export default router;
