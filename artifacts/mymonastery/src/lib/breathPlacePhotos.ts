/**
 * BUNDLED photo sets for designated places.
 *
 * A place's photo library is normally a list of https URLs (see
 * breath_places.photo_urls) — that's the only thing that works for a place an
 * admin creates at runtime, because the app's asset globs are resolved at
 * BUILD time and can't see a row that didn't exist when the bundle was made.
 *
 * But some places ship WITH the app, and for those a URL would be strictly
 * worse: a network fetch, on a surface that must not stutter, for an image we
 * could have had on disk. So a place's photoUrls may also contain the sentinel
 *
 *     bundled:<key>
 *
 * which expands here to every image under src/assets/breath-places/<key>/.
 * The two compose — a place can carry a bundled set AND external URLs — and a
 * sentinel naming a set that doesn't exist expands to nothing rather than
 * breaking the place.
 */

// Every image under src/assets/breath-places/<set>/, grouped by folder name.
// eager+url so these are real bundled asset URLs, exactly like the Co-Breathe
// library — no runtime import cost.
const BUNDLED_SETS: Record<string, string[]> = (() => {
  const files = import.meta.glob("@/assets/breath-places/*/*.{jpg,jpeg,png,avif,webp}", {
    eager: true,
    query: "?url",
    import: "default",
  }) as Record<string, string>;
  const out: Record<string, string[]> = {};
  for (const [path, url] of Object.entries(files)) {
    // ".../assets/breath-places/<set>/<file>" — the set is the second-to-last segment.
    const parts = path.split("/");
    const set = parts[parts.length - 2];
    if (!set) continue;
    (out[set] ??= []).push(url);
  }
  // Stable order — the breath steps through these by index, and two people at
  // the same place must land on the same image. Object.entries' order is not
  // guaranteed across builds, so sort rather than trust it.
  for (const k of Object.keys(out)) out[k]!.sort();
  return out;
})();

export const BUNDLED_SET_PREFIX = "bundled:";

/** Names of the photo sets that ship with the app (for the admin picker). */
export function bundledSetNames(): string[] {
  return Object.keys(BUNDLED_SETS).sort();
}

/**
 * Expand a place's stored photo list into real image URLs — bundled sentinels
 * replaced by their images, https URLs passed through untouched.
 */
export function resolvePlacePhotos(stored: string[] | null | undefined): string[] {
  if (!stored || stored.length === 0) return [];
  const out: string[] = [];
  for (const entry of stored) {
    if (entry.startsWith(BUNDLED_SET_PREFIX)) {
      const key = entry.slice(BUNDLED_SET_PREFIX.length).trim();
      for (const u of BUNDLED_SETS[key] ?? []) out.push(u);
    } else {
      out.push(entry);
    }
  }
  return out;
}
