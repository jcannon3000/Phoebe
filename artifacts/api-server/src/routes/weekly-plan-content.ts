/**
 * Weekly-plan CONTENT — the leader-authored kinds (pdf / deck / episode) for
 * the group weekly plan (NOT YET PUBLIC — client is behind WEEKLY_PLAN_ENABLED).
 *
 *   POST /groups/:slug/weekly-plan/pdf              raw application/pdf upload (admin)
 *   GET  /groups/:slug/weekly-plan/pdf/:pdfId       bytes back (members)
 *   POST /groups/:slug/weekly-plan/resolve-episode  paste-a-link → episode snapshot (admin)
 *
 * Plus sanitizeWeeklyPayload(), which the weekly-plan PUT in groups.ts calls
 * to validate each item's kind-specific payload (slide word caps, pdf
 * ownership, episode snapshot shape).
 *
 * SECURITY — resolve-episode is the app's first fetch of a USER-SUPPLIED URL
 * (routes/podcast.ts is safe because its registry is static). Every fetch here
 * goes through guardedUrl(): https-only, DNS-resolved, private / loopback /
 * link-local ranges refused. PDF uploads take the RAW body (base64-in-JSON
 * would inflate an 8 MB file past the global 10 MB express cap) and are
 * verified by magic bytes, and bytes are only ever served to authenticated
 * group members.
 */
import { Router } from "express";
import express from "express";
import dns from "node:dns/promises";
import net from "node:net";
import { eq, and } from "drizzle-orm";
import { db, groupWeeklyPdfsTable } from "@workspace/db";
import { getUser, requireMember, requireAdmin } from "./groups";
// (payload validation lives in ../lib/weeklyPayload — shared with groups.ts)
import { fetchFeedText, parseFeed } from "./podcast";

const router = Router();

const PDF_MAX_BYTES = 8 * 1024 * 1024;

// ── SSRF guard for leader-supplied URLs ──────────────────────────────────────
function isPrivateIp(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    return low === "::1" || low.startsWith("fe80:") || low.startsWith("fc") || low.startsWith("fd")
      || low.startsWith("::ffff:127.") || low.startsWith("::ffff:10.") || low.startsWith("::ffff:192.168.");
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254) // link-local / cloud metadata
    || a >= 224; // multicast + reserved
}

/** Parse + vet a leader-supplied URL: https only, public address only.
 *  Returns the URL or null. */
async function guardedUrl(raw: unknown): Promise<URL | null> {
  if (typeof raw !== "string" || raw.length > 2000) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  try {
    const addrs = await dns.lookup(url.hostname, { all: true });
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) return null;
  } catch { return null; }
  return url;
}

// ── PDF upload / serve ───────────────────────────────────────────────────────

// POST /groups/:slug/weekly-plan/pdf?filename=…&pages=… — raw application/pdf
// body. Admin-gated; magic-byte checked; 8 MB cap.
router.post(
  "/groups/:slug/weekly-plan/pdf",
  express.raw({ type: ["application/pdf", "application/octet-stream"], limit: "9mb" }),
  async (req, res): Promise<void> => {
    const user = getUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await requireAdmin(req.params.slug, user.id);
    if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) { res.status(400).json({ error: "empty_body" }); return; }
    if (buf.length > PDF_MAX_BYTES) { res.status(413).json({ error: "too_large" }); return; }
    // %PDF- magic bytes — the client's accept= filter is advisory only.
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") { res.status(415).json({ error: "not_a_pdf" }); return; }

    const filename = (typeof req.query.filename === "string" ? req.query.filename : "document.pdf")
      .replace(/[\r\n"\\/]+/g, " ").trim().slice(0, 160) || "document.pdf";
    const pagesRaw = Number(req.query.pages);
    const pageCount = Number.isInteger(pagesRaw) && pagesRaw > 0 && pagesRaw < 10_000 ? pagesRaw : null;

    const [inserted] = await db.insert(groupWeeklyPdfsTable).values({
      groupId: result.group.id, filename, byteSize: buf.length, pageCount,
      data: buf, createdByUserId: user.id,
    }).returning({ id: groupWeeklyPdfsTable.id });
    if (!inserted) { res.status(500).json({ error: "internal_error" }); return; }
    res.json({ pdfId: inserted.id, filename, byteSize: buf.length, pageCount });
  },
);

// GET /groups/:slug/weekly-plan/pdf/:pdfId — the bytes, members only. Never a
// public URL: distribution stays inside the community (the upload screen's
// permission attestation leans on this).
router.get("/groups/:slug/weekly-plan/pdf/:pdfId", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireMember(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Not a member" }); return; }
  const pdfId = Number(req.params.pdfId);
  if (!Number.isInteger(pdfId)) { res.status(400).json({ error: "bad_id" }); return; }
  const [row] = await db.select().from(groupWeeklyPdfsTable)
    .where(and(eq(groupWeeklyPdfsTable.id, pdfId), eq(groupWeeklyPdfsTable.groupId, result.group.id)))
    .limit(1);
  if (!row) { res.status(404).json({ error: "not_found" }); return; }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${row.filename.replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(row.data);
});

// ── Episode resolution ───────────────────────────────────────────────────────

type ResolvedEpisode = {
  title: string;
  showTitle: string | null;
  audioUrl: string;
  sourceUrl: string;
  imageUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
};

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|ogg|wav)(\?|#|$)/i;

// POST /groups/:slug/weekly-plan/resolve-episode { url } — turn a pasted link
// into an episode snapshot (or a pick-list when the link is a whole feed).
// Handles: bare audio URLs, Apple Podcasts episode/show links (iTunes Lookup
// API), RSS/XML feeds. Spotify is rejected honestly (no playable audio for
// third parties).
router.post("/groups/:slug/weekly-plan/resolve-episode", async (req, res): Promise<void> => {
  const user = getUser(req);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const result = await requireAdmin(req.params.slug, user.id);
  if (!result) { res.status(403).json({ error: "Admin access required" }); return; }

  const rawUrl = (req.body as { url?: unknown } | null)?.url;
  const url = await guardedUrl(rawUrl);
  if (!url) { res.status(400).json({ error: "bad_url", message: "Couldn't read that link — paste a full https:// URL." }); return; }

  if (/(^|\.)spotify\.com$/i.test(url.hostname)) {
    res.status(422).json({
      error: "spotify",
      message: "Spotify doesn't let other apps play its audio. Paste the Apple Podcasts link or the show's RSS feed instead — same episode, and it'll play right inside Phoebe.",
    });
    return;
  }

  try {
    // 1. Bare audio file — by extension, or by content-type on a HEAD probe.
    if (AUDIO_EXT_RE.test(url.pathname)) {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "Episode").replace(/\.[a-z0-9]+$/i, "");
      const ep: ResolvedEpisode = { title: name || "Episode", showTitle: null, audioUrl: url.toString(), sourceUrl: url.toString(), imageUrl: null, durationSeconds: null, publishedAt: null };
      res.json({ episode: ep });
      return;
    }

    // 2. Apple Podcasts — episode links carry ?i=<episodeId>; show links don't.
    if (/(^|\.)podcasts\.apple\.com$/i.test(url.hostname)) {
      const episodeId = url.searchParams.get("i");
      if (episodeId && /^\d+$/.test(episodeId)) {
        const lookup = await fetch(`https://itunes.apple.com/lookup?id=${episodeId}&entity=podcastEpisode`, { signal: AbortSignal.timeout(10_000) });
        const data = await lookup.json() as { results?: Array<Record<string, unknown>> };
        const hit = (data.results ?? []).find((r) => typeof r.episodeUrl === "string");
        if (hit) {
          const ep: ResolvedEpisode = {
            title: String(hit.trackName ?? "Episode").slice(0, 300),
            showTitle: typeof hit.collectionName === "string" ? hit.collectionName.slice(0, 200) : null,
            audioUrl: String(hit.episodeUrl),
            sourceUrl: url.toString(),
            imageUrl: typeof hit.artworkUrl600 === "string" ? hit.artworkUrl600 : (typeof hit.artworkUrl160 === "string" ? hit.artworkUrl160 : null),
            durationSeconds: typeof hit.trackTimeMillis === "number" ? Math.round(hit.trackTimeMillis / 1000) : null,
            publishedAt: typeof hit.releaseDate === "string" ? hit.releaseDate : null,
          };
          res.json({ episode: ep });
          return;
        }
      } else {
        // A show page — look up its RSS feed, then fall through to the feed path.
        const showId = url.pathname.match(/\/id(\d+)/)?.[1];
        if (showId) {
          const lookup = await fetch(`https://itunes.apple.com/lookup?id=${showId}`, { signal: AbortSignal.timeout(10_000) });
          const data = await lookup.json() as { results?: Array<Record<string, unknown>> };
          const feedUrl = data.results?.[0]?.feedUrl;
          const guarded = typeof feedUrl === "string" ? await guardedUrl(feedUrl) : null;
          if (guarded) {
            const feed = parseFeed(await fetchFeedText(guarded.toString()), 10);
            res.json({ episodes: toPickList(feed, guarded.toString()) });
            return;
          }
        }
      }
      res.status(422).json({ error: "not_found", message: "Couldn't find an episode at that link. Phoebe can fetch Apple Podcasts episodes, RSS feeds, and direct MP3 links." });
      return;
    }

    // 3. Anything else — try it as an RSS/XML feed.
    const feed = parseFeed(await fetchFeedText(url.toString()), 10);
    if (feed.episodes.some((e) => e.audioUrl)) {
      res.json({ episodes: toPickList(feed, url.toString()) });
      return;
    }
    res.status(422).json({ error: "not_found", message: "Couldn't find an episode at that link. Phoebe can fetch Apple Podcasts episodes, RSS feeds, and direct MP3 links." });
  } catch {
    res.status(422).json({ error: "fetch_failed", message: "Couldn't find an episode at that link. Phoebe can fetch Apple Podcasts episodes, RSS feeds, and direct MP3 links." });
  }
});

function toPickList(feed: ReturnType<typeof parseFeed>, sourceUrl: string): ResolvedEpisode[] {
  return feed.episodes
    .filter((e) => typeof e.audioUrl === "string" && e.audioUrl)
    .slice(0, 10)
    .map((e) => ({
      title: (e.title ?? "Episode").slice(0, 300),
      showTitle: feed.feedTitle,
      audioUrl: e.audioUrl!,
      sourceUrl,
      imageUrl: e.imageUrl ?? feed.feedImage,
      durationSeconds: e.durationSeconds,
      publishedAt: e.publishedAt,
    }));
}

export default router;
