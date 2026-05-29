import { Router, type IRouter, type RequestHandler } from "express";
import { eq, and, desc, max, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  podcastListensTable,
  podcastRecommendationsTable,
  podcastListenListTable,
} from "@workspace/db";
import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────
// Podcast engagement — listening history + community recommendations
// ─────────────────────────────────────────────────────────────────────────
//
// Per-user, available to every signed-in user (podcasts aren't beta-
// only). Episodes live in external feeds, so the client sends an episode
// SNAPSHOT (title/audio/art/…) with each write; we store it so history +
// the community feed render without re-fetching feeds.
//
// Recommendations are a single shared community pool — recommending an
// episode surfaces it on the /podcasts "Community" tab for everyone.

const router: IRouter = Router();

type SessionUser = { id: number; name: string; email: string };
function getUser(req: any): SessionUser | null {
  return req.user ? (req.user as SessionUser) : null;
}
const requireAuth: RequestHandler = (req, res, next) => {
  if (!getUser(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  next();
};

// Episode snapshot the client sends with a listen / recommendation.
const snapshotSchema = z.object({
  showSlug: z.string().min(1).max(120),
  episodeId: z.string().min(1).max(512),
  episodeTitle: z.string().max(500).optional(),
  episodeAudioUrl: z.string().max(2000).optional(),
  episodeImageUrl: z.string().max(2000).optional(),
  durationSeconds: z.number().int().min(0).max(360000).optional(),
  publishedAt: z.string().max(120).optional(),
  showTitle: z.string().max(300).optional(),
  showArtwork: z.string().max(2000).optional(),
});

function snapshotValues(s: z.infer<typeof snapshotSchema>) {
  return {
    showSlug: s.showSlug,
    episodeId: s.episodeId,
    episodeTitle: s.episodeTitle ?? null,
    episodeAudioUrl: s.episodeAudioUrl ?? null,
    episodeImageUrl: s.episodeImageUrl ?? null,
    durationSeconds: s.durationSeconds ?? null,
    publishedAt: s.publishedAt ?? null,
    showTitle: s.showTitle ?? null,
    showArtwork: s.showArtwork ?? null,
  };
}

// ── POST /api/podcasts/listens — record (upsert) a listen ─────────────────
router.post("/podcasts/listens", requireAuth, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const parsed = snapshotSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid episode" }); return; }
  const v = snapshotValues(parsed.data);
  await db.insert(podcastListensTable)
    .values({ userId: me.id, ...v })
    .onConflictDoUpdate({
      target: [podcastListensTable.userId, podcastListensTable.showSlug, podcastListensTable.episodeId],
      set: {
        lastListenedAt: new Date(),
        // Refresh the snapshot in case titles/art changed.
        episodeTitle: v.episodeTitle,
        episodeAudioUrl: v.episodeAudioUrl,
        episodeImageUrl: v.episodeImageUrl,
        durationSeconds: v.durationSeconds,
        publishedAt: v.publishedAt,
        showTitle: v.showTitle,
        showArtwork: v.showArtwork,
      },
    });
  res.json({ ok: true });
});

// ── GET /api/podcasts/me — my listened + recommended + listen-list keys ───
// Keys are `${showSlug}:${episodeId}` — the client marks rows with these.
router.get("/podcasts/me", requireAuth, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const [listens, recs, queue] = await Promise.all([
    db.select({ showSlug: podcastListensTable.showSlug, episodeId: podcastListensTable.episodeId })
      .from(podcastListensTable).where(eq(podcastListensTable.userId, me.id)),
    db.select({ showSlug: podcastRecommendationsTable.showSlug, episodeId: podcastRecommendationsTable.episodeId })
      .from(podcastRecommendationsTable).where(eq(podcastRecommendationsTable.userId, me.id)),
    db.select({ showSlug: podcastListenListTable.showSlug, episodeId: podcastListenListTable.episodeId })
      .from(podcastListenListTable).where(eq(podcastListenListTable.userId, me.id)),
  ]);
  res.json({
    listenedKeys: listens.map((l) => `${l.showSlug}:${l.episodeId}`),
    recommendedKeys: recs.map((r) => `${r.showSlug}:${r.episodeId}`),
    listenListKeys: queue.map((q) => `${q.showSlug}:${q.episodeId}`),
  });
});

// ── GET /api/podcasts/listens — full listen history with snapshots ────────
// Used by the client's partial-listen import to find episodes that have
// a saved resume position and need adding to the listen list.
router.get("/podcasts/listens", requireAuth, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const rows = await db.select()
    .from(podcastListensTable)
    .where(eq(podcastListensTable.userId, me.id))
    .orderBy(desc(podcastListensTable.lastListenedAt))
    .limit(500);
  res.json({ listens: rows });
});

// ── POST /api/podcasts/recommendations — recommend (upsert) ───────────────
router.post("/podcasts/recommendations", requireAuth, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const parsed = snapshotSchema.extend({ note: z.string().trim().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid episode" }); return; }
  const v = snapshotValues(parsed.data);
  const note = parsed.data.note?.trim() || null;
  await db.insert(podcastRecommendationsTable)
    .values({ userId: me.id, ...v, note })
    .onConflictDoUpdate({
      target: [podcastRecommendationsTable.userId, podcastRecommendationsTable.showSlug, podcastRecommendationsTable.episodeId],
      set: { note, createdAt: new Date(), episodeTitle: v.episodeTitle, episodeAudioUrl: v.episodeAudioUrl, episodeImageUrl: v.episodeImageUrl, durationSeconds: v.durationSeconds, publishedAt: v.publishedAt, showTitle: v.showTitle, showArtwork: v.showArtwork },
    });
  res.status(201).json({ ok: true, recommended: true });
});

// ── DELETE /api/podcasts/recommendations — un-recommend ───────────────────
router.delete("/podcasts/recommendations", requireAuth, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const schema = z.object({ showSlug: z.string().min(1), episodeId: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  await db.delete(podcastRecommendationsTable).where(and(
    eq(podcastRecommendationsTable.userId, me.id),
    eq(podcastRecommendationsTable.showSlug, parsed.data.showSlug),
    eq(podcastRecommendationsTable.episodeId, parsed.data.episodeId),
  ));
  res.json({ ok: true, recommended: false });
});

// ── GET /api/podcasts/recommendations — the community feed ────────────────
// Every recommendation across the community, grouped by episode. Each
// group carries the episode snapshot + its recommenders (deduped) and a
// count, newest-recommendation first.
router.get("/podcasts/recommendations", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db.select({
    showSlug: podcastRecommendationsTable.showSlug,
    episodeId: podcastRecommendationsTable.episodeId,
    episodeTitle: podcastRecommendationsTable.episodeTitle,
    episodeAudioUrl: podcastRecommendationsTable.episodeAudioUrl,
    episodeImageUrl: podcastRecommendationsTable.episodeImageUrl,
    durationSeconds: podcastRecommendationsTable.durationSeconds,
    publishedAt: podcastRecommendationsTable.publishedAt,
    showTitle: podcastRecommendationsTable.showTitle,
    showArtwork: podcastRecommendationsTable.showArtwork,
    note: podcastRecommendationsTable.note,
    createdAt: podcastRecommendationsTable.createdAt,
    recUserId: usersTable.id,
    recName: usersTable.name,
    recAvatar: usersTable.avatarUrl,
  })
    .from(podcastRecommendationsTable)
    .innerJoin(usersTable, eq(usersTable.id, podcastRecommendationsTable.userId))
    .orderBy(desc(podcastRecommendationsTable.createdAt))
    .limit(400);

  type Recommender = { id: number; name: string; avatarUrl: string | null; note: string | null };
  type Group = {
    key: string;
    showSlug: string;
    episodeId: string;
    episodeTitle: string | null;
    episodeAudioUrl: string | null;
    episodeImageUrl: string | null;
    durationSeconds: number | null;
    publishedAt: string | null;
    showTitle: string | null;
    showArtwork: string | null;
    latestAt: string;
    recommenders: Recommender[];
  };
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const key = `${r.showSlug}:${r.episodeId}`;
    let g = groups.get(key);
    if (!g) {
      // First (most recent) row for this episode supplies the snapshot.
      g = {
        key,
        showSlug: r.showSlug,
        episodeId: r.episodeId,
        episodeTitle: r.episodeTitle,
        episodeAudioUrl: r.episodeAudioUrl,
        episodeImageUrl: r.episodeImageUrl,
        durationSeconds: r.durationSeconds,
        publishedAt: r.publishedAt,
        showTitle: r.showTitle,
        showArtwork: r.showArtwork,
        latestAt: String(r.createdAt),
        recommenders: [],
      };
      groups.set(key, g);
    }
    if (!g.recommenders.some((x) => x.id === r.recUserId)) {
      g.recommenders.push({ id: r.recUserId, name: r.recName, avatarUrl: r.recAvatar, note: r.note });
    }
  }
  const recommendations = [...groups.values()]
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
    .slice(0, 80);

  res.json({ recommendations });
});

// ── GET /api/podcasts/listen-list — my ordered queue ──────────────────────
router.get("/podcasts/listen-list", requireAuth, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const rows = await db.select()
    .from(podcastListenListTable)
    .where(eq(podcastListenListTable.userId, me.id))
    .orderBy(podcastListenListTable.position);
  res.json({ items: rows });
});

// ── POST /api/podcasts/listen-list — add episode (appends to end) ─────────
router.post("/podcasts/listen-list", requireAuth, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const parsed = snapshotSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid episode" }); return; }
  const v = snapshotValues(parsed.data);

  // Compute next position = max(position) + 1 for this user, or 0 if empty.
  const [{ maxPos }] = await db
    .select({ maxPos: max(podcastListenListTable.position) })
    .from(podcastListenListTable)
    .where(eq(podcastListenListTable.userId, me.id));
  const position = maxPos != null ? maxPos + 1 : 0;

  await db.insert(podcastListenListTable)
    .values({ userId: me.id, ...v, position })
    .onConflictDoNothing(); // already in list — no-op
  res.status(201).json({ ok: true });
});

// ── DELETE /api/podcasts/listen-list — remove episode ────────────────────
router.delete("/podcasts/listen-list", requireAuth, async (req, res): Promise<void> => {
  const me = getUser(req)!;
  const schema = z.object({ showSlug: z.string().min(1), episodeId: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }
  await db.delete(podcastListenListTable).where(and(
    eq(podcastListenListTable.userId, me.id),
    eq(podcastListenListTable.showSlug, parsed.data.showSlug),
    eq(podcastListenListTable.episodeId, parsed.data.episodeId),
  ));
  res.json({ ok: true });
});

export default router;
