import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { ContemplationTimer } from "@/components/ContemplationTimer";

// Contemplation home — reachable from the side menu. Shows the viewer's
// time-in-silence stats and a button to begin a sit. The timer itself
// is the shared ContemplationTimer overlay (also launched from the
// prayer-mode pause slide).

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";

type Stats = { todaySeconds: number; weekSeconds: number; totalSeconds: number; sessionCount: number };

// "42 min", "1h 12m", "—" for zero.
function humanMinutes(seconds: number): string {
  if (!seconds || seconds < 60) return seconds > 0 ? "<1 min" : "—";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex-1 rounded-2xl px-4 py-5 text-center"
      style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
    >
      <p className="font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 22, lineHeight: 1.1, margin: 0 }}>
        {value}
      </p>
      <p className="text-[11px] mt-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK, margin: 0 }}>
        {label}
      </p>
    </div>
  );
}

export default function ContemplationPage() {
  const [timerOpen, setTimerOpen] = useState(false);
  // Local midnight so the server can scope "today" to the user's
  // calendar day rather than UTC. Stable within a day; keyed into the
  // query so it refetches cleanly across a midnight rollover.
  const todaySince = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/me/contemplation-stats", todaySince.slice(0, 10)],
    queryFn: () =>
      apiRequest("GET", `/api/me/contemplation-stats?todaySince=${encodeURIComponent(todaySince)}`) as Promise<Stats>,
  });

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            🧘
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
              Contemplation
            </h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>
              A timer for silent prayer — a bell to begin, a bell to close.
            </p>
          </div>
        </div>

        {/* Stats — today / this week / all time. */}
        <div className="flex gap-3 mb-6">
          <StatTile label="today" value={humanMinutes(stats?.todaySeconds ?? 0)} />
          <StatTile label="this week" value={humanMinutes(stats?.weekSeconds ?? 0)} />
          <StatTile label="all time" value={humanMinutes(stats?.totalSeconds ?? 0)} />
        </div>

        <button
          type="button"
          onClick={() => setTimerOpen(true)}
          className="w-full rounded-2xl py-4 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{
            background: "#2D5E3F",
            color: WARM,
            border: "1px solid rgba(46,107,64,0.7)",
            fontFamily: SPACE_GROTESK,
            fontSize: 16,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Begin contemplation →
        </button>

        <p className="text-[12px] mt-4 text-center" style={{ color: "rgba(143,175,150,0.6)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
          Choose a length, then rest in the silence until the bell.
        </p>
      </div>

      <ContemplationTimer open={timerOpen} onClose={() => setTimerOpen(false)} />
    </Layout>
  );
}
