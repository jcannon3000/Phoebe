// Build a date-keyed table of SUNDAY EUCHARIST readings (the Revised Common
// Lectionary) from lectionarypage.net, for the Visio week schedule.
//
// WHY THIS EXISTS, and why it isn't the seed we already had.
//
// artifacts/api-server/src/data/lectionary/seed.ts carries 24 Sundays of
// GOSPEL TEXT for a different feature (the weekly reading card). The Visio
// schedule needs something else: every Sunday of the years it covers, and the
// REFERENCES rather than the text, including the epistle — because a week's
// artwork is chosen by matching a passage.
//
// It also needs the RCL rather than the Daily Office lectionary, and that
// distinction is the whole point. The Daily Office appoints semi-continuous
// readings on a Sunday — Acts 21:3-15, Mark 2:23-28 — which almost nothing in
// the history of sacred art depicts. The RCL appoints what is actually read at
// the Sunday Eucharist: the Prodigal Son, the Good Shepherd, the Road to
// Emmaus. Measured against our commentary library, matching the Daily Office
// found a work for 22 of 52 Sundays in 2026; the RCL found one for 15 of the
// 20 Sundays we had seeded. Same library, same matcher — a different question.
//
// Usage:
//   node scripts/fetch-rcl-sundays.mjs 2026 2027 2028
//
// Writes artifacts/api-server/src/data/rclSundays.ts. Railway's outbound IP is
// blocked by lectionarypage.net (see fetch-lectionary-seed.mjs), so this runs
// on a laptop and the result is committed — same arrangement as its sibling.

import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(REPO_ROOT, "artifacts/api-server/src/data/rclSundays.ts");

const BASE = "https://www.lectionarypage.net";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = await res.arrayBuffer();
  // The site is latin-1; decoding as utf-8 mangles the em dashes in citations.
  return new TextDecoder("latin1").decode(buf);
}

const text = (html) =>
  html.replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/** Every Sunday of `year`, with the URL of its RCL page. */
async function sundaysOf(year) {
  const cal = await get(`${BASE}/CalndrsIndexes/Calendar${year}.html`);
  // Walk the document in order so a month heading applies to the cells after
  // it — the calendar is twelve month grids in one page, and a bare day number
  // means nothing without knowing which grid it sits in.
  const parts = cal.split(/(<td[^>]*>[\s\S]*?<\/td>)/);
  let month = 0;
  const found = new Map();
  for (const part of parts) {
    for (let i = 0; i < MONTHS.length; i++) {
      if (new RegExp(`${MONTHS[i]}\\s*${year}`, "i").test(part)) month = i + 1;
    }
    if (!part.startsWith("<td")) continue;
    const day = /^\s*(?:<[^>]+>\s*)*(\d{1,2})\b/.exec(part.replace(/&nbsp;/g, " "));
    const link = /href="([^"]+_RCL\.html)"/.exec(part);
    if (!day || !link || !month) continue;
    const d = new Date(Date.UTC(year, month - 1, Number(day[1])));
    if (d.getUTCMonth() !== month - 1) continue;      // guards a stray number
    if (d.getUTCDay() !== 0) continue;                 // Sundays only
    const ymd = d.toISOString().slice(0, 10);
    // A Sunday can carry a feast link too; the first link in the cell is the
    // day's own observance, which is what is read that morning.
    if (!found.has(ymd)) found.set(ymd, `${BASE}/${link[1].replace(/^\.\.\//, "")}`);
  }
  return [...found.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

const GOSPELS = /^(matthew|mark|luke|john)\b/i;
const NT_OTHER = new RegExp(
  "^(?:[123]\\s+)?(acts|romans|corinthians|galatians|ephesians|philippians|colossians|" +
  "thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation)\\b", "i");

/**
 * The passages a Sunday appoints, classified by BOOK rather than by position.
 *
 * Position looked fine on an Epiphany page — OT, Epistle, Gospel, Psalm, four
 * lines in a row — and then failed on 31 of 52 Sundays in 2027. After
 * Pentecost the RCL offers TRACK 1 and TRACK 2 (semi-continuous or
 * complementary Old Testament), so the page reads "Track 1 / or / Track 2"
 * followed by six citations from two columns, and counting down from the
 * marker lands on the wrong ones.
 *
 * The gospel and epistle are SHARED between the tracks, and they are the only
 * readings this table is for — the artwork is matched to a New Testament
 * passage. So the tracks stop mattering: collect every citation in the lessons
 * block and file it by its book name. Acts, which stands in for the Old
 * Testament through Eastertide, lands in `nt` either way, which is right — it
 * is a New Testament passage whatever column it sits in.
 */
function readingsFrom(html) {
  const lines = text(html).split("\n").map((l) => l.trim()).filter(Boolean);
  const start = lines.findIndex((l) => /^RCL$/i.test(l));
  if (start < 0) return null;
  // Brackets belong to the citation: the lectionary marks optional verses as
  // "1 Corinthians 2:1-12, [13-16]" and "Isaiah 58:1-9a, [9b-12]". Leaving
  // them out of the class made those lines fail to match at all, so the whole
  // reading vanished rather than arriving imperfectly — 2026-02-08 came back
  // with a gospel and a psalm and no epistle.
  const cite = /^((?:[123]\s+)?[A-Z][A-Za-z]+\.?\s+\d+[:\d\-–,\s()\[\]a-z*]*)$/;
  const found = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    // The lessons block ends where the collect or the download link begins.
    if (/^(the collect|download this page|old testament|the response|the epistle|the gospel)\b/i.test(l)) break;
    // "Track 1" and "Track 2" look exactly like a citation to the pattern
    // above — a capitalised word followed by a number — and were being filed
    // as Old Testament readings. Harmless while only gospel and epistle were
    // read; wrong the moment the OT list is used to fill a gap.
    if (/^track\s+\d/i.test(l)) continue;
    const m = cite.exec(l);
    if (m) found.push(m[1].replace(/\s+/g, " ").trim());
    // "Track 1", "or", "Track 2" and stray headings are simply skipped rather
    // than treated as the end of the block — that mistake is what dropped
    // every Sunday after Pentecost.
  }
  if (!found.length) return null;
  const gospel = found.find((r) => GOSPELS.test(r)) ?? null;
  const nt = found.filter((r) => !GOSPELS.test(r) && NT_OTHER.test(r));
  const psalm = found.find((r) => /^psalm/i.test(r)) ?? null;
  const ot = found.filter((r) => r !== gospel && !nt.includes(r) && r !== psalm);
  if (!gospel && !nt.length) return null;   // nothing we can match art to
  return { gospel, nt, psalm, ot };
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const n = i++;
        try { out[n] = await fn(items[n]); }
        catch (err) { out[n] = { err: String(err) }; }
      }
    }),
  );
  return out;
}

const years = process.argv.slice(2).map(Number).filter((n) => n > 2000);
if (!years.length) {
  console.error("usage: node scripts/fetch-rcl-sundays.mjs 2026 2027 2028");
  process.exit(1);
}

const rows = [];
let missed = 0;
for (const year of years) {
  let sundays;
  try {
    sundays = await sundaysOf(year);
  } catch (err) {
    // The site publishes a year's calendar when it is ready; asking for one
    // that isn't there yet is a normal outcome, not a failure of the run.
    process.stderr.write(`${year}: no calendar published yet (${err}) — skipped\n`);
    continue;
  }
  process.stderr.write(`${year}: ${sundays.length} Sundays\n`);
  const got = await mapLimit(sundays, 4, async ([ymd, url]) => {
    const r = readingsFrom(await get(url));
    return r ? [ymd, { ...r, url }] : [ymd, null];
  });
  for (const [ymd, r] of got) {
    if (!r || r.err) { missed++; process.stderr.write(`  ! ${ymd} unparsed\n`); continue; }
    rows.push([ymd, r]);
  }
}
rows.sort((a, b) => a[0].localeCompare(b[0]));

const body = rows
  .map(([ymd, r]) =>
    `  "${ymd}": { gospel: ${JSON.stringify(r.gospel)}, nt: ${JSON.stringify(r.nt)}, ` +
    `psalm: ${JSON.stringify(r.psalm)}, ot: ${JSON.stringify(r.ot)} },`)
  .join("\n");

writeFileSync(OUT_PATH, `// GENERATED by scripts/fetch-rcl-sundays.mjs — do not edit by hand.
//
// The Sunday Eucharist readings (Revised Common Lectionary), keyed by date.
// Source: lectionarypage.net. Regenerate by running the script with the years
// you need; see its header for why this is fetched on a laptop and committed.
//
// Used to choose the week's Visio artwork: the RCL appoints the passages
// sacred art actually depicts, where the Daily Office's Sunday readings are
// semi-continuous and largely unpainted.

export type RclSunday = {
  /** The gospel appointed for the Sunday Eucharist. */
  gospel: string | null;
  /** Every OTHER New Testament reading — the epistle, and Acts where it stands
   *  in for the Old Testament through Eastertide. Both are matchable. */
  nt: string[];
  psalm: string | null;
  /** Old Testament readings, kept for completeness. After Pentecost the RCL
   *  offers two tracks and both appear here; the gospel and epistle above are
   *  shared between the tracks, which is why they are single values. */
  ot: string[];
};

export const RCL_SUNDAYS: Record<string, RclSunday> = {
${body}
};
`);

process.stderr.write(`\nwrote ${rows.length} Sundays to ${OUT_PATH}${missed ? ` (${missed} unparsed)` : ""}\n`);
