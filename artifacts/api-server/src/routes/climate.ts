import { Router } from "express";
import { db, usersTable, prayerFeedsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function requireClimate(req: any, res: any, next: any) {
  if (!req.isAuthenticated?.() || !req.user) {
    res.status(401).json({ error: "Not authenticated" }); return;
  }
  if (!(req.user as { climateEnrolled: boolean }).climateEnrolled) {
    res.status(403).json({ error: "Not enrolled in Phoebe Climate" }); return;
  }
  next();
}

// GET /api/climate/feed — returns the phoebe-climate feed for enrolled users
router.get("/climate/feed", requireClimate, async (req, res): Promise<void> => {
  try {
    const [feed] = await db
      .select({
        id: prayerFeedsTable.id,
        slug: prayerFeedsTable.slug,
        title: prayerFeedsTable.title,
        tagline: prayerFeedsTable.tagline,
        coverEmoji: prayerFeedsTable.coverEmoji,
        state: prayerFeedsTable.state,
        subscriberCount: prayerFeedsTable.subscriberCount,
      })
      .from(prayerFeedsTable)
      .where(eq(prayerFeedsTable.slug, "phoebe-climate"));

    if (!feed) {
      res.status(404).json({ error: "Climate feed not found" }); return;
    }
    res.json({ feed });
  } catch (err) {
    res.status(500).json({ error: "Failed to load climate feed" });
  }
});

export default router;
