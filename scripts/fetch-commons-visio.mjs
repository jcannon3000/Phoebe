// Build artifacts/mymonastery/src/lib/visioCommonsCatalogue.ts — Wikimedia
// Commons artworks that DEPICT a gospel passage the ACT library has no
// painting of.
//
// Usage:
//   node scripts/fetch-commons-visio.mjs
//
// Owner, 2026-09-15, after Visio moved to "the priority is exact matches":
// "could you go through [Wikimedia Commons], looking for images that are
// connected to the passages or themes?"
//
// ── The picks are chosen by hand; the rights are checked every run ──
//
// scripts/visio-commons-picks.json lists each chosen file and the verses it
// actually shows ({ file, refs, title?, artist?, where?, date?, people?, subjects? }). Every
// pick was looked at before it was listed: it shows the scene, carries no
// nudity (owner: "any image with nudity should not be in there") and nothing
// gory. This script trusts none of the metadata it was chosen from. Each run it
// asks the Commons API again for the file's licence, artist, date and size, and
// DROPS anything that is not free (public domain / CC0 / CC BY / CC BY-SA),
// is under 1000px on its long side, or whose description trips the nudity
// keyword screen. A file that has changed licence falls out on the next run.
//
// ── Ids ──
//
// Stable numeric ids in a range ACT never uses (9,000,000+), hashed from the
// file name, so the week schedule's pins, the history gallery and the admin
// art library's overrides (act_overrides is keyed by this number) survive a
// regeneration in any order.
//
// After running: regenerate the schedule, or every pin still points at the old
// pool — pnpm --filter @workspace/api-server run build:visio-schedule

import { readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const PICKS = resolve(REPO_ROOT, "scripts/visio-commons-picks.json");
const OUT_PATH = resolve(REPO_ROOT, "artifacts/mymonastery/src/lib/visioCommonsCatalogue.ts");
const UA = "Phoebe/1.0 (prayer app; +https://withphoebe.app; jcannon3000@gmail.com)";
const API = "https://commons.wikimedia.org/w/api.php";

const FREE = /^(public domain|pd[- ].*|cc0( 1\.0)?|cc by(-sa)? \d(\.\d)?( [a-z-]+)?)$/i;
const NUDITY = /\b(nude|nudes|naked|nudity|undress|bathing|bathers)\b/i;
const plain = (html) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
// Commons folds Wikidata QuickStatements into ObjectName and DateTimeOriginal
// ("The Return of the Prodigal Son label QS:Lit,\"…\"", "circa 1668 date QS:P571,…").
const cleanField = (html) => plain(html).replace(/\s+(label|date)\s+QS:.*$/i, "").trim();
// Thumbnail links arrive with tracking parameters (?utm_source=…); the image
// itself needs none.
const bareUrl = (u) => String(u ?? "").split("?")[0];

function idFor(file) {
  // FNV-1a over the normalised file title.
  let h = 0x811c9dc5;
  for (const ch of file.replace(/^File:/i, "").replace(/_/g, " ").trim()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 9_000_000 + (h % 1_000_000);
}

async function infoFor(files) {
  const out = new Map();
  for (let i = 0; i < files.length; i += 20) {
    const batch = files.slice(i, i + 20);
    const q = new URLSearchParams({
      action: "query", format: "json", maxlag: "5", prop: "imageinfo",
      iiprop: "url|size|extmetadata", iiurlwidth: "1600", titles: batch.join("|"),
    });
    const res = await fetch(`${API}?${q}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Commons ${res.status}`);
    const d = await res.json();
    const norm = new Map((d.query?.normalized ?? []).map((n) => [n.to, n.from]));
    for (const p of Object.values(d.query?.pages ?? {})) {
      const asked = norm.get(p.title) ?? p.title;
      out.set(asked, p);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return out;
}

const main = async () => {
  const picks = JSON.parse(readFileSync(PICKS, "utf8"));
  const info = await infoFor(picks.map((p) => p.file));
  const kept = [];
  const dropped = [];
  const seen = new Set();
  for (const pick of picks) {
    const page = info.get(pick.file);
    const ii = page?.imageinfo?.[0];
    if (!ii) { dropped.push([pick.file, "not found on Commons"]); continue; }
    const m = ii.extmetadata ?? {};
    const licence = plain(m.LicenseShortName?.value);
    if (!FREE.test(licence)) { dropped.push([pick.file, `licence "${licence}"`]); continue; }
    if (Math.max(ii.width ?? 0, ii.height ?? 0) < 1000) { dropped.push([pick.file, `too small ${ii.width}x${ii.height}`]); continue; }
    const described = `${cleanField(m.ObjectName?.value)} ${plain(m.ImageDescription?.value)} ${plain(m.Categories?.value)}`;
    if (NUDITY.test(described)) { dropped.push([pick.file, "nudity keyword"]); continue; }
    const id = idFor(pick.file);
    if (seen.has(id)) { dropped.push([pick.file, "duplicate id"]); continue; }
    seen.add(id);
    // A pick may name the artist itself: the Rijksmuseum's print uploads put
    // the MUSEUM in the Artist field and the printmaker (Jan Luyken, Pieter
    // van der Borcht, Adriaen Collaert…) only in the description. The pick's
    // artist is still checked against that description, so it can't wander.
    // "Unknown painter" names nobody, so there is nothing to check it against;
    // a photograph of a fresco or mosaic puts the PHOTOGRAPHER in Artist.
    const metaArtist = plain(m.Artist?.value).replace(/\s*\(\d{3,4}[^)]*\)\s*$/, "") || null;
    const namesSomeone = pick.artist && !/^unknown\b/i.test(pick.artist);
    if (namesSomeone && !`${metaArtist ?? ""} ${plain(m.ImageDescription?.value)} ${plain(m.Credit?.value)}`.toLowerCase().includes(pick.artist.toLowerCase().split(" ").pop())) {
      dropped.push([pick.file, `artist "${pick.artist}" not named in the file's metadata`]); continue;
    }
    const artist = pick.artist || metaArtist;
    const title = pick.title || cleanField(m.ObjectName?.value) || pick.file.replace(/^File:/, "").replace(/\.[a-z]+$/i, "");
    const filePage = ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(pick.file.replace(/ /g, "_"))}`;
    kept.push({
      id,
      title,
      artist,
      // A photograph of a fresco dates the PHOTOGRAPH, so a pick may date the
      // work itself. "15 th century" and "1481-82." are Commons' own spacing.
      date: pick.date ?? (cleanField(m.DateTimeOriginal?.value).replace(/(\d) (st|nd|rd|th)\b/g, "$1$2").replace(/\.$/, "") || null),
      where: pick.where ?? null,
      img: bareUrl(ii.thumburl && (ii.width ?? 0) > 1600 ? ii.thumburl : ii.url),
      refs: pick.refs,
      days: [],
      people: pick.people ?? [],
      subjects: pick.subjects ?? [],
      essay: "",
      act: filePage,
      licence,
      // Worded like ACT's own credits ("… Original source: Wikimedia Commons."):
      // Visio's closing slide appends `where` and `licence` itself. CC BY is a
      // promise to credit whoever the file names, so when the pick has put the
      // painter in that name's place, the file's own name rides here.
      attribution: `${artist ? `${artist}. ` : ""}${title}.${/^cc by/i.test(licence) && metaArtist && metaArtist !== artist ? ` Photo: ${metaArtist.replace(/\.$/, "")}.` : ""} Original source: Wikimedia Commons.`,
    });
  }
  kept.sort((a, b) => a.id - b.id);
  console.log(`KEPT ${kept.length} of ${picks.length}`);
  for (const [f, why] of dropped) console.log(`DROPPED ${f}: ${why}`);

  const header = `/**
 * Wikimedia Commons — gospel scenes the ACT library has no painting of.
 *
 * GENERATED FILE. Do not edit by hand: edit scripts/visio-commons-picks.json and
 * run  node scripts/fetch-commons-visio.mjs  (then rebuild the Visio schedule).
 *
 * Owner, 2026-09-15: "could you go through [Wikimedia Commons], looking for
 * images that are connected to the passages or themes?" Each pick was looked at
 * (the scene, no nudity, nothing gory); each run re-checks its licence on the
 * Commons API and keeps only public domain / CC0 / CC BY / CC BY-SA. Ids are
 * 9,000,000+ so they never meet an ACT record id.
 */
import type { CatalogueArtwork } from "./visioCatalogue";

export const COMMONS_VISIO_CATALOGUE: CatalogueArtwork[] = `;
  writeFileSync(OUT_PATH, `${header}${JSON.stringify(kept, null, 1)};\n`, "utf8");
  console.log(`wrote ${OUT_PATH}`);
};

main().catch((e) => { console.error(e); process.exit(1); });
