import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, MessageCircle, MapPin, Users } from "lucide-react";

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
  | { kind: "title"; headline: string; sub?: string; muted?: boolean; mock?: "dashboard" }
  | { kind: "statement"; headline: string; body: string[] }
  | { kind: "feature-text"; label: string; headline: string; body: string[] }
  | {
      kind: "feature-demo";
      variant:
        | "prayer-requests"
        | "bcp"
        | "prayer-list"
        | "lectio"
        | "meat-fast"
        | "calendar"
        | "gatherings";
    }
  | {
      kind: "feature-combo";
      label: string;
      headline: string;
      body: string[];
      mock: "prayer-requests" | "bcp" | "prayer-list" | "lectio" | "meat-fast" | "calendar" | "gatherings";
    }
  | { kind: "combo-mock"; mock: "prayer-requests" | "bcp" | "prayer-list" | "lectio" | "meat-fast" | "calendar" | "gatherings" }
  | { kind: "quote"; text: string }
  | { kind: "closing"; body: string[]; featured: string[] };

// ─── Slides ─────────────────────────────────────────────────────────────────
const SLIDES: Slide[] = [
  // 1 — Title
  {
    kind: "title",
    headline: "Phoebe",
    sub: "A relational app that cultivates connections between Sundays \u2014 through shared prayer, shared practice, and shared life.",
    mock: "dashboard",
  },

  // 2 — The opening
  {
    kind: "statement",
    headline: "Harvard sociologist Robert Putnam\u2019s research found that the strongest predictor of religious engagement is the strength of relationships within a community.",
    body: [
      "Phoebe is built around that insight.",
    ],
  },

  // 4 — The week (centered, auto-advances after 2s)
  {
    kind: "title",
    headline: "Here is what a week looks like inside Phoebe.",
    muted: true,
  },

  // ── Feature 1: Prayer Requests ──
  // 5
  {
    kind: "feature-combo",
    label: "",
    headline: "Prayer, held in common.",
    body: [
      "People share what they are carrying. Others in the community respond with a word or a prayer, and make people feel heard and cared for.",
    ],
    mock: "prayer-requests",
  },

  // ── Feature 2: BCP Intercessions ──
  // 6
  {
    kind: "feature-combo",
    label: "",
    headline: "BCP Integration",
    body: [
      "Users can access the full list of intercessions and thanksgivings from the Book of Common Prayer, inviting others in their community to pray them with them.",
    ],
    mock: "bcp",
  },

  // ── Feature 3: Lectio Divina ──
  // 8
  {
    kind: "feature-combo",
    label: "",
    headline: "Group Lectio Divina",
    body: [
      "The Sunday gospel, read together across the week, moving through each stage together on Mondays, Wednesdays, and Fridays.",
    ],
    mock: "lectio",
  },

  // 17 — Gatherings (text + mock on one slide)
  {
    kind: "feature-combo",
    label: "",
    headline: "Upcoming Events",
    body: [
      "When members feel a sense of belonging, they\u2019re far more likely to come to a gathering. Phoebe cultivates belonging then gives members opportunities to get more involved by displaying ways to connect further.",
    ],
    mock: "gatherings",
  },

  // — Murthy quote
  {
    kind: "quote",
    text: "As Former Surgeon General Vivek Murthy has said, loneliness is not just an emotional state\u2014it is a public health crisis.\n\nIn that light, creating spaces for people to connect isn\u2019t just engagement.\nIt\u2019s ministry.",
  },

  // 19 — Closing
  {
    kind: "closing",
    body: [],
    featured: ["Help your parish flourish with Phoebe."],
  },
];

// ─── Slide renderers ─────────────────────────────────────────────────────────

/* ── Dashboard Mock (compact) ── */
function DashboardMock() {
  return (
    <MockPhone>
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-base font-bold" style={{ color: C.text, fontFamily: C.font }}>Phoebe</h2>
        <div className="flex gap-1.5">
          <span className="text-[9px] px-2.5 py-1 rounded-full" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.25)", color: C.sage }}>🕯️ Prayer List</span>
          <span className="text-[9px] px-2.5 py-1 rounded-full" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.25)", color: C.sage }}>Menu</span>
        </div>
      </div>
      <p className="text-[8px] uppercase tracking-[0.15em] mb-1" style={{ color: "rgba(143,175,150,0.4)" }}>A place set apart for connection</p>
      <p className="text-[13px] font-semibold mb-3" style={{ color: C.text, fontFamily: C.font }}>Sunday, 12 April</p>

      {/* This week */}
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[11px] font-bold" style={{ color: C.text }}>This week</p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
      </div>
      <div className="space-y-2 mb-3">
        {/* Lectio card */}
        <div className="flex rounded-xl overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}>
          <div className="w-1 shrink-0" style={{ background: "#5C8A5F" }} />
          <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>📜 Lectio Divina</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>with Sarah, David +3</p>
            </div>
            <div className="text-right shrink-0 flex flex-col items-end gap-1">
              <p className="text-[8px] uppercase tracking-wider font-semibold" style={{ color: "#C8D4C0" }}>1 of 3</p>
              <span className="text-[9px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "#2D5E3F", color: C.text }}>Responses</span>
            </div>
          </div>
        </div>
        {/* Intercession card */}
        <div className="flex rounded-xl overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}>
          <div className="w-1 shrink-0" style={{ background: "#5C8A5F" }} />
          <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>🙏🏽 Prayers for healing</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>with Margaret, Anna</p>
            </div>
            <div className="text-right shrink-0 flex flex-col items-end gap-1">
              <p className="text-[8px] uppercase tracking-wider font-semibold" style={{ color: "#C8D4C0" }}>🔥 2</p>
              <span className="text-[9px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(46,107,64,0.18)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.35)" }}>View</span>
            </div>
          </div>
        </div>
      </div>

      {/* Prayer Requests */}
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[11px] font-semibold" style={{ color: C.text }}>Prayer Requests 🙏🏽</p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>
      <div className="flex gap-2 mb-2.5">
        <div className="flex-1 text-[10px] px-3 py-2 rounded-xl" style={{ background: "#091A10", border: "1px solid rgba(46,107,64,0.3)", color: "rgba(143,175,150,0.5)", fontFamily: C.font }}>
          Share a prayer request... 🌿
        </div>
        <div className="px-2.5 py-2 rounded-xl text-[10px]" style={{ background: "#2D5E3F", color: C.text }}>🙏🏽</div>
      </div>
      <div>
        {[
          { from: "Margaret W.", body: "For my mother, who begins treatment this week.", count: 3 },
          { from: "David R.", body: "Discernment about a new calling.", count: 1 },
        ].map((r, i) => (
          <div key={i} className="flex gap-0" style={{ borderBottom: i === 0 ? "1px solid rgba(200,212,192,0.12)" : "none" }}>
            <div className="w-0.5 self-stretch shrink-0" style={{ background: "#8FAF96" }} />
            <div className="flex-1 py-2.5 px-2.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[8px] font-medium uppercase tracking-widest mb-0.5" style={{ color: "rgba(200,212,192,0.45)" }}>From {r.from}</p>
                <p className="text-[11px] leading-relaxed" style={{ color: C.text, fontFamily: C.font }}>{r.body}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-1" style={{ color: "rgba(143,175,150,0.45)" }}>
                <span className="text-[9px] tabular-nums">{r.count}</span>
                <MessageCircle size={11} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

function TitleSlide({ slide }: { slide: Extract<Slide, { kind: "title" }> }) {
  return slide.mock ? (
    <div className="flex flex-col md:flex-row items-center justify-center w-full max-w-5xl mx-auto gap-8 md:gap-16">
      <div className="text-center md:text-left w-full md:max-w-md shrink-0">
        <h1
          className="text-5xl md:text-7xl font-bold mb-4 md:mb-6 tracking-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.headline}
        </h1>
        {slide.sub && (
          <p
            className="text-base md:text-xl font-light leading-snug"
            style={{ color: C.sage, fontFamily: C.font }}
          >
            {slide.sub}
          </p>
        )}
      </div>
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
        className="w-full md:w-auto flex justify-center shrink-0"
      >
        <DashboardMock />
      </motion.div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center text-center max-w-3xl mx-auto">
      <h1
        className="text-5xl md:text-7xl font-bold mb-4 md:mb-6 tracking-tight"
        style={{ color: slide.muted ? C.sage : C.text, fontFamily: C.font }}
      >
        {slide.headline}
      </h1>
      {slide.sub && (
        <p
          className="text-base md:text-xl font-light leading-snug"
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
  );
}

function FeatureTextSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "feature-text" }>;
}) {
  return (
    <div className="max-w-3xl mx-auto w-full">
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
  );
}

// ─── Mock UI components ─────────────────────────────────────────────────────

function MockPhone({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[28px] md:rounded-[32px] p-4 md:p-5 mx-auto w-full max-w-[320px] md:max-w-[380px]"
      style={{
        background: "#091A10",
        border: "1px solid rgba(200,212,192,0.15)",
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(200,212,192,0.05)",
        margin: "40px auto",
      }}
    >
      {children}
    </div>
  );
}

/* ── Prayer Requests (the input + list view) ── */
function PrayerRequestsMock() {
  const requests = [
    {
      from: "Margaret W.",
      body: "For my mother, who begins treatment this week.",
      words: 4,
    },
    { from: "David R.", body: "Discernment about the new role.", words: 6 },
    {
      from: "Anonymous",
      body: "For peace in a difficult season.",
      words: 2,
    },
  ];
  return (
    <MockPhone>
      <div className="flex items-center gap-2 mb-3">
        <h2
          className="text-[14px] font-semibold"
          style={{ color: C.text, fontFamily: C.font }}
        >
          Prayer Requests 🙏🏽
        </h2>
        <div
          className="flex-1 h-px"
          style={{ background: "rgba(200,212,192,0.15)" }}
        />
      </div>
      <div className="flex gap-2 mb-3">
        <div
          className="flex-1 text-[12px] px-3 py-2.5 rounded-xl"
          style={{
            background: "#091A10",
            border: "1px solid rgba(46,107,64,0.3)",
            color: "rgba(143,175,150,0.5)",
            fontFamily: C.font,
          }}
        >
          Share a prayer request... 🌿
        </div>
        <div
          className="px-3 py-2.5 rounded-xl text-[12px]"
          style={{ background: "#2D5E3F", color: C.text }}
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
                i < 2 ? "1px solid rgba(200,212,192,0.12)" : "none",
            }}
          >
            <div
              className="w-0.5 self-stretch shrink-0"
              style={{ background: "#8FAF96" }}
            />
            <div className="flex-1 p-3 pl-2.5 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p
                  className="text-[9px] font-medium uppercase tracking-widest mb-0.5"
                  style={{ color: "rgba(200,212,192,0.45)" }}
                >
                  From {r.from}
                </p>
                <p
                  className="text-[12px] leading-relaxed"
                  style={{ color: C.text, fontFamily: C.font }}
                >
                  {r.body}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0 mt-1" style={{ color: "rgba(143,175,150,0.45)" }}>
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

/* ── BCP Intercessions — category list view (matches actual bcp-intercessions page) ── */
function BCPPrayerModeMock() {
  const categories = [
    { emoji: "⛪", name: "For the Church", count: 8, expanded: false },
    { emoji: "✝️", name: "For the Mission of the Church", count: 5, expanded: true, items: ["For the Spread of the Gospel", "For the Mission of the Church", "For Missionaries", "For our Enemies", "For Those Who Suffer for the Faith"] },
    { emoji: "🏛️", name: "For the Nation", count: 7, expanded: false },
  ];
  return (
    <MockPhone>
      <p className="text-[10px] mb-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
        ← Book of Common Prayer
      </p>
      <h2 className="text-[14px] font-bold mb-0.5" style={{ color: C.text, fontFamily: C.font }}>
        Intercessions 🙏🏽
      </h2>
      <p className="text-[9px] mb-2.5" style={{ color: C.sage }}>
        Prayers from the Book of Common Prayer
      </p>
      {/* Search */}
      <div
        className="rounded-lg px-2.5 py-1.5 mb-2.5 text-[10px]"
        style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.15)", color: "rgba(143,175,150,0.4)" }}
      >
        Search prayers...
      </div>
      <div className="space-y-1">
        {categories.map((cat, i) => (
          <div key={i}>
            <div
              className="flex items-center gap-2 rounded-lg px-2.5 py-2"
              style={{
                background: cat.expanded ? "rgba(46,107,64,0.2)" : "rgba(46,107,64,0.06)",
                border: `1px solid ${cat.expanded ? "rgba(46,107,64,0.4)" : "rgba(46,107,64,0.12)"}`,
              }}
            >
              <span className="text-[12px]">{cat.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold truncate" style={{ color: C.text, fontFamily: C.font }}>{cat.name}</p>
                {cat.count > 0 && <p className="text-[8px]" style={{ color: "rgba(143,175,150,0.45)" }}>{cat.count} prayers</p>}
              </div>
              <span className="text-[10px]" style={{ color: "rgba(143,175,150,0.4)" }}>{cat.expanded ? "⌄" : "›"}</span>
            </div>
            {cat.expanded && cat.items && (
              <div className="ml-6 space-y-0">
                {cat.items.map((item, j) => (
                  <div
                    key={j}
                    className="flex items-center justify-between px-2 py-1.5"
                    style={{ borderBottom: j < cat.items!.length - 1 ? "1px solid rgba(200,212,192,0.08)" : "none" }}
                  >
                    <p className="text-[9px]" style={{ color: C.sage }}>{item}</p>
                    <span className="text-[8px]" style={{ color: "rgba(143,175,150,0.3)" }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

/* ── Prayer List — the prayer list page view ── */
function PrayerListMock() {
  const items = [
    {
      name: "Margaret\u2019s mother",
      body: "Beginning treatment this week",
      held: "4 people praying",
      days: "5d left",
    },
    {
      name: "David\u2019s discernment",
      body: "About the new role",
      held: "6 people praying",
      days: "2d left",
    },
    {
      name: "Peace in a difficult season",
      body: "Anonymous request",
      held: "3 people praying",
      days: "4d left",
    },
    {
      name: "Sarah\u2019s recovery",
      body: "After surgery last week",
      held: "5 people praying",
      days: "1d left",
    },
  ];
  return (
    <MockPhone>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: C.text, fontFamily: C.font }}
      >
        🕯️ Prayer List
      </h2>
      <p className="text-[10px] mb-3" style={{ color: C.sage }}>
        What the community is holding together
      </p>
      <div
        className="h-px mb-3"
        style={{ background: "rgba(46,107,64,0.25)" }}
      />
      <div className="space-y-0">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex gap-0"
            style={{
              borderBottom:
                i < items.length - 1
                  ? "1px solid rgba(200,212,192,0.1)"
                  : "none",
            }}
          >
            <div
              className="w-0.5 self-stretch shrink-0"
              style={{ background: "#8FAF96" }}
            />
            <div className="flex-1 p-2.5 pl-2.5">
              <div className="flex justify-between items-baseline">
                <p
                  className="text-[12px] font-medium"
                  style={{ color: C.text, fontFamily: C.font }}
                >
                  {item.name}
                </p>
                <p
                  className="text-[9px]"
                  style={{ color: "rgba(143,175,150,0.4)" }}
                >
                  {item.days}
                </p>
              </div>
              <p
                className="text-[10px] mt-0.5"
                style={{ color: "rgba(143,175,150,0.6)" }}
              >
                {item.body}
              </p>
              <p
                className="text-[9px] mt-0.5"
                style={{ color: "rgba(143,175,150,0.7)" }}
              >
                🌿 {item.held}
              </p>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

/* ── Lectio Divina — responses view (matches actual app slideshow) ── */
function LectioMock() {
  const reflections = [
    {
      name: "Margaret",
      isYou: false,
      time: "Mon · 8am",
      text: "I keep returning to the moment they recognised him — and then he was gone. That sudden absence after recognition.",
    },
    {
      name: "You",
      isYou: true,
      time: "Today · 7am",
      text: "\"Hearts burning\" — the way ordinary moments can hold something we don't see until later.",
    },
    {
      name: "David",
      isYou: false,
      time: "Wed · 6pm",
      text: "The road itself. They were walking away from Jerusalem. Yet he met them there.",
    },
  ];
  return (
    <MockPhone>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.55)" }}>← Back</p>
        <div
          className="px-3 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: "rgba(19,44,29,0.85)", border: "1px solid rgba(200,212,192,0.15)", color: C.text }}
        >
          Menu
        </div>
        <div className="text-right">
          <p className="text-[9px] uppercase tracking-[0.18em]" style={{ color: "rgba(143,175,150,0.55)" }}>Stage 2</p>
          <p className="text-[10px]" style={{ color: C.sage }}>Luke 24:13–35</p>
        </div>
      </div>

      {/* Section label */}
      <p
        className="text-[9px] uppercase tracking-[0.18em] font-semibold mb-3"
        style={{ color: "rgba(143,175,150,0.45)" }}
      >
        What others heard
      </p>

      {/* Reflection cards */}
      <div className="space-y-2 mb-4">
        {reflections.map((r, i) => (
          <div
            key={i}
            className="rounded-xl px-3 py-2.5"
            style={{
              background: r.isYou ? "rgba(111,175,133,0.08)" : "#0F2818",
              border: `1px solid ${r.isYou ? "rgba(111,175,133,0.35)" : "rgba(200,212,192,0.15)"}`,
            }}
          >
            <div className="flex items-baseline justify-between mb-1">
              <p
                className="text-[9px] uppercase tracking-widest font-semibold"
                style={{ color: r.isYou ? "#6FAF85" : C.sage }}
              >
                {r.name}
              </p>
              <p className="text-[8px]" style={{ color: "rgba(143,175,150,0.45)" }}>{r.time}</p>
            </div>
            <p className="text-[11px] leading-[1.55]" style={{ color: C.text, fontFamily: C.font }}>
              {r.text}
            </p>
          </div>
        ))}
      </div>

      {/* Floating nav pill */}
      <div
        className="flex items-center justify-between rounded-full px-3 py-2"
        style={{ background: "rgba(19,44,29,0.92)", border: "1px solid rgba(200,212,192,0.15)" }}
      >
        <p className="text-[10px] font-semibold" style={{ color: C.text }}>Back</p>
        <p className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.55)" }}>Stage 2 · Meditatio</p>
        <div
          className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: "#2D5E3F", color: C.text }}
        >
          Next stage
        </div>
      </div>
    </MockPhone>
  );
}

/* ── Fasting — matches actual moment-detail.tsx water conservation UI ── */
function MeatFastMock() {
  return (
    <MockPhone>
      {/* Hero water impact card */}
      <div
        className="rounded-xl px-3.5 py-3 mb-3"
        style={{ background: "#0A1F12", border: "1px solid rgba(46,107,64,0.35)" }}
      >
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
          Conserving Water Together
        </p>
        <div className="flex items-end gap-1.5 mb-0.5">
          <span className="text-2xl font-bold tabular-nums" style={{ color: C.text, letterSpacing: "-0.03em" }}>18,400</span>
          <span className="text-[11px] mb-0.5" style={{ color: C.sage }}>gallons saved</span>
        </div>
        <p className="text-[9px] mb-3" style={{ color: "rgba(143,175,150,0.5)" }}>
          46 fast days × 400 gal per person
        </p>
        {/* Equivalences */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.18)" }}>
            <p className="text-[13px] font-bold" style={{ color: "#A8C5A0" }}>36,800</p>
            <p className="text-[8px] mt-0.5 leading-snug" style={{ color: "rgba(143,175,150,0.55)" }}>days of drinking water for one person</p>
          </div>
          <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.18)" }}>
            <p className="text-[13px] font-bold" style={{ color: "#A8C5A0" }}>526</p>
            <p className="text-[8px] mt-0.5 leading-snug" style={{ color: "rgba(143,175,150,0.55)" }}>bathtubs of water spared</p>
          </div>
        </div>
      </div>

      {/* Water stats grid — You / Group columns */}
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "rgba(200,212,192,0.4)" }}>
        Conserving Water Together
      </p>
      <div className="grid grid-cols-3 gap-1.5 mb-1">
        <div />
        <p className="text-[9px] text-center font-semibold uppercase tracking-wider" style={{ color: "rgba(200,212,192,0.45)" }}>You</p>
        <p className="text-[9px] text-center font-semibold uppercase tracking-wider" style={{ color: "rgba(200,212,192,0.45)" }}>Group</p>
      </div>
      <div className="space-y-1.5">
        {[
          { label: "This Week", you: "800", group: "2,400" },
          { label: "This Month", you: "3,200", group: "9,600" },
          { label: "All Time", you: "6,400", group: "18,400" },
        ].map((r, i) => (
          <div key={i} className="grid grid-cols-3 gap-1.5 items-center">
            <p className="text-[9px] font-medium" style={{ color: "rgba(200,212,192,0.55)" }}>{r.label}</p>
            <div className="rounded-lg px-1.5 py-1.5 text-center" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.18)" }}>
              <p className="text-[11px] font-bold tabular-nums" style={{ color: "#A8C5A0" }}>{r.you}</p>
            </div>
            <div className="rounded-lg px-1.5 py-1.5 text-center" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.15)" }}>
              <p className="text-[11px] font-bold tabular-nums" style={{ color: "#8FAF96" }}>{r.group}</p>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

/* ── Parish Calendar ── */
function CalendarMock() {
  return (
    <MockPhone>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: C.text, fontFamily: C.font }}
      >
        Parish Calendar
      </h2>
      <p className="text-[10px] mb-3" style={{ color: C.sage }}>
        What&apos;s happening this week
      </p>
      <div
        className="h-px mb-3"
        style={{ background: "rgba(111,175,133,0.25)" }}
      />
      <div className="space-y-2">
        {[
          {
            title: "🍞 Wednesday Supper",
            when: "Wed \u00b7 6:30 PM",
            place: "Parish Hall",
            people: "12 going",
          },
          {
            title: "📖 Lenten Study",
            when: "Thu \u00b7 7 PM",
            place: "Library",
            people: "8 going",
          },
          {
            title: "🙏🏽 Morning Prayer",
            when: "Sat \u00b7 8 AM",
            place: "Chapel",
            people: "4 regulars",
          },
          {
            title: "🎵 Evensong",
            when: "Sun \u00b7 5 PM",
            place: "Nave",
            people: "Open to all",
          },
        ].map((g, i) => (
          <div
            key={i}
            className="relative flex rounded-xl overflow-hidden"
            style={{
              background: "rgba(111,175,133,0.12)",
              border: `1px solid rgba(111,175,133,${i === 0 ? "0.4" : "0.2"})`,
            }}
          >
            <div
              className="w-1 flex-shrink-0"
              style={{ background: "#6FAF85" }}
            />
            <div className="flex-1 px-3 py-2.5">
              <p
                className="text-[12px] font-semibold"
                style={{ color: C.text, fontFamily: C.font }}
              >
                {g.title}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>
                {g.when}
              </p>
              <p
                className="text-[9px] mt-0.5"
                style={{ color: "rgba(143,175,150,0.5)" }}
              >
                {g.place} &middot; {g.people}
              </p>
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

/* ── Gatherings — timeline view (matches actual gatherings.tsx) ── */
function GatheringsMock() {
  const groups = [
    {
      label: "Today",
      highlight: true,
      events: [
        { time: "6:30 PM", title: "Wednesday Supper", location: "Parish Hall", people: "Margaret, David +4", kind: "ical" as const },
      ],
    },
    {
      label: "Thursday",
      highlight: false,
      events: [
        { time: "7:00 PM", title: "Lenten Study", location: "Library", people: "Anna, James +3", kind: "phoebe" as const },
      ],
    },
    {
      label: "Saturday",
      highlight: false,
      events: [
        { time: "8:00 AM", title: "Morning Prayer", location: "Chapel", people: "4 regulars", kind: "phoebe" as const },
      ],
    },
  ];
  return (
    <MockPhone>
      <h2 className="text-[14px] font-bold mb-0.5" style={{ color: C.text, fontFamily: C.font }}>
        Gatherings
      </h2>
      <div className="h-px mb-3" style={{ background: "rgba(200,212,192,0.1)" }} />
      <div className="space-y-3">
        {groups.map((g, gi) => (
          <div key={gi}>
            {/* Day header */}
            <div className="flex items-center gap-2 mb-1.5">
              <p
                className="text-[9px] font-bold uppercase tracking-widest shrink-0"
                style={{ color: g.highlight ? "#6FAF85" : "rgba(200,212,192,0.45)" }}
              >
                {g.label}
              </p>
              <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.1)" }} />
            </div>
            <div className="space-y-1.5">
              {g.events.map((ev, ei) => (
                <div
                  key={ei}
                  className="relative flex rounded-xl overflow-hidden"
                  style={{
                    background: ev.kind === "ical" ? "rgba(10,28,18,0.7)" : "#0F2818",
                    border: `1px solid ${ev.kind === "ical" ? "rgba(74,158,132,0.2)" : "rgba(92,138,95,0.28)"}`,
                  }}
                >
                  <div className="w-0.5 shrink-0" style={{ background: ev.kind === "ical" ? "#4A9E84" : "#5C8A5F" }} />
                  <div className="flex-1 px-2.5 py-2">
                    <p className="text-[9px] font-semibold tabular-nums" style={{ color: "rgba(143,175,150,0.7)" }}>{ev.time}</p>
                    <p className="text-[11px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>{ev.title}</p>
                    {ev.location && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin size={8} style={{ color: "rgba(143,175,150,0.5)" }} />
                        <span className="text-[9px]" style={{ color: "rgba(143,175,150,0.6)" }}>{ev.location}</span>
                      </div>
                    )}
                    {ev.people && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Users size={8} style={{ color: "rgba(143,175,150,0.5)" }} />
                        <span className="text-[9px]" style={{ color: "rgba(143,175,150,0.6)" }}>{ev.people}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </MockPhone>
  );
}

const MOCK_MAP: Record<string, () => JSX.Element> = {
  "prayer-requests": PrayerRequestsMock,
  bcp: BCPPrayerModeMock,
  "prayer-list": PrayerListMock,
  lectio: LectioMock,
  "meat-fast": MeatFastMock,
  calendar: CalendarMock,
  gatherings: GatheringsMock,
};

function FeatureDemoSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "feature-demo" }>;
}) {
  const Mock = MOCK_MAP[slide.variant];
  return (
    <div className="flex items-center justify-center w-full">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        {Mock ? <Mock /> : null}
      </motion.div>
    </div>
  );
}

function FeatureComboSlide({
  slide,
}: {
  slide: Extract<Slide, { kind: "feature-combo" }>;
}) {
  const Mock = MOCK_MAP[slide.mock];
  return (
    <div className="flex flex-col md:flex-row items-start md:items-center justify-center w-full max-w-5xl mx-auto gap-8 md:gap-16">
      {/* Text — left on desktop, full-width on mobile */}
      <div className="w-full md:max-w-md shrink-0">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3"
          style={{ color: "rgba(143,175,150,0.45)" }}
        >
          {slide.label}
        </p>
        <h2
          className="text-2xl md:text-3xl font-semibold mb-4 leading-tight"
          style={{ color: C.text, fontFamily: C.font }}
        >
          {slide.headline}
        </h2>
        <div className="space-y-3 md:space-y-4">
          {slide.body.map((p, i) => (
            <p
              key={i}
              className="text-sm md:text-base leading-relaxed font-light"
              style={{ color: C.sage, fontFamily: C.font, whiteSpace: "pre-line" }}
            >
              {p}
            </p>
          ))}
        </div>
      </div>
      {/* Mock — always visible for prayer-requests; hidden on mobile for others (they get a separate slide) */}
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.12, duration: 0.45 }}
        className="w-full md:w-auto flex justify-center shrink-0"
      >
        {Mock ? <Mock /> : null}
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

function ComboMockSlide({ slide }: { slide: Extract<Slide, { kind: "combo-mock" }> }) {
  const Mock = MOCK_MAP[slide.mock];
  return (
    <div className="flex items-center justify-center w-full">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.05, duration: 0.4 }}
      >
        {Mock ? <Mock /> : null}
      </motion.div>
    </div>
  );
}

function QuoteSlide({ slide }: { slide: Extract<Slide, { kind: "quote" }> }) {
  return (
    <div className="flex items-center justify-center max-w-3xl mx-auto text-center">
      <motion.p
        className="text-xl md:text-3xl font-semibold leading-snug md:leading-snug"
        style={{ fontFamily: C.font, whiteSpace: "pre-line" }}
        animate={{
          color: [C.sage, C.text, C.sage],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {slide.text}
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
    case "feature-text":
      return <FeatureTextSlide slide={slide} />;
    case "feature-demo":
      return <FeatureDemoSlide slide={slide} />;
    case "feature-combo":
      return <FeatureComboSlide slide={slide} />;
    case "combo-mock":
      return <ComboMockSlide slide={slide} />;
    case "quote":
      return <QuoteSlide slide={slide} />;
    case "closing":
      return <ClosingSlide slide={slide} />;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ChurchDeck() {
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const slides = SLIDES;

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, slides.length - 1)),
    [slides.length],
  );
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  // Auto-advance: 2s on slide 2 ("Here is what a week looks like"), 6s on all others
  useEffect(() => {
    if (index >= slides.length - 1) return undefined;
    const delay = index === 2 ? 2000 : 6000;
    const timer = setTimeout(next, delay);
    return () => clearTimeout(timer);
  }, [index, next, slides.length]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === "Escape") {
        setLocation("/");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, setLocation]);

  // Touch/swipe support
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    // Only count horizontal swipes (not vertical scrolling)
    if (absDx > 40 && absDx > absDy * 1.5) {
      if (dx < 0) next();      // swipe left → next
      else prev();             // swipe right → prev
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }, [next, prev]);

  // Click right half to advance
  const handleSlideClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Don't capture clicks on buttons/links
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("a")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width / 2) {
      next();
    }
  }, [next]);

  const slide = slides[index];
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: C.bg }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
              width: `${((index + 1) / slides.length) * 100}%`,
            }}
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
          {index + 1} / {slides.length}
        </span>
      </div>

      {/* Slide — click right half to advance */}
      <div
        className="flex-1 flex items-center justify-center px-5 md:px-16 py-8 md:py-12 overflow-y-auto cursor-pointer"
        onClick={handleSlideClick}
      >
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

      {/* Nav — positioned over slide so phone shadow isn't clipped */}
      <div className="flex items-center justify-between px-5 md:px-8 pb-5 md:pb-8 pt-6 relative z-10"
        style={{ background: "linear-gradient(to top, #091A10 60%, transparent)" }}>
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
