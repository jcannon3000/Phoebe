// ─── CAC Daily Reflection (beta, admin tools only) — slideshow ───────────────
//
// Owner (2026-08-01): read today's CAC meditation as a slideshow, like the
// BCP daily office — one paragraph per slide, a wide landscape photo behind
// each (lib/wideBackgrounds, web-only), tap left/right (or the arrow
// buttons) to move between them. Each paragraph is whitelist-sanitized HTML
// from the server (routes/cac.ts sanitizeInlineHtml) — a handful of inline
// tags, every attribute stripped except a scheme-validated href — so it's
// safe to render with dangerouslySetInnerHTML; nothing outside that
// whitelist can have survived the server-side pass.

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCacDailyReflection } from "@/lib/cacDailyReflection";
import { useBetaStatus } from "@/hooks/useDemo";
import { openExternal } from "@/lib/openExternal";
import { isNativeShell } from "@/lib/isNativeShell";
import { WIDE_PHOTOS } from "@/lib/wideBackgrounds";
import { markCacRead } from "@/lib/cacReadState";
import { CAC, CacButton } from "@/lib/cacTheme";

type Slide = { kind: "title" } | { kind: "paragraph"; html: string } | { kind: "end" };

export default function CacReflectionPage() {
  const { isAdmin } = useBetaStatus();
  const { data, isLoading } = useCacDailyReflection();
  const [, setLocation] = useLocation();
  const [idx, setIdx] = useState(0);

  const slides: Slide[] = useMemo(() => {
    const paragraphs = data?.paragraphs ?? [];
    if (paragraphs.length === 0) return [];
    return [
      { kind: "title" },
      ...paragraphs.map((html): Slide => ({ kind: "paragraph", html })),
      { kind: "end" },
    ];
  }, [data?.paragraphs]);

  // One wide landscape per slide (web only — native has no /wide bundle),
  // a different photo each time but stable across re-renders for this visit.
  const photos = useMemo(() => {
    if (isNativeShell() || WIDE_PHOTOS.length === 0 || slides.length === 0) return [];
    const start = Math.floor(Math.random() * WIDE_PHOTOS.length);
    return slides.map((_, i) => WIDE_PHOTOS[(start + i) % WIDE_PHOTOS.length]!);
  }, [slides.length]);

  // Opening the slideshow (with real content loaded) counts as reading it —
  // same tracker the rest of the app's daily-reflection cards use, so the
  // home card's ✓ and any other CAC-reflection surface flips immediately.
  useEffect(() => {
    if ((data?.paragraphs?.length ?? 0) > 0) markCacRead();
  }, [data?.paragraphs]);

  const total = slides.length;
  const current = slides[idx];
  const photo = photos[idx] ?? null;
  const next = () => setIdx((i) => Math.min(i + 1, total - 1));
  const prev = () => setIdx((i) => Math.max(i - 1, 0));
  const close = () => setLocation("/cac-home");

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#091A10" }}>
        <p className="text-sm" style={{ color: CAC.inkMuted }}>This is a beta feature — not open yet.</p>
      </div>
    );
  }

  if (isLoading || total === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#091A10" }}>
        <p className="text-sm" style={{ color: CAC.inkMuted }}>
          {isLoading ? "Loading today's reflection…" : "We couldn't load today's reflection just now."}
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden" style={{ background: "#1A1410" }}>
      {/* Backdrop — wide landscape photo, cross-fades per slide. */}
      <div className="absolute inset-0">
        {photo ? (
          <img key={photo} src={photo} alt="" className="h-full w-full object-cover" style={{ animation: "cac-slide-fade 700ms ease-out" }} />
        ) : null}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(20,15,10,0.55) 0%, rgba(20,15,10,0.35) 40%, rgba(20,15,10,0.75) 100%)" }} />
      </div>
      <style>{`@keyframes cac-slide-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>

      {/* Header — progress dots + close. */}
      <div className="relative z-10 flex items-center gap-3 px-5 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        <div className="flex flex-1 gap-1.5">
          {slides.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= idx ? CAC.gold : "rgba(255,255,255,0.25)" }} />
          ))}
        </div>
        <button onClick={close} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80" style={{ background: "rgba(0,0,0,0.35)", color: "#F5EFE0" }}>
          <X size={16} />
        </button>
      </div>

      {/* Tap zones — left/right of the slide advance/retreat. */}
      <button aria-label="Previous" onClick={prev} disabled={idx === 0} className="absolute left-0 top-0 z-[5] h-full w-1/3 cursor-default disabled:cursor-default" style={{ background: "transparent" }} />
      <button aria-label="Next" onClick={next} disabled={idx === total - 1} className="absolute right-0 top-0 z-[5] h-full w-1/3 cursor-default disabled:cursor-default" style={{ background: "transparent" }} />

      {/* Slide content. */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
        {current?.kind === "title" && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: CAC.gold, fontFamily: CAC.label }}>
              Daily Meditation
            </p>
            <h1 className="mt-3 max-w-lg text-3xl font-bold leading-tight" style={{ color: "#F5EFE0", fontFamily: CAC.serif }}>
              {data?.title || "Today's Reflection"}
            </h1>
            <p className="mt-4 text-[13px]" style={{ color: "rgba(245,239,224,0.75)" }}>
              Center for Action and Contemplation
            </p>
          </>
        )}

        {current?.kind === "paragraph" && (
          <p
            className="max-w-xl text-[19px] leading-relaxed [&_a]:font-semibold [&_a]:no-underline [&_a]:text-[#F2C078]"
            style={{ color: "#F5EFE0", fontFamily: CAC.serif }}
            // Safe: current.html is whitelist-sanitized HTML from the server
            // (sanitizeInlineHtml) — see the note at the top of this file.
            dangerouslySetInnerHTML={{ __html: current.html }}
          />
        )}

        {current?.kind === "end" && (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: CAC.gold, fontFamily: CAC.label }}>
              Amen
            </p>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed" style={{ color: "rgba(245,239,224,0.85)" }}>
              From the Center for Action and Contemplation's daily meditations.
            </p>
            <div className="mt-6 flex items-center gap-3">
              {data?.url && (
                <CacButton variant="outline" onClick={() => openExternal(data.url, { reader: true })}>
                  Read on cac.org
                </CacButton>
              )}
              <CacButton onClick={close}>Done</CacButton>
            </div>
          </>
        )}
      </div>

      {/* Prev / Next controls. */}
      <div className="relative z-10 flex items-center justify-between px-6 pb-[calc(env(safe-area-inset-bottom,0px)+20px)]">
        <button
          onClick={prev}
          disabled={idx === 0}
          aria-label="Previous"
          className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-25"
          style={{ background: "rgba(0,0,0,0.35)", color: "#F5EFE0" }}
        >
          <ChevronLeft size={20} />
        </button>
        <p className="text-[11px]" style={{ color: "rgba(245,239,224,0.6)", fontFamily: CAC.label }}>
          {idx + 1} / {total}
        </p>
        <button
          onClick={next}
          disabled={idx === total - 1}
          aria-label="Next"
          className="flex h-11 w-11 items-center justify-center rounded-full transition-opacity hover:opacity-90 disabled:opacity-25"
          style={{ background: "rgba(0,0,0,0.35)", color: "#F5EFE0" }}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}
