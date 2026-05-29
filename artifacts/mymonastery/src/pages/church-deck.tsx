import { useState, useEffect, useCallback, useRef, type ReactElement } from "react";
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
        | "prayer-notification"
        | "community-intercession"
        | "bcp"
        | "prayer-list"
        | "daily-office"
        | "prayer-rhythm"
        | "meat-fast"
        | "calendar"
        | "gatherings";
    }
  | {
      kind: "feature-combo";
      label: string;
      headline: string;
      body: string[];
      mock: "prayer-requests" | "prayer-notification" | "community-intercession" | "bcp" | "prayer-list" | "daily-office" | "prayer-rhythm" | "meat-fast" | "calendar" | "gatherings";
      stacked?: boolean;
    }
  | { kind: "combo-mock"; mock: "prayer-requests" | "prayer-notification" | "community-intercession" | "bcp" | "prayer-list" | "daily-office" | "prayer-rhythm" | "meat-fast" | "calendar" | "gatherings" }
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
    headline: "A place where prayers are shared and held.",
    body: [
      "Phoebe gives your community a place to share what they're carrying — joys, sorrows, the long quiet things — and to know those prayers are being held by others.",
    ],
    mock: "prayer-requests",
  },

  // ── Feature 1a: Notification when community prays for you ──
  // 6
  {
    kind: "feature-combo",
    label: "",
    headline: "You'll know you're being prayed for.",
    body: [
      "When someone shares a request, the community is gently notified — a quiet nudge, not a flood. People show up, leave a word, tap Amen.",
    ],
    mock: "prayer-notification",
    stacked: true,
  },

  // ── Feature 1b: Praying for the world together ──
  // 7
  {
    kind: "feature-combo",
    label: "",
    headline: "Pray for the world — together.",
    body: [
      "Beyond the prayers of your own community, Phoebe lifts up the wider ones: for justice, for peace, for the sick, for the suffering, for those in authority — drawn from the great intercessions of the Book of Common Prayer.",
    ],
    mock: "community-intercession",
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

  // ── Feature 3: The Daily Office ──
  // 8
  {
    kind: "feature-combo",
    label: "",
    headline: "The Daily Office",
    body: [
      "Morning and Evening Prayer from the Book of Common Prayer — the psalms, the lessons, the canticles, and the collects, assembled for today and ready to pray. A daily reminder keeps the hour.",
    ],
    mock: "daily-office",
  },

  // ── Feature 3b: Prayer Rhythm — daily habit of prayer ──
  // 9
  {
    kind: "feature-combo",
    label: "",
    headline: "A daily habit, held together.",
    body: [
      "For seventeen centuries, Christians have steadied their days by stopping to pray — morning and evening, in monasteries, in parishes, in kitchens. The Office has carried the faithful through plagues, exiles, and the long, ordinary middle.",
    ],
    mock: "prayer-rhythm",
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
      <div className="space-y-2">
        {/* Daily Office card */}
        <div className="flex rounded-xl overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}>
          <div className="w-1 shrink-0" style={{ background: "#5C8A5F" }} />
          <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>🌅 Morning Prayer</p>
              <p className="text-[10px] mt-0.5" style={{ color: C.sage }}>The Daily Office · BCP</p>
            </div>
            <div className="text-right shrink-0 flex flex-col items-end gap-1">
              <p className="text-[8px] uppercase tracking-wider font-semibold" style={{ color: "#C8D4C0" }}>This morning</p>
              <span className="text-[9px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "#2D5E3F", color: C.text }}>Pray</span>
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

      {/* Prayer requests — just one card */}
      <div className="flex items-center gap-2 mt-3 mb-2">
        <p className="text-[11px] font-bold" style={{ color: C.text }}>Prayer requests</p>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
      </div>
      <div
        className="rounded-xl px-3 py-2.5"
        style={{ background: "#0F2818", border: "1px solid rgba(92,138,95,0.28)" }}
      >
        <p className="text-[10px] font-semibold mb-0.5" style={{ color: C.sage }}>Margaret W.</p>
        <p className="text-[11px] leading-snug" style={{ color: C.text }}>For my mother, who begins treatment this week.</p>
        <p className="text-[9px] mt-1" style={{ color: "rgba(143,175,150,0.35)" }}>🙏 4 praying</p>
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
        margin: "0 auto",
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

/* ── Prayer Notification — iOS-style notification (standalone, no lock screen) ── */
function PrayerNotificationMock() {
  // iOS uses SF Pro / system fonts — keep the same here so the card
  // feels like an OS-level notification, not Phoebe's UI font.
  const iosFont =
    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro', Helvetica, Arial, sans-serif";
  return (
    <div
      className="relative rounded-[18px] md:rounded-[22px] px-4 md:px-5 py-3.5 md:py-4 flex gap-3 md:gap-3.5 items-start w-full max-w-[560px] mx-auto"
      style={{
        background: "rgba(44,46,49,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.06)",
        boxShadow:
          "0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)",
      }}
    >
      {/* App icon — real Phoebe icon */}
      <img
        src="/phoebe-app-icon.png"
        alt="Phoebe"
        className="w-[44px] h-[44px] md:w-[52px] md:h-[52px] rounded-[10px] md:rounded-[12px] shrink-0"
        style={{ objectFit: "cover" }}
      />
      {/* Floating timestamp — pulled out of the title row so both
          title and body get the full text-area width and share the
          same right edge. */}
      <p
        className="absolute text-[12px] md:text-[13px]"
        style={{
          top: "0.95rem",
          right: "1rem",
          color: "rgba(220,230,235,0.55)",
          fontFamily: iosFont,
        }}
      >
        now
      </p>
      <div className="flex-1 min-w-0 text-left pr-8 md:pr-10">
        <p
          className="text-[15px] md:text-[17px] font-semibold leading-snug mb-1"
          style={{ color: "#F5F5F5", fontFamily: iosFont, letterSpacing: "-0.01em" }}
        >
          You've been held in prayer today
        </p>
        <p
          className="text-[14px] md:text-[16px] leading-snug"
          style={{
            color: "rgba(230,235,240,0.92)",
            fontFamily: iosFont,
            letterSpacing: "-0.005em",
          }}
        >
          Theresa and others prayed for your requests today.
        </p>
      </div>
    </div>
  );
}

/* ── Community Intercession — prayer-mode card with multi-parish chips ── */
function CommunityIntercessionMock() {
  const parishes = [
    { emoji: "🕊️", name: "Heavenly Rest" },
    { emoji: "🌿", name: "NYC Leaders" },
    { emoji: "🌻", name: "St George's" },
    { emoji: "🙏🏽", name: "All Souls" },
  ];
  const avatars = ["#7FA98A", "#C8A26A", "#9AA8D4", "#B58B7C", "#8FAF96", "#A8A0BD"];
  const serif = "Georgia, 'Times New Roman', serif";
  return (
    <MockPhone>
      {/* Top close (×) */}
      <div className="flex items-center justify-end mb-3">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: "rgba(200,212,192,0.08)" }}
        >
          <span className="text-[10px]" style={{ color: "rgba(200,212,192,0.5)" }}>×</span>
        </div>
      </div>

      {/* Eyebrow */}
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold text-center mb-1.5"
        style={{ color: "rgba(143,175,150,0.6)", fontFamily: C.font }}
      >
        Community Intercession
      </p>

      {/* Title */}
      <h2
        className="text-[18px] italic text-center mb-3"
        style={{ color: C.text, fontFamily: serif }}
      >
        For Social Justice
      </h2>

      {/* Parish chips */}
      <div className="flex flex-wrap gap-1.5 justify-center mb-3 px-2">
        {parishes.map((p, i) => (
          <div
            key={i}
            className="px-2 py-0.5 rounded-full text-[9px] font-medium flex items-center gap-1"
            style={{
              background: "rgba(46,107,64,0.18)",
              border: "1px solid rgba(46,107,64,0.4)",
              color: C.text,
              fontFamily: C.font,
            }}
          >
            <span>{p.emoji}</span>
            <span>{p.name}</span>
          </div>
        ))}
      </div>

      {/* Avatar row */}
      <div className="flex items-center justify-center mb-1.5">
        {avatars.map((bg, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-full"
            style={{
              background: bg,
              border: "1.5px solid #091A10",
              marginLeft: i === 0 ? 0 : -4,
            }}
          />
        ))}
      </div>
      <p
        className="text-[9px] text-center mb-3 italic"
        style={{ color: "rgba(200,212,192,0.55)", fontFamily: serif }}
      >
        7 people have prayed this this week.
      </p>

      {/* Prayer text card */}
      <div
        className="rounded-xl px-3 py-2.5 mb-3"
        style={{
          background: "rgba(46,107,64,0.06)",
          border: "1px solid rgba(46,107,64,0.18)",
        }}
      >
        <p
          className="text-[10px] leading-[1.55] italic mb-2"
          style={{ color: C.text, fontFamily: serif }}
        >
          Grant, O God, that your holy and life-giving Spirit may so move every
          human heart, and especially the hearts of the people of this land,
          that barriers which divide us may crumble, suspicions disappear, and
          hatreds cease; that our divisions being healed, we may live in
          justice and peace; through Jesus Christ our Lord. Amen.
        </p>
        <p
          className="text-[8px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)", fontFamily: C.font }}
        >
          From the Book of Common Prayer
        </p>
      </div>

      {/* Amen CTA */}
      <div className="flex flex-col items-center gap-1.5">
        <div
          className="px-5 py-1.5 rounded-full text-[11px] font-semibold"
          style={{ background: "#2D5E3F", color: C.text, fontFamily: C.font }}
        >
          Amen →
        </div>
        <p
          className="text-[9px]"
          style={{ color: "rgba(200,212,192,0.45)", fontFamily: C.font, textDecoration: "underline" }}
        >
          Not today
        </p>
        <p
          className="text-[9px] mt-0.5"
          style={{ color: "rgba(143,175,150,0.4)", fontFamily: C.font }}
        >
          1 of 11
        </p>
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

/* ── The Daily Office — Evening Prayer psalm slide (matches actual app office) ── */
function DailyOfficeMock() {
  const verses = [
    {
      n: 121,
      line1: "I have done what is just and right;",
      line2: "do not deliver me to my oppressors.",
    },
    {
      n: 122,
      line1: "Be surety for your servant's good;",
      line2: "let not the proud oppress me.",
    },
    {
      n: 123,
      line1: "My eyes have failed from watching for your salvation",
      line2: "and for your righteous promise.",
    },
    {
      n: 124,
      line1: "Deal with your servant according to your loving-kindness",
      line2: "and teach me your statutes.",
    },
  ];
  const serif = "Georgia, 'Times New Roman', serif";
  return (
    <MockPhone>
      {/* Header bar: ← Back / Evening Prayer pill / spacer */}
      <div className="flex items-center justify-between mb-4">
        <p
          className="text-[11px]"
          style={{ color: "rgba(143,175,150,0.55)" }}
        >
          ← Back
        </p>
        <div
          className="px-3 py-1 rounded-full text-[10px] font-semibold"
          style={{
            background: "rgba(19,44,29,0.85)",
            border: "1px solid rgba(200,212,192,0.18)",
            color: C.text,
            fontFamily: C.font,
          }}
        >
          Evening Prayer
        </div>
        <div className="w-[40px]" />
      </div>

      {/* Eyebrow */}
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-3 text-center"
        style={{ color: "rgba(143,175,150,0.6)", fontFamily: C.font }}
      >
        Psalm 119:121&ndash;144
      </p>

      {/* Verses */}
      <div className="mb-4">
        {verses.map((v) => (
          <div key={v.n} className="mb-2.5">
            <div className="flex gap-2">
              <span
                className="text-[10px] leading-[1.55] shrink-0 pt-[1px]"
                style={{ color: C.sage, fontFamily: serif, fontVariantNumeric: "tabular-nums" }}
              >
                {v.n}
              </span>
              <div className="flex-1">
                <p
                  className="text-[11px] leading-[1.55]"
                  style={{ color: C.text, fontFamily: serif }}
                >
                  {v.line1}{" "}
                  <span style={{ color: C.sage }}>*</span>
                </p>
                <p
                  className="text-[11px] leading-[1.55] pl-3"
                  style={{ color: C.text, fontFamily: serif }}
                >
                  {v.line2}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-3 text-center"
        style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}
      >
        BCP p. 763
      </p>

      {/* Floating nav pill: Back / 8 · PSALM / Next */}
      <div
        className="flex items-center justify-between rounded-full px-3 py-2"
        style={{
          background: "rgba(19,44,29,0.92)",
          border: "1px solid rgba(200,212,192,0.15)",
        }}
      >
        <p
          className="text-[10px] font-semibold"
          style={{ color: "rgba(200,212,192,0.6)", fontFamily: C.font }}
        >
          Back
        </p>
        <p
          className="text-[9px] uppercase tracking-[0.22em]"
          style={{ color: "rgba(143,175,150,0.7)", fontFamily: C.font }}
        >
          8 · Psalm
        </p>
        <div
          className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: "#2D5E3F", color: C.text, fontFamily: C.font }}
        >
          Next
        </div>
      </div>
    </MockPhone>
  );
}

/* ── Prayer Rhythm — daily habit / Past 7 days (matches actual app) ── */
function PrayerRhythmMock() {
  // 7 days of prayer this week — morning row all green, evening row mostly purple with one miss
  const morning = [true, true, true, true, true, true, true];
  const evening = [true, true, true, true, true, false, true];
  const dayLetters = ["T", "F", "S", "S", "M", "T", "W"];
  return (
    <MockPhone>
      {/* Top close (×) */}
      <div className="flex items-center justify-end mb-2">
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: "rgba(200,212,192,0.08)" }}
        >
          <span className="text-[10px]" style={{ color: "rgba(200,212,192,0.5)" }}>×</span>
        </div>
      </div>

      {/* Title block */}
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold text-center mb-1"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        Today
      </p>
      <h2
        className="text-[15px] font-semibold text-center mb-3"
        style={{ color: C.text, fontFamily: C.font }}
      >
        Your prayer rhythm
      </h2>

      {/* Morning card */}
      <div
        className="rounded-xl px-3 py-2 mb-2 flex items-center gap-2"
        style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)" }}
      >
        <span className="text-[14px]">🌅</span>
        <p
          className="text-[12px] font-semibold flex-1"
          style={{ color: C.text, fontFamily: C.font }}
        >
          Morning
        </p>
        <div
          className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
          style={{ background: "rgba(46,107,64,0.5)", color: C.text, fontFamily: C.font }}
        >
          Completed ✓
        </div>
      </div>

      {/* Evening card */}
      <div
        className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2"
        style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)" }}
      >
        <span className="text-[14px]">🌙</span>
        <p
          className="text-[12px] font-semibold flex-1"
          style={{ color: C.text, fontFamily: C.font }}
        >
          Evening
        </p>
        <div
          className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
          style={{ background: "rgba(46,107,64,0.5)", color: C.text, fontFamily: C.font }}
        >
          Completed ✓
        </div>
      </div>

      {/* Past 7 days */}
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold text-center mb-2"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        Past 7 Days
      </p>
      <div className="grid grid-cols-8 gap-1 mb-2 px-1">
        <div />
        {dayLetters.map((d, i) => (
          <p
            key={i}
            className="text-[9px] text-center"
            style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
          >
            {d}
          </p>
        ))}
        {/* Morning row */}
        <span className="text-[12px] text-center">🌅</span>
        {morning.map((done, i) => (
          <div key={`m${i}`} className="flex items-center justify-center">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: done ? "#7FA98A" : "transparent",
                border: done ? "none" : "1px solid rgba(127,169,138,0.3)",
              }}
            />
          </div>
        ))}
        {/* Evening row */}
        <span className="text-[12px] text-center">🌙</span>
        {evening.map((done, i) => (
          <div key={`e${i}`} className="flex items-center justify-center">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: done ? "#9AA8D4" : "transparent",
                border: done ? "none" : "1px solid rgba(154,168,212,0.3)",
              }}
            />
          </div>
        ))}
      </div>
      <p
        className="text-[10px] text-center mb-3"
        style={{ color: "rgba(200,212,192,0.55)", fontFamily: C.font }}
      >
        7 days of prayer this week
      </p>

      {/* Bottom pills */}
      <div className="flex flex-col items-center gap-1.5">
        <div
          className="px-3 py-1 rounded-full text-[10px]"
          style={{
            border: "1px solid rgba(200,212,192,0.18)",
            color: C.text,
            fontFamily: C.font,
          }}
        >
          Reminders →
        </div>
        <div
          className="px-3 py-1 rounded-full text-[10px]"
          style={{
            border: "1px solid rgba(200,212,192,0.18)",
            color: C.text,
            fontFamily: C.font,
          }}
        >
          🕯️ Ignatian Examen →
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

const MOCK_MAP: Record<string, () => ReactElement> = {
  "prayer-requests": PrayerRequestsMock,
  "prayer-notification": PrayerNotificationMock,
  "community-intercession": CommunityIntercessionMock,
  bcp: BCPPrayerModeMock,
  "prayer-list": PrayerListMock,
  "daily-office": DailyOfficeMock,
  "prayer-rhythm": PrayerRhythmMock,
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
  if (slide.stacked) {
    return (
      <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto gap-8 text-center">
        <div className="w-full">
          {slide.label && (
            <p
              className="text-[10px] font-bold uppercase tracking-[0.18em] mb-3"
              style={{ color: "rgba(143,175,150,0.45)" }}
            >
              {slide.label}
            </p>
          )}
          <h2
            className="text-2xl md:text-3xl font-semibold mb-4 leading-tight"
            style={{ color: C.text, fontFamily: C.font }}
          >
            {slide.headline}
          </h2>
          <div className="space-y-3 md:space-y-4 max-w-xl mx-auto">
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
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.45 }}
          className="w-full flex justify-center"
        >
          {Mock ? <Mock /> : null}
        </motion.div>
      </div>
    );
  }
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
  const [autoPlay, setAutoPlay] = useState(true);
  const slides = SLIDES;

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, slides.length - 1)),
    [slides.length],
  );
  const prev = useCallback(() => {
    setAutoPlay(false); // Going back stops auto-advance
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Auto-advance every 7s (slide 2 = 2s) — stops when user goes back
  useEffect(() => {
    if (!autoPlay) return;
    if (index >= slides.length - 1) return; // don't auto-advance past last slide
    const delay = index === 2 ? 3000 : 10000;
    const timer = setTimeout(() => next(), delay);
    return () => clearTimeout(timer);
  }, [index, autoPlay, slides.length, next]);

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
    } else {
      prev();
    }
  }, [next, prev]);

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
