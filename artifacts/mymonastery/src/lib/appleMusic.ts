// Apple Music in-app playback for the Listening practice (audio divina).
//
// iOS only, through the native MusicKit plugin (CobreatheMusic — shared with
// Cobreathe). Plays one curated contemplative playlist via the app's own
// ApplicationMusicPlayer. Playback ONLY — never reads listening history.
// Requires an Apple Music subscription (checked at play time).
//
// There is no web Apple Music here yet (that needs MusicKit JS + a developer
// token / JWT — the heavier path the old, removed integration used). On web this
// provider simply reports unavailable, and the UI falls back to Spotify or
// bring-your-own. See artifacts/spotify-integration-notes.md for the music plan.

import { useEffect, useState, useCallback } from "react";
import { isNativeIOS } from "@/lib/spotify";
import type { PlaybackStatus } from "@/lib/spotifyPlayer";

/** A curated sacred/contemplative Apple Music playlist id (catalog id, not a
 *  URL). Empty → Apple Music stays hidden (no lying control).
 *  Currently "Pure Calm" (Apple-curated). */
export const APPLE_MUSIC_PLAYLIST_ID = "pl.ffc344338c3d4ff394ddcf94d766c143";

export function appleMusicConfigured(): boolean {
  return APPLE_MUSIC_PLAYLIST_ID.trim().length > 0;
}

export type AppleSearchResult = { id: string; kind: "song" | "album" | "playlist"; title: string; subtitle: string; artworkUrl: string; url: string };
export type AppleLibraryItem = { id: string; kind: "playlist"; title: string; subtitle: string; artworkUrl: string };

interface AppleMusicPlugin {
  authorize(): Promise<{ status: string }>;
  isAvailable(): Promise<{ available: boolean }>;
  play(opts: { playlistId: string; shuffle: boolean }): Promise<{ playing: boolean; reason?: string }>;
  playItem(opts: { id: string; kind: string }): Promise<{ playing: boolean; reason?: string }>;
  searchCatalog(opts: { term: string }): Promise<{ results: AppleSearchResult[]; reason?: string }>;
  getLibraryPlaylists(): Promise<{ items: AppleLibraryItem[]; reason?: string }>;
  playLibraryItem(opts: { id: string }): Promise<{ playing: boolean; reason?: string }>;
  skipNext(): Promise<void>;
  skipPrevious(): Promise<void>;
  nowPlaying(): Promise<{ title: string; subtitle?: string; artworkUrl?: string; playbackTime?: number; isPlaying?: boolean }>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<void>;
}

function plugin(): AppleMusicPlugin | null {
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  return (plugins?.CobreatheMusic as AppleMusicPlugin) ?? null;
}

/** iOS app + the MusicKit plugin present + a configured playlist. */
export function appleMusicAvailable(): boolean {
  return isNativeIOS() && !!plugin() && appleMusicConfigured();
}

// ——— Module state (mirrors spotifyPlayer so the unified layer is symmetric) ———

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

export async function connectAndPlay(): Promise<void> {
  const p = plugin();
  if (!p) { set({ status: "error", error: "Apple Music isn't available here." }); return; }
  try {
    set({ status: "connecting" });
    const auth = await p.authorize();
    if (auth.status !== "authorized") {
      set({ status: "error", error: "Apple Music access is off. You can turn it on in Settings, or play your own music." });
      return;
    }
    const { available } = await p.isAvailable();
    if (!available) {
      set({ status: "error", error: "This needs an Apple Music subscription. You can still play your own music." });
      return;
    }
    // shuffle:false — hear the curated playlist in its intended order.
    const res = await p.play({ playlistId: APPLE_MUSIC_PLAYLIST_ID, shuffle: false });
    if (!res.playing) { set({ status: "error", error: "The music didn't start. You can play your own instead." }); return; }
    set({ status: "playing" });
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : "The music didn't start." });
  }
}

// Play ANY catalog item the listener saved — a song, album, or playlist (their
// own sacred music, not a fixed Phoebe playlist). Returns false if it couldn't
// start, so the caller can fall back to opening Apple Music.
export async function playAppleItem(id: string, kind: string): Promise<boolean> {
  const p = plugin();
  if (!p || !id.trim()) { set({ status: "error", error: "Apple Music isn't available here." }); return false; }
  try {
    set({ status: "connecting" });
    const auth = await p.authorize();
    if (auth.status !== "authorized") { set({ status: "error", error: "Apple Music access is off — opening it instead." }); return false; }
    const { available } = await p.isAvailable();
    if (!available) { set({ status: "error", error: "This needs an Apple Music subscription." }); return false; }
    const res = await p.playItem({ id, kind });
    if (!res.playing) { set({ status: "idle", error: undefined }); return false; }
    set({ status: "playing", error: undefined });
    return true;
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : "The music didn't start." });
    return false;
  }
}

/** Search the Apple Music catalogue (songs / albums / playlists). Returns []
 *  when unavailable or access is denied. */
export async function searchAppleCatalog(term: string): Promise<AppleSearchResult[]> {
  const p = plugin();
  if (!p || !term.trim()) return [];
  try {
    const auth = await p.authorize();
    if (auth.status !== "authorized") return [];
    const res = await p.searchCatalog({ term });
    return Array.isArray(res?.results) ? res.results : [];
  } catch {
    return [];
  }
}

/** The currently-playing entry, for the in-app now-playing bar. */
export async function appleNowPlaying(): Promise<{ title: string; subtitle?: string; artworkUrl?: string; playbackTime?: number; isPlaying?: boolean } | null> {
  const p = plugin();
  if (!p) return null;
  try {
    const r = await p.nowPlaying();
    return r && r.title ? r : null;
  } catch {
    return null;
  }
}

/** The listener's OWN Apple Music library playlists (iOS native MusicKit). */
export async function getAppleLibraryPlaylists(): Promise<AppleLibraryItem[]> {
  const p = plugin();
  if (!p) return [];
  try {
    const auth = await p.authorize();
    if (auth.status !== "authorized") return [];
    const res = await p.getLibraryPlaylists();
    return Array.isArray(res?.items) ? res.items : [];
  } catch {
    return [];
  }
}

/** Play a browsed library playlist in-app. False → caller can fall back. */
export async function playAppleLibraryItem(id: string): Promise<boolean> {
  const p = plugin();
  if (!p || !id.trim()) { set({ status: "error", error: "Apple Music isn't available here." }); return false; }
  try {
    set({ status: "connecting" });
    const auth = await p.authorize();
    if (auth.status !== "authorized") { set({ status: "error", error: "Apple Music access is off." }); return false; }
    const res = await p.playLibraryItem({ id });
    if (!res.playing) { set({ status: "idle", error: undefined }); return false; }
    set({ status: "playing", error: undefined });
    return true;
  } catch (e) {
    set({ status: "error", error: e instanceof Error ? e.message : "The music didn't start." });
    return false;
  }
}

export async function appleSkipNext(): Promise<void> {
  try { await plugin()?.skipNext(); set({ status: "playing", error: undefined }); } catch { /* ignore */ }
}
export async function appleSkipPrevious(): Promise<void> {
  try { await plugin()?.skipPrevious(); set({ status: "playing", error: undefined }); } catch { /* ignore */ }
}

export async function pause(): Promise<void> {
  try { await plugin()?.pause(); set({ status: "paused" }); } catch { /* ignore */ }
}
export async function resume(): Promise<void> {
  try { await plugin()?.resume(); set({ status: "playing" }); } catch { /* ignore */ }
}
export async function disconnect(): Promise<void> {
  try { await plugin()?.stop(); } catch { /* ignore */ }
  set({ status: "idle" });
}

/** Same surface as useSpotifyPlayback, so the unified layer treats them alike. */
export function useAppleMusicPlayback() {
  const [s, setS] = useState<State>(state);
  useEffect(() => subscribe(setS), []);

  const connectPlay = useCallback(() => { void connectAndPlay(); }, []);
  const doPause = useCallback(() => { void pause(); }, []);
  const doResume = useCallback(() => { void resume(); }, []);
  const doDisconnect = useCallback(() => { void disconnect(); }, []);

  return {
    available: appleMusicAvailable(),
    status: s.status,
    error: s.error,
    connectPlay,
    authorize: connectPlay, // Apple Music authorizes as part of play (no redirect)
    pause: doPause,
    resume: doResume,
    disconnect: doDisconnect,
  };
}
