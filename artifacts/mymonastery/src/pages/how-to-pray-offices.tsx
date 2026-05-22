import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

// ── How to pray the Daily Office — six-slide teaching deck ───────────────────
//
// A brief slideshow that frames the Daily Office not as a chore but as a
// vow of stability — the practice the Church has used to weather every
// turbulent century. Draws on Thomas Merton (the discipline of staying,
// the road that is already there) and Thomas Keating (prayer as consent,
// not as the achievement of a state), plus the Benedictine vow of
// stabilitas. Reachable from /offices via the "How to pray these →"
// link beneath the page subtitle; closes back to /offices so the user
// can begin the morning or evening office immediately after reading.

const BG = "#091A10";
const WARM_TEXT = "#F0EDE6";
const SAGE = "#8FAF96";
const SOFT_TEXT = "#C8D4C0";
const FAINT = "rgba(143,175,150,0.55)";
const BUTTON_BG = "#2D5E3F";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

interface Slide {
  eyebrow: string;
  headline: string;
  body: string;
  /** Optional attribution line under the body. */
  attribution?: string;
  /** Last slide swaps Next for a CTA button. */
  cta?: { label: string; href: string };
}

const SLIDES: Slide[] = [
  {
    eyebrow: "THE DAILY OFFICE",
    headline: "The Church's oldest daily prayer.",
    body:
      "For more than sixteen centuries, Christians have stopped twice a day to pray — morning and evening — in monasteries, in parishes, in kitchens. The Office has carried the faithful through plagues, exiles, and the long, ordinary middle. It still does.",
  },
  {
    eyebrow: "STABILITAS",
    headline: "A vow against the storm.",
    body:
      "Benedict's monks took a vow of stabilitas — the vow to return to the same place, the same prayer, the same hour. Thomas Merton called it the discipline of staying. The world will always pull you to keep moving; the Office is the practice of standing still.",
    attribution: "— after Thomas Merton",
  },
  {
    eyebrow: "ON FEELING NOTHING",
    headline: "You don't pray to feel anything.",
    body:
      "Thomas Keating taught that prayer is consent to God's presence — not the achievement of a state. The Office removes the burden of having to feel like praying. You show up. The words are already there. The feeling, if it comes, comes later.",
    attribution: "— after Thomas Keating",
  },
  {
    eyebrow: "WHEN YOU MISS A DAY",
    headline: "The Office holds.",
    body:
      "You will miss days. Don't let the missing become the practice. “I have no idea where I am going. I do not see the road ahead of me.” The Office is the road that was already there. Return to it tomorrow.",
    attribution: "— Thomas Merton, Thoughts in Solitude",
  },
  {
    eyebrow: "MORNING + EVENING",
    headline: "One sets the day. The other returns it.",
    body:
      "Pray a morning office to begin. An evening office to give the day back. The space between is sanctified by the bookends — not by trying. Two anchors. Twice a day. Every day you can.",
  },
  {
    eyebrow: "BEGIN",
    headline: "Pray today.",
    body:
      "The morning office takes about eight minutes. The evening, about the same. A daily reminder will keep the hour. You'll learn the rhythm by walking it.",
    cta: { label: "Pray today →", href: "/offices" },
  },
];

export default function HowToPrayOfficesPage() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const total = SLIDES.length;
  const slide = SLIDES[index]!;
  const isLast = index === total - 1;

  const next = useCallback(() => {
    setIndex((i) => Math.min(i + 1, total - 1));
  }, [total]);
  const prev = useCallback(() => {
    setIndex((i) => Math.max(i - 1, 0));
  }, []);
  const close = useCallback(() => {
    setLocation("/offices");
  }, [setLocation]);

  // Keyboard navigation — arrow keys advance, escape closes. Matches
  // features-deck / church-deck.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, close]);

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: BG, fontFamily: SPACE_GROTESK }}
    >
      {/* Top bar — close + slim dot progress + counter */}
      <div className="flex items-center justify-between gap-4 px-5 md:px-8 pt-4 md:pt-6 pb-2">
        <button
          onClick={close}
          aria-label="Close"
          className="text-sm transition-opacity hover:opacity-100 shrink-0"
          style={{ color: SAGE, opacity: 0.75, background: "transparent", border: "none", cursor: "pointer" }}
        >
          ✕ Close
        </button>

        <div className="hidden md:flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Go to slide ${i + 1}`}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 20 : 6,
                height: 6,
                background: i <= index ? SAGE : "rgba(200,212,192,0.2)",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
        </div>

        {/* Mobile progress — a slim bar that fills with the deck */}
        <div
          className="flex-1 h-0.5 rounded-full md:hidden"
          style={{ background: "rgba(200,212,192,0.15)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: SAGE }}
            animate={{ width: `${((index + 1) / total) * 100}%` }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        <span className="text-xs tabular-nums shrink-0" style={{ color: SAGE, opacity: 0.6 }}>
          {index + 1} / {total}
        </span>
      </div>

      {/* Slide */}
      <div className="flex-1 flex items-center justify-center px-6 md:px-16 py-4 md:py-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-2xl w-full text-center flex flex-col items-center"
            style={{ gap: 18 }}
          >
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: FAINT }}
            >
              {slide.eyebrow}
            </p>
            <h1
              className="text-[28px] md:text-[40px] font-bold leading-[1.15]"
              style={{ color: WARM_TEXT, letterSpacing: "-0.02em" }}
            >
              {slide.headline}
            </h1>
            <p
              className="text-[16px] md:text-[19px] leading-relaxed font-light"
              style={{ color: SOFT_TEXT, maxWidth: 560 }}
            >
              {slide.body}
            </p>
            {slide.attribution && (
              <p
                className="text-[12px] italic"
                style={{ color: FAINT, fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                {slide.attribution}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-6 md:px-10 pb-6 md:pb-8 pt-2">
        <button
          onClick={prev}
          disabled={index === 0}
          className="text-sm transition-opacity disabled:opacity-20"
          style={{
            color: SAGE,
            background: "transparent",
            border: "none",
            cursor: index === 0 ? "default" : "pointer",
            padding: "8px 4px",
          }}
        >
          ← Back
        </button>
        {isLast && slide.cta ? (
          <button
            onClick={() => setLocation(slide.cta!.href)}
            className="px-7 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: BUTTON_BG, color: WARM_TEXT, border: "1px solid rgba(46,107,64,0.6)" }}
          >
            {slide.cta.label}
          </button>
        ) : (
          <button
            onClick={next}
            className="px-7 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 active:scale-[0.98]"
            style={{ background: BUTTON_BG, color: WARM_TEXT, border: "1px solid rgba(46,107,64,0.6)" }}
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
