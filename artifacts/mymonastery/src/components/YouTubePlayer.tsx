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
}: {
  videoId: string;
  autoplay: boolean;
  /** Fired once per video when it plays to the end. */
  onEnded: () => void;
  /** Every transition into PLAYING — a course marks itself started, a
   *  cathedral page opens a watch-time span. */
  onPlaying?: () => void;
  /** Every transition out of PLAYING (pause, buffer-stall, end). The cathedral
   *  pages close their watch-time span on it; courses don't pass it. */
  onPaused?: () => void;
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
        },
        events: {
          onReady: (e: any) => {
            readyRef.current = true;
            // If the desired video changed while the API was loading, honour it.
            if (desiredRef.current !== initial) {
              if (autoplayRef.current) e.target.loadVideoById(desiredRef.current);
              else e.target.cueVideoById(desiredRef.current);
            }
          },
          onStateChange: (e: any) => {
            // 1 === YT.PlayerState.PLAYING — covers pressing play INSIDE the
            // iframe on the initially-cued video (no openVideo call happens).
            if (e.data === 1) onPlayingRef.current?.();
            // Anything that is not PLAYING has stopped playing — pause (2),
            // buffering (3), ended (0). Watch-time spans close on all of them
            // rather than on pause alone, so a stall isn't counted as watched.
            else onPausedRef.current?.();
            // 0 === YT.PlayerState.ENDED
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

  // Swap the video when the selection changes.
  useEffect(() => {
    endedRef.current = false;
    const p = playerRef.current;
    if (p && readyRef.current) {
      if (autoplayRef.current) p.loadVideoById(videoId);
      else p.cueVideoById(videoId);
    }
  }, [videoId]);

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
      className="relative w-full overflow-hidden rounded-2xl bg-black"
      style={{ aspectRatio: "16 / 9", border: `1px solid ${BORDER}` }}
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

