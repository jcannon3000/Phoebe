// The Living Church's "Sunday's Readings" — a weekly commentary on the coming
// Sunday's lessons, shown on This Sunday beside Andrew McGowan's.
//
// Owner (2026-09-15), pointing at livingchurch.org/category/scripture/
// sundays-readings/: "Can you build this just like with the McGowan
// Comentaries", "And lets try a reader view", then "they post on monday for
// the coming sunday" and "so it should be on this sunday".
//
// TITLES AND LINKS ONLY. The category's own RSS says which posts exist and
// when; the commentary itself is read on livingchurch.org, in Phoebe's reader
// view (BibleWebViewController's isTlc arm restyles the page the reader's own
// browser fetched). None of its text is kept or served from here.
import { Router, type IRouter, type Request, type Response } from "express";
import { feedPosts, type WeeklyPost } from "../lib/weeklyFeed";

const router: IRouter = Router();

// The category's feed, named in full: weeklyFeed's feedUrlFor would rewrite
// it to the whole site's feed at the origin.
const FEED_URL = "https://livingchurch.org/category/scripture/sundays-readings/feed/";

/**
 * AT MOST ONE ASK A MINUTE, EVEN WHEN IT FAILS. livingchurch.org's robots.txt
 * asks for 30 seconds between requests. feedPosts holds a good answer for
 * half an hour, but it doesn't remember a failed fetch: once the cache
 * expires during an outage there, every request here would fetch again. So a
 * try is remembered for a minute whatever it returned, and requests that
 * arrive together share the one fetch.
 */
const MIN_GAP_MS = 60_000;
let lastTry = 0;
let lastPosts: WeeklyPost[] = [];
let inflight: Promise<WeeklyPost[]> | null = null;
function posts(): Promise<WeeklyPost[]> {
  if (inflight) return inflight;
  if (Date.now() - lastTry < MIN_GAP_MS) return Promise.resolve(lastPosts);
  lastTry = Date.now();
  inflight = feedPosts(FEED_URL)
    .then((list) => { lastPosts = list; return list; })
    .finally(() => { inflight = null; });
  return inflight;
}

// GET /api/living-church/posts → the newest posts, newest first, capped at
// ten, each with the day it was published. The client picks the one for the
// Sunday its page is showing (posted the Monday before) and lists them under
// the reader's "Previous". Identical for everyone, so it caches; who sees the
// card is the "livingChurchPublic" switch in app-settings (Admin Tools).
router.get("/living-church/posts", async (_req: Request, res: Response): Promise<void> => {
  const list = await posts();
  res.setHeader("Cache-Control", "public, max-age=900");
  res.json(list.slice(0, 10));
});

export default router;
