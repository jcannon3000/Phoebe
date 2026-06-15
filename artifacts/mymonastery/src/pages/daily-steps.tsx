import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import {
  useDailySteps,
  appleHealthAvailable,
  requestStepAuthorization,
  openHealthApp,
} from "@/lib/appleHealth";

// Daily steps — the goal + "Connect Apple Health" surface, reached from the
// Daily steps home card and the Rule-of-Life "Daily steps" toggle. Steps come
// from Apple Health (HealthKit); the goal lives in office-prefs. The server
// fires a "step goal reached" push the first time today's synced steps hit it.

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
const ACCENT = "rgba(139,121,84,0.85)";

// Preset goals (0 = off). Round numbers people recognize.
const GOAL_PRESETS = [0, 5000, 7500, 10000, 12500, 15000];

export default function DailyStepsPage() {
  const qc = useQueryClient();
  const native = appleHealthAvailable();
  const { steps } = useDailySteps();
  const [connected, setConnected] = useState<boolean>(() => {
    try { return localStorage.getItem("phoebe:health-connected") === "1"; } catch { return false; }
  });

  const { data: prefs } = useQuery<{ dailyStepGoal?: number }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs") as Promise<{ dailyStepGoal?: number }>,
    staleTime: 5 * 60_000,
  });
  const goal = prefs?.dailyStepGoal ?? 0;

  const setGoal = useMutation({
    mutationFn: (dailyStepGoal: number) =>
      apiRequest("PUT", "/api/me/office-prefs", { dailyStepGoal }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] }),
  });

  const connect = () => {
    void requestStepAuthorization()
      .then(() => {
        try { localStorage.setItem("phoebe:health-connected", "1"); } catch { /* private mode */ }
        setConnected(true);
        qc.invalidateQueries({ queryKey: ["apple-health-steps"] });
      })
      .catch(() => { /* best-effort */ });
  };

  const met = goal > 0 && steps >= goal;
  const pct = goal > 0 ? Math.min(100, Math.round((steps / goal) * 100)) : 0;

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full flex flex-col flex-1">
        <div className="flex items-start gap-3 mb-5">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(139,121,84,0.18)", border: "1px solid rgba(139,121,84,0.35)" }}
          >
            👟
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
              Daily steps
            </h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>
              Walk toward a daily goal — counted from Apple Health
            </p>
          </div>
        </div>

        {/* Today's progress */}
        <div
          className="rounded-2xl p-5 mb-4"
          style={{ background: "rgba(139,121,84,0.12)", border: "1px solid rgba(139,121,84,0.30)" }}
        >
          <p className="leading-none" style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 34, fontWeight: 700 }}>
            {native ? steps.toLocaleString() : "—"}
          </p>
          <p className="text-[12.5px] mt-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
            {!native
              ? "Steps sync from Apple Health on your iPhone."
              : goal <= 0
                ? "steps today — set a goal below"
                : met
                  ? `steps today — you've hit your ${goal.toLocaleString()}-step goal 🌿`
                  : `of ${goal.toLocaleString()} steps today`}
          </p>
          {native && goal > 0 && (
            <div className="mt-3 rounded-full overflow-hidden" style={{ height: 6, background: "rgba(143,175,150,0.16)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: ACCENT, transition: "width 0.3s" }} />
            </div>
          )}
        </div>

        {/* Connect Apple Health (native only, until connected) */}
        {native && !connected && (
          <button
            type="button"
            onClick={connect}
            className="w-full rounded-xl py-3.5 text-center mb-4 transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: ACCENT, color: WARM, border: "1px solid rgba(139,121,84,0.5)", fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
          >
            Connect Apple Health
          </button>
        )}

        {/* Goal picker */}
        <p className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-2" style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}>
          Daily goal
        </p>
        <div className="grid grid-cols-3 gap-2 mb-6">
          {GOAL_PRESETS.map((g) => {
            const active = goal === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => setGoal.mutate(g)}
                className="rounded-xl py-3 text-center transition-opacity active:scale-[0.99]"
                style={{
                  background: active ? "rgba(139,121,84,0.22)" : "rgba(200,212,192,0.05)",
                  border: `1px solid ${active ? "rgba(139,121,84,0.6)" : "rgba(200,212,192,0.15)"}`,
                  color: active ? WARM : SAGE,
                  fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: active ? 700 : 500, cursor: "pointer",
                }}
              >
                {g === 0 ? "Off" : g.toLocaleString()}
              </button>
            );
          })}
        </div>

        {native && connected && (
          <button
            type="button"
            onClick={() => openHealthApp()}
            className="text-[13px] py-2 text-center"
            style={{ color: "rgba(143,175,150,0.7)", fontFamily: SPACE_GROTESK, background: "none", border: "none", cursor: "pointer" }}
          >
            Open Apple Health
          </button>
        )}
      </div>
    </Layout>
  );
}
