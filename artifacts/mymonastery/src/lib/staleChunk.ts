// Stale-deploy recovery for our code-split routes.
//
// Routes are loaded with React.lazy(), so a browser still running a
// pre-deploy page will try to import() chunk filenames that the new
// deploy has already removed. The dynamic import rejects — surfaced as
// "Failed to fetch dynamically imported module" / "Importing a module
// script failed" / ChunkLoadError — and (with no handler) bubbles to the
// app's error boundary as a generic crash.
//
// The service worker serves navigations network-first, so a reload pulls
// the fresh index.html + current chunk hashes and recovers cleanly. We
// guard with a short sessionStorage cooldown so a genuinely broken
// deploy (chunks 404 even when fresh) can't spin in a reload loop — after
// one failed attempt we let the real error surface instead.

const RELOAD_KEY = "phoebe:chunk-reload-at";
const COOLDOWN_MS = 10_000;

/** True when an error looks like a failed dynamic-import / chunk load. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? "");
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

/**
 * Reload once to pick up the fresh deploy. Returns true if it actually
 * triggered a reload, false if the cooldown suppressed it (so callers can
 * fall back to showing the real error instead of spinning).
 */
export function recoverFromStaleChunk(reason: string): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? "0");
    if (Number.isFinite(last) && Date.now() - last < COOLDOWN_MS) {
      return false; // already tried very recently — don't loop
    }
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* private mode — fall through and still reload once */
  }
  console.warn(`[phoebe] reloading to recover from a stale chunk (${reason})`);
  window.location.reload();
  return true;
}
