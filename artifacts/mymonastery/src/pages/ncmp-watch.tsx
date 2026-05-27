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
//   The old flow fired a fixed-duration prayer-session POST on tap
//   ("the user opened the cathedral video, credit them ~20 min") and
//   then let the external page run. We keep the same log here on
//   mount — the engagement event is "they opened the broadcast" —
//   so the metrics dashboard sees the same surface = "national-
//   cathedral" rows it did before. Anti-cheat (5s floor + 60min cap)
//   lives server-side and the cathedral surface is on the floor-
//   bypass list so a quick-tap-away still counts.
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

  // Best-effort prayer-session log — fire once on mount. The cathedral
  // surface is exempt from the server's 5s floor (see prayer-sessions
  // route) so a quick-tap-away from this page still records. Wrapped
  // in a ref guard because StrictMode double-invokes effects in dev
  // and we don't want two rows per visit.
  const loggedRef = useRef(false);
  useEffect(() => {
    if (loggedRef.current) return;
    loggedRef.current = true;
    const now = new Date();
    const seconds = ncmpMeta?.durationSeconds && ncmpMeta.durationSeconds > 0
      ? ncmpMeta.durationSeconds
      : 20 * 60;
    apiRequest("POST", "/api/prayer-sessions", {
      surface: "national-cathedral",
      durationSeconds: seconds,
      startedAt: now.toISOString(),
      endedAt: new Date(now.getTime() + seconds * 1000).toISOString(),
    }).catch(() => { /* non-fatal */ });
    // We log even on the loading flicker — the engagement event is
    // "opened the page," not "watched the video." If the user
    // immediately backs out, server's floor-bypass list keeps the
    // row; if they stay through, the duration credit is the same.
  }, [ncmpMeta?.durationSeconds]);

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
