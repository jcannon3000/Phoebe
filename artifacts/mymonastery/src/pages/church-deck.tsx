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
  font: "'Space Grotesk', sans-serif",
} as const;

// ─── Slide types ────────────────────────────────────────────────────────────
type Slide =
  | { kind: "title"; headline: string; sub?: string; muted?: boolean }
  | { kind: "statement"; headline: string; body: string[] }
  | {
      kind: "preview";
      label: string;
      headline: string;
      body: string[];
      placeholder: string;
    }
  | { kind: "closing"; body: string[]; featured: string[] };

// ─── Slides ─────────────────────────────────────────────────────────────────
const SLIDES: Slide[] = [
  // 1 — Title
  {
    kind: "title",
    headline: "Phoebe",
    sub: "A place set apart for connection.",
  },

  // 2 — The opening
  {
    kind: "statement",
    headline: "Your parish already has everything it needs.",
    body: [
      "People who want to be close to one another. Groups that already meet. A tradition of shared practice. Relationships that are already forming.",
      "The question is not how to build community from scratch. It is how to cultivate what is already there.",
    ],
  },

  // 3 — The real challenge
  {
    kind: "statement",
    headline: "Most parishes are good at Sunday.",
    body: [
      "The challenge is Tuesday. Wednesday. Friday. The six days when nothing is organised and people quietly return to their separate lives.",
      "Phoebe creates touchpoints between Sundays. Small, consistent, low friction. Enough to keep the community alive in the days when no one is gathering.",
    ],
  },

  // 4 — The week (centered, auto-advances after 2s)
  {
    kind: "title",
    headline: "Here is what a week looks like inside Phoebe.",
    muted: true,
  },

  // 5 — Group Intercession (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Bearing each other\u2019s burdens in prayer.",
    body: [
      "A group chooses people and intentions to pray for together. Each person prays at their own time, on their own schedule. They see who has prayed and who is holding the same things.",
      "Knowing someone is praying for you by name changes how you show up on Sunday.",
    ],
    placeholder: "Insert intercession screenshot",
  },

  // 6 — Lectio Divina (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Lectio Divina",
    body: [
      "The Sunday gospel, read together across the week.",
      "Monday \u2014 a word or phrase that is speaking to you.\nWednesday \u2014 what the passage is stirring in you.\nFriday \u2014 what it is calling you to do or to be.",
      "Each person reflects on their own. Then they see what everyone else heard in the same passage. They arrive on Sunday having already sat with the text together. The sermon lands differently.",
    ],
    placeholder: "Insert Lectio Divina screenshot",
  },

  // 7 — Group Fast (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "A rhythm of restraint, held together.",
    body: [
      "A group commits to a fast on a chosen day. A calendar invite goes out the night before. On the day, each person sees who is fasting alongside them. At the close, they share what nourished them instead.",
      "Fasting was never meant to be done alone. Phoebe makes it communal again.",
    ],
    placeholder: "Insert fast practice screenshot",
  },

  // 8 — Fast from meat (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "One fast with a visible impact.",
    body: [
      "For groups fasting from meat, University of Colorado research shows that one person fasting for one day saves an estimated 400 gallons of water. Phoebe tracks what the group saves together.",
      "This week. This month. All time.",
      "A small act of shared faithfulness. A visible record of what the community has done together.",
    ],
    placeholder: "Insert water fast screenshot",
  },

  // 9 — Prayer Requests (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "Prayer, held in common.",
    body: [
      "People share what they are carrying. Others in the community respond with a word or a prayer. Anonymous if needed. Low vulnerability. Low friction.",
      "The doorway into the life of the community. When someone submits a request during the week, they arrive on Sunday already known.",
    ],
    placeholder: "Insert prayer requests screenshot",
  },

  // 10 — The Prayer List (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "A shared record of what the community is holding.",
    body: [
      "Every request, every intention, every name being carried in prayer \u2014 gathered in one place. The community can see what is being held together. They can add their prayer to what is already there.",
      "Intercession made visible. The invisible work of the community, given a surface.",
    ],
    placeholder: "Insert prayer list screenshot",
  },

  // 11 — What this builds
  {
    kind: "statement",
    headline: "Each practice feeds the next.",
    body: [
      "The prayer request submitted on Wednesday breaks the ice on Sunday. The Lectio reflection written on Friday deepens the sermon conversation. The fast held together on Thursday is still being felt when the group gathers. The name prayed for on Tuesday is the person who feels seen when they walk through the door.",
      "Over time the touchpoints between Sundays become the fabric of community life.",
    ],
  },

  // 12 — The parish calendar (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline:
      "Everything already happening, in front of the people most likely to come.",
    body: [
      "The parish is already running events. The problem is not a lack of things to do \u2014 it is that people do not hear about them, or forget, or never felt connected enough to show up.",
      "Phoebe puts the parish calendar in front of people who are already engaged during the week. The person who prayed on Wednesday and fasted on Friday is the most likely person to come to Thursday evening\u2019s talk. They just need to see it.",
    ],
    placeholder: "Insert parish calendar screenshot",
  },

  // 13 — Getting more involved (screenshot)
  {
    kind: "preview",
    label: "A GLIMPSE INSIDE PHOEBE",
    headline: "A natural next step for people who are already connected.",
    body: [
      "When someone has been praying with a group for six weeks, they are no longer a stranger. They are ready to go deeper.",
      "The parish calendar surfaces ways to do that. A volunteer opportunity. A study group. A service project. A gathering that is just beginning.",
      "Phoebe does not recruit people into parish life. It cultivates the ground so that when the invitation comes, people are ready to say yes.",
    ],
    placeholder: "Insert events screenshot",
  },

  // 14 — Closing
  {
    kind: "closing",
    body: [
      "The strongest parishes are not the ones with the most programs. They are the ones where people know each other.",
      "Relationships drive attendance. Relationships drive giving. Relationships drive the decision to stay when life gets hard and the invitation to bring someone new.",
      "Relationships are built through shared points of connection \u2014 a prayer held in common, a passage read together, a fast observed alongside someone else, a name carried through the week.",
    ],
    featured: ["Phoebe makes this possible.", "Every day. Between Sundays."],
  },
];

// ─── Slide renderers ─────────────────────────────────────────────────────────

function TitleSlide({ slide }: { slide: Extract<Slide, { kind: "title" }> }) {
  return (
    <div className="flex flex-col items-center justify-center text-center max-w-3xl mx-auto">
      <h1
        className="text-5xl md:text-7xl font-bold mb-4 md:mb-6 tracking-tight"
        style={{
          color: slide.muted ? C.sage : C.text,
          fontFamily: C.font,
          fontSize: slide.muted ? undefined : undefined,
        }}
      >
        {slide.headline}
      </h1>
      {slide.sub && (
        <p
          className="text-lg md:text-2xl font-light"
          style={{ color: C.sage, fontFamily: C.font }}
        >
          {slide.sub}
        </p>
      )}
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
            style={{ color: C.sage, fontFamily: C.font, whiteSpace: "pre-line" }}
          >
            {p}
          </p>
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
        <p
          className="text-[10px] font-bold uppercase tracking-[0.18em] mb-4"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          {slide.label}
        </p>
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
              style={{
                color: C.sage,
                fontFamily: C.font,
                whiteSpace: "pre-line",
              }}
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
        className="shrink-0 w-full md:w-[40%] flex justify-center"
      >
        <div
          className="w-full max-w-[320px] aspect-[9/16] rounded-2xl flex items-center justify-center px-6"
          style={{
            background: C.card,
            border: "1px solid rgba(200,212,192,0.25)",
          }}
        >
          <p
            className="text-[13px] text-center"
            style={{ color: C.sage, fontFamily: C.font }}
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
      <div className="space-y-4 md:space-y-6 mb-10 md:mb-16">
        {slide.body.map((line, i) => (
          <p
            key={i}
            className="text-base md:text-xl font-light leading-relaxed"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            {line}
          </p>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, duration: 0.5 }}
        className="space-y-1"
      >
        {slide.featured.map((line, i) => (
          <p
            key={i}
            className="text-3xl md:text-5xl font-semibold leading-tight"
            style={{ color: C.text, fontFamily: C.font }}
          >
            {line}
          </p>
        ))}
      </motion.div>
    </div>
  );
}

function renderSlide(slide: Slide) {
  switch (slide.kind) {
    case "title":
      return <TitleSlide slide={slide} />;
    case "statement":
      return <StatementSlide slide={slide} />;
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

  // Slide 4 (index 3) auto-advances after 2 seconds
  useEffect(() => {
    if (index === 3) {
      const timer = setTimeout(next, 2000);
      return () => clearTimeout(timer);
    }
  }, [index, next]);

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
  const isFirst = index === 0;
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
          disabled={isFirst}
          className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-0 disabled:pointer-events-none"
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
