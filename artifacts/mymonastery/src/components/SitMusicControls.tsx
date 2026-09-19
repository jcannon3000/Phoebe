// ── Music controls on a running sit ─────────────────────────────────────────
//
// Owner, 2026-09-19: "when there is music on the contemplation time have a
// skip, back, shuffle toggle, play and stop ui". A quiet row under the timer's
// End / Discard: the library's name, then back · play-pause · next, with the
// shuffle icon at the left and stop at the right. White with a text shadow,
// like End and Discard above it, so it reads over the bright photo.
//
// Play-pause and shuffle show the tap at once; a status poll (once every 1.5s,
// only while visible — the watchdog lesson from 2026-09-18) brings them back
// in line if MusicKit disagrees, e.g. after a pause from the lock screen. On a
// build without status/next/shuffle those controls simply aren't drawn, and
// play-pause and stop still work.

import { useEffect, useRef, useState } from "react";
import {
  appleMusicStatusNative, hasAppleMusicStatusNative,
  nextAppleMusicNative, previousAppleMusicNative,
  pauseAppleMusicNative, resumeAppleMusicNative,
  hasAppleMusicShuffleNative, setShuffleAppleMusicNative,
  type AppleMusicStatus,
} from "@/lib/appleMusicNative";

const FONT = "'Space Grotesk', sans-serif";
const SHADOW = "drop-shadow(0 2px 10px rgba(0,0,0,0.7))";

function Icon({ d, size = 22, filled = true }: { d: string; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden
      fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"}
      strokeWidth={filled ? 0 : 2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
const PREV = "M18.5 5.2 8.8 12 18.5 18.8Z M4.8 5h2.6v14H4.8Z";
const NEXT = "M5.5 5.2 15.2 12 5.5 18.8Z M16.6 5h2.6v14h-2.6Z";
const PLAY = "M7 4.5 19.5 12 7 19.5Z";
const PAUSE = "M6 4h4.2v16H6Z M13.8 4H18v16h-4.2Z";
const STOP = "M6.5 6.5h11v11h-11Z";
const SHUFFLE = "M16 3h5v5 M4 20 21 3 M21 16v5h-5 M15 15l6 6 M4 4l5 5";

export function SitMusicControls({ label, onStop }: { label: string; onStop: () => void }) {
  const [status, setStatus] = useState<AppleMusicStatus | null>(null);
  const [paused, setPaused] = useState(false);
  const [shuffleTap, setShuffleTap] = useState<boolean | null>(null);
  const disagree = useRef(0);

  useEffect(() => {
    if (!hasAppleMusicStatusNative()) return;
    let alive = true;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void appleMusicStatusNative().then((s) => { if (alive && s) setStatus(s); });
    };
    tick();
    const h = window.setInterval(tick, 1500);
    document.addEventListener("visibilitychange", tick);
    return () => { alive = false; window.clearInterval(h); document.removeEventListener("visibilitychange", tick); };
  }, []);

  // MusicKit's answer wins after two polls that disagree with the button.
  useEffect(() => {
    if (!status) return;
    if (status.playing === !paused) { disagree.current = 0; return; }
    if (++disagree.current >= 2) { disagree.current = 0; setPaused(!status.playing); }
    if (shuffleTap !== null && status.shuffle === shuffleTap) setShuffleTap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const shuffleOn = shuffleTap ?? !!status?.shuffle;
  const inQueue = (status?.count ?? 0) > 1;
  const canShuffle = inQueue && hasAppleMusicShuffleNative();
  const now = status?.title ? status.title : label;

  const btn = (enabled = true): React.CSSProperties => ({
    background: "none", border: "none", padding: 6, lineHeight: 0, color: "#FFFFFF",
    cursor: enabled ? "pointer" : "default", opacity: enabled ? 0.92 : 0.35, filter: SHADOW,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, marginTop: 6, maxWidth: "86vw" }}>
      <p
        aria-label={`Music: ${now}`}
        style={{
          margin: 0, maxWidth: "80vw", textAlign: "center",
          color: "rgba(255,255,255,0.7)", fontFamily: FONT, fontSize: 12.5,
          letterSpacing: "0.02em", textShadow: "0 2px 14px rgba(0,0,0,0.7)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        <span aria-hidden style={{ marginRight: 6 }}>♪</span>{now}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {canShuffle && (
          <button type="button" aria-label={shuffleOn ? "Shuffle on" : "Shuffle off"} aria-pressed={shuffleOn}
            onClick={() => { const next = !shuffleOn; setShuffleTap(next); void setShuffleAppleMusicNative(next); }}
            style={{ ...btn(), opacity: shuffleOn ? 0.95 : 0.4 }}>
            <Icon d={SHUFFLE} size={19} filled={false} />
          </button>
        )}
        {status && (
          <button type="button" aria-label="Previous track" onClick={() => { void previousAppleMusicNative(); }} style={btn()}>
            <Icon d={PREV} />
          </button>
        )}
        <button type="button" aria-label={paused ? "Play music" : "Pause music"}
          onClick={() => {
            if (paused) { void resumeAppleMusicNative(); setPaused(false); }
            else { void pauseAppleMusicNative(); setPaused(true); }
          }}
          style={btn()}>
          <Icon d={paused ? PLAY : PAUSE} size={24} />
        </button>
        {status && (
          <button type="button" aria-label="Next track" disabled={inQueue ? false : true}
            onClick={() => { void nextAppleMusicNative(); }} style={btn(inQueue)}>
            <Icon d={NEXT} />
          </button>
        )}
        <button type="button" aria-label="Stop music" onClick={onStop} style={btn()}>
          <Icon d={STOP} size={19} />
        </button>
      </div>
    </div>
  );
}
