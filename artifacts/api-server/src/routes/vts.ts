// External-link helper for Virginia Theological Seminary's Dean's
// Commentary — a weekday devotional posted to VTS's News & Publications
// blog. Mirrors routes/cac.ts: GET /api/vts/today fetches the site's
// public RSS feed, finds the newest item tagged "Dean's Commentary", and
// 302-redirects there. See that file for the fuller design rationale
// (feed-first "today" resolution, cache TTL, fallback behavior).
//
// One difference from CAC: CAC's feed URL is already scoped to its
// daily-meditations category (https://cac.org/category/daily-meditations/
// feed/), so the first <item> in the feed IS the latest meditation. VTS's
// https://vts.edu/feed/ is the SITE-WIDE feed (Dean's Commentary mixed in
// with press releases etc.), so parseFirstItem here has to additionally
// filter on each item's <category> before taking the newest match.
//
// VTS publishes on weekdays; on a weekend or a day they skip, the feed's
// newest matching item is simply Friday's (or whenever they last posted)
// — same as CAC's own behavior when nothing new has gone up, and the
// intended fallback (show the latest real commentary, not an error).

import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const FEED_URL = "https://vts.edu/feed/";
const FALLBACK_URL = "https://vts.edu/news-publications/?term=deans-commentary&keyword=";
const CATEGORY = "Dean's Commentary";
const FEED_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Safari/605.1.15";

// Same reasoning as cac.ts's CACHE_TTL_MS: short enough to pick up a new
// post within minutes of it going live, long enough that normal traffic
// never hits vts.edu directly.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

let cached: { url: string; title: string; isToday: boolean; fetchedAt: number; day: string } | null = null;

// Same local-date string every "today"-scoped query key in this codebase
// uses (toLocaleDateString("en-CA") on the client; here just a plain day
// stamp is enough since this only gates the server's own cache). A cache
// entry from YESTERDAY must never survive past midnight regardless of the
// 30-minute TTL — without this, the first request after midnight (until
// the TTL happened to also expire) could still serve yesterday's feed
// item, showing yesterday's commentary date on the reader.
function todayStamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#8217;|&#x2019;/gi, "’")
    .replace(/&#8216;|&#x2018;/gi, "‘")
    .replace(/&#8220;|&#x201C;/gi, "“")
    .replace(/&#8221;|&#x201D;/gi, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&hellip;|&#8230;/gi, "…")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .trim();
}

// Find the newest <item> tagged with CATEGORY (an item can carry several
// <category> tags — WordPress's default RSS is newest-first, so the
// first match found walking top-to-bottom is the latest one).
function parseFirstMatchingItem(xml: string): { url: string; title: string; pubDate: string | null } | null {
  const items = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/g);
  if (!items) return null;
  for (const block of items) {
    const categories: string[] = block.match(/<category\b[^>]*>([\s\S]*?)<\/category>/g) ?? [];
    const hasCategory = categories.some((c) => decodeEntities(c.replace(/<\/?category[^>]*>/g, "")) === CATEGORY);
    if (!hasCategory) continue;
    const linkMatch = block.match(/<link>([^<]+)<\/link>/);
    if (!linkMatch) continue;
    const url = linkMatch[1].trim();
    // Sanity: the permalink must actually live under vts.edu. RSS allows
    // an offsite <link>; bail rather than redirect somewhere unexpected.
    if (!/^https?:\/\/(?:www\.)?vts\.edu\//i.test(url)) continue;
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const title = titleMatch ? decodeEntities(titleMatch[1]) : "";
    // <pubDate> — RFC 822, e.g. "Mon, 24 Aug 2026 09:00:00 +0000". Used to
    // tell "today's post is up" from "nothing new yet, this is Friday's" —
    // see isFromToday below.
    const pubDateMatch = block.match(/<pubDate>([^<]+)<\/pubDate>/);
    const pubDate = pubDateMatch ? pubDateMatch[1].trim() : null;
    return { url, title, pubDate };
  }
  return null;
}

/**
 * Is this RSS pubDate the SAME calendar day as `now`, in the PUBLISHER's own
 * timezone (VTS posts from the US Eastern seaboard) — not the server's.
 *
 * Owner: "if the Dean's commentary has not been updated yet, and it's a
 * weekday, put it in later faded, and second line being waiting for update."
 * Without this, a stale feed (VTS hasn't posted yet this morning) reads
 * exactly like a fresh one — same title, same "open to read" — so the reader
 * has no way to tell "today's is up" from "that's still yesterday's."
 */
function isFromToday(pubDate: string | null): boolean {
  if (!pubDate) return false;
  const posted = new Date(pubDate);
  if (Number.isNaN(posted.getTime())) return false;
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
  return fmt.format(posted) === fmt.format(new Date());
}

// Exported for the daily Dean's Commentary push (lib/bellSender.ts), which
// needs today's scraped title for the notification body. Shares this module's
// day-scoped cache, so the sender's fan-out costs one feed fetch, not one per
// recipient.
export async function resolveTodayVts(): Promise<{ url: string; title: string; isToday: boolean }> {
  return resolveToday();
}

async function resolveToday(): Promise<{ url: string; title: string; isToday: boolean }> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS && cached.day === todayStamp()) {
    return { url: cached.url, title: cached.title, isToday: cached.isToday };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        "User-Agent": FEED_USER_AGENT,
        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "[vts] feed fetch non-ok");
      return { url: FALLBACK_URL, title: "", isToday: false };
    }
    const xml = await res.text();
    const parsed = parseFirstMatchingItem(xml);
    if (!parsed) {
      logger.warn({ bytes: xml.length }, "[vts] could not find a Dean's Commentary item");
      return { url: FALLBACK_URL, title: "", isToday: false };
    }
    const isToday = isFromToday(parsed.pubDate);
    cached = { url: parsed.url, title: parsed.title, isToday, fetchedAt: Date.now(), day: todayStamp() };
    return { url: parsed.url, title: parsed.title, isToday };
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[vts] feed fetch failed");
    return { url: FALLBACK_URL, title: "", isToday: false };
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/vts/today → 302 to today's Dean's Commentary permalink.
// Public, no auth. 302 (not 301) so the redirect target is never
// permanently cached by an intermediate proxy.
router.get("/vts/today", async (_req: Request, res: Response): Promise<void> => {
  const { url } = await resolveToday();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.redirect(302, url);
});

// GET /api/vts/today-meta → { title, url } — powers the home card's
// headline (today's commentary title) without embedding VTS's content.
router.get("/vts/today-meta", async (_req: Request, res: Response): Promise<void> => {
  const { url, title, isToday } = await resolveToday();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ title, url, isToday });
});

// ── Full-text scrape, for the in-app paragraph slideshow ────────────────────
// VTS gave permission to bring the Dean's Commentary text into Phoebe rather
// than just linking out. The commentary's body is pasted from Outlook each
// time (the `x_x_x_elementToProof` / `data-olk-copy-source` class names are
// Outlook's own clipboard markers), so paragraphs land as bare <div>s, not
// <p>s — extractParagraphs() below handles both. Scoped to
// <main class="site-main">...</main> only, which excludes the site header/
// nav/footer entirely, then drops the "Date: …" line and the trailing
// "Back to all" button, keeping everything else INCLUDING the closing
// signature block (the Dean's name/title line reads as the final "paragraph",
// which is the natural close of the piece, not noise to strip).
function decodeArticleEntities(s: string): string {
  return s
    .replace(/&#8217;|&#x2019;/gi, "’")
    .replace(/&#8216;|&#x2018;/gi, "‘")
    .replace(/&#8220;|&#x201C;/gi, "“")
    .replace(/&#8221;|&#x201D;/gi, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&hellip;|&#8230;/gi, "…")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

function stripTags(html: string): string {
  return decodeArticleEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n+/g, "\n")
      .trim(),
  );
}

// The result of extractParagraphs — the body paragraphs, plus the article's
// own "Date: August 14, 2026" line (previously discarded entirely; the
// reader's new opening slide shows it so the viewer can see for themselves
// this IS today's commentary, not a stale cached one).
type ExtractResult = { paragraphs: string[]; dateLine: string | null };

function extractParagraphs(html: string): ExtractResult {
  const mainMatch = html.match(/<main\b[^>]*class="[^"]*site-main[^"]*"[^>]*>([\s\S]*?)<\/main>/i);
  if (!mainMatch) return { paragraphs: [], dateLine: null };
  const main = mainMatch[1];
  // <p> blocks are safe to match non-greedy (a <p> never nests another <p>).
  // <div> blocks are NOT — a naive `<div\b[^>]*>[\s\S]*?<\/div>` matches the
  // outer wrapper (e.g. `<div class="container">`) and stops at the FIRST
  // nested </div> it hits, silently swallowing the wrapper's opening tag
  // plus everything up to that first inner paragraph's own close — which
  // then reads as one block starting with "Date: …" and gets thrown away
  // by the date filter below, taking the first real paragraph's text with
  // it (caught by testing against a live commentary post — paragraph 0
  // went missing until this was fixed). The negative lookahead below only
  // matches LEAF divs (no nested <div> inside), which is what every real
  // paragraph div on this page actually is — wrapper divs simply fail to
  // match and get skipped entirely, exactly the outcome we want.
  // Two bugs lived in the previous form of this, both fixed by matching in a
  // SINGLE left-to-right pass instead of concatenating two separate matches:
  //
  //  1. Owner: "on the Dean's Commentary, the full text is repeated on an
  //     extra slide." The leaf-div lookahead excluded nested <div> but NOT
  //     <p>, so `<div class="container">` wrapping the article's <p>s still
  //     counted as a leaf and matched the WHOLE body as one block — on top of
  //     the <p>s already matched individually. Every real paragraph, then the
  //     entire article concatenated, as a final extra slide. Adding <p to the
  //     lookahead makes a div holding paragraphs fail to match, which is the
  //     wanted outcome: it's a wrapper, not a paragraph.
  //  2. `[...pBlocks, ...divBlocks]` emitted every <p> before every <div>
  //     regardless of where they sat in the document, so an article mixing
  //     the two rendered out of order. One alternation scanned left-to-right
  //     keeps document order by construction.
  //
  // A div is still a paragraph when it holds no nested <div> and no <p> —
  // which is exactly the Outlook-pasted markup described above.
  const blocks = main.match(
    /<p\b[^>]*>[\s\S]*?<\/p>|<div\b[^>]*>(?:(?!<\/?div\b|<p\b)[\s\S])*<\/div>/gi,
  ) ?? [];
  const paragraphs: string[] = [];
  let dateLine: string | null = null;
  for (const block of blocks) {
    const inner = block.replace(/^<[^>]+>/, "").replace(/<[^>]+>$/, "");
    const text = stripTags(inner);
    if (!text) continue; // empty spacer divs
    // "Date: August 14, 2026" is sometimes its OWN block, sometimes merged
    // into the SAME block as the article's actual opening sentence (no line
    // break between them in the source markup) — treating the whole block
    // as just "the date" whenever it merely STARTS with "Date:" silently ate
    // paragraph 0 in that second case (caught from a live post: "Looking
    // Ahead" rendered with the date line as its own paragraph, and the
    // opening paragraph never appeared at all). Extract only the bounded
    // date pattern as a PREFIX and keep whatever follows as a real
    // paragraph — a date-only block still ends up with nothing pushed.
    const dateMatch = text.match(/^date:\s*([A-Za-z]+\s+\d{1,2},?\s*\d{4})\.?\s*/i);
    if (dateMatch) {
      if (!dateLine) dateLine = dateMatch[1]!;
      const rest = text.slice(dateMatch[0].length).trim();
      if (rest) paragraphs.push(rest);
      continue;
    }
    if (block.includes('class="btn btn-primary"') && /back to all/i.test(text)) continue;
    paragraphs.push(text);
  }
  return { paragraphs, dateLine };
}

type TextCacheEntry = { title: string; url: string; paragraphs: string[]; date: string | null; fetchedAt: number };
let textCached: TextCacheEntry | null = null;

async function resolveTodayText(): Promise<TextCacheEntry> {
  const { url, title } = await resolveToday();
  // Unlike resolveToday()'s 30-minute feed-poll TTL (needed to notice a new
  // post going live), the scraped ARTICLE BODY for a given url never
  // changes once published — so once any user loads it, it's cached (in
  // this process, for every user) until resolveToday() resolves a
  // DIFFERENT url, i.e. a new day's commentary. No time-based expiry here:
  // re-scraping vts.edu every 30 minutes for the same url was wasted work
  // (and wasted risk — a transient fetch failure would flip a perfectly
  // good cached reader to the empty-paragraphs fallback for no reason).
  if (textCached && textCached.url === url) {
    return textCached;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": FEED_USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn({ status: res.status, url }, "[vts] article fetch non-ok");
      return { title, url, paragraphs: [], date: null, fetchedAt: Date.now() };
    }
    const html = await res.text();
    const { paragraphs, dateLine } = extractParagraphs(html);
    const entry: TextCacheEntry = { title, url, paragraphs, date: dateLine, fetchedAt: Date.now() };
    textCached = entry;
    return entry;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), url }, "[vts] article fetch failed");
    return { title, url, paragraphs: [], date: null, fetchedAt: Date.now() };
  } finally {
    clearTimeout(timeout);
  }
}

// GET /api/vts/today-text → { title, url, paragraphs, date } — the full
// commentary body, one entry per paragraph, for the in-app slideshow.
// `paragraphs: []` means extraction failed (site markup changed, fetch
// error, etc.) — the client falls back to linking out to `url` rather than
// showing a broken reader. `date` is the article's own "Date: …" line
// (e.g. "August 14, 2026"), shown on the reader's opening slide so the
// viewer can see for themselves this is today's, not a stale piece.
router.get("/vts/today-text", async (_req: Request, res: Response): Promise<void> => {
  const entry = await resolveTodayText();
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ title: entry.title, url: entry.url, paragraphs: entry.paragraphs, date: entry.date });
});

export default router;
