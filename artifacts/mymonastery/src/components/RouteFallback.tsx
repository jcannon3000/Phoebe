// ─── The leaf loading screen ─────────────────────────────────────────────
//
// What every lazy route shows while its chunk arrives — and what a video
// course shows on iOS while it hands itself to the reader (owner, 2026-09-19:
// "If there needs to be a loading splash using a leaf loading splash").
//
// It lives here rather than in App.tsx because a PAGE needs it, and a page
// importing App would close a circle (App imports the pages). One copy, so
// two screens meant to look alike cannot drift apart.

import splashForestPath from "@/assets/splash/forest-path.jpg";

export function RouteFallback() {
  return (
    <div
      style={{
        position: "fixed", inset: 0, minHeight: "var(--app-dvh)", background: "#091A10",
        isolation: "isolate", overflow: "hidden",
      }}
    >
      <img
        src={splashForestPath}
        alt=""
        aria-hidden
        decoding="async"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", zIndex: -1, opacity: 0.55,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, zIndex: -1,
          background: "linear-gradient(180deg, rgba(8,18,12,calc(0.62 * var(--bg-wash, 1))) 0%, rgba(8,18,12,calc(0.78 * var(--bg-wash, 1))) 100%)",
        }}
      />
      {/* Same size, same 64px-from-the-bottom placement as the office veil's
          spinner, so it does not jump when the deck takes over. */}
      <div
        aria-hidden
        className="animate-spin"
        style={{
          position: "absolute", bottom: 64, left: "50%", marginLeft: -11,
          width: 22, height: 22, borderRadius: "50%",
          border: "2px solid rgba(143,175,150,0.25)",
          borderTopColor: "rgba(143,175,150,0.85)",
        }}
      />
    </div>
  );
}
