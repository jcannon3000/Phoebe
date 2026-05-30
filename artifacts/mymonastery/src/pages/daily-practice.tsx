/**
 * Your Way of Love — launch pad for a person's daily prayer rhythm.
 *
 * Reached from the "Your Way of Love" entry under the user's name in the
 * drawer menu. Begins today's prayer (or "Pray again" once logged today) and
 * links to the morning / evening office settings. The seven Way of Love
 * practice commitments are set in the Rule of Life flow and shown on the home
 * screen — they're no longer edited here.
 */

import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

// ── Design tokens (match WayOfLoveStep) ─────────────────────────────────
const BG_CARD  = "rgba(46,107,64,0.10)";
const BORDER   = "rgba(46,107,64,0.22)";
const WARM   = "#F0EDE6";
const SAGE   = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const CTA    = "#2D5E3F";
const FONT   = "'Space Grotesk', system-ui, sans-serif";

// Only `loggedToday` is used (drives the Pray CTA's label + href); the other
// fields remain for the endpoint's shape.
type PrayerStreak = {
  streak: number;
  lastPrayedDate: string | null;
  loggedToday?: boolean;
  gardenPrayedTodayCount?: number;
};

export default function DailyPracticePage() {
  const { data: streakData } = useQuery<PrayerStreak>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak") as Promise<PrayerStreak>,
    staleTime: 60_000,
  });

  const loggedToday = !!streakData?.loggedToday;
  const beginHref = loggedToday ? "/prayer-mode?reset=1" : "/prayer-mode";

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
          Begin today's prayer, and tune your morning and evening offices.
        </p>

        <Link
          href={beginHref}
          className="block text-center mb-7 rounded-xl px-4 py-3 font-semibold transition-opacity hover:opacity-90"
          style={{ background: CTA, color: WARM, fontFamily: FONT }}
        >
          {loggedToday ? "Pray again →" : "Begin today's prayer →"}
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
