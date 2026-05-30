import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";
import { openExternal } from "@/lib/openExternal";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import {
  FDD_TODAY_URL, markFddRead,
  SSJE_TODAY_URL, markSsjeRead,
  CAC_TODAY_URL, markCacRead,
} from "@/lib/cacReadState";

// ── /menu/reflections/:source — read all of today's reflections ─────────────
//
// One surface for today's reflections from across the church. A segmented
// switcher flips between Forward Day by Day, SSJE, and CAC — CAC last, because
// cac.org sends X-Frame-Options and can't be embedded inline. FDD + SSJE set no
// framing restrictions, so they render in an <iframe>; CAC shows today's
// scraped title with a "Read now" CTA into the in-app browser. A bottom bar
// offers Back (to the Reflections menu) and Journal. The slideshows' animated
// gradient drifts behind it all.
//
// :source picks the starting tab — "fdd" | "ssje" | "cac", or "all" to open at
// the first reflection. Mirrors the visual language of prayer-mode's
// ReflectionSlide, minus the slideshow-continue plumbing.

const BG = "#0C1F12";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Source = "fdd" | "ssje" | "cac";

const TABS: Array<{ key: Source; emoji: string; short: string; full: string }> = [
  { key: "fdd", emoji: "📔", short: "Forward", full: "Forward Day by Day" },
  { key: "ssje", emoji: "✍🏽", short: "SSJE", full: "Brother, Give Us a Word" },
  // CAC last — it can't be framed, so it's the "Read now" card at the end.
  { key: "cac", emoji: "🌵", short: "CAC", full: "CAC Daily Meditation" },
];

export default function ReflectionReadPage() {
  const [, setLocation] = useLocation();
  const { source: rawSource } = useParams<{ source: string }>();
  const initial: Source =
    rawSource === "ssje" ? "ssje" : rawSource === "cac" ? "cac" : "fdd";

  const [active, setActive] = useState<Source>(initial);
  const tab = TABS.find((t) => t.key === active) ?? TABS[0];

  // Whichever reflection is in view counts as "read" — flips the home card /
  // dashboard module to "Read again", same as opening it in the browser did.
  useEffect(() => {
    if (active === "fdd") markFddRead();
    else if (active === "ssje") markSsjeRead();
    else markCacRead();
  }, [active]);

  // CAC can't be iframed, so we show today's scraped title + a Read-now CTA.
  // Title comes from the CAC daily-meditations RSS feed (falls back to a
  // generic label if the endpoint isn't reachable).
  const { data: cacMeta } = useQuery<{ title: string; url: string }>({
    queryKey: ["/api/cac/today-meta"],
    queryFn: () => apiRequest("GET", "/api/cac/today-meta"),
    enabled: active === "cac",
    staleTime: 30 * 60_000,
  });
  const cacTitle = cacMeta?.title ?? "";

  const url = active === "ssje" ? SSJE_TODAY_URL : active === "cac" ? CAC_TODAY_URL : FDD_TODAY_URL;

  // Edge-to-edge in the native app; a padded, rounded card on web.
  const fullBleed = isNativeShell();

  return (
    <div
      style={{
        // fixed + a z-index gives this its own stacking context, so the
        // AnimatedBackground (z-index:-1) paints behind the content.
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        background: BG,
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
      }}
    >
      <AnimatedBackground base={BG} variant="subtle" fadeTop />

      {/* Header — full name of the active reflection + a deliberate open-out. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 18px 8px", flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(143,175,150,0.8)", fontFamily: FONT }}>
          {tab.full}
        </span>
        <button
          type="button"
          onClick={() => openExternal(url)}
          style={{ background: "none", border: "none", color: SAGE, fontSize: 12, fontFamily: FONT, cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
        >
          Open ↗
        </button>
      </div>

      {/* Segmented switcher — flip through today's reflections, CAC last. */}
      <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", flexShrink: 0 }}>
        {TABS.map((tt) => {
          const isActive = tt.key === active;
          return (
            <button
              key={tt.key}
              type="button"
              onClick={() => setActive(tt.key)}
              className="transition-opacity hover:opacity-90 active:scale-[0.98]"
              style={{
                flex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "9px 8px",
                borderRadius: 999,
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                whiteSpace: "nowrap",
                color: isActive ? "#0C1F12" : "#A8C5A0",
                background: isActive ? "#A8C5A0" : "rgba(46,107,64,0.18)",
                border: `1px solid ${isActive ? "#A8C5A0" : "rgba(46,107,64,0.45)"}`,
              }}
            >
              <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>{tt.emoji}</span>
              {tt.short}
            </button>
          );
        })}
      </div>

      {/* Body — FDD/SSJE embed inline; CAC shows a Read-now card. */}
      {active !== "cac" ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            overflow: "hidden",
            background: "#fff",
            ...(fullBleed
              ? { borderTop: "1px solid rgba(46,107,64,0.3)", borderBottom: "1px solid rgba(46,107,64,0.3)" }
              : { margin: "0 12px", borderRadius: 16, border: "1px solid rgba(46,107,64,0.3)" }),
          }}
        >
          <iframe
            key={url}
            src={url}
            title={tab.full}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: "0 34px", textAlign: "center" }}>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(143,175,150,0.7)", margin: 0, fontFamily: FONT }}>
            Center for Action and Contemplation
          </p>
          {cacTitle ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: SAGE, margin: 0, fontFamily: FONT }}>
                Today’s Daily Meditation
              </p>
              <h2 style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.3, color: "#F0EDE6", margin: 0, fontFamily: FONT }}>
                {cacTitle}
              </h2>
            </div>
          ) : (
            <h2 style={{ fontSize: 25, fontWeight: 700, lineHeight: 1.3, color: "#F0EDE6", margin: 0, fontFamily: FONT }}>
              Today’s Daily Meditation
            </h2>
          )}
          <button
            type="button"
            onClick={() => { markCacRead(); openExternal(CAC_TODAY_URL); }}
            className="px-8 py-3.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: FONT, marginTop: 4 }}
          >
            Read now →
          </button>
        </div>
      )}

      {/* Bottom bar — Back to the Reflections menu + Journal. */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 10, padding: "14px 16px max(16px, env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onClick={() => setLocation("/menu/reflections")}
          className="px-7 py-3.5 rounded-full text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "rgba(46,107,64,0.25)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.5)", fontFamily: FONT }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => setLocation("/journal")}
          className="px-10 py-3.5 rounded-full text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: FONT }}
        >
          ✎ Journal
        </button>
      </div>
    </div>
  );
}
