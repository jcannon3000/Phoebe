// External-link helper for Sojourners' Verse and Voice.
//
// Mirrors routes/nouwen.ts, routes/vts.ts and routes/grist.ts: GET
// /api/sojo/today 302-redirects to the newest issue that ACTUALLY EXISTS.
// Phoebe never reproduces their text — sojo.net serves it, and the reader view
// only restyles the page in the reader's own browser.
//
// WHY THIS IS A PROBE AND NOT A FORMULA.
//
// Unlike Nouwen (opaque Squarespace slugs) Sojourners' permalinks ARE
// derivable: https://sojo.net/daily-wisdom/verse-and-voice-MMDDYY. The client
// has always built that string from today's date, mapped Sat/Sun back to
// Friday, and opened it. The format is correct — that is not the bug.
//
// The bug is that deriving a URL is not the same as knowing it exists.
// Sojourners does not always publish on the day, and when they are behind the
// derived URL 404s. Measured 2026-09-02: 090226 → 404, 090126 → 404,
// 083126 → 200, 082826 → 200. Two days behind, so the reader opened
// Sojourners' own "Whoops! 404 Page Error" page — and because the reader's
// isolate target is absent on that page, the stylesheet is disabled and it
// renders as their raw site, masthead and subscribe footer and all. It looks
// like Phoebe is broken. Owner screenshotted exactly this.
//
// So: walk BACK from today, at most MAX_LOOKBACK days, and take the first day
// that answers 200. There is no feed to read (Verse and Voice is not in an RSS
// index we can reach), so a probe is the only way to ask "which is the newest
// one that is really there?".
//
// Weekends are skipped rather than probed — Verse and Voice is a weekday
// publication and the client already folded Sat/Sun onto Friday, so probing
// them would just spend two requests to learn what the calendar already says.

import { Router, type IRouter, type Request, type Response } from "express";

const router: IRouter = Router();

const INDEX_URL = "https://sojo.net/daily-wisdom";
const UA = "PhoebeBot/1.0 (+https://withphoebe.app)";
/** Enough to ride out a long holiday gap without probing forever. */
const MAX_LOOKBACK = 14;

type Resolved = { url: string; ymd: string | null };

let cache: { at: number; value: Resolved } | null = null;
// Longer than the other resolvers': this answer changes at most once a day and
// each miss costs several network round-trips, so re-probing every 5 minutes
// would be pure waste.
const TTL_MS = 30 * 60 * 1000;

/** https://sojo.net/daily-wisdom/verse-and-voice-MMDDYY for a given date. */
export function sojoUrlForDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  return `${INDEX_URL}/verse-and-voice-${mm}${dd}${yy}`;
}

/**
 * Does this issue exist?
 *
 * HEAD, not GET — we only need the status, and their pages are not small.
 * `redirect: "manual"` so a 301/302 into a marketing page is not mistaken for
 * a real issue: only a direct 200 counts as published.
 */
async function exists(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      redirect: "manual",
      signal: controller.signal,
    });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveTodaySojo(now: Date = new Date()): Promise<Resolved> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const d = new Date(now.getTime());
  for (let i = 0; i < MAX_LOOKBACK; i++) {
    const day = d.getDay();
    // Weekday publication — step over Sat/Sun without spending a request.
    if (day !== 0 && day !== 6) {
      const url = sojoUrlForDate(d);
      if (await exists(url)) {
        const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const value = { url, ymd };
        cache = { at: Date.now(), value };
        return value;
      }
    }
    d.setDate(d.getDate() - 1);
  }
  // Nothing found in two weeks — send them to the real index rather than a
  // 404. Deliberately NOT cached: this is the failure path, and caching it
  // would keep serving the index for half an hour after they publish again.
  return { url: INDEX_URL, ymd: null };
}

// GET /api/sojo/today → 302 to the newest issue that exists. Public, no auth.
router.get("/sojo/today", async (_req: Request, res: Response): Promise<void> => {
  const { url } = await resolveTodaySojo();
  res.setHeader("Cache-Control", "public, max-age=900");
  res.redirect(302, url);
});

// GET /api/sojo/today-meta → { url, ymd }. `ymd` is the day the issue is FOR,
// which is not always today — a card can say so honestly instead of implying
// freshness we haven't got.
router.get("/sojo/today-meta", async (_req: Request, res: Response): Promise<void> => {
  const { url, ymd } = await resolveTodaySojo();
  res.setHeader("Cache-Control", "public, max-age=900");
  res.json({ url, ymd });
});

export default router;
