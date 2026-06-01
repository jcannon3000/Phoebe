// ─── Generic ministry event scraper ──────────────────────────────────────────
//
// Backs the admin-managed "Scraped Ministries" feature (routes/ministries.ts).
// Each ministry_sources row points at an events page; this module fetches it
// and extracts upcoming events, which are written as state="draft" events on
// the source's prayer feed for an admin to review + publish.
//
// Extraction is best-effort, in priority order:
//   1. schema.org Event JSON-LD (<script type="application/ld+json">) — the
//      reliable path; many event sites and WordPress event plugins emit it.
//   2. A WordPress-post HTML heuristic (the RMM shape): each <li class=
//      "wp-block-post"> with a detail link + a "Month D, YYYY" date in its
//      text. Covers sites with no structured data, like Rural & Migrant
//      Ministry.
// Anything we can't pin to a date is skipped; past events are filtered out.
// The draft-review step absorbs imperfect parses.

import { db, prayerFeedsTable, prayerFeedEventsTable, ministrySourcesTable, sharedMomentsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import crypto from "crypto";
import { assertPublicHttpUrl } from "./ssrfGuard";
import type { MinistrySource } from "@workspace/db";

const FETCH_TIMEOUT_MS = 9000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15";

export type ParsedEvent = {
  title: string;
  sourceUrl: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  description: string | null;
};

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
const DATE_RE =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i;

function safeFromCodePoint(n: number): string {
  try { return String.fromCodePoint(n); } catch { return ""; }
}
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'");
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function todayUTCStart(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
// schema.org dates are ISO 8601. A date-only value (no time) parsed by Date
// lands at UTC midnight, which can render as the previous day in ET — so pin
// date-only values to noon UTC to keep the calendar day correct.
function parseSchemaDate(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map((n) => parseInt(n, 10));
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return ""; }
}
function absolutize(href: string, baseUrl: string): string {
  try { return new URL(href, baseUrl).toString(); } catch { return href; }
}

// ── schema.org Event JSON-LD ──────────────────────────────────────────
function flattenLd(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) { node.forEach((n) => flattenLd(n, out)); return; }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) flattenLd(obj["@graph"], out);
    out.push(obj);
  }
}
function isEventType(t: unknown): boolean {
  if (typeof t === "string") return /event$/i.test(t);
  if (Array.isArray(t)) return t.some((x) => typeof x === "string" && /event$/i.test(x));
  return false;
}
function ldLocation(loc: unknown): string | null {
  if (!loc) return null;
  if (typeof loc === "string") return loc.trim() || null;
  if (Array.isArray(loc)) return ldLocation(loc[0]);
  if (typeof loc === "object") {
    const o = loc as Record<string, unknown>;
    if (typeof o.name === "string" && o.name.trim()) return o.name.trim();
    const addr = o.address;
    if (typeof addr === "string") return addr.trim() || null;
    if (addr && typeof addr === "object") {
      const a = addr as Record<string, unknown>;
      const parts = [a.streetAddress, a.addressLocality, a.addressRegion]
        .filter((x) => typeof x === "string" && x.trim());
      if (parts.length) return parts.join(", ");
    }
  }
  return null;
}
function parseJsonLdEvents(html: string, baseUrl: string, now: Date): ParsedEvent[] {
  const out: ParsedEvent[] = [];
  const seen = new Set<string>();
  const today = todayUTCStart(now);
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const nodes: Record<string, unknown>[] = [];
  while ((m = re.exec(html)) !== null) {
    try { flattenLd(JSON.parse(m[1].trim()), nodes); } catch { /* malformed block */ }
  }
  for (const node of nodes) {
    if (!isEventType(node["@type"])) continue;
    const title = typeof node.name === "string" ? node.name.trim() : "";
    const startsAt = parseSchemaDate(node.startDate);
    if (!title || !startsAt) continue;
    if (Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth(), startsAt.getUTCDate()) < today) continue;
    const url = typeof node.url === "string" && node.url.trim() ? absolutize(node.url.trim(), baseUrl) : baseUrl;
    if (seen.has(url)) continue;
    seen.add(url);
    const desc = typeof node.description === "string" ? stripTags(node.description).slice(0, 400) : null;
    out.push({
      title: title.slice(0, 120),
      sourceUrl: url,
      startsAt,
      endsAt: parseSchemaDate(node.endDate),
      location: ldLocation(node.location),
      description: desc || null,
    });
  }
  return out;
}

// ── WordPress-post HTML heuristic (RMM shape) ─────────────────────────
function parseWpPostEvents(html: string, baseUrl: string, now: Date): ParsedEvent[] {
  const out: ParsedEvent[] = [];
  const seen = new Set<string>();
  const today = todayUTCStart(now);
  const origin = originOf(baseUrl).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!origin) return out;
  const linkRe = new RegExp(`href="(${origin}/[a-z0-9-]+/)"`, "i");

  const blockRe = /<li\b[^>]*class="[^"]*wp-block-post[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];
    const urlMatch = block.match(linkRe);
    if (!urlMatch) continue;
    const sourceUrl = urlMatch[1];
    if (seen.has(sourceUrl)) continue;

    let title = "";
    const anchorRe = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
    let a: RegExpExecArray | null;
    while ((a = anchorRe.exec(block)) !== null) {
      const t = stripTags(a[1]);
      if (t) { title = t; break; }
    }
    if (!title) continue;

    const text = stripTags(block);
    const d = text.match(DATE_RE);
    if (!d) continue;
    const month = MONTHS[d[1].toLowerCase()];
    const day = parseInt(d[2], 10);
    const year = parseInt(d[3], 10);
    if (month === undefined || !day || !year) continue;
    if (Date.UTC(year, month, day) < today) continue;

    seen.add(sourceUrl);
    out.push({
      title: title.slice(0, 120),
      sourceUrl,
      startsAt: new Date(Date.UTC(year, month, day, 12, 0, 0)),
      endsAt: null,
      location: null,
      description: text.slice(0, 400) || null,
    });
  }
  return out;
}

export function parseEvents(html: string, baseUrl: string, now: Date = new Date()): ParsedEvent[] {
  const ld = parseJsonLdEvents(html, baseUrl, now);
  if (ld.length > 0) return ld;
  return parseWpPostEvents(html, baseUrl, now);
}

// ── News / articles ───────────────────────────────────────────────────
export type ParsedArticle = { title: string; url: string; excerpt: string | null };

function isArticleType(t: unknown): boolean {
  const test = (x: unknown) => typeof x === "string" && /(Article|BlogPosting)$/i.test(x);
  return Array.isArray(t) ? t.some(test) : test(t);
}
function parseJsonLdArticles(html: string, baseUrl: string): ParsedArticle[] {
  const out: ParsedArticle[] = [];
  const seen = new Set<string>();
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const nodes: Record<string, unknown>[] = [];
  while ((m = re.exec(html)) !== null) {
    try { flattenLd(JSON.parse(m[1].trim()), nodes); } catch { /* malformed block */ }
  }
  for (const node of nodes) {
    if (!isArticleType(node["@type"])) continue;
    const title = typeof node.headline === "string" ? node.headline
      : typeof node.name === "string" ? node.name : "";
    const url = typeof node.url === "string" ? node.url
      : typeof node.mainEntityOfPage === "string" ? node.mainEntityOfPage : "";
    if (!title.trim() || !url.trim()) continue;
    const abs = absolutize(url.trim(), baseUrl);
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({
      title: title.trim().slice(0, 120),
      url: abs,
      excerpt: typeof node.description === "string" ? stripTags(node.description).slice(0, 300) || null : null,
    });
  }
  return out;
}
function parseWpPostArticles(html: string, baseUrl: string): ParsedArticle[] {
  const out: ParsedArticle[] = [];
  const seen = new Set<string>();
  const origin = originOf(baseUrl).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!origin) return out;
  const linkRe = new RegExp(`href="(${origin}/[a-z0-9-]+/)"`, "i");
  const blockRe = /<li\b[^>]*class="[^"]*wp-block-post[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];
    const urlMatch = block.match(linkRe);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    if (seen.has(url)) continue;
    let title = "";
    const anchorRe = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
    let a: RegExpExecArray | null;
    while ((a = anchorRe.exec(block)) !== null) {
      const t = stripTags(a[1]);
      if (t) { title = t; break; }
    }
    if (!title) continue;
    seen.add(url);
    const text = stripTags(block);
    const excerpt = (text.startsWith(title) ? text.slice(title.length) : text).trim();
    out.push({ title: title.slice(0, 120), url, excerpt: excerpt.slice(0, 300) || null });
  }
  return out;
}
// Articles, newest-first as they appear on the page. JSON-LD Article markup
// preferred; WordPress-post HTML heuristic as fallback (RMM's shape).
export function parseNews(html: string, baseUrl: string): ParsedArticle[] {
  const ld = parseJsonLdArticles(html, baseUrl);
  if (ld.length > 0) return ld;
  return parseWpPostArticles(html, baseUrl);
}

async function fetchPage(url: string): Promise<string> {
  // SSRF guard — url is an admin-configured ministry_sources page; still
  // reject internal/non-routable hosts before the server fetches it.
  await assertPublicHttpUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Site returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "ministry";
}

// Create the prayer feed a new ministry publishes to. Slug derived from the
// name, de-duped against existing feeds. Live + public so it's subscribable.
export async function ensureFeedForMinistry(name: string): Promise<number> {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const [existing] = await db.select({ id: prayerFeedsTable.id })
      .from(prayerFeedsTable).where(eq(prayerFeedsTable.slug, slug));
    if (!existing) break;
    slug = `${base}-${i}`;
  }
  const [row] = await db.insert(prayerFeedsTable).values({
    slug,
    title: name.slice(0, 80),
    state: "live",
    visibility: "public",
    kind: "general",
    timezone: "America/New_York",
    creatorUserId: null,
  }).returning({ id: prayerFeedsTable.id });
  return row.id;
}

export type SyncResult = {
  // events
  found: number; created: number; skipped: number;
  // news
  newsFound: number; newsCreated: number;
  error?: string;
};

function statusText(r: SyncResult): string {
  if (r.error) return `Error: ${r.error}`;
  const parts = [`${r.created} event draft${r.created === 1 ? "" : "s"} (of ${r.found})`];
  if (r.newsFound > 0 || r.newsCreated > 0) parts.push(`${r.newsCreated} news`);
  return `Added ${parts.join(", ")}`;
}

function genToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

// Scrape upcoming events → draft events on the feed, deduped by joinUrl.
async function syncEvents(source: MinistrySource): Promise<{ found: number; created: number; skipped: number }> {
  const html = await fetchPage(source.eventsUrl);
  const parsed = parseEvents(html, source.eventsUrl);
  if (parsed.length === 0) return { found: 0, created: 0, skipped: 0 };
  const urls = parsed.map((e) => e.sourceUrl);
  const existingRows = await db.select({ joinUrl: prayerFeedEventsTable.joinUrl })
    .from(prayerFeedEventsTable)
    .where(and(eq(prayerFeedEventsTable.feedId, source.feedId), inArray(prayerFeedEventsTable.joinUrl, urls)));
  const existing = new Set(existingRows.map((r) => r.joinUrl));
  const toInsert = parsed.filter((e) => !existing.has(e.sourceUrl));
  if (toInsert.length > 0) {
    await db.insert(prayerFeedEventsTable).values(toInsert.map((e) => ({
      feedId: source.feedId,
      title: e.title,
      description: e.description,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      location: e.location,
      joinUrl: e.sourceUrl,
      state: "draft",
      createdByUserId: null,
    })));
  }
  return { found: parsed.length, created: toInsert.length, skipped: parsed.length - toInsert.length };
}

// Turn a scraped article into an auto-published feed card with a "Learn
// more →" link to the article (intercessionSource "custom" + learnMoreUrl).
// Deduped by learnMoreUrl. Returns true if newly inserted.
async function createNewsIntercession(feedId: number, article: ParsedArticle): Promise<boolean> {
  const [existing] = await db.select({ id: sharedMomentsTable.id })
    .from(sharedMomentsTable)
    .where(and(eq(sharedMomentsTable.prayerFeedId, feedId), eq(sharedMomentsTable.learnMoreUrl, article.url)));
  if (existing) return false;
  const [moment] = await db.insert(sharedMomentsTable).values({
    prayerFeedId: feedId,
    groupId: null,
    name: article.title,
    intention: article.title,
    intercessionTopic: article.title,
    intercessionFullText: article.excerpt ?? "",
    intercessionSource: "custom",
    templateType: "intercession",
    loggingType: "photo",
    frequency: "daily",
    scheduledTime: "09:30",
    timezone: "America/New_York",
    windowMinutes: 60,
    goalDays: 30,
    state: "active",
    momentToken: genToken(),
    learnMoreUrl: article.url,
    learnMoreTitle: article.title,
    // Scraped news doesn't fan out a "new intercession" push — it would
    // spam subscribers with every article. The cards just appear in-feed.
    notifySubscribersAt: null,
    publishedByUserId: null,
  }).returning({ id: sharedMomentsTable.id });
  // Give subscribers tokens so the card behaves like any feed intercession.
  // Best-effort: a failure still leaves the card visible.
  try {
    const { reconcileFeedPracticeMembers } = await import("../routes/groups");
    await reconcileFeedPracticeMembers(moment.id);
  } catch { /* tokens reconcile on next subscribe */ }
  return true;
}

// Scrape the news page (if set) → auto-publish new articles as feed cards.
async function syncNews(source: MinistrySource): Promise<{ found: number; created: number }> {
  if (!source.newsUrl) return { found: 0, created: 0 };
  const html = await fetchPage(source.newsUrl);
  const articles = parseNews(html, source.newsUrl).slice(0, 12);
  let created = 0;
  for (const a of articles) {
    if (await createNewsIntercession(source.feedId, a)) created++;
  }
  return { found: articles.length, created };
}

// Scrape one source's events (drafts) + news (auto-published) and stamp
// last_status / last_synced_at. News failures don't fail the whole run.
export async function syncMinistrySource(source: MinistrySource): Promise<SyncResult> {
  let result: SyncResult;
  try {
    const ev = await syncEvents(source);
    let news = { found: 0, created: 0 };
    try { news = await syncNews(source); } catch { /* news is best-effort */ }
    result = { ...ev, newsFound: news.found, newsCreated: news.created };
  } catch (err) {
    result = { found: 0, created: 0, skipped: 0, newsFound: 0, newsCreated: 0, error: err instanceof Error ? err.message : String(err) };
  }
  await db.update(ministrySourcesTable)
    .set({ lastStatus: statusText(result), lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(ministrySourcesTable.id, source.id));
  return result;
}

// Add a ministry: create its feed, the source row, and run an initial sync.
export async function createMinistrySource(name: string, eventsUrl: string, newsUrl?: string | null): Promise<{ source: MinistrySource; result: SyncResult }> {
  const feedId = await ensureFeedForMinistry(name);
  const [source] = await db.insert(ministrySourcesTable)
    .values({ name: name.slice(0, 120), eventsUrl, newsUrl: newsUrl || null, feedId })
    .returning();
  const result = await syncMinistrySource(source);
  return { source, result };
}

// Scrape every enabled source once (sequential to be gentle on the sites).
// Backs both the admin "Sync all" button and the daily scheduler.
export async function syncAllEnabledMinistries(): Promise<{ sources: number; created: number }> {
  const sources = await db.select().from(ministrySourcesTable).where(eq(ministrySourcesTable.enabled, true));
  let created = 0;
  for (const s of sources) {
    const r = await syncMinistrySource(s);
    created += r.created;
  }
  return { sources: sources.length, created };
}

// ─── Daily auto-sync scheduler ────────────────────────────────────────
// Re-scrapes every enabled ministry once a day so new upcoming events show
// up as drafts without anyone tapping "Sync". Idempotent (deduped by
// joinUrl), so re-runs only add genuinely-new events; per-source errors are
// recorded in last_status, not thrown. Registered by the worker service in
// production and by the in-web boot path for single-process dev.
let schedulerTimer: ReturnType<typeof setInterval> | undefined;
export function startMinistrySyncScheduler(): void {
  if (schedulerTimer) return;
  const DAY_MS = 24 * 60 * 60 * 1000;
  // First pass ~90s after boot (DB pool warm) so a fresh deploy catches new
  // events without waiting a full day; then daily.
  setTimeout(() => { void syncAllEnabledMinistries().catch(() => { /* per-source status records the error */ }); }, 90_000);
  schedulerTimer = setInterval(() => { void syncAllEnabledMinistries().catch(() => { /* swallow — next run retries */ }); }, DAY_MS);
}
