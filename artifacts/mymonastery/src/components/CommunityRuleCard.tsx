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
import { summarizeRuleSpec, type RuleSpec } from "@/lib/ruleSummary";

type RuleData = {
  rule: {
    label: string | null; spec: RuleSpec; adoptCount: number; token: string | null;
    viewerAdopted?: boolean;
  } | null;
  isAdmin: boolean;
  groupName?: string;
};


export function CommunityRuleCard({ slug }: { slug: string }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [adopting, setAdopting] = useState(false);
  const [justAdopted, setJustAdopted] = useState(false);
  const [error, setError] = useState(false);

  const { data } = useQuery<RuleData>({
    queryKey: [`/api/groups/${slug}/rule`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/rule`),
  });
  /**
   * Following is a fact about the ACCOUNT, not about this render.
   *
   * It used to be local state alone, so the button read "take up this rhythm"
   * again after every reload and on every other device — inviting someone to
   * accept what they had already accepted, and (before the adopt became
   * idempotent) counting them twice for doing it. The server now answers it;
   * the local flag only covers the moment between tapping and the refetch.
   */
  const following = !!data?.rule?.viewerAdopted || justAdopted;

  const adopt = async () => {
    if (adopting || following) return;
    setAdopting(true); setError(false);
    try {
      const res = await apiRequest("POST", `/api/groups/${slug}/rule/adopt`, {}) as { ruleConfig?: Record<string, string> };
      // Mirror the rule onto THIS device so the home reflects it immediately.
      adoptRoutineConfig(res?.ruleConfig);
      swellHaptic();
      setJustAdopted(true);
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

  const lines = summarizeRuleSpec(data.rule.spec);
  const n = data.rule.adoptCount;
  /**
   * The group's own name in the invitation (owner: "they can publicly see
   * 'Follow <Group name> routine'").
   *
   * "Our rule of life" only reads right to someone who already thinks of the
   * group as ours. A group page is visible to every follower, and a public
   * group is one tap from the directory — so the reader may be someone who
   * found these people this minute. Naming them says whose rhythm it is.
   * Falls back to the possessive-free phrasing when the server hasn't sent a
   * name (an older client cache), rather than rendering "Follow 's routine".
   */
  const name = data.groupName?.trim() || "";
  const possessive = name ? (/s$/i.test(name) ? `${name}'` : `${name}'s`) : "";
  const followLabel = possessive ? `Follow ${possessive} routine` : "Follow this routine";
  return (
    <div className="relative flex rounded-xl overflow-hidden mb-3" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)" }}>
      <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
      <div className="flex-1 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>🕯️</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.6)" }}>
              {name ? `${possessive} rule of life` : "Our rule of life"}
            </p>
            <p className="text-[14.5px] mt-1 font-semibold leading-snug" style={{ color: "#F0EDE6" }}>
              {data.rule.label?.trim() || "One rhythm, kept together"}
            </p>
            <div className="mt-1.5 space-y-0.5">
              {lines.map((l, i) => (
                <p key={i} className="text-[12.5px] leading-snug" style={{ color: "#C8D4C0" }}>{l}</p>
              ))}
            </div>
            {/* People, not taps. The count is one row per person now (the
                unique (rule, user) pair on the server), so it can honestly say
                how many are keeping this rhythm rather than how many times a
                button was pressed. */}
            {n > 0 && (
              <p className="text-[12px] mt-1.5" style={{ color: "rgba(143,175,150,0.7)" }}>
                {n === 1 ? "1 person follows this rhythm" : `${n} people follow this rhythm`}
              </p>
            )}
            {error && <p className="text-[12px] mt-1.5" style={{ color: "#C47A65" }}>Couldn't adopt the rule — try again.</p>}
            <div className="flex items-center gap-3 mt-2.5">
              <button
                type="button" onClick={adopt} disabled={adopting || following}
                className="rounded-full px-4 py-1.5 text-[13px] font-semibold transition-opacity active:scale-[0.98] disabled:opacity-70"
                style={{ background: following ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.85)", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.6)" }}
              >
                {following ? "Following this routine ✓" : adopting ? "Setting it up…" : followLabel}
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
