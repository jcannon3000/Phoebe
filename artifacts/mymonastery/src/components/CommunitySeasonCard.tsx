/**
 * CommunitySeasonCard — a BOUNDED season the community keeps together (beta).
 *
 * "Our rule, kept together for these three weeks." A leader starts a season
 * (it snapshots the community's rule of life); members join from the season
 * page and check in daily, witnessed as today's count + first names. The card
 * shows the shared Day-N clock and opens the existing /season/:token page for
 * the daily loop. Finite is the point — when the season ends, the card returns
 * to its invitation state.
 *
 * Self-gating: members see nothing until a season runs; leaders see a quiet
 * "start a season" doorway once the community has a rule of life.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

type SeasonData = {
  season: {
    token: string; title: string; startYmd: string;
    durationDays: number; day: number; memberCount: number; joined: boolean;
  } | null;
  isAdmin: boolean;
};

const DURATIONS = [7, 14, 21, 28] as const;

export function CommunitySeasonCard({ slug }: { slug: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [durationDays, setDurationDays] = useState<number>(21);

  const { data } = useQuery<SeasonData>({
    queryKey: [`/api/groups/${slug}/season`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/season`),
  });

  // Whether the community has a rule at all (the season snapshots it) — the
  // doorway only makes sense once one is set. Shares the rule query's cache.
  const { data: ruleData } = useQuery<{ rule: { label: string | null } | null }>({
    queryKey: [`/api/groups/${slug}/rule`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/rule`),
  });

  const start = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/season`, { durationDays }),
    onSuccess: () => {
      setComposing(false);
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/season`] });
    },
  });

  if (!data) return null;

  // ── Active season — the shared clock ──────────────────────────────────────
  if (data.season) {
    const s = data.season;
    const notStarted = s.day < 1;
    return (
      <div
        onClick={() => setLocation(`/season/${s.token}`)}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(`/season/${s.token}`); } }}
        className="relative flex rounded-xl overflow-hidden cursor-pointer mb-3"
        style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)" }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
        <div className="flex-1 px-4 py-3 flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🌱</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.6)" }}>
              {notStarted ? "A season begins soon" : `Day ${s.day} of ${s.durationDays}`}
            </p>
            <p className="text-[14px] mt-0.5 font-semibold leading-snug truncate" style={{ color: WARM, fontFamily: FONT }}>
              {s.title}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "rgba(143,175,150,0.75)", fontFamily: FONT }}>
              {s.memberCount > 0
                ? `${s.memberCount} keeping it together${s.joined ? " · you're in" : ""}`
                : "Be the first to join"}
            </p>
          </div>
          <span aria-hidden style={{ color: "rgba(143,175,150,0.4)", fontSize: 20 }}>›</span>
        </div>
      </div>
    );
  }

  // ── No season — leaders get the doorway (requires a rule to snapshot) ─────
  if (!data.isAdmin || !ruleData?.rule) return null;

  if (!composing) {
    return (
      <div
        onClick={() => setComposing(true)}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setComposing(true); } }}
        className="relative flex rounded-xl overflow-hidden cursor-pointer mb-3"
        style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)" }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
        <div className="flex-1 px-4 py-3 flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🌱</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.6)" }}>Start a season</p>
            <p className="text-[13px] mt-0.5 leading-snug" style={{ color: "#C8D4C0" }}>
              Keep your rule of life together for a few weeks — a shared start, daily check-ins, a finish.
            </p>
          </div>
          <span aria-hidden style={{ color: "rgba(143,175,150,0.4)", fontSize: 20 }}>›</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex rounded-xl overflow-hidden mb-3" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)" }}>
      <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
      <div className="flex-1 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.6)" }}>Start a season</p>
        <p className="text-[13px] mt-1 leading-snug" style={{ color: "#C8D4C0", fontFamily: FONT }}>
          Your community's rule, kept together — starting today. How long should it run?
        </p>
        <div className="flex gap-1.5 mt-2.5 flex-wrap">
          {DURATIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDurationDays(d)}
              className="rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-opacity active:opacity-75"
              style={durationDays === d
                ? { background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(126,210,140,0.5)", fontFamily: FONT }
                : { background: "transparent", color: "rgba(182,210,188,0.7)", border: "1px solid rgba(143,175,150,0.25)", fontFamily: FONT }}
            >
              {d === 7 ? "1 week" : `${d / 7} weeks`}
            </button>
          ))}
        </div>
        {start.isError && (
          <p className="text-[12px] mt-2" style={{ color: "#C47A65", fontFamily: FONT }}>
            Couldn't start the season — is one already running?
          </p>
        )}
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button" disabled={start.isPending} onClick={() => start.mutate()}
            className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-opacity active:scale-[0.98] disabled:opacity-60"
            style={{ background: "rgba(46,107,64,0.85)", color: WARM, border: "1px solid rgba(46,107,64,0.6)", fontFamily: FONT }}
          >
            {start.isPending ? "Starting…" : "Begin the season"}
          </button>
          <button type="button" onClick={() => setComposing(false)} className="text-[12px]" style={{ color: SAGE, fontFamily: FONT }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * CommunityPulseLine — the LEADER's aggregate weekly read (beta).
 * "9 of 24 of us prayed this week." Aggregate only; the server withholds the
 * count entirely for groups under 4 members (privacy floor), and this renders
 * nothing in that case — presence, never attendance.
 */
export function CommunityPulseLine({ slug }: { slug: string }) {
  const weekStart = (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    return d.toLocaleDateString("en-CA");
  })();
  const { data } = useQuery<{ count: number | null; memberCount: number }>({
    queryKey: [`/api/groups/${slug}/pulse`, weekStart],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/pulse?weekStart=${weekStart}`),
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!data || data.count == null || data.count < 1) return null;
  return (
    <p className="text-[12.5px] mb-3 px-0.5" style={{ color: "rgba(168,197,160,0.85)", fontFamily: FONT }}>
      🕊️ {data.count} of {data.memberCount} of us prayed this week
    </p>
  );
}
