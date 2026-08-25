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
function attribution(a, artist) {
  const who = artist ? `${artist}. ` : "";
  return `${who}${tidy(a.title)}, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: Wikimedia Commons.`;
}

function place(a) {
  return [a.building, a.city, a.country].map(tidy).filter(Boolean).join(", ");
}

const main = async () => {
  console.log("Harvesting ACT…");
  const all = await harvest();
  console.log(`  ${all.length} records in the "Visual Commentary on Scripture" subject`);

  const withEssay = all.filter((a) => essayUrl(a.notes) && a.image_filename && a.image_is_public === 1);
  console.log(`  ${withEssay.length} have a VCS essay AND a public image`);

  const titles = [...new Set(withEssay.map((a) => commonsTitle(a.copyright_source)).filter(Boolean))];
  console.log(`Verifying ${titles.length} file licences against Commons…`);
  const lic = await resolveLicences(titles);

  const kept = [];
  const dropped = { noCommonsSource: 0, unresolved: 0, notFree: 0, noScripture: 0 };
  for (const a of withEssay) {
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
    kept.push({
      id: a.id,
      title: tidy(a.title),
      artist: tidy(artist),
      date: tidy(a.creation_date) || null,
      where: place(a) || null,
      img: ACT_IMAGE(a.image_filename),
      refs: a.scriptures,
      days: a.liturgicalDays ?? [],
      essay: essayUrl(a.notes),
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
 * \`refs\` are the passages ACT tags the work to; \`days\` are its lectionary
 * days ("Year B Lent 3rd Sunday"), which is what lets the image follow the day
 * rather than being a gallery on shuffle. \`essay\` is a short commentary at
 * thevcs.org — LINKED, never reproduced.
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
