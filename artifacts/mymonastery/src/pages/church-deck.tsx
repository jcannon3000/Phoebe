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
  | { kind: "progressive"; headline?: string; lines: { text: string; color: string }[] }
  | { kind: "preview"; label?: string; headline: string; body: string[]; placeholder: string }
  | { kind: "closing"; above: string[]; featured: string };

// ─── Slides ─────────────────────────────────────────────────────────────────
const SLIDES: Slide[] = [
  // 1 — Title
  {
    kind: "title",
    headline: "Phoebe",
    sub: "A place set apart for connection.",
  },

  // 2 — The opening frame
  {
    kind: "statement",
    headline: "Your parish already has everything it needs.",
    body: [
      "People who want to be close to one another. A tradition of shared practice. Groups that already meet. Relationships that are already forming.",
      "The question is not how to build community from scratch. It is how to cultivate what is already there.",
    ],
  },

  // 3 — The real challenge
  {
    kind: "statement",
    headline: "Most parishes are good at Sunday.",
    body: [
      "The challenge is the days between, when most people don\u2019t have a way to engage with their faith community during their busy lives.",
      "Phoebe is built for those days.",
    ],
  },

  // 4 — What cultivating looks like
  {
    kind: "statement",
    headline: "Relationships deepen through small, consistent touchpoints.",
    body: [
      "A shared fast on Friday. A prayer for someone by name during the week. A passage read together before Sunday. A gathering that keeps happening even when life tries to disrupt it.",
      "These are not new ideas. They are the Church's oldest inheritance. Phoebe makes them easy to return to.",
    ],
  },

  // 5 — How relationships form
  {
    kind: "progressive",
    lines: [
      { text: "Shared prayer builds consistency.", color: C.dim1 },
      { text: "Consistency builds familiarity.", color: C.dim2 },
      { text: "Familiarity opens into vulnerability.", color: C.dim3 },
      { text: "Vulnerability builds trust.", color: C.dim5 },
      { text: "Trust deepens the community.", color: C.text },
    ],
  },

  // 6 — Prayer (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Not just a feed. A practice.",
    body: [
      "Intercession, fasting, and Lectio Divina held as guided experiences the community moves through together. You see who else is praying with you at the same hour. You know you are not alone.",
    ],
    placeholder: "Insert prayer practice screenshot",
  },

  // 7 — Intercession (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Prayer, held in common.",
    body: [
      "People share what they are carrying. Others respond, a word at a time. Low friction. Low vulnerability. The doorway into the life of the community.",
      "When someone submits a prayer request during the week, they arrive on Sunday already known.",
    ],
    placeholder: "Insert prayer requests screenshot",
  },

  // 8 — Fasting (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "A rhythm held together.",
    body: [
      "A group commits to a fast on a chosen day. A calendar invite goes out the night before. On the day, they see who is fasting alongside them. At the close, they share what nourished them instead.",
      "For groups fasting from meat, Phoebe tracks the water saved together. This week. This month. All time. A visible record of shared faithfulness.",
    ],
    placeholder: "Insert fast practice screenshot",
  },

  // 9 — Lectio Divina (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "The Sunday gospel, read together across the week.",
    body: [
      "Monday \u2014 a word or phrase that is speaking to you. Wednesday \u2014 what the passage is stirring in you. Friday \u2014 what it is calling you to do or to be.",
      "They arrive on Sunday having already sat with the same text together. The sermon lands differently. The conversation goes deeper.",
    ],
    placeholder: "Insert Lectio Divina screenshot",
  },

  // 10 — Letters (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Where friendship actually happens.",
    body: [
      "One letter. One person. Once every two weeks. Unhurried, reflective, one reader at a time. This is where familiarity turns into vulnerability and vulnerability into trust.",
      "People can write to anyone in their community or anyone at all. The correspondence builds a shared history neither could have written alone.",
    ],
    placeholder: "Insert letters screenshot",
  },

  // 11 — Gatherings (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Gatherings that actually repeat.",
    body: [
      "Suppers, study groups, prayer circles \u2014 held on an interval, not as one-off events. Phoebe keeps the rhythm through the weeks life tries to disrupt it.",
      "The parish calendar lives here too. Events the parish is already running get in front of people who are already engaged.",
    ],
    placeholder: "Insert gatherings screenshot",
  },

  // 12 — Home screen (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "One rhythm, held in one place.",
    body: [
      "Every person in the parish sees the same shape: what is happening this week, what is coming up, who is waiting for a reply. One surface, formed around the practices. Not another inbox to manage.",
    ],
    placeholder: "Insert home screen screenshot",
  },

  // 13 — What this builds
  {
    kind: "statement",
    headline: "Each practice feeds the next.",
    body: [
      "Prayer creates the familiarity that makes letters feel natural. Letters build the trust that makes gatherings matter. Gatherings deepen the bonds that bring people back to prayer.",
      "The parish calendar keeps everyone aware of what is already happening. The prayer request submitted on Wednesday breaks the ice on Sunday. The letter written on Friday deepens the conversation at the next gathering.",
      "Over time, the touchpoints between Sundays become the fabric of community life.",
    ],
  },

  // 14 — What this is not
  {
    kind: "statement",
    headline: "This is not a new program to add to an already full calendar.",
    body: [
      "The rector does not manage it. The parish does not moderate it. Adults use it to tend their own relationships within the community.",
      "Phoebe is the gate. What grows between people once they are inside belongs to them.",
    ],
  },

  // 15 — The research
  {
    kind: "statement",
    headline: "The research is unambiguous.",
    body: [
      "The strongest predictor of religious engagement is the strength of relationships within a community.",
      "Parishes with deep relational bonds retain people, grow volunteers, and weather difficulty together.",
      "This is not a new insight. It is what the Church has always known. Phoebe is built to act on it.",
    ],
  },

  // 16 — Who Phoebe is for
  {
    kind: "statement",
    headline: "For parishes that already have groups meeting.",
    body: [
      "Practices happening. People who want to be closer to one another.",
      "Phoebe does not ask you to build something new. It cultivates what is already there. It fills the space between Sundays with small acts of faithfulness that compound over time.",
    ],
  },

  // 17 — Closing
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
        className="text-5xl md:text-7xl font-bold mb-4 md:mb-6 tracking-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h1>
      <p
        className="text-lg md:text-2xl font-light"
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
        className="text-2xl md:text-4xl font-semibold mb-6 md:mb-10 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h2>
      <div className="space-y-4 md:space-y-6">
        {slide.body.map((p, i) => (
          <p
            key={i}
            className="text-base md:text-xl leading-relaxed font-light"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

function ProgressiveSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "progressive" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full flex flex-col items-center text-center">
      {slide.headline && (
        <h2
          className="text-2xl md:text-4xl font-semibold mb-6 md:mb-12 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.headline}
        </h2>
      )}
      <div className="space-y-3 md:space-y-5">
        {slide.lines.map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 + i * 0.12, duration: 0.4 }}
            className="text-lg md:text-2xl font-light leading-relaxed"
            style={{ color: line.color, fontFamily: C.font }}
          >
            {line.text}
          </motion.p>
        ))}
      </div>
    </div>
  );
}

function PreviewSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "preview" }>;
}) {
  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col md:flex-row items-center gap-6 md:gap-16">
      {/* Left: text content */}
      <div className="flex-1 min-w-0 md:max-w-[55%]">
        {slide.label && (
          <p
            className="text-[10px] font-bold uppercase tracking-[0.18em] mb-4"
            style={{ color: "rgba(143,175,150,0.45)" }}
          >
            {slide.label}
          </p>
        )}
        <h2
          className="text-2xl md:text-4xl font-semibold mb-6 md:mb-10 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.headline}
        </h2>
        <div className="space-y-4 md:space-y-6">
          {slide.body.map((p, i) => (
            <p
              key={i}
              className="text-base md:text-xl leading-relaxed font-light"
              style={{ color: C.sage, fontFamily: C.font }}
            >
              {p}
            </p>
          ))}
        </div>
      </div>

      {/* Right: screenshot placeholder */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="shrink-0 w-full md:w-[40%]"
      >
        <div
          className="flex items-center justify-center rounded-2xl px-6 py-20 md:py-32"
          style={{
            background: C.card,
            border: `1px solid rgba(200,212,192,0.25)`,
          }}
        >
          <p
            className="text-[13px] text-center italic"
            style={{ color: C.sage }}
          >
            {slide.placeholder}
          </p>
        </div>
      </motion.div>
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
      <div className="space-y-3 md:space-y-4 mb-6 md:mb-10">
        {slide.above.map((line, i) => (
          <p
            key={i}
            className="text-base md:text-xl font-light leading-relaxed"
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
        className="text-3xl md:text-5xl font-semibold leading-tight"
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
    case "progressive":
      return <ProgressiveSlide slide={slide} />;
    case "preview":
      return <PreviewSlide slide={slide} />;
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
  const isLast = index === SLIDES.length - 1;

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: C.bg }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 pt-4 md:pt-6 pb-2">
        <button
          onClick={() => setLocation("/dashboard")}
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-100 shrink-0"
          style={{ color: C.sage, opacity: 0.75 }}
        >
          <X size={16} />
          <span className="hidden md:inline">Close</span>
        </button>

        {/* Mobile: slim progress bar */}
        <div
          className="flex-1 h-0.5 rounded-full md:hidden"
          style={{ background: "rgba(200,212,192,0.15)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: C.sage }}
            animate={{
              width: `${((index + 1) / SLIDES.length) * 100}%`,
            }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        {/* Desktop: dot row */}
        <div className="hidden md:flex gap-1.5">
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
          className="text-xs tabular-nums shrink-0"
          style={{ color: C.sage, opacity: 0.6 }}
        >
          {index + 1} / {SLIDES.length}
        </span>
      </div>

      {/* Slide */}
      <div className="flex-1 flex items-center justify-center px-5 md:px-16 py-4 md:py-8 overflow-y-auto">
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
      <div className="flex items-center justify-between px-5 md:px-8 pb-5 md:pb-8 pt-2">
        <button
          onClick={prev}
          disabled={index === 0}
          className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-20"
          style={{ color: C.sage }}
        >
          <ChevronLeft size={18} />
          Back
        </button>
        {isLast ? (
          <button
            onClick={() => setLocation("/dashboard")}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            Done
          </button>
        ) : (
          <button
            onClick={next}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            Next
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
