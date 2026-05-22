import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

// ── How to pray the Daily Office — six-slide instructional manual ────────────
//
// A practical walk-through of the 1979 BCP Daily Office. The earlier
// version of this deck leaned reflective (Merton, Keating, stabilitas);
// rewritten as a manual that names the parts in order and tells the
// reader what to do in each — Opening + Confession → Psalter →
// Lessons + Canticles → Prayers — plus one closing slide on pace,
// posture, and how to handle distraction. Reachable from /offices via
// the "How to pray these →" link; closes back to /offices so the user
// can begin morning or evening prayer right after.

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
    eyebrow: "THE SHAPE OF THE OFFICE",
    headline: "Four movements, twice a day.",
    body:
      "Morning Prayer and Evening Prayer share the same shape. You open with a sentence of Scripture and a confession, pray the appointed psalms, hear two short readings, and end with the Creed, the Lord's Prayer, and the collects. Eight to twelve minutes, top to bottom. Phoebe puts the words in order — you walk through them.",
  },
  {
    eyebrow: "1 · OPENING + CONFESSION",
    headline: "Begin in Scripture. Then confess.",
    body:
      "An Opening Sentence — a single verse — sets the season (a verse for Advent is different from one for Easter). Then a general Confession said together, followed by the Absolution. You're not announcing your arrival to God; you're remembering you've already arrived.",
  },
  {
    eyebrow: "2 · THE INVITATORY + PSALTER",
    headline: "Pray the Psalms.",
    body:
      "The Office begins its body with the Invitatory — usually the Venite (Psalm 95) or Christ our Passover — calling the assembly to worship. Then the Psalter: the psalms appointed for the day. The whole Psalter cycles through in about seven weeks. Read them aloud or silently. They are the Church's oldest prayer book.",
  },
  {
    eyebrow: "3 · LESSONS + CANTICLES",
    headline: "Hear, then sing back.",
    body:
      "Two short Scripture readings — one from the Old Testament, one from the New. Between and after them, you respond with a Canticle: the Te Deum, the Benedictus in the morning; the Magnificat or the Nunc dimittis in the evening. Read, then sing back. The Office is a conversation, not a monologue.",
  },
  {
    eyebrow: "4 · THE PRAYERS",
    headline: "Creed, Lord's Prayer, Collects.",
    body:
      "Say the Apostles' Creed (what the Church believes). The Lord's Prayer (what Christ taught us to say). The Suffrages, a short back-and-forth of call and response. Then the Collect of the Day, a collect for peace, and a collect for the morning or evening. End with intercessions for the world and a General Thanksgiving.",
  },
  {
    eyebrow: "HOW TO PRAY IT",
    headline: "A few small disciplines.",
    body:
      "Read at the pace you would speak to a friend — slow but not solemn. Sit, kneel, or stand; whichever helps you stay. When your mind wanders, don't restart — return to the next line. You don't have to feel anything for the Office to be working. Pray a Morning Office to begin the day, an Evening Office to give it back.",
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
