// Public redirect routes for the Sunday Lectionary "today's reading"
// drawer menu entry.
//
// We don't render the lectionary HTML ourselves — lectionarypage.net is
// the canonical Anglican RCL reader and we'd rather link out than
// duplicate their formatting / table-of-readings interaction. The seed
// data in src/data/lectionary/seed.ts already carries the per-Sunday
// sourceUrl on lectionarypage.net (e.g.
// `https://www.lectionarypage.net/YearA_RCL/Pentecost/ATrinity_RCL.html`),
// so we just resolve "next Sunday" → seed row → 302.
//
// Public — no auth, no rate limit. Behind a short CDN cache so a phone
// waking up at 9 AM doesn't ping lectionarypage.net every time.

import { Router, type IRouter, type Request, type Response } from "express";
import { getUpcomingSundayReading, nextSundayDate } from "../lib/rclLectionary";
import { RCL_SUNDAYS } from "../data/rclSundays";

const router: IRouter = Router();

// Fallback when the seed lookup fails or returns a row with no
// sourceUrl set (older seeds didn't always populate the field). The
// landing page indexes every year/season so the reader can still find
// their Sunday by hand.
const LECTIONARYPAGE_HOMEPAGE = "https://www.lectionarypage.net";

router.get("/lectionary/today", async (_req: Request, res: Response): Promise<void> => {
  let url = LECTIONARYPAGE_HOMEPAGE;
  try {
    const reading = await getUpcomingSundayReading();
    if (reading.sourceUrl && reading.sourceUrl.startsWith("http")) {
      url = reading.sourceUrl;
    }
  } catch (err) {
    console.warn("[lectionary/today] seed lookup failed:", err);
  }
  // 302 (not 301) — the URL rolls over weekly as Sunday changes, so a
  // proxy that cached a 301 would pin readers to last Sunday forever.
  // 1 hour CDN cache keeps lectionarypage.net traffic predictable
  // without making the rollover invisible to mid-week readers.
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.redirect(302, url);
});

// GET /api/lectionary/sunday → the coming Sunday: its date and name, the
// lectionarypage.net page (what "Sunday readings" opens in the reader — the
// same reader the Daily Scripture Readings practice uses), and the appointed
// readings for the card's second line. Owner (2026-09-04): "This Sunday" under
// Learn — Sunday readings, Visio Divina, and Andrew McGowan's commentary.
router.get("/lectionary/sunday", async (_req: Request, res: Response): Promise<void> => {
  const sunday = nextSundayDate();
  const iso = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, "0")}-${String(sunday.getDate()).padStart(2, "0")}`;
  const rcl = RCL_SUNDAYS[iso] ?? null;
  let name: string | null = null;
  let url: string = rcl?.url ?? LECTIONARYPAGE_HOMEPAGE;
  try {
    const reading = await getUpcomingSundayReading();
    if (reading.sundayName) name = reading.sundayName;
    if (!rcl?.url && reading.sourceUrl && reading.sourceUrl.startsWith("http")) url = reading.sourceUrl;
  } catch (err) {
    console.warn("[lectionary/sunday] seed lookup failed:", err);
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({
    sundayDate: iso, name, url,
    gospel: rcl?.gospel ?? null, psalm: rcl?.psalm ?? null, nt: rcl?.nt ?? [], ot: rcl?.ot ?? [],
  });
});

export default router;
