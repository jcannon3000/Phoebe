/**
 * Community metrics — admin-only, beta-gated dashboard.
 *
 * Two entry points:
 *   1. `/communities/:slug/settings` → "Metrics" tab (primary surface).
 *   2. `/communities/:slug/metrics` → standalone page (deep-link target,
 *      e.g. from push notifications or direct URL share).
 *
 * `MetricsDashboard` is exported so community-settings can embed it
 * inline under the Metrics tab without wrapping in a second Layout.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";

const FONT = "'Space Grotesk', sans-serif";

type Metrics = {
  groupName: string;
  totalMembers: number;

  prayedToday: number;
  prayedThisWeek: number;
  prayedAllTime: number;

  prayerRequestsTotal: number;
  prayerRequestsToday: number;
  prayerRequestsThisWeek: number;

  // "times prayed" = distinct (user, day) pairs who amen'd. Tapping
  // amen five times in one day counts once.
  timesPrayedTotal: number;
  timesPrayedToday: number;
  timesPrayedThisWeek: number;

  // "offices" = distinct (user, day, side) tuples for Daily Office
  // / Devotion sessions. Max two per person per day (morning +
  // evening); sessions that reached <3 slides don't count.
  officesTotal: number;
  officesToday: number;
  officesThisWeek: number;

  // "Time praying" — total seconds members have spent in the
  // slideshow / Office / Devotion viewers. Tracked per-session and
  // capped per-session in the POST /prayer-sessions route, so a
  // phone left on a slide overnight can't skew the rollup.
  secondsPrayedTotal: number;
  secondsPrayedToday: number;
  secondsPrayedThisWeek: number;
};

type OfficeWindowCounts = { today: number; thisWeek: number; thisMonth: number };
type OfficesMetrics = {
  morningPrayer: OfficeWindowCounts;
  morningDevotion: OfficeWindowCounts;
  eveningPrayer: OfficeWindowCounts;
  eveningDevotion: OfficeWindowCounts;
  /** Aggregate seconds spent across all four offices, per window.
   *  Mirrors the count columns (Today / Week / Month) so the detail
   *  panel can show a parallel "Total time" row at the bottom. */
  secondsToday: number;
  secondsThisWeek: number;
  secondsThisMonth: number;
  secondsTotal: number;
};

// Format a seconds total for the metrics tile. Today buckets render
// as "Mm" (or "<1m" if non-zero but under 60s), week / all-time
// buckets render as "Hh Mm" with the hours dropping when under an
// hour. Keeps the tile readable at any magnitude without overflowing
// the three-column grid.
function formatPrayingDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0m";
  if (seconds < 60) return "<1m";
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

// Standalone page (route: /communities/:slug/metrics). Thin wrapper
// around MetricsDashboard with Layout + auth redirect.
export default function CommunityMetricsPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 md:px-8 py-6">
        <div className="mb-8">
          <Link href={`/communities/${slug}/settings`}>
            <span className="text-xs" style={{ color: "rgba(143,175,150,0.65)", fontFamily: FONT }}>
              {t("community_metrics.back_to_settings")}
            </span>
          </Link>
        </div>
        <MetricsDashboard slug={slug} />
      </div>
    </Layout>
  );
}

// ─── Reusable dashboard ────────────────────────────────────────────────────
// Embeddable. No Layout wrapper of its own so it composes cleanly into
// the Metrics tab of community-settings.

export function MetricsDashboard({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { isBeta } = useBetaStatus();

  const { data, isLoading, error } = useQuery<Metrics>({
    queryKey: [`/api/groups/${slug}/metrics`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/metrics`),
    enabled: !!slug && !!isBeta,
    staleTime: 30_000,
  });

  if (!isBeta) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm" style={{ color: "#8FAF96", fontFamily: FONT }}>
          {t("community_metrics.beta_only")}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <p className="text-xs" style={{ color: "#8FAF96", fontFamily: FONT }}>
          {t("community_metrics.loading")}
        </p>
      </div>
    );
  }

  if (error || !data) {
    const msg = error instanceof Error ? error.message : t("community_metrics.unknown_error");
    return (
      <div className="py-10 text-center">
        <p className="text-sm mb-3" style={{ color: "#8FAF96", fontFamily: FONT }}>
          {t("community_metrics.load_failed")}
        </p>
        <p
          className="text-[11px] mx-auto max-w-md rounded-lg px-3 py-2 text-left"
          style={{
            color: "rgba(143,175,150,0.75)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            background: "rgba(0,0,0,0.25)",
            border: "1px solid rgba(143,175,150,0.25)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {msg}
        </p>
      </div>
    );
  }

  // Zero-activity hint: differentiates "no one has prayed yet" from a
  // broken endpoint (which shows the error block above instead). Only
  // surfaces when every actionable count is 0 — an empty community is
  // common right after launch.
  const allZero =
    data.prayedToday === 0 &&
    data.prayedThisWeek === 0 &&
    data.prayedAllTime === 0 &&
    data.prayerRequestsTotal === 0 &&
    data.timesPrayedTotal === 0;

  return (
    <div>
      {allZero && (
        <div
          className="rounded-xl px-4 py-3 mb-6"
          style={{
            background: "rgba(46,107,64,0.08)",
            border: "1px dashed rgba(46,107,64,0.35)",
          }}
        >
          <p className="text-xs leading-relaxed" style={{ color: "#8FAF96", fontFamily: FONT }}>
            {t("community_metrics.no_activity")}
          </p>
        </div>
      )}

      {/* People praying — the headline metric */}
      <SectionHeader label={t("community_metrics.section_people_praying")} />
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatTile label={t("community_metrics.stat_today")} value={data.prayedToday} />
        <StatTile label={t("community_metrics.stat_this_week")} value={data.prayedThisWeek} />
        <StatTile label={t("community_metrics.stat_all_time")} value={data.prayedAllTime} />
      </div>

      {/* Times prayed — union of prayer-list completions + amens,
          one per person per day */}
      <SectionHeader label={t("community_metrics.section_times_prayed")} />
      <p
        className="text-[11px] leading-relaxed mb-3"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}
      >
        {t("community_metrics.times_prayed_note")}
      </p>
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatTile label={t("community_metrics.stat_today")} value={data.timesPrayedToday} />
        <StatTile label={t("community_metrics.stat_this_week")} value={data.timesPrayedThisWeek} />
        <StatTile label={t("community_metrics.stat_all_time")} value={data.timesPrayedTotal} />
      </div>

      {/* Offices — Daily Office / Devotion sessions, deduped to one
          per (person, day, side). A "side" is morning or evening,
          so the daily ceiling for any one person is 2. Surfaces
          this separate from Times prayed because tracking the
          office cadence is a meaningfully different signal than
          tracking any prayer activity. */}
      <SectionHeader label={t("community_metrics.section_offices")} />
      <p
        className="text-[11px] leading-relaxed mb-3"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}
      >
        {t("community_metrics.offices_note")}
      </p>
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatTile label={t("community_metrics.stat_today")} value={data.officesToday} />
        <StatTile label={t("community_metrics.stat_this_week")} value={data.officesThisWeek} />
        <StatTile label={t("community_metrics.stat_all_time")} value={data.officesTotal} />
      </div>

      {/* Time praying section was removed from the metrics dashboard
          per user direction. The data still flows through
          prayer_sessions; we just don't surface the duration rollup
          here anymore. The endpoint still returns secondsPrayed*
          fields and the StatTextTile / formatPrayingDuration
          helpers are kept (unused) so bringing it back is a one-
          place change later. */}

      {/* Offices section was removed from the metrics dashboard
          per user direction. The data still flows through
          prayer_sessions for the time-praying rollup; we just
          don't break it out by office surface here. The
          OfficesRow component below is kept (unused) in case we
          want to bring it back later. */}

      {/* Prayer requests */}
      <SectionHeader label={t("community_metrics.section_prayer_requests")} />
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatTile label={t("community_metrics.stat_today")} value={data.prayerRequestsToday} />
        <StatTile label={t("community_metrics.stat_this_week")} value={data.prayerRequestsThisWeek} />
        <StatTile label={t("community_metrics.stat_all_time")} value={data.prayerRequestsTotal} />
      </div>

      {/* Community roster */}
      <SectionHeader label={t("community_metrics.section_community")} />
      <div className="grid grid-cols-1 gap-3 mb-10">
        <StatTile label={t("community_metrics.stat_members")} value={data.totalMembers} wide />
      </div>

      <p
        className="text-[11px] leading-relaxed text-center"
        style={{ color: "rgba(143,175,150,0.45)", fontFamily: FONT }}
      >
        {t("community_metrics.footer_note")}
      </p>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span
        className="text-[10px] font-semibold uppercase"
        style={{
          color: "rgba(200,212,192,0.55)",
          fontFamily: FONT,
          letterSpacing: "0.18em",
        }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
    </div>
  );
}

// Tile that takes a pre-formatted string value (e.g. "1h 12m") instead
// of a number. Used by the "Time praying" row, which has variable-
// width values that the count-style 3xl/4xl class would clip.
function StatTextTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-5 py-4 text-center"
      style={{
        background: "rgba(46,107,64,0.10)",
        border: "1px solid rgba(46,107,64,0.22)",
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase mb-1"
        style={{
          color: "rgba(143,175,150,0.7)",
          fontFamily: FONT,
          letterSpacing: "0.14em",
        }}
      >
        {label}
      </p>
      <p
        className="text-2xl"
        style={{
          fontFamily: FONT,
          color: "#F0EDE6",
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </p>
    </div>
  );
}

// ── OfficesRow — collapsed summary + per-office breakdown ──────────────
//
// One row labelled "Offices" — sums all four sessions counts for
// today / this week / this month — with a "More detail" toggle that
// reveals the four-row breakdown plus the all-time total time across
// all four offices. Sums are computed client-side from the per-office
// counts the API already returns; the API doesn't need to ship a
// separate aggregate field for this.
function OfficesRow({ offices }: { offices: OfficesMetrics }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // Defensive fill so a partial API response (e.g. server still
  // rolling out the new fields) doesn't crash the page. Each office
  // counts block is read three times below, so wrapping the access
  // here keeps the JSX clean.
  const empty: OfficeWindowCounts = { today: 0, thisWeek: 0, thisMonth: 0 };
  const morningPrayer = offices.morningPrayer ?? empty;
  const morningDevotion = offices.morningDevotion ?? empty;
  const eveningPrayer = offices.eveningPrayer ?? empty;
  const eveningDevotion = offices.eveningDevotion ?? empty;
  const sumToday =
    morningPrayer.today +
    morningDevotion.today +
    eveningPrayer.today +
    eveningDevotion.today;
  const sumWeek =
    morningPrayer.thisWeek +
    morningDevotion.thisWeek +
    eveningPrayer.thisWeek +
    eveningDevotion.thisWeek;
  const sumMonth =
    morningPrayer.thisMonth +
    morningDevotion.thisMonth +
    eveningPrayer.thisMonth +
    eveningDevotion.thisMonth;

  const rows: Array<{ label: string; counts: OfficeWindowCounts }> = [
    { label: t("community_metrics.office_morning_prayer"), counts: morningPrayer },
    { label: t("community_metrics.office_morning_devotion"), counts: morningDevotion },
    { label: t("community_metrics.office_evening_prayer"), counts: eveningPrayer },
    { label: t("community_metrics.office_evening_devotion"), counts: eveningDevotion },
  ];

  return (
    <div className="mb-8">
      {/* Collapsed: today / week / month aggregate tiles. */}
      <div className="grid grid-cols-3 gap-3 mb-2">
        <StatTile label={t("community_metrics.stat_today")} value={sumToday} />
        <StatTile label={t("community_metrics.stat_this_week")} value={sumWeek} />
        <StatTile label={t("community_metrics.stat_this_month")} value={sumMonth} />
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-[11px] font-semibold uppercase tracking-[0.14em] transition-opacity hover:opacity-80"
        style={{
          color: "rgba(143,175,150,0.7)",
          fontFamily: FONT,
          background: "transparent",
          border: "none",
          padding: "4px 0",
          cursor: "pointer",
        }}
      >
        {expanded ? t("community_metrics.hide_detail") : t("community_metrics.more_detail")}
      </button>

      {expanded && (
        <div
          className="rounded-2xl mt-3 overflow-hidden"
          style={{
            background: "rgba(46,107,64,0.08)",
            border: "1px solid rgba(46,107,64,0.22)",
          }}
        >
          {/* Header row — column labels for the per-office grid. */}
          <div
            className="grid items-center gap-2 px-4 py-2.5"
            style={{
              gridTemplateColumns: "1fr 56px 56px 56px",
              borderBottom: "1px solid rgba(46,107,64,0.18)",
            }}
          >
            <span />
            {([
              { key: "today", label: t("community_metrics.col_today") },
              { key: "week", label: t("community_metrics.col_week") },
              { key: "month", label: t("community_metrics.col_month") },
            ] as const).map((h) => (
              <span
                key={h.key}
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-right"
                style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}
              >
                {h.label}
              </span>
            ))}
          </div>
          {rows.map((r, i) => (
            <div
              key={r.label}
              className="grid items-center gap-2 px-4 py-3"
              style={{
                gridTemplateColumns: "1fr 56px 56px 56px",
                borderTop: i === 0 ? "none" : "1px solid rgba(46,107,64,0.12)",
              }}
            >
              <span
                className="text-sm"
                style={{ color: "#F0EDE6", fontFamily: FONT }}
              >
                {r.label}
              </span>
              <span className="text-sm tabular-nums text-right" style={{ color: "#C8D4C0", fontFamily: FONT }}>
                {r.counts.today.toLocaleString()}
              </span>
              <span className="text-sm tabular-nums text-right" style={{ color: "#C8D4C0", fontFamily: FONT }}>
                {r.counts.thisWeek.toLocaleString()}
              </span>
              <span className="text-sm tabular-nums text-right" style={{ color: "#C8D4C0", fontFamily: FONT }}>
                {r.counts.thisMonth.toLocaleString()}
              </span>
            </div>
          ))}
          {/* Total time row — three windowed values lined up under the
              count columns (Today / Week / Month) so the time totals
              and counts share the same visual rhythm. */}
          <div
            className="grid items-center gap-2 px-4 py-3"
            style={{
              gridTemplateColumns: "1fr 56px 56px 56px",
              borderTop: "1px solid rgba(46,107,64,0.18)",
            }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT }}
            >
              {t("community_metrics.total_time")}
            </span>
            <span className="text-[12px] tabular-nums text-right" style={{ color: "#F0EDE6", fontFamily: FONT, fontWeight: 600 }}>
              {formatPrayingDuration(offices.secondsToday ?? 0)}
            </span>
            <span className="text-[12px] tabular-nums text-right" style={{ color: "#F0EDE6", fontFamily: FONT, fontWeight: 600 }}>
              {formatPrayingDuration(offices.secondsThisWeek ?? 0)}
            </span>
            <span className="text-[12px] tabular-nums text-right" style={{ color: "#F0EDE6", fontFamily: FONT, fontWeight: 600 }}>
              {formatPrayingDuration(offices.secondsThisMonth ?? 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, wide }: { label: string; value: number; wide?: boolean }) {
  return (
    <div
      className="rounded-2xl px-5 py-4 text-center"
      style={{
        background: "rgba(46,107,64,0.10)",
        border: "1px solid rgba(46,107,64,0.22)",
      }}
    >
      <p
        className="text-[10px] font-semibold uppercase mb-1"
        style={{
          color: "rgba(143,175,150,0.7)",
          fontFamily: FONT,
          letterSpacing: "0.14em",
        }}
      >
        {label}
      </p>
      <p
        className={wide ? "text-4xl" : "text-3xl"}
        style={{
          fontFamily: FONT,
          color: "#F0EDE6",
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}
      >
        {value.toLocaleString()}
      </p>
    </div>
  );
}
