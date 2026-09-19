// ── The music player — the podcast player's full screen, for music ───────────
//
// Owner, 2026-09-18: "play the music through a ui like the podcast ui, but
// with the music specific features too" — "the album covers … overlayed over
// the background of the podcast ui" — "we don't want the album covers corners
// rounded".
//
// So this IS PodcastPlayer's expanded view (components/PodcastPlayer.tsx,
// `current && expanded`), to the pixel where it can be: a landscape photo
// filling the top ~68%, a gradient into a solid colour sampled from the
// photo's lower band, the minimise chevron top-left, a white 5px track with a
// knob and both clocks, the title in Georgia 25/700, the line under it at 14,
// and pill actions at 12/700. What music adds:
//   · the album cover, SQUARE, laid over the photo in the middle
//   · back / next TRACK either side of play-pause (skip ±15/30 is a podcast
//     thing; songs are moved between, not scrubbed), in the lower block —
//     PodcastPlayer's own Listen-to-Scripture arrangement, where the middle
//     is taken by something to look at
//   · "1 of 5" and the artist · album line
//
// MusicKit holds the playback, not a web <audio>, so the clock and the queue
// come from PhoebeMusic.status(), polled once a second while visible. A build
// from before `status` existed has none: the player then shows the cover and
// play-pause alone, rather than a progress bar stuck at zero.
//
// The track is not draggable: there is no seek on the native side, and a knob
// that looked draggable but wasn't would be worse than none.

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  appleMusicStatusNative, hasAppleMusicStatusNative,
  nextAppleMusicNative, previousAppleMusicNative,
  hasAppleMusicShuffleNative, setShuffleAppleMusicNative,
  type AppleMusicStatus,
} from "@/lib/appleMusicNative";

const FONT = "'Space Grotesk', system-ui, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";
const INK = "#F6F0E6";

function fmtClock(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60); const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Apple's artwork URLs carry their size in the path, and the search proxy asks
 * for 160x160 — fine for a list row, mush at player size. Swapping the segment
 * (or filling a {w}x{h} template) asks Apple for the same image larger;
 * anything that isn't one of their URLs is returned untouched.
 */
function bigArtwork(url: string): string {
  return url.replace("{w}x{h}", "600x600").replace(/\/\d+x\d+(bb)?\./, "/600x600$1.");
}

// PodcastPlayer's transport glyphs, copied so the two players can't drift in
// weight or size.
function IconTrack({ next }: { next?: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
      {next
        ? (<><path d="M5.5 5.2 15.2 12 5.5 18.8Z" fill="currentColor" /><rect x="16.6" y="5" width="2.6" height="14" rx="1.1" fill="currentColor" /></>)
        : (<><path d="M18.5 5.2 8.8 12 18.5 18.8Z" fill="currentColor" /><rect x="4.8" y="5" width="2.6" height="14" rx="1.1" fill="currentColor" /></>)}
    </svg>
  );
}
function IconPlay() {
  return (<svg width="34" height="34" viewBox="0 0 24 24" aria-hidden><path d="M7 4.5 19.5 12 7 19.5Z" fill="currentColor" /></svg>);
}
function IconPause() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="4" width="4.2" height="16" rx="1.6" fill="currentColor" />
      <rect x="13.8" y="4" width="4.2" height="16" rx="1.6" fill="currentColor" />
    </svg>
  );
}
function IconShuffle() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" />
    </svg>
  );
}
function IconChevronDown() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9 12 15 18 9" />
    </svg>
  );
}

/** PodcastPlayer's colour sampling: the photo's LOWER band, darkened, so the
 *  gradient meets a solid that belongs to the picture and warm text reads. */
function useSampledColour(src: string | null | undefined) {
  const [rgb, setRgb] = useState<{ r: number; g: number; b: number }>({ r: 18, g: 30, b: 22 });
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 8; c.height = 8;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, Math.floor(img.naturalHeight * 0.6), img.naturalWidth, Math.floor(img.naturalHeight * 0.4), 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        const k = 0.46;
        if (!cancelled) setRgb({ r: Math.round((r / n) * k), g: Math.round((g / n) * k), b: Math.round((b / n) * k) });
      } catch { /* tainted / unavailable — keep the deep green */ }
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);
  return rgb;
}

export function MusicPlayer({
  title, artworkUrl, backdrop, paused, onTogglePause, onPausedChange, onMinimize, children,
}: {
  /** What was started — a song, or an album / playlist's name. */
  title: string;
  /** The cover we had when it started; the current song's cover wins. */
  artworkUrl?: string;
  /** The landscape photo behind the top of the screen (the deck's own). */
  backdrop?: string | null;
  paused: boolean;
  onTogglePause: () => void;
  /** Paused or resumed from outside (lock screen, Control Center, end of queue). */
  onPausedChange?: (paused: boolean) => void;
  /** The chevron: step out of the player (the deck's Back). */
  onMinimize: () => void;
  /** The action pills under the title — Audio Divina's "Log this listening". */
  children?: ReactNode;
}) {
  const [status, setStatus] = useState<AppleMusicStatus | null>(null);

  useEffect(() => {
    if (!hasAppleMusicStatusNative()) return;
    let alive = true;
    // Only while the page is VISIBLE. Background audio keeps this web view
    // alive, and a status call every second from a backgrounded app is one
    // more trip to the media server at exactly the moment iOS is timing the
    // app's move to the background (the 2026-09-18 watchdog kills).
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void appleMusicStatusNative().then((s) => {
        if (!alive || !s) return;
        setStatus(s);
      });
    };
    tick();
    const h = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; window.clearInterval(h); document.removeEventListener("visibilitychange", tick); };
  }, []);

  // The button says what is TRUE. The lock screen can pause it too, and a
  // tap MusicKit ignores used to leave the button wrong indefinitely (audit,
  // 2026-09-18), because only a CHANGE in the reported state was passed on.
  // Now MusicKit's answer wins once it has disagreed with the button for two
  // polls running — long enough that a tap is never undone by the poll that
  // was already in flight when it landed.
  const disagreeRef = useRef(0);
  useEffect(() => {
    if (!status) return;
    if (status.playing === !paused) { disagreeRef.current = 0; return; }
    disagreeRef.current += 1;
    if (disagreeRef.current >= 2) { disagreeRef.current = 0; onPausedChange?.(!status.playing); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const count = status?.count ?? 0;
  const index = status?.index ?? -1;
  // Back and next are always there once the player knows where the music is;
  // at either end the button stays in place, dimmed, as the podcast player's
  // previous/next episode do.
  const hasPrev = !!status && (index > 0 || (status.time ?? 0) > 3);
  const hasNext = !!status && index >= 0 && index + 1 < count;
  const cover = status?.artworkUrl || (artworkUrl ? bigArtwork(artworkUrl) : "");
  // A cover that fails to load shows the empty sleeve, never a broken image.
  const [brokenCover, setBrokenCover] = useState("");
  // The TRACK is the title (owner: "It should also show the name of the
  // track"); the artist and album — or what was started — go underneath.
  const artist = status?.artist ?? "";
  const album = status?.album ?? "";
  const songTitle = status?.title || title;
  const songSub = status?.title
    ? [artist, album || title].filter((v, i, a) => v && a.indexOf(v) === i).join(" · ")
    : "";
  // SHUFFLE, one icon you tap (owner, 2026-09-18: "For playlists and album
  // have a shuffle on an off toggle" · "Maybe just an icon that you tap").
  // Only for a queue of more than one, and only on a build that can set it.
  // The tap shows at once; the next status poll confirms it.
  const [shuffleTap, setShuffleTap] = useState<boolean | null>(null);
  const shuffleOn = shuffleTap ?? !!status?.shuffle;
  useEffect(() => { if (status && shuffleTap !== null && status.shuffle === shuffleTap) setShuffleTap(null); }, [status, shuffleTap]);
  const canShuffle = count > 1 && hasAppleMusicShuffleNative();
  // "1 of 5" (owner) — where this song sits in what is playing.
  const position = index >= 0 && count > 1 ? `${index + 1} of ${count}` : "";
  const duration = status?.duration ?? 0;
  const time = Math.min(status?.time ?? 0, duration || Infinity);
  const pct = duration > 0 ? Math.max(0, Math.min(100, (time / duration) * 100)) : 0;

  const { r, g, b } = useSampledColour(backdrop);
  const oSolid = `rgb(${r},${g},${b})`;
  const oRgba = (a: number) => `rgba(${r},${g},${b},${a})`;

  const trackBtn = (enabled: boolean) => ({
    background: "none", border: "none", color: "#FFFFFF", padding: 4, lineHeight: 0,
    cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.35,
  });

  return (
    <div
      // The overlay is a player, so a stray tap on the picture must not page
      // the deck underneath (it pages on any tap in its right half).
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      style={{
        position: "fixed", inset: 0, zIndex: 70, fontFamily: FONT, color: INK,
        background: oSolid,
        display: "flex", flexDirection: "column", overflow: "hidden",
        paddingTop: "max(0.75rem, var(--safe-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      {/* Photo + gradient backdrop, exactly as the podcast player lays it. */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {backdrop && (
          <img src={backdrop} alt="" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "68%", objectFit: "cover" }} />
        )}
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0.06) 14%, ${oRgba(0)} 32%, ${oRgba(0.45)} 48%, ${oRgba(0.86)} 60%, ${oSolid} 67%)`,
        }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* Top bar: minimise chevron (left) · where we are in the queue (right). */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 18px", flexShrink: 0 }}>
          <button type="button" onClick={onMinimize} aria-label="Back"
            style={{ background: "none", border: "none", color: "#FFFFFF", cursor: "pointer", padding: 6, lineHeight: 0, opacity: 0.95 }}>
            <IconChevronDown />
          </button>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.22em", color: "rgba(246,240,230,0.9)", textShadow: "0 1px 10px rgba(0,0,0,0.55)" }}>
            {position || (paused ? "Paused" : "")}
          </span>
        </div>

        {/* The middle: the album cover over the photo. Square — no rounding
            (owner) — and smaller than it first was (owner, 2026-09-19: "Make
            the album cover smaller on the playback"). Dims while paused. */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0, padding: "12px 28px" }}>
          <div style={{
            width: "min(58vw, 34vh, 250px)", aspectRatio: "1 / 1", flex: "0 0 auto",
            background: "rgba(9,26,16,0.55)",
            boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 2px 10px rgba(0,0,0,0.35)",
            opacity: paused ? 0.6 : 1, transition: "opacity 240ms ease",
            display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
          }}>
            {cover && cover !== brokenCover ? (
              <img src={cover} alt="" decoding="async" onError={() => setBrokenCover(cover)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <span aria-hidden style={{ fontSize: 56, opacity: 0.5 }}>♪</span>
            )}
          </div>
        </div>

        {/* Lower block on the solid colour — the podcast player's, with the
            transport on top as in its Listen-to-Scripture arrangement. */}
        <div style={{ flexShrink: 0, padding: "0 26px" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: 34, marginBottom: 18 }}>
            {canShuffle && (
              <button
                type="button"
                aria-label={shuffleOn ? "Shuffle on" : "Shuffle off"}
                aria-pressed={shuffleOn}
                onClick={() => { const next = !shuffleOn; setShuffleTap(next); void setShuffleAppleMusicNative(next); }}
                style={{
                  position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", padding: 6, lineHeight: 0, cursor: "pointer",
                  color: "#FFFFFF", opacity: shuffleOn ? 1 : 0.38, transition: "opacity 160ms ease",
                }}
              >
                <IconShuffle />
              </button>
            )}
            {status && (
              <button type="button" aria-label="Previous track" disabled={!hasPrev} onClick={() => { void previousAppleMusicNative(); }} style={trackBtn(hasPrev)}>
                <IconTrack />
              </button>
            )}
            <button type="button" onClick={onTogglePause} aria-label={paused ? "Play" : "Pause"}
              style={{
                width: 84, height: 84, borderRadius: "50%", border: "none", cursor: "pointer",
                background: "rgba(18,20,18,0.34)", color: "#FFFFFF",
                backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
              }}>
              {paused ? <IconPlay /> : <IconPause />}
            </button>
            {status && (
              <button type="button" aria-label="Next track" disabled={!hasNext} onClick={() => { void nextAppleMusicNative(); }} style={trackBtn(hasNext)}>
                <IconTrack next />
              </button>
            )}
          </div>

          {status && duration > 0 && (
            <>
              <div role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)}
                style={{ position: "relative", padding: "11px 0", marginTop: 5 }}>
                <div style={{ height: 5, borderRadius: 999, background: "rgba(246,240,230,0.22)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: INK, transition: "width 1s linear" }} />
                </div>
                <div style={{ position: "absolute", top: "50%", left: `${pct}%`, width: 14, height: 14, borderRadius: "50%", background: INK, transform: "translate(-50%, -50%)", boxShadow: "0 1px 5px rgba(0,0,0,0.45)", pointerEvents: "none", transition: "left 1s linear" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(246,240,230,0.7)", margin: "2px 1px 0", fontVariantNumeric: "tabular-nums" }}>
                <span>{fmtClock(time)}</span>
                <span>-{fmtClock(duration - time)}</span>
              </div>
            </>
          )}

          <h2 style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 700, margin: "16px 0 0", lineHeight: 1.18, color: INK }}>
            {songTitle}
          </h2>
          {songSub && (
            <p style={{ fontSize: 14, color: "rgba(246,240,230,0.72)", margin: "5px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {songSub}
            </p>
          )}
          {children && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 0", width: "100%" }}>
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The podcast player's action-pill style, for the actions passed in. */
export const MUSIC_PLAYER_PILL = {
  background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.18)", color: INK,
  fontSize: 12, fontWeight: 700, borderRadius: 999, padding: "6px 12px", cursor: "pointer", fontFamily: FONT,
} as const;
