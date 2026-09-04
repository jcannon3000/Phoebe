import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
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
// One surface for today's reflections from across the church. Forward Day by
// Day and SSJE embed inline (they set no framing restrictions); a segmented
// switcher plus a "Next" button walk through them in order: Forward → SSJE →
// CAC. CAC is last and can't be framed (cac.org sends X-Frame-Options), so
// reaching it — via Next from SSJE, or by tapping the CAC tab — opens it in a
// new page (the in-app browser) rather than rendering inline. A bottom bar
// offers Back (to the Reflections menu), Journal, and Next. The slideshows'
// animated gradient drifts behind it all.
//
// :source picks the starting reflection — "ssje" starts on SSJE; "fdd"/"all"/
// anything else starts on Forward Day by Day.

const BG = "#0C1F12";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type Source = "fdd" | "ssje" | "cac";
type Embeddable = "fdd" | "ssje";

const TABS: Array<{ key: Source; emoji: string; short: string; full: string; external?: boolean }> = [
  { key: "fdd", emoji: "📔", short: "Forward", full: "Forward Day by Day" },
  { key: "ssje", emoji: "✍🏽", short: "SSJE", full: "Brother, Give Us a Word" },
  // CAC last — it can't be framed, so its tab opens in a new page.
  { key: "cac", emoji: "🌵", short: "CAC", full: "CAC Daily Meditation", external: true },
];

export default function ReflectionReadPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { source: rawSource } = useParams<{ source: string }>();
  const initial: Embeddable = rawSource === "ssje" ? "ssje" : "fdd";

  const [active, setActive] = useState<Embeddable>(initial);
  const tab = TABS.find((t) => t.key === active) ?? TABS[0];
  const url = active === "ssje" ? SSJE_TODAY_URL : FDD_TODAY_URL;

  // Whichever reflection is in view counts as "read" — flips the home card /
  // dashboard module to "Read again", same as opening it in the browser did.
  useEffect(() => {
    if (active === "fdd") markFddRead();
    else markSsjeRead();
  }, [active]);

  // CAC can't be iframed, so it always opens in a new page (the in-app
  // browser) rather than rendering inline.
  // { reader: true } — matches every other CAC entry point. Without it this
  // opened through a SEPARATE native browser surface with its own cookie
  // storage, so cac.org's cookie-consent banner reappeared depending on which
  // screen the user tapped in from (owner report).
  const openCac = () => { markCacRead(); openExternal(CAC_TODAY_URL, { reader: true }); };

  // "Next" walks Forward → SSJE → CAC. The final step opens CAC in a new page.
  const goNext = () => {
    if (active === "fdd") setActive("ssje");
    else openCac();
  };
  const nextLabel = active === "fdd" ? `${t("reflection_read.next")} →` : "CAC ↗";

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
        paddingTop: "max(0.75rem, var(--safe-top))",
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
          onClick={() => openExternal(url, { reader: true })}
          style={{ background: "none", border: "none", color: SAGE, fontSize: 12, fontFamily: FONT, cursor: "pointer", padding: 0, whiteSpace: "nowrap" }}
        >
          {t("reflection_read.open")} ↗
        </button>
      </div>

      {/* Segmented switcher — Forward / SSJE inline, CAC opens in a new page. */}
      <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", flexShrink: 0 }}>
        {TABS.map((tt) => {
          const isActive = tt.key === active;
          return (
            <button
              key={tt.key}
              type="button"
              onClick={() => { if (tt.key === "cac") openCac(); else setActive(tt.key); }}
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
              {tt.short}{tt.external ? " ↗" : ""}
            </button>
          );
        })}
      </div>

      {/* Body — Forward / SSJE embed inline. Forward Day by Day ships a
          bright, light-only page; force it to dark mode (see the iframe
          filter below) so it doesn't glare inside the dark reader. SSJE is
          left untouched. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
          background: active === "fdd" ? BG : "#fff",
          ...(fullBleed
            ? { borderTop: "1px solid rgba(46,107,64,0.3)", borderBottom: "1px solid rgba(46,107,64,0.3)" }
            : { margin: "0 12px", borderRadius: 16, border: "1px solid rgba(46,107,64,0.3)" }),
        }}
      >
        <iframe
          key={url}
          src={url}
          title={tab.full}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", border: "none",
            // FDD has no dark theme — invert + hue-rotate flips its white page
            // to dark (whites → near-black, text → light) while keeping hues
            // roughly intact. The white iframe background inverts to black so
            // there's no flash before the page paints. Scoped to FDD only.
            ...(active === "fdd"
              ? { filter: "invert(1) hue-rotate(180deg)", background: "#fff" }
              : {}),
          }}
        />
      </div>

      {/* Bottom bar — Back · Journal · Next (Next advances to the next reflection). */}
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "14px 14px max(16px, env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onClick={() => setLocation("/menu/newsletters")}
          className="transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "none", border: "none", color: "#A8C5A0", fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "12px 8px", whiteSpace: "nowrap" }}
        >
          ← {t("common.back")}
        </button>
        <button
          type="button"
          onClick={goNext}
          className="px-7 py-3.5 rounded-full text-sm font-semibold tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98]"
          style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: FONT, whiteSpace: "nowrap" }}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
}
