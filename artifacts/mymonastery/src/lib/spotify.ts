// Spotify — getting ready for music in the Listening practice (audio divina).
// Built in two layers so the usable part ships now and the rich part is teed up:
//
//   1. DEEP LINK (live now, no credentials): open a curated contemplative
//      playlist in the Spotify app / open.spotify.com with one tap. Playback
//      happens in Spotify; Phoebe still holds the prayer frame + the timer.
//      Lights up the moment CONTEMPLATIVE_PLAYLIST_ID is set to a real id.
//
//   2. IN-APP PLAYBACK (groundwork, dormant): Authorization Code + PKCE OAuth
//      → an access token with the `streaming` scope → the Web Playback SDK on
//      web, or the Spotify iOS SDK natively. Lights up once SPOTIFY_CLIENT_ID +
//      a registered redirect URI exist (Spotify Developer Dashboard) and the
//      listener has Spotify Premium. The PKCE helpers below are the real,
//      reusable pieces of that flow.
//
// Privacy: we never read listening history. The only scopes we'd ever request
// are the minimum to start playback. See artifacts/spotify-integration-notes.md
// for the exact remaining steps.

import { openExternal } from "@/lib/openExternal";

// ——— Configuration (placeholders until the Spotify app is registered) ———

/** From the Spotify Developer Dashboard. Empty → in-app playback stays off. */
export const SPOTIFY_CLIENT_ID = "";

/** A curated sacred/contemplative playlist (Taizé, plainchant, choral, ambient
 *  worship). Spotify playlist id only — e.g. "37i9dQZF1DX...". Empty → the
 *  "Open on Spotify" shortcut stays hidden (no lying control). */
export const CONTEMPLATIVE_PLAYLIST_ID = "";

/** Scopes are the floor needed to *play* — never anything that reads history. */
export const SPOTIFY_SCOPES = ["streaming", "user-read-email", "user-read-private"];

/** Where Spotify sends the user back after auth. Web uses an app route; a
 *  native build would register a custom scheme (app.withphoebe.mobile://spotify)
 *  in the dashboard instead. */
export function spotifyRedirectUri(): string {
  try {
    return `${window.location.origin}/spotify-callback`;
  } catch {
    return "https://withphoebe.app/spotify-callback";
  }
}

/** True once a client id exists — i.e. in-app OAuth playback can be attempted. */
export function spotifyConfigured(): boolean {
  return SPOTIFY_CLIENT_ID.trim().length > 0;
}

/** True once a real curated playlist id exists — gates the deep-link shortcut. */
export function spotifyPlaylistReady(): boolean {
  return CONTEMPLATIVE_PLAYLIST_ID.trim().length > 0;
}

// ——— Layer 1: deep link (works today) ———

/** Open a playlist in Spotify (the app on a phone, the web player otherwise).
 *  Defaults to the curated contemplative playlist. */
export function openSpotifyPlaylist(id: string = CONTEMPLATIVE_PLAYLIST_ID): void {
  if (!id) return;
  // https://open.spotify.com is a universal link — iOS/Android hand it to the
  // installed Spotify app, desktop opens the web player. openExternal routes it
  // out of the WKWebView the same way every other external link does.
  openExternal(`https://open.spotify.com/playlist/${id}`);
}

// ——— Layer 2: PKCE (groundwork for in-app playback) ———

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A high-entropy PKCE code verifier (RFC 7636). Persist it across the redirect
 *  so the token exchange can send it back. */
export function generateCodeVerifier(length = 64): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const random = new Uint8Array(length);
  crypto.getRandomValues(random);
  let out = "";
  for (let i = 0; i < length; i++) out += charset[random[i] % charset.length];
  return out;
}

/** The S256 code challenge for a verifier. */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** Build the Spotify authorize URL for the PKCE flow. Dormant until
 *  spotifyConfigured(); the caller stashes `verifier` (e.g. sessionStorage)
 *  to complete the exchange on the callback. */
export async function buildAuthUrl(verifier: string, state: string): Promise<string> {
  const challenge = await codeChallenge(verifier);
  const params = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    response_type: "code",
    redirect_uri: spotifyRedirectUri(),
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES.join(" "),
    state,
  });
  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

// ——— Layer 2: token storage + exchange (PKCE, client-side, no secret) ———
//
// PKCE lets us exchange the auth code for tokens from the browser without a
// client secret. Refresh tokens held client-side is acceptable for PKCE; moving
// the exchange/refresh to a small server route is the later hardening step
// (see artifacts/spotify-integration-notes.md).

const TOKEN_KEY = "phoebe:spotify-token";
const VERIFIER_KEY = "phoebe:spotify-verifier";
const STATE_KEY = "phoebe:spotify-state";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

type StoredToken = { accessToken: string; refreshToken: string; expiresAt: number };

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

function writeToken(t: StoredToken): void {
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch { /* private mode */ }
}

export function clearSpotifyToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export function spotifyConnected(): boolean {
  return readToken() !== null;
}

/** Kick off the PKCE redirect — stash the verifier so the callback can finish. */
export async function beginSpotifyAuth(): Promise<void> {
  const verifier = generateCodeVerifier();
  const state = generateCodeVerifier(16);
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);
  } catch { /* ignore */ }
  window.location.assign(await buildAuthUrl(verifier, state));
}

/** Complete the redirect: validate state, exchange the code for tokens. Returns
 *  true on success. Call from the /spotify-callback route. */
export async function completeSpotifyAuth(params: URLSearchParams): Promise<boolean> {
  const code = params.get("code");
  const state = params.get("state");
  let verifier = "", expectedState = "";
  try {
    verifier = sessionStorage.getItem(VERIFIER_KEY) ?? "";
    expectedState = sessionStorage.getItem(STATE_KEY) ?? "";
  } catch { /* ignore */ }
  if (!code || !verifier || (expectedState && state !== expectedState)) return false;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: spotifyRedirectUri(),
    client_id: SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return false;
  const json = await res.json();
  writeToken({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  });
  try {
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
  } catch { /* ignore */ }
  return true;
}

async function refreshAccessToken(refreshToken: string): Promise<StoredToken | null> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: SPOTIFY_CLIENT_ID,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const t: StoredToken = {
    accessToken: json.access_token,
    // Spotify may or may not rotate the refresh token.
    refreshToken: json.refresh_token ?? refreshToken,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  writeToken(t);
  return t;
}

/** A non-expired access token, refreshing if needed. null = need to (re)auth. */
export async function getValidAccessToken(): Promise<string | null> {
  const t = readToken();
  if (!t) return null;
  if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
  const refreshed = await refreshAccessToken(t.refreshToken);
  return refreshed?.accessToken ?? null;
}

// ——— Platform gating for IN-APP playback ———
//
// In-app playback has two engines: the native Spotify iOS SDK inside the iPhone
// app, and the Web Playback SDK in the browser/PWA. Both stay hidden until a
// real Client ID exists (spotifyConfigured) — never a control that can't play.

interface CapShim { getPlatform?: () => string; Plugins?: Record<string, unknown> }
function cap(): CapShim | undefined {
  return (window as unknown as { Capacitor?: CapShim }).Capacitor;
}

export function isNativeIOS(): boolean {
  return cap()?.getPlatform?.() === "ios";
}

/** iOS app + the native SpotifyMusic plugin is registered + a Client ID exists. */
export function nativeSpotifyAvailable(): boolean {
  return isNativeIOS() && !!cap()?.Plugins?.SpotifyMusic && spotifyConfigured();
}

/** Browser/PWA (not the iOS app) + a Client ID exists. */
export function webSpotifyAvailable(): boolean {
  return !isNativeIOS() && spotifyConfigured();
}

/** True when in-app playback can be offered at all (either engine). */
export function spotifyInAppAvailable(): boolean {
  return nativeSpotifyAvailable() || webSpotifyAvailable();
}

/** The curated playlist as a Spotify URI (for SDK playback), or "". */
export function contemplativePlaylistUri(): string {
  return CONTEMPLATIVE_PLAYLIST_ID ? `spotify:playlist:${CONTEMPLATIVE_PLAYLIST_ID}` : "";
}
