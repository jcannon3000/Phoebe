import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, MessageCircle } from "lucide-react";

// ─── Palette (mirrors church-deck.tsx) ───────────────────────────────────────
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

// ─── Slide types ─────────────────────────────────────────────────────────────
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
  | {
      kind: "preview";
      caption: string;
      sub: string;
      variant: "prayer-requests" | "intercession" | "daily-office";
    }
  | {
      kind: "preview-mock";
      variant: "prayer-requests" | "intercession" | "daily-office";
    }
  | { kind: "closing"; above: string[]; featured: string };

const SLIDES: Slide[] = [
  // 1 — Title
  {
    kind: "title",
    headline: "Three practices.",
    sub: "The Daily Office. Intercession. Prayer requests.",
  },

  // 2 — Setup
  {
    kind: "statement",
    headline: "Three of the Church's oldest practices, held in common.",
    body: [
      "None of them are new. They are the inheritance of a tradition that has always known how people form relationships with God and with each other.",
      "Phoebe is built to make them easy to return to, together.",
    ],
  },

  // 3 — Cards overview
  {
    kind: "cards",
    headline: "Each one plays a different role.",
    cards: [
      {
        label: "The Daily Office",
        lines: [
          "The Church's daily prayer.",
          "Morning and Evening Prayer from the Book of Common Prayer — psalms, scripture, canticles, collects.",
          "Assembled for today. Nothing to look up.",
        ],
      },
      {
        label: "Intercession",
        lines: [
          "Bearing each other's burdens.",
          "A guided slideshow the community moves through.",
          "You see who else is praying with you at the same hour.",
        ],
      },
      {
        label: "Prayer Requests",
        lines: [
          "A shared garden.",
          "People share what they're carrying — others respond, a word at a time.",
          "The doorway into the life of the community.",
        ],
      },
    ],
  },

  // ── Prayer Requests ────────────────────────────────────────────────────────
  // 4 — Intro to prayer requests
  {
    kind: "statement",
    headline: "Prayer requests are the entry point.",
    body: [
      "Low friction. No scheduling required. No vulnerability asked for yet.",
      "Just a place to say what you are carrying — and to be met by the quiet presence of the people around you.",
    ],
  },

  // 5 — Preview: Prayer requests
  {
    kind: "preview",
    variant: "prayer-requests",
    caption: "A garden of what the community is carrying.",
    sub: "People share, and others respond a word at a time — 'peace', 'strength', 'with you'. Familiarity begins here, in the smallest gestures.",
  },

  // 6 — Progressive: what happens when you respond
  {
    kind: "progressive",
    headline: "A word of prayer is more than a notification.",
    lines: [
      { text: "A person names what they are carrying.", color: C.dim2 },
      { text: "Others see it. Others stop.", color: C.dim3 },
      { text: "A single word is offered in return.", color: C.dim4 },
      { text: "The request is marked: your community is holding this.", color: C.dim5 },
      { text: "And no one carries it alone.", color: C.accent },
    ],
  },

  // ── Intercession ───────────────────────────────────────────────────────────
  // 7 — Intro to intercession
  {
    kind: "statement",
    headline: "Intercession is not a feed. It is a practice.",
    body: [
      "Phoebe turns the community's intercessions into a guided slideshow — one intention at a time, held in silence, with a prayer from the Book of Common Prayer underneath.",
      "You move through it together, at the same hour, knowing who else is praying with you.",
    ],
  },

  // 8 — Preview: Intercession slideshow
  {
    kind: "preview",
    variant: "intercession",
    caption: "A slideshow you move through, together.",
    sub: "Each slide is one intention — a person, a situation, a parish in need. Below it, a prayer from the tradition. At the bottom, a count of who else is praying alongside you.",
  },

  // 9 — Stacked: what this recovers
  {
    kind: "stacked",
    headline: "This is how Christians have always interceded.",
    items: [
      "On a rhythm.",
      "At a shared hour.",
      "With the same words.",
      "Holding the same people in mind.",
    ],
    tail: [
      "Phoebe just makes it possible to keep doing it when the parish is scattered across a city — or a country.",
    ],
  },

  // ── The Daily Office ───────────────────────────────────────────────────────
  // 10 — Intro to the Daily Office
  {
    kind: "statement",
    headline: "The Daily Office is the Church's oldest rhythm of prayer.",
    body: [
      "Morning and evening, the Church has always stopped to pray — the psalms, a reading, the canticles, the collects. Monastics kept it through the centuries; the Book of Common Prayer gave it to every Christian.",
      "Even prayed alone, it is never prayed alone — the same words, the same hours, the whole Church together.",
    ],
  },

  // 11 — Preview: Daily Office
  {
    kind: "preview",
    variant: "daily-office",
    caption: "Morning and Evening Prayer, ready to pray.",
    sub: "The full office for today — opening sentences, the Psalter, the lessons, the canticles, the prayers — assembled in the order the Church has prayed them for centuries. Nothing to look up.",
  },

  // 12 — Stacked: the shape of the office
  {
    kind: "stacked",
    headline: "Morning and evening. Full or short.",
    items: [
      "Morning Prayer — to begin the day in praise.",
      "Evening Prayer — to give the day back.",
      "Or a shorter devotion when the hour is brief.",
    ],
    tail: [
      "Pray it perfectly, or return to it after a long absence — the office holds either way. A daily reminder keeps the hour.",
    ],
  },

  // 13 — Closing
  {
    kind: "closing",
    above: [
      "Prayer requests. Intercession. The Daily Office.",
      "Three rhythms the Church has always known —",
      "held in common, across the scattered life of a modern parish.",
    ],
    featured: "Not new. Recovered.",
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

function StatementSlide({ slide }: { slide: Extract<Slide, { kind: "statement" }> }) {
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

function StackedSlide({ slide }: { slide: Extract<Slide, { kind: "stacked" }> }) {
  return (
    <div className="max-w-3xl mx-auto w-full">
      <h2
        className="text-2xl md:text-4xl font-semibold mb-6 md:mb-10 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h2>
      <div className="space-y-3 md:space-y-4 mb-6 md:mb-10">
        {slide.items.map((item, i) => (
          <p
            key={i}
            className="text-lg md:text-2xl font-light"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            {item}
          </p>
        ))}
      </div>
      {slide.tail && (
        <div className="space-y-4 pt-5 md:pt-6" style={{ borderTop: `1px solid ${C.border}` }}>
          {slide.tail.map((t, i) => (
            <p
              key={i}
              className="text-sm md:text-lg leading-relaxed font-light italic"
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

function ProgressiveSlide({ slide }: { slide: Extract<Slide, { kind: "progressive" }> }) {
  return (
    <div className="max-w-3xl mx-auto w-full">
      <h2
        className="text-2xl md:text-4xl font-semibold mb-6 md:mb-12 leading-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h2>
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

function CardsSlide({ slide }: { slide: Extract<Slide, { kind: "cards" }> }) {
  return (
    <div className="max-w-6xl mx-auto w-full">
      <h2
        className="text-xl md:text-3xl font-semibold mb-6 md:mb-10 leading-tight text-center"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5">
        {slide.cards.map((card, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.1, duration: 0.4 }}
            className="rounded-2xl p-5 md:p-7"
            style={{ background: C.card, border: `1px solid ${C.border}` }}
          >
            <p
              className="text-xs font-bold uppercase tracking-widest mb-3 md:mb-5"
              style={{ color: C.sage, fontFamily: C.font }}
            >
              {card.label}
            </p>
            <div className="space-y-2 md:space-y-3">
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

function ClosingSlide({ slide }: { slide: Extract<Slide, { kind: "closing" }> }) {
  return (
    <div className="max-w-3xl mx-auto w-full text-center">
      <div className="space-y-4 md:space-y-5 mb-10 md:mb-16">
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
        transition={{ delay: 0.3, duration: 0.6 }}
        className="text-4xl md:text-6xl font-bold tracking-tight"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {slide.featured}
      </motion.p>
    </div>
  );
}

// ─── Phone-shaped mockup shell ───────────────────────────────────────────────
function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[28px] md:rounded-[32px] p-4 md:p-5 mx-auto w-full max-w-[290px] md:max-w-[320px]"
      style={{
        background: "#091A10",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
      }}
    >
      {children}
    </div>
  );
}

// ─── Prayer Requests mock ────────────────────────────────────────────────────
function PrayerRequestsMock() {
  const requests = [
    { from: "Margaret W.", body: "For my mother, who begins treatment this week.", words: 4 },
    { from: "David R.",    body: "Discernment about the new role. Grateful for your prayers.", words: 6 },
    { from: "Anonymous",  body: "For peace in a difficult season.", words: 2 },
  ];
  return (
    <MockPhone>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold shrink-0" style={{ color: "#F0EDE6", fontFamily: C.font }}>
          Prayer Requests 🙏🏽
        </h2>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>

      {/* Input row */}
      <div className="flex gap-2 mb-4">
        <div
          className="flex-1 text-[11px] px-3 py-2 rounded-xl"
          style={{ background: "#091A10", border: "1px solid rgba(46,107,64,0.3)", color: "rgba(143,175,150,0.5)", fontFamily: C.font }}
        >
          Share a prayer request... 🌿
        </div>
        <div className="px-3 py-2 rounded-xl text-xs font-medium flex items-center" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
          🙏🏽
        </div>
      </div>

      {/* Request rows */}
      <div>
        {requests.map((r, i) => (
          <div
            key={i}
            className="flex gap-0"
            style={{ borderBottom: i < requests.length - 1 ? "1px solid rgba(200,212,192,0.1)" : "none" }}
          >
            {/* Green left bar */}
            <div className="w-0.5 self-stretch shrink-0" style={{ background: "#8FAF96" }} />
            <div className="flex-1 p-3 pl-2.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] font-medium uppercase tracking-widest mb-1" style={{ color: "rgba(200,212,192,0.45)", fontFamily: C.font }}>
                  From {r.from}
                </p>
                <p className="text-[11px] leading-relaxed" style={{ color: "#F0EDE6", fontFamily: C.font }}>
                  {r.body}
                </p>
              </div>
              {/* Word count + icon */}
              <div className="flex items-center gap-1 shrink-0" style={{ color: "rgba(143,175,150,0.55)" }}>
                <span className="text-[10px] tabular-nums">{r.words}</span>
                <MessageCircle size={12} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

// ─── Intercession mock (matches prayer-mode.tsx slide look) ──────────────────
function IntercessionMock() {
  return (
    <div
      className="rounded-[28px] md:rounded-[32px] mx-auto w-full max-w-[290px] md:max-w-[320px] relative"
      style={{
        background: "#0C1F12",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
        minHeight: 430,
      }}
    >
      {/* Exit × (decorative) */}
      <div
        className="absolute top-4 right-4 w-7 h-7 flex items-center justify-center rounded-full text-lg"
        style={{
          color: "rgba(200,212,192,0.4)",
          background: "rgba(200,212,192,0.06)",
        }}
      >
        ×
      </div>

      <div className="flex flex-col items-center text-center px-6 pt-14 pb-12">
        <p
          className="text-[9px] uppercase font-semibold mb-4"
          style={{
            color: "rgba(143,175,150,0.45)",
            letterSpacing: "0.18em",
            fontFamily: C.font,
          }}
        >
          Your Intercession
        </p>

        <p
          className="text-[16px] md:text-[17px] leading-[1.5] font-medium italic mb-3"
          style={{
            color: "#E8E4D8",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          Margaret's mother, as she begins treatment this week.
        </p>

        <p
          className="text-[11px] mb-2"
          style={{ color: "#8FAF96", fontFamily: C.font }}
        >
          with David, Anna, James
        </p>

        <p
          className="text-[10px] italic mb-5"
          style={{
            color: "rgba(143,175,150,0.55)",
            fontFamily: C.font,
          }}
        >
          Your community is holding this.
        </p>

        <div
          className="w-full rounded-xl px-3 py-3 text-left mb-5"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.15)",
          }}
        >
          <p
            className="text-[10px] leading-[1.75] italic"
            style={{
              color: "#C8D4C0",
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            O Father of mercies and God of all comfort, look graciously upon
            this thy servant, that her weakness may be banished and her
            strength restored.
          </p>
          <p
            className="text-[7px] uppercase mt-2"
            style={{
              color: "rgba(143,175,150,0.3)",
              letterSpacing: "0.14em",
              fontFamily: C.font,
            }}
          >
            From the Book of Common Prayer
          </p>
        </div>

        <div
          className="px-6 py-2 rounded-full text-[11px] font-medium tracking-wide"
          style={{
            background: "rgba(46,107,64,0.28)",
            border: "1px solid rgba(46,107,64,0.5)",
            color: "#C8D4C0",
            fontFamily: C.font,
          }}
        >
          Amen →
        </div>
      </div>

      <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
        <p
          className="text-[10px]"
          style={{
            color: "rgba(143,175,150,0.32)",
            letterSpacing: "0.06em",
            fontFamily: C.font,
          }}
        >
          3 of 6
        </p>
      </div>
    </div>
  );
}

// ─── Daily Office mock ───────────────────────────────────────────────────────
function DailyOfficeMock() {
  const sections = [
    { label: "Opening Sentence", done: true, active: false },
    { label: "The Invitatory", done: true, active: false },
    { label: "The Psalter", done: false, active: true },
    { label: "The Lessons", done: false, active: false },
    { label: "The Canticles", done: false, active: false },
    { label: "The Prayers", done: false, active: false },
  ];
  return (
    <MockPhone>
      <p
        className="text-[9px] uppercase font-semibold mb-1"
        style={{
          color: "rgba(143,175,150,0.55)",
          letterSpacing: "0.16em",
          fontFamily: C.font,
        }}
      >
        Morning Prayer 🌅
      </p>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: "#F0EDE6", fontFamily: C.font }}
      >
        The Daily Office
      </h2>
      <p
        className="text-[9px] mb-3"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        Book of Common Prayer · p. 75
      </p>

      {/* Order of service */}
      <div
        className="rounded-xl px-3 py-2 mb-3"
        style={{
          background: "rgba(200,212,192,0.03)",
          border: "1px solid rgba(200,212,192,0.08)",
        }}
      >
        {sections.map((s, i) => (
          <div key={i} className="flex items-center gap-2 py-[3px]">
            <div
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: s.done
                  ? "rgba(46,107,64,0.4)"
                  : s.active
                    ? "rgba(46,107,64,0.5)"
                    : "rgba(200,212,192,0.05)",
                border: s.active
                  ? "1px solid rgba(46,107,64,0.7)"
                  : "1px solid rgba(200,212,192,0.12)",
              }}
            >
              {s.done && (
                <span className="text-[7px]" style={{ color: "#C8D4C0" }}>
                  ✓
                </span>
              )}
            </div>
            <p
              className="text-[10px]"
              style={{
                color: s.active
                  ? "#F0EDE6"
                  : s.done
                    ? "#8FAF96"
                    : "rgba(200,212,192,0.4)",
                fontWeight: s.active ? 600 : 400,
                fontFamily: C.font,
              }}
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Active passage — the Psalter */}
      <div
        className="rounded-xl p-3"
        style={{
          background: "rgba(240,237,230,0.03)",
          border: "1px solid rgba(46,107,64,0.25)",
        }}
      >
        <p
          className="text-[10px] uppercase mb-1.5"
          style={{
            color: "rgba(143,175,150,0.55)",
            letterSpacing: "0.12em",
            fontFamily: C.font,
          }}
        >
          Psalm 63 · Appointed for today
        </p>
        <p
          className="text-[11px] leading-[1.6] italic"
          style={{
            color: "#E8E4D8",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          O God, you are my God; eagerly I seek you; my soul thirsts for
          you, my flesh faints for you, as in a barren and dry land where
          there is no water.
        </p>
      </div>
    </MockPhone>
  );
}

function MockForVariant({ variant }: { variant: "prayer-requests" | "intercession" | "daily-office" }) {
  if (variant === "prayer-requests") return <PrayerRequestsMock />;
  if (variant === "intercession") return <IntercessionMock />;
  return <DailyOfficeMock />;
}

function PreviewSlide({ slide }: { slide: Extract<Slide, { kind: "preview" }> }) {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-16 max-w-5xl mx-auto w-full">
      {/* Copy — always visible */}
      <div className="text-center md:text-left max-w-md">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-2 md:mb-3"
          style={{ color: C.sage, fontFamily: C.font }}
        >
          A glimpse inside Phoebe
        </p>
        <h2
          className="text-2xl md:text-4xl font-semibold mb-3 md:mb-5 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.caption}
        </h2>
        <p
          className="text-sm md:text-lg font-light leading-relaxed"
          style={{ color: C.sage, fontFamily: C.font }}
        >
          {slide.sub}
        </p>
      </div>
      {/* Mock — desktop only; on mobile it gets its own slide */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="hidden md:flex shrink-0 w-full md:w-auto justify-center"
      >
        <MockForVariant variant={slide.variant} />
      </motion.div>
    </div>
  );
}

function PreviewMockSlide({ slide }: { slide: Extract<Slide, { kind: "preview-mock" }> }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 max-w-5xl mx-auto w-full">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.45 }}
        className="flex justify-center w-full"
      >
        <MockForVariant variant={slide.variant} />
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
    case "stacked":
      return <StackedSlide slide={slide} />;
    case "progressive":
      return <ProgressiveSlide slide={slide} />;
    case "cards":
      return <CardsSlide slide={slide} />;
    case "preview":
      return <PreviewSlide slide={slide} />;
    case "preview-mock":
      return <PreviewMockSlide slide={slide} />;
    case "closing":
      return <ClosingSlide slide={slide} />;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function FeaturesDeck() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // On mobile, expand each "preview" slide into [copy-only, mock-only]
  const slides: Slide[] = isMobile
    ? SLIDES.flatMap((s) =>
        s.kind === "preview"
          ? [s, { kind: "preview-mock" as const, variant: s.variant }]
          : [s]
      )
    : SLIDES;

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, slides.length - 1)),
    [slides.length],
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
        setLocation("/learn");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, setLocation]);

  // Clamp index when switching between mobile/desktop (different slide counts)
  const clampedIndex = Math.min(index, slides.length - 1);
  const slide = slides[clampedIndex];

  return (
    <div className="fixed inset-0 flex flex-col" style={{ background: C.bg }}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 pt-4 md:pt-6 pb-2">
        <button
          onClick={() => setLocation("/learn")}
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
            animate={{ width: `${((clampedIndex + 1) / slides.length) * 100}%` }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>

        {/* Desktop: dot row */}
        <div className="hidden md:flex gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className="rounded-full transition-all"
              style={{
                width: i === clampedIndex ? 20 : 6,
                height: 6,
                background: i <= clampedIndex ? C.sage : "rgba(200,212,192,0.2)",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>

        <span
          className="text-xs tabular-nums shrink-0"
          style={{ color: C.sage, opacity: 0.6 }}
        >
          {clampedIndex + 1} / {slides.length}
        </span>
      </div>

      {/* Slide */}
      <div className="flex-1 flex items-center justify-center px-5 md:px-16 py-4 md:py-8 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={clampedIndex}
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
          disabled={clampedIndex === 0}
          className="flex items-center gap-1.5 text-sm transition-opacity disabled:opacity-20"
          style={{ color: C.sage }}
        >
          <ChevronLeft size={18} />
          Back
        </button>
        {clampedIndex === slides.length - 1 ? (
          <button
            onClick={() => setLocation("/learn")}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            Done 🌿
            <ChevronRight size={18} />
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
