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
  | {
      kind: "preview";
      caption: string;
      sub: string;
      variant: "dashboard" | "prayer" | "letters" | "gatherings";
    }
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

  // 8a — Preview: Prayer
  {
    kind: "preview",
    variant: "prayer",
    caption: "Prayer, held in common.",
    sub: "A shared garden. People share what they're carrying — and others respond, a word at a time. Low friction. Low vulnerability. The doorway into the life of the community.",
  },

  // 8b — Preview: Letters
  {
    kind: "preview",
    variant: "letters",
    caption: "Letters, on a rhythm.",
    sub: "One person. One letter. Once a fortnight. Phoebe holds the cadence so the friendship can deepen in writing — the way parish friendships used to form before everything sped up.",
  },

  // 8c — Preview: Gatherings
  {
    kind: "preview",
    variant: "gatherings",
    caption: "Gatherings that actually repeat.",
    sub: "Suppers, prayer, study groups — held on an interval, not as one-off events. Phoebe keeps the rhythm through the weeks life tries to disrupt.",
  },

  // 8d — Preview: Dashboard (the whole picture held together)
  {
    kind: "preview",
    variant: "dashboard",
    caption: "One rhythm, held in one place.",
    sub: "Every person in the parish sees the same shape: what's this week, what's this month, who's waiting for a reply. One surface, formed around the practices — not another inbox to manage.",
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

// ─── App preview mockups ─────────────────────────────────────────────────────
// These are visual mockups of the real Phoebe UI, rendered in static form
// so the deck can show what each layer looks like without running the app.

const CAT = {
  letters: {
    bg: "rgba(20,64,42,0.25)",
    border: "rgba(20,64,42,0.5)",
    bar: "#14402A",
  },
  practices: {
    bg: "rgba(46,107,64,0.15)",
    border: "rgba(46,107,64,0.4)",
    bar: "#2E6B40",
  },
  gatherings: {
    bg: "rgba(111,175,133,0.15)",
    border: "rgba(111,175,133,0.4)",
    bar: "#6FAF85",
  },
};

function MockBarCard({
  category,
  title,
  status,
  pulse = false,
}: {
  category: keyof typeof CAT;
  title: string;
  status: string;
  pulse?: boolean;
}) {
  const c = CAT[category];
  return (
    <div
      className="relative flex rounded-xl overflow-hidden"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
      }}
    >
      <div
        className="w-1 flex-shrink-0"
        style={{
          background: c.bar,
          boxShadow: pulse ? `0 0 12px ${c.bar}` : undefined,
        }}
      />
      <div className="flex-1 px-4 pt-3 pb-3">
        <div className="flex items-start justify-between gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color: "#F0EDE6", fontFamily: C.font }}
          >
            {title}
          </span>
          <span
            className="text-[9px] font-semibold uppercase shrink-0 mt-0.5"
            style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}
          >
            View All
          </span>
        </div>
        <p
          className="text-xs mt-1"
          style={{ color: "#8FAF96", fontFamily: C.font }}
        >
          {status}
        </p>
      </div>
    </div>
  );
}

function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[32px] p-5 mx-auto"
      style={{
        width: 320,
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

function DashboardMock() {
  return (
    <MockPhone>
      <p
        className="mb-1"
        style={{ color: "rgba(143,175,150,0.7)", fontSize: 11, fontFamily: C.font }}
      >
        Cultivating community makes life radiant ✨
      </p>
      <h1
        className="text-xl font-semibold mb-4"
        style={{ color: "#F0EDE6", fontFamily: C.font }}
      >
        Saturday, 11 April
      </h1>

      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "rgba(200,212,192,0.5)", fontFamily: C.font }}
      >
        This week
      </p>
      <div className="space-y-2 mb-4">
        <MockBarCard
          category="letters"
          title="📮 Dialogue with Margaret"
          status="Your turn to write 🖋️"
          pulse
        />
        <MockBarCard
          category="practices"
          title="🌅 Morning Prayer"
          status="Tomorrow · 7:00 AM"
        />
        <MockBarCard
          category="gatherings"
          title="🍞 Wednesday Supper"
          status="In 4 days · Parish Hall"
        />
      </div>

      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2"
        style={{ color: "rgba(200,212,192,0.5)", fontFamily: C.font }}
      >
        This month
      </p>
      <div className="space-y-2">
        <MockBarCard
          category="practices"
          title="🕯️ Contemplative Hour"
          status="Every Thursday evening"
        />
      </div>
    </MockPhone>
  );
}

function PrayerMock() {
  const requests = [
    {
      from: "Margaret W.",
      body: "For my mother, who begins treatment this week.",
      words: 4,
    },
    {
      from: "David R.",
      body: "Discernment about the new role. Grateful for your prayers.",
      words: 6,
    },
    {
      from: "Anonymous",
      body: "For peace in a difficult season.",
      words: 2,
    },
  ];
  return (
    <MockPhone>
      <div className="flex items-center gap-2 mb-4">
        <h2
          className="text-base font-semibold"
          style={{ color: "#F0EDE6", fontFamily: C.font }}
        >
          Prayer Requests 🙏🏽
        </h2>
        <div
          className="flex-1 h-px"
          style={{ background: "rgba(200,212,192,0.15)" }}
        />
      </div>

      <div className="flex gap-2 mb-4">
        <div
          className="flex-1 text-xs px-3 py-2 rounded-xl"
          style={{
            background: "#091A10",
            border: "1px solid rgba(46,107,64,0.3)",
            color: "rgba(143,175,150,0.5)",
            fontFamily: C.font,
          }}
        >
          Share a prayer request with your garden... 🌿
        </div>
        <div
          className="px-3 py-2 rounded-xl text-xs font-medium"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          🙏🏽
        </div>
      </div>

      <div>
        {requests.map((r, i) => (
          <div
            key={i}
            className="flex gap-0"
            style={{
              borderBottom:
                i < requests.length - 1 ? "1px solid rgba(200,212,192,0.12)" : "none",
            }}
          >
            <div
              className="w-0.5 self-stretch shrink-0"
              style={{ background: "#8FAF96" }}
            />
            <div className="flex-1 p-3 pl-2.5">
              <p
                className="text-[9px] font-medium uppercase tracking-widest mb-1"
                style={{ color: "rgba(200,212,192,0.45)", fontFamily: C.font }}
              >
                From {r.from}
              </p>
              <p
                className="text-xs leading-relaxed mb-1.5"
                style={{ color: "#F0EDE6", fontFamily: C.font }}
              >
                {r.body}
              </p>
              <p
                className="text-[10px]"
                style={{ color: "rgba(143,175,150,0.7)", fontFamily: C.font }}
              >
                🌿 {r.words} {r.words === 1 ? "word of prayer" : "words of prayer"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

function LettersMock() {
  return (
    <MockPhone>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-3"
        style={{ color: "rgba(200,212,192,0.5)", fontFamily: C.font }}
      >
        Your letters
      </p>

      <div
        className="rounded-2xl p-4 mb-3"
        style={{
          background: "rgba(20,64,42,0.35)",
          border: "1px solid rgba(20,64,42,0.6)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{ background: "#14402A", color: "#F0EDE6" }}
          >
            M
          </div>
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: "#F0EDE6", fontFamily: C.font }}
            >
              Margaret Whitfield
            </p>
            <p
              className="text-[10px]"
              style={{ color: "#8FAF96", fontFamily: C.font }}
            >
              Fortnightly · Sent Apr 3
            </p>
          </div>
        </div>
        <p
          className="text-xs leading-relaxed italic mb-2"
          style={{ color: "rgba(240,237,230,0.85)", fontFamily: C.font }}
        >
          "The lilies in the churchyard have come in early this year. I
          thought of you when I saw them..."
        </p>
        <p
          className="text-[10px] font-semibold"
          style={{ color: "#C8D4C0", fontFamily: C.font }}
        >
          🖋️ Your turn to write
        </p>
      </div>

      <div
        className="rounded-2xl p-4 mb-3"
        style={{
          background: "rgba(20,64,42,0.2)",
          border: "1px solid rgba(20,64,42,0.4)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{ background: "#14402A", color: "#F0EDE6" }}
          >
            D
          </div>
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: "#F0EDE6", fontFamily: C.font }}
            >
              David Reyes
            </p>
            <p
              className="text-[10px]"
              style={{ color: "#8FAF96", fontFamily: C.font }}
            >
              Monthly · Last letter Mar 28
            </p>
          </div>
        </div>
        <p
          className="text-[10px]"
          style={{ color: "rgba(143,175,150,0.7)", fontFamily: C.font }}
        >
          🌿 Waiting for David
        </p>
      </div>

      <div
        className="rounded-2xl p-3 text-center"
        style={{
          background: "rgba(46,107,64,0.08)",
          border: "1px dashed rgba(200,212,192,0.25)",
        }}
      >
        <p
          className="text-xs"
          style={{ color: "rgba(200,212,192,0.6)", fontFamily: C.font }}
        >
          + Begin a new dialogue
        </p>
      </div>
    </MockPhone>
  );
}

function GatheringsMock() {
  const items = [
    {
      emoji: "🍞",
      name: "Wednesday Supper",
      when: "Wednesdays · 6:30 PM",
      where: "Parish Hall",
      count: "12 going",
    },
    {
      emoji: "🌅",
      name: "Morning Prayer",
      when: "Daily · 7:00 AM",
      where: "St. Mary's Chapel",
      count: "8 regulars",
    },
    {
      emoji: "📖",
      name: "Lenten Study",
      when: "Thursdays · 7:00 PM",
      where: "Rectory Library",
      count: "6 going",
    },
  ];
  return (
    <MockPhone>
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-3"
        style={{ color: "rgba(200,212,192,0.5)", fontFamily: C.font }}
      >
        Your rhythms
      </p>

      <div className="space-y-3">
        {items.map((it, i) => (
          <div
            key={i}
            className="rounded-2xl p-4"
            style={{
              background: "rgba(111,175,133,0.12)",
              border: "1px solid rgba(111,175,133,0.35)",
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
                style={{ background: "rgba(111,175,133,0.2)" }}
              >
                {it.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold mb-0.5"
                  style={{ color: "#F0EDE6", fontFamily: C.font }}
                >
                  {it.name}
                </p>
                <p
                  className="text-[11px]"
                  style={{ color: "#8FAF96", fontFamily: C.font }}
                >
                  {it.when}
                </p>
                <p
                  className="text-[11px]"
                  style={{ color: "rgba(143,175,150,0.7)", fontFamily: C.font }}
                >
                  {it.where}
                </p>
              </div>
              <div
                className="text-[10px] font-medium px-2 py-1 rounded-full shrink-0"
                style={{
                  background: "rgba(111,175,133,0.2)",
                  color: "#C8D4C0",
                  fontFamily: C.font,
                }}
              >
                {it.count}
              </div>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

function PreviewSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "preview" }>;
}) {
  const mock =
    slide.variant === "dashboard" ? (
      <DashboardMock />
    ) : slide.variant === "prayer" ? (
      <PrayerMock />
    ) : slide.variant === "letters" ? (
      <LettersMock />
    ) : (
      <GatheringsMock />
    );

  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-10 md:gap-16 max-w-5xl mx-auto w-full">
      <div className="text-center md:text-left max-w-md">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-3"
          style={{ color: C.sage, fontFamily: C.font }}
        >
          A glimpse inside Phoebe
        </p>
        <h2
          className="text-3xl md:text-4xl font-semibold mb-5 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.caption}
        </h2>
        <p
          className="text-base md:text-lg font-light leading-relaxed"
          style={{ color: C.sage, fontFamily: C.font }}
        >
          {slide.sub}
        </p>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="shrink-0"
      >
        {mock}
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
    case "trellis":
      return <TrellisSlide slide={slide} />;
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
