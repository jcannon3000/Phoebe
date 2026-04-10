/**
 * Revised Common Lectionary (RCL) fetcher — lazy + cached per Sunday.
 *
 * Fetches the Gospel reading for a given Sunday from
 * https://lectionary.library.vanderbilt.edu, parses out the Sunday name,
 * liturgical season/year, Gospel reference, and full plain-text passage,
 * then stores it in the `lectionary_readings` table.
 *
 * Strategy:
 *   1. The first user who needs a given Sunday triggers a fetch.
 *   2. All subsequent users read from the DB cache.
 *   3. Only *one* Sunday is fetched at a time — we never crawl the whole site.
 */

import { db, lectionaryReadingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { LectionaryReading } from "@workspace/db";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const HOME_URL = "https://lectionary.library.vanderbilt.edu/";

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
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, "\u201C")
    .replace(/&#8221;/g, "\u201D")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

interface ParsedLink {
  url: string;
  dateStr: string; // as written on the page (e.g. "November 30, 2025")
  iso: string; // YYYY-MM-DD
}

/**
 * Parses the home page's Sunday list into [{url, date}, ...].
 * The home page contains anchors like:
 *   <a href="https://...texts/?y=17134&z=a&d=1" title="November 30, 2025">
 */
function parseHomeLinks(html: string): ParsedLink[] {
  const re = /<a[^>]+href="(https:\/\/lectionary\.library\.vanderbilt\.edu\/texts\/\?[^"]+)"\s+title="([^"]+)"/g;
  const out: ParsedLink[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const url = m[1].replace(/&amp;/g, "&");
    const dateStr = m[2];
    const parsed = new Date(dateStr);
    if (Number.isNaN(parsed.getTime())) continue;
    out.push({ url, dateStr, iso: ymd(parsed) });
  }
  return out;
}

/** Pick the link whose date is >= target, closest to target. */
function pickClosestOnOrAfter(links: ParsedLink[], targetIso: string): ParsedLink | null {
  const sorted = [...links].sort((a, b) => a.iso.localeCompare(b.iso));
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

function parseTextsPage(html: string): ParsedReading | null {
  // Title is like: "Year A - Advent - First Sunday of Advent - Revised Common Lectionary"
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  let liturgicalYear: string | null = null;
  let liturgicalSeason: string | null = null;
  let sundayName = "This Sunday";
  if (titleMatch) {
    const parts = titleMatch[1]
      .replace(/- Revised Common Lectionary/i, "")
      .split(" - ")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      liturgicalYear = parts[0];
      liturgicalSeason = parts[1];
      sundayName = parts.slice(2).join(" - ");
    } else if (parts.length === 2) {
      liturgicalSeason = parts[0];
      sundayName = parts[1];
    } else if (parts.length === 1) {
      sundayName = parts[0];
    }
  }

  // Gospel reading block.
  const gospelBlockMatch = html.match(
    /<div id="pericope_gospel_reading"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/
  );
  if (!gospelBlockMatch) return null;
  const gospelBlock = gospelBlockMatch[1];

  // Reference: <h2><span title="...">Matthew 24:36-44</span></h2>
  const refMatch = gospelBlock.match(/<h2>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<\/h2>/);
  const gospelReference = refMatch ? stripTags(refMatch[1]) : "";

  // Verses: <div class="verses"><p>...</p><p>...</p></div>
  const versesMatch = gospelBlock.match(/<div class="verses">([\s\S]*?)<\/div>/);
  if (!versesMatch) return null;
  const verseParagraphs = Array.from(versesMatch[1].matchAll(/<p>([\s\S]*?)<\/p>/g)).map((m) =>
    stripTags(m[1])
  );
  const gospelText = verseParagraphs.join("\n\n");

  if (!gospelReference || !gospelText) return null;

  return {
    sundayName,
    liturgicalSeason,
    liturgicalYear,
    gospelReference,
    gospelText,
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Lectionary fetch failed: ${res.status} ${url}`);
  return await res.text();
}

/**
 * Fetch (and cache) the RCL Gospel reading for a specific Sunday.
 * The first caller for a given Sunday triggers the network request;
 * every later caller gets the cached DB row.
 */
export async function getReadingForSunday(
  sundayDate: Date
): Promise<LectionaryReading> {
  const iso = ymd(sundayDate);

  // 1. Cache hit?
  const existing = await db
    .select()
    .from(lectionaryReadingsTable)
    .where(eq(lectionaryReadingsTable.sundayDate, iso))
    .limit(1);
  if (existing[0]) return existing[0];

  // 2. Fetch the home page once to find THIS Sunday's URL.
  const homeHtml = await fetchText(HOME_URL);
  const links = parseHomeLinks(homeHtml);
  const link = pickClosestOnOrAfter(links, iso);
  if (!link) {
    throw new Error(`No lectionary link found on or after ${iso}`);
  }

  // 3. Fetch that one Sunday's page.
  const pageHtml = await fetchText(link.url);
  const parsed = parseTextsPage(pageHtml);
  if (!parsed) throw new Error(`Failed to parse lectionary page for ${iso}`);

  // 4. Store. Use the link's date (what the site says the Sunday is),
  //    not our requested iso — they should match, but the site is authoritative.
  const storeIso = link.iso;

  // Another caller may have raced us — upsert-ish behavior via unique index.
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
