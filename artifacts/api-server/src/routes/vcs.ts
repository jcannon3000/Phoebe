// The Visual Commentary on Scripture — "Bible and Art Daily".
//
// Same contract as routes/nouwen.ts, grist.ts, vts.ts and sojo.ts:
// GET /api/vcs/today 302s to the day's commentary, and /today-meta gives a
// card its headline. What differs is where the answer comes from.
//
// WHY THIS ONE IS FED BY EMAIL.
//
// The other four resolve live over HTTP. VCS cannot: thevcs.org answers
// **403 to server-side requests** — measured 2026-09-02 against
// /bible-and-art-daily, /feed and /rss, with a bot user-agent AND with a full
// Safari one. There is no index we are permitted to read, so there is nothing
// to resolve against.
//
// VCS does publish a daily email, and that email links to the commentary they
// have appointed for the day. So Phoebe subscribes an address to it, lifts the
// link out on arrival (routes/inbound-email.ts), and stores it in vcs_daily.
// This route reads that store. Owner: "not show the user the newsletter, but
// get it internally and take the user to that commentary they have appointed
// for the day."
//
// AVAILABLE TO EVERYONE (owner: "the daily VCS should be available for all
// users"). No auth, no entitlement, no beta gate — same as the other four.
//
// UNTIL INBOUND MAIL IS CONFIGURED THIS IS INERT, NOT BROKEN. Nothing writes
// vcs_daily until the MX/webhook setup described at the top of
// routes/inbound-email.ts is done, so `today` falls back to the public VCS
// page — a real page a reader can use — rather than erroring. The fallback is
// deliberately NOT presented as today's appointed commentary: today-meta
// reports `ymd: null` and `appointed: false` so a card can tell the truth
// about what it is offering.

import { Router, type IRouter, type Request, type Response } from "express";
import { desc } from "drizzle-orm";
import { db, vcsDailyTable } from "@workspace/db";

const router: IRouter = Router();

/** Where a reader goes when we have no appointment stored. */
const FALLBACK_URL = "https://thevcs.org/bible-and-art-daily";

type Resolved = { url: string; title: string | null; ymd: string | null; appointed: boolean };

/**
 * The most recent appointment.
 *
 * Newest-first rather than "today's row", deliberately. VCS does not publish
 * every single day, and a reader opening Phoebe on a quiet day should get the
 * most recent commentary rather than the fallback page — the same judgement
 * sojo.ts makes when it walks back to the newest issue that exists. The `ymd`
 * comes back with it so the caller can say which day it is for.
 */
export async function resolveTodayVcs(): Promise<Resolved> {
  try {
    const [row] = await db
      .select({ url: vcsDailyTable.url, title: vcsDailyTable.title, ymd: vcsDailyTable.ymd })
      .from(vcsDailyTable)
      .orderBy(desc(vcsDailyTable.ymd))
      .limit(1);
    if (row?.url) return { url: row.url, title: row.title ?? null, ymd: row.ymd, appointed: true };
  } catch {
    /* fall through — a reader tapping this must never meet a 500 */
  }
  return { url: FALLBACK_URL, title: null, ymd: null, appointed: false };
}

// GET /api/vcs/today → 302 to the appointed commentary. Public, no auth.
// 302 so nothing caches the target permanently — it changes daily.
router.get("/vcs/today", async (_req: Request, res: Response): Promise<void> => {
  const { url } = await resolveTodayVcs();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.redirect(302, url);
});

// GET /api/vcs/today-meta → { title, url, ymd, appointed }.
// `appointed` is the honest flag: false means we are showing the VCS index
// because no newsletter has been parsed, not that this is today's commentary.
router.get("/vcs/today-meta", async (_req: Request, res: Response): Promise<void> => {
  const meta = await resolveTodayVcs();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(meta);
});

export default router;
