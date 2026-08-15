/**
 * In-app reader for the VTS Dean's Commentary — one paragraph per slide,
 * left-aligned, same dark/Space-Grotesk visual language as the Daily
 * Office slideshow (bcp-daily-office.tsx), but a lightweight standalone
 * build rather than reusing that file's liturgical engine (which the
 * commentary has nothing in common with beyond the look).
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
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { markVtsRead } from "@/lib/cacReadState";
import { openExternal } from "@/lib/openExternal";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

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

  const next = () => {
    if (index === 0) markReadOnce();
    if (index < total - 1) setIndex((i) => i + 1);
    else close();
  };
  const prev = () => { if (index > 0) setIndex((i) => i - 1); };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: BG, display: "flex",
        flexDirection: "column", fontFamily: FONT, zIndex: 200,
      }}
    >
      <div className="flex items-center justify-between" style={{ padding: "max(18px, env(safe-area-inset-top)) 18px 12px" }}>
        {/* Progress dots — one per paragraph, filled up to the current slide. */}
        <div className="flex items-center gap-1.5" style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          {total > 0 && paragraphs.map((_, i) => (
            <div
              key={i}
              style={{
                height: 3, flex: 1, maxWidth: 40, borderRadius: 2,
                background: i <= index ? "rgba(110,180,130,0.85)" : "rgba(143,175,150,0.2)",
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          style={{ marginLeft: 14, background: "none", border: "none", color: SAGE, cursor: "pointer", padding: 4 }}
        >
          <X size={20} />
        </button>
      </div>

      <div
        className="flex-1 flex flex-col justify-center"
        style={{ padding: "0 24px", maxWidth: 640, margin: "0 auto", width: "100%" }}
        onClick={(e) => {
          // Tap the left third to go back, the rest to advance — no swipe
          // gesture engine needed for a single-column paragraph reader.
          const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
          if (x < e.currentTarget.clientWidth / 3) prev(); else next();
        }}
      >
        {isLoading ? (
          <p style={{ color: SAGE, fontSize: 15 }}>Loading…</p>
        ) : total === 0 ? (
          <div style={{ textAlign: "left" }}>
            <p style={{ color: SAGE, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 10 }}>
              The Dean's Commentary
            </p>
            <p style={{ color: WARM, fontSize: 17, lineHeight: 1.6, marginBottom: 24 }}>
              Couldn't load today's commentary here — read it on VTS's own site instead.
            </p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (data?.url) openExternal(data.url, { reader: true }); markReadOnce(); close(); }}
              className="rounded-full text-[14px] font-semibold"
              style={{ background: "rgba(46,107,64,0.9)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", padding: "12px 22px", cursor: "pointer" }}
            >
              Open on vts.edu
            </button>
          </div>
        ) : (
          <div style={{ textAlign: "left" }}>
            {index === 0 && (
              <p style={{ color: SAGE, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 12 }}>
                The Dean's Commentary{data?.title ? ` · ${data.title}` : ""}
              </p>
            )}
            <p style={{ color: WARM, fontSize: 19, lineHeight: 1.65, whiteSpace: "pre-line", margin: 0 }}>
              {paragraphs[index]}
            </p>
          </div>
        )}
      </div>

      {total > 1 && (
        <div className="flex items-center justify-between" style={{ padding: "0 18px max(18px, env(safe-area-inset-bottom))" }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            disabled={index === 0}
            aria-label="Previous"
            style={{ background: "none", border: "none", color: index === 0 ? "rgba(143,175,150,0.25)" : SAGE, cursor: index === 0 ? "default" : "pointer", padding: 8 }}
          >
            <ChevronLeft size={22} />
          </button>
          <p style={{ color: "rgba(143,175,150,0.4)", fontSize: 12 }}>{index + 1} / {total}</p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label={index === total - 1 ? "Finish" : "Next"}
            style={{ background: "none", border: "none", color: SAGE, cursor: "pointer", padding: 8 }}
          >
            <ChevronRight size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
