// ── Which streaming service this listener uses ──────────────────────────────
//
// Owner, 2026-09-18: "if they sign into their apple music account it could just
// simply things to not show the spotify icons".
//
// A hymn is on both services, so every row would otherwise carry two marks and
// make the reader choose the same way ninety-six times. Someone who streams
// music has ONE service; once we know which, the other mark is noise.
//
// Today this is a stated preference (the chooser at the top of the hymns
// catalogue). It is deliberately shaped as the answer to "which service plays
// your music", NOT as "which icons do you want", so that when Apple Music
// sign-in lands natively — the MusicKit plugin that already plays a playlist
// under the Cobreathe breath, see phoebe-mobile's CobreatheMusicPlugin.swift —
// an authorized subscriber can simply set "apple" here and every surface
// follows without a second setting to keep in step.
//
// Not synced to the server: it describes the PHONE (which music app is
// installed and signed in), not the person, and a phone is exactly the scope
// localStorage has. See reference_logout_wipe_and_local_stamps — this is a
// device preference, not a stamp, so it is not wiped on logout.

export type MusicService = "both" | "apple" | "spotify";

const KEY = "phoebe:music-service";

/** Fires on this tab when the choice changes (storage events only cross tabs). */
export const MUSIC_SERVICE_EVENT = "phoebe:music-service-changed";

export function getMusicService(): MusicService {
  try {
    const v = localStorage.getItem(KEY);
    return v === "apple" || v === "spotify" ? v : "both";
  } catch {
    // Private windows and blocked site data throw on read — show both marks
    // rather than losing the links entirely.
    return "both";
  }
}

export function setMusicService(v: MusicService): void {
  try {
    if (v === "both") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  } catch { /* unwritable storage: the choice just doesn't persist */ }
  try { window.dispatchEvent(new Event(MUSIC_SERVICE_EVENT)); } catch { /* SSR */ }
}

/** Should a row show the Apple Music mark? */
export function showsApple(v: MusicService): boolean { return v !== "spotify"; }

/** Should a row show the Spotify mark? */
export function showsSpotify(v: MusicService): boolean { return v !== "apple"; }
