// ── Which streaming service this listener uses ──────────────────────────────
//
// Owner, 2026-09-18: "if they sign into their apple music account it could just
// simply things to not show the spotify icons" … "change that top to a drop
// down of which one it opens in" … "dont have all the icons on the right, just
// a play button".
//
// A hymn is on all three services, so a row carrying three marks made the
// reader choose the same way ninety-six times. Someone who streams music has
// ONE service. So the service is chosen ONCE, at the top, and every row is then
// a single play button that opens there.
//
// It is deliberately shaped as the answer to "which service plays your music",
// NOT as "which icons do you want", so that when Apple Music sign-in lands
// natively — the MusicKit plugin that already plays a playlist under the
// Cobreathe breath, see phoebe-mobile's CobreatheMusicPlugin.swift — an
// authorized subscriber can simply set "apple" here and every surface follows
// without a second setting to keep in step.
//
// Not synced to the server: it describes the PHONE (which music app is
// installed and signed in), not the person, and a phone is exactly the scope
// localStorage has. See reference_logout_wipe_and_local_stamps — this is a
// device preference, not a stamp, so it is not wiped on logout.

export type MusicService = "spotify" | "apple" | "youtube";

export const MUSIC_SERVICES: readonly { id: MusicService; label: string }[] = [
  // Spotify first because it is the one service every recording is on: the
  // catalogue was built from a Spotify playlist, so it can never be the
  // service that leaves a row with nothing to play.
  { id: "spotify", label: "Spotify" },
  { id: "apple", label: "Apple Music" },
  { id: "youtube", label: "YouTube" },
];

const KEY = "phoebe:music-service";

/** Fires on this tab when the choice changes (storage events only cross tabs). */
export const MUSIC_SERVICE_EVENT = "phoebe:music-service-changed";

export function getMusicService(): MusicService {
  try {
    const v = localStorage.getItem(KEY);
    return v === "apple" || v === "youtube" || v === "spotify" ? v : "spotify";
  } catch {
    // Private windows and blocked site data throw on read — fall back to the
    // service with complete coverage rather than losing the links entirely.
    return "spotify";
  }
}

export function setMusicService(v: MusicService): void {
  try { localStorage.setItem(KEY, v); }
  catch { /* unwritable storage: the choice just doesn't persist */ }
  try { window.dispatchEvent(new Event(MUSIC_SERVICE_EVENT)); } catch { /* SSR */ }
}
