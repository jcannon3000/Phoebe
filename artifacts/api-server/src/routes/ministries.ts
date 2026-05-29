import { Router, type IRouter, type RequestHandler } from "express";
import { db, usersTable, betaUsersTable, ministrySourcesTable, prayerFeedsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { createMinistrySource, syncMinistrySource, syncAllEnabledMinistries } from "../lib/ministryScraper";

// ─── Scraped Ministries admin API ────────────────────────────────────────────
//
// Beta-admin CRUD over ministry_sources (websites Phoebe scrapes for events)
// plus on-demand sync. Each source has a dedicated prayer feed; scraped
// events land there as drafts to review (see lib/ministryScraper.ts and the
// "Scraped Ministries" admin screen).

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
// Per-route gate (this router is mounted at root, so router-level use() would
// run for every request in the app — gate each route instead).
const requireAdmin: RequestHandler = async (req, res, next) => {
  const u = getUser(req);
  if (!u) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (!(await isBetaAdmin(u.id))) { res.status(403).json({ error: "Forbidden" }); return; }
  next();
};

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  eventsUrl: z.string().trim().url().max(500),
  newsUrl: z.string().trim().url().max(500).optional().nullable(),
});
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  eventsUrl: z.string().trim().url().max(500).optional(),
  newsUrl: z.string().trim().url().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
});

// GET /api/ministries — list sources with their feed slug.
router.get("/ministries", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select({
    id: ministrySourcesTable.id,
    name: ministrySourcesTable.name,
    eventsUrl: ministrySourcesTable.eventsUrl,
    newsUrl: ministrySourcesTable.newsUrl,
    feedId: ministrySourcesTable.feedId,
    enabled: ministrySourcesTable.enabled,
    lastStatus: ministrySourcesTable.lastStatus,
    lastSyncedAt: ministrySourcesTable.lastSyncedAt,
    feedSlug: prayerFeedsTable.slug,
  })
    .from(ministrySourcesTable)
    .leftJoin(prayerFeedsTable, eq(prayerFeedsTable.id, ministrySourcesTable.feedId))
    .orderBy(desc(ministrySourcesTable.createdAt));
  res.json({ sources: rows });
});

// POST /api/ministries — add a ministry (creates its feed + runs first sync).
router.post("/ministries", requireAdmin, async (req, res): Promise<void> => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", issues: parsed.error.issues }); return; }
  const { source, result } = await createMinistrySource(parsed.data.name, parsed.data.eventsUrl, parsed.data.newsUrl ?? null);
  res.json({ source, result });
});

// PATCH /api/ministries/:id — rename / change URL / enable-disable.
router.patch("/ministries/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input", issues: parsed.error.issues }); return; }
  const [row] = await db.update(ministrySourcesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(ministrySourcesTable.id, id))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ source: row });
});

// DELETE /api/ministries/:id — remove the source. The feed + its events are
// kept (so published events don't vanish); delete the feed separately if
// wanted.
router.delete("/ministries/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad id" }); return; }
  await db.delete(ministrySourcesTable).where(eq(ministrySourcesTable.id, id));
  res.json({ ok: true });
});

// POST /api/ministries/:id/sync — scrape one source now.
router.post("/ministries/:id/sync", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Bad id" }); return; }
  const [source] = await db.select().from(ministrySourcesTable).where(eq(ministrySourcesTable.id, id));
  if (!source) { res.status(404).json({ error: "Not found" }); return; }
  const result = await syncMinistrySource(source);
  res.json({ result });
});

// POST /api/ministries/sync-all — scrape every enabled source (sequential).
router.post("/ministries/sync-all", requireAdmin, async (_req, res): Promise<void> => {
  const r = await syncAllEnabledMinistries();
  res.json({ ok: true, ...r });
});

export default router;
