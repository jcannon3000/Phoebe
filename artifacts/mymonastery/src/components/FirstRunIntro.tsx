// First-run intro — the splash a brand-new guest sees ONCE, before the home.
//
// Styled in the app's "frosted + leaves" language (a single leaf backdrop with
// frosted-glass cards floating over it, Space Grotesk throughout) so it reads as
// the same surface as the course pages / contemplation. A short, calm slideshow
// (tap / arrow-key to advance) that orients them to the two things that make the
// rhythm their own — you can pray at different LENGTHS (the full Office, a
// shorter Devotion, or just the Psalms) and in different MEDIUMS (read, listen,
// or watch) — then ends on a choice: Start here (into the time-appropriate
// office) or Skip for now (straight to the home).
//
// Shown once; the caller stamps the seen-flag when onStart/onSkip fires.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// The shared frosted-glass card (matches CoursePage / contemplation).
const CARD = {
  background: "rgba(9,26,16,0.46)",
  backdropFilter: "blur(11.34px)",
  WebkitBackdropFilter: "blur(11.34px)",
  border: "1px solid rgba(46,107,64,0.4)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
} as const;

type Slide = { eyebrow: string; title: string; body: string };

const SLIDES: Slide[] = [
  {
    eyebrow: "Welcome",
    title: "A daily habit of prayer",
    body: "Phoebe carries a simple rhythm and walks you through it, one practice at a time. Here's how to make it your own.",
  },
  {
    eyebrow: "Choose your length",
    title: "As deep as you like",
    body: "Pray the full Daily Office, a shorter Devotion, or just the Psalms — and sit in silence for a few minutes or many. You set the depth.",
  },
  {
    eyebrow: "Choose your medium",
    title: "However you pray best",
    body: "Read it on the page, listen to it, or watch it. The same prayer, in whatever form meets you where you are.",
  },
];

export function FirstRunIntro({
  officeLabel,
  onStart,
  onSkip,
}: {
  /** e.g. "Evening Prayer" — what the "Start" button launches. */
  officeLabel: string;
  onStart: () => void;
  onSkip: () => void;
}) {
  const total = SLIDES.length + 1; // teaching slides + a final choice slide
  const [i, setI] = useState(0);
  const isChoice = i === total - 1;
  // One leaf backdrop for the whole intro (frosted cards float over it), like
  // the course pages — not a per-slide swap.
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  const next = () => setI((n) => Math.min(total - 1, n + 1));
  const prev = () => setI((n) => Math.max(0, n - 1));

  // Desktop keyboard nav — ArrowRight/ArrowLeft step the teaching slides (the
  // choice slide needs an explicit Start/Skip tap). Bound once.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); setI((n) => Math.min(total - 1, n + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // Split-tap advance/back on the teaching slides only (the choice card's
  // buttons own the taps there). Ignore taps on buttons/links.
  const swipeStartX = useRef<number | null>(null);
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isChoice) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a")) return;
    const w = e.currentTarget.clientWidth;
    if (e.clientX > w / 2) next(); else prev();
  };

  return (
    <div
      onClick={onTap}
      onTouchStart={(e) => { swipeStartX.current = e.touches[0]!.clientX; }}
      onTouchEnd={(e) => {
        if (isChoice || swipeStartX.current == null) return;
        const dx = e.changedTouches[0]!.clientX - swipeStartX.current;
        swipeStartX.current = null;
        if (Math.abs(dx) > 50) { if (dx < 0) next(); else prev(); }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "#0C1F12",
        isolation: "isolate",
        cursor: isChoice ? "default" : "pointer",
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
        paddingTop: "var(--safe-top, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {/* Leaf backdrop + green wash — frosted cards float over it. */}
      {leaf && (
        <>
          <img src={leaf} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.42, zIndex: -1 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.5) 0%, rgba(8,22,15,0.66) 45%, rgba(8,22,15,0.85) 100%)" }} />
        </>
      )}

      {/* Skip — always available, top-right. */}
      <div className="flex justify-end px-5 pt-4">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSkip(); }}
          style={{ background: "none", border: "none", color: "rgba(200,212,192,0.72)", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: 6 }}
        >
          Skip
        </button>
      </div>

      {/* Body — one frosted card, content swaps per slide. */}
      <div className="flex-1 flex flex-col items-center justify-center px-6" style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
            className="w-full rounded-3xl px-6 py-8 text-center"
            style={{ ...CARD }}
          >
            {isChoice ? (
              <>
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", margin: 0 }}>
                  Begin
                </p>
                <h2 style={{ color: WARM, fontFamily: FONT, fontSize: 25, fontWeight: 700, lineHeight: 1.25, margin: "14px 0 10px" }}>
                  Start with a few minutes now
                </h2>
                <p style={{ color: "rgba(200,212,192,0.82)", fontFamily: FONT, fontSize: 15, lineHeight: 1.6, margin: "0 0 26px" }}>
                  Pray {officeLabel} together with Phoebe — or skip for now and begin whenever you're ready.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 320, margin: "0 auto" }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onStart(); }}
                    style={{ padding: "16px", borderRadius: 16, background: "#8FAF96", border: "none", color: "#0f2417", fontSize: 17, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}
                  >
                    Start {officeLabel} →
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSkip(); }}
                    style={{ padding: "13px", borderRadius: 14, background: "transparent", border: "none", color: "rgba(200,212,192,0.72)", fontSize: 15, fontFamily: FONT, cursor: "pointer" }}
                  >
                    Skip for now
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", margin: 0 }}>
                  {SLIDES[i]!.eyebrow}
                </p>
                <h2 style={{ color: WARM, fontFamily: FONT, fontSize: 26, fontWeight: 700, lineHeight: 1.25, margin: "14px 0 14px" }}>
                  {SLIDES[i]!.title}
                </h2>
                <p style={{ color: "rgba(200,212,192,0.85)", fontFamily: FONT, fontSize: 16, lineHeight: 1.6, margin: 0 }}>
                  {SLIDES[i]!.body}
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots + hint */}
      <div className="flex flex-col items-center gap-2 pb-8">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: total }).map((_, d) => (
            <span
              key={d}
              style={{ width: d === i ? 18 : 6, height: 6, borderRadius: 3, background: d === i ? SAGE : "rgba(143,175,150,0.28)", transition: "width 0.3s, background 0.3s" }}
            />
          ))}
        </div>
        {!isChoice && (
          <p style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT, fontSize: 11, margin: "4px 0 0" }}>
            Tap to continue
          </p>
        )}
      </div>
    </div>
  );
}
