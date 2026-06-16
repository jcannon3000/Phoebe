import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

// ── /office/forward — Forward Movement's Daily Prayer, embedded inline ──────
//
// Forward Movement publishes the full Daily Office (Morning / Evening Prayer,
// Compline, etc.) as an Angular app at prayer.forwardmovement.org. It sends no
// X-Frame-Options / CSP frame-ancestors, so we can render it inline in an
// iframe rather than reconstructing + audio-aligning the office ourselves.
//
// Tradeoff (known): it's Forward Movement's own UI inside Phoebe — their
// theme, their navigation. We can't observe completion inside a cross-origin
// frame, so this surface doesn't log a prayer session. It's the canonical,
// always-current office with zero assembly drift.

const BG = "#091A10";
const SAGE = "#8FAF96";
const WARM = "#F0EDE6";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const FM_URL = "https://prayer.forwardmovement.org/";

export default function OfficeFmPage() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: BG,
        color: WARM,
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header — keeps a Phoebe way back out of Forward Movement's app. */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "max(0.9rem, calc(var(--safe-top) + 0.4rem)) 16px 8px",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          style={{ background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}
        >
          ← {t("common.back", { defaultValue: "Back" })}
        </button>
        <span style={{ fontSize: 12.5, color: "rgba(143,175,150,0.7)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {t("office_fm.title", { defaultValue: "Forward Movement · Daily Prayer" })}
        </span>
        <span style={{ width: 36, flexShrink: 0 }} />
      </header>

      {/* The embedded Daily Prayer app. White underlay so it doesn't flash
          dark while their (light-themed) SPA boots. */}
      <div style={{ position: "relative", flex: 1, background: "#ffffff" }}>
        {!loaded && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: BG,
              color: SAGE,
              fontSize: 14,
            }}
          >
            {t("office_fm.loading", { defaultValue: "Loading today's office…" })}
          </div>
        )}
        <iframe
          src={FM_URL}
          title="Forward Movement Daily Prayer"
          onLoad={() => setLoaded(true)}
          allow="autoplay; encrypted-media; fullscreen"
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        />
      </div>
    </div>
  );
}
