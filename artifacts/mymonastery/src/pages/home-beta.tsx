/**
 * BETA home — organized by The Episcopal Church's Way of Love.
 *
 * A flagged, beta-only alternative to /dashboard (gated on rawIsBeta), living
 * ALONGSIDE the existing home. Six sections in Bishop Budde's daily/weekly
 * order — Turn, Learn & Pray (daily); Worship, Bless, Go, Rest (weekly) —
 * each a card showing the user's rule-of-life commitment, whether it's done
 * (today / this week), and a quiet "weeks kept" consistency line. Tapping a
 * card opens that section's page (/home-beta/:section); the completion circle
 * toggles done.
 *
 * Reads, never rebuilds: commitments from /api/rule-of-life/wol, completion
 * from /api/practice-completion (+ Learn & Pray derived from the office
 * history so the user never double-logs prayer they already prayed).
 */

import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { PRACTICES, type PracticeId } from "@/lib/wayOfLove";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const BG = "#091A10";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.26)";
const DONE_BG = "rgba(46,107,64,0.5)";
const DONE_B = "rgba(168,197,160,0.7)";

export type SectionKey = "turn" | "learn_pray" | "worship" | "bless" | "go" | "rest";

export type SectionDef = {
  key: SectionKey;
  practices: PracticeId[]; // which Way of Love practice(s) feed this section's commitment
  theme: string; // /api/podcasts/search?theme= key for Materials
  daily: boolean;
  emoji: string;
  title: string;
  definition: string;
};

// Order matters — Turn leads, then the combined daily Learn & Pray, then the
// four weekly practices.
export const SECTIONS: SectionDef[] = [
  { key: "turn", practices: ["turn"], theme: "turn", daily: true, emoji: "🔄", title: "Turn", definition: "Pause, listen, and return to the way of Jesus." },
  { key: "learn_pray", practices: ["learn", "pray"], theme: "learn", daily: true, emoji: "📖", title: "Learn & Pray", definition: "Sit with Scripture and dwell with God each day." },
  { key: "worship", practices: ["worship"], theme: "worship", daily: false, emoji: "⛪", title: "Worship", definition: "Gather with others to thank, praise, and dwell with God." },
  { key: "bless", practices: ["bless"], theme: "bless", daily: false, emoji: "🤲", title: "Bless", definition: "Share faith, and give and serve generously." },
  { key: "go", practices: ["go"], theme: "go", daily: false, emoji: "🌍", title: "Go", definition: "Cross boundaries, listen deeply, and live like Jesus." },
  { key: "rest", practices: ["rest"], theme: "rest", daily: false, emoji: "🌙", title: "Rest", definition: "Receive the gift of God's grace, peace, and restoration." },
];

// ── Date helpers (user's local timezone; weeks start Sunday) ───────────────
function pad(n: number): string { return String(n).padStart(2, "0"); }
function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sundayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // getDay(): 0 = Sunday
  return x;
}
function addWeeks(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n * 7);
  return x;
}

const DAILY_KEPT_THRESHOLD = 5; // ≥5 of 7 daily completions = a week kept (gracious)

export type CompletionRow = { section: string; localDate: string; weekStart: string };
export type WolStageData = { optionIds: string[]; custom: string };
export type WolSelections = Partial<Record<PracticeId, WolStageData>>;

// The user's committed lines for a section, drawn from their rule of life.
export function commitmentLines(def: SectionDef, sel: WolSelections): string[] {
  const out: string[] = [];
  for (const pid of def.practices) {
    const s = sel[pid];
    if (!s) continue;
    for (const id of s.optionIds ?? []) {
      const opt = PRACTICES[pid].options.find((o) => o.id === id);
      if (opt) out.push(opt.label.default);
    }
    if (s.custom?.trim()) out.push(s.custom.trim());
  }
  return out;
}

export default function HomeBetaPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const { t } = useTranslation();
  const qc = useQueryClient();

  // Beta-only: bounce everyone else back to the real home.
  useEffect(() => {
    if (!authLoading && !user) { setLocation("/"); return; }
    if (!authLoading && !betaLoading && user && !rawIsBeta) setLocation("/dashboard");
  }, [authLoading, betaLoading, user, rawIsBeta, setLocation]);

  const wolQ = useQuery<{ selections: WolSelections }>({
    queryKey: ["/api/rule-of-life/wol"],
    queryFn: () => apiRequest("GET", "/api/rule-of-life/wol"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const compQ = useQuery<{ completions: CompletionRow[] }>({
    queryKey: ["/api/practice-completion"],
    queryFn: () => apiRequest("GET", "/api/practice-completion"),
    enabled: !!user,
    staleTime: 15_000,
  });
  const officeQ = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean }> }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    enabled: !!user,
    staleTime: 30_000,
  });

  const selections = wolQ.data?.selections ?? {};
  const rows = useMemo(() => compQ.data?.completions ?? [], [compQ.data]);

  const today = ymd(new Date());
  const thisWeekStart = ymd(sundayStart(new Date()));

  // Did the user pray the office today? (Learn & Pray derives "done" from this.)
  const officePrayedToday = useMemo(() => {
    const days = officeQ.data?.days ?? [];
    const last = days[days.length - 1];
    return !!last && last.ymd === today && (last.morning || last.evening);
  }, [officeQ.data, today]);

  // Set membership helpers over the completion rows.
  const has = (section: string, localDate: string) =>
    rows.some((r) => r.section === section && r.localDate === localDate);

  const mark = useMutation({
    mutationFn: (v: { section: SectionKey; localDate: string; weekStart: string }) =>
      apiRequest("POST", "/api/practice-completion", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/practice-completion"] }),
  });
  const unmark = useMutation({
    mutationFn: (v: { section: SectionKey; localDate: string }) =>
      apiRequest("DELETE", "/api/practice-completion", v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/practice-completion"] }),
  });

  // Reconcile: if the office was prayed today but Learn & Pray isn't logged
  // yet, log it once — so the user never double-logs and consistency accrues.
  useEffect(() => {
    if (!user || compQ.isLoading || officeQ.isLoading) return;
    if (officePrayedToday && !has("learn_pray", today)) {
      mark.mutate({ section: "learn_pray", localDate: today, weekStart: thisWeekStart });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officePrayedToday, compQ.isLoading, officeQ.isLoading, user]);

  // For each section: done?, the localDate the toggle acts on, and weeks-kept.
  function sectionState(def: SectionDef) {
    const periodDate = def.daily ? today : thisWeekStart; // the row key for "this period"
    let done = has(def.key, periodDate);
    if (def.key === "learn_pray" && officePrayedToday) done = true;

    // weeks kept — current run of consecutive kept weeks (gracious: an
    // in-progress, not-yet-kept current week doesn't break the run).
    const keptWeek = (weekStartYmd: string): boolean => {
      if (def.daily) {
        const n = rows.filter((r) => r.section === def.key && r.weekStart === weekStartYmd).length;
        return n >= DAILY_KEPT_THRESHOLD;
      }
      return rows.some((r) => r.section === def.key && r.localDate === weekStartYmd);
    };
    let run = 0;
    const startD = keptWeek(thisWeekStart) ? sundayStart(new Date()) : addWeeks(sundayStart(new Date()), -1);
    for (let i = 0; i < 60; i++) {
      if (keptWeek(ymd(addWeeks(startD, -i)))) run++;
      else break;
    }
    return { done, periodDate, weeksKept: run };
  }

  const toggle = (def: SectionDef, done: boolean, periodDate: string) => {
    if (done) {
      // Learn & Pray "done" can come from the office; only the manual row is removable.
      if (def.key === "learn_pray" && officePrayedToday) return;
      unmark.mutate({ section: def.key, localDate: periodDate });
    } else {
      mark.mutate({ section: def.key, localDate: periodDate, weekStart: thisWeekStart });
    }
  };

  if (authLoading || !user || (!betaLoading && !rawIsBeta)) return null;

  const loading = wolQ.isLoading || compQ.isLoading || officeQ.isLoading;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <Layout>
      <div style={{ position: "relative", minHeight: "70vh" }}>
        {/* subtle (not pronounced): this page renders inside Layout's
            opacity 0→1 mount fade, so a high-alpha gradient would visibly
            "flash" in. The component's own guidance is subtle for home. */}
        <AnimatedBackground base={BG} variant="subtle" fadeTop />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", width: "100%", padding: "4px 2px 28px" }}>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, fontFamily: FONT, margin: "4px 0 2px" }}>
            {t("home_beta.eyebrow", { defaultValue: "Your Way of Love" })}
          </p>
          <h1 style={{ color: WARM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: "0 0 16px" }}>{dateLabel}</h1>

          {loading ? (
            <p style={{ color: SAGE_DIM, fontSize: 14, fontFamily: FONT }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {SECTIONS.map((def) => {
                const { done, periodDate, weeksKept } = sectionState(def);
                const lines = commitmentLines(def, selections);
                const hasCommitment = lines.length > 0;
                const prominent = def.key === "turn"; // Turn leads — show consistency most
                return (
                  <div key={def.key} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px" }}>
                      {/* Completion circle — toggles done */}
                      <button
                        type="button"
                        aria-label={done ? "Mark not done" : "Mark done"}
                        onClick={() => toggle(def, done, periodDate)}
                        style={{
                          flexShrink: 0, marginTop: 2, width: 26, height: 26, borderRadius: 999, cursor: "pointer",
                          background: done ? DONE_BG : "transparent",
                          border: `2px solid ${done ? DONE_B : "rgba(143,175,150,0.4)"}`,
                          color: WARM, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontSize: 14, lineHeight: 1,
                        }}
                      >
                        {done ? "✓" : ""}
                      </button>

                      {/* Body — taps into the section page */}
                      <button
                        type="button"
                        onClick={() => setLocation(`/home-beta/${def.key}`)}
                        style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{def.emoji}</span>
                          <span style={{ color: WARM, fontSize: 16, fontWeight: 700, fontFamily: FONT }}>
                            {t(`home_beta.section.${def.key}`, { defaultValue: def.title })}
                          </span>
                          <span style={{ marginLeft: "auto", color: SAGE_DIM, fontSize: 16 }}>›</span>
                        </div>
                        <p style={{ color: SAGE, fontSize: 12.5, fontFamily: FONT, margin: "4px 0 0", lineHeight: 1.4 }}>{def.definition}</p>

                        {hasCommitment ? (
                          <p style={{ color: WARM, fontSize: 13.5, fontFamily: FONT, margin: "9px 0 0", lineHeight: 1.45 }}>
                            {lines.join(" · ")}
                          </p>
                        ) : (
                          <span
                            onClick={(e) => { e.stopPropagation(); setLocation("/rule-of-life"); }}
                            style={{ display: "inline-block", color: "rgba(168,197,160,0.95)", fontSize: 13, fontFamily: FONT, margin: "9px 0 0", textDecoration: "underline" }}
                          >
                            {t("home_beta.set_practice", { defaultValue: "Set your {{title}} practice →", title: def.title })}
                          </span>
                        )}

                        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "9px 0 0" }}>
                          <span style={{ color: done ? SAGE : SAGE_DIM, fontSize: 11.5, fontFamily: FONT }}>
                            {done
                              ? (def.daily ? t("home_beta.done_today", { defaultValue: "Done today" }) : t("home_beta.done_week", { defaultValue: "Done this week" }))
                              : (def.daily ? t("home_beta.not_today", { defaultValue: "Not yet today" }) : t("home_beta.not_week", { defaultValue: "Not yet this week" }))}
                          </span>
                          {weeksKept > 0 && (
                            <span style={{ color: SAGE_DIM, fontSize: 11.5, fontFamily: FONT, fontWeight: prominent ? 700 : 400 }}>
                              · {t("home_beta.weeks_kept", { defaultValue: "Kept for {{count}} weeks", count: weeksKept })}
                            </span>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
