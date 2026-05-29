import { Router, type IRouter } from "express";
import { db, usersTable, betaUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { syncRmmEvents, RMM_FEED_SLUG } from "../lib/rmmEvents";

// ─── Rural & Migrant Ministry admin sync ─────────────────────────────────────
//
// On-demand trigger to scrape ruralmigrantministry.org/events/ and upsert
// upcoming events as DRAFTS on the RMM prayer feed (see lib/rmmEvents.ts).
// Beta-admin only. Kept on-demand (rather than a cron) for v1 because the
// scraped events need a human to confirm date/time/location before they go
// live anyway — the admin syncs, then reviews + publishes the drafts from
// the feed's Manage page.

const router: IRouter = Router();

function getUser(req: any): { id: number; email: string } | null {
  return req.user ? (req.user as { id: number; email: string }) : null;
}

async function isBetaAdmin(userId: number): Promise<boolean> {
  const [u] = await db.select({ email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId));
  if (!u) return false;
  try {
    const [beta] = await db.select({ isAdmin: betaUsersTable.isAdmin })
      .from(betaUsersTable).where(eq(betaUsersTable.email, u.email.toLowerCase()));
    return beta?.isAdmin === true;
  } catch {
    return false;
  }
}

// POST /api/rmm/sync — scrape + upsert drafts. Returns { found, created,
// skipped } so the admin sees what the run did. Idempotent: re-running only
// inserts events not already present (deduped by source URL).
router.post("/rmm/sync", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(user.id))) { res.status(403).json({ error: "Forbidden" }); return; }

  const result = await syncRmmEvents();
  if (result.error) {
    res.status(502).json({ error: "Scrape failed", detail: result.error });
    return;
  }
  res.json({ ok: true, feedSlug: RMM_FEED_SLUG, ...result });
});

export default router;
