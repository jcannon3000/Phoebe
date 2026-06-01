/**
 * Your Way of Love — launch pad for shaping a person's daily prayer rhythm.
 *
 * Reached from the "Your Way of Love" entry under the user's name in the
 * drawer menu. From here you customize your Rule of Life (the Way of Love
 * practices setup that lives at /rule-of-life) and tune the morning /
 * evening office settings. There's no "pray" CTA — praying happens from the
 * home screen; this page is for shaping the rhythm, not starting a session.
 */

import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { useBetaStatus } from "@/hooks/useDemo";

// ── Design tokens (match WayOfLoveStep) ─────────────────────────────────
const BG_CARD  = "rgba(46,107,64,0.10)";
const BORDER   = "rgba(46,107,64,0.22)";
const WARM   = "#F0EDE6";
const SAGE   = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA    = "#2D5E3F";
const FONT   = "'Space Grotesk', system-ui, sans-serif";

export default function DailyPracticePage() {
  const [, setLocation] = useLocation();
  const { isBeta, isLoading: betaLoading } = useBetaStatus();

  // Way of Love launch pad — beta-only, and follows the beta-view toggle.
  // Previously ungated, so a non-beta user (or a beta user previewing the
  // regular experience) could land here and see the Way of Love. Send them
  // home and render nothing so none of it is reachable outside beta.
  useEffect(() => {
    if (!betaLoading && !isBeta) setLocation("/dashboard");
  }, [betaLoading, isBeta, setLocation]);

  if (!betaLoading && !isBeta) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24 px-4 sm:px-0">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm mb-3"
          style={{ color: SAGE }}
        >
          <ChevronLeft size={14} /> Home
        </Link>

        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: FONT }}>
          Your Way of Love 🌿
        </h1>
        <p className="text-sm mb-5" style={{ color: SAGE }}>
          Shape your Rule of Life, and tune your morning and evening offices.
        </p>

        {/* Primary action — open the Rule of Life setup (WayOfLoveStep, the
            seven Way of Love practices). This page is the home for it. */}
        <Link
          href="/rule-of-life"
          className="block text-center mb-7 rounded-xl px-4 py-3 font-semibold transition-opacity hover:opacity-90"
          style={{ background: CTA, color: WARM, fontFamily: FONT }}
        >
          Customize your Rule of Life →
        </Link>

        {/* Prayer settings shortcuts */}
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>
            Prayer settings
          </h2>
          <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href="/bcp/daily-office/settings?side=morning"
            className="w-full flex items-center gap-3 rounded-xl px-3 py-3 transition-opacity hover:opacity-90"
            style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}
          >
            <span style={{ fontSize: 20 }}>🌅</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>Morning</p>
              <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>Depth, reminder, way to pray, and reflection</p>
            </div>
            <ChevronLeft size={16} style={{ color: SAGE_DIM, flexShrink: 0, transform: "rotate(180deg)" }} />
          </Link>
          <Link
            href="/bcp/daily-office/settings?side=evening"
            className="w-full flex items-center gap-3 rounded-xl px-3 py-3 transition-opacity hover:opacity-90"
            style={{ background: BG_CARD, border: `1px solid ${BORDER}` }}
          >
            <span style={{ fontSize: 20 }}>🌙</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: FONT, margin: 0 }}>Evening</p>
              <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>Depth, reminder, way to pray, and reflection</p>
            </div>
            <ChevronLeft size={16} style={{ color: SAGE_DIM, flexShrink: 0, transform: "rotate(180deg)" }} />
          </Link>
        </div>
      </div>
    </Layout>
  );
}
