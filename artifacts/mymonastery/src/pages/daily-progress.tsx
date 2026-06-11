/**
 * Daily progress — the expanded view behind the header "Daily progress" pill.
 *
 * Shows the full Today's Rhythm card (the four anchors + streak + what's next),
 * then a home-style card for each of the four practices — Morning, Reflect,
 * Silence, Evening — showing whether it's kept today and tapping through to it.
 * The card used to live on the home top; it moved here (and onto the slideshow
 * closing slide) so the home screen stays focused on praying, and the rhythm is
 * one tap from any page via the header pill.
 */

import { Link } from "wouter";
import { ChevronLeft, Sliders } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { TodaysRhythm } from "@/components/TodaysRhythm";
import { useRhythmState } from "@/hooks/useRhythmState";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

// One home-style practice card: a colored left accent bar, the practice, and
// its state today (a "kept" check or a CTA to begin). Matches the dashboard
// PracticeHomeCard look so the page feels of a piece with home.
function PracticeCard({
  href, emoji, title, blurb, cta, done, rgb, later, laterLabel,
}: {
  href: string; emoji: string; title: string; blurb: string; cta: string; done: boolean; rgb: string;
  /** Not yet actionable (e.g. evening before noon) — shows a muted "Later"
   *  pill instead of a CTA, and isn't tappable. */
  later?: boolean; laterLabel?: string;
}) {
  const waiting = !!later && !done;
  const pill = done ? (
    <span
      className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5"
      style={{ background: `rgba(${rgb},0.18)`, color: "rgba(240,237,230,0.85)", border: `1px solid rgba(${rgb},0.45)` }}
    >✓</span>
  ) : waiting ? (
    <span
      className="flex-shrink-0 rounded-full text-[12px] font-medium px-3.5 py-1.5"
      style={{ background: "transparent", color: "rgba(182,210,188,0.5)", border: "1px solid rgba(143,175,150,0.22)" }}
    >{laterLabel}</span>
  ) : (
    <span className="flex-shrink-0 rounded-full text-[12px] font-semibold px-3.5 py-1.5" style={{ background: `rgba(${rgb},0.85)`, color: WARM }}>
      {cta} <span aria-hidden>→</span>
    </span>
  );

  const row = (
    <div
      className={`relative flex rounded-2xl overflow-hidden ${waiting ? "" : "transition-opacity hover:opacity-90 active:scale-[0.99]"}`}
      style={{ background: `rgba(${rgb},0.10)`, border: `1px solid rgba(${rgb},${done ? 0.42 : 0.18})`, opacity: waiting ? 0.72 : 1 }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${rgb},${waiting ? 0.4 : 0.85})` }} />
      <div className="flex-1 px-4 py-3.5 flex items-center gap-3">
        <span className="text-xl flex-shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold leading-tight truncate" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
          <p className="text-[12px] mt-0.5 leading-snug" style={{ color: SAGE }}>{blurb}</p>
        </div>
        {pill}
      </div>
    </div>
  );

  // Not yet actionable → a plain (non-navigating) card.
  return waiting ? row : <Link href={href} className="block">{row}</Link>;
}

export default function DailyProgressPage() {
  const { t } = useTranslation();
  const { morningDone, reflectDone, silenceDone, eveningDone, prayerKind } = useRhythmState();
  const hour = new Date().getHours();
  const kept = t("rhythm.kept", { defaultValue: "Kept today" });

  // Title for an office side matches what the user prays (their Customize-home
  // / Rule of Life pick): Prayer (office), Devotion, or community "Pray together".
  const officeTitle = (side: "Morning" | "Evening") =>
    prayerKind === "community"
      ? t("rhythm.card_community", { defaultValue: "Pray together" })
      : prayerKind === "devotion"
        ? t(`rhythm.card_${side.toLowerCase()}_devotion`, { defaultValue: `${side} Devotion` })
        : t(`rhythm.card_${side.toLowerCase()}`, { defaultValue: `${side} Prayer` });

  // The four anchors as home-style cards — Morning · Silence · Reflect ·
  // Evening (silence before reflect). The evening card waits to become
  // actionable until the afternoon (it shows "Later" until noon).
  const cards = [
    {
      key: "morning", emoji: "🌅", rgb: "46,107,64", done: morningDone, href: "/begin-prayer",
      title: officeTitle("Morning"),
      blurb: morningDone ? kept : t("rhythm.blurb_morning", { defaultValue: "Begin the day with the office" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    },
    {
      key: "silence", emoji: "🕯️", rgb: "62,124,122", done: silenceDone, href: "/cobreathe",
      title: t("rhythm.card_silence", { defaultValue: "Silence" }),
      blurb: silenceDone ? kept : t("rhythm.blurb_silence", { defaultValue: "Sit, or cobreathe for justice" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }), later: false,
    },
    {
      key: "reflect", emoji: "📖", rgb: "96,141,209", done: reflectDone, href: "/menu/reflections",
      title: t("rhythm.card_reflect", { defaultValue: "Today's reflection" }),
      blurb: reflectDone ? kept : t("rhythm.blurb_reflect", { defaultValue: "A few minutes with the day's word" }),
      cta: t("rhythm.read", { defaultValue: "Read" }), later: false,
    },
    {
      key: "evening", emoji: "🌙", rgb: "124,116,196", done: eveningDone, href: hour >= 20 ? "/examen" : "/begin-prayer",
      title: hour >= 20 ? t("rhythm.card_close", { defaultValue: "Close the day" }) : officeTitle("Evening"),
      blurb: eveningDone
        ? kept
        : hour >= 20 ? t("rhythm.blurb_compline", { defaultValue: "Examine the day and rest" }) : t("rhythm.blurb_evening", { defaultValue: "Mark the day's end with the office" }),
      cta: t("rhythm.begin", { defaultValue: "Begin" }),
      // Evening isn't actionable until the afternoon (after noon).
      later: hour < 12,
    },
  ];

  return (
    <Layout>
      {/* Capped on desktop, full-width on mobile: the max-width constrains the
          column on wide screens (so the cards aren't stretched across the
          page), while phones — narrower than the cap — fill edge to edge
          within the Layout's padding. */}
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.home", { defaultValue: "Home" })}
        </Link>

        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>
          {t("daily_progress.title", { defaultValue: "Daily progress" })}
        </h1>
        <p className="text-sm mb-5" style={{ color: SAGE }}>
          {t("daily_progress.subtitle", { defaultValue: "Where you are in today's rhythm — and what's next." })}
        </p>

        {/* The rhythm card itself — four anchors, streak, what's next. */}
        <TodaysRhythm />

        {/* Each of the four practices as its own card. */}
        <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
          {t("daily_progress.practices_heading", { defaultValue: "Today's practices" })}
        </p>
        <div className="flex flex-col gap-2">
          {cards.map((c) => (
            <PracticeCard
              key={c.key}
              href={c.href}
              emoji={c.emoji}
              title={c.title}
              blurb={c.blurb}
              cta={c.cta}
              done={c.done}
              rgb={c.rgb}
              later={c.later}
              laterLabel={t("rhythm.later", { defaultValue: "Later" })}
            />
          ))}
        </div>

        {/* Customize — shape which practices make up your rhythm. */}
        <div className="flex justify-center mt-8">
          <Link
            href="/rule-of-life"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
            style={{
              background: "rgba(46,107,64,0.10)",
              border: "1px solid rgba(46,107,64,0.28)",
              color: "#A8C5A0",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Sliders size={14} /> {t("daily_progress.customize", { defaultValue: "Customize" })}
          </Link>
        </div>
      </div>
    </Layout>
  );
}
