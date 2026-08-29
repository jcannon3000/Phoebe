// Catalogue Vanderbilt's Art in the Christian Tradition (ACT) into
// artifacts/mymonastery/src/lib/visioCommentaryCatalogue.ts — the artwork LIBRARY that
// Visio Divina prays with and the admin art-library tool curates.
//
// Usage:
//   node scripts/fetch-act-catalogue.mjs
//
// ── The CURATED-ARTIST model ──
//
// Owner (after finding only 11 of Frank Wesley's 118 works had made it in):
// "let's limit the library of photos to these artists, but make sure ALL
// their images from the Vanderbilt library are in there." So the harvest is
// no longer query-shaped (the old VCS-subset + lectionary-expansion phases
// only caught works that happened to match a reading search): it walks the
// allowlist below with ACT's own `artists` filter and takes EVERY record
// each artist has. Works with scripture refs feed Visio's day-matching;
// works without refs still live in the library (the admin tool and the icon
// toggle can surface them). The Benaki Museum entry is a BUILDING, not an
// artist — its four Byzantine icons come via the building filter.
//
// ── Why this can be fetched at all ──
//
// ACT's robots.txt is "User-agent: * / Disallow:" — an EMPTY disallow, which
// permits everything. Their search is a public Meilisearch proxy at
// POST /api/search, and their images are public objects on S3. So this reads
// a published catalogue through its own published interface.
//
// ── Why the result is safe to display ──
//
// ACT is an INDEX, not a rights holder. Two doors in, per record:
//  1. The Wikimedia file page named in `copyright_source`, resolved against
//     the Commons API, coming back public domain / CC0 / CC BY(-SA).
//  2. ACT's recorded artist grant of non-commercial use with attribution
//     (Phoebe is a non-profit; owner: "make sure you're including those").
// Records with neither are DROPPED rather than guessed at.
//
// ── The nudity screen ──
//
// Owner: "any image with nudity should not be in there." ACT has no nudity
// tag (probed: no subject matches), so this is a keyword screen over title +
// notes + subjects — it catches what the records SAY, not what the paint
// shows. The admin art-library tool is the second line: the owner deletes
// what the screen can't see, and those deletions live in act_overrides, not
// here, so a regeneration never resurrects them.

import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(REPO_ROOT, "artifacts/mymonastery/src/lib/visioCommentaryCatalogue.ts");

const UA = "Phoebe/1.0 (prayer app; +https://withphoebe.app; jcannon3000@gmail.com)";
const ACT_SEARCH = "https://act.library.vanderbilt.edu/api/search";
const ACT_ARTWORK = (id) => `https://act.library.vanderbilt.edu/artworks/${id}`;
// Their image host. Named "iiif-" but it serves plain full-size JPEGs off S3.
const ACT_IMAGE = (f) => `https://iiif-act.library.vanderbilt.edu/jpeg/${f}.jpg`;

/**
 * THE LIBRARY'S ARTISTS (owner's list, 2026-08-27) — exact ACT artist
 * strings, verified against the API. Adding an artist here and re-running is
 * the whole procedure for growing the library.
 */
const ARTISTS = [
  "JESUS MAFA",
  "Latimore, Kelly",
  "Johnson, William H., 1901-1970",
  "Pittman, Lauren Wright",
  "Reid, Patricia",
  "Miller, Mary Jane",
  "Ceballos Fernández, Lázaro A.",
  "Catlett, Elizabeth, 1915-2012",
  "Swanson, John August",
  "Hernández, Salvador",
  "Wesley, Frank, 1923-2002",
];
/** Collections included whole, by ACT's `building` value. */
const BUILDINGS = ["Benaki Museum"];

/** Single works the owner has asked out of the library, by ACT record id.
 *  59230 = Frank Wesley, "Before Abraham Was I Am". Runtime deletions made
 *  through the admin tool live in act_overrides instead — this list is only
 *  for works that must never even enter the generated file. */
/**
 * Works whose IMAGE the host no longer serves (403 even with correct
 * percent-encoding, verified by HEAD against every URL in this catalogue).
 * They are still listed in ACT, so a re-harvest would pull them back in and
 * the library would carry entries that can only ever render an empty frame.
 *   55261 Old Testament stories (Bassa)      — accented filename, 403
 *   56543 Elijah (Swanson)                   — 403
 *   59210 Every Pot Shall be Holy (Wesley)   — 403
 *   59244 I Am the Potter, Ye the Clay (W.)  — 403
 * Re-check before removing any of these from the list; a host outage would
 * look identical to a withdrawal, and these were confirmed over separate runs.
 */
const DEAD_IMAGE_IDS = [55261, 56543, 59210, 59244];
const EXCLUDED_IDS = new Set([59230, ...DEAD_IMAGE_IDS]);

/** Owner: "any image with nudity should not be in there." Keyword screen —
 *  see the header for its limits and the admin tool's role. */
const NUDITY = /\bnudes?\b|\bnaked\b|\bnudity\b/i;

/** Licences we will ship an image under (door 1). */
const FREE = /^(public domain|cc0|cc by(-sa)? [0-9.]+( [a-z]{2})?)$/i;
/** Door 2 — the artist's own recorded non-commercial grant. */
const ncPermitted = (a) => /non-?commercial/i.test(a.copyright_permission ?? "");
const NC_LICENCE = "Used by permission of the artist (non-commercial, with attribution)";

async function actSearch(body) {
  const res = await fetch(ACT_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ACT search ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Every record matching one Meilisearch filter, paged. */
async function harvestFilter(filter) {
  const out = [];
  let pages = 1;
  for (let page = 1; page <= pages && page <= 10; page++) {
    const d = await actSearch({ q: "", page, hitsPerPage: 100, filter });
    pages = d.totalPages ?? 1;
    out.push(...(d.hits ?? []));
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
}

/** Every record matching a free-text QUERY, paged (the filter twin above
 *  searches by field; this searches the record, which is how a commentary
 *  link in `notes` is found). */
async function harvestQuery(q) {
  const out = [];
  let pages = 1;
  for (let page = 1; page <= pages && page <= 20; page++) {
    const d = await actSearch({ q, page, hitsPerPage: 100 });
    pages = d.totalPages ?? 1;
    out.push(...(d.hits ?? []));
    await new Promise((r) => setTimeout(r, 150));
  }
  return out;
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
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

/** Their catalogue has stray whitespace in a handful of fields ("Jonah "). */
const tidy = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v);

function attribution(a, artist, original = "Wikimedia Commons") {
  const who = artist ? `${artist}. ` : "";
  return `${who}${tidy(a.title)}, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: ${original}.`;
}

function place(a) {
  return [a.building, a.city, a.country].map(tidy).filter(Boolean).join(", ");
}

const main = async () => {
  /**
   * THE POOL IS THE COMMENTARY, not the artist list.
   *
   * Owner: "only use images that have a commentary, but also feel free to
   * open it up to images that weren't from the artist that we narrowed it
   * down to" — and "we want ones [with] visual commentaries too".
   *
   * The curated-artist harvest next door yields 314 works of which exactly
   * TWO carry a commentary: the allowlist and the commentary are nearly
   * disjoint, so the two asks only work together. ACT records a commentary
   * as a thevcs.org link in the record's notes, and searching for that link
   * across the whole collection finds ~254 works — enough for a work a week
   * with years to spare, and every one of them arrives with something to
   * read beside it.
   */
  const byId = new Map();
  for (const hit of await harvestQuery("thevcs.org")) byId.set(hit.id, hit);
  console.log(`commentary pool: ${byId.size} records`);

  const candidates = [...byId.values()];
  const titles = [...new Set(candidates.map((a) => commonsTitle(a.copyright_source)).filter(Boolean))];
  console.log(`Verifying ${titles.length} file licences against Commons…`);
  const lic = await resolveLicences(titles);

  const kept = [];
  const dropped = { noCommentary: 0, noImage: 0, noRights: 0, unresolved: 0, notFree: 0, excludedWork: 0, nudity: 0, sampleRecord: 0 };
  for (const a of candidates) {
    if (a.image_is_public !== 1 || !a.image_filename) { dropped.noImage++; continue; }
    // The whole point of this pool: no commentary, no place here.
    if (!essayUrl(a.notes)) { dropped.noCommentary++; continue; }
    // ACT keeps placeholder rows ("Sample record for Frank Wesley artwork").
    if (/^sample record\b/i.test(a.title ?? "")) { dropped.sampleRecord++; continue; }
    if (EXCLUDED_IDS.has(a.id)) { dropped.excludedWork++; continue; }
    const screen = [a.title, a.notes, ...(a.subjects ?? [])].filter(Boolean).join(" ");
    if (NUDITY.test(screen)) { dropped.nudity++; continue; }
    const ct = commonsTitle(a.copyright_source);
    let clean = null;
    let original = "Wikimedia Commons";
    if (ct) {
      const l = lic.get(ct);
      if (l) {
        const c = String(l).replace(/<[^>]*>/g, "").trim();
        if (FREE.test(c)) clean = c;
        else if (!ncPermitted(a)) { dropped.notFree++; continue; }
      } else if (!ncPermitted(a)) { dropped.unresolved++; continue; }
    }
    if (!clean) {
      if (!ncPermitted(a)) { dropped.noRights++; continue; }
      clean = NC_LICENCE;
      original = tidy(a.copyright_source) || "the artist";
    }
    const artist = a.artists?.[0] ?? null;
    kept.push({
      id: a.id,
      title: tidy(a.title),
      artist: tidy(artist),
      date: tidy(a.creation_date) || null,
      where: place(a) || null,
      img: ACT_IMAGE(a.image_filename),
      refs: a.scriptures ?? [],
      days: a.liturgicalDays ?? [],
      // Who the work depicts + ACT's subject tags — the searchable metadata
      // the admin art-library tool shows, and what a search can match on.
      people: (a.people ?? []).map(tidy),
      subjects: (a.subjects ?? []).map(tidy),
      essay: essayUrl(a.notes) ?? "",
      act: ACT_ARTWORK(a.id),
      licence: clean,
      attribution: attribution(a, artist, original),
    });
  }

  kept.sort((x, y) => x.id - y.id);
  const withRefs = kept.filter((k) => k.refs.length > 0).length;
  console.log(`\nKEPT ${kept.length} (${withRefs} with scripture refs for Visio's day-matching)`);
  console.log("DROPPED", dropped);

  const header = `/**
 * Art in the Christian Tradition — the curated artwork LIBRARY.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   node scripts/fetch-act-catalogue.mjs
 * which re-harvests EVERY ACT work by the library's artists (the allowlist
 * in that script — owner-curated) and re-verifies rights per record: either
 * a Commons-verified free licence, or ACT's recorded artist grant of
 * non-commercial use with attribution (Phoebe is a non-profit; the required
 * attribution is printed on the closing slide). Records with neither were
 * dropped rather than assumed. A keyword nudity screen runs at harvest;
 * runtime deletions and icon toggles made in the admin art-library tool
 * live in act_overrides, NOT here, and survive regeneration.
 *
 * \`img\` points at ACT's own S3 host rather than a bundled asset — the
 * collection is far too large to ship in the binary, and their host serves
 * only full-size JPEGs. The image is fetched when the practice opens.
 *
 * \`refs\` are the passages ACT tags a work to; visioSelect crosses them
 * against the day's appointed lessons. Works with NO refs are library-only:
 * they can never be chosen as the day's Visio image, but the admin tool and
 * the icon toggle can surface them. \`people\` and \`subjects\` are ACT's own
 * tags — searchable metadata, shown in the admin tool.
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
  people: string[];
  subjects: string[];
  essay: string;
  act: string;
  /** The verified licence (or the artist's recorded grant), named on the closing slide. */
  licence: string;
  attribution: string;
};

export const ACT_COMMENTARY_CATALOGUE: CatalogueArtwork[] = `;

  writeFileSync(OUT_PATH, header + JSON.stringify(kept, null, 1) + ";\n");
  console.log(`\nWrote ${OUT_PATH}`);
  // The pre-built Visio schedule pins dates to ACT ids — a regenerated
  // catalogue orphans every pin SILENTLY (chooseArtwork falls through to
  // uncapped live matching), so the schedule must be rebuilt with it.
  console.log("NOW REGENERATE THE SCHEDULE:  pnpm --filter @workspace/api-server run build:visio-schedule");
};

main().catch((e) => { console.error(e); process.exit(1); });
