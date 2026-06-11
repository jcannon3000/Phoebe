/**
 * Daily progress — the expanded view behind the header "Daily progress" pill.
 *
 * Shows the full Today's Rhythm card: the four anchors (Morning · Reflect ·
 * Silence · Evening), the streak, and what's next. The card used to live on
 * the home top; it moved here (and onto the slideshow closing slide) so the
 * home screen stays focused on praying, and the rhythm is one tap from any
 * page via the header pill.
 */

import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { TodaysRhythm } from "@/components/TodaysRhythm";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

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
      </div>
    </Layout>
  );
}
