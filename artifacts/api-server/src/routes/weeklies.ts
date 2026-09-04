import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { isSuperAdminUser } from "../lib/superAdmin";
import { feedPosts, resolveLink, slugFor, proposeCopy, type WeeklyPost } from "../lib/weeklyFeed";

/**
 * Dynamic WEEKLY newsletters — any Substack an admin pastes in (see
 * lib/weeklyFeed.ts for the owner's ask).
 *
 * Subscriptions live in their own table, NOT in the home layout: the layout is
 * a fixed allowlist on the server (cleanHomeLayout strips unknown keys and
 * backfills known ones) and the customizer hides keys it doesn't recognise on
 * every save — a dynamic key would be stripped or switched off by machinery
 * that has bitten this codebase repeatedly. One table, read by the Newsletters
 * page, the home card, the customizer's reflections step and the push.
 */

const router: IRouter = Router();

function uid(req: Request): number | null {
  const u = req.user as { id?: number } | undefined;
  return typeof u?.id === "number" ? u.id : null;
}

export type WeeklySource = {
  slug: string; siteUrl: string; feedUrl: string;
  title: string; subtitle: string; description: string; emoji: string; enabled: boolean;
};

type Row = { slug: string; site_url: string; feed_url: string; title: string; subtitle: string; description: string; emoji: string; enabled: boolean };
const toSource = (r: Row): WeeklySource => ({
  slug: r.slug, siteUrl: r.site_url, feedUrl: r.feed_url, title: r.title, subtitle: r.subtitle,
  description: r.description, emoji: r.emoji || "📰", enabled: !!r.enabled,
});

export async function listWeeklySources(all = false): Promise<WeeklySource[]> {
  const res = await db.execute<Row>(all
    ? sql`SELECT slug, site_url, feed_url, title, subtitle, description, emoji, enabled FROM weekly_sources ORDER BY created_at`
    : sql`SELECT slug, site_url, feed_url, title, subtitle, description, emoji, enabled FROM weekly_sources WHERE enabled ORDER BY created_at`);
  return res.rows.map(toSource);
}

export async function weeklySubscriberIds(slug: string): Promise<number[]> {
  const res = await db.execute<{ user_id: number }>(sql`
    SELECT s.user_id FROM weekly_subscriptions s JOIN users u ON u.id = s.user_id
    WHERE s.slug = ${slug} AND u.push_enabled IS DISTINCT FROM false`);
  return res.rows.map((r) => Number(r.user_id));
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const RESERVED = new Set(["taize", "andrews", "latest"]);

// GET /api/weeklies → the enabled sources, with `subscribed` for the caller.
router.get("/weeklies", async (req: Request, res: Response): Promise<void> => {
  const sources = await listWeeklySources();
  const userId = uid(req);
  let mine = new Set<string>();
  if (userId != null && sources.length > 0) {
    const r = await db.execute<{ slug: string }>(sql`SELECT slug FROM weekly_subscriptions WHERE user_id = ${userId}`);
    mine = new Set(r.rows.map((x) => x.slug));
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(sources.map((s) => ({ ...s, subscribed: mine.has(s.slug) })));
});

// GET /api/weeklies/latest → { [slug]: newest post | null } for the enabled sources.
router.get("/weeklies/latest", async (_req: Request, res: Response): Promise<void> => {
  const sources = await listWeeklySources();
  const out: Record<string, WeeklyPost | null> = {};
  await Promise.all(sources.map(async (s) => { out[s.slug] = (await feedPosts(s.feedUrl))[0] ?? null; }));
  res.setHeader("Cache-Control", "public, max-age=900");
  res.json(out);
});

// GET /api/weeklies/:slug/posts → newest first, up to ten (the reader's "Previous").
router.get("/weeklies/:slug/posts", async (req: Request, res: Response): Promise<void> => {
  const slug = String(req.params.slug ?? "");
  const src = (await listWeeklySources()).find((s) => s.slug === slug);
  if (!src) { res.status(404).json({ error: "not found" }); return; }
  res.setHeader("Cache-Control", "public, max-age=900");
  res.json(await feedPosts(src.feedUrl));
});

// PUT /api/weeklies/:slug/subscription { on } — follow / unfollow.
router.put("/weeklies/:slug/subscription", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(req);
  if (userId == null) { res.status(401).json({ error: "unauthorized" }); return; }
  const slug = String(req.params.slug ?? "");
  const on = !!(req.body as { on?: unknown })?.on;
  const src = (await listWeeklySources()).find((s) => s.slug === slug);
  if (!src) { res.status(404).json({ error: "not found" }); return; }
  if (on) {
    await db.execute(sql`INSERT INTO weekly_subscriptions (user_id, slug) VALUES (${userId}, ${slug}) ON CONFLICT DO NOTHING`);
  } else {
    await db.execute(sql`DELETE FROM weekly_subscriptions WHERE user_id = ${userId} AND slug = ${slug}`);
  }
  res.json({ slug, subscribed: on });
});

// ── Admin ───────────────────────────────────────────────────────────────────
async function admin(req: Request, res: Response): Promise<number | null> {
  const userId = uid(req);
  if (userId == null) { res.status(401).json({ error: "unauthorized" }); return null; }
  if (!(await isSuperAdminUser(userId))) { res.status(403).json({ error: "forbidden" }); return null; }
  return userId;
}

router.get("/admin/weeklies", async (req: Request, res: Response): Promise<void> => {
  if ((await admin(req, res)) == null) return;
  res.setHeader("Cache-Control", "no-store");
  res.json(await listWeeklySources(true));
});

// POST /api/admin/weeklies/preview { url } → the feed, a slug, and proposed copy.
router.post("/admin/weeklies/preview", async (req: Request, res: Response): Promise<void> => {
  if ((await admin(req, res)) == null) return;
  const url = String((req.body as { url?: unknown })?.url ?? "").trim();
  if (!url) { res.status(400).json({ error: "Paste a link first." }); return; }
  try {
    const r = await resolveLink(url);
    const { proposal, by } = await proposeCopy(r.channel, r.posts);
    const slug = slugFor(r.siteUrl);
    const exists = (await listWeeklySources(true)).some((s) => s.slug === slug);
    res.json({ siteUrl: r.siteUrl, feedUrl: r.feedUrl, slug, exists, channel: r.channel, posts: r.posts.slice(0, 5), proposal, proposedBy: by });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : "Could not read that feed." });
  }
});

// POST /api/admin/weeklies { url, slug, title, subtitle, description, emoji } → create (or update by slug).
router.post("/admin/weeklies", async (req: Request, res: Response): Promise<void> => {
  const userId = await admin(req, res);
  if (userId == null) return;
  const b = (req.body ?? {}) as Record<string, unknown>;
  const url = String(b.url ?? "").trim();
  const slug = String(b.slug ?? "").trim().toLowerCase();
  const title = String(b.title ?? "").trim().slice(0, 60);
  const subtitle = String(b.subtitle ?? "").trim().slice(0, 80);
  const description = String(b.description ?? "").trim().slice(0, 240);
  const emoji = String(b.emoji ?? "📰").trim().slice(0, 4) || "📰";
  if (!SLUG_RE.test(slug) || RESERVED.has(slug)) { res.status(400).json({ error: "That slug can't be used." }); return; }
  if (!title) { res.status(400).json({ error: "A title is needed." }); return; }
  let r;
  try { r = await resolveLink(url); } catch (err) { res.status(422).json({ error: err instanceof Error ? err.message : "Could not read that feed." }); return; }
  await db.execute(sql`
    INSERT INTO weekly_sources (slug, site_url, feed_url, title, subtitle, description, emoji, enabled, created_by)
    VALUES (${slug}, ${r.siteUrl}, ${r.feedUrl}, ${title}, ${subtitle}, ${description}, ${emoji}, TRUE, ${userId})
    ON CONFLICT (slug) DO UPDATE SET site_url = EXCLUDED.site_url, feed_url = EXCLUDED.feed_url, title = EXCLUDED.title,
      subtitle = EXCLUDED.subtitle, description = EXCLUDED.description, emoji = EXCLUDED.emoji, enabled = TRUE`);
  res.json((await listWeeklySources(true)).find((s) => s.slug === slug));
});

router.delete("/admin/weeklies/:slug", async (req: Request, res: Response): Promise<void> => {
  if ((await admin(req, res)) == null) return;
  const slug = String(req.params.slug ?? "");
  await db.execute(sql`DELETE FROM weekly_sources WHERE slug = ${slug}`);
  res.json({ ok: true });
});

export default router;
