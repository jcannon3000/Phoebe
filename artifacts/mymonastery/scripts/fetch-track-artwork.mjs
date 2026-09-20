// ── Album covers for the YouTube catalogues ─────────────────────────────────
//
// Owner, 2026-09-19, looking at a listening log of headphone placeholders:
// "Match the YouTube's with the Apple catalogue so we can have album covers".
//
// YouTube gives us the recording; Apple's public search gives us the SLEEVE.
// This asks iTunes Search for each track we list, accepts a match only when
// the title AND the artist agree, and writes what it found to
// src/lib/trackArtwork.ts — a generated map, keyed by catalogue path and
// track number, which the pages read when they log a listen.
//
// NOTHING IS GUESSED. A track Apple does not have, or has under a name that
// does not match, gets no artwork and keeps the headphones. A wrong sleeve is
// worse than none: it tells somebody they listened to a record they did not.
//
//   node scripts/fetch-track-artwork.mjs          # all catalogues
//   node scripts/fetch-track-artwork.mjs --dry    # print, write nothing
//
// The API is public, unauthenticated and rate-limited (~20 calls/minute), so
// this waits between calls and is meant to be run by hand when a catalogue
// changes — never at build time, and never from the app.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const OUT = join(SRC, "lib", "trackArtwork.ts");
const DRY = process.argv.includes("--dry");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Strip what neither side spells the same way. */
function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(feat|ft|featuring|the|a|an|of|and|und|et|de|la|le|los|las)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s) { return new Set(norm(s).split(" ").filter(Boolean)); }

/** How much of the shorter side the two share, 0..1. */
function overlap(a, b) {
  const A = tokens(a), B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit += 1;
  return hit / Math.min(A.size, B.size);
}

async function search(term) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&media=music&limit=12`;
  const res = await fetch(url, { headers: { "User-Agent": "Phoebe/1.0 (artwork match)" } });
  if (!res.ok) throw new Error(`iTunes ${res.status}`);
  const body = await res.json();
  return body.results ?? [];
}

/**
 * A match we are willing to show. The title must be most of the way there and
 * the artist must agree at all — a composer's name matching another
 * performer's record is exactly the mistake to avoid.
 */
function pick(results, title, artist) {
  let best = null;
  for (const r of results) {
    const t = overlap(title, r.trackName);
    const a = Math.max(overlap(artist, r.artistName), overlap(artist, r.collectionName ?? ""));
    const score = t * 2 + a;
    if (t >= 0.7 && a >= 0.34 && (!best || score > best.score)) {
      best = { score, t, a, r };
    }
  }
  return best;
}

/** The catalogues, read out of the TS source rather than duplicated here. */
function readCatalogues() {
  const src = readFileSync(join(SRC, "lib", "youtubeCatalogues.ts"), "utf8");
  const out = [];
  const blocks = src.split(/export const /).slice(1);
  for (const block of blocks) {
    const path = /path:\s*"([^"]+)"/.exec(block)?.[1];
    if (!path) continue;
    const tracks = [];
    // The generated catalogues quote their keys ({"n": 1, "title": …}); a
    // hand-written one might not. Accept both.
    const re = /\{\s*"?n"?:\s*(\d+),\s*"?title"?:\s*"((?:[^"\\]|\\.)*)",\s*"?artist"?:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(block)) !== null) {
      tracks.push({ n: Number(m[1]), title: m[2].replace(/\\"/g, '"'), artist: m[3].replace(/\\"/g, '"') });
    }
    if (tracks.length) out.push({ path, tracks });
  }
  return out;
}

const catalogues = readCatalogues();
console.log(`Catalogues: ${catalogues.map((c) => `${c.path} (${c.tracks.length})`).join(", ")}`);

const found = {};
let hits = 0, misses = 0;
for (const cat of catalogues) {
  for (const t of cat.tracks) {
    const key = `${cat.path}#${t.n}`;
    let best = null;
    for (const term of [`${t.title} ${t.artist}`, t.title]) {
      try {
        best = pick(await search(term), t.title, t.artist);
      } catch (err) {
        console.warn(`  ! ${key} ${String(err)}`);
      }
      await sleep(3200); // the public API's own pace
      if (best) break;
    }
    if (best) {
      // 600px: the row draws it small, and a retina phone asks for more than 100.
      const art = String(best.r.artworkUrl100 || "").replace(/100x100bb/, "600x600bb");
      if (art) {
        found[key] = art;
        hits += 1;
        console.log(`  ✓ ${key} ${t.title} — ${best.r.trackName} / ${best.r.artistName}`);
        continue;
      }
    }
    misses += 1;
    console.log(`  · ${key} ${t.title} — ${t.artist} (no confident match)`);
  }
}

console.log(`\n${hits} matched, ${misses} without a sleeve.`);

const header = `// ── Album covers, matched against Apple's catalogue ─────────────────────────
//
// GENERATED by scripts/fetch-track-artwork.mjs — do not hand-edit; rerun it
// when a catalogue changes (owner, 2026-09-19: "Match the YouTube's with the
// Apple catalogue so we can have album covers").
//
// YouTube holds the recording, Apple holds the sleeve. A track is here only
// when the title AND the artist agreed; anything short of that has no entry
// and keeps the headphones placeholder, because a wrong sleeve tells somebody
// they listened to a record they did not.
//
// ${hits} of ${hits + misses} tracks matched.

/** Keyed by the catalogue's route and the track's number: "/hildegard#3". */
const ARTWORK: Record<string, string> = ${JSON.stringify(found, null, 2)};

/** The sleeve for a track, or undefined — never a placeholder URL. */
export function trackArtwork(cataloguePath: string, n: number): string | undefined {
  return ARTWORK[\`\${cataloguePath}#\${n}\`];
}
`;

if (DRY) {
  console.log("\n--dry: nothing written.");
} else {
  writeFileSync(OUT, header, "utf8");
  console.log(`\nWrote ${OUT}`);
}
