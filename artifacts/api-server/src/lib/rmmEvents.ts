// ─── Rural & Migrant Ministry — event scraper ────────────────────────────────
//
// RMM (ruralmigrantministry.org) publishes happenings as ordinary WordPress
// posts on /events/. There's no events plugin, iCal/JSON feed, or open REST
// API (it 401s), so this is HTML scraping of the server-rendered Query Loop:
// each event is an <li class="wp-block-post"> with a detail-page link, a
// title, and the date written in prose ("…on Tuesday, May 19, 2026, …").
//
// Because the source is prose with no times and mixes past recaps with
// upcoming events, scraped events land as state="draft" on the RMM prayer
// feed (hidden from subscribers — non-creators only ever see "published")
// for a Phoebe admin to confirm the date/time/location and publish. We only
// import events whose parsed date is today-or-later, which keeps the past
// recaps out. The RMM detail-page URL is stored as the event's joinUrl: it's
// both the "go to the event" link AND the dedup key across re-scrapes.

import { db, prayerFeedsTable, prayerFeedEventsTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";

export const RMM_FEED_SLUG = "rmm";
const RMM_EVENTS_URL = "https://ruralmigrantministry.org/events/";
const FETCH_TIMEOUT_MS = 8000;
// A browser UA — the site serves a stripped page to unknown agents.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15";

export type ParsedRmmEvent = {
  title: string;
  sourceUrl: string;
  startsAt: Date;
  description: string | null;
};

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};
// "May 30, 2026" / "April 3, 2026" — the one date shape RMM writes
// consistently. Ranges ("March 15 – March 20") and month-only ("February
// 2026") are intentionally NOT matched: they can't be pinned to a day, so we
// leave them for manual entry rather than guess.
const DATE_RE =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})\b/i;

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
function safeFromCodePoint(n: number): string {
  try { return String.fromCodePoint(n); } catch { return ""; }
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// Pure parser — separated from the fetch so the date/upcoming logic is
// deterministic and testable. `now` is injectable for the same reason.
export function parseRmmEvents(html: string, now: Date = new Date()): ParsedRmmEvent[] {
  const out: ParsedRmmEvent[] = [];
  const seen = new Set<string>();
  // Today's calendar day (UTC). An event is "upcoming" if its day is >=
  // today's; the noon-UTC start we assign keeps it on the right ET day.
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const blockRe = /<li\b[^>]*class="[^"]*wp-block-post[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const block = m[1];

    const urlMatch = block.match(/href="(https:\/\/ruralmigrantministry\.org\/[a-z0-9-]+\/)"/i);
    if (!urlMatch) continue;
    const sourceUrl = urlMatch[1];
    if (seen.has(sourceUrl)) continue;

    // Title = first anchor with non-empty text (the featured-image anchor
    // wraps only an <img>, so it strips to "" and is skipped).
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
    if (Date.UTC(year, month, day) < todayUTC) continue; // past — skip

    seen.add(sourceUrl);
    out.push({
      title,
      sourceUrl,
      // Noon UTC on the event's day — a placeholder the reviewing admin
      // fixes; keeps the date on the correct ET calendar day in the UI.
      startsAt: new Date(Date.UTC(year, month, day, 12, 0, 0)),
      description: text.slice(0, 400) || null,
    });
  }
  return out;
}

async function fetchEventsPage(): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(RMM_EVENTS_URL, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`RMM events page returned ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// Idempotent: create the RMM platform feed (no human creator) if missing,
// returning its id. Live + public so it shows in discovery and can be
// subscribed; events on it are gated separately by their own state.
export async function ensureRmmFeed(): Promise<number> {
  const [existing] = await db
    .select({ id: prayerFeedsTable.id })
    .from(prayerFeedsTable)
    .where(eq(prayerFeedsTable.slug, RMM_FEED_SLUG));
  if (existing) return existing.id;
  const [row] = await db
    .insert(prayerFeedsTable)
    .values({
      slug: RMM_FEED_SLUG,
      title: "Rural & Migrant Ministry",
      tagline: "Hope, justice & empowerment in rural New York",
      state: "live",
      visibility: "public",
      kind: "general",
      timezone: "America/New_York",
      creatorUserId: null,
    })
    .returning({ id: prayerFeedsTable.id });
  return row.id;
}

export type RmmSyncResult = { found: number; created: number; skipped: number; error?: string };

// Scrape the events page and upsert upcoming dated events as DRAFTS on the
// RMM feed, deduped by joinUrl (the RMM detail page). Existing events (any
// state) are left untouched so admin edits/publishes/cancels stick.
export async function syncRmmEvents(): Promise<RmmSyncResult> {
  try {
    const feedId = await ensureRmmFeed();
    const html = await fetchEventsPage();
    const parsed = parseRmmEvents(html);
    if (parsed.length === 0) return { found: 0, created: 0, skipped: 0 };

    const urls = parsed.map((e) => e.sourceUrl);
    const existingRows = await db
      .select({ joinUrl: prayerFeedEventsTable.joinUrl })
      .from(prayerFeedEventsTable)
      .where(and(
        eq(prayerFeedEventsTable.feedId, feedId),
        inArray(prayerFeedEventsTable.joinUrl, urls),
      ));
    const existing = new Set(existingRows.map((r) => r.joinUrl));

    const toInsert = parsed.filter((e) => !existing.has(e.sourceUrl));
    if (toInsert.length > 0) {
      await db.insert(prayerFeedEventsTable).values(
        toInsert.map((e) => ({
          feedId,
          title: e.title.slice(0, 120),
          description: e.description,
          startsAt: e.startsAt,
          joinUrl: e.sourceUrl,
          state: "draft",
          createdByUserId: null,
        })),
      );
    }
    return { found: parsed.length, created: toInsert.length, skipped: parsed.length - toInsert.length };
  } catch (err) {
    return { found: 0, created: 0, skipped: 0, error: err instanceof Error ? err.message : String(err) };
  }
}
