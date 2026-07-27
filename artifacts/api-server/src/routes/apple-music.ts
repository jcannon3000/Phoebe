// Apple Music catalogue search — so a listener can search Apple Music INSIDE
// Phoebe on the web (there's no native MusicKit here). We sign a developer
// token server-side (ES256, MusicKit .p8 key) and proxy the search so the
// private key never reaches the client.
//
// Catalogue search needs ONLY the developer token — no user (Apple Music)
// sign-in or authorization, and it never prompts anyone for Apple Music
// access. Playback of a result is a deep-link to music.apple.com — there is
// no in-app Apple Music playback in Phoebe.
//
// Setup (one-time): Apple Developer portal → Certificates, IDs & Profiles →
// Keys → create a key with MusicKit enabled → download AuthKey_XXXX.p8. Then
// set these env vars (Railway):
//   APPLE_MUSIC_KEY_ID      — the 10-char Key ID
//   APPLE_MUSIC_TEAM_ID     — your 10-char Team ID
//   APPLE_MUSIC_PRIVATE_KEY (or APPLE_MUSIC_PRIVATE_KEY_B64) — the .p8
//     contents (PEM; literal \n or base64 both ok)
// Until those are set, /api/apple-music/search returns { results: [] } and the
// client falls back to Spotify / paste-a-link.

import { Router, type Request, type Response } from "express";
import { SignJWT, importPKCS8 } from "jose";

const router = Router();

// Apple developer tokens are long-lived; sign once and reuse (re-sign well
// before expiry). Module-scoped cache.
let cached: { token: string; expSec: number } | null = null;

function normalizePrivateKey(raw: string): string {
  let k = raw.trim();
  // Allow a base64-encoded .p8 (handy for single-line env vars).
  if (!k.includes("BEGIN")) {
    try { k = Buffer.from(k, "base64").toString("utf8"); } catch { /* leave as-is */ }
  }
  return k.replace(/\\n/g, "\n");
}

async function developerToken(): Promise<string | null> {
  const keyId = process.env.APPLE_MUSIC_KEY_ID?.trim();
  const teamId = process.env.APPLE_MUSIC_TEAM_ID?.trim();
  // Accept either name — this repo's env has shipped both over time.
  const rawKey = process.env.APPLE_MUSIC_PRIVATE_KEY ?? process.env.APPLE_MUSIC_PRIVATE_KEY_B64;
  if (!keyId || !teamId || !rawKey) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (cached && cached.expSec - 600 > nowSec) return cached.token;

  try {
    const key = await importPKCS8(normalizePrivateKey(rawKey), "ES256");
    const expSec = nowSec + 60 * 60 * 24 * 150; // ~5 months (Apple caps at 6)
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt(nowSec)
      .setExpirationTime(expSec)
      .sign(key);
    cached = { token, expSec };
    return token;
  } catch (err) {
    console.error("apple-music: failed to sign developer token:", err);
    return null;
  }
}

function artwork(a: { url?: string } | undefined): string {
  if (!a?.url) return "";
  return a.url.replace("{w}", "160").replace("{h}", "160");
}

type AppleAttrs = { name?: string; artistName?: string; curatorName?: string; url?: string; artwork?: { url?: string } };
type AppleData = { id: string; attributes?: AppleAttrs };

function map(kind: "artist" | "song" | "album" | "playlist", rows: AppleData[]): unknown[] {
  return rows.map((r) => ({
    id: r.id,
    kind,
    title: r.attributes?.name ?? "",
    subtitle: kind === "playlist" ? (r.attributes?.curatorName ?? "") : kind === "artist" ? "Artist" : (r.attributes?.artistName ?? ""),
    artworkUrl: artwork(r.attributes?.artwork),
    url: r.attributes?.url ?? "",
    service: "apple",
    appleId: r.id,
  }));
}

// GET /api/apple-music/search?term=...&storefront=us
router.get("/apple-music/search", async (req: Request, res: Response): Promise<void> => {
  const term = String(req.query.term ?? "").trim();
  if (!term) { res.json({ results: [] }); return; }
  const storefront = String(req.query.storefront ?? "us").replace(/[^a-z]/gi, "").slice(0, 2).toLowerCase() || "us";

  const token = await developerToken();
  if (!token) { res.json({ results: [], reason: "not-configured" }); return; }

  try {
    const url = `https://api.music.apple.com/v1/catalog/${storefront}/search`
      + `?term=${encodeURIComponent(term)}&types=artists,songs,albums,playlists&limit=5`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      // Bound the outbound call so a hung Apple endpoint can't tie up the
      // request (peers cac.ts / ncmp.ts / weekly-plan-content.ts do the same).
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) { res.json({ results: [], reason: `apple-${r.status}` }); return; }
    const j = await r.json() as { results?: { artists?: { data?: AppleData[] }; songs?: { data?: AppleData[] }; albums?: { data?: AppleData[] }; playlists?: { data?: AppleData[] } } };
    // Interleave the kinds round-robin so the dropdown shows a MIX (song, album,
    // artist, playlist, …) rather than 5 songs first with albums/artists pushed
    // out of view.
    const lists = [
      map("song", j.results?.songs?.data ?? []),
      map("album", j.results?.albums?.data ?? []),
      map("artist", j.results?.artists?.data ?? []),
      map("playlist", j.results?.playlists?.data ?? []),
    ];
    const results: unknown[] = [];
    for (let i = 0; i < 5; i++) for (const l of lists) if (l[i]) results.push(l[i]);
    res.json({ results });
  } catch (err) {
    console.error("apple-music: search failed:", err);
    res.json({ results: [], reason: "error" });
  }
});

// GET /api/apple-music/status — whether catalogue search is configured.
router.get("/apple-music/status", async (_req: Request, res: Response): Promise<void> => {
  res.json({ configured: !!(await developerToken()) });
});

export default router;
