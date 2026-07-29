import { useState, useEffect, useCallback, useRef, type ReactElement } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, MessageCircle, MapPin, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAuth } from "@/hooks/useAuth";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  bg: "#091A10",
  card: "#0F2818",
  text: "#F0EDE6",
  sage: "#8FAF96",
  font: "'Space Grotesk', sans-serif",
} as const;

// ─── Slide types ────────────────────────────────────────────────────────────
export type Slide =
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
        | "office-formats"
        | "prayer-rhythm"
        | "daily-reminder"
        | "prayer-streak"
        | "meat-fast"
        | "calendar"
        | "gatherings";
    }
  | {
      kind: "feature-combo";
      label: string;
      headline: string;
      body: string[];
      mock: "dashboard" | "prayer-requests" | "prayer-notification" | "community-intercession" | "bcp" | "prayer-list" | "daily-office" | "office-formats" | "prayer-rhythm" | "daily-reminder" | "prayer-streak" | "meat-fast" | "calendar" | "gatherings" | "customizer" | "office-fdd" | "leader-rule";
      stacked?: boolean;
    }
  | { kind: "combo-mock"; mock: "prayer-requests" | "prayer-notification" | "community-intercession" | "bcp" | "prayer-list" | "daily-office" | "prayer-rhythm" | "meat-fast" | "calendar" | "gatherings" }
  | { kind: "quote"; text: string }
  | { kind: "closing"; body: string[]; featured: string[] };

// ─── Slides ─────────────────────────────────────────────────────────────────
function buildSlides(t: TFunction): Slide[] {
  return [
  // 1 — Title
  {
    kind: "title",
    headline: "Phoebe",
    sub: t("church_deck.title_sub"),
    mock: "dashboard",
  },

  // 2 — The opening
  {
    kind: "statement",
    headline: t("church_deck.opening_headline"),
    body: [
      t("church_deck.opening_body"),
    ],
  },

  // 4 — The week (centered, auto-advances after 2s)
  {
    kind: "title",
    headline: t("church_deck.week_headline"),
    muted: true,
  },

  // ─────────────────────────────────────────────────────────────
  // The root: the Daily Office — the prayer the Church hands you
  // ─────────────────────────────────────────────────────────────

  // The Daily Office
  {
    kind: "feature-combo",
    label: "",
    headline: t("church_deck.office_headline"),
    body: [
      t("church_deck.office_body"),
    ],
    mock: "daily-office",
  },

  // One office, prayed your way
  {
    kind: "feature-combo",
    label: "",
    headline: t("church_deck.formats_headline"),
    body: [
      t("church_deck.formats_body"),
    ],
    mock: "office-formats",
  },

  // A rhythm, held together — Daily Progress (position, not score)
  {
    kind: "feature-combo",
    label: "",
    headline: t("church_deck.rhythm_headline"),
    body: [
      t("church_deck.rhythm_body"),
    ],
    mock: "prayer-streak",
  },

  // A gentle reminder calls you back each day
  {
    kind: "feature-combo",
    label: "",
    headline: t("church_deck.habit_remind_headline"),
    body: [
      t("church_deck.habit_remind_body"),
    ],
    mock: "daily-reminder",
    stacked: true,
  },

  // ─────────────────────────────────────────────────────────────
  // Praying in common: the world's needs, the BCP intercessions
  // ─────────────────────────────────────────────────────────────

  // Praying for the world together
  {
    kind: "feature-combo",
    label: "",
    headline: t("church_deck.world_headline"),
    body: [
      t("church_deck.world_body"),
    ],
    mock: "community-intercession",
  },

  // BCP Intercessions
  {
    kind: "feature-combo",
    label: "",
    headline: t("church_deck.bcp_headline"),
    body: [
      t("church_deck.bcp_body"),
    ],
    mock: "bcp",
  },

  // ─────────────────────────────────────────────────────────────
  // The fruit: praying for one another in your own community
  // ─────────────────────────────────────────────────────────────

  // Prayer Requests
  {
    kind: "feature-combo",
    label: "",
    headline: t("church_deck.requests_headline"),
    body: [
      t("church_deck.requests_body"),
    ],
    mock: "prayer-requests",
  },

  // The community is gently notified when it prays for you
  {
    kind: "feature-combo",
    label: "",
    headline: t("church_deck.notification_headline"),
    body: [
      t("church_deck.notification_body"),
    ],
    mock: "prayer-notification",
    stacked: true,
  },

  // 17 — Gatherings (text + mock on one slide)
  {
    kind: "feature-combo",
    label: "",
    headline: t("church_deck.gatherings_headline"),
    body: [
      t("church_deck.gatherings_body"),
    ],
    mock: "gatherings",
  },

  // — Murthy quote
  {
    kind: "quote",
    text: t("church_deck.murthy_quote"),
  },

  // 19 — Closing
  {
    kind: "closing",
    body: [],
    featured: [t("church_deck.closing_featured")],
  },
  ];
}

// ─── Slide renderers ─────────────────────────────────────────────────────────

/* ── Dashboard Mock — the current home screen ── */
// Rebuilt to match today's dashboard: the app header (Phoebe · Daily progress ·
// Menu), the date + liturgical tagline, then the module cards in their real
// order and palette — the Book-of-Common-Prayer office hero ("Begin prayer")
// and the teal Contemplation card.
function DashboardMock() {
  const { t } = useTranslation();
  const dot = (filled: boolean, key: number) => (
    <span
      key={key}
      className="w-1 h-1 rounded-full"
      style={filled ? { background: "#7FA98A" } : { border: "1px solid rgba(127,169,138,0.4)" }}
    />
  );
  return (
    <MockPhone>
      {/* App header — Phoebe · Daily progress · Menu */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[15px] font-bold" style={{ color: C.text, fontFamily: C.font }}>Phoebe</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[8px] px-2 py-1 rounded-full" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.25)", color: C.sage, fontFamily: C.font }}>
            {t("church_deck.mock_home_progress")}
            <span className="inline-flex gap-0.5 ml-0.5 items-center">{[true, true, false, false].map((f, i) => dot(f, i))}</span>
          </span>
          <span className="text-[8px] px-2 py-1 rounded-full" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.25)", color: C.sage, fontFamily: C.font }}>{t("church_deck.mock_home_menu")}</span>
        </div>
      </div>

      {/* Date + liturgical tagline */}
      <p className="text-[14px] font-semibold leading-tight" style={{ color: C.text, fontFamily: C.font }}>{t("church_deck.mock_home_date")}</p>
      <p className="text-[7.5px] uppercase tracking-[0.14em] mb-3 mt-0.5" style={{ color: "rgba(143,175,150,0.45)", fontFamily: C.font }}>{t("church_deck.mock_home_tagline")}</p>

      {/* Hero — Simple Guided Prayer, the new-user default. Matches the
          real GuidedPrayerHomeCard hero: leading emoji (not an eyebrow),
          title, subtitle, full-width CTA. No avatar row — the home no
          longer shows "prayed with" faces next to a practice's CTA. */}
      <div className="rounded-xl overflow-hidden flex mb-2" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.4)" }}>
        <div className="w-1 flex-shrink-0" style={{ background: "rgba(46,107,64,0.9)" }} />
        <div className="flex-1 px-3 py-3">
          <div className="flex items-start gap-2">
            <span className="text-[19px] leading-none flex-shrink-0">🙌</span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>{t("church_deck.mock_home_office_title")}</p>
              <p className="text-[9px] mt-0.5" style={{ color: "rgba(143,175,150,0.7)", fontFamily: C.font }}>{t("church_deck.mock_home_office_sub")}</p>
            </div>
          </div>
          <div className="text-[10px] font-semibold text-center px-3 py-1.5 rounded-full mt-2.5" style={{ background: "rgba(46,107,64,0.22)", color: C.text, border: "1px solid rgba(46,107,64,0.45)", fontFamily: C.font }}>{t("church_deck.mock_home_office_cta")} →</div>
        </div>
      </div>

      {/* Contemplation — teal */}
      <div className="rounded-xl overflow-hidden flex" style={{ background: "rgba(62,124,122,0.12)", border: "1px solid rgba(62,124,122,0.35)" }}>
        <div className="w-1 flex-shrink-0" style={{ background: "rgba(62,124,122,0.85)" }} />
        <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>{t("church_deck.mock_home_contemplation")} 🕯️</p>
            <p className="text-[9px] mt-0.5" style={{ color: "rgba(143,175,150,0.8)", fontFamily: C.font }}>{t("church_deck.mock_home_contemplation_sub")}</p>
          </div>
          <div className="text-[10px] font-semibold px-3 py-1 rounded-full shrink-0" style={{ background: "rgba(62,124,122,0.28)", color: C.text, border: "1px solid rgba(62,124,122,0.45)", fontFamily: C.font }}>{t("church_deck.mock_home_begin")} →</div>
        </div>
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
  const { t } = useTranslation();
  const requests = [
    {
      from: t("church_deck.mock_requests_from_margaret"),
      body: t("church_deck.mock_requests_body_margaret"),
      words: 4,
    },
    { from: t("church_deck.mock_requests_from_david"), body: t("church_deck.mock_requests_body_david"), words: 6 },
    {
      from: t("church_deck.mock_requests_from_anonymous"),
      body: t("church_deck.mock_requests_body_peace"),
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
          {t("church_deck.mock_requests_title")} 🙏🏽
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
          {t("church_deck.mock_requests_placeholder")} 🌿
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
                  {t("church_deck.mock_requests_from_label", { name: r.from })}
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
  const { t } = useTranslation();
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
        {t("church_deck.mock_notification_now")}
      </p>
      <div className="flex-1 min-w-0 text-left pr-8 md:pr-10">
        <p
          className="text-[15px] md:text-[17px] font-semibold leading-snug mb-1"
          style={{ color: "#F5F5F5", fontFamily: iosFont, letterSpacing: "-0.01em" }}
        >
          {t("church_deck.mock_notification_title")}
        </p>
        <p
          className="text-[14px] md:text-[16px] leading-snug"
          style={{
            color: "rgba(230,235,240,0.92)",
            fontFamily: iosFont,
            letterSpacing: "-0.005em",
          }}
        >
          {t("church_deck.mock_notification_body")}
        </p>
      </div>
    </div>
  );
}

/* ── Community Intercession — prayer-mode card with multi-parish chips ── */
function CommunityIntercessionMock() {
  const { t } = useTranslation();
  const parishes = [
    { emoji: "🕊️", name: "St. Aidan's" },
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
        {t("church_deck.mock_intercession_eyebrow")}
      </p>

      {/* Title */}
      <h2
        className="text-[18px] italic text-center mb-3"
        style={{ color: C.text, fontFamily: serif }}
      >
        {t("church_deck.mock_intercession_title")}
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
        {t("church_deck.mock_intercession_prayed_count", { count: 7 })}
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
          {t("church_deck.mock_intercession_prayer_text")}
        </p>
        <p
          className="text-[8px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: "rgba(143,175,150,0.45)", fontFamily: C.font }}
        >
          {t("church_deck.mock_intercession_source")}
        </p>
      </div>

      {/* Amen CTA */}
      <div className="flex flex-col items-center gap-1.5">
        <div
          className="px-5 py-1.5 rounded-full text-[11px] font-semibold"
          style={{ background: "#2D5E3F", color: C.text, fontFamily: C.font }}
        >
          {t("church_deck.mock_intercession_amen")} →
        </div>
        <p
          className="text-[9px]"
          style={{ color: "rgba(200,212,192,0.45)", fontFamily: C.font, textDecoration: "underline" }}
        >
          {t("church_deck.mock_intercession_not_today")}
        </p>
        <p
          className="text-[9px] mt-0.5"
          style={{ color: "rgba(143,175,150,0.4)", fontFamily: C.font }}
        >
          {t("church_deck.mock_intercession_progress", { current: 1, total: 11 })}
        </p>
      </div>
    </MockPhone>
  );
}

/* ── BCP Intercessions — category list view (matches actual bcp-intercessions page) ── */
function BCPPrayerModeMock() {
  const { t } = useTranslation();
  const categories = [
    { emoji: "⛪", name: t("church_deck.mock_bcp_cat_church"), count: 8, expanded: false },
    { emoji: "✝️", name: t("church_deck.mock_bcp_cat_mission"), count: 5, expanded: true, items: [t("church_deck.mock_bcp_item_gospel"), t("church_deck.mock_bcp_item_mission"), t("church_deck.mock_bcp_item_missionaries"), t("church_deck.mock_bcp_item_enemies"), t("church_deck.mock_bcp_item_suffer")] },
    { emoji: "🏛️", name: t("church_deck.mock_bcp_cat_nation"), count: 7, expanded: false },
  ];
  return (
    <MockPhone>
      <p className="text-[10px] mb-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
        ← {t("church_deck.mock_bcp_back")}
      </p>
      <h2 className="text-[14px] font-bold mb-0.5" style={{ color: C.text, fontFamily: C.font }}>
        {t("church_deck.mock_bcp_title")} 🙏🏽
      </h2>
      <p className="text-[9px] mb-2.5" style={{ color: C.sage }}>
        {t("church_deck.mock_bcp_subtitle")}
      </p>
      {/* Search */}
      <div
        className="rounded-lg px-2.5 py-1.5 mb-2.5 text-[10px]"
        style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.15)", color: "rgba(143,175,150,0.4)" }}
      >
        {t("church_deck.mock_bcp_search")}
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
                {cat.count > 0 && <p className="text-[8px]" style={{ color: "rgba(143,175,150,0.45)" }}>{t("church_deck.mock_bcp_prayer_count", { count: cat.count })}</p>}
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
  const { t } = useTranslation();
  const items = [
    {
      name: t("church_deck.mock_list_name_margaret"),
      body: t("church_deck.mock_list_body_margaret"),
      held: t("church_deck.mock_list_praying_count", { count: 4 }),
      days: t("church_deck.mock_list_days_left", { n: 5 }),
    },
    {
      name: t("church_deck.mock_list_name_david"),
      body: t("church_deck.mock_list_body_david"),
      held: t("church_deck.mock_list_praying_count", { count: 6 }),
      days: t("church_deck.mock_list_days_left", { n: 2 }),
    },
    {
      name: t("church_deck.mock_list_name_peace"),
      body: t("church_deck.mock_list_body_anonymous"),
      held: t("church_deck.mock_list_praying_count", { count: 3 }),
      days: t("church_deck.mock_list_days_left", { n: 4 }),
    },
    {
      name: t("church_deck.mock_list_name_sarah"),
      body: t("church_deck.mock_list_body_sarah"),
      held: t("church_deck.mock_list_praying_count", { count: 5 }),
      days: t("church_deck.mock_list_days_left", { n: 1 }),
    },
  ];
  return (
    <MockPhone>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: C.text, fontFamily: C.font }}
      >
        🕯️ {t("church_deck.mock_list_title")}
      </h2>
      <p className="text-[10px] mb-3" style={{ color: C.sage }}>
        {t("church_deck.mock_list_subtitle")}
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
  const { t } = useTranslation();
  const verses = [
    {
      n: 121,
      line1: t("church_deck.mock_office_v121_l1"),
      line2: t("church_deck.mock_office_v121_l2"),
    },
    {
      n: 122,
      line1: t("church_deck.mock_office_v122_l1"),
      line2: t("church_deck.mock_office_v122_l2"),
    },
    {
      n: 123,
      line1: t("church_deck.mock_office_v123_l1"),
      line2: t("church_deck.mock_office_v123_l2"),
    },
    {
      n: 124,
      line1: t("church_deck.mock_office_v124_l1"),
      line2: t("church_deck.mock_office_v124_l2"),
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
          ← {t("church_deck.mock_office_back")}
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
          {t("church_deck.mock_office_evening_prayer")}
        </div>
        <div className="w-[40px]" />
      </div>

      {/* Eyebrow */}
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-3 text-center"
        style={{ color: "rgba(143,175,150,0.6)", fontFamily: C.font }}
      >
        {t("church_deck.mock_office_psalm_ref")}
      </p>

      {/* Verses — always left-aligned, like the real office (never inherit a
          centered parent from a stacked slide layout). */}
      <div className="mb-4 text-left">
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
        {t("church_deck.mock_office_bcp_page")}
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
          {t("church_deck.mock_office_nav_back")}
        </p>
        <p
          className="text-[9px] uppercase tracking-[0.22em]"
          style={{ color: "rgba(143,175,150,0.7)", fontFamily: C.font }}
        >
          {t("church_deck.mock_office_nav_psalm")}
        </p>
        <div
          className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
          style={{ background: "#2D5E3F", color: C.text, fontFamily: C.font }}
        >
          {t("church_deck.mock_office_nav_next")}
        </div>
      </div>
    </MockPhone>
  );
}

/* ── Prayer Rhythm — daily habit / Past 7 days (matches actual app) ── */
function PrayerRhythmMock() {
  const { t } = useTranslation();
  // 7 days of prayer this week — morning row all green, evening row mostly purple with one miss
  const morning = [true, true, true, true, true, true, true];
  const evening = [true, true, true, true, true, false, true];
  const dayLetters = (t("church_deck.mock_rhythm_day_letters") as string).split(",");
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
        {t("church_deck.mock_rhythm_today")}
      </p>
      <h2
        className="text-[15px] font-semibold text-center mb-3"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {t("church_deck.mock_rhythm_title")}
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
          {t("church_deck.mock_rhythm_morning")}
        </p>
        <div
          className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
          style={{ background: "rgba(46,107,64,0.5)", color: C.text, fontFamily: C.font }}
        >
          {t("church_deck.mock_rhythm_completed")} ✓
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
          {t("church_deck.mock_rhythm_evening")}
        </p>
        <div
          className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
          style={{ background: "rgba(46,107,64,0.5)", color: C.text, fontFamily: C.font }}
        >
          {t("church_deck.mock_rhythm_completed")} ✓
        </div>
      </div>

      {/* Past 7 days */}
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold text-center mb-2"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        {t("church_deck.mock_rhythm_past_7_days")}
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
        {t("church_deck.mock_rhythm_week_summary", { count: 7 })}
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
          {t("church_deck.mock_rhythm_reminders")} →
        </div>
        <div
          className="px-3 py-1 rounded-full text-[10px]"
          style={{
            border: "1px solid rgba(200,212,192,0.18)",
            color: C.text,
            fontFamily: C.font,
          }}
        >
          🕯️ {t("church_deck.mock_rhythm_examen")} →
        </div>
      </div>
    </MockPhone>
  );
}

/* ── Fasting — matches actual moment-detail.tsx water conservation UI ── */
function MeatFastMock() {
  const { t } = useTranslation();
  return (
    <MockPhone>
      {/* Hero water impact card */}
      <div
        className="rounded-xl px-3.5 py-3 mb-3"
        style={{ background: "#0A1F12", border: "1px solid rgba(46,107,64,0.35)" }}
      >
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
          {t("church_deck.mock_fast_conserving")}
        </p>
        <div className="flex items-end gap-1.5 mb-0.5">
          <span className="text-2xl font-bold tabular-nums" style={{ color: C.text, letterSpacing: "-0.03em" }}>18,400</span>
          <span className="text-[11px] mb-0.5" style={{ color: C.sage }}>{t("church_deck.mock_fast_gallons_saved")}</span>
        </div>
        <p className="text-[9px] mb-3" style={{ color: "rgba(143,175,150,0.5)" }}>
          {t("church_deck.mock_fast_formula")}
        </p>
        {/* Equivalences */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.18)" }}>
            <p className="text-[13px] font-bold" style={{ color: "#A8C5A0" }}>36,800</p>
            <p className="text-[8px] mt-0.5 leading-snug" style={{ color: "rgba(143,175,150,0.55)" }}>{t("church_deck.mock_fast_drinking_water")}</p>
          </div>
          <div className="rounded-lg px-2.5 py-2" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.18)" }}>
            <p className="text-[13px] font-bold" style={{ color: "#A8C5A0" }}>526</p>
            <p className="text-[8px] mt-0.5 leading-snug" style={{ color: "rgba(143,175,150,0.55)" }}>{t("church_deck.mock_fast_bathtubs")}</p>
          </div>
        </div>
      </div>

      {/* Water stats grid — You / Group columns */}
      <p className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "rgba(200,212,192,0.4)" }}>
        {t("church_deck.mock_fast_conserving")}
      </p>
      <div className="grid grid-cols-3 gap-1.5 mb-1">
        <div />
        <p className="text-[9px] text-center font-semibold uppercase tracking-wider" style={{ color: "rgba(200,212,192,0.45)" }}>{t("church_deck.mock_fast_you")}</p>
        <p className="text-[9px] text-center font-semibold uppercase tracking-wider" style={{ color: "rgba(200,212,192,0.45)" }}>{t("church_deck.mock_fast_group")}</p>
      </div>
      <div className="space-y-1.5">
        {[
          { label: t("church_deck.mock_fast_this_week"), you: "800", group: "2,400" },
          { label: t("church_deck.mock_fast_this_month"), you: "3,200", group: "9,600" },
          { label: t("church_deck.mock_fast_all_time"), you: "6,400", group: "18,400" },
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
  const { t } = useTranslation();
  return (
    <MockPhone>
      <h2
        className="text-base font-bold mb-0.5"
        style={{ color: C.text, fontFamily: C.font }}
      >
        {t("church_deck.mock_calendar_title")}
      </h2>
      <p className="text-[10px] mb-3" style={{ color: C.sage }}>
        {t("church_deck.mock_calendar_subtitle")}
      </p>
      <div
        className="h-px mb-3"
        style={{ background: "rgba(111,175,133,0.25)" }}
      />
      <div className="space-y-2">
        {[
          {
            emoji: "🍞",
            title: t("church_deck.mock_calendar_supper"),
            when: t("church_deck.mock_calendar_supper_when"),
            place: t("church_deck.mock_calendar_parish_hall"),
            people: t("church_deck.mock_calendar_going", { count: 12 }),
          },
          {
            emoji: "📖",
            title: t("church_deck.mock_calendar_study"),
            when: t("church_deck.mock_calendar_study_when"),
            place: t("church_deck.mock_calendar_library"),
            people: t("church_deck.mock_calendar_going", { count: 8 }),
          },
          {
            emoji: "🙏🏽",
            title: t("church_deck.mock_calendar_morning_prayer"),
            when: t("church_deck.mock_calendar_morning_when"),
            place: t("church_deck.mock_calendar_chapel"),
            people: t("church_deck.mock_calendar_regulars", { count: 4 }),
          },
          {
            emoji: "🎵",
            title: t("church_deck.mock_calendar_evensong"),
            when: t("church_deck.mock_calendar_evensong_when"),
            place: t("church_deck.mock_calendar_nave"),
            people: t("church_deck.mock_calendar_open_to_all"),
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
                {g.emoji} {g.title}
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
  const { t } = useTranslation();
  const groups = [
    {
      label: t("church_deck.mock_gatherings_today"),
      highlight: true,
      events: [
        { time: t("church_deck.mock_gatherings_supper_time"), title: t("church_deck.mock_gatherings_supper"), location: t("church_deck.mock_gatherings_parish_hall"), people: t("church_deck.mock_gatherings_people_supper"), kind: "ical" as const },
      ],
    },
    {
      label: t("church_deck.mock_gatherings_thursday"),
      highlight: false,
      events: [
        { time: t("church_deck.mock_gatherings_study_time"), title: t("church_deck.mock_gatherings_study"), location: t("church_deck.mock_gatherings_library"), people: t("church_deck.mock_gatherings_people_study"), kind: "phoebe" as const },
      ],
    },
    {
      label: t("church_deck.mock_gatherings_saturday"),
      highlight: false,
      events: [
        { time: t("church_deck.mock_gatherings_morning_time"), title: t("church_deck.mock_gatherings_morning_prayer"), location: t("church_deck.mock_gatherings_chapel"), people: t("church_deck.mock_gatherings_regulars", { count: 4 }), kind: "phoebe" as const },
      ],
    },
  ];
  return (
    <MockPhone>
      <h2 className="text-[14px] font-bold mb-0.5" style={{ color: C.text, fontFamily: C.font }}>
        {t("church_deck.mock_gatherings_title")}
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

/* ── Office Formats — the "How to pray" picker (4 ways to pray an office) ── */
// Mirrors the real OfficeMethodCard (bcp-daily-office.tsx): the green Morning
// Prayer card ("Rite II · The full text, at your own pace" · Available now)
// with the "How to pray" footer, plus the open native-style dropdown showing
// the four methods — 📖 Digital Slideshow (selected) · 📕 Physical BCP · 🎧
// Listen · 📺 Watch — exactly as the screen presents them.
function OfficeFormatsMock() {
  const { t } = useTranslation();
  const options = [
    { emoji: "📖", label: t("church_deck.mock_formats_digital"), selected: true },
    { emoji: "📕", label: t("church_deck.mock_formats_physical"), selected: false },
    { emoji: "🎧", label: t("church_deck.mock_formats_listen"), selected: false },
    { emoji: "📺", label: t("church_deck.mock_formats_watch"), selected: false },
  ];
  return (
    <MockPhone>
      <p
        className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-2"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: C.font }}
      >
        {t("church_deck.mock_formats_morning")}
      </p>
      <div>
        {/* Office method card — matches OfficeMethodCard's chrome. */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "linear-gradient(180deg, rgba(46,107,64,0.14) 0%, rgba(46,107,64,0.24) 100%)", border: "1px solid rgba(46,107,64,0.45)" }}
        >
          <div className="p-4 flex items-center gap-3">
            <span className="text-2xl">📖</span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>
                {t("church_deck.mock_formats_office")}
              </p>
              <p className="text-[10.5px] mt-0.5" style={{ color: C.sage }}>
                {t("church_deck.mock_formats_sub")}
              </p>
              <p className="text-[9px] mt-1 font-medium" style={{ color: "#6FAF85" }}>
                {t("church_deck.mock_formats_available")}
              </p>
            </div>
            <span className="text-[12px]" style={{ color: C.sage }}>→</span>
          </div>
          {/* "How to pray" footer row with the select chip. */}
          <div
            className="flex items-center justify-between gap-3 px-4 py-2.5"
            style={{ borderTop: "1px solid rgba(46,107,64,0.22)", background: "rgba(9,26,16, 0.275)" }}
          >
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "rgba(143,175,150,0.7)", fontFamily: C.font }}
            >
              {t("church_deck.mock_formats_how")}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-md px-2 py-1"
              style={{ color: C.text, background: "rgba(46,107,64,0.22)", border: "1px solid rgba(46,107,64,0.45)", fontFamily: C.font }}
            >
              📖 {t("church_deck.mock_formats_digital")} <span style={{ opacity: 0.55 }}>⌄</span>
            </span>
          </div>
        </div>
        {/* The open picker — native-select style, the four ways to pray, with
            the current choice highlighted (matches the OS dropdown). Rendered
            just under the card, right-aligned, as if the select just opened. */}
        <div className="flex justify-end" style={{ marginTop: 6 }}>
          <div
            className="rounded-lg overflow-hidden"
            style={{ width: 172, background: "#ECEAE4", boxShadow: "0 14px 36px rgba(0,0,0,0.55)", border: "1px solid rgba(0,0,0,0.12)" }}
          >
            {options.map((o, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2.5 py-1.5"
                style={{ background: o.selected ? "#E0701F" : "transparent" }}
              >
                <span className="text-[9px]" style={{ width: 9, color: o.selected ? "#fff" : "transparent" }}>✓</span>
                <span className="text-[12px]">{o.emoji}</span>
                <span
                  className="text-[12px] font-medium"
                  style={{ color: o.selected ? "#fff" : "#1A1A1A", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}
                >
                  {o.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockPhone>
  );
}

/* ── Daily Reminder — the office reminder push (iOS-style notification) ── */
// Mirrors PrayerNotificationMock's chrome exactly (real Phoebe app icon, the
// SF Pro system font, the floating "now" timestamp) so it reads as a genuine
// OS notification — here carrying the daily call back to prayer.
function DailyReminderMock() {
  const { t } = useTranslation();
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
      <img
        src="/phoebe-app-icon.png"
        alt="Phoebe"
        className="w-[44px] h-[44px] md:w-[52px] md:h-[52px] rounded-[10px] md:rounded-[12px] shrink-0"
        style={{ objectFit: "cover" }}
      />
      <p
        className="absolute text-[12px] md:text-[13px]"
        style={{ top: "0.95rem", right: "1rem", color: "rgba(220,230,235,0.55)", fontFamily: iosFont }}
      >
        {t("church_deck.mock_reminder_now")}
      </p>
      <div className="flex-1 min-w-0 text-left pr-8 md:pr-10">
        <p
          className="text-[15px] md:text-[17px] font-semibold leading-snug mb-1"
          style={{ color: "#F5F5F5", fontFamily: iosFont, letterSpacing: "-0.01em" }}
        >
          {t("church_deck.mock_reminder_title")}
        </p>
        <p
          className="text-[14px] md:text-[16px] leading-snug"
          style={{ color: "rgba(230,235,240,0.92)", fontFamily: iosFont, letterSpacing: "-0.005em" }}
        >
          {t("church_deck.mock_reminder_body")}
        </p>
      </div>
    </div>
  );
}

/* ── Daily Progress — where you are in today's rhythm ── */
// Mirrors the live Daily Progress page (daily-progress.tsx): the Next / Earlier-
// today practice rows — position in the day, not a score. No streak, no tally,
// no "others in your gardens" rail (deliberately removed: presence, not
// performance).
function DailyProgressMock() {
  const { t } = useTranslation();
  const row = (emoji: string, title: string, sub: string, rgb: string, done: boolean) => (
    <div
      className="rounded-2xl overflow-hidden flex mb-2"
      style={{ background: `rgba(${rgb},0.10)`, border: `1px solid rgba(${rgb},${done ? 0.42 : 0.18})` }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${rgb},0.85)` }} />
      <div className="flex-1 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[16px]">{emoji}</span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>{title}</p>
            <p className="text-[9px] mt-0.5" style={{ color: C.sage }}>{sub}</p>
          </div>
        </div>
        {done ? (
          <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 shrink-0" style={{ background: `rgba(${rgb},0.18)`, color: "rgba(240,237,230,0.85)", border: `1px solid rgba(${rgb},0.45)` }}>✓</span>
        ) : (
          <span className="text-[10px] font-semibold rounded-full px-2.5 py-1 shrink-0" style={{ background: `rgba(${rgb},0.85)`, color: C.text, fontFamily: C.font }}>{t("church_deck.mock_progress_begin")} →</span>
        )}
      </div>
    </div>
  );
  return (
    <MockPhone>
      <p className="text-[15px] font-bold" style={{ color: C.text, fontFamily: C.font }}>{t("church_deck.mock_progress_title")}</p>
      <p className="text-[9px] mb-3 mt-0.5" style={{ color: C.sage, fontFamily: C.font }}>{t("church_deck.mock_progress_subtitle")}</p>

      <p className="text-[8px] uppercase tracking-[0.18em] font-semibold mb-1.5" style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}>{t("church_deck.mock_progress_next")}</p>
      {row("🕯️", t("church_deck.mock_progress_contemplation"), t("church_deck.mock_progress_contemplation_sub"), "62,124,122", false)}

      <p className="text-[8px] uppercase tracking-[0.18em] font-semibold mb-1.5 mt-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}>{t("church_deck.mock_progress_done")}</p>
      {row("🌅", t("church_deck.mock_progress_morning"), t("church_deck.mock_progress_prayed"), "46,107,64", true)}

    </MockPhone>
  );
}

/* ── Customizer — the real "When" step of the rule-of-life builder ── */
// Faithful to WayOfLoveRuleFlow's choiceRow: a 4px left accent bar, a radio
// circle (outline unselected / filled sage-with-check selected), the exact
// palette, and the pinned "Continue" button. Copy matches the real step.
function CustomizerMock() {
  // Real palette from WayOfLoveRuleFlow.
  const CARD = "rgba(9,26,16,0.5)";
  const CARD_B = "rgba(46,107,64,0.4)";
  const CARD_ACTIVE = "rgba(46,107,64,0.34)";
  const CARD_B_ACTIVE = "rgba(168,197,160,0.7)";
  const rows = [
    { emoji: "🌅", label: "Morning", sub: "Begin the day with prayer.", on: true },
    { emoji: "🌙", label: "Evening", sub: "Mark the day’s end with prayer.", on: true },
  ];
  return (
    <MockPhone>
      <p className="text-[9px] uppercase tracking-[0.2em] font-semibold mb-1" style={{ color: "rgba(143,175,150,0.6)", fontFamily: C.font }}>
        Pray
      </p>
      <h2 className="text-[19px] font-bold mb-1.5" style={{ color: C.text, fontFamily: C.font }}>
        When
      </h2>
      <p className="text-[10.5px] leading-[1.5] mb-3" style={{ color: C.sage, fontFamily: C.font }}>
        Choose when you’ll pray. You can change this any time.
      </p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className="rounded-xl overflow-hidden flex items-stretch"
            style={{ background: r.on ? CARD_ACTIVE : CARD, border: `1px solid ${r.on ? CARD_B_ACTIVE : CARD_B}` }}
          >
            <div className="w-1 flex-shrink-0" style={{ background: r.on ? "#A8C5A0" : CARD_B }} />
            <div className="flex-1 px-3 py-2.5 flex items-center gap-2.5">
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                style={{ background: r.on ? "#A8C5A0" : "transparent", border: r.on ? "none" : "1.5px solid rgba(46,107,64,0.5)" }}
              >
                {r.on && <span className="text-[9px] font-bold leading-none" style={{ color: "#0C1F12" }}>✓</span>}
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>{r.emoji} {r.label}</p>
                <p className="text-[9.5px] mt-0.5" style={{ color: C.sage, fontFamily: C.font }}>{r.sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        className="rounded-xl text-center mt-3 py-2.5"
        style={{ background: "rgba(46,107,64,0.55)", border: `1px solid ${CARD_B_ACTIVE}`, color: C.text, fontFamily: C.font, fontSize: 13, fontWeight: 700 }}
      >
        Continue
      </div>
    </MockPhone>
  );
}

/* ── Forward Day by Day — the real home card the office hands you to ── */
// There's no separate "office ends → FDD" screen in the app; the reflection you
// picked in the builder simply waits as its own card (the real FddHomeCard,
// dashboard.tsx). This mirrors that card exactly — Forward Movement blue, the
// title with its mode emoji, the rounded "Read →" pill — under a short line
// naming the seam the office closes.
function OfficeFddMock() {
  const serif = "Georgia, 'Times New Roman', serif";
  const FDD_BLUE = "96,141,209"; // Forward Movement blue — the app's FDD identity color.
  return (
    <MockPhone>
      {/* The office has just ended — its closing Grace, dimmed. */}
      <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-2 text-center" style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}>
        The office is ended
      </p>
      <p className="text-[10.5px] leading-[1.6] italic text-center mb-4 px-1" style={{ color: "rgba(240,237,230,0.62)", fontFamily: serif }}>
        The grace of our Lord Jesus Christ, and the love of God, and the fellowship of the Holy Spirit, be with us all evermore. <span style={{ color: C.sage }}>Amen.</span>
      </p>

      <p className="text-[8px] uppercase tracking-[0.18em] font-semibold mb-1.5" style={{ color: "rgba(143,175,150,0.5)", fontFamily: C.font }}>
        Your reflection, waiting
      </p>
      {/* The real Forward Day by Day home card. */}
      <div className="rounded-xl overflow-hidden flex" style={{ background: `rgba(${FDD_BLUE},0.13)`, border: `1px solid rgba(${FDD_BLUE},0.4)` }}>
        <div className="w-1 flex-shrink-0" style={{ background: `rgba(${FDD_BLUE},0.85)` }} />
        <div className="flex-1 px-4 py-3 flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold" style={{ color: C.text, fontFamily: C.font }}>Forward Day by Day 📖</p>
          <div className="rounded-full text-[11px] px-3 py-1.5 shrink-0" style={{ background: `rgba(${FDD_BLUE},0.28)`, border: `1px solid rgba(${FDD_BLUE},0.5)`, color: C.text, fontFamily: C.font, fontWeight: 500, whiteSpace: "nowrap" }}>
            Read →
          </div>
        </div>
      </div>
    </MockPhone>
  );
}

/* ── A leader's rule of life, ready to take up (real CommunityRuleCard content) ── */
function LeaderRuleMock() {
  const lines = ["Morning — Daily Office at 7:00am", "Evening — Daily Devotion at 8:30pm", "Silence — 10 min a day", "Practices — Examen · Audio Divina"];
  return (
    <MockPhone>
      <p className="text-[9px] uppercase tracking-[0.2em] font-semibold mb-1.5" style={{ color: "rgba(143,175,150,0.6)", fontFamily: C.font }}>
        St. Aidan's
      </p>
      <div className="relative flex rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)" }}>
        <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
        <div className="flex-1 px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <span className="text-xl" aria-hidden>🕯️</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.6)", fontFamily: C.font }}>
                Our rule of life
              </p>
              <p className="text-[13.5px] mt-0.5 font-semibold leading-snug" style={{ color: C.text, fontFamily: C.font }}>
                One rhythm, kept together
              </p>
              <div className="mt-1.5 space-y-0.5">
                {lines.map((l, i) => (
                  <p key={i} className="text-[11px] leading-snug" style={{ color: "#C8D4C0", fontFamily: C.font }}>{l}</p>
                ))}
              </div>
              <p className="text-[10.5px] mt-1.5" style={{ color: "rgba(143,175,150,0.7)", fontFamily: C.font }}>
                Taken up 41 times
              </p>
              <div
                className="rounded-full px-4 py-1.5 text-[12px] font-semibold mt-2.5 inline-block"
                style={{ background: "rgba(46,107,64,0.85)", color: C.text, border: "1px solid rgba(46,107,64,0.6)", fontFamily: C.font }}
              >
                Take up this rhythm
              </div>
            </div>
          </div>
        </div>
      </div>
    </MockPhone>
  );
}

const MOCK_MAP: Record<string, () => ReactElement> = {
  "prayer-requests": PrayerRequestsMock,
  "prayer-notification": PrayerNotificationMock,
  "community-intercession": CommunityIntercessionMock,
  dashboard: DashboardMock,
  bcp: BCPPrayerModeMock,
  "prayer-list": PrayerListMock,
  "daily-office": DailyOfficeMock,
  "office-formats": OfficeFormatsMock,
  "prayer-rhythm": PrayerRhythmMock,
  "daily-reminder": DailyReminderMock,
  "prayer-streak": DailyProgressMock,
  "meat-fast": MeatFastMock,
  calendar: CalendarMock,
  gatherings: GatheringsMock,
  customizer: CustomizerMock,
  "office-fdd": OfficeFddMock,
  "leader-rule": LeaderRuleMock,
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
    <div className="max-w-3xl mx-auto w-full flex flex-col items-center text-center">
      {/* The app icon — the anchor the whole closing rests on. */}
      <motion.img
        src="/phoebe-app-icon.png"
        alt="Phoebe"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-24 h-24 md:w-28 md:h-28 rounded-[22%] object-cover mb-6 md:mb-8"
        style={{
          border: "1px solid rgba(46,107,64,0.4)",
          boxShadow: "0 14px 44px rgba(46,107,64,0.35), 0 2px 10px rgba(0,0,0,0.45)",
        }}
      />
      {/* The name. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.18, duration: 0.5 }}
        className="space-y-1 mb-8 md:mb-10"
      >
        {slide.featured.map((line, i) => (
          <p
            key={i}
            className="text-4xl md:text-6xl font-semibold leading-tight tracking-tight"
            style={{ color: C.text, fontFamily: C.font }}
          >
            {line}
          </p>
        ))}
      </motion.div>
      {/* The name's story — and the invitation (last line brightened). */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.32, duration: 0.6 }}
        className="space-y-3 md:space-y-4 max-w-xl"
      >
        {slide.body.map((line, i) => {
          const isLast = i === slide.body.length - 1;
          return (
            <p
              key={i}
              className={
                isLast
                  ? "text-lg md:text-2xl font-normal leading-relaxed pt-1"
                  : "text-base md:text-xl font-light leading-relaxed"
              }
              style={{ color: isLast ? C.text : C.sage, fontFamily: C.font }}
            >
              {line}
            </p>
          );
        })}
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
// ─── Reusable deck shell ─────────────────────────────────────────────────────
// The nav chrome + animated slide stage, parameterized by the slide list and
// where "Close" / "Done" lands. Rendered by both the church deck and the about
// deck so they share the exact same look, mocks, and navigation.
export function DeckShell({
  slides,
  exitTo = "/",
  autoAdvanceMs = 10000,
  // The church deck's slide index 2 is a brief "The week" title that auto-
  // advances fast; other decks (e.g. About) pass quickIndex={-1} to disable it.
  quickIndex = 2,
  quickMs = 3000,
}: {
  slides: Slide[];
  exitTo?: string;
  autoAdvanceMs?: number;
  quickIndex?: number;
  quickMs?: number;
}) {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

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
    const delay = index === quickIndex ? quickMs : autoAdvanceMs;
    const timer = setTimeout(() => next(), delay);
    return () => clearTimeout(timer);
  }, [index, autoPlay, slides.length, next, autoAdvanceMs, quickIndex, quickMs]);

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
        setLocation(exitTo);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, setLocation, exitTo]);

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
  // A leaf photo backdrop under the deck (matches the home / splash), washed dark
  // so the slides stay legible. Held stable for the whole deck (NOT keyed to the
  // slide index) so it doesn't reload / hard-cut a new image on every advance.
  const [bgPhoto] = useState<string | null>(() =>
    LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null,
  );

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: C.bg, isolation: "isolate" }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {bgPhoto && (
        <>
          <img src={bgPhoto} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.42, zIndex: -1 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,18,12,0.5) 0%, rgba(8,18,12,0.64) 45%, rgba(8,18,12,0.82) 100%)" }} />
        </>
      )}
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-4 md:px-6 pt-4 md:pt-6 pb-2">
        <button
          onClick={() => setLocation(exitTo)}
          className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-100 shrink-0"
          style={{ color: C.sage, opacity: 0.75 }}
        >
          <X size={16} />
          <span className="hidden md:inline">{t("church_deck.close")}</span>
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
              aria-label={t("church_deck.go_to_slide", { n: i + 1 })}
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

      {/* Slide — click right half to advance. Each slide is absolutely
          positioned within this box so an exiting slide never shares flex
          layout space with the one entering — sharing space is what let
          popLayout's flow-removal math fight the flex centering below and
          leave exiting slides stuck mid-fade (never reaching opacity 0). */}
      <div
        className="relative flex-1 cursor-pointer"
        onClick={handleSlideClick}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center justify-center px-5 md:px-16 py-8 md:py-12 overflow-y-auto"
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
          {t("church_deck.back")}
        </button>
        {isLast ? (
          <button
            onClick={() => setLocation(exitTo)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            {t("church_deck.done")}
          </button>
        ) : (
          <button
            onClick={next}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity"
            style={{ background: "#2D5E3F", color: C.text }}
          >
            {t("church_deck.next")}
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function ChurchDeck() {
  const { user } = useAuth();
  const { t } = useTranslation();
  return <DeckShell slides={buildSlides(t)} exitTo={user ? "/dashboard" : "/"} />;
}
