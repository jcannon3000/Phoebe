/**
 * CommunityRuleCard — "Our rule of life" on the community page.
 *
 * The community's shared daily rhythm (set by its leaders), adoptable in one
 * tap: praying WITH each other, not just for each other. Adopting applies the
 * rule to the member's account (offices, cards, silence — never their prayers
 * or journals) and mirrors it onto this device immediately.
 *
 * Self-gating: when the community has no rule yet, members see nothing and
 * admins see a quiet "set our rule of life" doorway.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { adoptRoutineConfig } from "@/lib/routineSync";
import { swellHaptic } from "@/lib/swellHaptic";

type RuleSpec = {
  officePrefs: {
    morning: "office" | "devotion" | "none";
    evening: "office" | "devotion" | "none";
    morningTime: string | null;
    eveningTime: string | null;
    contemplationGoalMinutes: number;
  };
  silenceLadderEnabled: boolean;
  homeLayout: { order: string[]; hidden: string[] };
  ruleConfig: Record<string, string>;
};
type RuleData = {
  rule: { label: string | null; spec: RuleSpec; adoptCount: number; token: string | null } | null;
  isAdmin: boolean;
};

const CARD_LABELS: Record<string, string> = {
  gratitude: "Gratitude", journaling: "Journaling", reading: "Reading",
  podcasts: "Podcasts", examen: "Examen", listening: "Audio Divina",
  scripture: "Scripture audio", walk: "Walking prayer",
  cobreathe: "Creation Prayer", cac: "Richard Rohr (CAC)", fdd: "Forward Day by Day", ssje: "SSJE",
};
const OFFICE_LABEL: Record<string, string> = { devotion: "Daily Devotion", office: "Daily Office", none: "" };

// The weekly Way of Love practices the rule carries (ruleConfig
// "phoebe:weekly-practices" — a JSON array of kinds). Shown as its own
// summary line so an adopter sees the week's shape, not just the day's.
const WEEKLY_LABELS: Record<string, string> = { commune: "Commune", go: "Go", bless: "Bless", rest: "Rest" };
function weeklyLine(ruleConfig: Record<string, string> | undefined): string | null {
  try {
    const raw = ruleConfig?.["phoebe:weekly-practices"];
    if (!raw) return null;
    const kinds = (JSON.parse(raw) as unknown[]).filter((k): k is string => typeof k === "string" && k in WEEKLY_LABELS);
    if (kinds.length === 0) return null;
    return `Each week — ${kinds.map((k) => WEEKLY_LABELS[k]).join(" · ")}`;
  } catch { return null; }
}

function summarize(spec: RuleSpec): string[] {
  const out: string[] = [];
  const op = spec.officePrefs;
  if (op.morning !== "none") out.push(`Morning — ${OFFICE_LABEL[op.morning]}${op.morningTime ? ` at ${op.morningTime}` : ""}`);
  if (op.evening !== "none") out.push(`Evening — ${OFFICE_LABEL[op.evening]}${op.eveningTime ? ` at ${op.eveningTime}` : ""}`);
  if (spec.silenceLadderEnabled) out.push("Silence — a growing daily practice");
  else if (op.contemplationGoalMinutes > 0) out.push(`Silence — ${op.contemplationGoalMinutes} min a day`);
  const hidden = new Set(spec.homeLayout.hidden);
  const cards = spec.homeLayout.order.filter((k) => CARD_LABELS[k] && !hidden.has(k)).map((k) => CARD_LABELS[k]);
  if (cards.length) out.push(`Practices — ${cards.join(" · ")}`);
  const weekly = weeklyLine(spec.ruleConfig);
  if (weekly) out.push(weekly);
  return out.slice(0, 5);
}

export function CommunityRuleCard({ slug }: { slug: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [adopting, setAdopting] = useState(false);
  const [adopted, setAdopted] = useState(false);
  const [error, setError] = useState(false);

  const { data } = useQuery<RuleData>({
    queryKey: [`/api/groups/${slug}/rule`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/rule`),
  });

  const adopt = async () => {
    if (adopting || adopted) return;
    setAdopting(true); setError(false);
    try {
      const res = await apiRequest("POST", `/api/groups/${slug}/rule/adopt`, {}) as { ruleConfig?: Record<string, string> };
      // Mirror the rule onto THIS device so the home reflects it immediately.
      adoptRoutineConfig(res?.ruleConfig);
      swellHaptic();
      setAdopted(true);
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      qc.invalidateQueries({ queryKey: ["/api/me/office-prefs"] });
      qc.invalidateQueries({ queryKey: [`/api/groups/${slug}/rule`] });
    } catch {
      setError(true);
    } finally {
      setAdopting(false);
    }
  };

  if (!data) return null;

  // No rule yet — a quiet doorway for leaders, nothing for members.
  if (!data.rule) {
    if (!data.isAdmin) return null;
    return (
      <div
        onClick={() => setLocation(`/communities/${slug}/rule-of-life/set`)}
        role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(`/communities/${slug}/rule-of-life/set`); } }}
        className="relative flex rounded-xl overflow-hidden cursor-pointer mb-3"
        style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)" }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
        <div className="flex-1 px-4 py-3 flex items-center gap-3">
          <span className="text-2xl" aria-hidden>🕯️</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.6)" }}>Our rule of life</p>
            <p className="text-[13px] mt-0.5 leading-snug" style={{ color: "#C8D4C0" }}>
              Set the daily rhythm your community keeps together — members adopt it in one tap.
            </p>
          </div>
          <span aria-hidden style={{ color: "rgba(143,175,150,0.4)", fontSize: 20 }}>›</span>
        </div>
      </div>
    );
  }

  const lines = summarize(data.rule.spec);
  const n = data.rule.adoptCount;
  return (
    <div className="relative flex rounded-xl overflow-hidden mb-3" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)" }}>
      <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
      <div className="flex-1 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>🕯️</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.6)" }}>Our rule of life</p>
            <p className="text-[14.5px] mt-1 font-semibold leading-snug" style={{ color: "#F0EDE6" }}>
              {data.rule.label?.trim() || "One rhythm, kept together"}
            </p>
            <div className="mt-1.5 space-y-0.5">
              {lines.map((l, i) => (
                <p key={i} className="text-[12.5px] leading-snug" style={{ color: "#C8D4C0" }}>{l}</p>
              ))}
            </div>
            {n > 0 && (
              <p className="text-[12px] mt-1.5" style={{ color: "rgba(143,175,150,0.7)" }}>
                Taken up {n} {n === 1 ? "time" : "times"}
              </p>
            )}
            {error && <p className="text-[12px] mt-1.5" style={{ color: "#C47A65" }}>Couldn't adopt the rule — try again.</p>}
            <div className="flex items-center gap-3 mt-2.5">
              <button
                type="button" onClick={adopt} disabled={adopting || adopted}
                className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-opacity active:scale-[0.98] disabled:opacity-70"
                style={{ background: adopted ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.85)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.6)" }}
              >
                {adopted ? "This is your rhythm now ✓" : adopting ? "Taking it up…" : "Take up this rhythm"}
              </button>
              {data.isAdmin && data.rule.token && (
                <button type="button" onClick={() => setLocation(`/sign/${data.rule!.token}`)}
                  className="text-[12px]" style={{ color: "#8FAF96" }}>
                  🖨 Invite sign
                </button>
              )}
              {data.isAdmin && (
                <button type="button" onClick={() => setLocation(`/communities/${slug}/rule-of-life/set`)}
                  className="text-[12px]" style={{ color: "#8FAF96" }}>
                  Update
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
