// Catalogue ACT's ICON collection into
// artifacts/mymonastery/src/lib/iconCatalogue.ts — the pool the Praying with
// Icons feature (/icon-prayer) searches.
//
// Usage:
//   node scripts/fetch-act-icons.mjs
//
// WHY A SECOND FILE: visioCatalogue.ts is the LECTIONARY pool — every entry
// carries scripture refs, because Visio's day-selection crosses them against
// the appointed lessons. Icon prayer is person-chosen and wants exactly the
// works Visio's harvest has no use for: icons of saints with no scripture
// tag. Owner, browsing ACT's collection: "I did not see icons when I was
// looking — when I searched Teresa nothing came up", and then: "make sure the
// pictures being used for icons ARE icons, not just all the pictures."
//
// ICON-NESS: ACT has no clean is-an-icon flag (materials/objectFunctions come
// back empty), so a record qualifies by evidence: the word icon in its title
// or notes, an icon-tradition title term (Pantocrator, Theotokos, Deesis,
// iconostasis), or a known iconographer as artist. The query list sweeps those
// same signals; the predicate is what keeps a stray hit out. One more door:
// works chosen in BY HAND, by ACT id, that the evidence would turn away
// (CHOSEN_ICON_IDS — Duccio's Maestà panels).
//
// RIGHTS: same two doors as fetch-act-catalogue.mjs — a Commons-verified free
// licence, OR ACT's recorded artist grant of non-commercial use with
// attribution (Phoebe is a non-profit; owner, looking at Kelly Latimore's
// St. Teresa: "Phoebe is not a commercial entity — make sure you're including
// those too"). Records with neither are dropped, never guessed at.

import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(REPO_ROOT, "artifacts/mymonastery/src/lib/iconCatalogue.ts");

const UA = "Phoebe/1.0 (prayer app; +https://withphoebe.app; jcannon3000@gmail.com)";
const ACT_SEARCH = "https://act.library.vanderbilt.edu/api/search";
const ACT_ARTWORK = (id) => `https://act.library.vanderbilt.edu/artworks/${id}`;
const ACT_IMAGE = (f) => `https://iiif-act.library.vanderbilt.edu/jpeg/${f}.jpg`;

const FREE = /^(public domain|cc0|cc by(-sa)? [0-9.]+( [a-z]{2})?)$/i;
const ncPermitted = (a) => /non-?commercial/i.test(a.copyright_permission ?? "");
const NC_LICENCE = "Used by permission of the artist (non-commercial, with attribution)";
/**
 * ACT's OWN recorded licence, when it is genuinely free.
 *
 * The Commons door above reads Wikimedia's LicenseShortName; this reads the
 * `copyright_permission` ACT stores for everything else — mostly Flickr
 * strings like "Attribution 2.0 Generic (CC BY 2.0)". Without it those were
 * dropped as unlicensed while the MORE restrictive CC BY-NC records beside
 * them were kept, because only "non-commercial" was being looked for: a free
 * work rejected and a restricted one admitted, from the same field. Found on
 * ACT's Civil Rights subject, where the National Memorial for Peace and
 * Justice (CC BY 2.0) fell out for exactly this reason.
 *
 * NC never matches here — the negative lookahead keeps "CC BY-NC" and
 * "CC BY-NC-ND" out, so they still take the non-commercial door below and
 * carry its attribution wording rather than being labelled free.
 */
const FREE_PERMISSION = /\b(cc0|public domain)\b|\bcc[ -]by(?:[ -]sa)?\b(?![^)]*\bnc\b)/i;
const freePermitted = (a) => {
  const p = a.copyright_permission ?? "";
  return !/non-?commercial/i.test(p) && FREE_PERMISSION.test(p);
};

/** Iconographers whose whole body of work belongs here. ACT's artist strings
 *  are "Surname, Forename[, dates]" — matched on the lower-cased surname pair. */
const ICONOGRAPHERS = ["latimore, kelly", "rublev, andrei", "rublev, andrey"];

/** The evidence that a record is an icon (see header). */
function isIcon(h) {
  const artist = String(h.artists?.[0] ?? "").toLowerCase();
  if (ICONOGRAPHERS.some((x) => artist.includes(x))) return true;
  const text = `${h.title ?? ""} ${h.notes ?? ""}`;
  if (/\bicon(s|ostasis|ography|ographer)?\b/i.test(text)) return true;
  if (/pantocrator|theotokos|deesis|hodegetria|eleusa/i.test(h.title ?? "")) return true;
  return false;
}

/** Queries that sweep the icon-shaped corners of the collection. Meilisearch
 *  caps one query at 500 hits, so coverage comes from unioning narrow queries
 *  (the visio script's own advice); isIcon() above is the gatekeeper. */
const QUERIES = [
  "icon", "icons", "iconostasis", "iconography",
  "Pantocrator", "Theotokos", "Deesis",
  "Latimore", "Rublev",
];

async function actSearch(body) {
  const res = await fetch(ACT_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ACT search ${res.status}: ${await res.text()}`);
  return res.json();
}

function commonsTitle(src) {
  const m = /\/wiki\/(File:[^?#]+)/.exec(src || "");
  return m ? decodeURIComponent(m[1]).replace(/_/g, " ") : null;
}

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

const tidy = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v);
const EXCLUDED_ARTISTS = ["blake, william", "herrel, edie mae"];
/** Single works the owner has asked out of the library, by ACT record id —
 *  the artist stays. 59230 = Frank Wesley, "Before Abraham Was I Am"
 *  (owner: "no, I just didn't want that image"). */
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
/**
 * Works ACT serves too small to show. The icon is drawn full width, so these
 * could only ever be a blur.
 *   57094 Saint of the Gulf (Pittman) — 100×300, first harvested 2026-09-17
 */
const TINY_IMAGE_IDS = [57094];
const EXCLUDED_IDS = new Set([59230, ...DEAD_IMAGE_IDS, ...TINY_IMAGE_IDS]);

/**
 * DUCCIO'S MAESTÀ, CHOSEN BY HAND (owner, 2026-09-17: "lets add what we can to
 * the icons"). ACT describes none of its 58 Duccio records as an icon, so
 * isIcon() lets none of them in; these 37 come in by id, each one looked at.
 * The prophets, the Madonnas, the apostles in pairs and the single scenes of
 * Christ's life, death and appearances. Left out, and why:
 *   46448 46449  the Massacre of the Innocents: the killing, and the dead children
 *   46644        a diagram of the altarpiece's back, 26 scenes at stamp size
 *   49182        a detail of the city from the Temptation, with no figure in it
 *   49168        the thief on his cross, close up, not Christ
 *   56590        a detail of the accusers alone
 *   58761        a fragment of the Crevole Madonna with the Virgin's face cut off
 *   58976        the same file as 49155
 *   49161 49167 49188 49193 49195 49244 49245 49248 49249 49251 49254 49255
 *   49260        two scenes stacked in one panel, not one image to sit with
 *
 * Each shows the LARGER of two copies of the same public-domain file: ACT's,
 * or the Wikimedia Commons file ACT names. ACT keeps most of these at 700px on
 * the long side (the prophets 255px wide) where Commons has 1,500–4,000px, but
 * for a few ACT's copy is the bigger one (Raising of Lazarus: ACT 800×752,
 * Commons 600×564), so both are measured rather than assumed.
 */
const DUCCIO = "Duccio, di Buoninsegna, -1319?";
const CHOSEN_ICON_IDS = new Set([
  46446, 46447, 46450, 46451, 46658, 49151, 49152, 49153, 49154, 49155,
  49156, 49158, 49165, 49170, 49172, 49174, 49177, 49181, 49183, 49184,
  49186, 49257, 49261, 49263, 54254, 54743, 55283, 55804, 56662, 56682,
  57182, 58386, 58389, 58757, 58762, 58772, 58901,
]);

/** Commons' own image for each file, with its size: a 1600px rendition when the
 *  original is wider, else the original (fetch-commons-visio.mjs's rule). */
async function resolveImages(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += 20) {
    const batch = titles.slice(i, i + 20);
    const q = new URLSearchParams({
      action: "query", format: "json", prop: "imageinfo",
      iiprop: "url|size", iiurlwidth: "1600", titles: batch.join("|"),
    });
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Commons ${res.status}`);
    const d = await res.json();
    const asked = new Map((d.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of Object.values(d.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0];
      if (!ii?.url) continue;
      const thumb = !!ii.thumburl && (ii.width ?? 0) > 1600;
      const img = {
        url: String(thumb ? ii.thumburl : ii.url).split("?")[0],
        area: thumb ? ii.thumbwidth * ii.thumbheight : (ii.width ?? 0) * (ii.height ?? 0),
      };
      out.set(p.title, img);
      if (asked.has(p.title)) out.set(asked.get(p.title), img);
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

/** Pixel area of a JPEG at a URL, read from its frame header; 0 when unreadable. */
async function jpegArea(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return 0;
    const b = new Uint8Array(await res.arrayBuffer());
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return ((b[i + 5] << 8) | b[i + 6]) * ((b[i + 7] << 8) | b[i + 8]);
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  } catch { /* unreadable: 0 */ }
  return 0;
}

function attribution(a, artist, original) {
  const who = artist ? `${artist}. ` : "";
  return `${who}${tidy(a.title)}, from Art in the Christian Tradition, a project of the Vanderbilt University Divinity Library, Nashville, TN. Original source: ${original}.`;
}

function place(a) {
  return [a.building, a.city, a.country].map(tidy).filter(Boolean).join(", ");
}

const main = async () => {
  const byId = new Map();
  for (const q of QUERIES) {
    let pages = 1;
    for (let page = 1; page <= pages && page <= 5; page++) {
      let d;
      try { d = await actSearch({ q, page, hitsPerPage: 100 }); }
      catch (e) { console.warn(`query "${q}" p${page} failed: ${e.message}`); break; }
      pages = d.totalPages ?? 1;
      for (const h of d.hits ?? []) {
        if (byId.has(h.id)) continue;
        if (h.image_is_public !== 1 || !h.image_filename) continue;
        if (!isIcon(h)) continue;
        if (!commonsTitle(h.copyright_source) && !ncPermitted(h)) continue;
        byId.set(h.id, h);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    console.log(`"${q}": pool now ${byId.size}`);
  }
  // The works chosen by hand, which isIcon() would turn away.
  for (let page = 1, pages = 1; page <= pages; page++) {
    const d = await actSearch({ q: "", page, hitsPerPage: 100, filter: `artists = ${JSON.stringify(DUCCIO)}` });
    pages = d.totalPages ?? 1;
    for (const h of d.hits ?? []) {
      if (!CHOSEN_ICON_IDS.has(h.id) || byId.has(h.id)) continue;
      if (h.image_is_public !== 1 || !h.image_filename) continue;
      if (!commonsTitle(h.copyright_source) && !ncPermitted(h)) continue;
      byId.set(h.id, h);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  const unanswered = [...CHOSEN_ICON_IDS].filter((id) => !byId.has(id));
  if (unanswered.length) console.warn(`chosen icons ACT did not return: ${unanswered.join(", ")}`);
  console.log(`chosen by hand: pool now ${byId.size}`);
  const candidates = [...byId.values()];

  const titles = [...new Set(candidates.map((a) => commonsTitle(a.copyright_source)).filter(Boolean))];
  console.log(`Verifying ${titles.length} file licences against Commons…`);
  const lic = await resolveLicences(titles);
  const chosen = candidates.filter((a) => CHOSEN_ICON_IDS.has(a.id));
  const commonsImg = await resolveImages([...new Set(chosen.map((a) => commonsTitle(a.copyright_source)).filter(Boolean))]);
  /** act id → the larger copy's URL, for the works chosen by hand. */
  const chosenImg = new Map();
  for (const a of chosen) {
    const actUrl = ACT_IMAGE(a.image_filename);
    const commons = commonsImg.get(commonsTitle(a.copyright_source));
    const actArea = await jpegArea(actUrl);
    chosenImg.set(a.id, commons && commons.area > actArea ? commons.url : actUrl);
    await new Promise((r) => setTimeout(r, 150));
  }

  const kept = [];
  const dropped = { noRights: 0, unresolved: 0, notFree: 0, excludedArtist: 0 };
  for (const a of candidates) {
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
    if (!clean && freePermitted(a)) {
      // ACT records a free licence of its own (CC BY / CC BY-SA / CC0 / PD).
      clean = tidy(a.copyright_permission);
      original = tidy(a.copyright_source) || "the artist";
    }
    if (!clean) {
      if (!ncPermitted(a)) { dropped.noRights++; continue; }
      clean = NC_LICENCE;
      original = tidy(a.copyright_source) || "the artist";
    }
    const artist = a.artists?.[0] ?? null;
    if (artist && EXCLUDED_ARTISTS.some((x) => String(artist).toLowerCase().includes(x))) {
      dropped.excludedArtist++; continue;
    }
    if (EXCLUDED_IDS.has(a.id)) { dropped.excludedWork = (dropped.excludedWork ?? 0) + 1; continue; }
    kept.push({
      id: a.id,
      title: tidy(a.title),
      artist: tidy(artist),
      date: tidy(a.creation_date) || null,
      where: place(a) || null,
      img: chosenImg.get(a.id) ?? ACT_IMAGE(a.image_filename),
      // Who the icon depicts, when ACT says — this is what makes "teresa"
      // findable even when the title is just "St. Teresa of Avila".
      people: (a.people ?? []).map(tidy),
      // The passages and liturgical days ACT tags an icon to.
      //
      // This file used to drop both, on the stated grounds that icons "carry
      // no scripture refs". That was simply wrong, and an audit measured it:
      // in a live sample of 40 icon hits, 29 carried `scriptures` and 31
      // carried `liturgicalDays`. Keeping them is what lets the weekly icon
      // offer a third choice suggested by the coming Sunday's readings.
      refs: (a.scriptures ?? []).map(tidy),
      days: (a.liturgicalDays ?? []).map(tidy),
      subjects: (a.subjects ?? []).map(tidy),
      act: ACT_ARTWORK(a.id),
      licence: clean,
      attribution: attribution(a, artist, original),
    });
  }
  kept.sort((x, y) => x.id - y.id);
  console.log(`\nKEPT ${kept.length}`);
  console.log("DROPPED", dropped);

  const header = `/**
 * Art in the Christian Tradition — the ICON catalogue.
 *
 * GENERATED FILE. Do not edit by hand: run
 *   node scripts/fetch-act-icons.mjs
 * which re-harvests ACT's icon-tradition works, plus the works chosen in by
 * hand (Duccio's Maestà, each shown from the larger of ACT's copy and the
 * Wikimedia Commons file). Every entry either passed the
 * Wikimedia Commons licence check (public domain / CC0 / CC BY(-SA)) or
 * carries ACT's recorded artist grant of non-commercial use with attribution
 * (Phoebe is a non-profit; the required attribution is printed on the
 * closing slide). Records with neither were dropped.
 *
 * Searched by /icon-prayer ONLY — kept separate from visioCatalogue.ts on
 * purpose: visioSelect must never be able to pick an icon as the day's shared
 * image. Do not merge the two files.
 *
 * These records DO carry scripture refs and liturgical days. This file used to
 * drop them, on the stated grounds that icons had none; an audit measured 29
 * of 40 live icon hits carrying scriptures and 31 carrying liturgicalDays, so
 * the claim was false and the fields are now kept.
 */

export type IconArtwork = {
  id: number;
  title: string;
  artist: string | null;
  date: string | null;
  where: string | null;
  img: string;
  /** Who the icon depicts (ACT's people tags) — searched alongside the title. */
  people: string[];
  /** Passages ACT tags this icon to — the basis of the weekly suggestion. */
  refs: string[];
  /** ACT's liturgical-day tags, e.g. "Year A Proper 17th Sunday". */
  days: string[];
  subjects: string[];
  act: string;
  licence: string;
  attribution: string;
};

export const ICON_CATALOGUE: IconArtwork[] = `;

  writeFileSync(OUT_PATH, header + JSON.stringify(kept, null, 1) + ";\n");
  console.log(`Wrote ${OUT_PATH}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
