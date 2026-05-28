import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";

// ── /ncmp/watch — National Cathedral Morning Prayer, embedded ──
//
// Replaces the SFSafariViewController hop the cathedral CTA used to
// trigger. WebView-friendly iframe via YouTube's embed URL renders
// the broadcast (live or yesterday's recording) inline, with a thin
// Phoebe header above. Tapping the cathedral surface on the home
// card, prayer-chooser, or the office picker all funnel here.
//
// Prayer-session log:
//   We track ACTUAL foreground watch time on this page (segment
//   accumulator that pauses when the app backgrounds, same shape as
//   usePrayerSession) and commit one national-cathedral row with the
//   real duration when the user leaves. Two reasons it's watch-time
//   now rather than a fixed credit on mount:
//     • The community "Time Praying" metric is more honest if it
//       reflects how long they actually sat with the broadcast.
//     • Morning-prayer credit is gated on ">= 3 minutes watched"
//       (the product ask). A fixed-on-mount log would credit every
//       quick tap-away as a full Morning Prayer, which it isn't.
//   When the watch reaches the 3-minute threshold we ALSO stamp the
//   morning office-completed localStorage flag so the dashboard's
//   "prayed today" state + the end-of-office rhythm slide light up
//   immediately; the server's office-history query independently
//   treats a >=180s national-cathedral row as a morning office, so
//   the credit survives a refetch / another device.
//
// Why iframe and not the @capacitor/inappbrowser plugin:
//   YouTube's player allows iframe embed via /embed/<videoId>. The
//   user stays inside the Phoebe shell — same top inset, same back
//   gesture, same fast return to the home card. The bare WKWebView
//   path felt like leaving the app; this feels like watching it
//   here. Falls back to the YouTube channel /live URL when we don't
//   have a resolved videoId yet (the /api/ncmp/today-meta endpoint
//   is a server-cached scrape and can return a null id on cold
//   resolve), which loads the channel's live page inside the iframe
//   — same content, slightly less direct.
//
// "Open in YouTube" link in the header gives the user a deliberate
// out — some users want to cast to a TV via the YouTube app, or
// pinch-zoom the chat, or use the standard YouTube controls. We
// don't strip that affordance.

const PALETTE = {
  bg: "#091A10",
  warm: "#F0EDE6",
  sage: "#8FAF96",
  faint: "rgba(143,175,150,0.55)",
  border: "rgba(120,80,180,0.40)",
  cardBg: "rgba(120,80,180,0.14)",
};
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CHANNEL_LIVE_URL = "https://www.youtube.com/@WashingtonNationalCathedral/live";

// Watching the broadcast for at least this long counts as having
// prayed Morning Prayer (home-screen "prayed today" + the end-of-
// office rhythm slide). Mirrors the server gate in users.ts.
const MORNING_PRAYER_CREDIT_SECONDS = 180;

type NcmpMeta = {
  url: string;
  videoId: string | null;
  title: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
};

export default function NcmpWatchPage() {
  const [, setLocation] = useLocation();

  // Resolve today's video. Same cached endpoint the chooser + dashboard
  // already use, so a fresh visit here usually hits the server's
  // in-process cache (under 1ms).
  const { data: ncmpMeta, isLoading } = useQuery<NcmpMeta>({
    queryKey: ["/api/ncmp/today-meta"],
    queryFn: () => apiRequest("GET", "/api/ncmp/today-meta"),
    staleTime: 60 * 60_000,
  });

  // ── Watch-time tracking. Accumulate foreground seconds across
  // segments (pause when the app backgrounds — a paused video isn't
  // being prayed with), then commit one national-cathedral row on
  // leave. Same segment model as usePrayerSession; inlined here
  // because this surface also writes the morning-office flag, which
  // the shared hook doesn't.
  const startedAtRef = useRef<Date | null>(null);
  const segmentStartRef = useRef<number | null>(null);
  const accumulatedRef = useRef<number>(0);
  const committedRef = useRef(false);
  useEffect(() => {
    startedAtRef.current = new Date();
    segmentStartRef.current = Date.now();
    accumulatedRef.current = 0;
    committedRef.current = false;

    const closeSegment = () => {
      const s = segmentStartRef.current;
      if (s === null) return;
      const elapsedMs = Date.now() - s;
      if (elapsedMs > 0) accumulatedRef.current += elapsedMs / 1000;
      segmentStartRef.current = null;
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
        surface: "national-cathedral",
        durationSeconds: total,
        startedAt: startedAt.toISOString(),
        endedAt: new Date().toISOString(),
      }).catch(() => { /* best-effort */ });
      // Watched long enough to count as Morning Prayer — stamp the
      // local office-completed flag so the dashboard + rhythm slide
      // reflect it before the server history refetches. Morning side
      // because the cathedral broadcast IS Morning Prayer.
      if (total >= MORNING_PRAYER_CREDIT_SECONDS) {
        try {
          const now = new Date();
          const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
          localStorage.setItem(`phoebe:office-completed:morning:${dateKey}`, "1");
        } catch { /* private mode / quota — non-fatal */ }
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        closeSegment();
      } else if (document.visibilityState === "visible") {
        if (segmentStartRef.current === null) segmentStartRef.current = Date.now();
      }
    };
    const onPageHide = () => commit();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      commit();
    };
    // Mount-once: the watch session spans the whole page lifetime,
    // independent of when the video metadata resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build the embed src. The /embed/<videoId> form gives us inline
  // playback; if we don't have a videoId yet (cold meta resolve),
  // fall through to the channel's /live page, which redirects to
  // the active stream during broadcast and to the most-recent video
  // outside it. Autoplay on iOS requires the user to tap play —
  // we accept that constraint; the alternative (muted autoplay)
  // doesn't make sense for a prayer broadcast.
  //
  // Query params:
  //   playsinline=1 — iOS Safari respects this to keep the player
  //                   inline instead of taking over the screen.
  //   rel=0         — when this video ends, suggested videos stay
  //                   within the channel (less of a "you've been
  //                   ejected from prayer" feel).
  //   modestbranding=1 — minimize YouTube chrome.
  const embedSrc = useMemo(() => {
    if (ncmpMeta?.videoId) {
      const params = new URLSearchParams({
        playsinline: "1",
        rel: "0",
        modestbranding: "1",
      });
      return `https://www.youtube-nocookie.com/embed/${ncmpMeta.videoId}?${params.toString()}`;
    }
    // Channel-live iframe fallback — same URL the external open uses.
    return CHANNEL_LIVE_URL;
  }, [ncmpMeta?.videoId]);

  const openInYouTube = () => {
    const url = ncmpMeta?.url ?? CHANNEL_LIVE_URL;
    openExternal(url);
  };

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
      {/* Top bar — back + title + "Open in YouTube" escape hatch.
          Matches the office viewer's header rhythm (Back left, label
          centered, action right) so the surface reads as a Phoebe
          page, not a generic embed shell. paddingTop honors the iOS
          notch via env(safe-area-inset-top). */}
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
          📺 National Cathedral
        </span>
        <button
          type="button"
          onClick={openInYouTube}
          style={{
            justifySelf: "end",
            background: "none",
            border: "none",
            color: PALETTE.sage,
            fontFamily: FONT,
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
            whiteSpace: "nowrap",
          }}
        >
          YouTube ↗
        </button>
      </header>

      {/* Video frame. 16:9 aspect ratio via padding-bottom trick so
          the iframe sizes correctly inside the flex column without
          needing a fixed height. Black background while loading so
          the gap before the player paints reads as "video loading"
          rather than "broken layout." */}
      <main
        style={{
          flex: 1,
          padding: "12px 16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            paddingBottom: "56.25%", // 16:9
            background: "#000",
            borderRadius: 16,
            overflow: "hidden",
            border: `1px solid ${PALETTE.border}`,
          }}
        >
          {isLoading && !ncmpMeta ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: PALETTE.faint,
                fontSize: 13,
              }}
            >
              Loading today's broadcast…
            </div>
          ) : (
            <iframe
              key={embedSrc}
              src={embedSrc}
              title="National Cathedral Morning Prayer"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                border: "none",
              }}
            />
          )}
        </div>

        {/* Small copy beneath the player — sets the context for users
            who land here without prior knowledge of the broadcast. */}
        <div>
          <p
            style={{
              fontSize: 13,
              color: PALETTE.warm,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Live every weekday at 7 AM ET from the Washington National Cathedral. Today's recording stays available until tomorrow's broadcast.
          </p>
          {ncmpMeta?.title && (
            <p
              style={{
                fontSize: 12,
                color: PALETTE.sage,
                margin: "8px 0 0",
                fontStyle: "italic",
              }}
            >
              {ncmpMeta.title}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
