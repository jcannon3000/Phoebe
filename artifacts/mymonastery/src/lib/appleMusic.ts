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

interface AppleMusicPlugin {
  authorize(): Promise<{ status: string }>;
  isAvailable(): Promise<{ available: boolean }>;
  play(opts: { playlistId: string; shuffle: boolean }): Promise<{ playing: boolean; reason?: string }>;
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
