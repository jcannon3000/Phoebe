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
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { DailyProgressBody } from "@/components/DailyProgressBody";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

export default function DailyProgressPage() {
  const { t } = useTranslation();
  const bgPhoto = useMemo(
    () => (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null),
    [],
  );
  return (
    <Layout>
      <div style={{ position: "relative", isolation: "isolate", minHeight: "100dvh" }}>
      {/* A still leaves photo behind the page, under a dark wash. */}
      {bgPhoto && (
        <>
          <img src={bgPhoto} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4, zIndex: -1 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,22,15,0.45) 0%, rgba(8,22,15,0.62) 38%, rgba(8,22,15,0.80) 100%)" }} />
        </>
      )}
      {/* Capped on desktop, full-width on mobile. */}
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">
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
        <p className="text-sm mb-5" style={{ color: SAGE }}>
          {t("daily_progress.subtitle", { defaultValue: "Where you are in today's rhythm — and what's next." })}
        </p>

        <DailyProgressBody />
      </div>
      </div>
    </Layout>
  );
}
