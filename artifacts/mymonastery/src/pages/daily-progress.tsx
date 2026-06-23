/**
 * Daily progress — the expanded view behind the header "Daily progress" pill.
 *
 * The rhythm content (the four anchors split into Next / Done + the streak
 * card) lives in DailyProgressBody so the same view can be reused as the home
 * screen for beta users. This page is just the chrome around it: back link,
 * title, and the Customize link. (Custom practices are now created inside the
 * Customize flow — see WayOfLoveRuleFlow's "Create your own" slide — not here.)
 */

import { useMemo } from "react";
import { Link } from "wouter";
import { ChevronLeft, Sliders } from "lucide-react";
import { FROST } from "@/lib/frost";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { DailyProgressBody } from "@/components/DailyProgressBody";
import { HOME_LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export default function DailyProgressPage() {
  const { t } = useTranslation();
  const bgPhoto = useMemo(
    () => (HOME_LEAF_PHOTOS.length > 0 ? HOME_LEAF_PHOTOS[Math.floor(Math.random() * HOME_LEAF_PHOTOS.length)]! : null),
    [],
  );
  return (
    <Layout bgPhoto={bgPhoto}>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
      {/* Capped on desktop, full-width on mobile. max-w-4xl (56rem) matches the
          home screen's .dash-shell so the rhythm cards are the same width on both. */}
      <div className="flex flex-col w-full max-w-4xl mx-auto pb-24">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm mb-3" style={{ color: SAGE }}>
          <ChevronLeft size={14} /> {t("common.home", { defaultValue: "Home" })}
        </Link>

        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl font-bold" style={{ color: WARM, fontFamily: FONT }}>
            {t("daily_progress.title", { defaultValue: "Daily progress" })}
          </h1>
          {/* Customize — shape which practices make up your rhythm. Top-right,
              vertically aligned with the title. */}
          <Link
            href="/rule-of-life"
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 shrink-0 transition-opacity hover:opacity-90"
            style={{
              ...FROST,
              border: "1px solid rgba(46,107,64,0.4)",
              color: "#A8C5A0",
              fontFamily: FONT,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Sliders size={14} /> {t("daily_progress.customize", { defaultValue: "Shape your rhythm" })}
          </Link>
        </div>
        <p className="text-sm mb-5" style={{ color: SAGE }}>
          {t("daily_progress.subtitle", { defaultValue: "Where you are in today's rhythm — and what's next." })}
        </p>

        <DailyProgressBody />
      </div>
      </div>
    </Layout>
  );
}
