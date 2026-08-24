/**
 * A version stamp for the CACHED SHAPE of morning/evening prayer's slide
 * array (morning_prayer_cache / evening_prayer_cache — see their tables in
 * migrate.ts).
 *
 * Real bug this exists to prevent: assembleMorningPrayer/EveningPrayer cache
 * their assembled slides keyed ONLY by calendar date, write-once
 * (onConflictDoNothing) — a cache HIT returns immediately, never re-running
 * the assembler at all. So a code change to what a slide's metadata carries
 * (Suffrages A/B options, say) has NO EFFECT for any day that was already
 * cached before the deploy — reported as "the Suffrages toggle doesn't show
 * the other one": the cached row simply predates the field that toggle reads,
 * and the earliest it would have self-healed is whenever that calendar date
 * ages out of the cache altogether.
 *
 * The fix: stamp this version onto the first cached slide's metadata at
 * write time, and treat a cache row whose stamp doesn't match CURRENT as a
 * MISS — falls through to a fresh assembly (which re-caches with the new
 * stamp) instead of serving stale structure. Bump this number whenever a
 * change alters what shape a cached slide/metadata carries; leave it alone
 * for changes that only touch content (a new liturgical text, a copy edit).
 */
export const OFFICE_CACHE_SCHEMA_VERSION = 2;

/** Read the version a cached slide array was written with. 1 (not 0) for a
 *  row from before this stamp existed at all — distinct from "unset". */
export function cachedSchemaVersion(slides: Array<{ metadata?: unknown }>): number {
  const v = (slides[0]?.metadata as { schemaVersion?: unknown } | undefined)?.schemaVersion;
  return typeof v === "number" ? v : 1;
}

/** Stamp the current version onto slide 0 before caching. Mutates in place
 *  (matches how callers already build the array) and returns it back. */
export function stampSchemaVersion<T extends { metadata: Record<string, unknown> }>(slides: T[]): T[] {
  if (slides[0]) slides[0].metadata = { ...slides[0].metadata, schemaVersion: OFFICE_CACHE_SCHEMA_VERSION };
  return slides;
}
