// ─── The YouTube player, shared ──────────────────────────────────────────────
//
// Lifted out of CoursePage (where it was LessonPlayer) so the cathedral offices
// and the video courses show video the SAME way — one 16:9 frame, our border,
// our fullscreen button — instead of each page inventing its own (owner,
// 2026-09-18: "embed YouTube videos in our own page … just like we did with the
// centering prayer courses").
//
// It creates ONE YT.Player and swaps videos with cue/load, so moving between
// lessons doesn't tear down and rebuild the iframe (which flickers). The
// IFrame API gives us what a bare <iframe> can't: we know when a video ends
// (offer the next one), when it is playing (mark the course started, count
// watch time) and when it stops.
//
// It only works where YouTube will embed at all — see lib/videoEmbed.ts. Every
// caller checks canEmbedVideoHere() first; this component assumes the answer
// was yes.

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { clearVideoPosition, readVideoPosition, saveVideoPosition } from "@/lib/videoPositions";

const BORDER = "rgba(46,107,64,0.38)";
const TEXT = "#F0EDE6";

// ─── YouTube IFrame API loader (singleton) ───────────────────────────────────

let ytApiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try { prev?.(); } catch { /* ignore other consumers */ }
      resolve(w.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

// ─── In-app player ───────────────────────────────────────────────────────────
// Creates a single YT.Player and swaps videos with cue/load so navigating
// between lessons doesn't tear down and rebuild the iframe (which flickers).

export function YouTubePlayer({
  videoId,
  autoplay,
  onEnded,
  onPlaying,
  onPaused,
  onPlayedSeconds,
  frame = "card",
}: {
  videoId: string;
  autoplay: boolean;
  /**
   * "card" is the bordered, rounded 16:9 box every page used. "bleed" drops
   * the border and the corners so the video can run edge to edge (owner,
   * 2026-09-19, of a course lesson: "Can the video be full width and not
   * rounded courners"). The CALLER gives it the width; this only stops the
   * frame fighting it. The cathedral pages keep "card".
   */
  frame?: "card" | "bleed";
  /** Fired once per video when it plays to the end. */
  onEnded: () => void;
  /** Every transition into PLAYING — a course marks itself started, a
   *  cathedral page opens a watch-time span. */
  onPlaying?: () => void;
  /** Every transition out of PLAYING (pause, buffer-stall, end). The cathedral
   *  pages close their watch-time span on it; courses don't pass it. */
  onPaused?: () => void;
  /**
   * SECONDS OF THIS VIDEO ACTUALLY PLAYED, about once a second while it plays
   * — not seconds on the page. A course uses it for "started" (owner,
   * 2026-09-19: "once I've started 30 seconds, act as if I've started the
   * course"), which is why a paused video must not count. Resets per video.
   *
   * It is a SEPARATE count from the watch-time spans the cathedral pages keep
   * with onPlaying/onPaused, and resuming does not backdate it: it measures
   * playing from the moment this player took the video, never the position it
   * started at, so nothing here can credit time nobody watched.
   */
  onPlayedSeconds?: (secondsPlayed: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const readyRef = useRef(false);
  const endedRef = useRef(false);

  const desiredRef = useRef(videoId);
  const autoplayRef = useRef(autoplay);
  const onEndedRef = useRef(onEnded);
  const onPlayingRef = useRef(onPlaying);
  const onPausedRef = useRef(onPaused);
  const onPlayedSecondsRef = useRef(onPlayedSeconds);
  /** Set once keepPlace exists — the player's own handlers are built before it. */
  const keepPlaceRef = useRef<(() => void) | null>(null);
  onPlayedSecondsRef.current = onPlayedSeconds;
  /** Seconds of the CURRENT video actually played in this sitting. */
  const playedRef = useRef(0);
  /** The video the ticker is counting and saving for. */
  const tickingIdRef = useRef(videoId);
  desiredRef.current = videoId;
  autoplayRef.current = autoplay;
  onEndedRef.current = onEnded;
  onPlayingRef.current = onPlaying;
  onPausedRef.current = onPaused;

  // Create the player once.
  useEffect(() => {
    let cancelled = false;
    const initial = desiredRef.current;
    loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return;
      playerRef.current = new YT.Player(hostRef.current, {
        videoId: initial,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          autoplay: autoplayRef.current ? 1 : 0,
          origin: window.location.origin,
          // Where they got to last time (lib/videoPositions) — 0 means the
          // beginning, which is what YouTube does with `start: 0` anyway.
          start: readVideoPosition(initial),
        },
        events: {
          onReady: (e: any) => {
            readyRef.current = true;
            // If the desired video changed while the API was loading, honour it.
            if (desiredRef.current !== initial) {
              const at = readVideoPosition(desiredRef.current);
              if (autoplayRef.current) e.target.loadVideoById({ videoId: desiredRef.current, startSeconds: at });
              else e.target.cueVideoById({ videoId: desiredRef.current, startSeconds: at });
            }
          },
          onStateChange: (e: any) => {
            // 1 === YT.PlayerState.PLAYING — covers pressing play INSIDE the
            // iframe on the initially-cued video (no openVideo call happens).
            if (e.data === 1) onPlayingRef.current?.();
            // Anything that is not PLAYING has stopped playing — pause (2),
            // buffering (3), ended (0). Watch-time spans close on all of them
            // rather than on pause alone, so a stall isn't counted as watched.
            else { onPausedRef.current?.(); keepPlaceRef.current?.(); }
            // 0 === YT.PlayerState.ENDED
            // Watched to the end: there is no place to keep any more, and the
            // next opening should start it over rather than at the credits.
            if (e.data === 0) clearVideoPosition(desiredRef.current);
            if (e.data === 0 && !endedRef.current) {
              endedRef.current = true;
              onEndedRef.current();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      try { playerRef.current?.destroy(); } catch { /* ignore */ }
      playerRef.current = null;
      readyRef.current = false;
    };
    // Intentionally create-once; video swaps handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap the video when the selection changes — keeping the place in the one
  // being left, and starting the new one where it was left.
  useEffect(() => {
    endedRef.current = false;
    const p = playerRef.current;
    if (p && readyRef.current) {
      keepPlace();
      playedRef.current = 0;
      tickingIdRef.current = videoId;
      const at = readVideoPosition(videoId);
      if (autoplayRef.current) p.loadVideoById({ videoId, startSeconds: at });
      else p.cueVideoById({ videoId, startSeconds: at });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  /**
   * KEEP THE PLACE, from wherever the player is now. Called on the ticker, on
   * anything that is not playing, when the app goes away, and on the way out —
   * a video is left in every one of those ways, and iOS gives no reliable
   * "closing" moment of its own.
   */
  const keepPlace = useCallback(() => {
    const p = playerRef.current;
    if (!p || !readyRef.current) return;
    try {
      saveVideoPosition(tickingIdRef.current, Number(p.getCurrentTime?.() ?? 0), Number(p.getDuration?.() ?? 0));
    } catch { /* the player was torn down mid-call */ }
  }, []);

  /**
   * ONE TICKER, a second at a time: it counts only while the player says
   * PLAYING, so a paused video adds nothing, and it keeps the place every
   * fifth tick rather than on every one.
   */
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p || !readyRef.current) return;
      let state = -1;
      try { state = Number(p.getPlayerState?.() ?? -1); } catch { return; }
      if (state !== 1) return; // 1 === PLAYING
      playedRef.current += 1;
      onPlayedSecondsRef.current?.(playedRef.current);
      if (playedRef.current % 5 === 0) keepPlace();
    }, 1000);
    const onHide = () => { if (document.visibilityState === "hidden") keepPlace(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", keepPlace);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", keepPlace);
      keepPlace();
    };
  }, [keepPlace]);
  keepPlaceRef.current = keepPlace;

  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onFs = () => {
      const on = !!document.fullscreenElement;
      setIsFs(on);
      /*
       * TURN THE PHONE'S PICTURE, not the phone. A service is filmed
       * landscape, and Phoebe is a portrait app (iOS is portrait-only in
       * Info.plist), so full screen in portrait letterboxes it into a band.
       * Asking for landscape while full screen is what every video app does,
       * and it is released the moment full screen ends.
       *
       * Best-effort by design: the lock throws where it isn't supported
       * (desktop browsers, iOS — where WKWebView's own native full-screen
       * player handles rotation itself) and the video is perfectly watchable
       * without it.
       */
      const orientation = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
      try {
        if (on) void orientation?.lock?.("landscape")?.catch(() => { /* unsupported */ });
        else orientation?.unlock?.();
      } catch { /* unsupported */ }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      try { (screen.orientation as ScreenOrientation | undefined)?.unlock?.(); } catch { /* unsupported */ }
    };
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    // Prefer the actual YT iframe so fullscreen fills the screen with the video
    // (falls back to the wrapper before the iframe has mounted).
    const iframe = wrapRef.current?.querySelector("iframe") as HTMLElement | null;
    const target = iframe ?? wrapRef.current;
    target?.requestFullscreen?.();
  }, []);

  return (
    <div
      ref={wrapRef}
      className={`relative w-full overflow-hidden bg-black${frame === "bleed" ? "" : " rounded-2xl"}`}
      style={{ aspectRatio: "16 / 9", ...(frame === "bleed" ? {} : { border: `1px solid ${BORDER}` }) }}
    >
      {/* YT.Player replaces this node with its iframe. */}
      <div ref={hostRef} className="absolute inset-0 h-full w-full" />
      <button
        onClick={toggleFullscreen}
        aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-lg opacity-70 transition-opacity hover:opacity-100"
        style={{ background: "rgba(9,26,16,0.72)", color: TEXT, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
      >
        <Maximize2 size={15} />
      </button>
    </div>
  );
}

