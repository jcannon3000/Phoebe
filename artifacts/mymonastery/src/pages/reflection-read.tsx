import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { isNativeShell } from "@/lib/isNativeShell";
import { openExternal } from "@/lib/openExternal";
import {
  FDD_TODAY_URL, markFddRead,
  SSJE_TODAY_URL, markSsjeRead,
} from "@/lib/cacReadState";

// ── /menu/reflections/:source — inline reflection reader ────────────────────
//
// Opened from the Reflections menu when the reader taps Forward Day by Day or
// SSJE. Instead of ejecting to the in-app browser, we embed today's reflection
// INLINE in an <iframe> (FDD + SSJE set no framing restrictions) wrapped in
// Phoebe's dark chrome, with a bottom bar that offers Back (to the Reflections
// menu) and Journal (to write about what they just read). An "Open ↗" escape
// hatch in the header covers any device where the embed won't load. CAC is NOT
// routed here — cac.org sends X-Frame-Options and can't be framed, so the
// Reflections menu still opens CAC in the in-app browser.
//
// Mirrors the visual language of prayer-mode's ReflectionSlide, minus the
// slideshow-continue plumbing.

const BG = "#0C1F12";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export default function ReflectionReadPage() {
  const [, setLocation] = useLocation();
  const { source: rawSource } = useParams<{ source: string }>();
  const source: "fdd" | "ssje" = rawSource === "ssje" ? "ssje" : "fdd";

  const url = source === "ssje" ? SSJE_TODAY_URL : FDD_TODAY_URL;
  const heading = source === "ssje" ? "Brother, Give Us a Word" : "Forward Day by Day";

  // They're reading it now — flip the home card / dashboard module to
  // "Read again", same as opening it in the browser used to.
  useEffect(() => {
    if (source === "ssje") markSsjeRead();
    else markFddRead();
  }, [source]);

  // Edge-to-edge in the native app; a padded, rounded card on web where the
  // surrounding chrome has room.
  const fullBleed = isNativeShell();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        flexDirection: "column",
        background: BG,
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
      }}
    >
      {/* Header — what they're reading + a deliberate open-out escape. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 18px 10px", flexShrink: 0 }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: "rgba(143,175,150,0.8)", fontFamily: FONT }}>
          {heading}
        </span>
        <button
          type="button"
          onClick={() => openExternal(url)}
          style={{ background: "none", border: "none", color: SAGE, fontSize: 12, fontFamily: FONT, cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
        >
          Open ↗
        </button>
      </div>

      {/* Reflection body — embedded inline. */}
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
          title={heading}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
        />
      </div>

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
