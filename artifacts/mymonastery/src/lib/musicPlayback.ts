// One music surface for the Listening practice over both in-app services —
// Apple Music (iOS) and Spotify (iOS + web). The UI talks only to this hook; it
// never has to know which engine is live. Only services that are actually
// available on this device/surface are offered (no lying controls); when none
// is, the practice falls back to bring-your-own-music.

import { useState, useCallback } from "react";
import { useSpotifyPlayback, disconnect as disconnectSpotify } from "@/lib/spotifyPlayer";
import { useAppleMusicPlayback, disconnect as disconnectApple } from "@/lib/appleMusic";
import { spotifyConnected, nativeSpotifyAvailable } from "@/lib/spotify";

export type MusicSourceId = "apple" | "spotify";
const PREF_KEY = "phoebe:music-source";

function savedPref(): MusicSourceId | null {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === "apple" || v === "spotify" ? v : null;
  } catch {
    return null;
  }
}

export function useMusicPlayback() {
  // Both provider hooks are always called (rules of hooks); each reports its own
  // availability. Apple is listed first — most NYU iPhones default to it.
  const apple = useAppleMusicPlayback();
  const spotify = useSpotifyPlayback();

  const sources = [
    { id: "apple" as const, label: "Apple Music", provider: apple },
    { id: "spotify" as const, label: "Spotify", provider: spotify },
  ].filter((s) => s.provider.available);

  const [activeId, setActiveId] = useState<MusicSourceId | null>(savedPref);

  // The effective source: the remembered pick if it's still available, else the
  // first available one (so a one-service device needs no choice).
  const effective = sources.find((s) => s.id === activeId) ?? sources[0] ?? null;

  const setActive = useCallback((id: MusicSourceId) => {
    // Stop whatever the OTHER service was playing, so two never overlap when the
    // listener switches mid-sit. disconnect on an idle provider is a no-op.
    if (id !== "apple") void disconnectApple();
    if (id !== "spotify") void disconnectSpotify();
    try { localStorage.setItem(PREF_KEY, id); } catch { /* private mode */ }
    setActiveId(id);
  }, []);

  const active = effective?.provider ?? null;

  // Spotify on the web must connect an account first (a redirect); surface that
  // so the control can say "Connect Spotify" up front rather than after a tap.
  const needsAuth = effective?.id === "spotify" && !nativeSpotifyAvailable() && !spotifyConnected();

  return {
    anyAvailable: sources.length > 0,
    sources: sources.map((s) => ({ id: s.id, label: s.label })),
    activeId: effective?.id ?? null,
    activeLabel: effective?.label ?? null,
    setActive,
    needsAuth,
    status: active?.status ?? "idle",
    error: active?.error,
    connectPlay: active?.connectPlay ?? (() => {}),
    authorize: active?.authorize ?? (() => {}),
    pause: active?.pause ?? (() => {}),
    resume: active?.resume ?? (() => {}),
    disconnect: active?.disconnect ?? (() => {}),
  };
}
