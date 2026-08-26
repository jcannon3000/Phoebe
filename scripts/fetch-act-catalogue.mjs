// Catalogue Vanderbilt's Art in the Christian Tradition (ACT) into
// artifacts/mymonastery/src/lib/visioCatalogue.ts — the artwork pool that
// Visio Divina prays with.
//
// Usage:
//   node scripts/fetch-act-catalogue.mjs
//
// ── Why this can be fetched at all ──
//
// ACT's robots.txt is "User-agent: * / Disallow:" — an EMPTY disallow, which
// permits everything, with none of the AI-crawler exclusions that thevcs.org
// sets. Their search is a public Meilisearch proxy at POST /api/search, and
// their images are public objects on S3. So this reads a published catalogue
// through its own published interface. (Contrast lib/vcsExhibitions.ts, where
// we deliberately DON'T fetch, and link at book level instead.)
//
// ── Why the result is safe to display ──
//
// ACT is an INDEX, not a rights holder: each record names its own copyright
// source and defers to it. "It's on ACT" is not a licence. So this script
// refuses to take ACT's word for anything — for every record it resolves the
// Wikimedia file page named in `copyright_source` and asks the Commons API for
// that file's ACTUAL licence, keeping only those that come back public domain,
// CC0, or a CC BY/BY-SA variant. Anything unresolvable, non-free, or hosted
// somewhere we can't check is DROPPED rather than guessed at. The counts are
// printed at the end so the drop rate is visible, not silent.
//
// ── Why the VCS subset ──
//
// The records tagged "Visual Commentary on Scripture" are the ones that carry
// (a) a scripture passage, (b) a lectionary day, and (c) a link to a short
// essay on thevcs.org. That triple is exactly what the practice needs: an
// image for the looking, the passage to read against it, and somewhere to go
// afterwards. The essay is LINKED, never copied — see visio.tsx.

import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(REPO_ROOT, "artifacts/mymonastery/src/lib/visioCatalogue.ts");

const UA = "Phoebe/1.0 (prayer app; +https://withphoebe.app; jcannon3000@gmail.com)";
const ACT_SEARCH = "https://act.library.vanderbilt.edu/api/search";
const ACT_ARTWORK = (id) => `https://act.library.vanderbilt.edu/artworks/${id}`;
// Their image host. Named "iiif-" but it serves plain full-size JPEGs off S3;
// there is no IIIF derivative endpoint (info.json 403s), so there is no way to
// ask for a smaller one — see the note on `img` in the generated file.
const ACT_IMAGE = (f) => `https://iiif-act.library.vanderbilt.edu/jpeg/${f}.jpg`;

/** Licences we will actually ship an image under. */
const FREE = /^(public domain|cc0|cc by(-sa)? [0-9.]+( [a-z]{2})?)$/i;

async function actSearch(body) {
  const res = await fetch(ACT_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ACT search ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Meilisearch caps any single query's window at 500 hits, so a broad sweep
 * can't reach the whole collection. The subject query below is well under the
 * cap, so it IS complete for this subset; widening the catalogue later means
 * unioning several narrower queries rather than paging one broad one.
 */
async function harvest() {
  const byId = new Map();
  for (let page = 1; page <= 5; page++) {
    const d = await actSearch({ q: "Visual Commentary on Scripture", page, hitsPerPage: 100 });
    for (const h of d.hits) byId.set(h.id, h);
    if (page >= (d.totalPages ?? 1)) break;
  }
  return [...byId.values()];
}

/** The thevcs.org essay URL ACT records in the notes field. */
function essayUrl(notes) {
  const m = /https?:\/\/thevcs\.org\/[^\s"'<>)]+/.exec(notes || "");
  return m ? m[0].replace(/[.,]$/, "") : null;
}

/** The Wikimedia file page named as the copyright source, if there is one. */
function commonsTitle(src) {
  const m = /\/wiki\/(File:[^?#]+)/.exec(src || "");
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
}

/** Ask Commons for each file's real licence, 50 at a time. */
async function resolveLicences(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const q = new URLSearchParams({
      action: "query", format: "json", prop: "imageinfo",
      iiprop: "extmetadata", iiextmetadatafilter: "LicenseShortName",
      titles: batch.join("|"),
    });
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Commons ${res.status}`);
    const d = await res.json();
    for (const p of Object.values(d.query?.pages ?? {})) {
      const lic = p.imageinfo?.[0]?.extmetadata?.LicenseShortName?.value;
      if (lic) out.set(p.title, lic);
    }
  }
  return out;
}

/** Their catalogue has stray whitespace in a handful of fields ("Jonah "). */
const tidy = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v);

/** ACT's requested citation, in the form their own pages ask for. */
/** Owner: "take out the William Blake stuff." Matched on the surname, lower-cased,
 *  against ACT's "Surname, Forename, dates" artist string. */
const EXCLUDED_ARTISTS = ["blake, william"];

function attribution(a, artist) {
  const who = artist ? `${artist}. ` : "";
  return `${who}${tidy(a.title)}, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons.`;
}

function place(a) {
  return [a.building, a.city, a.country].map(tidy).filter(Boolean).join(", ");
}

/**
 * ── Phase 2: the LECTIONARY expansion ──
 *
 * The VCS subset above is ~230 works — the ones with a thevcs.org essay. The
 * practice's whole point is that the day's picture follows the day's readings,
 * and an audit across the full two-year Daily Office cycle (2026–2027, MP+EP
 * lessons and psalms) found the VCS subset alone connects at chapter level or
 * better on barely 60% of days, with psalms almost entirely uncovered.
 *
 * So this phase reads scripts/visio-target-readings.json (generated from the
 * server's own lectionary by artifacts/api-server/src/gen-visio-targets.mjs),
 * collapses the uncovered readings to book+chapter groups, and queries ACT for
 * each. Hits are kept only when ACT's own scripture tags actually match the
 * chapter — the query is fuzzy text search, so the tags are the truth — and
 * every image still goes through the same Commons licence gate as phase 1.
 *
 * These works have no VCS essay. `essay` is "" for them: the practice already
 * treats an essay-less day as "show the picture, plainly" (visio.tsx hasEssay),
 * and the closing card's reflection pill guards on a real http(s) URL.
 */
import { readFileSync, existsSync } from "fs";

/** Book-name normalisation, mirroring the client's parseRef ("Samuel I" ⇄ "1 Samuel"). */
function bookAndChapters(ref) {
  const cleaned = String(ref || "").trim().replace(/\s+/g, " ").replace(/\./g, "");
  const lead = /^([123])\s+/.exec(cleaned);
  const rest = lead ? cleaned.slice(lead[0].length) : cleaned;
  const digit = rest.search(/\d/);
  let name = (digit < 0 ? rest : rest.slice(0, digit)).replace(/[\s,]+$/, "").trim().toLowerCase();
  if (!name) return null;
  const roman = /^(.*?)\s+(i{1,3})$/.exec(name);
  if (roman) name = `${roman[2].length} ${roman[1]}`;
  else if (lead) name = `${lead[1]} ${name}`;
  const chapters = new Set();
  const nums = digit < 0 ? "" : rest.slice(digit);
  const m = /^(\d+)(?::\d+)?(?:\s*[-\u2013]\s*(?:(\d+):)?\d+)?/.exec(nums);
  if (m) {
    const c1 = parseInt(m[1], 10);
    const c2 = m[2] ? parseInt(m[2], 10) : c1;
    for (let c = c1; c <= Math.min(c2, c1 + 40); c++) chapters.add(c);
  }
  return { book: name, chapters };
}

function chapterMatches(artRefs, book, chapter) {
  for (const r of artRefs ?? []) {
    const p = bookAndChapters(r);
    if (p && p.book === book && p.chapters.has(chapter)) return true;
  }
  return false;
}

const TARGETS_PATH = resolve(REPO_ROOT, "scripts/visio-target-readings.json");
/** How many works we try to hold per uncovered chapter — more than one so the
 *  rotation has something to rotate through on repeated lections (owner). */
const PER_CHAPTER = 4;

async function harvestForLectionary(alreadyIds) {
  if (!existsSync(TARGETS_PATH)) {
    console.log("No visio-target-readings.json — skipping the lectionary expansion phase.");
    return [];
  }
  const rows = JSON.parse(readFileSync(TARGETS_PATH, "utf8"));
  // Collapse uncovered readings (score<2 = nothing at chapter level today)
  // to book+chapter groups, weighted by how many days they appear on.
  const groups = new Map(); // "book|chapter" -> { book, chapter, days, label }
  for (const r of rows) {
    if (r.score >= 2) continue;
    const p = bookAndChapters(r.ref);
    if (!p || p.chapters.size === 0) continue;
    for (const c of p.chapters) {
      const k = `${p.book}|${c}`;
      const g = groups.get(k) ?? { book: p.book, chapter: c, days: 0 };
      g.days += r.days;
      groups.set(k, g);
    }
  }
  const ordered = [...groups.values()].sort((a, b) => b.days - a.days);
  console.log(`Lectionary expansion: ${ordered.length} uncovered chapters to query`);
  const found = new Map();
  let done = 0;
  for (const g of ordered) {
    done++;
    // Query text the way ACT's own tags write it ("1 Samuel 7" not "1 samuel 7").
    const label = `${g.book.replace(/^(\d) /, "$1 ").replace(/\b\w/g, (ch) => ch.toUpperCase())} ${g.chapter}`;
    let d;
    try { d = await actSearch({ q: label, page: 1, hitsPerPage: 50 }); }
    catch (e) { console.warn(`  query failed for ${label}: ${e.message}`); continue; }
    let keptHere = 0;
    for (const h of d.hits ?? []) {
      if (keptHere >= PER_CHAPTER) break;
      if (found.has(h.id) || alreadyIds.has(h.id)) continue;
      if (h.image_is_public !== 1 || !h.image_filename) continue;
      if (!h.scriptures?.length) continue;
      if (!chapterMatches(h.scriptures, g.book, g.chapter)) continue;
      if (!commonsTitle(h.copyright_source)) continue;
      found.set(h.id, h);
      keptHere++;
    }
    if (done % 50 === 0) console.log(`  …${done}/${ordered.length} chapters, ${found.size} candidates`);
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`  ${found.size} candidate records from the lectionary expansion`);
  return [...found.values()];
}

const main = async () => {
  console.log("Harvesting ACT…");
  const all = await harvest();
  console.log(`  ${all.length} records in the "Visual Commentary on Scripture" subject`);

  const withEssay = all.filter((a) => essayUrl(a.notes) && a.image_filename && a.image_is_public === 1);
  console.log(`  ${withEssay.length} have a VCS essay AND a public image`);

  // Phase 2 — works matched to the lectionary's uncovered chapters. No essay
  // required (see the phase's own header); everything else identical.
  const expansion = await harvestForLectionary(new Set(withEssay.map((a) => a.id)));
  const candidates = [...withEssay, ...expansion];

  const titles = [...new Set(candidates.map((a) => commonsTitle(a.copyright_source)).filter(Boolean))];
  console.log(`Verifying ${titles.length} file licences against Commons…`);
  const lic = await resolveLicences(titles);

  const kept = [];
  const dropped = { noCommonsSource: 0, unresolved: 0, notFree: 0, noScripture: 0 };
  for (const a of candidates) {
    const ct = commonsTitle(a.copyright_source);
    if (!ct) { dropped.noCommonsSource++; continue; }
    const l = lic.get(ct);
    if (!l) { dropped.unresolved++; continue; }
    // Strip any markup Commons wraps the licence name in.
    const clean = String(l).replace(/<[^>]*>/g, "").trim();
    if (!FREE.test(clean)) { dropped.notFree++; continue; }
    // The passage is the point — an artwork with no scripture can't be prayed
    // against a reading, so it isn't part of this practice.
    if (!a.scriptures?.length) { dropped.noScripture++; continue; }
    const artist = a.artists?.[0] ?? null;
    // Artists the practice deliberately doesn't carry (owner). Kept HERE as
    // well as removed from the generated file, or the next regeneration
    // quietly puts them back — the same "a regen undid it" trap the catalogue
    // header already warns about.
    if (artist && EXCLUDED_ARTISTS.some((x) => String(artist).toLowerCase().includes(x))) {
      dropped.excludedArtist = (dropped.excludedArtist ?? 0) + 1;
      continue;
    }
    kept.push({
      id: a.id,
      title: tidy(a.title),
      artist: tidy(artist),
      date: tidy(a.creation_date) || null,
      where: place(a) || null,
      img: ACT_IMAGE(a.image_filename),
      refs: a.scriptures,
      days: a.liturgicalDays ?? [],
      // "" = no VCS essay (a lectionary-expansion work). The practice shows
      // the picture plainly on those days; the reflection pill self-hides.
      essay: essayUrl(a.notes) ?? "",
      act: ACT_ARTWORK(a.id),
      licence: clean,
      attribution: attribution(a, artist),
    });
  }

  kept.sort((x, y) => x.id - y.id);
  console.log(`\nKEPT ${kept.length}`);
  console.log("DROPPED", dropped);

  const header = `/**
 * Art in the Christian Tradition — the Visio Divina catalogue.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   node scripts/fetch-act-catalogue.mjs
 * which re-harvests ACT and re-verifies every licence. That script's header
 * explains why this is fetchable and why each entry is safe to display.
 *
 * Every entry here has been checked individually against the Wikimedia Commons
 * API and came back public domain, CC0, or a CC BY/BY-SA variant — the licence
 * is recorded per entry so the closing slide can name it. Records whose rights
 * could not be resolved were dropped rather than assumed.
 *
 * \`img\` points at ACT's own S3 host rather than a bundled asset: at ${kept.length}
 * artworks this collection is far too large to ship inside the app binary, and
 * their host serves only full-size JPEGs (there is no IIIF derivative
 * endpoint). So the image is fetched when the practice opens.
 *
 * \`refs\` are the passages ACT tags the work to, and they are what lets the
 * image follow the day: visioSelect crosses them against the office's appointed
 * lessons. \`days\` are ACT's own lectionary labels ("Year B Lent 3rd Sunday"),
 * kept as a cross-check but not used for selection — they're free text, and the
 * passage match is exact. \`essay\` is a short commentary at thevcs.org —
 * LINKED, never reproduced.
 */

export type CatalogueArtwork = {
  /** ACT's own record id. */
  id: number;
  title: string;
  artist: string | null;
  date: string | null;
  where: string | null;
  img: string;
  refs: string[];
  days: string[];
  essay: string;
  act: string;
  /** The verified licence, named on the closing slide. */
  licence: string;
  attribution: string;
};

export const ACT_CATALOGUE: CatalogueArtwork[] = `;

  writeFileSync(OUT_PATH, header + JSON.stringify(kept, null, 1) + ";\n");
  console.log(`\nWrote ${OUT_PATH}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
