/**
 * Fellows — server feature flag (mirror of the client flag at
 * artifacts/mymonastery/src/lib/fellowsFlag.ts).
 *
 * When false (the current default), every Fellow-dependent surface is OFF. The
 * client already hides them, but this is the SERVER enforcement so a Fellow API
 * (e.g. /api/walk, which exposes a peer's today-only rhythm dots) can't be
 * reached by hand while the feature is off. Keep in sync with the client flag.
 */
export const FELLOWS_ENABLED = false;
