// External-link helpers for the Center for Action and Contemplation.
//
// The Contemplation "Learn" list points at CAC's Daily Meditations.
// Linking to https://cac.org or https://cac.org/daily-meditations/
// lands the user on a marketing index — they have to scroll and tap
// "Read full meditation" to actually reach today's piece. This route
// shortcuts that: GET /api/cac/today fetches the public RSS feed
// for the daily-meditations category, parses the first <item><link>
// (CAC always orders newest first), and 302-redirects there.
//
// CAC blocks bot-shaped requests on the HTML pages (403), but the
// /category/daily-meditations/feed/ RSS endpoint serves anyone with
// a normal browser User-Agent. The feed is the canonical machine-
// readable surface for "what's new" so this is the intended use.
//
// Response: 302 → today's permalink, or 302 → the index page on any
// failure (network, parse, empty feed). We never 500 — a "Learn"
// link that opens the index is still useful; a 500 just looks broken.

import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";
import { getGardenUserIds } from "../lib/garden";

const router: IRouter = Router();

function getUser(req: Request): { id: number } | null {
  return (req as unknown as { user?: { id: number } }).user ?? null;
}
function wordCount(s: string): number { return s.trim().split(/\s+/).filter(Boolean).length; }
const CAC_WORD_MAX = 250;

const FEED_URL = "https://cac.org/category/daily-meditations/feed/";
const FALLBACK_URL = "https://cac.org/daily-meditations/";
const FEED_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// In-memory cache with a short wall-clock TTL. The RSS feed always
// orders newest-first, so the first <item><link> is, by definition,
// the latest meditation — we don't need to reason about WHEN today's
// went live. A short TTL means: pick up today's meditation within a
// few minutes of CAC publishing it (≈2 AM ET), without hitting their
// RSS on every single tap.
//
// This replaces an earlier "publish day rolls over at 9 AM ET" scheme
// that actively served YESTERDAY's permalink until 9 AM ET — a 7-hour
// window of stale content every morning, since CAC publishes around
// 2 AM ET. The newest-item-from-the-feed approach has no artificial
// boundary: whatever's at the top of the feed right now is what we
// serve. Cache stays in-process; a redeploy invalidates it.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cached: { url: string; title: string; fetchedAt: number } | null = null;

// Decode the handful of XML/HTML entities WordPress emits in RSS titles
// (smart quotes, dashes, ampersands) so the title renders cleanly in the
// app. &amp; is decoded last so a double-encoded entity unwinds one level.
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#8217;|&#x2019;/gi, "’")
    .replace(/&#8216;|&#x2018;/gi, "‘")
    .replace(/&#8220;|&#x201C;/gi, "“")
    .replace(/&#8221;|&#x201D;/gi, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&hellip;|&#8230;/gi, "…")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .trim();
}

// Pull the first <item>'s <link> + <title> out of an RSS document. We
// deliberately use a forgiving regex rather than a full XML parser
// because (a) there's no XML parser already in the dep tree and
// (b) the WordPress RSS shape is stable. The regex anchors on
// `<item>` (so we skip the channel-level <link>/<title> at the top,
// which point at cac.org/) and reads the first <link>/<title> inside.
function parseFirstItem(xml: string): { url: string; title: string } | null {
  const firstItem = xml.match(/<item\b[^>]*>([\s\S]*?)<\/item>/);
  if (!firstItem) return null;
  const block = firstItem[1];
  const linkMatch = block.match(/<link>([^<]+)<\/link>/);
  if (!linkMatch) return null;
  const url = linkMatch[1].trim();
  // Sanity: a daily-meditations permalink lives under cac.org. If we
  // somehow grabbed an offsite URL (RSS spec allows it) bail out so
  // we don't redirect users to a surprise destination.
  if (!/^https?:\/\/(?:www\.)?cac\.org\//i.test(url)) return null;
  const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch ? decodeEntities(titleMatch[1]) : "";
  return { url, title };
}

async function resolveToday(): Promise<{ url: string; title: string }> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { url: cached.url, title: cached.title };
  }
  // Use AbortController so a slow / hanging RSS fetch doesn't keep
  // the user's tap waiting. 5s is plenty for a healthy WordPress feed
  // and short enough to fall back gracefully when CAC has a blip.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        "User-Agent": FEED_USER_AGENT,
        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[cac] feed fetch non-ok");
      // Don't poison the cache with the fallback — leave whatever was
      // there (or nothing) so the next request can try again. The
      // fallback is just for THIS response.
      return { url: FALLBACK_URL, title: "" };
    }
    const xml = await res.text();
    const parsed = parseFirstItem(xml);
    if (!parsed) {
      logger.warn({ bytes: xml.length }, "[cac] could not parse first item");
      return { url: FALLBACK_URL, title: "" };
    }
    cached = { ...parsed, fetchedAt: Date.now() };
    return parsed;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[cac] feed fetch failed");
    return { url: FALLBACK_URL, title: "" };
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/cac/today → 302 to today's CAC Daily Meditation permalink.
// Public — no auth, no rate limit beyond the resolver's own cache.
// The redirect uses 302 (not 301) so a cache-miss roll-over to
// tomorrow's meditation doesn't get cached by intermediate proxies.
router.get("/cac/today", async (_req: Request, res: Response): Promise<void> => {
  const { url } = await resolveToday();
  // 5-minute CDN/browser cache. The redirect target changes once a
  // day (when CAC publishes), so a long cache risks pinning
  // yesterday's permalink into this morning — exactly the staleness
  // a user hit ("CAC loaded yesterday's"). Five minutes keeps CAC
  // traffic negligible (the in-process 30-min cache already absorbs
  // the bulk) while letting the daily rollover reach every client
  // within minutes. 302 (not 301) so the redirect itself is never
  // permanently cached.
  res.setHeader("Cache-Control", "public, max-age=300");
  res.redirect(302, url);
});

// GET /api/cac/today-meta → { title, url } for today's meditation.
// The in-app reflection slide can't iframe cac.org (it sends
// X-Frame-Options: SAMEORIGIN), so it shows this scraped title + a
// "Read now" CTA instead of an embed. Title comes from the same RSS
// feed the redirect uses (the HTML pages 403 bot-shaped requests).
router.get("/cac/today-meta", async (_req: Request, res: Response): Promise<void> => {
  const { url, title } = await resolveToday();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ title, url });
});

// ── CAC read presence + community journal ──────────────────────────────────
// Everything below requires auth (the public /cac/today redirect above does
// not). These power the in-app reflection page the reader lands on when they
// come back: who in their community read today, and a gratitude-style journal.

// POST /api/cac/read { ymd } — record that the caller opened today's
// reflection (idempotent per local day). ymd is the caller's local date.
router.post("/cac/read", async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const ymd = String((req.body as { ymd?: unknown })?.ymd ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) { res.status(400).json({ error: "Bad ymd" }); return; }
  try {
    await pool.query(
      `INSERT INTO cac_reads (user_id, ymd) VALUES ($1, $2)
       ON CONFLICT (user_id, ymd) DO NOTHING`,
      [user.id, ymd],
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "POST /cac/read failed");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/cac/readers?ymd= — people in my community (garden + me) who read
// the reflection on that local day. Returns a count + faces, newest first.
router.get("/cac/readers", async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const ymd = String((req.query as { ymd?: unknown }).ymd ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) { res.status(400).json({ error: "Bad ymd" }); return; }
  try {
    const garden = await getGardenUserIds(user.id);
    const ids = Array.from(new Set([user.id, ...garden]));
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.avatar_url
       FROM cac_reads cr JOIN users u ON u.id = cr.user_id
       WHERE cr.ymd = $1 AND cr.user_id = ANY($2::int[])
       ORDER BY cr.created_at DESC`,
      [ymd, ids],
    );
    const readers = result.rows.map((r: { id: number; name: string | null; email: string | null; avatar_url: string | null }) => ({
      id: r.id,
      name: r.name || r.email?.split("@")[0] || "Someone",
      avatarUrl: r.avatar_url || null,
      isYou: r.id === user.id,
    }));
    res.json({ count: readers.length, readers });
  } catch (err) {
    logger.error({ err }, "GET /cac/readers failed");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/cac/reflections { text, shared } — write a journal entry (private
// by default; shared posts it to the community wall). Mirrors gratitude.
router.post("/cac/reflections", async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { text, shared, title } = req.body as { text?: unknown; shared?: unknown; title?: unknown };
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "Text is required" }); return;
  }
  const trimmed = text.trim();
  if (wordCount(trimmed) > CAC_WORD_MAX) { res.status(400).json({ error: `Maximum ${CAC_WORD_MAX} words` }); return; }
  // The reflection the entry was written about — stored so "Your reflections"
  // can label each by date + title. Trimmed/capped; null when absent.
  const entryTitle = typeof title === "string" && title.trim().length > 0 ? title.trim().slice(0, 200) : null;
  try {
    const result = await pool.query(
      `INSERT INTO cac_reflections (user_id, text, shared, title) VALUES ($1, $2, $3, $4)
       RETURNING id, created_at, shared`,
      [user.id, trimmed, shared === true, entryTitle],
    );
    res.json({ id: result.rows[0].id, createdAt: result.rows[0].created_at, shared: result.rows[0].shared });
  } catch (err) {
    logger.error({ err }, "POST /cac/reflections failed");
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/cac/reflections/:id/share { shared } — share/unshare your entry.
router.post("/cac/reflections/:id/share", async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const shared = (req.body as { shared?: unknown })?.shared === true;
  try {
    const result = await pool.query(
      `UPDATE cac_reflections SET shared = $1 WHERE id = $2 AND user_id = $3 RETURNING id, shared`,
      [shared, id, user.id],
    );
    if (result.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ id: result.rows[0].id, shared: result.rows[0].shared });
  } catch (err) {
    logger.error({ err }, "POST /cac/reflections/:id/share failed");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/cac/reflections/mine — my own entries (private + shared), newest first.
router.get("/cac/reflections/mine", async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const rows = await pool.query(
      `SELECT id, text, shared, title, created_at FROM cac_reflections
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [user.id],
    );
    res.json({ entries: rows.rows.map((r: { id: number; text: string; shared: boolean; title: string | null; created_at: Date }) => ({ id: r.id, text: r.text, shared: r.shared, title: r.title ?? null, createdAt: r.created_at })) });
  } catch (err) {
    logger.error({ err }, "GET /cac/reflections/mine failed");
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/cac/reflections/responses — shared entries from my community
// (garden + me), last 30 days, newest first.
router.get("/cac/reflections/responses", async (req: Request, res: Response): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Not authenticated" }); return; }
  try {
    const garden = await getGardenUserIds(user.id);
    const ids = Array.from(new Set([user.id, ...garden]));
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rows = await pool.query(
      `SELECT cr.id, cr.text, cr.created_at, cr.user_id, u.name, u.email, u.avatar_url
       FROM cac_reflections cr JOIN users u ON u.id = cr.user_id
       WHERE cr.shared = TRUE AND cr.user_id = ANY($1::int[]) AND cr.created_at > $2
       ORDER BY cr.created_at DESC LIMIT 100`,
      [ids, since],
    );
    res.json({
      responses: rows.rows.map((r: { id: number; text: string; created_at: Date; user_id: number; name: string | null; email: string | null; avatar_url: string | null }) => ({
        id: r.id,
        text: r.text,
        createdAt: r.created_at,
        authorName: r.name || r.email?.split("@")[0] || "Someone",
        avatarUrl: r.avatar_url || null,
        isYou: r.user_id === user.id,
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /cac/reflections/responses failed");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
