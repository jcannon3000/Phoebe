/**
 * In-app reader for the VTS Dean's Commentary — one paragraph per slide.
 * Owner: "make sure the ui is like the offices, there some significant
 * differences for no reason" — this now shares the Daily Office
 * slideshow's actual header layout (← Back / centered title pill / X
 * close), color tokens, animated backdrop, and body typography
 * (bcp-daily-office.tsx), rather than a separately-invented look. Still a
 * lightweight standalone build, not a reuse of that file's liturgical
 * engine — the commentary has nothing in common with an office beyond
 * the visual language.
 *
 * Text comes from api-server's GET /api/vts/today-text, which scrapes and
 * caches today's commentary body server-side (VTS gave permission to bring
 * the text into Phoebe rather than just linking out — see that route for
 * the scraping notes). If scraping ever comes back empty (site markup
 * changed, fetch failure), this falls back to a single "Read on VTS's
 * site" card rather than showing a broken reader.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { apiRequest } from "@/lib/queryClient";
import { markVtsRead } from "@/lib/cacReadState";
import { openExternal } from "@/lib/openExternal";

// Same tokens bcp-daily-office.tsx uses (var()-backed so Office display
// settings — Paper mode, font choice — apply here too, not just there).
const BG = "var(--oh-bg2, #091A10)";
const WARM_TEXT = "var(--oh-ink, #F0EDE6)";
const FAINT_GREEN = "rgba(var(--ot-sage, 143,175,150),0.55)";
const BORDER = "rgba(var(--ot-mist, 200,212,192),0.15)";
const BUTTON_BG = "var(--oh-cta, #2D5E3F)";
const SPACE_GROTESK = "var(--office-font, 'Space Grotesk', system-ui, sans-serif)";

type VtsText = { title: string; url: string; paragraphs: string[] };

export default function VtsReadingPage() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const [markedRead, setMarkedRead] = useState(false);
  const { data, isLoading } = useQuery<VtsText>({
    queryKey: ["/api/vts/today-text"],
    queryFn: () => apiRequest("GET", "/api/vts/today-text"),
    staleTime: 10 * 60_000,
  });

  const close = () => setLocation("/");

  // Reading counts as read once you've actually stepped through it — same
  // "opened it" bar every other reflection source uses, not "landed on the
  // page." Fires once, the first time the index advances past the first
  // slide (or immediately for a one-paragraph piece, since there's nowhere
  // else to advance to).
  const markReadOnce = () => {
    if (markedRead) return;
    setMarkedRead(true);
    markVtsRead();
  };

  const paragraphs = data?.paragraphs ?? [];
  const total = paragraphs.length;

  const atStart = index === 0;
  const atEnd = index >= total - 1;
  const next = () => {
    if (index === 0) markReadOnce();
    if (!atEnd) setIndex((i) => i + 1);
    else close();
  };
  // Matches the office nav pill's Back button — disabled at the first
  // slide rather than closing (the X already owns "leave the reader").
  const prev = () => { if (!atStart) setIndex((i) => i - 1); };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, overflow: "hidden", fontFamily: SPACE_GROTESK }}>
      <AnimatedBackground base={BG} variant="subtle" fadeTop />

      {/* Top bar — Back / title pill / X. Mirrors the office's own header
          exactly (bcp-daily-office.tsx), not a separately-invented one. */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, pointerEvents: "none" }}>
        <div
          className="max-w-2xl mx-auto w-full px-5 pb-2"
          style={{
            display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12,
            pointerEvents: "auto", paddingTop: "max(1.5rem, env(safe-area-inset-top))",
          }}
        >
          <button
            type="button"
            onClick={close}
            style={{ color: FAINT_GREEN, fontSize: 13, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: SPACE_GROTESK }}
          >
            ← Back
          </button>
          <span
            className="rounded-full"
            style={{
              background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
              border: `1px solid ${BORDER}`, color: WARM_TEXT, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", padding: "6px 16px",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220,
            }}
          >
            🗞️ The Dean's Commentary
          </span>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              style={{ width: 32, height: 32, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(var(--ot-deep, 9,26,16), 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid ${BORDER}`, color: WARM_TEXT, cursor: "pointer", padding: 0 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </header>

      <div
        className="max-w-2xl mx-auto w-full"
        style={{
          position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center",
          padding: "max(96px, calc(env(safe-area-inset-top) + 76px)) 28px max(96px, calc(env(safe-area-inset-bottom) + 60px))",
        }}
        onClick={(e) => {
          // Tap the left third to go back, the rest to advance — no swipe
          // gesture engine needed for a single-column paragraph reader.
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          if (x < e.currentTarget.clientWidth / 3) prev(); else next();
        }}
      >
        {isLoading ? (
          <p style={{ color: FAINT_GREEN, fontSize: 15, fontFamily: SPACE_GROTESK }}>Loading…</p>
        ) : total === 0 ? (
          <div style={{ textAlign: "left" }}>
            <p style={{ color: FAINT_GREEN, fontSize: 19, lineHeight: 1.75, fontFamily: SPACE_GROTESK, marginBottom: 24 }}>
              Couldn't load today's commentary here — read it on VTS's own site instead.
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (data?.url) openExternal(data.url, { reader: true }); markReadOnce(); close(); }}
              className="rounded-full text-[14px] font-semibold"
              style={{ background: "rgba(46,107,64,0.9)", color: WARM_TEXT, border: "1px solid rgba(46,107,64,0.6)", padding: "12px 22px", cursor: "pointer", fontFamily: SPACE_GROTESK }}
            >
              Open on vts.edu
            </button>
          </div>
        ) : (
          <p style={{ color: WARM_TEXT, fontSize: 19, lineHeight: 1.75, fontFamily: SPACE_GROTESK, whiteSpace: "pre-line", margin: 0, textAlign: "left" }}>
            {paragraphs[index]}
          </p>
        )}
      </div>

      {/* Bottom nav pill — Back · position · Next/Done. Same floating pill
          the office uses (bcp-daily-office.tsx), not a plain text readout —
          owner: "there isn't a nav bar at the bottom." */}
      {total > 0 && (
        <nav
          aria-label="Reading navigation"
          style={{
            position: "fixed",
            left: "50%",
            bottom: "calc(env(safe-area-inset-bottom) + 16px)",
            transform: "translateX(-50%)",
            zIndex: 50,
            background: "rgba(var(--ot-deep, 9,26,16), 0.297)",
            backdropFilter: "blur(11.34px)",
            WebkitBackdropFilter: "blur(11.34px)",
            border: `1px solid ${BORDER}`,
            borderRadius: 999,
            padding: "8px 12px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35)",
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          <div className="flex items-center gap-4" style={{ minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={prev}
              disabled={atStart}
              className="rounded-full transition-opacity disabled:opacity-20"
              style={{
                color: WARM_TEXT,
                background: "transparent",
                border: `1px solid ${BORDER}`,
                padding: "6px 14px",
                fontSize: 12,
                fontFamily: SPACE_GROTESK,
                fontWeight: 600,
                cursor: atStart ? "default" : "pointer",
              }}
            >
              Back
            </button>
            {total > 1 && (
              <p
                style={{
                  color: FAINT_GREEN,
                  fontSize: 10,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  margin: 0,
                  whiteSpace: "nowrap",
                  flex: "0 0 auto",
                }}
              >
                {index + 1} of {total}
              </p>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-full transition-opacity"
              style={{
                background: BUTTON_BG,
                color: WARM_TEXT,
                border: "none",
                padding: "6px 16px",
                fontSize: 12,
                fontFamily: SPACE_GROTESK,
                fontWeight: 600,
                letterSpacing: "0.02em",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {atEnd ? "Done" : "Next"}
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
