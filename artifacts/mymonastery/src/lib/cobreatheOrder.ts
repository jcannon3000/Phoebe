// Deterministic, shareable photo ordering for the Cobreathe breath.
//
// Every client on the same build holds the same photo set, but Vite hashes the
// filenames and `import.meta.glob` enumeration order isn't stable across builds.
// To let garden-mates follow the SAME sequence without ever exchanging the list,
// we:
//   1. derive a stable "stem" from each hashed URL (strip the -<hash>.<ext>),
//   2. sort by stem → an identical canonical order on every client,
//   3. shuffle each block with a seeded PRNG keyed by (masterSeed, blockIndex).
// A leader broadcasts a single integer seed; followers reproduce the exact
// order and, knowing the leader's start time, the exact CURRENT photo.

// The breath always opens on this one calm image (pinned to index 0); matched
// by source-filename stem so it survives Vite hashing.
export const FIRST_PHOTO_KEY = "photo-1589648751789";

// mulberry32 — tiny, fast, well-distributed seeded PRNG. Deterministic given the
// seed, so every client produces the identical sequence.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a 32-bit string hash → a stable integer seed from "(masterSeed):(block)"
// or from the sorted-stems fingerprint string.
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Strip a hashed asset URL down to its stable source stem:
//   /assets/museums-victoria-KYjxhEPk4l8-unsplash-DObXACKq.jpg
//     → museums-victoria-KYjxhEPk4l8-unsplash
// Used only as a sort key + hash input, so over-trimming an unusual name is
// harmless as long as it's deterministic and identical on every client. The
// pinned stem (photo-1589648751789) survives, so the opening pin still matches.
export function photoStem(url: string): string {
  const base = url.split("/").pop() ?? url;
  const noExt = base.replace(/\.[a-z0-9]+$/i, "");
  return noExt.replace(/-[A-Za-z0-9_]{6,}$/, "");
}

export interface Canonical {
  opening: string | null; // the pinned avif, shown at index 0
  rest: string[]; // the remaining photos, sorted by stem
}

// Build the canonical split: pinned opener first, everything else sorted by stem
// so all clients agree on the same base ordering regardless of glob/hash order.
export function buildCanonical(photos: string[]): Canonical {
  const sorted = photos
    .map((url) => ({ url, stem: photoStem(url) }))
    .sort((a, b) => (a.stem < b.stem ? -1 : a.stem > b.stem ? 1 : 0));
  let opening: string | null = null;
  const rest: string[] = [];
  for (const { url, stem } of sorted) {
    if (opening === null && stem.includes(FIRST_PHOTO_KEY)) opening = url;
    else rest.push(url);
  }
  return { opening, rest };
}

// One block = one full pass through `rest`, shuffled by (masterSeed, block).
// Fisher–Yates driven by mulberry32 seeded from a hash of the two.
export function seededShuffle(rest: string[], masterSeed: number, block: number): string[] {
  const arr = rest.slice();
  const rand = mulberry32(hashString(`${masterSeed}:${block}`));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// The photo at a global breath index:
//   idx 0   → the opening avif
//   idx ≥ 1 → block = floor((idx-1)/M), within = (idx-1)%M of that block's
//             seeded shuffle of the M non-opening photos.
// Pure function of (masterSeed, idx) for a fixed photo set → every client agrees
// without exchanging the list. Cheap enough (a 52-item shuffle) to call at each
// breath boundary; the rAF loop only calls it when the index actually changes.
export function photoForGlobalIndex(canonical: Canonical, masterSeed: number, idx: number): string {
  const { opening, rest } = canonical;
  if (idx <= 0 || rest.length === 0) return opening ?? rest[0] ?? "";
  const M = rest.length;
  const block = Math.floor((idx - 1) / M);
  const within = (idx - 1) % M;
  return seededShuffle(rest, masterSeed, block)[within];
}

// A short fingerprint of the photo SET (count + hashed sorted stems). Two clients
// only sync if these match — guards against build/version drift where the photo
// set differs (then each falls back to its own order). Hash-invariant across
// builds of the SAME set, because it's computed from stems, not hashed URLs.
export function computeFingerprint(photos: string[]): string {
  const stems = photos.map(photoStem).sort();
  return `${stems.length}:${hashString(stems.join("|")).toString(36)}`;
}

// A fresh random master seed for a leader / solo session.
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}
