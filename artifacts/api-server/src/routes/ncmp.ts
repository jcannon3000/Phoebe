// National Cathedral Morning Prayer metadata.
//
// The cathedral broadcasts a daily Morning Prayer service weekdays at
// 7 AM Eastern and uploads each recording to a YouTube playlist. The
// prayer-chooser surfaces "Watch National Cathedral Morning Prayer"
// as an option on the morning chooser and wants to label it with the
// length of TODAY'S video — a meaningful number ranges roughly 10–25
// minutes depending on the day's lessons + canticles.
//
// Two-step resolution:
//   1. Fetch the YouTube playlist RSS
//      (https://www.youtube.com/feeds/videos.xml?playlist_id=...) —
//      machine-readable, returns the channel's videos newest-first.
//      The first <entry> is the most recent broadcast.
//   2. Scrape the watch page for that videoId; YouTube embeds
//      "lengthSeconds":"..." in the player config inside the HTML.
//      A single regex pulls it out reliably.
//
// Cache by "publish day" the same way /api/cac/today does — keys roll
// over at 9 AM ET, which is well after the cathedral's 7 AM ET
// broadcast goes live and well after the upload typically settles. So
// we make at most one round-trip pair to YouTube per process per day.
// Graceful fallback: on any failure we still return the playlist URL
// with a null durationSeconds so the client can render a sensible
// "today's video" link without the length badge.

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Washington National Cathedral · Morning Prayer playlist (public).
const PLAYLIST_ID = "PL1nLVw6M_fPisN8Gfk_tRsjTXqSexemlK";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?playlist_id=${PLAYLIST_ID}`;
const PLAYLIST_FALLBACK_URL = `https://www.youtube.com/playlist?list=${PLAYLIST_ID}`;

// Safari UA — YouTube serves the same HTML to bots, but we still
// match a real browser to keep behavior predictable if Google ever
// tightens up.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// Cache shape — keyed by ET publish-day (9 AM ET rollover).
type Cached = { day: string; data: NcmpMeta };
type NcmpMeta = {
  url: string;
  videoId: string | null;
  title: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
};
let cached: Cached | null = null;

// Publish-day key in ET, with a 9 AM rollover (same heuristic the CAC
// route uses). Before 9 AM ET the key is YESTERDAY's date — that's
// when "today's broadcast" might not yet be reflected in the playlist
// (or the upload is still being processed by YouTube).
function publishDayKey(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = parseInt(get("hour"), 10);
  if (hour < 9) {
    const utcNoon = new Date(`${year}-${month}-${day}T12:00:00Z`);
    utcNoon.setUTCDate(utcNoon.getUTCDate() - 1);
    return utcNoon.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

// First <entry> in a YouTube playlist RSS. Conservative regex —
// YouTube's feed XML is stable but we extract only what we need and
// bail to nulls if any piece is missing.
function parseFirstEntry(xml: string): {
  videoId: string | null;
  title: string | null;
  publishedAt: string | null;
} {
  const entryMatch = xml.match(/<entry\b[^>]*>([\s\S]*?)<\/entry>/);
  if (!entryMatch) return { videoId: null, title: null, publishedAt: null };
  const body = entryMatch[1];
  const videoId = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1] ?? null;
  const title = body.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? null;
  const publishedAt = body.match(/<published>([^<]+)<\/published>/)?.[1] ?? null;
  return { videoId, title, publishedAt };
}

// YouTube embeds lengthSeconds in the player config JSON inside the
// watch page HTML. A loose regex tolerates extra whitespace and the
// occasional surrounding-config drift. Returns seconds or null.
function parseLengthSeconds(html: string): number | null {
  const m = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function resolveTodaysMeta(): Promise<NcmpMeta> {
  const today = publishDayKey();
  if (cached && cached.day === today) {
    return cached.data;
  }

  // 5-second timeout per request — YouTube is normally instant; bail
  // gracefully if something stalls so the user's chooser doesn't hang.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  const fallback: NcmpMeta = {
    url: PLAYLIST_FALLBACK_URL,
    videoId: null,
    title: null,
    publishedAt: null,
    durationSeconds: null,
  };

  try {
    const feedRes = await fetch(FEED_URL, {
      headers: { "User-Agent": UA, "Accept": "application/atom+xml, application/xml, */*" },
      signal: controller.signal,
    });
    if (!feedRes.ok) {
      logger.warn({ status: feedRes.status }, "[ncmp] playlist RSS non-ok");
      return fallback;
    }
    const xml = await feedRes.text();
    const { videoId, title, publishedAt } = parseFirstEntry(xml);
    if (!videoId) {
      logger.warn("[ncmp] could not parse first entry from playlist RSS");
      return fallback;
    }

    // Now fetch the watch page to extract lengthSeconds. We swallow
    // this step's failure — the watch URL is the important payload;
    // a missing duration just hides the length badge.
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let durationSeconds: number | null = null;
    try {
      const watchRes = await fetch(watchUrl, {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });
      if (watchRes.ok) {
        const html = await watchRes.text();
        durationSeconds = parseLengthSeconds(html);
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err), videoId },
        "[ncmp] watch-page fetch failed",
      );
    }

    const data: NcmpMeta = { url: watchUrl, videoId, title, publishedAt, durationSeconds };
    cached = { day: today, data };
    return data;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[ncmp] feed fetch failed");
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/ncmp/today-meta → today's National Cathedral Morning Prayer
// video URL + duration. Public — no auth, no rate limit beyond the
// resolver's own cache. Falls back to the playlist landing URL on any
// failure so the client always gets a usable link.
router.get("/ncmp/today-meta", async (_req: Request, res: Response): Promise<void> => {
  const meta = await resolveTodaysMeta();
  // 1-hour CDN cache mirrors the in-process cache rollover cadence so
  // intermediaries don't pin yesterday's metadata into tomorrow's
  // chooser, and YouTube only sees ~1 request per server-instance per
  // day under the partial index.
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(meta);
});

export default router;
