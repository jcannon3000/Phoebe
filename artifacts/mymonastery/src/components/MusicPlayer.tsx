// ── The music player (Audio Divina's LISTEN beat) ───────────────────────────
//
// Owner, 2026-09-18: make it read as the PODCAST player — "have the cover
// centered … as if it's the podcast player" — with a progress bar, and back /
// next when an album or playlist is playing. So: the cover in the middle, the
// title under it, a thin track with the two clocks, then the transport row
// in PodcastPlayer's shape (IconTrack either side of a round play/pause).
//
// MusicKit holds the playback, not a web <audio>, so the clock and the queue
// come from PhoebeMusic.status(), polled once a second while this is on
// screen. A build from before `status` existed simply has none: the player
// then shows the cover and pause alone, as it always did, rather than a
// progress bar stuck at zero.
//
// No scrubbing. The track shows where you are; it is not a control — there is
// no seek on the native side, and a bar that looked draggable but wasn't would
// be worse than none.

import { useEffect, useState, type ReactNode } from "react";
import {
  appleMusicStatusNative, hasAppleMusicStatusNative,
  nextAppleMusicNative, previousAppleMusicNative,
  type AppleMusicStatus,
} from "@/lib/appleMusicNative";

const WARM = "#F0EDE6";
const FAINT = "rgba(200,212,192,0.62)";
const FONT = "'Space Grotesk', sans-serif";

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

function IconTrack({ next }: { next?: boolean }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden>
      {next
        ? (<><path d="M5.5 5.2 15.2 12 5.5 18.8Z" fill="currentColor" /><rect x="16.6" y="5" width="2.6" height="14" rx="1.1" fill="currentColor" /></>)
        : (<><path d="M18.5 5.2 8.8 12 18.5 18.8Z" fill="currentColor" /><rect x="4.8" y="5" width="2.6" height="14" rx="1.1" fill="currentColor" /></>)}
    </svg>
  );
}

export function MusicPlayer({
  title, artworkUrl, paused, onTogglePause, onPausedChange, children,
}: {
  /** What was started — a song, or an album / playlist's name. */
  title: string;
  /** The cover we had when it started; the current song's cover wins. */
  artworkUrl?: string;
  paused: boolean;
  onTogglePause: () => void;
  /** Paused or resumed from outside (lock screen, Control Center, end of queue). */
  onPausedChange?: (paused: boolean) => void;
  /** Under the transport — Audio Divina's "Log this listening". */
  children?: ReactNode;
}) {
  const [status, setStatus] = useState<AppleMusicStatus | null>(null);

  useEffect(() => {
    if (!hasAppleMusicStatusNative()) return;
    let alive = true;
    const tick = () => {
      void appleMusicStatusNative().then((s) => {
        if (!alive || !s) return;
        setStatus(s);
      });
    };
    tick();
    const h = window.setInterval(tick, 1000);
    return () => { alive = false; window.clearInterval(h); };
  }, []);

  // The lock screen can pause it too; the button should say what is true.
  // Only a CHANGE in what MusicKit reports is passed on, so a tap here is not
  // undone by the poll that was already in flight when it landed.
  const reportedPlaying = status?.playing;
  useEffect(() => {
    if (reportedPlaying === undefined) return;
    onPausedChange?.(!reportedPlaying);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportedPlaying]);

  const inQueue = (status?.count ?? 0) > 1;
  const cover = status?.artworkUrl || (artworkUrl ? bigArtwork(artworkUrl) : "");
  // In an album or playlist the song changes under the name that started it,
  // so the song is the title and the collection becomes the line above it.
  const songTitle = inQueue && status?.title ? status.title : title;
  // One song: its title usually carries the artist already ("… — Choir"),
  // and saying it twice reads as a glitch.
  const artist = status?.artist ?? "";
  const songSub = inQueue && status?.title
    ? [artist, title].filter(Boolean).join(" · ")
    : (artist && !title.toLowerCase().includes(artist.toLowerCase()) ? artist : "");
  const duration = status?.duration ?? 0;
  const time = Math.min(status?.time ?? 0, duration || Infinity);
  const pct = duration > 0 ? Math.max(0, Math.min(100, (time / duration) * 100)) : 0;

  const trackBtn: React.CSSProperties = {
    background: "none", border: "none", color: WARM, padding: 4, lineHeight: 0, cursor: "pointer",
  };

  return (
    <div className="w-full flex flex-col items-center" style={{ maxWidth: 480, gap: 18 }}>
      <p className="text-center" style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
        {paused ? "Paused" : "Now playing"}
      </p>
      {/* The cover, centred. Always a square, art or not — a record with no
          sleeve still has a shape. Dims while paused. */}
      <div
        style={{
          width: "min(64vw, 260px)", aspectRatio: "1 / 1", borderRadius: 18,
          overflow: "hidden", position: "relative", flex: "0 0 auto",
          background: "rgba(9,26,16,0.55)", border: "1px solid rgba(200,212,192,0.22)",
          boxShadow: "0 18px 44px rgba(0,0,0,0.38)",
          opacity: paused ? 0.55 : 1, transition: "opacity 240ms ease",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {cover ? (
          <img src={cover} alt="" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : (
          <span aria-hidden style={{ fontSize: 46, opacity: 0.5 }}>♪</span>
        )}
      </div>
      <div className="text-center" style={{ width: "100%", padding: "0 8px" }}>
        <p style={{ color: WARM, fontFamily: FONT, fontSize: 17, fontWeight: 500, lineHeight: 1.35, margin: 0 }}>
          {songTitle}
        </p>
        {songSub && (
          <p style={{ color: FAINT, fontFamily: FONT, fontSize: 13, lineHeight: 1.4, margin: "4px 0 0" }}>
            {songSub}
          </p>
        )}
      </div>
      {/* Progress — the podcast player's thin sage track, with both clocks. */}
      {status && duration > 0 && (
        <div style={{ width: "min(78vw, 320px)" }}>
          <div
            role="progressbar"
            aria-label="Progress"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(time)}
            style={{ height: 4, borderRadius: 999, background: "rgba(143,175,150,0.22)", overflow: "hidden" }}
          >
            <div style={{ width: `${pct}%`, height: "100%", background: "#A8C5A0", transition: "width 1s linear" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, color: FAINT, fontFamily: FONT, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
            <span>{fmtClock(time)}</span>
            <span>-{fmtClock(duration - time)}</span>
          </div>
        </div>
      )}
      {/* Transport: back · play/pause · next. Back/next only when there is a
          queue to move through — for one hymn they would do nothing. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28 }}>
        {inQueue && (
          <button type="button" aria-label="Previous" onClick={() => { void previousAppleMusicNative(); }} className="active:scale-[0.94]" style={trackBtn}>
            <IconTrack />
          </button>
        )}
        <button
          type="button"
          onClick={onTogglePause}
          aria-label={paused ? "Resume" : "Pause"}
          className="active:scale-[0.97]"
          style={{
            width: 66, height: 66, borderRadius: 999, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(46,107,64,0.5)", border: "1px solid rgba(143,175,150,0.6)",
            backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)",
          }}
        >
          {paused ? (
            <svg width="19" height="21" viewBox="0 0 19 21" aria-hidden style={{ display: "block", marginLeft: 4 }}>
              <path d="M0 1.1 A1.1 1.1 0 0 1 1.7 0.2 L17.7 9.4 A1.1 1.1 0 0 1 17.7 11.6 L1.7 20.8 A1.1 1.1 0 0 1 0 19.9 Z" fill={WARM} />
            </svg>
          ) : (
            <svg width="18" height="21" viewBox="0 0 18 21" aria-hidden style={{ display: "block" }}>
              <rect x="0.5" y="0.5" width="6" height="20" rx="1.6" fill={WARM} />
              <rect x="11" y="0.5" width="6" height="20" rx="1.6" fill={WARM} />
            </svg>
          )}
        </button>
        {inQueue && (
          <button type="button" aria-label="Next" onClick={() => { void nextAppleMusicNative(); }} className="active:scale-[0.94]" style={trackBtn}>
            <IconTrack next />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
