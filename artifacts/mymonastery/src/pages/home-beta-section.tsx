/**
 * BETA home — a single Way of Love section page (/home-beta/:section).
 *
 * The shared shell: header (title + definition), the user's rule-of-life
 * commitment(s), a "mark complete" action, the section's reused PRACTICES
 * (deep-links into the experiences that already exist — Examen, the Daily
 * Office, the prayer list, justice feeds, …), live inline previews where a
 * compact list helps (this week's services, who you're praying for, your
 * justice feeds), the Rest carve-out, and a Materials rail of practice-tagged
 * podcasts. Nothing here is rebuilt — every surface is the one the rest of
 * Phoebe already uses, reorganized under the practice it belongs to.
 *
 * Learn & Pray derives "done" from the office history (same as the home
 * cards) so the user never double-logs prayer they already prayed.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import {
  SECTIONS,
  commitmentLines,
  type SectionKey,
  type WolSelections,
  type CompletionRow,
} from "./home-beta";
import { computeTurnConsistency, engagementDays } from "@/lib/turnConsistency";
import BlessSubScreen from "@/components/BlessSubScreen";

const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SAGE_DIM = "rgba(143,175,150,0.55)";
const FONT = "'Space Grotesk', system-ui, sans-serif";
const CARD = "rgba(46,107,64,0.12)";
const CARD_B = "rgba(46,107,64,0.26)";
const CTA = "#2D5E3F";
const DONE_BG = "rgba(46,107,64,0.5)";
const DONE_B = "rgba(168,197,160,0.7)";

const DAY_NAMES_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const REST_DAY_KEY = "phoebe:rest-day";

function pad(n: number): string { return String(n).padStart(2, "0"); }
function ymd(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sundayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addWeeks(d: Date, n: number): Date { return addDays(d, n * 7); }
const DAILY_KEPT_THRESHOLD = 5; // ≥5 of 7 daily completions = a week kept (matches the home cards)
function fmtTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  let h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m[2]} ${ampm}`;
}

// The section's reused surfaces — each card just navigates into an experience
// that already exists. (Worship/Bless/Go also get a live inline preview above;
// Rest gets the carve-out picker.)
type ActionDef = { emoji: string; label: string; sub: string; route: string; tkey: string };
const ACTIONS: Record<SectionKey, ActionDef[]> = {
  turn: [
    { emoji: "🕯️", label: "Pray the Examen", sub: "A gentle review of your day", route: "/examen", tkey: "examen" },
  ],
  learn_pray: [
    { emoji: "📿", label: "Pray the Daily Office", sub: "Morning or Evening Prayer", route: "/prayer-chooser", tkey: "office" },
    { emoji: "📖", label: "Today's reflection", sub: "Forward Day by Day", route: "/reflect/fdd", tkey: "reflection" },
    { emoji: "🤍", label: "Sit in silence", sub: "Contemplative prayer", route: "/contemplation", tkey: "contemplation" },
  ],
  worship: [
    { emoji: "⛪", label: "Find a gathering", sub: "Services and communities", route: "/gatherings", tkey: "gatherings" },
  ],
  bless: [
    { emoji: "🙏", label: "Your prayer list", sub: "Pray for others", route: "/prayer-list", tkey: "prayer_list" },
    { emoji: "✍️", label: "Your prayer requests", sub: "Ask for prayer", route: "/my-prayer-requests", tkey: "my_requests" },
  ],
  go: [
    { emoji: "🌍", label: "Pray for the world", sub: "Justice & intercession feeds", route: "/prayer-feeds", tkey: "feeds" },
  ],
  rest: [
    { emoji: "🤍", label: "Sit in silence", sub: "Contemplative prayer", route: "/contemplation", tkey: "contemplation" },
  ],
};

// Traveling the Way of Love (The Episcopal Church, Season One) — one video per
// practice, embedded inline from Wistia (channel wkxcjht52w). The episodes are
// documentary visits to ministries, not per-practice explainers, so each is
// paired to the ministry that best embodies the practice:
//   • Pray: Pop Up Prayer — the one explicit match (Learn & Pray)
//   • St. Lydia's dinner church → Worship (gathering at the table)
//   • Thistle Farms → Bless (radical love + service to survivors)
//   • Bishop Walker School → Go (crossing boundaries to serve)
//   • Honoré Farm & Mill → Rest (land sabbath + restoration)
// Turn uses the series TRAILER — its "come along as we begin" invitation fits
// the turn-and-return practice better than any single ministry episode (the
// Presiding Bishop Curry overview read as a generic "learn" clip on Turn).
const SECTION_VIDEO: Record<SectionKey, { id: string; title: string }> = {
  turn: { id: "trfrpfx6q1", title: "Series trailer" },
  learn_pray: { id: "q4zzab2h1y", title: "Pray: Pop Up Prayer" },
  worship: { id: "pisvfusoig", title: "St. Lydia's, Brooklyn" },
  bless: { id: "2ckcg82pkz", title: "Thistle Farms, Nashville" },
  go: { id: "b1l0elf3jd", title: "Bishop Walker School" },
  rest: { id: "duye4nftap", title: "Honoré Farm & Mill" },
};

type ShowHit = { slug: string; title: string; artist: string; artwork: string | null };
type ServiceSchedule = {
  id: number; groupName: string; groupSlug: string | null; groupEmoji: string | null;
  name: string | null; location: string | null; dayOfWeek: number;
  times: Array<{ label: string; time: string; location?: string }>;
};
type PrayerForMine = { id: number; recipientName: string | null; expired: boolean };
type FeedHit = { id: number; slug: string; title: string; tagline?: string | null; coverEmoji?: string | null };

const eyebrow = { color: SAGE_DIM, fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em", fontWeight: 700, fontFamily: FONT };
const infoCard = { background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "12px 14px" };
const linkCard = { display: "flex", alignItems: "center", gap: 12, background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 12, padding: "12px 14px", cursor: "pointer", textAlign: "left" as const, width: "100%" };

export default function HomeBetaSectionPage() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/home-beta/:section");
  const { user, isLoading: authLoading } = useAuth();
  const { rawIsBeta, isLoading: betaLoading } = useBetaStatus();
  const { t } = useTranslation();
  const qc = useQueryClient();

  // Localized day names — full name drives the abbreviation + initial so one
  // set of keys covers the picker, the weekday strip, and the service line.
  const dayFull = (i: number) => t(`home_beta.dow.${i}`, { defaultValue: DAY_NAMES_EN[i] ?? "Sunday" });
  const dayAbbr = (i: number) => dayFull(i).slice(0, 3);
  const dayInitial = (i: number) => dayFull(i).slice(0, 1);

  const def = SECTIONS.find((s) => s.key === (params?.section as SectionKey));

  useEffect(() => {
    if (!authLoading && !user) { setLocation("/"); return; }
    if (!authLoading && !betaLoading && user && !rawIsBeta) { setLocation("/dashboard"); return; }
    if (!authLoading && user && !def) setLocation("/home-beta");
  }, [authLoading, betaLoading, user, rawIsBeta, def, setLocation]);

  const wolQ = useQuery<{ selections: WolSelections }>({
    queryKey: ["/api/rule-of-life/wol"],
    queryFn: () => apiRequest("GET", "/api/rule-of-life/wol"),
    enabled: !!user && !!def,
    staleTime: 60_000,
  });
  const compQ = useQuery<{ completions: CompletionRow[] }>({
    queryKey: ["/api/practice-completion"],
    queryFn: () => apiRequest("GET", "/api/practice-completion"),
    enabled: !!user && !!def,
    staleTime: 15_000,
  });
  const matsQ = useQuery<{ shows: ShowHit[] }>({
    queryKey: ["/api/podcasts/search", def?.theme],
    queryFn: () => apiRequest("GET", `/api/podcasts/search?theme=${encodeURIComponent(def!.theme)}`),
    enabled: !!user && !!def,
    staleTime: 30 * 60_000,
  });

  // Section-specific live previews — each only fires for its own section.
  const officeQ = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean }> }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    enabled: !!user && (def?.key === "learn_pray" || def?.key === "turn"),
    staleTime: 30_000,
  });
  const svcQ = useQuery<{ schedules: ServiceSchedule[] }>({
    queryKey: ["/api/me/service-schedules"],
    queryFn: () => apiRequest("GET", "/api/me/service-schedules"),
    enabled: !!user && def?.key === "worship",
    staleTime: 5 * 60_000,
  });
  const prayForQ = useQuery<PrayerForMine[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    enabled: !!user && def?.key === "bless",
    staleTime: 60_000,
  });
  const feedsQ = useQuery<{ feeds: FeedHit[] }>({
    queryKey: ["/api/prayer-feeds"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds"),
    enabled: !!user && def?.key === "go",
    staleTime: 5 * 60_000,
  });

  const rows = useMemo(() => compQ.data?.completions ?? [], [compQ.data]);
  const today = ymd(new Date());
  const thisWeekStart = ymd(sundayStart(new Date()));

  // Did the user pray the office today? Learn & Pray derives "done" from this.
  const officePrayedToday = useMemo(() => {
    const days = officeQ.data?.days ?? [];
    const last = days[days.length - 1];
    return !!last && last.ymd === today && (last.morning || last.evening);
  }, [officeQ.data, today]);

  // Rest carve-out — a device-local preference for v1 (no push scheduler yet).
  const [restDay, setRestDay] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem(REST_DAY_KEY);
      return v === null || v === "" ? null : Number(v);
    } catch { return null; }
  });
  const pickRestDay = (d: number) => {
    const next = restDay === d ? null : d;
    setRestDay(next);
    try {
      if (next === null) localStorage.removeItem(REST_DAY_KEY);
      else localStorage.setItem(REST_DAY_KEY, String(next));
    } catch { /* private mode — keep the in-memory choice */ }
  };

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

  // Reconcile Learn & Pray: if the office was prayed today but isn't logged
  // yet, log it once (idempotent server-side) — same as the home cards.
  useEffect(() => {
    if (!user || !def || def.key !== "learn_pray") return;
    if (compQ.isLoading || officeQ.isLoading) return;
    if (officePrayedToday && !rows.some((r) => r.section === "learn_pray" && r.localDate === today)) {
      mark.mutate({ section: "learn_pray", localDate: today, weekStart: thisWeekStart });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officePrayedToday, compQ.isLoading, officeQ.isLoading, user, def]);

  if (authLoading || !user || !def || (!betaLoading && !rawIsBeta)) return null;

  // Turn is the consistency spine — kept by engaging ANY practice that day, not
  // a thing you "set" or tick. Its history + counts read from engagement.
  const isTurn = def.key === "turn";
  const isBless = def.key === "bless"; // weekly intention cycle owns the body
  const turnEngaged = isTurn
    ? engagementDays(rows.map((r) => r.localDate), officeQ.data?.days ?? [])
    : null;
  const turnC = turnEngaged ? computeTurnConsistency(turnEngaged) : null;

  const periodDate = def.daily ? today : thisWeekStart;
  const lockedDone = def.key === "learn_pray" && officePrayedToday; // office-derived; not removable here
  const done = lockedDone || rows.some((r) => r.section === def.key && r.localDate === periodDate);
  const lines = commitmentLines(def, wolQ.data?.selections ?? {});
  const shows = matsQ.data?.shows ?? [];
  const actions = ACTIONS[def.key] ?? [];
  const sectionVideo = SECTION_VIDEO[def.key];

  const toggle = () => {
    if (lockedDone) return;
    if (done) unmark.mutate({ section: def.key, localDate: periodDate });
    else mark.mutate({ section: def.key, localDate: periodDate, weekStart: thisWeekStart });
  };

  // ── Live inline previews ───────────────────────────────────────────────
  const schedules = (svcQ.data?.schedules ?? []).slice(0, 3);
  const activePrayers = (prayForQ.data ?? []).filter((p) => !p.expired);
  const prayerNames = activePrayers.map((p) => p.recipientName).filter(Boolean).slice(0, 3) as string[];
  const feeds = (feedsQ.data?.feeds ?? []).slice(0, 3);

  // ── Consistency — quiet "weeks kept" + a small recent-history strip ─────
  const weekStartDate = sundayStart(new Date());
  const keptWeek = (weekStartYmd: string): boolean => {
    if (def.daily) {
      return rows.filter((r) => r.section === def.key && r.weekStart === weekStartYmd).length >= DAILY_KEPT_THRESHOLD;
    }
    return rows.some((r) => r.section === def.key && r.localDate === weekStartYmd);
  };
  let weeksKept = turnC ? turnC.weeksKept : 0;
  if (!turnC) {
    const startD = keptWeek(thisWeekStart) ? weekStartDate : addWeeks(weekStartDate, -1);
    for (let i = 0; i < 60; i++) {
      if (keptWeek(ymd(addWeeks(startD, -i)))) weeksKept++;
      else break;
    }
  }
  // Daily sections show this week's 7 days; weekly sections show the last 8 weeks.
  const dayCells = def.daily
    ? Array.from({ length: 7 }, (_, i) => {
        const cy = ymd(addDays(weekStartDate, i));
        const isToday = cy === today;
        let cellDone = turnEngaged ? turnEngaged.has(cy) : rows.some((r) => r.section === def.key && r.localDate === cy);
        if (def.key === "learn_pray" && isToday && officePrayedToday) cellDone = true;
        return { key: cy, label: dayInitial(i), done: cellDone, future: cy > today, isToday };
      })
    : [];
  const weekCells = def.daily
    ? []
    : Array.from({ length: 8 }, (_, i) => {
        const ws = ymd(addWeeks(weekStartDate, -(7 - i)));
        return { key: ws, kept: keptWeek(ws), isCurrent: i === 7 };
      });

  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: BG, color: WARM, fontFamily: FONT, display: "flex", flexDirection: "column" }}>
      <AnimatedBackground base={BG} variant="pronounced" fadeTop />
      <header style={{ position: "relative", zIndex: 1, padding: "max(1.1rem, calc(env(safe-area-inset-top) + 0.5rem)) 18px 6px" }}>
        <button type="button" onClick={() => setLocation("/home-beta")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: SAGE, fontFamily: FONT, fontSize: 13, cursor: "pointer", padding: 0 }}>
          <ChevronLeft size={16} /> {t("home_beta.back", { defaultValue: "Way of Love" })}
        </button>
      </header>

      <main style={{ position: "relative", zIndex: 1, flex: 1, width: "100%", maxWidth: 560, margin: "0 auto", padding: "8px 20px 36px", boxSizing: "border-box" }}>
        <div style={{ fontSize: 34 }}>{def.emoji}</div>
        <h1 style={{ color: WARM, fontSize: 26, fontWeight: 700, fontFamily: FONT, margin: "8px 0 4px" }}>
          {t(`home_beta.section.${def.key}`, { defaultValue: def.title })}
        </h1>
        <p style={{ color: SAGE, fontSize: 14.5, fontFamily: FONT, lineHeight: 1.5, margin: 0 }}>{def.definition}</p>

        {/* Watch — the practice's episode from "Traveling the Way of Love",
            embedded inline from Wistia. */}
        {sectionVideo && (
          <div style={{ marginTop: 20 }}>
            <p style={{ ...eyebrow, margin: "0 0 8px" }}>
              {t("home_beta.watch", { defaultValue: "Watch" })}
            </p>
            <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: 14, overflow: "hidden", border: `1px solid ${CARD_B}`, background: "#000" }}>
              <iframe
                src={`https://fast.wistia.net/embed/iframe/${sectionVideo.id}?seo=false&videoFoam=true`}
                title={sectionVideo.title}
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                allowFullScreen
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
              />
            </div>
            <p style={{ color: SAGE_DIM, fontSize: 12, fontFamily: FONT, margin: "8px 0 0" }}>
              {t("home_beta.watch_caption", { defaultValue: "Traveling the Way of Love" })} · {sectionVideo.title}
            </p>
          </div>
        )}

        {/* Bless — the weekly "bless your community" intention cycle owns the
            body (set → mark off → end-of-week review → set next week). */}
        {isBless && (
          <div style={{ marginTop: 22 }}>
            <BlessSubScreen weekStart={thisWeekStart} today={today} />
          </div>
        )}

        {/* Commitment + mark-complete — every section except Turn (the auto
            spine) and Bless (the intention cycle drives its own completion). */}
        {!isTurn && !isBless && (<>
        <p style={{ ...eyebrow, margin: "24px 0 8px" }}>
          {t("home_beta.your_commitment", { defaultValue: "Your commitment" })}
        </p>
        {lines.length > 0 ? (
          <div style={{ background: CARD, border: `1px solid ${CARD_B}`, borderRadius: 14, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
            {lines.map((l, i) => (
              <p key={i} style={{ color: WARM, fontSize: 14.5, fontFamily: FONT, margin: 0, lineHeight: 1.45 }}>{l}</p>
            ))}
          </div>
        ) : (
          <button type="button" onClick={() => setLocation("/rule-of-life")} style={{ background: CARD, border: `1px dashed ${CARD_B}`, borderRadius: 14, padding: "14px", color: "rgba(168,197,160,0.95)", fontFamily: FONT, fontSize: 14, cursor: "pointer", width: "100%", textAlign: "left" }}>
            {t("home_beta.set_practice", { defaultValue: "Set your {{title}} practice →", title: def.title })}
          </button>
        )}

        {/* Mark complete */}
        <button
          type="button"
          onClick={toggle}
          disabled={lockedDone}
          style={{
            marginTop: 16, width: "100%", padding: "13px 0", borderRadius: 14, fontFamily: FONT, fontSize: 15, fontWeight: 700,
            cursor: lockedDone ? "default" : "pointer",
            background: done ? "rgba(46,107,64,0.22)" : CTA,
            color: done ? SAGE : WARM,
            border: `1px solid ${done ? CARD_B : "rgba(168,197,160,0.4)"}`,
          }}
        >
          {lockedDone
            ? t("home_beta.prayed_today", { defaultValue: "✓ Prayed today" })
            : done
              ? (def.daily ? t("home_beta.done_today_tap", { defaultValue: "✓ Done today — tap to undo" }) : t("home_beta.done_week_tap", { defaultValue: "✓ Done this week — tap to undo" }))
              : (def.daily ? t("home_beta.mark_today", { defaultValue: "Mark done today" }) : t("home_beta.mark_week", { defaultValue: "I did this this week" }))}
        </button>
        </>)}

        {/* Consistency — quiet; no streak headline / fire / leaderboard */}
        <p style={{ ...eyebrow, margin: "28px 0 10px" }}>
          {t("home_beta.consistency", { defaultValue: "Your rhythm" })}
        </p>
        <div style={infoCard}>
          {turnC && (
            <p style={{ color: WARM, fontSize: 18, fontWeight: 700, fontFamily: FONT, margin: "0 0 8px", lineHeight: 1.25 }}>
              {turnC.madeSpaceCount > 0
                ? t("home_beta.turn_made_space", { defaultValue: "You've made space {{count}} times", count: turnC.madeSpaceCount })
                : t("home_beta.turn_begin", { defaultValue: "Make space for God today" })}
            </p>
          )}
          <p style={{ color: turnC ? SAGE : WARM, fontSize: 14.5, fontFamily: FONT, margin: 0 }}>
            {weeksKept > 0
              ? t("home_beta.weeks_kept", { defaultValue: "Kept for {{count}} weeks", count: weeksKept })
              : t("home_beta.building", { defaultValue: "Building your rhythm" })}
          </p>
          {def.daily ? (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              {dayCells.map((c) => (
                <div key={c.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flex: 1 }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 999,
                    background: c.done ? DONE_BG : "transparent",
                    border: `1.5px solid ${c.done ? DONE_B : c.future ? "rgba(143,175,150,0.18)" : "rgba(143,175,150,0.38)"}`,
                    boxShadow: c.isToday ? `0 0 0 2px ${BG}, 0 0 0 3px rgba(143,175,150,0.5)` : "none",
                  }} />
                  <span style={{ color: c.future ? "rgba(143,175,150,0.3)" : SAGE_DIM, fontSize: 10, fontFamily: FONT }}>{c.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12 }}>
              {weekCells.map((c) => (
                <div key={c.key} style={{
                  width: 14, height: 14, borderRadius: 999,
                  background: c.kept ? DONE_BG : "transparent",
                  border: `1.5px solid ${c.kept ? DONE_B : "rgba(143,175,150,0.32)"}`,
                  boxShadow: c.isCurrent ? `0 0 0 2px ${BG}, 0 0 0 3px rgba(143,175,150,0.5)` : "none",
                }} />
              ))}
              <span style={{ color: SAGE_DIM, fontSize: 10.5, fontFamily: FONT, marginLeft: 4 }}>
                {t("home_beta.last_8_weeks", { defaultValue: "last 8 weeks" })}
              </span>
            </div>
          )}
        </div>

        {/* Practices — the section's reused surfaces (+ live previews) */}
        <p style={{ ...eyebrow, margin: "28px 0 10px" }}>
          {t("home_beta.practices", { defaultValue: "Practices" })}
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Worship — this week's services */}
          {def.key === "worship" && schedules.map((s) => (
            <div key={s.id} style={infoCard}>
              <p style={{ ...eyebrow, fontSize: 10.5, margin: 0 }}>{s.groupEmoji ?? "⛪"} {s.groupName}</p>
              <p style={{ color: WARM, fontSize: 14.5, fontWeight: 600, fontFamily: FONT, margin: "4px 0 0" }}>
                {s.name || t("home_beta.services", { defaultValue: "Services" })}
              </p>
              <p style={{ color: SAGE, fontSize: 12.5, fontFamily: FONT, margin: "2px 0 0" }}>
                {dayFull(s.dayOfWeek)} · {s.times.map((tm) => fmtTime(tm.time)).join(", ")}
              </p>
              {s.location && <p style={{ color: SAGE_DIM, fontSize: 12, fontFamily: FONT, margin: "2px 0 0" }}>{s.location}</p>}
            </div>
          ))}

          {/* Bless — who you're praying for */}
          {def.key === "bless" && activePrayers.length > 0 && (
            <div style={infoCard}>
              <p style={{ color: WARM, fontSize: 14.5, fontWeight: 600, fontFamily: FONT, margin: 0 }}>
                {t("home_beta.bless_count", { defaultValue: "You're praying for {{count}} people", count: activePrayers.length })}
              </p>
              {prayerNames.length > 0 && (
                <p style={{ color: SAGE, fontSize: 12.5, fontFamily: FONT, margin: "3px 0 0" }}>
                  {prayerNames.join(", ")}{activePrayers.length > prayerNames.length ? "…" : ""}
                </p>
              )}
            </div>
          )}

          {/* Go — your justice & intercession feeds */}
          {def.key === "go" && feeds.map((f) => (
            <button key={f.slug} type="button" onClick={() => setLocation(`/prayer-feeds/${f.slug}`)} style={linkCard}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{f.coverEmoji ?? "🌍"}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: WARM, fontSize: 14.5, fontWeight: 600, fontFamily: FONT, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.title}</p>
                {f.tagline && <p style={{ color: SAGE_DIM, fontSize: 12, fontFamily: FONT, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.tagline}</p>}
              </div>
              <span style={{ marginLeft: "auto", color: SAGE_DIM, fontSize: 18, flexShrink: 0 }}>›</span>
            </button>
          ))}

          {/* Rest — carve out a sabbath day (device-local for now) */}
          {def.key === "rest" && (
            <div style={infoCard}>
              <p style={{ color: WARM, fontSize: 14.5, fontWeight: 600, fontFamily: FONT, margin: 0 }}>
                {t("home_beta.rest_carveout", { defaultValue: "Carve out a day to rest" })}
              </p>
              <p style={{ color: SAGE, fontSize: 12.5, fontFamily: FONT, margin: "4px 0 0", lineHeight: 1.45 }}>
                {t("home_beta.rest_carveout_sub", { defaultValue: "Choose a day each week to set down work and receive rest." })}
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                {DAY_NAMES_EN.map((_, i) => {
                  const sel = restDay === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => pickRestDay(i)}
                      style={{
                        flex: "1 0 auto", minWidth: 42, padding: "8px 0", borderRadius: 10, fontFamily: FONT, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                        border: `1px solid ${sel ? DONE_B : CARD_B}`,
                        background: sel ? DONE_BG : "transparent",
                        color: sel ? WARM : SAGE,
                      }}
                    >
                      {dayAbbr(i)}
                    </button>
                  );
                })}
              </div>
              {restDay !== null && (
                <p style={{ color: SAGE, fontSize: 12.5, fontFamily: FONT, margin: "12px 0 0" }}>
                  {t("home_beta.rest_chosen", { defaultValue: "Your sabbath: {{day}}", day: dayFull(restDay) })}
                </p>
              )}
            </div>
          )}

          {/* Entry points into the experiences themselves */}
          {actions.map((a) => (
            <button key={a.route} type="button" onClick={() => setLocation(a.route)} style={linkCard}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{a.emoji}</span>
              <div style={{ minWidth: 0 }}>
                <p style={{ color: WARM, fontSize: 14.5, fontWeight: 600, fontFamily: FONT, margin: 0 }}>
                  {t(`home_beta.action.${a.tkey}`, { defaultValue: a.label })}
                </p>
                <p style={{ color: SAGE_DIM, fontSize: 12, fontFamily: FONT, margin: "2px 0 0" }}>
                  {t(`home_beta.action.${a.tkey}_sub`, { defaultValue: a.sub })}
                </p>
              </div>
              <span style={{ marginLeft: "auto", color: SAGE_DIM, fontSize: 18, flexShrink: 0 }}>›</span>
            </button>
          ))}
        </div>

        {/* Materials */}
        {shows.length > 0 && (
          <>
            <p style={{ ...eyebrow, margin: "28px 0 10px" }}>
              {t("home_beta.materials", { defaultValue: "To go deeper" })}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {shows.slice(0, 6).map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => setLocation(`/podcasts/show/${s.slug}`)}
                  style={linkCard}
                >
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
          </>
        )}
      </main>
    </div>
  );
}
