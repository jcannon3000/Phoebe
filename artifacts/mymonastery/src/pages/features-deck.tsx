import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

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

function buildSlides(t: TFunction): Slide[] {
  return [
  // 1 — Title
  {
    kind: "title",
    headline: t("features_deck.title_headline"),
    sub: t("features_deck.title_sub"),
  },

  // 2 — Setup
  {
    kind: "statement",
    headline: t("features_deck.setup_headline"),
    body: [
      t("features_deck.setup_body_1"),
      t("features_deck.setup_body_2"),
    ],
  },

  // 3 — Cards overview
  {
    kind: "cards",
    headline: t("features_deck.overview_headline"),
    cards: [
      {
        label: t("features_deck.overview_card_office_label"),
        lines: [
          t("features_deck.overview_card_office_line_1"),
          t("features_deck.overview_card_office_line_2"),
          t("features_deck.overview_card_office_line_3"),
        ],
      },
      {
        label: t("features_deck.overview_card_intercession_label"),
        lines: [
          t("features_deck.overview_card_intercession_line_1"),
          t("features_deck.overview_card_intercession_line_2"),
          t("features_deck.overview_card_intercession_line_3"),
        ],
      },
      {
        label: t("features_deck.overview_card_requests_label"),
        lines: [
          t("features_deck.overview_card_requests_line_1"),
          t("features_deck.overview_card_requests_line_2"),
          t("features_deck.overview_card_requests_line_3"),
        ],
      },
    ],
  },

  // ── Prayer Requests ────────────────────────────────────────────────────────
  // 4 — Intro to prayer requests
  {
    kind: "statement",
    headline: t("features_deck.requests_intro_headline"),
    body: [
      t("features_deck.requests_intro_body_1"),
      t("features_deck.requests_intro_body_2"),
    ],
  },

  // 5 — Preview: Prayer requests
  {
    kind: "preview",
    variant: "prayer-requests",
    caption: t("features_deck.requests_preview_caption"),
    sub: t("features_deck.requests_preview_sub"),
  },

  // 6 — Progressive: what happens when you respond
  {
    kind: "progressive",
    headline: t("features_deck.requests_progressive_headline"),
    lines: [
      { text: t("features_deck.requests_progressive_line_1"), color: C.dim2 },
      { text: t("features_deck.requests_progressive_line_2"), color: C.dim3 },
      { text: t("features_deck.requests_progressive_line_3"), color: C.dim4 },
      { text: t("features_deck.requests_progressive_line_4"), color: C.dim5 },
      { text: t("features_deck.requests_progressive_line_5"), color: C.accent },
    ],
  },

  // ── Intercession ───────────────────────────────────────────────────────────
  // 7 — Intro to intercession
  {
    kind: "statement",
    headline: t("features_deck.intercession_intro_headline"),
    body: [
      t("features_deck.intercession_intro_body_1"),
      t("features_deck.intercession_intro_body_2"),
    ],
  },

  // 8 — Preview: Intercession slideshow
  {
    kind: "preview",
    variant: "intercession",
    caption: t("features_deck.intercession_preview_caption"),
    sub: t("features_deck.intercession_preview_sub"),
  },

  // 9 — Stacked: what this recovers
  {
    kind: "stacked",
    headline: t("features_deck.intercession_stacked_headline"),
    items: [
      t("features_deck.intercession_stacked_item_1"),
      t("features_deck.intercession_stacked_item_2"),
      t("features_deck.intercession_stacked_item_3"),
      t("features_deck.intercession_stacked_item_4"),
    ],
    tail: [
      t("features_deck.intercession_stacked_tail"),
    ],
  },

  // ── The Daily Office ───────────────────────────────────────────────────────
  // 10 — Intro to the Daily Office
  {
    kind: "statement",
    headline: t("features_deck.office_intro_headline"),
    body: [
      t("features_deck.office_intro_body_1"),
      t("features_deck.office_intro_body_2"),
    ],
  },

  // 11 — Preview: Daily Office
  {
    kind: "preview",
    variant: "daily-office",
    caption: t("features_deck.office_preview_caption"),
    sub: t("features_deck.office_preview_sub"),
  },

  // 12 — Stacked: the shape of the office
  {
    kind: "stacked",
    headline: t("features_deck.office_stacked_headline"),
    items: [
      t("features_deck.office_stacked_item_1"),
      t("features_deck.office_stacked_item_2"),
      t("features_deck.office_stacked_item_3"),
    ],
    tail: [
      t("features_deck.office_stacked_tail"),
    ],
  },

  // 13 — Closing
  {
    kind: "closing",
    above: [
      t("features_deck.closing_above_1"),
      t("features_deck.closing_above_2"),
      t("features_deck.closing_above_3"),
    ],
    featured: t("features_deck.closing_featured"),
  },
  ];
}

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
          {slide.tail.map((tailLine, i) => (
            <p
              key={i}
              className="text-sm md:text-lg leading-relaxed font-light italic"
              style={{ color: "rgba(143,175,150,0.75)", fontFamily: C.font }}
            >
              {tailLine}
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
  const { t } = useTranslation();
  const requests = [
    { from: t("features_deck.mock_requests_from_1"), body: t("features_deck.mock_requests_body_1"), words: 4 },
    { from: t("features_deck.mock_requests_from_2"), body: t("features_deck.mock_requests_body_2"), words: 6 },
    { from: t("features_deck.mock_requests_from_3"), body: t("features_deck.mock_requests_body_3"), words: 2 },
  ];
  return (
    <MockPhone>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold shrink-0" style={{ color: "#F0EDE6", fontFamily: C.font }}>
          {t("features_deck.mock_requests_header")} 🙏🏽
        </h2>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
      </div>

      {/* Input row */}
      <div className="flex gap-2 mb-4">
        <div
          className="flex-1 text-[11px] px-3 py-2 rounded-xl"
          style={{ background: "#091A10", border: "1px solid rgba(46,107,64,0.3)", color: "rgba(143,175,150,0.5)", fontFamily: C.font }}
        >
          {t("features_deck.mock_requests_input_placeholder")} 🌿
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
                  {t("features_deck.mock_requests_from_label", { name: r.from })}
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
  const { t } = useTranslation();
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
          {t("features_deck.mock_intercession_eyebrow")}
        </p>

        <p
          className="text-[16px] md:text-[17px] leading-[1.5] font-medium italic mb-3"
          style={{
            color: "#E8E4D8",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          {t("features_deck.mock_intercession_intention")}
        </p>

        <p
          className="text-[11px] mb-2"
          style={{ color: "#8FAF96", fontFamily: C.font }}
        >
          {t("features_deck.mock_intercession_with")}
        </p>

        <p
          className="text-[10px] italic mb-5"
          style={{
            color: "rgba(143,175,150,0.55)",
            fontFamily: C.font,
          }}
        >
          {t("features_deck.mock_intercession_holding")}
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
            {t("features_deck.mock_intercession_prayer")}
          </p>
          <p
            className="text-[7px] uppercase mt-2"
            style={{
              color: "rgba(143,175,150,0.3)",
              letterSpacing: "0.14em",
              fontFamily: C.font,
            }}
          >
            {t("features_deck.mock_intercession_source")}
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
          {t("features_deck.mock_intercession_amen")} →
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
          {t("features_deck.mock_intercession_progress", { current: 3, total: 6 })}
        </p>
      </div>
    </div>
  );
}

// ─── Daily Office mock ───────────────────────────────────────────────────────
function DailyOfficeMock() {
  const { t } = useTranslation();
  const sections = [
    { label: t("features_deck.mock_office_section_opening"), done: true, active: false },
    { label: t("features_deck.mock_office_section_invitatory"), done: true, active: false },
    { label: t("features_deck.mock_office_section_psalter"), done: false, active: true },
    { label: t("features_deck.mock_office_section_lessons"), done: false, active: false },
    { label: t("features_deck.mock_office_section_canticles"), done: false, active: false },
    { label: t("features_deck.mock_office_section_prayers"), done: false, active: false },
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
        {t("features_deck.mock_office_eyebrow")} 🌅
      </p>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: "#F0EDE6", fontFamily: C.font }}
      >
        {t("features_deck.mock_office_title")}
      </h2>
      <p
        className="text-[9px] mb-3"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        {t("features_deck.mock_office_reference", { page: 75 })}
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
          {t("features_deck.mock_office_psalm_label", { number: 63 })}
        </p>
        <p
          className="text-[11px] leading-[1.6] italic"
          style={{
            color: "#E8E4D8",
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}
        >
          {t("features_deck.mock_office_psalm_text")}
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
  const { t } = useTranslation();
  return (
    <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-16 max-w-5xl mx-auto w-full">
      {/* Copy — always visible */}
      <div className="text-center md:text-left max-w-md">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-2 md:mb-3"
          style={{ color: C.sage, fontFamily: C.font }}
        >
          {t("features_deck.preview_eyebrow")}
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
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [index, setIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // On mobile, expand each "preview" slide into [copy-only, mock-only]
  const baseSlides = buildSlides(t);
  const slides: Slide[] = isMobile
    ? baseSlides.flatMap((s): Slide[] =>
        s.kind === "preview"
          ? [s, { kind: "preview-mock" as const, variant: s.variant }]
          : [s]
      )
    : baseSlides;

  const next = useCallback(
    () => setIndex((i) => Math.min(i + 1, slides.length - 1)),
    [slides.length],
  );
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack shortcuts (Cmd+Arrow = line jump) or typing in a field.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
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
          <span className="hidden md:inline">{t("features_deck.nav_close")}</span>
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
              aria-label={t("features_deck.nav_go_to_slide", { n: i + 1 })}
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
          {t("features_deck.nav_back")}
        </button>
        {clampedIndex === slides.length - 1 ? (
          <button
            onClick={() => setLocation("/learn")}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            {t("features_deck.nav_done")} 🌿
            <ChevronRight size={18} />
          </button>
        ) : (
          <button
            onClick={next}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            {t("features_deck.nav_next")}
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
