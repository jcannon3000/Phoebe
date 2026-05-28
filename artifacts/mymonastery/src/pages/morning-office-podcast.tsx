import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// ── /podcast/morning-office — "A Morning at the Office", embedded ──
//
// Forward Movement's daily Episcopal Morning Prayer podcast (the full
// BCP 1979 office, read aloud). Surfaced as an option on the morning
// prayer chooser; this page plays today's episode inline with a thin
// Phoebe header above, the same in-app-not-ejected feel as the
// National Cathedral watch page (/ncmp/watch).
//
// Prayer-session log:
//   We accumulate ACTUAL playback time — segments bounded by the
//   <audio> element's play/pause/ended events (and paused when the app
//   backgrounds, since a backgrounded prayer isn't being prayed). One
//   "morning-office-podcast" row is committed with the real listened
//   duration when the user leaves. A session >= 3 minutes counts as
//   Morning Prayer: we stamp the local morning office-completed flag so
//   the dashboard lights up immediately, and the server independently
//   treats a >=180s morning-office-podcast row as a morning office (see
//   users.ts), so the credit survives a refetch / another device.
//
// Why playback-time and not page-open-time (NCMP uses the latter):
//   NCMP embeds a YouTube iframe whose play state we can't observe, so
//   it falls back to foreground time. Here we own the <audio> element,
//   so we can be honest and only count time the office is actually
//   playing.

const PALETTE = {
  bg: "#091A10",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
  // Warm gold — distinct from the green BCP options and the purple
  // National Cathedral card on the chooser. Reads as "morning."
  border: "rgba(212,160,70,0.40)",
  cardBg: "rgba(212,160,70,0.14)",
  accent: "#E8C27A",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";

// Listening for at least this long counts as having prayed Morning
// Prayer. Mirrors the national-cathedral gate in users.ts.
const MORNING_PRAYER_CREDIT_SECONDS = 180;

type Episode = {
  feedTitle: string | null;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  imageUrl: string | null;
};

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export default function MorningOfficePodcastPage() {
  const [, setLocation] = useLocation();

  const { data: episode, isLoading } = useQuery<Episode>({
    queryKey: ["/api/podcast/morning-office/today"],
    queryFn: () => apiRequest("GET", "/api/podcast/morning-office/today"),
    staleTime: 30 * 60_000,
  });

  // ── Playback-time tracking. Accumulate seconds the audio is actually
  // playing (segments opened on `play`, closed on `pause`/`ended`/leave
  // and when the app backgrounds), then commit one row on leave. Same
  // accumulator shape as usePrayerSession / the NCMP watch page;
  // inlined because this surface also writes the morning-office flag.
  const startedAtRef = useRef<Date | null>(null);
  const segmentStartRef = useRef<number | null>(null);
  const accumulatedRef = useRef<number>(0);
  const committedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    startedAtRef.current = new Date();
    segmentStartRef.current = null;
    accumulatedRef.current = 0;
    committedRef.current = false;

    const closeSegment = () => {
      const s = segmentStartRef.current;
      if (s === null) return;
      const elapsedMs = Date.now() - s;
      if (elapsedMs > 0) accumulatedRef.current += elapsedMs / 1000;
      segmentStartRef.current = null;
    };
    const openSegment = () => {
      if (segmentStartRef.current === null) segmentStartRef.current = Date.now();
    };

    // Commit exactly one row for this visit. Guarded so unmount +
    // pagehide can both call it without double-posting.
    const commit = () => {
      if (committedRef.current) return;
      closeSegment();
      const total = Math.round(accumulatedRef.current);
      const startedAt = startedAtRef.current;
      if (total <= 0 || !startedAt) return;
      committedRef.current = true;
      apiRequest("POST", "/api/prayer-sessions", {
        surface: "morning-office-podcast",
        durationSeconds: total,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
      }).catch(() => { /* best-effort */ });
      // Listened long enough to count as Morning Prayer — stamp the
      // local office-completed flag so the dashboard + rhythm slide
      // reflect it before the server history refetches. Morning side
      // because this office IS Morning Prayer.
      if (total >= MORNING_PRAYER_CREDIT_SECONDS) {
        try {
          const now = new Date();
          const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          localStorage.setItem(`phoebe:office-completed:morning:${dateKey}`, "1");
        } catch { /* private mode / quota — non-fatal */ }
      }
    };

    const audio = audioRef.current;
    const onPlay = () => openSegment();
    const onPause = () => closeSegment();
    const onEnded = () => closeSegment();
    audio?.addEventListener("play", onPlay);
    audio?.addEventListener("pause", onPause);
    audio?.addEventListener("ended", onEnded);

    // Backgrounding pauses the audio on iOS, but close the segment
    // explicitly so foreground-only time is what's counted even when
    // the OS keeps audio alive (e.g. lock-screen playback).
    const onVisibility = () => {
      if (document.visibilityState === "hidden") closeSegment();
      else if (document.visibilityState === "visible" && audio && !audio.paused) openSegment();
    };
    const onPageHide = () => commit();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      audio?.removeEventListener("play", onPlay);
      audio?.removeEventListener("pause", onPause);
      audio?.removeEventListener("ended", onEnded);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      commit();
    };
    // Mount-once: the listen session spans the whole page lifetime,
    // independent of when the episode metadata resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const durationLabel = formatDuration(episode?.durationSeconds ?? null);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: PALETTE.bg,
        color: PALETTE.warm,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top bar — Back left, label centered. Matches the office viewer
          + NCMP header rhythm so this reads as a Phoebe page. */}
      <header
        style={{
          paddingTop: "max(1.25rem, calc(env(safe-area-inset-top) + 0.5rem))",
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 10,
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{
            justifySelf: "start",
            background: "none",
            border: "none",
            color: PALETTE.sage,
            fontFamily: FONT,
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Back
        </button>
        <span
          className="rounded-full"
          style={{
            background: PALETTE.cardBg,
            border: `1px solid ${PALETTE.border}`,
            color: PALETTE.warm,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            padding: "6px 14px",
            whiteSpace: "nowrap",
          }}
        >
          🎧 Morning Prayer
        </span>
        <span />
      </header>

      <main
        style={{
          flex: 1,
          padding: "20px 20px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {isLoading && !episode ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 48 }}>
            Loading today's episode…
          </p>
        ) : !episode?.audioUrl ? (
          <p style={{ color: PALETTE.faint, fontSize: 13, marginTop: 48, textAlign: "center", maxWidth: 320, lineHeight: 1.5 }}>
            Today's episode couldn't be loaded right now. Please try again in
            a little while.
          </p>
        ) : (
          <div style={{ width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
            {/* Cover art — episode image if present, else the show
                artwork. Square, rounded, gold hairline border. */}
            {episode.imageUrl && (
              <img
                src={episode.imageUrl}
                alt={episode.feedTitle ?? "A Morning at the Office"}
                style={{
                  width: "min(72vw, 320px)",
                  aspectRatio: "1 / 1",
                  objectFit: "cover",
                  borderRadius: 20,
                  border: `1px solid ${PALETTE.border}`,
                }}
              />
            )}

            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.16em",
                  fontWeight: 600,
                  color: PALETTE.accent,
                  margin: 0,
                }}
              >
                {episode.feedTitle ?? "A Morning at the Office"}
              </p>
              {episode.title && (
                <h1
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: PALETTE.warm,
                    margin: "6px 0 0",
                    lineHeight: 1.25,
                  }}
                >
                  {episode.title}
                </h1>
              )}
              {durationLabel && (
                <p style={{ fontSize: 12, color: PALETTE.sage, margin: "8px 0 0" }}>
                  {durationLabel} · Forward Movement
                </p>
              )}
            </div>

            {/* Native audio controls — full transport (play/pause,
                scrubber, time, volume) for free, and iOS lock-screen +
                Control Center playback come along automatically. */}
            <audio
              ref={audioRef}
              src={episode.audioUrl}
              controls
              autoPlay
              preload="metadata"
              style={{ width: "100%", marginTop: 4 }}
            />

            <p
              style={{
                fontSize: 13,
                color: PALETTE.warm,
                margin: "4px 0 0",
                lineHeight: 1.5,
                textAlign: "center",
                maxWidth: 380,
              }}
            >
              The full order of Morning Prayer from the Book of Common Prayer,
              read aloud. A new episode every morning.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
