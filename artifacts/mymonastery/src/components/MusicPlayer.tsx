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

  // The lock screen can pause it too; the button should say what is true.
  // Only a CHANGE in what MusicKit reports is passed on, so a tap here is not
  // undone by the poll that was already in flight when it landed.
  const reportedPlaying = status?.playing;
  useEffect(() => {
    if (reportedPlaying === undefined) return;
    onPausedChange?.(!reportedPlaying);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportedPlaying]);

  const count = status?.count ?? 0;
  // Back and next are always there once the player knows where the music is
  // (owner, 2026-09-18: "I asked for next and back"). A lone song is queued
  // with its album, so there is almost always somewhere to go; at either end
  // the button stays in place, dimmed, as the podcast player's does.
  const index = status?.index ?? -1;
  const hasPrev = !!status && (index > 0 || (status.time ?? 0) > 3);
  const hasNext = !!status && index >= 0 && index + 1 < count;
  const cover = status?.artworkUrl || (artworkUrl ? bigArtwork(artworkUrl) : "");
  // The TRACK is the title (owner: "It should also show the name of the
  // track"); what was started — an album, a playlist, the logged line —
  // drops to the line beneath, with the artist.
  const artist = status?.artist ?? "";
  const album = status?.album ?? "";
  const songTitle = status?.title || title;
  const songSub = status?.title
    ? [artist, album || title].filter((v, i, a) => v && a.indexOf(v) === i).join(" \u00b7 ")
    : "";
  // "1 of 5" (owner) — where this song sits in what is playing.
  const position = index >= 0 && count > 1 ? `${index + 1} of ${count}` : "";
  const duration = status?.duration ?? 0;
  const time = Math.min(status?.time ?? 0, duration || Infinity);
  const pct = duration > 0 ? Math.max(0, Math.min(100, (time / duration) * 100)) : 0;

  const trackBtn = (enabled: boolean): React.CSSProperties => ({
    background: "none", border: "none", color: WARM, padding: 4, lineHeight: 0,
    cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.35,
  });

  return (
    <div className="w-full flex flex-col items-center" style={{ maxWidth: 480, gap: 18 }}>
      <p className="text-center" style={{ color: FAINT, fontFamily: FONT, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>
        {paused ? "Paused" : "Now playing"}{position ? ` \u00b7 ${position}` : ""}
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
      {/* Transport: back · play/pause · next. Shown whenever this build can
          report the queue; an older build (no status) has pause alone. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28 }}>
        {status && (
          <button type="button" aria-label="Previous" disabled={!hasPrev} onClick={() => { void previousAppleMusicNative(); }} className="active:scale-[0.94]" style={trackBtn(hasPrev)}>
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
        {status && (
          <button type="button" aria-label="Next" disabled={!hasNext} onClick={() => { void nextAppleMusicNative(); }} className="active:scale-[0.94]" style={trackBtn(hasNext)}>
            <IconTrack next />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
