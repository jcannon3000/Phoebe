import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#091A10",
  card: "#0F2818",
  text: "#F0EDE6",
  sage: "#8FAF96",
  accent: "#C8D4C0",
  dim1: "#3A5C44",
  dim2: "#4E745A",
  dim3: "#638A6E",
  dim4: "#8FAF96",
  dim5: "#AAC4B0",
  border: "rgba(200,212,192,0.2)",
  font: "'Space Grotesk', sans-serif",
} as const;

// ─── Slide types ────────────────────────────────────────────────────────────
type Slide =
  | { kind: "title"; headline: string; sub: string }
  | { kind: "statement"; headline: string; body: string[] }
  | { kind: "stacked"; headline: string; items: string[]; tail?: string[] }
  | { kind: "progressive"; headline: string; lines: { text: string; color: string }[] }
  | {
      kind: "cards";
      headline: string;
      sub?: string;
      cards: { label: string; lines: string[] }[];
    }
  | { kind: "trellis"; above: string[]; featured: string; below: string }
  | { kind: "closing"; above: string[]; featured: string };

const SLIDES: Slide[] = [
  // 1 — Title
  {
    kind: "title",
    headline: "Phoebe",
    sub: "A place set apart for connection.",
  },

  // 2 — The problem (originally slide 3; opening slide skipped)
  {
    kind: "statement",
    headline:
      "Declining attendance, volunteering, and giving are not separate problems.",
    body: [
      "They are all downstream of the same thing: people are not forming real relationships with one another.",
      "Not because they do not want to, but because the structures that made it possible have quietly disappeared.",
    ],
  },

  // 3 — The insight
  {
    kind: "statement",
    headline:
      "People do not form bonds by attending a service or joining a directory.",
    body: [
      "They form them through consistent, small-group interaction over time. The same people. The same rhythm. Week after week. Year after year.",
      "Every rector knows this. The challenge is making it happen.",
    ],
  },

  // 4 — What that rhythm looks like
  {
    kind: "stacked",
    headline: "The Church has always known what this looks like.",
    items: [
      "Shared prayer.",
      "Letters sent between communities.",
      "Meals taken together on a rhythm.",
      "Lectio Divina.",
      "Intercession.",
    ],
    tail: [
      "These are not new ideas. They are the Church's oldest inheritance. They formed people for centuries.",
    ],
  },

  // 5 — What changed
  {
    kind: "statement",
    headline:
      "What has changed is not their value. It is how hard they have become to sustain.",
    body: [
      "Schedules do not align. Communication is fragmented. There is no shared structure holding people to a rhythm together.",
      "The practices still exist. The wisdom is still there. The Church just needs something that makes them easy to return to.",
    ],
  },

  // 6 — What Phoebe does
  {
    kind: "stacked",
    headline: "Phoebe is built around three of these ancient practices.",
    items: ["Shared prayer.", "Letters.", "Gathering together on a rhythm."],
    tail: [
      "It does not reinvent them. It removes the friction that has made them so difficult to sustain in modern life.",
    ],
  },

  // 7 — How relationships actually form (progressive brightness)
  {
    kind: "progressive",
    headline: "How relationships actually form.",
    lines: [
      { text: "Shared practice builds consistency.", color: C.dim2 },
      { text: "Consistency builds familiarity.", color: C.dim3 },
      { text: "Familiarity opens into vulnerability.", color: C.dim4 },
      { text: "Vulnerability builds trust.", color: C.dim5 },
      { text: "Trust creates real connection.", color: C.accent },
      { text: "Real connection enlivens the parish.", color: C.text },
    ],
  },

  // 8 — Three layers, three purposes
  {
    kind: "cards",
    headline: "Each practice plays a different role in the life of a community.",
    cards: [
      {
        label: "Prayer",
        lines: [
          "The entry point.",
          "Low friction. No scheduling required. No vulnerability asked for yet.",
          "Just showing up together, returning to the same thing.",
          "This is where familiarity begins.",
        ],
      },
      {
        label: "Letters",
        lines: [
          "The depth layer.",
          "One letter, one person, once every two weeks.",
          "Reflection turns shared rhythm into personal knowledge of one another.",
          "People begin to be truly known.",
        ],
      },
      {
        label: "Gatherings",
        lines: [
          "Where trust takes root.",
          "Not one-off events. Intervals. Weekly, fortnightly, monthly.",
          "Phoebe holds the rhythm when life tries to disrupt it.",
          "The goal is that people keep meeting.",
        ],
      },
    ],
  },

  // 9 — The loop
  {
    kind: "statement",
    headline: "Each layer feeds the next.",
    body: [
      "Prayer creates the familiarity that makes letters feel natural. Letters build the trust that makes gatherings matter. Gatherings deepen the bonds that bring people back to prayer.",
      "Over time, the loop enlivens everything it touches.",
    ],
  },

  // 10 — What this recovers
  {
    kind: "statement",
    headline:
      "This is not a new program to add to an already full calendar.",
    body: [
      "It is the recovery of something the Church once did naturally — and has struggled to sustain in the fragmented pace of modern life.",
      "Phoebe gives that recovery a structure to grow through.",
    ],
  },

  // 11 — The image (Phoebe is the trellis.)
  {
    kind: "trellis",
    above: [
      "We do not create relationships from scratch.",
      "We nurture them through rhythm until they deepen on their own.",
    ],
    featured: "Phoebe is the trellis.",
    below: "The relationships are what grow through it.",
  },

  // 12 — The evidence
  {
    kind: "statement",
    headline: "The research is unambiguous.",
    body: [
      "The strongest predictor of religious engagement is the strength of relationships within a community.",
      "Parishes with deep relational bonds retain people, grow volunteers, and weather difficulty together.",
      "This is not a new insight. It is what the Church has always known. Phoebe is built to act on it.",
    ],
  },

  // 13 — Why the Church
  {
    kind: "stacked",
    headline: "The Church already has the raw material.",
    items: [
      "Shared meaning.",
      "A tradition of formation.",
      "People who genuinely want to be connected to one another.",
    ],
    tail: [
      "What it is missing is not vision. It is the structure that turns that desire into lived relational life.",
    ],
  },

  // 14 — Closing
  {
    kind: "closing",
    above: [
      "The monastic tradition gave us a rule of life: simple, repeatable rhythms that formed people over time.",
      "Phoebe is that rule of life made available to every parish.",
      "Not a feature set.",
    ],
    featured: "A recovery.",
  },
];

// ─── Slide renderers ─────────────────────────────────────────────────────────

function TitleSlide({ slide }: { slide: Extract<Slide, { kind: "title" }> }) {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-3xl mx-auto">
      <h1
        className="text-6xl md:text-7xl font-bold mb-6 tracking-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h1>
      <p
        className="text-xl md:text-2xl font-light"
        style={{ color: C.sage, fontFamily: C.font }}
      >
        {slide.sub}
      </p>
    </div>
  );
}

function StatementSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "statement" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full">
      <h2
        className="text-3xl md:text-4xl font-semibold mb-10 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h2>
      <div className="space-y-6">
        {slide.body.map((p, i) => (
          <p
            key={i}
            className="text-lg md:text-xl leading-relaxed font-light"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

function StackedSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "stacked" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full">
      <h2
        className="text-3xl md:text-4xl font-semibold mb-10 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h2>
      <div className="space-y-4 mb-10">
        {slide.items.map((item, i) => (
          <p
            key={i}
            className="text-xl md:text-2xl font-light"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            {item}
          </p>
        ))}
      </div>
      {slide.tail && (
        <div className="space-y-4 pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
          {slide.tail.map((t, i) => (
            <p
              key={i}
              className="text-base md:text-lg leading-relaxed font-light italic"
              style={{ color: "rgba(143,175,150,0.75)", fontFamily: C.font }}
            >
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressiveSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "progressive" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full">
      <h2
        className="text-3xl md:text-4xl font-semibold mb-12 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h2>
      <div className="space-y-5">
        {slide.lines.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.4 }}
            className="text-xl md:text-2xl font-light leading-relaxed"
            style={{ color: line.color, fontFamily: C.font }}
          >
            {line.text}
          </motion.p>
        ))}
      </div>
    </div>
  );
}

function CardsSlide({ slide }: { slide: Extract<Slide, { kind: "cards" }> }) {
  return (
    <div className="max-w-6xl mx-auto w-full">
      <h2
        className="text-2xl md:text-3xl font-semibold mb-10 leading-tight text-center"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {slide.cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.4 }}
            className="rounded-2xl p-7"
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
            }}
          >
            <p
              className="text-xs font-bold uppercase tracking-widest mb-5"
              style={{ color: C.sage, fontFamily: C.font }}
            >
              {card.label}
            </p>
            <div className="space-y-3">
              {card.lines.map((line, j) => (
                <p
                  key={j}
                  className="text-sm md:text-base leading-relaxed font-light"
                  style={{ color: C.text, fontFamily: C.font }}
                >
                  {line}
                </p>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function TrellisSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "trellis" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full text-center">
      <div className="space-y-4 mb-10">
        {slide.above.map((line, i) => (
          <p
            key={i}
            className="text-lg md:text-xl font-light leading-relaxed"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            {line}
          </p>
        ))}
      </div>
      <motion.p
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="text-4xl md:text-5xl font-semibold mb-8 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.featured}
      </motion.p>
      <p
        className="text-lg md:text-xl font-light"
        style={{ color: C.sage, fontFamily: C.font }}
      >
        {slide.below}
      </p>
    </div>
  );
}

function ClosingSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "closing" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full text-center">
      <div className="space-y-5 mb-16">
        {slide.above.map((line, i) => (
          <p
            key={i}
            className="text-lg md:text-xl font-light leading-relaxed"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            {line}
          </p>
        ))}
      </div>
      <motion.p
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
        className="text-5xl md:text-6xl font-bold tracking-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.featured}
      </motion.p>
    </div>
  );
}

function renderSlide(slide: Slide) {
  switch (slide.kind) {
    case "title":
      return <TitleSlide slide={slide} />;
    case "statement":
      return <StatementSlide slide={slide} />;
    case "stacked":
      return <StackedSlide slide={slide} />;
    case "progressive":
      return <ProgressiveSlide slide={slide} />;
    case "cards":
      return <CardsSlide slide={slide} />;
    case "trellis":
      return <TrellisSlide slide={slide} />;
    case "closing":
      return <ClosingSlide slide={slide} />;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ChurchDeck() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, SLIDES.length - 1)),
    [],
  );
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        setLocation("/dashboard");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, setLocation]);

  const slide = SLIDES[index];

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: C.bg }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-100"
          style={{ color: C.sage, opacity: 0.75 }}
        >
          <X size={16} />
          Close
        </button>
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className="rounded-full transition-all"
              style={{
                width: i === index ? 20 : 6,
                height: 6,
                background:
                  i <= index ? C.sage : "rgba(200,212,192,0.2)",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
        <span
          className="text-xs tabular-nums"
          style={{ color: C.sage, opacity: 0.6 }}
        >
          {index + 1} / {SLIDES.length}
        </span>
      </div>

      {/* Slide */}
      <div className="flex-1 flex items-center justify-center px-8 md:px-16 py-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            {renderSlide(slide)}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between px-8 pb-8 pt-2">
        <button
          onClick={prev}
          disabled={index === 0}
          className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-20"
          style={{ color: C.sage }}
        >
          <ChevronLeft size={18} />
          Back
        </button>
        <button
          onClick={next}
          disabled={index === SLIDES.length - 1}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity disabled:opacity-30"
          style={{ background: "#2D5E3F", color: C.text }}
        >
          {index === SLIDES.length - 1 ? "End" : "Next"}
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
