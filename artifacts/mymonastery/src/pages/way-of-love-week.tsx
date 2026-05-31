/**
 * This Week — the weekly half of the Way of Love (beta).
 *
 * Split out from the all-in-one beta home: the DAILY practices (Turn streak,
 * the office / Contemplation / reflection = Learn & Pray) live on the main
 * production home; the four WEEKLY practices live here. This is where the week
 * is set and reviewed — Worship & gather (events + the gather intention),
 * Bless (the intention cycle), Go, and Rest — each with completion + a quiet
 * "weeks kept" line. The end-of-week review nudge points here.
 *
 * Nothing is rebuilt: the service/gathering cards, the Bless intention cycle,
 * and the completion model are the same ones the home already used — moved,
 * not duplicated. Marking any weekly practice credits Turn (the spine) for the
 * day it's done.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Check } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import {
  ServiceCard,
  ConsolidatedServiceCard,
  GatheringCard,
  ConsolidatedServiceDetailModal,
  nextOccurrenceDate,
  computeNextGatheringDate,
  type ServiceSchedule,
} from "@/pages/dashboard";
import BlessSubScreen from "@/components/BlessSubScreen";
import { PRACTICES } from "@/lib/wayOfLove";
import { SECTIONS, commitmentLines, type SectionKey, type WolSelections, type CompletionRow } from "./home-beta";

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const BG = "#091A10";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.26)";
const DONE_TINT = "rgba(46,107,64,0.22)";
const DONE_TINT_B = "rgba(168,197,160,0.45)";
const DONE_BG = "rgba(46,107,64,0.55)";
const DONE_B = "rgba(168,197,160,0.8)";
const CHIP_B = "rgba(46,107,64,0.45)";

const WEEKLY_KEYS: SectionKey[] = ["worship", "bless", "go", "rest"];

function pad(n: number): string { return String(n).padStart(2, "0"); }
function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfDay(d: Date): Date { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function sundayStart(d: Date): Date { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addWeeks(d: Date, n: number): Date { return addDays(d, n * 7); }

// Worship & Gather items — same consolidation the home used (services grouped
// by weekday + gatherings by next meetup, soonest first).
type WorshipItem =
  | { kind: "service"; schedule: ServiceSchedule; nextDate: Date; isOnDate: boolean }
  | { kind: "services"; schedules: ServiceSchedule[]; nextDate: Date; isOnDate: boolean }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mirrors dashboard's `any[]` rituals
  | { kind: "gathering"; r: any; nextDate: Date; isOnDate: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    if (d.getTime() < todayMs) continue;
    items.push({ kind: "gathering", r, nextDate: next, isOnDate: d.getTime() === todayMs });
  }
  items.sort((a, b) => a.nextDate.getTime() - b.nextDate.getTime());
  return items.slice(0, 4);
}

export default function WayOfLoveWeekPage() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const { t } = useTranslation();
  const qc = useQueryClient();

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
  const svcQ = useQuery<{ schedules: ServiceSchedule[] }>({
    queryKey: ["/api/me/service-schedules"],
    queryFn: () => apiRequest("GET", "/api/me/service-schedules"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ritualsQ = useQuery<any[]>({
    queryKey: ["/api/rituals", user?.id],
    queryFn: () => apiRequest("GET", `/api/rituals?ownerId=${user!.id}`),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
  // Materials — Bless-tagged podcasts (service / generosity), via the same
  // tagging the section sub-screens use.
  const matsQ = useQuery<{ shows: Array<{ slug: string; title: string; artist: string; artwork: string | null }> }>({
    queryKey: ["/api/podcasts/search", "bless"],
    queryFn: () => apiRequest("GET", "/api/podcasts/search?theme=bless"),
    enabled: !!user,
    staleTime: 30 * 60_000,
  });
  // Go signal — the viewer's OWN per-feed "prayed today" engagement, used to
  // auto-credit Go when their committed Creation Care / justice feed is prayed.
  const subscribedFeedsQ = useQuery<{ subscriptions: Array<{ slug: string; prayedToday: boolean }> }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    enabled: !!user,
    staleTime: 60_000,
  });

  const selections = wolQ.data?.selections ?? {};
  const rows = useMemo(() => compQ.data?.completions ?? [], [compQ.data]);
  const worshipItems = useMemo(
    () => buildWorshipItems(svcQ.data?.schedules ?? [], ritualsQ.data ?? []),
    [svcQ.data, ritualsQ.data],
  );

  const today = ymd(new Date());
  const thisWeekStart = ymd(sundayStart(new Date()));
  const [openSvc, setOpenSvc] = useState<{ schedules: ServiceSchedule[]; nextDate: Date } | null>(null);

  // Done this week = ANY row for this section in the current week (weekStart
  // match), so a weekly mark can land on the actual day (and so credit Turn
  // for that day) while still reading as "done this week."
  const doneThisWeek = (key: SectionKey) => rows.some((r) => r.section === key && r.weekStart === thisWeekStart);

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

  // Go auto-complete: if a committed Go feed (Creation Care / justice) was
  // prayed today, credit Go for the week (and so Turn) — the same "engagement
  // marks the section" pattern as the office reconcile. Today-scoped.
  const goFeedSlugs = (selections.go?.optionIds ?? [])
    .map((id) => PRACTICES.go.options.find((o) => o.id === id)?.feedSlug)
    .filter((s): s is string => !!s);
  const goFeedEngaged = (subscribedFeedsQ.data?.subscriptions ?? [])
    .some((f) => goFeedSlugs.includes(f.slug) && f.prayedToday);
  useEffect(() => {
    if (!user) return;
    if (goFeedEngaged && !doneThisWeek("go")) {
      mark.mutate({ section: "go", localDate: today, weekStart: thisWeekStart });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goFeedEngaged, user]);

  const toggle = (key: SectionKey) => {
    if (doneThisWeek(key)) {
      // Clear every row for this section this week.
      for (const r of rows.filter((x) => x.section === key && x.weekStart === thisWeekStart)) {
        unmark.mutate({ section: key, localDate: r.localDate });
      }
    } else {
      mark.mutate({ section: key, localDate: today, weekStart: thisWeekStart });
    }
  };

  // Weeks kept — consecutive weeks (back from this) with a completion.
  const weeksKept = (key: SectionKey): number => {
    let run = 0;
    const ws = sundayStart(new Date());
    for (let i = 0; i < 60; i++) {
      const w = ymd(addWeeks(ws, -i));
      const has = rows.some((r) => r.section === key && r.weekStart === w);
      if (has) run++;
      else if (i > 0) break;
    }
    return run;
  };

  if (authLoading || !user || (!betaLoading && !rawIsBeta)) return null;

  const def = (key: SectionKey) => SECTIONS.find((s) => s.key === key)!;
  const doneCount = WEEKLY_KEYS.filter((k) => doneThisWeek(k)).length;
  const weekEnd = addDays(sundayStart(new Date()), 6);
  const range = `${sundayStart(new Date()).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  // ── Shared atoms ──
  const checkCircle = (done: boolean, onClick: () => void) => (
    <button
      type="button"
      aria-label={done ? "Mark not done this week" : "Mark done this week"}
      onClick={onClick}
      style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 999, cursor: "pointer", padding: 0, background: done ? DONE_BG : "transparent", border: `2px solid ${done ? DONE_B : "rgba(143,175,150,0.4)"}`, color: WARM, display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      {done && <Check size={14} strokeWidth={2.5} />}
    </button>
  );
  const statusLine = (key: SectionKey) => {
    const done = doneThisWeek(key);
    const wk = weeksKept(key);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ color: done ? SAGE : SAGE_DIM, fontSize: 11.5, fontFamily: FONT }}>
          {done ? t("home_beta.done_week", { defaultValue: "Done this week" }) : t("home_beta.not_week", { defaultValue: "Not yet this week" })}
        </span>
        {wk > 0 && (
          <span style={{ color: SAGE_DIM, fontSize: 11.5, fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span aria-hidden style={{ fontSize: 11 }}>🌱</span>
            {t("home_beta.weeks_kept", { defaultValue: "Kept for {{count}} weeks", count: wk })}
          </span>
        )}
      </div>
    );
  };
  const commitmentOrSet = (key: SectionKey) => {
    const lines = commitmentLines(def(key), selections);
    return lines.length > 0 ? (
      <p style={{ color: WARM, fontSize: 13.5, fontFamily: FONT, margin: 0, lineHeight: 1.45 }}>{lines.join(" · ")}</p>
    ) : (
      <button type="button" onClick={() => setLocation("/rule-of-life")} style={{ background: "none", border: "none", padding: 0, color: "rgba(168,197,160,0.95)", fontSize: 13, fontFamily: FONT, textDecoration: "underline", cursor: "pointer", textAlign: "left" }}>
        {t("home_beta.set_practice", { defaultValue: "Set your {{title}} practice →", title: def(key).title })}
      </button>
    );
  };
  const chip = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ background: "transparent", border: `1px solid ${CHIP_B}`, color: SAGE, borderRadius: 999, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, fontFamily: FONT, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
  );

  const sectionHeaderRow = (key: SectionKey) => {
    const d = def(key);
    return (
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "2px 2px 0" }}>
        {checkCircle(doneThisWeek(key), () => toggle(key))}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 17 }}>{d.emoji}</span>
            <h2 style={{ color: WARM, fontSize: 17, fontWeight: 700, fontFamily: FONT, margin: 0 }}>
              {t(`home_beta.section.${key}`, { defaultValue: d.title })}
            </h2>
          </div>
          <p style={{ color: SAGE, fontSize: 12.5, fontFamily: FONT, margin: "4px 0 6px", lineHeight: 1.4 }}>{d.definition}</p>
          {statusLine(key)}
        </div>
      </div>
    );
  };

  const boxedCard = (key: SectionKey, chips: React.ReactNode) => {
    const done = doneThisWeek(key);
    const d = def(key);
    return (
      <div style={{ background: done ? DONE_TINT : CARD, border: `1px solid ${done ? DONE_TINT_B : CARD_B}`, borderRadius: 18, padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {checkCircle(done, () => toggle(key))}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{d.emoji}</span>
              <span style={{ color: WARM, fontSize: 16, fontWeight: 700, fontFamily: FONT }}>{t(`home_beta.section.${key}`, { defaultValue: d.title })}</span>
            </div>
            {commitmentOrSet(key)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{chips}</div>
            {statusLine(key)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div style={{ position: "relative", minHeight: "70vh" }}>
        <AnimatedBackground base={BG} variant="subtle" fadeTop />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 560, margin: "0 auto", width: "100%", padding: "4px 2px 28px" }}>
          <button type="button" onClick={() => setLocation("/dashboard")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: "4px 0 2px" }}>
            <ChevronLeft size={16} /> {t("common.home", { defaultValue: "Home" })}
          </button>
          <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, fontFamily: FONT, margin: "4px 0 2px" }}>
            {t("week.eyebrow", { defaultValue: "This week" })}
          </p>
          <h1 style={{ color: WARM, fontSize: 24, fontWeight: 700, fontFamily: FONT, margin: 0 }}>{range}</h1>
          <p style={{ color: SAGE, fontSize: 13.5, fontFamily: FONT, margin: "6px 0 18px" }}>
            {t("week.status", { defaultValue: "{{done}} of {{total}} practices this week", done: doneCount, total: WEEKLY_KEYS.length })}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Worship & gather */}
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {sectionHeaderRow("worship")}
              {worshipItems.length === 0 ? (
                <button type="button" onClick={() => setLocation("/communities")} style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 18, padding: "14px 16px", color: SAGE, fontSize: 13.5, fontFamily: FONT, textAlign: "left", cursor: "pointer" }}>
                  {t("home_beta.worship_empty", { defaultValue: "Find a community to worship with →" })}
                </button>
              ) : (
                worshipItems.map((item, i) => {
                  if (item.kind === "service") return <ServiceCard key={`svc-${item.schedule.id}`} schedule={item.schedule} nextDate={item.nextDate} isOnDate={item.isOnDate} keyPrefix="wol-week" onOpen={() => setOpenSvc({ schedules: [item.schedule], nextDate: item.nextDate })} />;
                  if (item.kind === "services") return <ConsolidatedServiceCard key={`svcs-${item.schedules.map((s) => s.id).join("-")}`} schedules={item.schedules} nextDate={item.nextDate} isOnDate={item.isOnDate} keyPrefix="wol-week" onOpen={() => setOpenSvc({ schedules: item.schedules, nextDate: item.nextDate })} />;
                  return <GatheringCard key={`gath-${item.r.id ?? i}`} r={item.r} keyPrefix="wol-week" onOpen={() => setLocation(`/gatherings/${item.r.id}`)} />;
                })
              )}
            </div>

            {/* Bless — the weekly intention cycle, inline */}
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {sectionHeaderRow("bless")}
              <BlessSubScreen weekStart={thisWeekStart} today={today} />
            </div>

            {/* Go */}
            {boxedCard("go", (
              <>
                {chip(t("home_beta.go_creation", { defaultValue: "Creation Care →" }), () => setLocation("/prayer-feeds/phoebe-climate"))}
                {chip(t("home_beta.go_justice", { defaultValue: "Racial Justice →" }), () => setLocation("/prayer-feeds"))}
              </>
            ))}

            {/* Rest */}
            {boxedCard("rest", (
              <>{chip(t("home_beta.rest_carve", { defaultValue: "Carve out a time →" }), () => setLocation("/bcp/daily-office/settings?side=evening"))}</>
            ))}
          </div>

          {/* Materials — practice-tagged resources to go deeper */}
          {(matsQ.data?.shows?.length ?? 0) > 0 && (
            <div style={{ marginTop: 26 }}>
              <p style={{ color: SAGE_DIM, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", fontWeight: 700, fontFamily: FONT, margin: "0 0 10px" }}>
                {t("home_beta.materials", { defaultValue: "To go deeper" })}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {matsQ.data!.shows.slice(0, 5).map((s) => (
                  <button key={s.slug} type="button" onClick={() => setLocation(`/podcasts/show/${s.slug}`)} style={{ display: "flex", alignItems: "center", gap: 12, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "10px 12px", cursor: "pointer", textAlign: "left", width: "100%" }}>
                    {s.artwork
                      ? <img src={s.artwork} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: 8, background: "rgba(46,107,64,0.3)", flexShrink: 0 }} />}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ color: WARM, fontSize: 14, fontWeight: 600, fontFamily: FONT, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</p>
                      <p style={{ color: SAGE_DIM, fontSize: 12, fontFamily: FONT, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.artist}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {openSvc && (
          <ConsolidatedServiceDetailModal schedules={openSvc.schedules} nextDate={openSvc.nextDate} onClose={() => setOpenSvc(null)} />
        )}
      </div>
    </Layout>
  );
}
