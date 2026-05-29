/**
 * Daily Practice — the hub for a person's prayer rhythm.
 *
 * Reached from the "Daily Practice" entry under the user's name in the
 * drawer menu. Two jobs:
 *
 *   1. Show progress — current streak, whether they've prayed today,
 *      when they last prayed, and how many in their circle prayed
 *      today. All from GET /api/prayer-streak (the same endpoint the
 *      header streak chip uses, so it's usually already cached when the
 *      user lands here — no load flash).
 *
 *   2. Build the practice — entry points into the existing
 *      customization surfaces rather than re-implementing them:
 *        • /bcp/daily-office/settings — default prayer, reminders,
 *          confession, reflections, gratitude slide.
 *        • /customize-home — reorder home modules and pick the
 *          featured feed that leads the prayer slideshow.
 *
 * Visual language mirrors office-settings / customize-home (warm/sage
 * palette, Space Grotesk, rounded-xl cards) so the three feel like one
 * connected "shape your practice" flow.
 */

import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useBetaStatus } from "@/hooks/useDemo";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type PrayerStreak = {
  streak: number;
  lastPrayedDate: string | null;
  loggedToday?: boolean;
  gardenPrayedTodayCount?: number;
};

// Local YYYY-MM-DD, matching the user-tz window date the streak endpoint
// stamps — so the today/yesterday comparison lines up with the server.
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatLastPrayed(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const today = new Date();
  if (dateStr === localDateStr(today)) return "today";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dateStr === localDateStr(yesterday)) return "yesterday";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3 mt-7">
      <h2 className="text-lg font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
    </div>
  );
}

function Blurb({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[13px] mb-3"
      style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}
    >
      {children}
    </p>
  );
}

// Link row in the customize-home aesthetic: rounded-xl card, emoji,
// label/sub, chevron. Routes to an existing customization screen.
function PracticeLinkRow({
  emoji,
  label,
  sub,
  href,
}: {
  emoji: string;
  label: string;
  sub: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-3 select-none transition-opacity hover:opacity-90"
      style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
    >
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {label}
        </p>
        <p className="text-[12px]" style={{ color: SAGE, margin: "2px 0 0" }}>
          {sub}
        </p>
      </div>
      <ChevronRight size={16} style={{ color: "rgba(143,175,150,0.5)", flexShrink: 0 }} />
    </Link>
  );
}

export default function DailyPracticePage() {
  const { isBeta } = useBetaStatus();
  const { data } = useQuery<PrayerStreak>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak") as Promise<PrayerStreak>,
    staleTime: 60_000,
  });

  const streak = data?.streak ?? 0;
  const loggedToday = !!data?.loggedToday;
  const gardenCount = data?.gardenPrayedTodayCount ?? 0;
  const lastPrayedLabel = formatLastPrayed(data?.lastPrayedDate ?? null);
  // Mirror the dashboard CTA: a fresh slideshow if they haven't prayed
  // today, otherwise replay (?reset=1) so "pray again" doesn't resume
  // mid-list.
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
        <h1 className="text-2xl font-bold mb-1" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          Daily Practice 🌱
        </h1>
        <p className="text-sm mb-2" style={{ color: SAGE }}>
          See how your rhythm is growing — and shape the practice that fits you.
        </p>

        <SectionHeader label="Your progress" />
        <div
          className="rounded-2xl px-5 py-5"
          style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex flex-col items-center justify-center rounded-2xl shrink-0"
              style={{ width: 84, height: 84, background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.3)" }}
            >
              <span style={{ fontSize: 28, lineHeight: 1 }}>🔥</span>
              <span style={{ fontSize: 26, fontWeight: 800, color: WARM, fontFamily: SPACE_GROTESK, lineHeight: 1.15 }}>
                {streak}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-lg font-bold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                {streak > 0 ? `${streak}-day streak` : "Start your streak"}
              </p>
              <p className="text-sm" style={{ color: loggedToday ? "#A8C5A0" : SAGE, margin: "2px 0 0" }}>
                {loggedToday ? "You've prayed today ✓" : "You haven't prayed yet today"}
              </p>
              {lastPrayedLabel && (
                <p className="text-xs" style={{ color: "rgba(143,175,150,0.7)", margin: "4px 0 0" }}>
                  Last prayed {lastPrayedLabel}
                </p>
              )}
            </div>
          </div>
          {gardenCount > 0 && (
            <p
              className="text-[13px] mt-4 pt-3"
              style={{ color: SAGE, borderTop: "1px solid rgba(200,212,192,0.12)" }}
            >
              🌿 {gardenCount} {gardenCount === 1 ? "person" : "people"} in your circle prayed today
            </p>
          )}
        </div>

        <Link
          href={beginHref}
          className="block text-center mt-3 rounded-xl px-4 py-3 font-semibold transition-opacity hover:opacity-90"
          style={{ background: "#2D5E3F", color: WARM, fontFamily: SPACE_GROTESK }}
        >
          {loggedToday ? "Pray again →" : "Begin today's prayer →"}
        </Link>

        <SectionHeader label="Build your practice" />
        <Blurb>
          Set your morning and evening rhythms separately — depth, reminder, way to pray, and a reflection for each.
        </Blurb>
        <div className="flex flex-col gap-2">
          {isBeta && (
            <PracticeLinkRow
              emoji="✦"
              label="Start a conversation about prayer"
              sub="A guided reflection that ends in a personal rule of life"
              href="/rule-of-life"
            />
          )}
          <PracticeLinkRow
            emoji="🌅"
            label="Morning"
            sub="Depth, reminder, way to pray, and reflection"
            href="/bcp/daily-office/settings?side=morning"
          />
          <PracticeLinkRow
            emoji="🌙"
            label="Evening"
            sub="Depth, reminder, way to pray, and reflection"
            href="/bcp/daily-office/settings?side=evening"
          />
        </div>
      </div>
    </Layout>
  );
}
