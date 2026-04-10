// Fetch the next 24 Sunday Gospel readings from lectionarypage.net and
// write them to artifacts/api-server/src/data/lectionary/seed.ts.
//
// Why: Railway's outbound IP is blocked by lectionarypage.net's mod_security,
// so the server can't fetch readings live. We pre-fetch from a machine that
// CAN reach the site (a laptop) and bake the results into the repo. Run this
// script whenever the 24-week window gets thin — e.g. quarterly.
//
// Usage:
//   node scripts/fetch-lectionary-seed.mjs
//
// The script only touches `seed.ts`. Commit the result normally.

import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SEED_TS_PATH = resolve(
  REPO_ROOT,
  "artifacts/api-server/src/data/lectionary/seed.ts"
);

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BASE_URL = "https://www.lectionarypage.net";
const HOME_URL = `${BASE_URL}/`;

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function stripTags(html) {
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

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function parseHomeLinks(html) {
  const out = [];
  // Month headers: <h3> ... Month YYYY ... </h3> with arbitrary stuff
  // inside (nbsp, <font>, etc.). We use [\s\S] to match across tags.
  const tokenRe = new RegExp(
    String.raw`<h3>[\s\S]*?(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})[\s\S]*?</h3>` +
      "|" +
      String.raw`<td\b[^>]*>`,
    "gi"
  );
  const dayRe = /<font[^>]*>\s*(\d{1,2})\b/i;
  const anchorRe = /<a\s+href="([^"]+\.html)"[^>]*>([\s\S]*?)<\/a>/i;
  let currentMonth = 0;
  let currentYear = 0;
  let m;
  while ((m = tokenRe.exec(html)) !== null) {
    if (m[1] && m[2]) {
      currentMonth = MONTHS[m[1].toLowerCase()] ?? 0;
      currentYear = parseInt(m[2], 10);
      continue;
    }
    if (!currentMonth || !currentYear) continue;
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
    const iso = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const url = rawHref.startsWith("http")
      ? rawHref
      : `${BASE_URL}/${rawHref.replace(/^\.?\/?/, "")}`;
    out.push({ iso, url, title: stripTags(anchorMatch[2]) });
  }
  return out;
}

function inferYearAndSeason(url) {
  const m = url.match(/\/(Year[ABC]+)_RCL\/([^/]+)\//);
  if (!m) return { year: null, season: null };
  const rawYear = m[1];
  const rawSeason = m[2];
  const year = rawYear === "YearABC" ? null : rawYear.replace(/^Year/, "Year ");
  const seasonMap = {
    Advent: "Advent", Christmas: "Christmas", Epiphany: "Epiphany",
    Lent: "Lent", HolyWk: "Holy Week", Easter: "Easter",
    Pentecost: "Season after Pentecost", HolyDays: "Holy Days",
  };
  return { year, season: seasonMap[rawSeason] ?? rawSeason };
}

function parseTextsPage(html, sourceUrl) {
  const sundayMatch = html.match(/<h1[^>]*class="sundayTitle"[^>]*>([\s\S]*?)<\/h1>/i);
  const sundayName = sundayMatch ? stripTags(sundayMatch[1]) : "This Sunday";
  const { year, season } = inferYearAndSeason(sourceUrl);
  let gospelArticle = null;
  const articleRe = /<article\b[\s\S]*?<\/article>/gi;
  let am;
  while ((am = articleRe.exec(html)) !== null) {
    const a = am[0];
    if (/id="gsp1"/i.test(a) || /lessonHeading[^>]*>\s*The Gospel\b/i.test(a)) {
      gospelArticle = a;
      break;
    }
  }
  if (!gospelArticle) return null;
  const refMatch = gospelArticle.match(/<h3[^>]*class="lessonCitation"[^>]*>([\s\S]*?)<\/h3>/i);
  const gospelReference = refMatch ? stripTags(refMatch[1]) : "";
  const paraRe = /<p[^>]*class="lessonText"[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs = [];
  let pm;
  while ((pm = paraRe.exec(gospelArticle)) !== null) {
    const text = stripTags(pm[1]);
    if (text) paragraphs.push(text);
  }
  const gospelText = paragraphs.join("\n\n");
  if (!gospelReference || !gospelText) return null;
  return { sundayName, liturgicalSeason: season, liturgicalYear: year, gospelReference, gospelText };
}

function nextSundayDate(today = new Date()) {
  const d = new Date(today);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  const add = dow === 0 ? 0 : 7 - dow;
  d.setDate(d.getDate() + add);
  return d;
}

async function main() {
  const homeHtml = await fetchText(HOME_URL);
  const links = parseHomeLinks(homeHtml);
  const rcl = links.filter((l) => /_RCL\.html$/i.test(l.url));

  const start = nextSundayDate();
  const wanted = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    wanted.push(d.toISOString().slice(0, 10));
  }

  console.log("wanted sundays:", wanted);

  const readings = [];
  for (const iso of wanted) {
    let link = rcl.find((l) => l.iso === iso);
    if (!link) {
      const sorted = [...rcl].sort((a, b) => a.iso.localeCompare(b.iso));
      link = sorted.find(
        (l) =>
          l.iso >= iso &&
          /Sunday|Easter|Pentecost|Proper|Trinity|Advent|Epiphany|Lent|Christmas/i.test(l.title)
      );
    }
    if (!link) {
      console.log(`[skip] ${iso}: no link on home page`);
      continue;
    }
    console.log(`[fetch] ${iso} → ${link.title}`);
    try {
      const pageHtml = await fetchText(link.url);
      const parsed = parseTextsPage(pageHtml, link.url);
      if (!parsed) {
        console.log(`  [parse-fail] ${link.url}`);
        continue;
      }
      readings.push({
        sundayDate: link.iso,
        sundayName: parsed.sundayName,
        liturgicalSeason: parsed.liturgicalSeason,
        liturgicalYear: parsed.liturgicalYear,
        gospelReference: parsed.gospelReference,
        gospelText: parsed.gospelText,
        sourceUrl: link.url,
      });
      console.log(`  ok: ${parsed.gospelReference} · ${parsed.gospelText.length}b`);
      await new Promise((r) => setTimeout(r, 400)); // be polite
    } catch (err) {
      console.log(`  [fetch-fail] ${err.message}`);
    }
  }

  const header = `// AUTO-GENERATED by scripts/fetch-lectionary-seed.mjs. Edit at your peril.
//
// 24 weeks of pre-fetched RCL Sunday Gospel readings from lectionarypage.net.
// Baked into the repo so the app works even when Railway cannot reach the
// upstream site. Refresh by running:
//   node scripts/fetch-lectionary-seed.mjs

export type SeedReading = {
  sundayDate: string;
  sundayName: string;
  liturgicalSeason: string | null;
  liturgicalYear: string | null;
  gospelReference: string;
  gospelText: string;
  sourceUrl: string;
};

export const SEED_READINGS: SeedReading[] = `;

  writeFileSync(SEED_TS_PATH, header + JSON.stringify(readings, null, 2) + ";\n");
  console.log(`\nwrote ${readings.length} readings to ${SEED_TS_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
