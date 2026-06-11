/**
 * Daily progress — the expanded view behind the header "Daily progress" pill.
 *
 * Shows the full Today's Rhythm card (the four anchors + streak + what's next)
 * and the ways to shape the practice it tracks: Rule of Life, the morning /
 * evening office settings, and reminders. The card used to live on the home
 * top; it moved here (and onto the slideshow closing slide) so the home screen
 * stays focused on praying, and the rhythm is one tap from any page via the
 * header pill.
 */

import { Link } from "wouter";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { TodaysRhythm } from "@/components/TodaysRhythm";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const BG_CARD = "rgba(46,107,64,0.10)";
const BORDER = "rgba(46,107,64,0.22)";
const FONT = "'Space Grotesk', system-ui, sans-serif";

function ShapeRow({ href, emoji, title, blurb }: { href: string; emoji: string; title: string; blurb: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-opacity hover:opacity-90 active:scale-[0.99]"
      style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}
    >
      <span className="text-xl flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold leading-tight" style={{ color: WARM, fontFamily: FONT }}>{title}</p>
        <p className="text-[12px] mt-0.5 leading-snug" style={{ color: SAGE }}>{blurb}</p>
      </div>
      <ChevronRight size={16} style={{ color: "rgba(143,175,150,0.6)", flexShrink: 0 }} />
    </Link>
  );
}

export default function DailyProgressPage() {
  const { t } = useTranslation();

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4 sm:px-0">
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

        <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}>
          {t("daily_progress.shape_heading", { defaultValue: "Shape your practice" })}
        </p>
        <div className="flex flex-col gap-2">
          <ShapeRow
            href="/rule-of-life"
            emoji="🌿"
            title={t("daily_progress.rule_of_life", { defaultValue: "Your Rule of Life" })}
            blurb={t("daily_progress.rule_of_life_blurb", { defaultValue: "Choose the practices that make up your rhythm" })}
          />
          <ShapeRow
            href="/bcp/daily-office/settings"
            emoji="📖"
            title={t("daily_progress.office_settings", { defaultValue: "Morning & evening office" })}
            blurb={t("daily_progress.office_settings_blurb", { defaultValue: "Tune how you pray the daily office" })}
          />
          <ShapeRow
            href="/settings"
            emoji="🔔"
            title={t("daily_progress.reminders", { defaultValue: "Daily reminders" })}
            blurb={t("daily_progress.reminders_blurb", { defaultValue: "When Phoebe nudges you to pray" })}
          />
        </div>
      </div>
    </Layout>
  );
}
