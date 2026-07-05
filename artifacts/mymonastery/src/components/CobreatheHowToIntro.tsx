// CobreatheHowToIntro — a one-time, three-slide "how it works" shown to a
// first-time Co-Breather AFTER they tap Begin, before the breath starts. It
// names each part of the screen (outer ring = the breath + everyone's timer is
// synced; inner ring = progress to twelve + you can drag the circles/globe) and
// sets the contemplative frame (a picture of creation with each breath — let
// whatever rises in your heart be your prayer). Frosted-glass card over a leaf
// backdrop, Space Grotesk — the app's language. Tap / arrow-key to advance;
// the last slide's button (or Skip) hands off to the breath.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

const CARD = {
  background: "rgba(9,26,16,0.5)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(46,107,64,0.45)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
} as const;

type Slide = { eyebrow: string; title: string; body: string };

const SLIDES: Slide[] = [
  {
    eyebrow: "Breathing together",
    title: "The outer ring is your breath",
    body: "The outer ring rises as you breathe in and settles as you breathe out — just follow it. And it's synced: everyone praying right now shares the same timer, so you breathe together, as one.",
  },
  {
    eyebrow: "Twelve breaths",
    title: "The inner ring counts your prayer",
    body: "The inner ring fills with each breath — twelve make one full prayer. You can drag the circles and the globe anywhere on the screen that feels restful; they'll stay where you leave them.",
  },
  {
    eyebrow: "God's creation",
    title: "Let creation be your prayer",
    body: "With each breath you'll see a picture of God's creation to rest your eyes on. Let whatever rises in your heart as you look — wonder, thanks, grief, longing — be your prayer.",
  },
];

export function CobreatheHowToIntro({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const isLast = i === SLIDES.length - 1;
  const leaf = useMemo(() => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);

  // Desktop keyboard nav — ArrowRight advances (finishing on the last slide),
  // ArrowLeft steps back. Bound once; functional setI so no stale index.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); setI((n) => (n >= SLIDES.length - 1 ? (onDone(), n) : n + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setI((n) => Math.max(0, n - 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone]);

  const swipeStartX = useRef<number | null>(null);
  const advance = () => setI((n) => (n >= SLIDES.length - 1 ? (onDone(), n) : n + 1));
  const back = () => setI((n) => Math.max(0, n - 1));
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    const w = e.currentTarget.clientWidth;
    if (e.clientX > w / 2) advance(); else back();
  };

  return (
    <div
      onClick={onTap}
      onTouchStart={(e) => { swipeStartX.current = e.touches[0]!.clientX; }}
      onTouchEnd={(e) => {
        if (swipeStartX.current == null) return;
        const dx = e.changedTouches[0]!.clientX - swipeStartX.current;
        swipeStartX.current = null;
        if (Math.abs(dx) > 50) { if (dx < 0) advance(); else back(); }
      }}
      style={{
        position: "fixed", inset: 0, zIndex: 95, background: "#0C1F12",
        isolation: "isolate", cursor: "pointer", display: "flex", flexDirection: "column",
        fontFamily: FONT, paddingTop: "var(--safe-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {leaf && (
        <>
          <img src={leaf} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4, zIndex: -1 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.55) 0%, rgba(8,22,15,0.72) 45%, rgba(8,22,15,0.9) 100%)" }} />
        </>
      )}

      <div className="flex justify-end px-5 pt-4">
        <button type="button" onClick={(e) => { e.stopPropagation(); onDone(); }}
          style={{ background: "none", border: "none", color: "rgba(200,212,192,0.72)", fontSize: 14, fontWeight: 600, fontFamily: FONT, cursor: "pointer", padding: 6 }}>
          Skip
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6" style={{ width: "100%", maxWidth: 520, margin: "0 auto" }}>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4 }}
            className="w-full rounded-3xl px-6 py-8 text-center" style={{ ...CARD }}>
            <p style={{ color: SAGE, fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", margin: 0 }}>
              {SLIDES[i]!.eyebrow}
            </p>
            <h2 style={{ color: WARM, fontFamily: FONT, fontSize: 25, fontWeight: 700, lineHeight: 1.25, margin: "14px 0 14px" }}>
              {SLIDES[i]!.title}
            </h2>
            <p style={{ color: "rgba(200,212,192,0.85)", fontFamily: FONT, fontSize: 16, lineHeight: 1.6, margin: 0 }}>
              {SLIDES[i]!.body}
            </p>
            {isLast && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onDone(); }}
                style={{ marginTop: 26, padding: "15px 22px", borderRadius: 16, background: "#8FAF96", border: "none", color: "#0f2417", fontSize: 16.5, fontWeight: 700, fontFamily: FONT, cursor: "pointer" }}>
                Begin breathing →
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-col items-center gap-2 pb-8">
        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, d) => (
            <span key={d} style={{ width: d === i ? 18 : 6, height: 6, borderRadius: 3, background: d === i ? SAGE : "rgba(143,175,150,0.28)", transition: "width 0.3s, background 0.3s" }} />
          ))}
        </div>
        {!isLast && (
          <p style={{ color: "rgba(143,175,150,0.5)", fontFamily: FONT, fontSize: 11, margin: "4px 0 0" }}>Tap to continue</p>
        )}
      </div>
    </div>
  );
}
