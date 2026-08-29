// ─── Wide landscape backdrops (WEB ONLY) ─────────────────────────────────────
//
// A set of wide nature photographs served from /wide on the web
// (mymonastery/public/wide/wide-01.jpg …). They are deliberately NOT bundled
// into the iOS app — the compose-www step drops www/wide, so on native these
// URLs 404. ALWAYS gate their use on !isNativeShell(); on iOS the pages keep
// their own bundled imagery (the Creation Prayer library).
//
// Used as the full-bleed background on Co-Breathe, Contemplation, and Podcasts
// (web).

import { isNativeShell } from "@/lib/isNativeShell";

const WIDE_COUNT = 39;

export const WIDE_PHOTOS: string[] = Array.from({ length: WIDE_COUNT }, (_, i) =>
  `/wide/wide-${String(i + 1).padStart(2, "0")}.jpg`,
);


/**
 * A random wide backdrop for the web; `null` on native (so callers fall back to
 * their bundled imagery). Memoize at the call site (useMemo([], …)) so it stays
 * fixed for the mount instead of reshuffling every render.
 */
export function pickWideBackground(): string | null {
  if (isNativeShell() || WIDE_PHOTOS.length === 0) return null;
  return WIDE_PHOTOS[Math.floor(Math.random() * WIDE_PHOTOS.length)]!;
}
