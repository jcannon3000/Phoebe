/**
 * BETA home — organized by The Episcopal Church's Way of Love.
 *
 * A flagged, beta-only alternative to /dashboard (gated on rawIsBeta), living
 * ALONGSIDE the existing home. The Way of Love's daily/weekly order, but in the
 * production home's card LANGUAGE rather than six identical rows:
 *
 *   • Turn — a thin daily card.
 *   • Learn & Pray — an unboxed section header over the REUSED production
 *     office hero (PrayerOfficeCard), Contemplation, and CAC cards.
 *   • Worship & Gather — an unboxed section header over the REUSED service /
 *     gathering cards (Sunday worship, Wednesday meal, …) + an "I worshipped
 *     this week" affordance.
 *   • Bless / Go / Rest — full weekly cards with action chips.
 *
 * Reads, never rebuilds: commitments from /api/rule-of-life/wol, completion
 * from /api/practice-completion (+ Learn & Pray derived from the office
 * history so the user never double-logs prayer they already prayed). All the
 * grouped cards are IMPORTED from the production home, not re-implemented.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { PRACTICES, type PracticeId } from "@/lib/wayOfLove";
import { computeTurnConsistency, engagementDays } from "@/lib/turnConsistency";
import { hasReadCacToday, hasReadFddToday, hasReadSsjeToday } from "@/lib/cacReadState";
import { useHealthMindfulToday } from "@/lib/appleHealth";
// Reused production home cards + helpers (exported from dashboard, not rebuilt).
import {
  PrayerOfficeCard,
  ContemplationHomeCard,
  CacHomeCard,
  ServiceCard,
  ConsolidatedServiceCard,
  GatheringCard,
  ConsolidatedServiceDetailModal,
  SectionHeader,
  nextOccurrenceDate,
  computeNextGatheringDate,
  type ServiceSchedule,
} from "@/pages/dashboard";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const BG = "#091A10";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.26)";
const DONE_TINT = "rgba(46,107,64,0.22)"; // done card surface — a touch greener
const DONE_TINT_B = "rgba(168,197,160,0.45)";
const DONE_BG = "rgba(46,107,64,0.55)"; // filled completion check
const DONE_B = "rgba(168,197,160,0.8)";
const CHIP_BG = "rgba(46,107,64,0.20)";
const CHIP_B = "rgba(46,107,64,0.45)";

export type SectionKey = "turn" | "learn_pray" | "learn" | "pray" | "worship" | "bless" | "go" | "rest";

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
// weekly practices.
export const SECTIONS: SectionDef[] = [
  { key: "turn", practices: ["turn"], theme: "turn", daily: true, emoji: "🔄", title: "Begin", definition: "Pause, listen, and begin again in the way of Jesus." },
  { key: "learn_pray", practices: ["learn", "pray"], theme: "learn", daily: true, emoji: "📖", title: "Learn & Pray", definition: "Sit with Scripture and dwell with God each day." },
  // Learn and Pray also stand alone (their own detail pages, reached from the
  // Way of Love drawer); the combined learn_pray above still drives the home.
  { key: "learn", practices: ["learn"], theme: "learn", daily: true, emoji: "📖", title: "Learn", definition: "Reflect on Scripture and the life and teachings of Jesus." },
  { key: "pray", practices: ["pray"], theme: "pray", daily: true, emoji: "🙏", title: "Pray", definition: "Dwell intentionally with God in prayer each day." },
  { key: "worship", practices: ["worship"], theme: "worship", daily: false, emoji: "⛪", title: "Connect", definition: "Worship together, and show up for your community's gatherings and events." },
  { key: "bless", practices: ["bless"], theme: "bless", daily: false, emoji: "🤲", title: "Serve", definition: "Give and serve generously, and share your faith." },
  { key: "go", practices: ["go"], theme: "go", daily: false, emoji: "🌍", title: "Bridge", definition: "Bridge what divides — cross boundaries, listen, and love like Jesus." },
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
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

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

// ── Worship & Gather items — same consolidation the production feed uses,
// scoped to just this section: services grouped by day-of-week, gatherings by
// their next meetup, future-only, soonest first. Reuses the exported pure
// date helpers so the cards land on the same dates as the real home.
type WorshipItem =
  | { kind: "service"; schedule: ServiceSchedule; nextDate: Date; isOnDate: boolean }
  | { kind: "services"; schedules: ServiceSchedule[]; nextDate: Date; isOnDate: boolean }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ritual shape mirrors dashboard's `any[]` rituals
  | { kind: "gathering"; r: any; nextDate: Date; isOnDate: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors dashboard's rituals typing
function buildWorshipItems(schedules: ServiceSchedule[], rituals: any[]): WorshipItem[] {
  const todayMs = startOfDay(new Date()).getTime();
  const items: WorshipItem[] = [];

  const byDow = new Map<number, ServiceSchedule[]>();
  for (const s of schedules) {
    if (!s.times?.length) continue;
    const arr = byDow.get(s.dayOfWeek) ?? [];
    arr.push(s);
    byDow.set(s.dayOfWeek, arr);
  }
  for (const [dow, list] of byDow.entries()) {
    const nextDate = nextOccurrenceDate(dow);
    const isOnDate = nextDate.getTime() === todayMs;
    items.push(list.length === 1
      ? { kind: "service", schedule: list[0]!, nextDate, isOnDate }
      : { kind: "services", schedules: list, nextDate, isOnDate });
  }

  for (const r of rituals) {
    const next = computeNextGatheringDate(r);
    if (!next) continue;
    const d = startOfDay(next);
    if (d.getTime() < todayMs) continue; // past
    items.push({ kind: "gathering", r, nextDate: next, isOnDate: d.getTime() === todayMs });
  }

  items.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
  return items.slice(0, 4);
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
  // Worship & Gather sources — same endpoints the production home reads.
  const svcQ = useQuery<{ schedules: ServiceSchedule[] }>({
    queryKey: ["/api/me/service-schedules"],
    queryFn: () => apiRequest("GET", "/api/me/service-schedules"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  const ritualsQ = useQuery<any[]>({
    queryKey: ["/api/rituals", user?.id],
    queryFn: () => apiRequest("GET", `/api/rituals?ownerId=${user!.id}`),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  // Bless chip count — active prayer requests on the viewer's list.
  const prayerQ = useQuery<unknown>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user,
    staleTime: 60_000,
  });
  // Contemplation today (seconds sat) — a daily Learn & Pray signal.
  const contemplationQ = useQuery<{ todaySeconds?: number }>({
    queryKey: ["/api/me/contemplation-stats", ymd(new Date())],
    queryFn: () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return apiRequest("GET", `/api/me/contemplation-stats?todaySince=${encodeURIComponent(since.toISOString())}&tz=${encodeURIComponent(tz)}`);
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const selections = wolQ.data?.selections ?? {};
  const rows = useMemo(() => compQ.data?.completions ?? [], [compQ.data]);

  const worshipItems = useMemo(
    () => buildWorshipItems(svcQ.data?.schedules ?? [], ritualsQ.data ?? []),
    [svcQ.data, ritualsQ.data],
  );
  const prayerListCount = useMemo(() => {
    const d = prayerQ.data as unknown;
    if (Array.isArray(d)) return d.length;
    if (d && typeof d === "object" && Array.isArray((d as { requests?: unknown[] }).requests)) {
      return (d as { requests: unknown[] }).requests.length;
    }
    return 0;
  }, [prayerQ.data]);

  // Service-card tap → the same detail modal the production home opens.
  const [openSvc, setOpenSvc] = useState<{ schedules: ServiceSchedule[]; nextDate: Date } | null>(null);

  const today = ymd(new Date());
  const thisWeekStart = ymd(sundayStart(new Date()));

  // Did the user pray the office today? (Learn & Pray derives "done" from this.)
  const officePrayedToday = useMemo(() => {
    const days = officeQ.data?.days ?? [];
    const last = days[days.length - 1];
    return !!last && last.ymd === today && (last.morning || last.evening);
  }, [officeQ.data, today]);

  // Any daily Learn & Pray practice done today via its app signal — the office,
  // a reflection read (CAC/FDD/SSJE), or a contemplation sit. All complete
  // Learn & Pray (and so credit Turn). Single source of truth: the option's
  // completionSignal, surfaced here.
  const reflectionReadToday = hasReadCacToday() || hasReadFddToday() || hasReadSsjeToday();
  const contemplationDoneToday = (contemplationQ.data?.todaySeconds ?? 0) > 0;
  // iOS + Health connected: meditation logged in other apps (Insight Timer,
  // Calm, Apple Mindfulness) counts as a Pray sit too — matches home-beta-section.
  const healthMindfulToday = useHealthMindfulToday();
  const dailyPrayerEngaged = officePrayedToday || reflectionReadToday || contemplationDoneToday || healthMindfulToday;

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
    if (dailyPrayerEngaged && !has("learn_pray", today)) {
      mark.mutate({ section: "learn_pray", localDate: today, weekStart: thisWeekStart });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyPrayerEngaged, compQ.isLoading, officeQ.isLoading, user]);

  // For each section: done?, the localDate the toggle acts on, and weeks-kept.
  function sectionState(def: SectionDef) {
    const periodDate = def.daily ? today : thisWeekStart;
    let done = has(def.key, periodDate);
    if (def.key === "learn_pray" && dailyPrayerEngaged) done = true;

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
      if (def.key === "learn_pray" && dailyPrayerEngaged) return; // office-derived; not manually removable
      unmark.mutate({ section: def.key, localDate: periodDate });
    } else {
      mark.mutate({ section: def.key, localDate: periodDate, weekStart: thisWeekStart });
    }
  };

  if (authLoading || !user || (!betaLoading && !rawIsBeta)) return null;

  const loading = wolQ.isLoading || compQ.isLoading || officeQ.isLoading;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  // ── Small shared pieces (anchored left, production language) ──────────────

  const checkCircle = (done: boolean, onClick: () => void, size = 26) => (
    <button
      type="button"
      aria-label={done ? "Mark not done" : "Mark done"}
      onClick={onClick}
      style={{
        flexShrink: 0, width: size, height: size, borderRadius: 999, cursor: "pointer", padding: 0,
        background: done ? DONE_BG : "transparent",
        border: `2px solid ${done ? DONE_B : "rgba(143,175,150,0.4)"}`,
        color: WARM, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.55, lineHeight: 1,
      }}
    >
      {done ? "✓" : ""}
    </button>
  );

  const tag = (label: string) => (
    <span style={{ color: SAGE_DIM, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT, border: `1px solid ${CARD_B}`, borderRadius: 999, padding: "2px 7px" }}>
      {label}
    </span>
  );

  const statusLine = (def: SectionDef, done: boolean, weeksKept: number) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ color: done ? SAGE : SAGE_DIM, fontSize: 11.5, fontFamily: FONT }}>
        {done
          ? (def.daily ? t("home_beta.done_today", { defaultValue: "Done today" }) : t("home_beta.done_week", { defaultValue: "Done this week" }))
          : (def.daily ? t("home_beta.not_today", { defaultValue: "Not yet today" }) : t("home_beta.not_week", { defaultValue: "Not yet this week" }))}
      </span>
      {weeksKept > 0 && (
        <span style={{ color: SAGE_DIM, fontSize: 11.5, fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span aria-hidden style={{ fontSize: 11 }}>🌱</span>
          {t("home_beta.weeks_kept", { defaultValue: "Kept for {{count}} weeks", count: weeksKept })}
        </span>
      )}
    </div>
  );

  const commitmentOrSet = (def: SectionDef, lines: string[]) =>
    lines.length > 0 ? (
      <p style={{ color: WARM, fontSize: 13.5, fontFamily: FONT, margin: 0, lineHeight: 1.45 }}>{lines.join(" · ")}</p>
    ) : (
      <button
        type="button"
        onClick={() => setLocation("/rule-of-life")}
        style={{ background: "none", border: "none", padding: 0, color: "rgba(168,197,160,0.95)", fontSize: 13, fontFamily: FONT, textDecoration: "underline", cursor: "pointer", textAlign: "left" }}
      >
        {t("home_beta.set_practice", { defaultValue: "Set your {{title}} practice →", title: def.title })}
      </button>
    );

  const chip = (label: string, onClick: () => void, filled = false) => (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: filled ? CHIP_BG : "transparent", border: `1px solid ${CHIP_B}`, color: filled ? WARM : SAGE,
        borderRadius: 999, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );

  // A full weekly boxed card (Bless / Go / Rest) with action chips beneath.
  const boxedCard = (def: SectionDef, chips: React.ReactNode) => {
    const { done, periodDate, weeksKept } = sectionState(def);
    const lines = commitmentLines(def, selections);
    return (
      <div key={def.key} style={{ background: done ? DONE_TINT : CARD, border: `1px solid ${done ? DONE_TINT_B : CARD_B}`, borderRadius: 18, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {checkCircle(done, () => toggle(def, done, periodDate))}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                onClick={() => setLocation(`/home-beta/${def.key}`)}
                className="transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", minWidth: 0 }}
              >
                <span style={{ fontSize: 18 }}>{def.emoji}</span>
                <span style={{ color: WARM, fontSize: 16, fontWeight: 700, fontFamily: FONT }}>{def.title}</span>
                <span aria-hidden style={{ color: "rgba(143,175,150,0.7)", fontSize: 16, lineHeight: 1 }}>›</span>
              </button>
              {tag(t("home_beta.weekly", { defaultValue: "weekly" }))}
            </div>
            {commitmentOrSet(def, lines)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{chips}</div>
            {statusLine(def, done, weeksKept)}
          </div>
        </div>
      </div>
    );
  };

  // Right-aligned completion status for a section divider header. The
  // "today" vs "this week" phrasing carries the daily/weekly distinction, so
  // there's no separate pill; the check rides with the status.
  const headerStatus = (def: SectionDef) => {
    const { done } = sectionState(def);
    const label = done
      ? (def.daily ? t("home_beta.done_today", { defaultValue: "Done today" }) : t("home_beta.done_week", { defaultValue: "Done this week" }))
      : (def.daily ? t("home_beta.not_today", { defaultValue: "Not yet today" }) : t("home_beta.not_week", { defaultValue: "Not yet this week" }));
    return (
      <span style={{ color: done ? SAGE : SAGE_DIM, fontSize: 12, fontFamily: FONT, whiteSpace: "nowrap", flexShrink: 0 }}>
        {label}{done ? " ✓" : ""}
      </span>
    );
  };

  const turnDef = SECTIONS.find((s) => s.key === "turn")!;
  const learnPrayDef = SECTIONS.find((s) => s.key === "learn_pray")!;
  const worshipDef = SECTIONS.find((s) => s.key === "worship")!;
  const blessDef = SECTIONS.find((s) => s.key === "bless")!;
  const goDef = SECTIONS.find((s) => s.key === "go")!;
  const restDef = SECTIONS.find((s) => s.key === "rest")!;

  // ── Begin — the consistency crown (auto-filled; never "set" or ticked) ──
  // Begin (id "turn") is the daily turning-back-to-God — "always we begin
  // again" — kept by DOING any practice. It reads engagement from the same
  // data the sections already fetch — no separate tracking, no toggle.
  // Plain computation (NOT a hook) — this runs after the early return above, so
  // a useMemo here would violate the rules of hooks. engagementDays is cheap.
  const turnEngaged = engagementDays(rows.map((r) => r.localDate), officeQ.data?.days ?? []);
  const turn = computeTurnConsistency(turnEngaged);
  // Begin — the daily beginning-again. Same thin-row format as the Contemplation
  // card, with a fire streak (current run of days space was made) on the right.
  const turnCrown = (
    <button
      type="button"
      onClick={() => setLocation("/home-beta/turn")}
      className="relative flex rounded-xl overflow-hidden cursor-pointer w-full"
      style={{ background: CARD, border: `1px solid ${CARD_B}`, textAlign: "left" }}
    >
      <div className="flex-1 px-4 py-[14px] flex items-center justify-between gap-3">
        <p className="font-semibold min-w-0 truncate" style={{ color: WARM, fontFamily: FONT, margin: 0, lineHeight: 1.2, fontSize: 16 }}>
          {t("home_beta.section.turn", { defaultValue: "Begin" })} {turnDef.emoji}
        </p>
        <div
          className="rounded-full text-center shrink-0"
          style={{ background: CHIP_BG, color: WARM, fontFamily: FONT, fontSize: 13, fontWeight: 600, padding: "6px 14px", border: `1px solid ${CHIP_B}`, whiteSpace: "nowrap" }}
        >
          <span aria-hidden>🔥</span> {turn.currentRunDays}
        </div>
      </div>
    </button>
  );

  return (
    <Layout>
      {/* Match the production home's content width exactly (same .dash-shell
          rule: full-width on mobile, capped + centered at 56rem on desktop). */}
      <style>{`
        @media (min-width: 768px) {
          .dash-shell {
            max-width: 56rem;
            margin-left: auto;
            margin-right: auto;
          }
        }
      `}</style>
      <div style={{ position: "relative", minHeight: "70vh" }}>
        {/* No fadeTop: inside <Layout> the opaque sticky header frames the top,
            so a fade here would blank the content's top band (the "off" look). */}
        <AnimatedBackground base={BG} variant="subtle" />
        <div className="dash-shell" style={{ position: "relative", zIndex: 1, width: "100%", padding: "4px 2px 28px" }}>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, fontFamily: FONT, margin: "4px 0 2px" }}>
            {t("home_beta.eyebrow", { defaultValue: "Your Way of Love" })}
          </p>
          <h1 style={{ color: WARM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: "0 0 18px" }}>{dateLabel}</h1>

          {loading ? (
            <p style={{ color: SAGE_DIM, fontSize: 14, fontFamily: FONT }}>{t("common.loading", { defaultValue: "Loading…" })}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {/* 1 — TURN (consistency crown — auto, frames the rest) */}
              {turnCrown}

              {/* 2 — LEARN & PRAY (header + reused production cards) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <SectionHeader label={learnPrayDef.title} right={headerStatus(learnPrayDef)} onOpen={() => setLocation("/home-beta/learn_pray")} />
                <PrayerOfficeCard />
                <ContemplationHomeCard />
                <CacHomeCard />
              </div>

              {/* 3 — WORSHIP & GATHER (header + reused service/gathering cards) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <SectionHeader label={worshipDef.title} right={headerStatus(worshipDef)} onOpen={() => setLocation("/home-beta/worship")} />
                {worshipItems.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setLocation("/communities")}
                    style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 18, padding: "14px 16px", color: SAGE, fontSize: 13.5, fontFamily: FONT, textAlign: "left", cursor: "pointer" }}
                  >
                    {t("home_beta.worship_empty", { defaultValue: "Find a community to worship with →" })}
                  </button>
                ) : (
                  worshipItems.map((item, i) => {
                    if (item.kind === "service") {
                      return (
                        <ServiceCard
                          key={`wol-svc-${item.schedule.id}`}
                          schedule={item.schedule}
                          nextDate={item.nextDate}
                          isOnDate={item.isOnDate}
                          keyPrefix="wol-worship"
                          onOpen={() => setOpenSvc({ schedules: [item.schedule], nextDate: item.nextDate })}
                        />
                      );
                    }
                    if (item.kind === "services") {
                      return (
                        <ConsolidatedServiceCard
                          key={`wol-svcs-${item.schedules.map((s) => s.id).join("-")}`}
                          schedules={item.schedules}
                          nextDate={item.nextDate}
                          isOnDate={item.isOnDate}
                          keyPrefix="wol-worship"
                          onOpen={() => setOpenSvc({ schedules: item.schedules, nextDate: item.nextDate })}
                        />
                      );
                    }
                    return (
                      <GatheringCard
                        key={`wol-gathering-${item.r.id ?? i}`}
                        r={item.r}
                        keyPrefix="wol-worship"
                        onOpen={() => setLocation(`/gatherings/${item.r.id}`)}
                      />
                    );
                  })
                )}
                {/* Gentle weekly-complete affordance */}
                {(() => {
                  const { done, periodDate } = sectionState(worshipDef);
                  return (
                    <button
                      type="button"
                      onClick={() => toggle(worshipDef, done, periodDate)}
                      style={{ alignSelf: "flex-start", background: done ? CHIP_BG : "transparent", border: `1px solid ${CHIP_B}`, color: done ? WARM : SAGE, borderRadius: 999, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer", marginTop: 2 }}
                    >
                      {done
                        ? t("home_beta.worshipped_done", { defaultValue: "✓ Worshipped this week" })
                        : t("home_beta.worshipped_mark", { defaultValue: "I worshipped this week" })}
                    </button>
                  );
                })()}
              </div>

              {/* 4 — BLESS (weekly card + chips) */}
              {boxedCard(blessDef, (
                <>
                  {chip(
                    prayerListCount > 0
                      ? t("home_beta.bless_pray_n", { defaultValue: "Pray for {{count}} on your list →", count: prayerListCount })
                      : t("home_beta.bless_pray", { defaultValue: "Pray for your list →" }),
                    () => setLocation("/prayer-list"),
                  )}
                  {chip(t("home_beta.mark_done", { defaultValue: "Mark done" }), () => {
                    const { done, periodDate } = sectionState(blessDef);
                    toggle(blessDef, done, periodDate);
                  }, true)}
                </>
              ))}

              {/* 5 — GO (weekly card + justice-feed chips) */}
              {boxedCard(goDef, (
                <>
                  {chip(t("home_beta.go_creation", { defaultValue: "Creation Care →" }), () => setLocation("/prayer-feeds/phoebe-climate"))}
                  {chip(t("home_beta.go_justice", { defaultValue: "Racial Justice →" }), () => setLocation("/prayer-feeds"))}
                </>
              ))}

              {/* 6 — REST (weekly card + carve-out chip) */}
              {boxedCard(restDef, (
                <>
                  {chip(t("home_beta.rest_carve", { defaultValue: "Carve out a time →" }), () => setLocation("/bcp/daily-office/settings?side=evening"))}
                </>
              ))}

              {/* Footer */}
              <button
                type="button"
                onClick={() => setLocation("/rule-of-life")}
                style={{ alignSelf: "center", background: "none", border: "none", color: SAGE_DIM, fontSize: 12.5, fontFamily: FONT, textDecoration: "underline", cursor: "pointer", marginTop: 4 }}
              >
                {t("home_beta.customize", { defaultValue: "Shape your rhythm" })}
              </button>
            </div>
          )}
        </div>

        {openSvc && (
          <ConsolidatedServiceDetailModal
            schedules={openSvc.schedules}
            nextDate={openSvc.nextDate}
            onClose={() => setOpenSvc(null)}
          />
        )}
      </div>
    </Layout>
  );
}
