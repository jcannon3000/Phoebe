// Spotify CATALOGUE search — distinct from lib/spotify.ts's client-side user
// OAuth (PKCE), which is for a signed-in listener's own playlists/playback
// and needs SPOTIFY_CLIENT_ID (still unset). This is Spotify's Client
// Credentials flow: an app-level token with no user involved at all, used
// only to look up a public album/track's id + link for the admin
// audio-library tool (see routes/curated-audio.ts). The private secret
// never reaches the client.
//
// Setup (one-time): Spotify Developer Dashboard → Create app → note the
// Client ID and Client Secret. Then set these env vars (Railway):
//   SPOTIFY_APP_CLIENT_ID
//   SPOTIFY_APP_CLIENT_SECRET
// Until those are set, catalogue lookups return { configured: false } and
// the admin tool falls back to pasting a Spotify link by hand.
import { Router, type Request, type Response } from "express";

const router = Router();

let cached: { token: string; expMs: number } | null = null;

async function appToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_APP_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_APP_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;

  const now = Date.now();
  if (cached && cached.expMs - 60_000 > now) return cached.token;

  try {
    const basic = Buffer.from(`${id}:${secret}`).toString("base64");
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json() as { access_token?: string; expires_in?: number };
    if (!j.access_token) return null;
    cached = { token: j.access_token, expMs: now + (j.expires_in ?? 3600) * 1000 };
    return cached.token;
  } catch (err) {
    console.error("spotify-catalog: token request failed:", err);
    return null;
  }
}

type SpotifyImage = { url?: string };
type SpotifyAlbumSummary = { id: string; name?: string; images?: SpotifyImage[]; external_urls?: { spotify?: string }; artists?: { name?: string }[] };
type SpotifyTrack = { id: string; name?: string; track_number?: number; duration_ms?: number; external_urls?: { spotify?: string } };
type SpotifyAlbumFull = SpotifyAlbumSummary & { tracks?: { items?: SpotifyTrack[] } };

// GET /api/spotify-catalog/status
router.get("/spotify-catalog/status", async (_req: Request, res: Response): Promise<void> => {
  res.json({ configured: !!(await appToken()) });
});

// GET /api/spotify-catalog/match-album?title=...&artist=...
// Best-effort: searches Spotify for the given album title + artist and
// returns the top match with its full tracklist, so the admin tool can
// auto-fill Spotify links after picking an Apple Music album. Returns
// { album: null } rather than an error when nothing matches or Spotify
// isn't configured — this is a convenience, not a required step, since the
// admin can always paste a Spotify link by hand.
router.get("/spotify-catalog/match-album", async (req: Request, res: Response): Promise<void> => {
  const title = String(req.query.title ?? "").trim();
  const artist = String(req.query.artist ?? "").trim();
  if (!title) { res.json({ album: null, reason: "no-title" }); return; }

  const token = await appToken();
  if (!token) { res.json({ album: null, reason: "not-configured" }); return; }

  try {
    const q = artist ? `album:${title} artist:${artist}` : `album:${title}`;
    const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=3`;
    const sr = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!sr.ok) { res.json({ album: null, reason: `spotify-${sr.status}` }); return; }
    const sj = await sr.json() as { albums?: { items?: SpotifyAlbumSummary[] } };
    const best = sj.albums?.items?.[0];
    if (!best) { res.json({ album: null, reason: "no-match" }); return; }

    const ar = await fetch(`https://api.spotify.com/v1/albums/${best.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!ar.ok) { res.json({ album: null, reason: `spotify-${ar.status}` }); return; }
    const full = await ar.json() as SpotifyAlbumFull;
    const tracks = (full.tracks?.items ?? []).map((t) => ({
      spotifyTrackId: t.id,
      trackNumber: t.track_number ?? 0,
      title: t.name ?? "",
      durationMs: t.duration_ms ?? null,
      spotifyUrl: t.external_urls?.spotify ?? "",
    }));
    res.json({
      album: {
        spotifyAlbumId: full.id,
        title: full.name ?? "",
        artist: full.artists?.[0]?.name ?? "",
        spotifyUrl: full.external_urls?.spotify ?? "",
        tracks,
      },
    });
  } catch (err) {
    console.error("spotify-catalog: match failed:", err);
    res.json({ album: null, reason: "error" });
  }
});

export default router;
