import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { AnimatedBackground } from "@/components/AnimatedBackground";

// ── Global podcast player ────────────────────────────────────────────────
//
// A single <audio> element + mini-player bar mounted ABOVE the router, so
// playback survives navigation — you can browse the library (or the rest
// of Phoebe) while an episode keeps playing. Pages call usePodcastPlayer()
// .play(episode) to start something.
//
// Resume: playback position is saved per episode in localStorage
// (throttled + on pause/close/background) and restored on play, so long
// CAC / Finley episodes pick up where you left off.
//
// Engagement side-effects live here (not per-page) so they fire no matter
// which screen launched playback:
//   • POST /api/podcasts/listens once per episode  → listening history
//   • POST /api/prayer-sessions (surface "podcast") → time-listening,
//     accumulated while actually playing, flushed on episode-change /
//     close / background.

export type PlayingEpisode = {
  showSlug: string;
  episodeId: string;
  title: string | null;
  audioUrl: string;
  imageUrl?: string | null;
  showTitle?: string | null;
  showArtwork?: string | null;
  durationSeconds?: number | null;
  publishedAt?: string | null;
  description?: string | null;
};

type PlayerCtx = {
  current: PlayingEpisode | null;
  isPlaying: boolean;
  play: (ep: PlayingEpisode) => void;
  toggle: () => void;
  isCurrent: (showSlug: string, episodeId: string) => boolean;
};

const Ctx = createContext<PlayerCtx | null>(null);

export function usePodcastPlayer(): PlayerCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePodcastPlayer must be used within PodcastPlayerProvider");
  return c;
}

const FONT = "'Space Grotesk', system-ui, sans-serif";
const RATES = [1, 1.25, 1.5, 2];

const posKey = (e: { showSlug: string; episodeId: string }) => `phoebe:podcast:pos:${e.showSlug}:${e.episodeId}`;
function loadPos(e: { showSlug: string; episodeId: string }): number {
  try { return Number(localStorage.getItem(posKey(e))) || 0; } catch { return 0; }
}
function savePos(e: { showSlug: string; episodeId: string }, t: number): void {
  try { if (t > 5) localStorage.setItem(posKey(e), String(Math.floor(t))); } catch { /* ignore */ }
}
function clearPos(e: { showSlug: string; episodeId: string }): void {
  try { localStorage.removeItem(posKey(e)); } catch { /* ignore */ }
}
function fmtClock(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60); const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function PodcastPlayerProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [current, setCurrent] = useState<PlayingEpisode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [artBroken, setArtBroken] = useState(false);
  // Full-screen "now playing" listener (vs. the bottom mini-bar).
  const [expanded, setExpanded] = useState(false);

  const pendingSeekRef = useRef<number | null>(null);
  const lastSaveRef = useRef(0);
  const loggedRef = useRef<Set<string>>(new Set());
  // Prayer-session accumulator (time actually playing).
  const seg = useRef<{ start: number | null; acc: number; startedAt: Date | null }>({ start: null, acc: 0, startedAt: null });

  const closeSeg = useCallback(() => {
    if (seg.current.start !== null) {
      seg.current.acc += (Date.now() - seg.current.start) / 1000;
      seg.current.start = null;
    }
  }, []);
  const openSeg = useCallback(() => {
    if (!seg.current.startedAt) seg.current.startedAt = new Date();
    if (seg.current.start === null) seg.current.start = Date.now();
  }, []);
  const commitSession = useCallback(() => {
    closeSeg();
    const total = Math.round(seg.current.acc);
    const startedAt = seg.current.startedAt;
    seg.current = { start: null, acc: 0, startedAt: null };
    if (total > 0 && startedAt && user) {
      apiRequest("POST", "/api/prayer-sessions", {
        surface: "podcast",
        durationSeconds: total,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
      }).catch(() => { /* best-effort */ });
    }
  }, [closeSeg, user]);

  const play = useCallback((ep: PlayingEpisode) => {
    if (!ep.audioUrl) return;
    setExpanded(true); // tapping an episode opens the full-screen listener
    setCurrent((prev) => {
      if (prev && prev.showSlug === ep.showSlug && prev.episodeId === ep.episodeId) {
        audioRef.current?.play().catch(() => { /* gesture-gated */ });
        return prev;
      }
      // Switching episodes — save prior position + flush its session.
      const a = audioRef.current;
      if (a && prev) savePos(prev, a.currentTime);
      commitSession();
      pendingSeekRef.current = loadPos(ep);
      setArtBroken(false);
      return ep;
    });
  }, [commitSession]);

  // Point the audio at the current episode + autoplay when it changes.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    a.src = current.audioUrl;
    a.playbackRate = rate;
    a.load();
    a.play().catch(() => { /* iOS may gate autoplay; the bar's play button covers it */ });

    // Listening history — once per episode per session.
    const key = `${current.showSlug}:${current.episodeId}`;
    if (user && !loggedRef.current.has(key)) {
      loggedRef.current.add(key);
      apiRequest("POST", "/api/podcasts/listens", {
        showSlug: current.showSlug,
        episodeId: current.episodeId,
        episodeTitle: current.title ?? undefined,
        episodeAudioUrl: current.audioUrl,
        episodeImageUrl: current.imageUrl ?? current.showArtwork ?? undefined,
        durationSeconds: current.durationSeconds ?? undefined,
        publishedAt: current.publishedAt ?? undefined,
        showTitle: current.showTitle ?? undefined,
        showArtwork: current.showArtwork ?? undefined,
      })
        .then(() => queryClient.invalidateQueries({ queryKey: ["/api/podcasts/me"] }))
        .catch(() => { /* best-effort */ });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.showSlug, current?.episodeId]);

  // Save position + flush session on background / unload.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        const a = audioRef.current;
        if (a && current) savePos(current, a.currentTime);
        closeSeg();
      }
    };
    const onHide = () => {
      const a = audioRef.current;
      if (a && current) savePos(current, a.currentTime);
      commitSession();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
    };
  }, [current, closeSeg, commitSession]);

  // ── <audio> event handlers ──────────────────────────────────────────────
  const onLoadedMeta = () => {
    const a = audioRef.current; if (!a) return;
    setDuration(a.duration || 0);
    const target = pendingSeekRef.current;
    pendingSeekRef.current = null;
    if (target != null && target > 5 && (!a.duration || target < a.duration - 10)) {
      try { a.currentTime = target; } catch { /* ignore */ }
    }
  };
  const onTimeUpdate = () => {
    const a = audioRef.current; if (!a || !current) return;
    setCurrentTime(a.currentTime);
    const now = Date.now();
    if (now - lastSaveRef.current > 5000) { lastSaveRef.current = now; savePos(current, a.currentTime); }
  };
  const onPlayEv = () => { setIsPlaying(true); openSeg(); };
  const onPauseEv = () => {
    setIsPlaying(false); closeSeg();
    const a = audioRef.current; if (a && current) savePos(current, a.currentTime);
  };
  const onEndedEv = () => {
    setIsPlaying(false); closeSeg();
    if (current) clearPos(current);
    commitSession();
  };

  const toggle = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) a.play().catch(() => { /* ignore */ }); else a.pause();
  }, []);
  const seekTo = (t: number) => { const a = audioRef.current; if (a) { a.currentTime = t; setCurrentTime(t); } };
  const skip = (delta: number) => {
    const a = audioRef.current; if (!a) return;
    const max = a.duration && isFinite(a.duration) ? a.duration : a.currentTime + delta;
    seekTo(Math.max(0, Math.min(max, a.currentTime + delta)));
  };
  const cycleRate = () => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    const a = audioRef.current; if (a) a.playbackRate = next;
  };
  const closePlayer = () => {
    const a = audioRef.current;
    if (a && current) savePos(current, a.currentTime);
    commitSession();
    if (a) a.pause();
    setCurrent(null); setIsPlaying(false); setCurrentTime(0); setDuration(0); setExpanded(false);
  };

  const isCurrent = useCallback(
    (slug: string, id: string) => !!current && current.showSlug === slug && current.episodeId === id,
    [current],
  );

  // ── Recommend (♡) for the now-playing episode ───────────────────────────
  // Shares the episode to the community feed. Lives on the player (the
  // full-screen listener) rather than the show list. Only fetches the
  // engagement state while something is playing.
  const { data: engagement } = useQuery<{ recommendedKeys: string[] }>({
    queryKey: ["/api/podcasts/me"],
    queryFn: () => apiRequest("GET", "/api/podcasts/me"),
    enabled: !!user && !!current,
    staleTime: 60_000,
  });
  const isRecommended =
    !!current && new Set(engagement?.recommendedKeys ?? []).has(`${current.showSlug}:${current.episodeId}`);
  const recommendMut = useMutation({
    mutationFn: (rec: boolean) => {
      const c = current!;
      return rec
        ? apiRequest("POST", "/api/podcasts/recommendations", {
            showSlug: c.showSlug, episodeId: c.episodeId,
            episodeTitle: c.title ?? undefined, episodeAudioUrl: c.audioUrl,
            episodeImageUrl: c.imageUrl ?? c.showArtwork ?? undefined,
            durationSeconds: c.durationSeconds ?? undefined,
            publishedAt: c.publishedAt ?? undefined,
            showTitle: c.showTitle ?? undefined, showArtwork: c.showArtwork ?? undefined,
          })
        : apiRequest("DELETE", "/api/podcasts/recommendations", { showSlug: c.showSlug, episodeId: c.episodeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/podcasts/recommendations"] });
    },
  });
  const toggleRecommend = () => { if (current) recommendMut.mutate(!isRecommended); };

  const onTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current; if (!a || !a.duration || !isFinite(a.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(frac * a.duration);
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const art = (!artBroken && (current?.imageUrl || current?.showArtwork)) || null;

  return (
    <Ctx.Provider value={{ current, isPlaying, play, toggle, isCurrent }}>
      {children}

      {/* One persistent audio element for the whole app. */}
      <audio
        ref={audioRef}
        onLoadedMetadata={onLoadedMeta}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlayEv}
        onPause={onPauseEv}
        onEnded={onEndedEv}
        preload="metadata"
      />

      {current && (
        <div
          style={{
            position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
            background: "#0A1A0F", borderTop: "1px solid rgba(168,197,160,0.18)",
            paddingBottom: "env(safe-area-inset-bottom)", fontFamily: FONT,
            boxShadow: "0 -6px 22px rgba(0,0,0,0.35)",
          }}
        >
          {/* Tappable progress track. */}
          <div
            onClick={onTrackClick}
            style={{ height: 5, background: "rgba(143,175,150,0.15)", cursor: "pointer" }}
            role="slider"
            aria-label="Seek"
            aria-valuenow={Math.round(pct)}
          >
            <div style={{ width: `${pct}%`, height: "100%", background: "#A8C5A0" }} />
          </div>

          <div className="w-full max-w-2xl mx-auto" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px" }}>
            {/* Artwork + title → tap to expand the full-screen listener. */}
            <button
              type="button"
              onClick={() => setExpanded(true)}
              style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, cursor: "pointer", minWidth: 0, flex: 1 }}
            >
              {art ? (
                <img src={art} alt="" onError={() => setArtBroken(true)}
                  style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "rgba(143,175,150,0.12)" }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: "rgba(46,107,64,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎧</div>
              )}
              <div style={{ minWidth: 0, textAlign: "left" }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: "#F0EDE6", margin: 0, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "44vw" }}>
                  {current.title ?? "Now playing"}
                </p>
                <p style={{ fontSize: 10.5, color: "rgba(143,175,150,0.8)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "44vw" }}>
                  {fmtClock(currentTime)}{duration > 0 ? ` / ${fmtClock(duration)}` : ""}{current.showTitle ? ` · ${current.showTitle}` : ""}
                </p>
              </div>
            </button>

            {/* Transport */}
            <button type="button" onClick={() => skip(-15)} aria-label="Back 15 seconds"
              style={{ background: "none", border: "none", color: "rgba(168,197,160,0.95)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "4px 2px", flexShrink: 0 }}>
              ⟲15
            </button>
            <button type="button" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"}
              style={{ width: 38, height: 38, borderRadius: "50%", background: "#A8C5A0", color: "#0A1A0F", border: "none", fontSize: 16, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button type="button" onClick={() => skip(30)} aria-label="Forward 30 seconds"
              style={{ background: "none", border: "none", color: "rgba(168,197,160,0.95)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "4px 2px", flexShrink: 0 }}>
              30⟳
            </button>
            <button type="button" onClick={cycleRate} aria-label="Playback speed"
              style={{ background: "rgba(46,107,64,0.25)", border: "1px solid rgba(46,107,64,0.4)", color: "#C8D4C0", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 8px", cursor: "pointer", flexShrink: 0 }}>
              {rate}×
            </button>
            <button type="button" onClick={closePlayer} aria-label="Close player"
              style={{ background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 18, cursor: "pointer", padding: "0 2px", flexShrink: 0 }}>
              ✕
            </button>
          </div>
        </div>
      )}
      {/* Full-screen "now playing" listener — opened by starting an
          episode or tapping the mini-bar. Carries the Recommend action
          (the show list no longer does). Drives the same <audio> as the
          mini-bar, so collapsing keeps playback going. */}
      {current && expanded && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 70, fontFamily: FONT, color: "#F0EDE6",
            background: "#0C1F12",
            display: "flex", flexDirection: "column",
            paddingTop: "max(0.75rem, env(safe-area-inset-top))",
            paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          }}
        >
          {/* Drifting gradient backdrop — same animation as the home /
              office slides, behind the now-playing content. */}
          <AnimatedBackground base="#0C1F12" variant="pronounced" />
          {/* Top bar: minimize / label / close */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 16px 0", flexShrink: 0 }}>
            <button type="button" onClick={() => setExpanded(false)} aria-label="Minimize player"
              style={{ background: "none", border: "none", color: "rgba(168,197,160,0.95)", fontSize: 28, lineHeight: 1, cursor: "pointer", padding: 4 }}>
              ⌄
            </button>
            <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(143,175,150,0.75)" }}>
              Now Playing
            </span>
            <button type="button" onClick={closePlayer} aria-label="Close player"
              style={{ background: "none", border: "none", color: "rgba(143,175,150,0.7)", fontSize: 20, lineHeight: 1, cursor: "pointer", padding: 4 }}>
              ✕
            </button>
          </div>

          {/* Center: cover art + title + show + description (scrolls if long) */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 26px 8px", textAlign: "center" }}>
            {art ? (
              <img src={art} alt="" onError={() => setArtBroken(true)}
                style={{ width: "min(64vw, 288px)", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 22, background: "rgba(143,175,150,0.12)", boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }} />
            ) : (
              <div style={{ width: "min(64vw, 288px)", aspectRatio: "1 / 1", borderRadius: 22, background: "rgba(46,107,64,0.22)", border: "1px solid rgba(46,107,64,0.35)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72 }} aria-hidden>🎧</div>
            )}
            <h2 style={{ fontSize: 21, fontWeight: 800, margin: "24px 0 0", lineHeight: 1.2, maxWidth: 460 }}>
              {current.title ?? "Now playing"}
            </h2>
            <button type="button"
              onClick={() => { setExpanded(false); setLocation(`/podcasts/show/${current.showSlug}`); }}
              style={{ background: "none", border: "none", color: "#8FAF96", fontFamily: FONT, fontSize: 13.5, margin: "8px 0 0", cursor: "pointer", padding: 0 }}>
              {current.showTitle ?? "View show"}
            </button>
            {current.description && (
              <p style={{ fontSize: 13, color: "rgba(200,212,192,0.85)", lineHeight: 1.55, margin: "18px 0 0", maxWidth: 460, textAlign: "left", whiteSpace: "pre-line" }}>
                {current.description}
              </p>
            )}
          </div>

          {/* Controls pinned to the bottom */}
          <div style={{ flexShrink: 0, padding: "8px 26px 0" }}>
            <div onClick={onTrackClick} role="slider" aria-label="Seek" aria-valuenow={Math.round(pct)}
              style={{ height: 6, borderRadius: 999, background: "rgba(143,175,150,0.18)", cursor: "pointer", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#A8C5A0" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(143,175,150,0.8)", margin: "6px 2px 0" }}>
              <span>{fmtClock(currentTime)}</span>
              <span>{duration > 0 ? fmtClock(duration) : "--:--"}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 30, margin: "14px 0 0" }}>
              <button type="button" onClick={() => skip(-15)} aria-label="Back 15 seconds"
                style={{ background: "none", border: "none", color: "#C8D4C0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>⟲15</button>
              <button type="button" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"}
                style={{ width: 64, height: 64, borderRadius: "50%", background: "#A8C5A0", color: "#0A1A0F", border: "none", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button type="button" onClick={() => skip(30)} aria-label="Forward 30 seconds"
                style={{ background: "none", border: "none", color: "#C8D4C0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>30⟳</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 0" }}>
              <button type="button" onClick={cycleRate} aria-label="Playback speed"
                style={{ background: "rgba(46,107,64,0.25)", border: "1px solid rgba(46,107,64,0.4)", color: "#C8D4C0", fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>
                {rate}×
              </button>
              <button type="button" onClick={toggleRecommend}
                className="transition-opacity hover:opacity-90"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "8px 16px",
                  fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                  background: isRecommended ? "rgba(212,160,70,0.18)" : "rgba(46,107,64,0.14)",
                  color: isRecommended ? "#F0DCA8" : "rgba(168,197,160,0.95)",
                  border: `1px solid ${isRecommended ? "rgba(212,160,70,0.45)" : "rgba(46,107,64,0.3)"}`,
                }}>
                {isRecommended ? "♥ Recommended" : "♡ Recommend"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
