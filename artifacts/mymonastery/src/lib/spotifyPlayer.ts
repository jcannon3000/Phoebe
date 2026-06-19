// Spotify in-app playback — one controller over two engines:
//
//   • iOS app  → the native SpotifyMusic Capacitor plugin (Spotify iOS SDK,
//     app-remote to the installed Spotify app). The real audience path.
//   • Web/PWA  → the Spotify Web Playback SDK (a player in the browser).
//
// Both require Spotify Premium and a registered Client ID (see lib/spotify.ts).
// Everything here is inert until configured — the UI gates on
// spotifyInAppAvailable() so a control never appears that can't make sound.
//
// Privacy: playback only. We start a curated playlist and pause/resume it; we
// never read what the listener has played.

import { useEffect, useState, useCallback } from "react";
import {
  SPOTIFY_CLIENT_ID,
  spotifyRedirectUri,
  contemplativePlaylistUri,
  getValidAccessToken,
  beginSpotifyAuth,
  nativeSpotifyAvailable,
  spotifyInAppAvailable,
} from "@/lib/spotify";

export type PlaybackStatus =
  | "idle"        // not connected
  | "connecting"  // authorizing / spinning up a device
  | "playing"
  | "paused"
  | "needs_auth"  // web: no token yet — a tap will redirect to Spotify
  | "error";

type State = { status: PlaybackStatus; error?: string };

let state: State = { status: "idle" };
const listeners = new Set<(s: State) => void>();

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

function subscribe(l: (s: State) => void): () => void {
  listeners.add(l);
  l(state);
  return () => { listeners.delete(l); };
}

// ——— Native (iOS plugin) ———

interface SpotifyNativePlugin {
  play(opts: { clientId: string; redirectUri: string; playlistUri: string }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  disconnect(): Promise<void>;
}

function nativePlugin(): SpotifyNativePlugin | null {
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  return (plugins?.SpotifyMusic as SpotifyNativePlugin) ?? null;
}

// ——— Web (Web Playback SDK) ———

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";
let sdkLoading: Promise<void> | null = null;
// The Web Playback SDK player + the device id it registers.
let webPlayer: { connect: () => Promise<boolean>; pause: () => Promise<void>; resume: () => Promise<void>; disconnect: () => void } | null = null;
let webDeviceId: string | null = null;

function loadWebSdk(): Promise<void> {
  if (sdkLoading) return sdkLoading;
  sdkLoading = new Promise<void>((resolve, reject) => {
    const w = window as unknown as { Spotify?: unknown; onSpotifyWebPlaybackSDKReady?: () => void };
    if (w.Spotify) { resolve(); return; }
    w.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("Spotify SDK failed to load"));
    document.body.appendChild(script);
  });
  return sdkLoading;
}

async function ensureWebPlayer(): Promise<string | null> {
  await loadWebSdk();
  if (webPlayer && webDeviceId) return webDeviceId;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Spotify = (window as any).Spotify;
  if (!Spotify) return null;

  webDeviceId = await new Promise<string | null>((resolve) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const player = new Spotify.Player({
      name: "Phoebe — Listening",
      getOAuthToken: (cb: (t: string) => void) => { void getValidAccessToken().then((t) => cb(t ?? "")); },
      volume: 0.85,
    });
    player.addListener("ready", ({ device_id }: { device_id: string }) => resolve(device_id));
    player.addListener("not_ready", () => { /* device went offline */ });
    player.addListener("initialization_error", ({ message }: { message: string }) => { set({ status: "error", error: message }); resolve(null); });
    player.addListener("authentication_error", ({ message }: { message: string }) => { set({ status: "needs_auth", error: message }); resolve(null); });
    player.addListener("account_error", () => { set({ status: "error", error: "Spotify Premium is required to play in the app." }); resolve(null); });
    player.addListener("player_state_changed", (s: { paused: boolean } | null) => {
      if (!s) return;
      set({ status: s.paused ? "paused" : "playing" });
    });
    webPlayer = player;
    void player.connect();
  });
  return webDeviceId;
}

async function webPlay(uri: string): Promise<void> {
  const token = await getValidAccessToken();
  if (!token) { set({ status: "needs_auth" }); return; }
  set({ status: "connecting" });
  const deviceId = await ensureWebPlayer();
  if (!deviceId) return; // listeners already set an error/needs_auth status
  const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(uri ? { context_uri: uri } : {}),
  });
  if (!res.ok && res.status !== 204) { set({ status: "error", error: `Playback failed (${res.status})` }); return; }
  set({ status: "playing" });
}

// ——— Public API ———

export async function connectAndPlay(): Promise<void> {
  const uri = contemplativePlaylistUri();
  try {
    if (nativeSpotifyAvailable()) {
      set({ status: "connecting" });
      await nativePlugin()?.play({ clientId: SPOTIFY_CLIENT_ID, redirectUri: spotifyRedirectUri(), playlistUri: uri });
      set({ status: "playing" });
      return;
    }
    await webPlay(uri);
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : "Couldn't start playback" });
  }
}

/** Web only: a tap that takes the user to Spotify to authorize, then back. */
export async function authorize(): Promise<void> {
  await beginSpotifyAuth();
}

export async function pause(): Promise<void> {
  try {
    if (nativeSpotifyAvailable()) { await nativePlugin()?.pause(); set({ status: "paused" }); return; }
    await webPlayer?.pause();
    set({ status: "paused" });
  } catch { /* ignore */ }
}

export async function resume(): Promise<void> {
  try {
    if (nativeSpotifyAvailable()) { await nativePlugin()?.resume(); set({ status: "playing" }); return; }
    await webPlayer?.resume();
    set({ status: "playing" });
  } catch { /* ignore */ }
}

export async function disconnect(): Promise<void> {
  try {
    if (nativeSpotifyAvailable()) { await nativePlugin()?.disconnect(); }
    else { webPlayer?.disconnect(); webPlayer = null; webDeviceId = null; }
  } catch { /* ignore */ }
  set({ status: "idle" });
}

/** React surface for the Listening screen. */
export function useSpotifyPlayback() {
  const [s, setS] = useState<State>(state);
  useEffect(() => subscribe(setS), []);

  const connectPlay = useCallback(() => { void connectAndPlay(); }, []);
  const doAuthorize = useCallback(() => { void authorize(); }, []);
  const doPause = useCallback(() => { void pause(); }, []);
  const doResume = useCallback(() => { void resume(); }, []);
  const doDisconnect = useCallback(() => { void disconnect(); }, []);

  return {
    available: spotifyInAppAvailable(),
    status: s.status,
    error: s.error,
    connectPlay,
    authorize: doAuthorize,
    pause: doPause,
    resume: doResume,
    disconnect: doDisconnect,
  };
}
