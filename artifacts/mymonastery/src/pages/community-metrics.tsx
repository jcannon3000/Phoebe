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

import { useEffect } from "react";
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

  // "Time praying" — total seconds members have spent in the
  // slideshow / Office / Devotion viewers. Tracked per-session and
  // capped per-session in the POST /prayer-sessions route, so a
  // phone left on a slide overnight can't skew the rollup.
  secondsPrayedTotal: number;
  secondsPrayedToday: number;
  secondsPrayedThisWeek: number;
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
              ← Settings
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
          Community metrics are available to beta users.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="py-10 text-center">
        <p className="text-xs" style={{ color: "#8FAF96", fontFamily: FONT }}>
          Loading metrics…
        </p>
      </div>
    );
  }

  if (error || !data) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return (
      <div className="py-10 text-center">
        <p className="text-sm mb-3" style={{ color: "#8FAF96", fontFamily: FONT }}>
          Couldn't load metrics.
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
            No activity yet. Counts begin when members of this
            community post prayer requests or tap Amen — in the
            community tab or anywhere else in Phoebe.
          </p>
        </div>
      )}

      {/* People praying — the headline metric */}
      <SectionHeader label="People praying" />
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatTile label="Today" value={data.prayedToday} />
        <StatTile label="This week" value={data.prayedThisWeek} />
        <StatTile label="All time" value={data.prayedAllTime} />
      </div>

      {/* Times prayed — union of prayer-list completions + amens,
          one per person per day */}
      <SectionHeader label="Times prayed" />
      <p
        className="text-[11px] leading-relaxed mb-3"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}
      >
        Counts a day whenever a member either walks their prayer list
        or taps Amen. One per person per day.
      </p>
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatTile label="Today" value={data.timesPrayedToday} />
        <StatTile label="This week" value={data.timesPrayedThisWeek} />
        <StatTile label="All time" value={data.timesPrayedTotal} />
      </div>

      {/* Time praying — total seconds members have spent in the
          slideshow / Office / Devotion viewers. Captured client-side
          via the usePrayerSession hook (paused on background, capped
          per-session) and rolled up here. */}
      <SectionHeader label="Time praying" />
      <p
        className="text-[11px] leading-relaxed mb-3"
        style={{ color: "rgba(143,175,150,0.55)", fontFamily: FONT }}
      >
        Total time members spent in the prayer slideshow, the Daily
        Office, or a Daily Devotion. Reading time launched from a
        lesson slide is included while the viewer is open.
      </p>
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatTextTile label="Today" value={formatPrayingDuration(data.secondsPrayedToday)} />
        <StatTextTile label="This week" value={formatPrayingDuration(data.secondsPrayedThisWeek)} />
        <StatTextTile label="All time" value={formatPrayingDuration(data.secondsPrayedTotal)} />
      </div>

      {/* Prayer requests */}
      <SectionHeader label="Prayer requests" />
      <div className="grid grid-cols-3 gap-3 mb-8">
        <StatTile label="Today" value={data.prayerRequestsToday} />
        <StatTile label="This week" value={data.prayerRequestsThisWeek} />
        <StatTile label="All time" value={data.prayerRequestsTotal} />
      </div>

      {/* Community roster */}
      <SectionHeader label="Community" />
      <div className="grid grid-cols-1 gap-3 mb-10">
        <StatTile label="Members" value={data.totalMembers} wide />
      </div>

      <p
        className="text-[11px] leading-relaxed text-center"
        style={{ color: "rgba(143,175,150,0.45)", fontFamily: FONT }}
      >
        Counts member activity across Phoebe — community and personal
        prayer requests alike. Refreshes every 30 seconds. "This week"
        means the last seven days including today.
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
