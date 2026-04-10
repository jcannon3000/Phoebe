/**
 * Revised Common Lectionary (RCL) fetcher — lazy + cached per Sunday.
 *
 * Fetches the Gospel reading for a given Sunday from
 * https://www.lectionarypage.net, parses out the Sunday name,
 * liturgical season/year, Gospel reference, and full plain-text passage,
 * then stores it in the `lectionary_readings` table.
 *
 * Strategy:
 *   1. The first user who needs a given Sunday triggers a fetch.
 *   2. All subsequent users read from the DB cache.
 *   3. Only *one* Sunday is fetched at a time — we never crawl the whole site.
 *
 * Parsing:
 *   - The home page (/) is a month-by-month calendar grid. Each <td> cell
 *     has a day number (<font size="+2">12</font>) and, on Sundays/feasts,
 *     an <a href="YearX_RCL/Season/...html">Title</a>. Month boundaries are
 *     marked by <h3>Month Year</h3> headings. We walk the page in order,
 *     tracking the current month/year, and build {iso, url, title} records.
 *   - Each Sunday page is an <article> with:
 *       <h2 class="lessonHeading" id="gsp1">The Gospel</h2>
 *       <h3 class="lessonCitation">John 20:19-31</h3>
 *       <div><p class="lessonText">…</p>…</div>
 *     Season/year come from the URL path (YearA_RCL/Easter/…).
 */

import { db, lectionaryReadingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { LectionaryReading } from "@workspace/db";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE_URL = "https://www.lectionarypage.net";
const HOME_URL = `${BASE_URL}/`;

// ─── Date helpers ───────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns the date of the upcoming Sunday (or today, if today is Sunday). */
export function nextSundayDate(today = new Date()): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0 = Sunday
  const add = dow === 0 ? 0 : 7 - dow;
  d.setDate(d.getDate() + add);
  return d;
}

/** Returns the most recent past Sunday (or today, if today is Sunday). */
export function mostRecentSundayDate(today = new Date()): Date {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - dow);
  return d;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;|&rsquo;/g, "\u2019")
    .replace(/&#8216;|&lsquo;/g, "\u2018")
    .replace(/&#8220;|&ldquo;/g, "\u201C")
    .replace(/&#8221;|&rdquo;/g, "\u201D")
    .replace(/&#8211;|&ndash;/g, "\u2013")
    .replace(/&#8212;|&mdash;/g, "\u2014")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

interface HomeLink {
  iso: string; // YYYY-MM-DD
  url: string; // absolute
  title: string;
}

/**
 * Walk the home page and build a list of every linked day in the calendar.
 * The page is a sequence of `<h3>Month Year</h3>` sections, each followed by
 * a calendar table. Cells vary a lot:
 *   <td ...><font size="+2">12<br></font><a href="...">Title</a></td>
 *   <td ...><font size="+2">15</font><font size="+2"><br></font><a ...>…</a></td>
 *   <td ...><font size="+2" color="#cc3333">29</font><font size="+2"><br></font><a …
 * Strategy: scan linearly for either a month header or a `<td…>` cell.
 * For each cell, extract the first numeric day out of the first `<font>` tag
 * and the first anchor inside the cell.
 */
function parseHomeLinks(html: string): HomeLink[] {
  const out: HomeLink[] = [];
  // Either a month header, OR an opening <td…> that begins a cell.
  const tokenRe = new RegExp(
    String.raw`<h3>[^<]*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\s*<\/h3>` +
      "|" +
      String.raw`<td\b[^>]*>`,
    "gi"
  );
  const dayRe = /<font[^>]*>\s*(\d{1,2})\b/i;
  const anchorRe = /<a\s+href="([^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/i;

  let currentMonth = 0;
  let currentYear = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[1] && m[2]) {
      currentMonth = MONTHS[m[1].toLowerCase()] ?? 0;
      currentYear = parseInt(m[2], 10);
      continue;
    }
    if (!currentMonth || !currentYear) continue;
    // Slice out the cell body until the matching `</td>` (naive — first
    // occurrence; cells don't nest).
    const cellStart = m.index + m[0].length;
    const cellEnd = html.indexOf("</td>", cellStart);
    if (cellEnd === -1) continue;
    const cell = html.slice(cellStart, cellEnd);

    const dayMatch = cell.match(dayRe);
    if (!dayMatch) continue;
    const day = parseInt(dayMatch[1], 10);
    if (!day || day < 1 || day > 31) continue;

    const anchorMatch = cell.match(anchorRe);
    if (!anchorMatch) continue;
    const rawHref = anchorMatch[1];
    const title = stripTags(anchorMatch[2] ?? "");

    const iso = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const url = rawHref.startsWith("http")
      ? rawHref
      : `${BASE_URL}/${rawHref.replace(/^\.?\/?/, "")}`;
    out.push({ iso, url, title });
  }
  return out;
}

/**
 * Pick the link whose iso matches the target Sunday exactly. lectionarypage.net
 * anchors Sunday readings to the actual calendar date, so this should be an
 * exact hit. We also accept the nearest on-or-after as a defensive fallback.
 * We only consider `_RCL.html` links (skip RSL / older format pages).
 */
function pickForSunday(links: HomeLink[], targetIso: string): HomeLink | null {
  const rclOnly = links.filter((l) => /_RCL\.html$/i.test(l.url));
  // Exact match first.
  const exact = rclOnly.find((l) => l.iso === targetIso);
  if (exact) return exact;
  // Otherwise closest on-or-after (Sunday pages only — heuristic: title
  // contains "Sunday" or "Pentecost" or "Epiphany" or "Christmas" or "Easter").
  const sundayish = rclOnly.filter(
    (l) => /Sunday|Pentecost|Epiphany|Christmas|Easter|Advent|Trinity|Proper|Lent/i.test(l.title)
  );
  const sorted = [...sundayish].sort((a, b) => a.iso.localeCompare(b.iso));
  for (const l of sorted) {
    if (l.iso >= targetIso) return l;
  }
  return null;
}

interface ParsedReading {
  sundayName: string;
  liturgicalSeason: string | null;
  liturgicalYear: string | null;
  gospelReference: string;
  gospelText: string;
}

/**
 * Extract the liturgical Year (A/B/C) and Season from a path like
 *   /YearA_RCL/Easter/AEaster2_RCL.html
 *   /YearABC_RCL/HolyDays/Annunc_RCL.html
 */
function inferYearAndSeason(url: string): { year: string | null; season: string | null } {
  const m = url.match(/\/(Year[ABC]+)_RCL\/([^/]+)\//);
  if (!m) return { year: null, season: null };
  const rawYear = m[1]; // YearA, YearABC, etc.
  const rawSeason = m[2]; // Easter, Advent, HolyWk, Pentecost, HolyDays, Epiphany, Lent, Christmas
  const year = rawYear === "YearABC" ? null : rawYear.replace(/^Year/, "Year ");
  const seasonMap: Record<string, string> = {
    Advent: "Advent",
    Christmas: "Christmas",
    Epiphany: "Epiphany",
    Lent: "Lent",
    HolyWk: "Holy Week",
    Easter: "Easter",
    Pentecost: "Season after Pentecost",
    HolyDays: "Holy Days",
  };
  const season = seasonMap[rawSeason] ?? rawSeason;
  return { year, season };
}

function parseTextsPage(html: string, sourceUrl: string): ParsedReading | null {
  // Sunday name from the <h1 class="sundayTitle">…</h1>
  const sundayMatch = html.match(/<h1[^>]*class="sundayTitle"[^>]*>([\s\S]*?)<\/h1>/i);
  const sundayName = sundayMatch ? stripTags(sundayMatch[1]) : "This Sunday";

  // Year/season inferred from URL (more reliable than page chrome).
  const { year, season } = inferYearAndSeason(sourceUrl);

  // Isolate the <article> that contains "The Gospel". Each lesson lives in its
  // own <article>; find the one whose heading id is "gsp1" (or text says
  // "The Gospel").
  let gospelArticle: string | null = null;
  const articleRe = /<article\b[\s\S]*?<\/article>/gi;
  let am: RegExpExecArray | null;
  while ((am = articleRe.exec(html)) !== null) {
    const a = am[0];
    if (/id="gsp1"/i.test(a) || /lessonHeading[^>]*>\s*The Gospel\b/i.test(a)) {
      gospelArticle = a;
      break;
    }
  }
  if (!gospelArticle) return null;

  // Reference: <h3 class="lessonCitation">John 20:19-31</h3>
  const refMatch = gospelArticle.match(
    /<h3[^>]*class="lessonCitation"[^>]*>([\s\S]*?)<\/h3>/i
  );
  const gospelReference = refMatch ? stripTags(refMatch[1]) : "";

  // Text: all <p class="lessonText"> paragraphs inside this article.
  const paraRe = /<p[^>]*class="lessonText"[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs: string[] = [];
  let pm: RegExpExecArray | null;
  while ((pm = paraRe.exec(gospelArticle)) !== null) {
    const text = stripTags(pm[1]);
    if (text) paragraphs.push(text);
  }
  const gospelText = paragraphs.join("\n\n");

  if (!gospelReference || !gospelText) return null;

  return {
    sundayName,
    liturgicalSeason: season,
    liturgicalYear: year,
    gospelReference,
    gospelText,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  // Full browser-like header set. lectionarypage.net sits behind
  // mod_security which returns 406 Not Acceptable if the request doesn't
  // look like a real browser (e.g. missing Accept or Accept-Language).
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`Lectionary fetch failed: ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch (and cache) the RCL Gospel reading for a specific Sunday.
 * The first caller for a given Sunday triggers the network request;
 * every later caller gets the cached DB row.
 *
 * We also invalidate any cached row that was written before we switched
 * to lectionarypage.net — old Vanderbilt rows have `source_url` pointing
 * at `lectionary.library.vanderbilt.edu` and are no longer authoritative.
 */
export async function getReadingForSunday(
  sundayDate: Date
): Promise<LectionaryReading> {
  const iso = ymd(sundayDate);

  // 1. Cache hit? (Ignore any row whose sourceUrl isn't from lectionarypage.net.)
  const existing = await db
    .select()
    .from(lectionaryReadingsTable)
    .where(eq(lectionaryReadingsTable.sundayDate, iso))
    .limit(1);
  if (existing[0] && existing[0].sourceUrl && /lectionarypage\.net/i.test(existing[0].sourceUrl)) {
    return existing[0];
  }
  if (existing[0]) {
    // Stale row from the old Vanderbilt source — drop it so the fresh
    // fetch below can replace it.
    await db
      .delete(lectionaryReadingsTable)
      .where(eq(lectionaryReadingsTable.sundayDate, iso));
  }

  // 2. Fetch the home page once to find THIS Sunday's URL.
  const homeHtml = await fetchText(HOME_URL);
  const links = parseHomeLinks(homeHtml);
  const link = pickForSunday(links, iso);
  if (!link) {
    throw new Error(
      `No lectionary link found on or after ${iso} (parsed ${links.length} cells)`
    );
  }

  // 3. Fetch that one Sunday's page.
  const pageHtml = await fetchText(link.url);
  const parsed = parseTextsPage(pageHtml, link.url);
  if (!parsed) {
    throw new Error(
      `Failed to parse lectionary page for ${iso} (${link.url})`
    );
  }

  // 4. Store. Use the link's date (what the site says the Sunday is).
  const storeIso = link.iso;

  // Another caller may have raced us — upsert-ish behavior.
  const again = await db
    .select()
    .from(lectionaryReadingsTable)
    .where(eq(lectionaryReadingsTable.sundayDate, storeIso))
    .limit(1);
  if (again[0]) return again[0];

  const [row] = await db
    .insert(lectionaryReadingsTable)
    .values({
      sundayDate: storeIso,
      sundayName: parsed.sundayName,
      liturgicalSeason: parsed.liturgicalSeason,
      liturgicalYear: parsed.liturgicalYear,
      gospelReference: parsed.gospelReference,
      gospelText: parsed.gospelText,
      sourceUrl: link.url,
    })
    .returning();
  return row;
}

/** Convenience: cached reading for the upcoming Sunday. */
export async function getUpcomingSundayReading(): Promise<LectionaryReading> {
  return getReadingForSunday(nextSundayDate());
}
