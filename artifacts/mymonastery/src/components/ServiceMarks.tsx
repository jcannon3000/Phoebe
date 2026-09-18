// ── Streaming service marks ─────────────────────────────────────────────────
//
// Owner, 2026-09-18, of the hymns catalogue: "a spotify open link with a
// spotify symbol on the right that would open and play in the spotify app? And
// then try to find each one for apple music as wll and put an apple symbol next
// to it".
//
// Until now the app had no brand glyphs at all — the Audio Divina library
// showed a literal letter "A" for Apple Music and a 🎵 emoji for Spotify
// (pages/listening.tsx). These are the real marks, drawn inline so nothing is
// fetched: the artifact ships a frozen bundle and every remote asset is one
// more thing that can fail to load on a phone with no signal.
//
// Each is the service's own logo, used the one way both brands ask for — as
// the affordance on a link INTO their app, never as decoration and never
// altered in shape. Spotify keeps its green; Apple's mark is monochrome by its
// own guideline, so it takes the surrounding text colour.

const SPOTIFY_GREEN = "#1ED760";

/** Spotify's circle-and-waves, at the size given (default 18px). */
export function SpotifyMark({ size = 18, color = SPOTIFY_GREEN }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden focusable="false" style={{ flex: "0 0 auto", display: "block" }}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

/** The Apple mark, for an Apple Music link. Monochrome — inherits `color`. */
export function AppleMark({ size = 18, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden focusable="false" style={{ flex: "0 0 auto", display: "block" }}>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}
