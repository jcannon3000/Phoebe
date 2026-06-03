// Warm the first ~15 seconds of an audio URL into the browser's HTTP cache so
// the global player starts playing almost immediately when the user taps.
//
// We issue a single ranged GET for the opening bytes (≈15s of a 64–128 kbps
// office podcast is well under 256 KB) and don't await it. When the player
// later loads the same URL, its own range requests are served from cache, so
// playback begins without waiting on the network for the head of the file.
//
// Best-effort and idempotent per session: failures are swallowed, and each URL
// is warmed at most once. No-op for empty URLs.

const FIFTEEN_SEC_BYTES = 256 * 1024;
const warmed = new Set<string>();

export function preloadAudioStart(url: string): void {
  if (!url || warmed.has(url)) return;
  warmed.add(url);
  try {
    void fetch(url, { headers: { Range: `bytes=0-${FIFTEEN_SEC_BYTES - 1}` } })
      .catch(() => { warmed.delete(url); });
  } catch {
    warmed.delete(url);
  }
}
