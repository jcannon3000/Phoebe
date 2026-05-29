import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
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
  // ── Office / non-podcast playback (all optional; podcast defaults) ──
  // The daily-office pages play through this same player so they get the
  // persistent mini-bar + minimize. These tags let one episode behave as
  // an office rather than a podcast without forking the player.
  //
  // Prayer-session surface to log (default "podcast"). The office passes
  // "morning-office-podcast" / "evening-office-podcast".
  sessionSurface?: string;
  // When set, a session >= 180s stamps the local office-completed flag
  // (phoebe:office-completed:<mode>:<date>) so the dashboard lights up.
  creditMode?: "morning" | "evening";
  // Skip the listening-history write — the daily office changes every day
  // and is tracked via prayer-sessions, not the podcast history.
  skipHistory?: boolean;
  // Hide the Recommend (♡) action — a daily office isn't a shareable ep.
  hideRecommend?: boolean;
  // Override the "view show" link target — offices have no /podcasts/show
  // page, so they link back to their own player route.
  showHref?: string;
};

type PlayerCtx = {
  current: PlayingEpisode | null;
  isPlaying: boolean;
  // opts.expand defaults to true (open the full-screen listener). Pass
  // { expand: false } to start playback in the mini-bar only — e.g. the
  // FDD reflection's "Listen" button, which keeps the reflection on screen.
  play: (ep: PlayingEpisode, opts?: { expand?: boolean }) => void;
  playQueue: (eps: PlayingEpisode[]) => void;
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
  const { t } = useTranslation();
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
  // Whether playback was active when the app last went to the background,
  // so the resume handler knows to kick it back on when we return.
  const wasPlayingRef = useRef(false);
  const loggedRef = useRef<Set<string>>(new Set());
  // Queue for listen-list playback. queueRef holds the ordered episode
  // list; queueIndexRef is the index of the currently playing episode.
  // Both are refs (not state) so onEndedEv can read them without a stale
  // closure — the UI reads the list from its own query, not from here.
  const queueRef = useRef<PlayingEpisode[]>([]);
  const queueIndexRef = useRef(-1);
  // Prayer-session accumulator (time actually playing).
  const seg = useRef<{ start: number | null; acc: number; startedAt: Date | null }>({ start: null, acc: 0, startedAt: null });
  // Surface + office-credit mode for the CURRENTLY accumulating session.
  // Set when an episode starts; read by commitSession (which can't close
  // over `current`). Defaults to the podcast surface.
  const sessionMetaRef = useRef<{ surface: string; creditMode?: "morning" | "evening" }>({ surface: "podcast" });

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
    const { surface, creditMode } = sessionMetaRef.current;
    seg.current = { start: null, acc: 0, startedAt: null };
    if (total > 0 && startedAt && user) {
      apiRequest("POST", "/api/prayer-sessions", {
        surface,
        durationSeconds: total,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
      }).catch(() => { /* best-effort */ });
      // Office credit: a session >= 180s counts as having prayed that
      // office — stamp the local flag the dashboard reads so it reflects
      // immediately (users.ts also credits the >=180s row server-side).
      if (creditMode && total >= 180) {
        try {
          const now = new Date();
          const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          localStorage.setItem(`phoebe:office-completed:${creditMode}:${dateKey}`, "1");
        } catch { /* private mode / quota — non-fatal */ }
      }
    }
  }, [closeSeg, user]);

  // Core episode-start logic, shared by user-tap play and queue auto-advance.
  const startEpisode = useCallback((ep: PlayingEpisode) => {
    if (!ep.audioUrl) return;
    setCurrent((prev) => {
      if (prev && prev.showSlug === ep.showSlug && prev.episodeId === ep.episodeId) {
        audioRef.current?.play().catch(() => { /* gesture-gated */ });
        return prev;
      }
      const a = audioRef.current;
      if (a && prev) savePos(prev, a.currentTime);
      commitSession(); // flushes prev's session under prev's surface
      // Switch the session surface/credit to the new episode (commitSession
      // above already used the old meta).
      sessionMetaRef.current = { surface: ep.sessionSurface ?? "podcast", creditMode: ep.creditMode };
      pendingSeekRef.current = loadPos(ep);
      setArtBroken(false);
      return ep;
    });
  }, [commitSession]);

  const play = useCallback((ep: PlayingEpisode, opts?: { expand?: boolean }) => {
    // User-initiated tap: clear any running queue. Open full-screen unless
    // the caller asked to stay in the mini-bar (expand: false).
    queueRef.current = [];
    queueIndexRef.current = -1;
    setExpanded(opts?.expand !== false);
    startEpisode(ep);
  }, [startEpisode]);

  const playQueue = useCallback((eps: PlayingEpisode[]) => {
    if (eps.length === 0) return;
    queueRef.current = eps;
    queueIndexRef.current = 0;
    setExpanded(true);
    startEpisode(eps[0]);
  }, [startEpisode]);

  // Point the audio at the current episode + autoplay when it changes.
  useEffect(() => {
    const a = audioRef.current;
    if (!a || !current) return;
    a.src = current.audioUrl;
    a.playbackRate = rate;
    a.load();
    a.play().catch(() => { /* iOS may gate autoplay; the bar's play button covers it */ });

    // Listening history — once per episode per session. Offices opt out
    // (skipHistory): they change daily and are tracked via prayer-sessions.
    const key = `${current.showSlug}:${current.episodeId}`;
    if (user && !current.skipHistory && !loggedRef.current.has(key)) {
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

  // ── One-time import of partially-listened episodes into the listen list ──
  // On first load after the user signs in, scan localStorage for any saved
  // resume positions (phoebe:podcast:pos:*). Cross-reference with the full
  // listen history (which stores episode snapshots) and POST any partial
  // episodes to the listen list so they appear in the queue automatically.
  // A localStorage flag prevents re-running on subsequent loads.
  useEffect(() => {
    if (!user) return;
    const importFlag = "phoebe:partial-import:v1";
    try { if (localStorage.getItem(importFlag)) return; } catch { return; }

    const prefix = "phoebe:podcast:pos:";
    const partials: { showSlug: string; episodeId: string }[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k?.startsWith(prefix)) continue;
        const pos = Number(localStorage.getItem(k));
        if (pos < 30) continue; // not meaningfully started
        const rest = k.slice(prefix.length);
        const firstColon = rest.indexOf(":");
        if (firstColon < 0) continue;
        partials.push({ showSlug: rest.slice(0, firstColon), episodeId: rest.slice(firstColon + 1) });
      }
    } catch { /* private mode */ }

    if (partials.length === 0) {
      try { localStorage.setItem(importFlag, "done"); } catch { /* ignore */ }
      return;
    }

    type ListenRow = {
      showSlug: string; episodeId: string;
      episodeTitle: string | null; episodeAudioUrl: string | null;
      episodeImageUrl: string | null; durationSeconds: number | null;
      publishedAt: string | null; showTitle: string | null; showArtwork: string | null;
    };
    apiRequest("GET", "/api/podcasts/listens")
      .then((data: { listens: ListenRow[] }) => {
        const map = new Map(data.listens.map((l) => [`${l.showSlug}:${l.episodeId}`, l]));
        const toAdd = partials.map((p) => map.get(`${p.showSlug}:${p.episodeId}`)).filter(Boolean) as ListenRow[];
        return Promise.all(
          toAdd.map((ep) =>
            apiRequest("POST", "/api/podcasts/listen-list", {
              showSlug: ep.showSlug,
              episodeId: ep.episodeId,
              episodeTitle: ep.episodeTitle ?? undefined,
              episodeAudioUrl: ep.episodeAudioUrl ?? undefined,
              episodeImageUrl: ep.episodeImageUrl ?? undefined,
              durationSeconds: ep.durationSeconds ?? undefined,
              publishedAt: ep.publishedAt ?? undefined,
              showTitle: ep.showTitle ?? undefined,
              showArtwork: ep.showArtwork ?? undefined,
            }).catch(() => { /* best-effort, skip duplicates */ })
          )
        );
      })
      .then(() => {
        try { localStorage.setItem(importFlag, "done"); } catch { /* ignore */ }
        queryClient.invalidateQueries({ queryKey: ["/api/podcasts/listen-list"] });
        queryClient.invalidateQueries({ queryKey: ["/api/podcasts/me"] });
      })
      .catch(() => { /* don't set flag — will retry next session */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Save position on background; re-sync + resume on return.
  //
  // iOS suspends the WebView's <audio> after the app sits in the background
  // (or under memory pressure / an audio interruption), and the element's
  // play/pause events don't reliably fire across that gap. So on return the
  // bar could show "playing" while it's actually silent, with nothing
  // resuming it — the "came back and it won't play" bug. On hide we remember
  // whether we were playing; on show we reconcile isPlaying with the
  // element's real state and, if we were playing, kick it back on (reloading
  // the source first if WKWebView evicted the buffer, then seeking to the
  // saved position).
  useEffect(() => {
    // Reconcile playback when the app returns to the foreground. If we
    // intended to be playing (wasPlayingRef, which now tracks the user's
    // play/pause intent — see onPlayEv / toggle) but the element is paused
    // — iOS silently pauses a suspended WebView's audio — kick it back on,
    // reloading + reseeking first when WKWebView evicted the decoded buffer
    // (readyState < HAVE_CURRENT_DATA). Throttled so the several foreground
    // events below don't stack reload/play calls.
    let lastResume = 0;
    const resumeForeground = () => {
      const a = audioRef.current;
      if (!a) return;
      const now = Date.now();
      if (now - lastResume < 800) return;
      lastResume = now;
      if (wasPlayingRef.current && a.paused) {
        const resumeAt = current ? loadPos(current) : a.currentTime;
        if (a.readyState < 2) {
          pendingSeekRef.current = resumeAt;
          a.load();
        }
        a.play()
          .then(() => { setIsPlaying(true); openSeg(); })
          .catch(() => { setIsPlaying(false); }); // iOS gated it — a tap will start it
      } else {
        // Element kept its state — just make the UI match reality.
        setIsPlaying(!a.paused);
        if (!a.paused) openSeg();
      }
    };
    const onVis = () => {
      const a = audioRef.current;
      if (!a) return;
      if (document.visibilityState === "hidden") {
        if (current) savePos(current, a.currentTime);
        closeSeg();
        return;
      }
      resumeForeground();
    };
    const onHide = () => {
      const a = audioRef.current;
      if (a && current) savePos(current, a.currentTime);
      commitSession();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    // WKWebView delivers visibilitychange / focus / pageshow INCONSISTENTLY
    // on native resume (sometimes none of them fire) — `phoebe:appactive`,
    // which the Capacitor shell dispatches from appStateChange→isActive, is
    // the reliable "back in foreground" signal (see App.tsx / amenFeedback).
    // Listen to all of them so audio resumes no matter which the OS sends.
    window.addEventListener("phoebe:appactive", resumeForeground);
    window.addEventListener("pageshow", resumeForeground);
    window.addEventListener("focus", resumeForeground);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("phoebe:appactive", resumeForeground);
      window.removeEventListener("pageshow", resumeForeground);
      window.removeEventListener("focus", resumeForeground);
    };
  }, [current, closeSeg, commitSession, openSeg]);

  // Lock-screen / Control Center controls (MediaSession API). Publishes
  // now-playing metadata + routes remote play/pause/seek back to the same
  // <audio> element, and keeps iOS's media controls in sync with what's
  // actually playing — which also helps the OS keep our audio session
  // associated across backgrounding.
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    if (!current) {
      ms.metadata = null;
      ms.playbackState = "none";
      return;
    }
    const art = current.imageUrl || current.showArtwork;
    ms.metadata = new MediaMetadata({
      title: current.title ?? current.showTitle ?? "Phoebe",
      artist: current.showTitle ?? "",
      album: "Phoebe",
      artwork: art ? [{ src: art, sizes: "512x512", type: "image/jpeg" }] : [],
    });
    ms.setActionHandler("play", () => { wasPlayingRef.current = true; audioRef.current?.play().catch(() => { /* ignore */ }); });
    ms.setActionHandler("pause", () => { wasPlayingRef.current = false; audioRef.current?.pause(); });
    ms.setActionHandler("seekbackward", () => skip(-15));
    ms.setActionHandler("seekforward", () => skip(30));
    ms.setActionHandler("seekto", (d) => { if (d.seekTime != null) seekTo(d.seekTime); });
    return () => {
      for (const act of ["play", "pause", "seekbackward", "seekforward", "seekto"] as const) {
        try { ms.setActionHandler(act, null); } catch { /* unsupported action */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  // ── <audio> event handlers ──────────────────────────────────────────────
  // MediaSession sync helpers (lock-screen scrubber + play/pause state).
  // No-ops where the API or a valid duration isn't available.
  const syncMediaPlaybackState = () => {
    const a = audioRef.current; const ms = navigator.mediaSession;
    if (a && ms) ms.playbackState = a.paused ? "paused" : "playing";
  };
  const syncMediaPosition = () => {
    const a = audioRef.current; const ms = navigator.mediaSession;
    if (!a || !ms?.setPositionState || !isFinite(a.duration) || a.duration <= 0) return;
    try {
      ms.setPositionState({ duration: a.duration, playbackRate: a.playbackRate || 1, position: Math.min(a.currentTime, a.duration) });
    } catch { /* invalid position state — ignore */ }
  };

  const onLoadedMeta = () => {
    const a = audioRef.current; if (!a) return;
    setDuration(a.duration || 0);
    const target = pendingSeekRef.current;
    pendingSeekRef.current = null;
    if (target != null && target > 5 && (!a.duration || target < a.duration - 10)) {
      try { a.currentTime = target; } catch { /* ignore */ }
    }
    syncMediaPosition();
  };
  const onTimeUpdate = () => {
    const a = audioRef.current; if (!a || !current) return;
    setCurrentTime(a.currentTime);
    syncMediaPosition();
    const now = Date.now();
    if (now - lastSaveRef.current > 5000) { lastSaveRef.current = now; savePos(current, a.currentTime); }
  };
  // wasPlayingRef = the user's INTENT to be playing. Set it true whenever
  // audio actually starts; do NOT clear it in onPauseEv (iOS pauses
  // suspended audio on background, and that must not read as "user stopped"
  // — otherwise resume on return is skipped). It's cleared only on explicit
  // user stops: toggle-to-pause, lock-screen pause, ended, and close.
  const onPlayEv = () => { wasPlayingRef.current = true; setIsPlaying(true); openSeg(); syncMediaPlaybackState(); };
  const onPauseEv = () => {
    setIsPlaying(false); closeSeg(); syncMediaPlaybackState();
    const a = audioRef.current; if (a && current) savePos(current, a.currentTime);
  };
  const onEndedEv = () => {
    wasPlayingRef.current = false;
    setIsPlaying(false); closeSeg(); syncMediaPlaybackState();
    if (current) clearPos(current);
    commitSession();
    // Auto-advance through the listen-list queue if one is active.
    const nextIdx = queueIndexRef.current + 1;
    if (nextIdx > 0 && nextIdx < queueRef.current.length) {
      queueIndexRef.current = nextIdx;
      const next = queueRef.current[nextIdx];
      if (next) setTimeout(() => startEpisode(next), 400);
    }
  };

  const toggle = useCallback(() => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) {
      wasPlayingRef.current = true;
      // If WKWebView evicted the decoded buffer while suspended, readyState
      // drops and a bare play() can stall — reload to the saved spot first
      // so a manual tap after returning to the app always recovers.
      if (a.readyState < 2 && current) { pendingSeekRef.current = loadPos(current); a.load(); }
      a.play().catch(() => { /* ignore */ });
    } else {
      wasPlayingRef.current = false;
      a.pause();
    }
  }, [current]);
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
    wasPlayingRef.current = false;
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
    <Ctx.Provider value={{ current, isPlaying, play, playQueue, toggle, isCurrent }}>
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
            aria-label={t("podcasts.a11y_seek")}
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
                  {current.title ?? t("podcasts.now_playing_fallback")}
                </p>
                <p style={{ fontSize: 10.5, color: "rgba(143,175,150,0.8)", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "44vw" }}>
                  {fmtClock(currentTime)}{duration > 0 ? ` / ${fmtClock(duration)}` : ""}{current.showTitle ? ` · ${current.showTitle}` : ""}
                </p>
              </div>
            </button>

            {/* Transport */}
            <button type="button" onClick={() => skip(-15)} aria-label={t("podcasts.a11y_back15")}
              style={{ background: "none", border: "none", color: "rgba(168,197,160,0.95)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "4px 2px", flexShrink: 0 }}>
              ⟲15
            </button>
            <button type="button" onClick={toggle} aria-label={isPlaying ? t("podcasts.a11y_pause") : t("podcasts.a11y_play")}
              style={{ width: 38, height: 38, borderRadius: "50%", background: "#A8C5A0", color: "#0A1A0F", border: "none", fontSize: 16, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button type="button" onClick={() => skip(30)} aria-label={t("podcasts.a11y_forward30")}
              style={{ background: "none", border: "none", color: "rgba(168,197,160,0.95)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "4px 2px", flexShrink: 0 }}>
              30⟳
            </button>
            <button type="button" onClick={cycleRate} aria-label={t("podcasts.a11y_speed")}
              style={{ background: "rgba(46,107,64,0.25)", border: "1px solid rgba(46,107,64,0.4)", color: "#C8D4C0", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 8px", cursor: "pointer", flexShrink: 0 }}>
              {rate}×
            </button>
            <button type="button" onClick={closePlayer} aria-label={t("podcasts.a11y_close")}
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
            <button type="button" onClick={() => setExpanded(false)} aria-label={t("podcasts.a11y_minimize")}
              style={{ background: "none", border: "none", color: "rgba(168,197,160,0.95)", fontSize: 28, lineHeight: 1, cursor: "pointer", padding: 4 }}>
              ⌄
            </button>
            <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em", color: "rgba(143,175,150,0.75)" }}>
              {t("podcasts.now_playing")}
            </span>
            <button type="button" onClick={closePlayer} aria-label={t("podcasts.a11y_close")}
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
              {current.title ?? t("podcasts.now_playing_fallback")}
            </h2>
            <button type="button"
              onClick={() => { setExpanded(false); setLocation(current.showHref ?? `/podcasts/show/${current.showSlug}`); }}
              style={{ background: "none", border: "none", color: "#8FAF96", fontFamily: FONT, fontSize: 13.5, margin: "8px 0 0", cursor: "pointer", padding: 0 }}>
              {current.showTitle ?? t("podcasts.view_show")}
            </button>
            {current.description && (
              <p style={{ fontSize: 13, color: "rgba(200,212,192,0.85)", lineHeight: 1.55, margin: "18px 0 0", maxWidth: 460, textAlign: "left", whiteSpace: "pre-line" }}>
                {current.description}
              </p>
            )}
          </div>

          {/* Controls pinned to the bottom */}
          <div style={{ flexShrink: 0, padding: "8px 26px 0" }}>
            <div onClick={onTrackClick} role="slider" aria-label={t("podcasts.a11y_seek")} aria-valuenow={Math.round(pct)}
              style={{ height: 6, borderRadius: 999, background: "rgba(143,175,150,0.18)", cursor: "pointer", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "#A8C5A0" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(143,175,150,0.8)", margin: "6px 2px 0" }}>
              <span>{fmtClock(currentTime)}</span>
              <span>{duration > 0 ? fmtClock(duration) : "--:--"}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 30, margin: "14px 0 0" }}>
              <button type="button" onClick={() => skip(-15)} aria-label={t("podcasts.a11y_back15")}
                style={{ background: "none", border: "none", color: "#C8D4C0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>⟲15</button>
              <button type="button" onClick={toggle} aria-label={isPlaying ? t("podcasts.a11y_pause") : t("podcasts.a11y_play")}
                style={{ width: 64, height: 64, borderRadius: "50%", background: "#A8C5A0", color: "#0A1A0F", border: "none", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button type="button" onClick={() => skip(30)} aria-label={t("podcasts.a11y_forward30")}
                style={{ background: "none", border: "none", color: "#C8D4C0", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>30⟳</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "16px 0 0" }}>
              <button type="button" onClick={cycleRate} aria-label={t("podcasts.a11y_speed")}
                style={{ background: "rgba(46,107,64,0.25)", border: "1px solid rgba(46,107,64,0.4)", color: "#C8D4C0", fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}>
                {rate}×
              </button>
              {!current.hideRecommend && (
                <button type="button" onClick={toggleRecommend}
                  className="transition-opacity hover:opacity-90"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "8px 16px",
                    fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
                    background: isRecommended ? "rgba(212,160,70,0.18)" : "rgba(46,107,64,0.14)",
                    color: isRecommended ? "#F0DCA8" : "rgba(168,197,160,0.95)",
                    border: `1px solid ${isRecommended ? "rgba(212,160,70,0.45)" : "rgba(46,107,64,0.3)"}`,
                  }}>
                  {isRecommended ? `♥ ${t("podcasts.recommended")}` : `♡ ${t("podcasts.recommend")}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
