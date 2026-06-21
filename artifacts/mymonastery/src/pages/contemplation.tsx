import { useState, useEffect, useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";

const CONTEMPLATION_LEAF = LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null;
import { CobreatheGlobe } from "@/components/CobreatheGlobe";
import { apiRequest } from "@/lib/queryClient";
import { ContemplationTimer } from "@/components/ContemplationTimer";
import { getSideMinutes } from "@/lib/officePrefs";
import { openExternal } from "@/lib/openExternal";
import { primeAudio } from "@/lib/amenFeedback";
import { appleHealthAvailable, requestMindfulAuthorization, getMindfulMinutesToday, getMindfulSessionsToday, type MindfulSession } from "@/lib/appleHealth";

// Curated "Learn" resources — talks, videos, and guides on contemplative /
// centering prayer. Opened externally (SFSafariViewController on iOS via
// openExternal). To add a YouTube video or article, drop a new entry here:
//   { kind: "video" | "article", title, source, url }
// "video" rows get a ▶ glyph; "article" rows get a 📖. Order = display order.
type LearnResource = { kind: "video" | "article"; title: string; source: string; url: string };
const LEARN_RESOURCES: LearnResource[] = [
  {
    kind: "video",
    title: "Centering Prayer — talks & guided sits",
    source: "YouTube",
    url: "https://www.youtube.com/results?search_query=centering+prayer+thomas+keating",
  },
  {
    kind: "video",
    title: "Christian meditation — how to begin",
    source: "YouTube",
    url: "https://www.youtube.com/results?search_query=christian+meditation+john+main",
  },
  {
    kind: "article",
    title: "The Method of Centering Prayer",
    source: "Contemplative Outreach",
    url: "https://www.contemplativeoutreach.org",
  },
  {
    kind: "article",
    title: "Christian Meditation",
    source: "World Community for Christian Meditation",
    url: "https://wccm.org",
  },
  // (The CAC Daily Reflection that used to live here moved to the
  // drawer's Resources section — it's a daily reading resource and
  // belongs alongside BCP Prayers / Psalter / Saints, not buried
  // behind the Contemplation > Learn tab. /api/cac/today on the
  // server still resolves the permalink; the drawer row links to it.)
];

// Contemplation home — reachable from the side menu. Shows the viewer's
// time-in-silence stats and a button to begin a sit. The timer itself
// is the shared ContemplationTimer overlay (also launched from the
// prayer-mode pause slide).

const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const SPACE_GROTESK = "'Space Grotesk', system-ui, sans-serif";
// Remembers the last sit length chosen in the Begin dropdown so it
// defaults back to it on the next visit.
const LAST_MIN_KEY = "phoebe:contemplation-last-min";

type Stats = {
  todaySeconds: number; todayCount: number; todayDays: number;
  weekSeconds: number; weekCount: number; weekDays: number;
  totalSeconds: number; sessionCount: number; totalDays: number;
  // External Apple Health mindful minutes the server has stored for today
  // (uploaded by the iOS client). Prayer-only todaySeconds stays separate so
  // the Stats tiles don't double-count; "done" consumers add this on top.
  healthMinutesToday: number;
  // …and for the week + all-time, folded into the cumulative Stats tiles so
  // Insight Timer / Calm / Apple Mindfulness minutes count too.
  healthMinutesWeek: number;
  healthMinutesTotal: number;
};

// Someone in your garden whose contemplative prayer overlapped yours.
type Companion = { userId: number; name: string | null; avatarUrl: string | null };

// One logged session of prayer — drives the History cards.
type Session = {
  id: number;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number;
  // Where the sit came from — "cobreathe" tags a communal-breath sit so the
  // history can label it. null/absent = a plain silent sit.
  source?: string | null;
  // Garden members who were praying at the same moment as this session.
  companions?: Companion[];
};

// Two-letter fallback for a companion with no avatar.
function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "·";
}

// "Today" / "Yesterday" / "Fri, May 23" for a history card. Caller passes t
// so the today/yesterday strings localize without coupling this util to React.
function formatSessionDate(iso: string, t: (k: string) => string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000);
  if (diff === 0) return t("common.today");
  if (diff === 1) return t("common.yesterday");
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

// "7:14 AM" for a history card.
function formatSessionTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Whole-day difference from today (0 = today, 1 = yesterday, ≥2 = older).
function dayDiff(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return Infinity;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - that.getTime()) / 86400000);
}
// Stable per-local-day key for grouping older sessions.
function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// <input type="datetime-local"> wants LOCAL "YYYY-MM-DDTHH:mm".
function localDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Average time per day sat within a window (sum / distinct days);
// "—" when there are no days with a sit.
function avgPerDay(seconds: number, days: number): string {
  if (!days) return "—";
  return humanMinutes(Math.round(seconds / days));
}

// Always plain minutes — "75 min", "<1 min", "—" for zero. (Per product
// direction the contemplation times read in minutes, not h/m: 1h 15m → 75.)
function humanMinutes(seconds: number): string {
  if (!seconds || seconds < 60) return seconds > 0 ? "<1 min" : "—";
  const m = Math.round(seconds / 60);
  // Past ~1000 minutes the count reads better in hours — an all-time total of
  // "1,240 min" is clearer as "21 hr".
  if (m >= 1000) return `${Math.round(m / 60)} hr`;
  return `${m} min`;
}

function RowLabel({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-2"
      style={{ color: "rgba(143,175,150,0.5)", fontFamily: SPACE_GROTESK }}
    >
      {children}
    </p>
  );
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

// Apple Health (iOS native shell only) — read-only preview of today's Mindful
// Minutes from OTHER apps (Calm, Insight Timer, Apple Mindfulness all write to
// HealthKit). Hidden on web. This proves the read pipeline end-to-end; it does
// NOT yet feed the goal — wiring it in (with de-dup of Phoebe's own sits, and
// uploading to the server so the 7pm nudge sees it) is the deliberate next step.
// Daily goal card — set a minutes/day target and see today's progress toward
// it. Setting a goal (> 0) turns on a gentle ~7pm reminder ONLY on days it's
// still unmet (no nudge once the goal is reached). The target is a free field —
// the user types any number of minutes; there are no presets.
function DailyGoalCard({
  goalMinutes, todaySeconds, healthMinutesToday, onSet, saving,
}: {
  goalMinutes: number;
  todaySeconds: number;
  // Server's stored external Health minutes for today — the fallback used when
  // there's no live HealthKit read (web, or before the query resolves), so the
  // card reflects minutes synced from the user's phone.
  healthMinutesToday: number;
  onSet: (m: number) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const hasGoal = goalMinutes > 0;

  // iOS only: meditation logged in OTHER apps (Calm, Insight Timer, Apple
  // Mindfulness) lands in Apple Health as Mindful Minutes. We read today's
  // total — excludeOwn drops the sits Phoebe itself wrote back to Health, so
  // they're never double-counted — and fold it into the goal below. Access is
  // requested + synced automatically (no connect button); keyed by local day
  // so it refetches across midnight.
  const healthQ = useQuery<{ minutes: number; sessions: number } | null>({
    queryKey: ["apple-health-mindful-external", new Date().toLocaleDateString("en-CA")],
    queryFn: () => getMindfulMinutesToday(true),
    enabled: appleHealthAvailable(),
    staleTime: 5 * 60_000,
  });
  // The live HealthKit read (iOS only; 0/absent on web) — gates the connect
  // prompt. The upload to the server happens app-wide from the Layout shell
  // (useSyncHealthMinutes), so the goal card no longer uploads itself.
  const liveHealthMin = healthQ.data?.minutes ?? 0;
  // What we display/count: the larger of the live read and the server's
  // stored value. A live read of 0 is ambiguous — HealthKit hides read-grant
  // state, so "granted but no minutes" and "not granted on THIS device" both
  // read {minutes: 0} — and `0 ?? server` kept the 0, discarding minutes the
  // user's phone had already synced (this card said 0 while the dashboard
  // card, which always uses the server value, said 25). Math.max keeps the
  // two surfaces in agreement; the server value resets at the day boundary.
  const healthMin = Math.max(liveHealthMin, healthMinutesToday);

  // Today's progress = Phoebe's own logged time + meditation synced from Health.
  // todaySeconds is prayer-only (server keeps Health minutes in a separate
  // field), so adding healthMin here doesn't double-count.
  const doneMin = Math.floor(todaySeconds / 60) + healthMin;
  const pct = hasGoal ? Math.min(100, Math.round((doneMin / goalMinutes) * 100)) : 0;
  const met = hasGoal && doneMin >= goalMinutes;

  // Free-form minutes field (no presets). Kept in sync with the saved goal;
  // the user types any target and taps Set (or Enter).
  // Pre-fill 5 when no goal is set yet — the default Listen rhythm (a few
  // minutes of silence a day), ready to Set in one tap.
  const [draft, setDraft] = useState<string>(hasGoal ? String(goalMinutes) : "5");
  useEffect(() => { setDraft(hasGoal ? String(goalMinutes) : "5"); }, [goalMinutes, hasGoal]);
  // Cap matches the server clamp (users.ts: Math.min(180, …)); without this the
  // field accepts up to 600 only to have the server silently store 180.
  const parsed = Math.min(180, Math.max(0, Math.floor(Number(draft))));
  const canSet = !saving && Number.isFinite(parsed) && parsed > 0 && parsed !== goalMinutes;
  // When a goal is set, the card just shows it + an "Adjust" pill; tapping
  // Adjust reveals the editor (input + Set + Turn off). No goal yet → start in
  // the editor so they can set one.
  const [editing, setEditing] = useState(false);


  const showEditor = !hasGoal || editing;
  return (
    <div className="rounded-2xl mt-4 p-4" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.13) 0%, rgba(0,0,0,0) 100%), rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.30)" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {t("contemplation.goal_title", { defaultValue: "Daily goal" })}
        </p>
        {hasGoal && (
          <span className="text-[12px] font-semibold" style={{ color: met ? "#A8C5A0" : SAGE, fontFamily: SPACE_GROTESK }}>
            {met
              ? t("contemplation.goal_reached", { defaultValue: "Reached today" })
              : t("contemplation.goal_progress", { done: doneMin, goal: goalMinutes, defaultValue: `${doneMin} of ${goalMinutes} min today` })}
          </span>
        )}
      </div>

      {hasGoal && (
        <div className="rounded-full overflow-hidden mb-3" style={{ height: 6, background: "rgba(46,107,64,0.20)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: met ? "#6FAF85" : "#2D5E3F", transition: "width 0.3s" }} />
        </div>
      )}

      {/* Synced from Apple Health — folded into today's progress above. */}
      {healthMin > 0 && (
        <p className="text-[12px] flex items-center gap-1.5" style={{ color: SAGE, fontFamily: SPACE_GROTESK, margin: "0 0 12px" }}>
          <span aria-hidden>🍎</span>
          {t("contemplation.health_counted", { defaultValue: `Including ${healthMin} min synced from Apple Health`, count: healthMin })}
        </p>
      )}

      {showEditor ? (
        <>
          {!hasGoal && (
            <p className="text-[12px]" style={{ color: SAGE, margin: "0 0 12px" }}>
              {t("contemplation.goal_prompt", { defaultValue: "Set a daily minutes goal — we'll nudge you around 7pm on days you haven't reached it." })}
            </p>
          )}
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={180}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSet) { onSet(parsed); setEditing(false); } }}
              placeholder={t("contemplation.goal_placeholder", { defaultValue: "Minutes" })}
              aria-label={t("contemplation.goal_field_label", { defaultValue: "Daily goal in minutes" })}
              disabled={saving}
              className="rounded-xl px-3 py-2 text-sm"
              style={{ width: 96, background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.35)", color: WARM, fontFamily: SPACE_GROTESK, outline: "none" }}
            />
            <span className="text-[13px]" style={{ color: SAGE, fontFamily: SPACE_GROTESK }}>
              {t("contemplation.goal_unit", { defaultValue: "min / day" })}
            </span>
            <button
              type="button"
              onClick={() => { onSet(parsed); setEditing(false); }}
              disabled={!canSet}
              className="rounded-full px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 ml-auto"
              style={{ background: "#2D5E3F", color: WARM, fontFamily: SPACE_GROTESK, cursor: canSet ? "pointer" : "default" }}
            >
              {t("common.set", { defaultValue: "Set" })}
            </button>
          </div>
          {hasGoal && (
            <button
              type="button"
              onClick={() => { onSet(0); setEditing(false); }}
              disabled={saving}
              className="text-[12px] mt-2 transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "none", border: "none", padding: 0, color: SAGE, fontFamily: SPACE_GROTESK, cursor: "pointer" }}
            >
              {t("contemplation.goal_turn_off", { defaultValue: "Turn off goal" })}
            </button>
          )}
        </>
      ) : (
        // Set → just the goal + an Adjust pill.
        <div className="flex items-center justify-between">
          <p style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 17, fontWeight: 600, margin: 0 }}>
            {t("contemplation.goal_value", { goal: goalMinutes, defaultValue: `${goalMinutes} min / day` })}
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full px-4 py-2 text-[13px] font-semibold transition-opacity hover:opacity-90"
            style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)", color: "#A8C5A0", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
          >
            {t("contemplation.goal_adjust", { defaultValue: "Adjust" })}
          </button>
        </div>
      )}
    </div>
  );
}

// One History card: date + time on the left, duration on the right, with
// a two-tap delete (tap the trash, then confirm) so an errant manual log
// can be removed without a stray tap nuking a real sit.
function SessionRow({ s, onDelete, deleting }: { s: Session; onDelete: () => void; deleting: boolean }) {
  const { t, i18n } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const when = s.startedAt ?? s.endedAt;
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
      style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.20)" }}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
          {when ? formatSessionDate(when, t, i18n.language) : "—"}
        </p>
        <p className="text-[12px] mt-0.5" style={{ color: SAGE, margin: 0 }}>
          {when ? formatSessionTime(when) : ""}
          {s.source === "cobreathe" && (
            <span> · 🌍 {t("cobreathe.title", { defaultValue: "Co-Breathe" })}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* Garden members who were praying at the same moment — faces to
            the left of the duration. A quiet "you weren't alone." */}
        {s.companions && s.companions.length > 0 && (
          <div
            className="flex items-center -space-x-1.5"
            title={`Praying alongside ${s.companions.map((c) => c.name ?? "someone").join(", ")}`}
          >
            {s.companions.slice(0, 3).map((c) =>
              c.avatarUrl ? (
                <img
                  key={c.userId}
                  src={c.avatarUrl}
                  alt={c.name ?? "Someone"}
                  className="w-5 h-5 rounded-full object-cover"
                  style={{ border: "1.5px solid #0E2016" }}
                />
              ) : (
                <div
                  key={c.userId}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold"
                  style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1.5px solid #0E2016" }}
                >
                  {initials(c.name ?? "?")}
                </div>
              ),
            )}
            {s.companions.length > 3 && (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold"
                style={{ background: "rgba(46,107,64,0.45)", color: WARM, border: "1.5px solid #0E2016" }}
              >
                +{s.companions.length - 3}
              </div>
            )}
          </div>
        )}
        <span className="text-sm font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
          {humanMinutes(s.durationSeconds)}
        </span>
        {confirming ? (
          <>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="text-[12px] font-semibold rounded-full px-2.5 py-1 transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ color: "#D98C4A", background: "rgba(217,140,74,0.12)", border: "1px solid rgba(217,140,74,0.3)", cursor: "pointer" }}
            >
              {t("contemplation.delete")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[12px] rounded-full px-2 py-1 transition-opacity hover:opacity-90"
              style={{ color: SAGE, cursor: "pointer" }}
            >
              {t("contemplation.cancel")}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={t("contemplation.remove_entry", { defaultValue: "Remove entry" })}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-100"
            style={{ color: "rgba(143,175,150,0.6)", opacity: 0.7, cursor: "pointer" }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function ContemplationPage() {
  const { t, i18n } = useTranslation();
  const [timerOpen, setTimerOpen] = useState(false);

  // Apple Health is OPT-IN: we no longer auto-prompt for Mindful access when the
  // Contemplation page opens. Per request, don't ask for health data unless the
  // user has chosen a health practice. Phoebe no longer writes Mindful Minutes
  // to Apple Health at all (simpler Health ask); the Daily steps practice
  // requests its own step access on opt-in.
  // Always launched with an explicit length now (the Begin pill passes the
  // chosen minutes), so the timer skips its own picker and starts straight
  // into the sit. The six-box picker phase is reserved for the prayer-
  // slideshow caller.
  const [startMinutes, setStartMinutes] = useState<number | undefined>(undefined);
  const start = (minutes?: number) => {
    // Remember the last length chosen so the dropdown defaults to it next time.
    if (typeof minutes === "number") {
      try { localStorage.setItem(LAST_MIN_KEY, String(minutes)); } catch { /* private mode */ }
    }
    setStartMinutes(minutes);
    setTimerOpen(true);
  };
  // The length chosen in the Begin dropdown (5-minute increments), seeded
  // from the last length the user chose so it persists across visits.
  const [chosenMin, setChosenMin] = useState<number>(() => {
    try {
      const v = parseInt(localStorage.getItem(LAST_MIN_KEY) ?? "", 10);
      if (Number.isFinite(v) && v >= 5 && v <= 60 && v % 5 === 0) return v;
    } catch { /* private mode */ }
    return 10;
  });
  // Which supporting section shows under the Begin card.
  const [, setLocation] = useLocation();
  // The "begin" entry — the home contemplation card AND the goal notification
  // both point at /contemplation?begin=1 — should open the communal breath when
  // the user's contemplation style is Cobreathe, exactly as the home card does.
  // The card branches on this same localStorage flag; mirror it here so the
  // notification lands on the SAME page the card would.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      // A contemplation SESSION deep-link (?sit=N) opens the silent timer at the
      // chosen length straight away — explicitly silent, so it ignores the global
      // Cobreathe style (a Cobreathe session deep-links to /cobreathe directly).
      const sit = params.get("sit");
      if (sit) {
        const m = parseInt(sit, 10);
        if (Number.isFinite(m) && m >= 1 && m <= 120) { start(m); return; }
      }
      // The contemplation card always opens the begin slide below (Length +
      // Start contemplation + a Cobreathe pill). It no longer auto-skips to
      // Cobreathe when that's the saved style — the picker is always shown, and
      // the Cobreathe pill there leads to its own in-person options slide.
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<"history" | "stats" | "learn">(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("tab");
      if (v === "stats" || v === "learn" || v === "history") return v;
    } catch { /* ignore */ }
    return "history";
  });
  // Local midnight so the server can scope "today" to the user's
  // calendar day rather than UTC. Stable within a day; keyed into the
  // query so it refetches cleanly across a midnight rollover.
  const todaySince = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  // IANA timezone so the server counts distinct days-sat in LOCAL time
  // (not UTC) — otherwise evening sits straddle UTC midnight and the
  // per-day average divides by an inflated day count.
  const tz = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
    catch { return "UTC"; }
  })();
  // Cobreathe — today's communal-breath count for the teaser card.
  const cobreatheDay = new Date().toLocaleDateString("en-CA");
  const { data: cobreathe } = useQuery<{ done: boolean; count: number }>({
    queryKey: ["/api/breath/today", cobreatheDay],
    queryFn: () => apiRequest("GET", `/api/breath/today?day=${cobreatheDay}`),
    staleTime: 60_000,
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/me/contemplation-stats", todaySince.slice(0, 10), tz],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/me/contemplation-stats?todaySince=${encodeURIComponent(todaySince)}&tz=${encodeURIComponent(tz)}`,
      ) as Promise<Stats>,
  });

  // History — every logged sit, newest first.
  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["/api/me/contemplation-sessions"],
    queryFn: () => apiRequest("GET", "/api/me/contemplation-sessions") as Promise<Session[]>,
  });

  // Today's mindful sessions read from Apple Health (iOS only). We surface
  // only EXTERNAL ones (Calm, Insight Timer, Apple Mindfulness) as history
  // cards — Phoebe's own sits already appear above as logged sits, so showing
  // the copies Phoebe wrote back to Health would double them.
  const { data: healthSessions = [] } = useQuery<MindfulSession[]>({
    queryKey: ["apple-health-mindful-sessions", new Date().toLocaleDateString("en-CA")],
    queryFn: () => getMindfulSessionsToday(),
    enabled: appleHealthAvailable(),
    staleTime: 5 * 60_000,
  });
  const externalHealthSessions = useMemo(
    () => healthSessions.filter((h) => !h.isOwn && h.minutes > 0),
    [healthSessions],
  );

  // History grouping: today's & yesterday's sits stay as individual cards;
  // every older day collapses into ONE summary card (date + sit count + total
  // minutes). Sessions arrive newest-first, so day groups land newest-first.
  const historyGroups = useMemo(() => {
    const recent: Session[] = [];
    const olderDays: Array<{ key: string; iso: string; totalSeconds: number; count: number }> = [];
    const seen = new Map<string, number>();
    for (const s of sessions) {
      const w = s.startedAt ?? s.endedAt;
      if (!w || dayDiff(w) <= 1) { recent.push(s); continue; }
      const k = dayKey(w);
      let idx = seen.get(k);
      if (idx === undefined) {
        idx = olderDays.length;
        seen.set(k, idx);
        olderDays.push({ key: k, iso: w, totalSeconds: 0, count: 0 });
      }
      olderDays[idx].totalSeconds += s.durationSeconds ?? 0;
      olderDays[idx].count += 1;
    }
    return { recent, olderDays };
  }, [sessions]);

  // Manual-log form state.
  const queryClient = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);
  // Free string so the field can be cleared to blank and retyped; parsed to a
  // number where one's needed (mutation + submit-enabled check).
  const [logMinutes, setLogMinutes] = useState("5");
  const [logWhen, setLogWhen] = useState(() => localDatetimeValue(new Date()));
  const inputStyle = {
    background: "rgba(0,0,0,0.25)",
    border: "1px solid rgba(46,107,64,0.35)",
    color: WARM,
    fontFamily: SPACE_GROTESK,
    colorScheme: "dark" as const,
  };
  const refreshContemplation = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
  };
  const logMutation = useMutation({
    mutationFn: async () => {
      const mins = Math.min(720, parseInt(logMinutes, 10) || 0);
      const start = new Date(logWhen);
      const secs = Math.round(mins * 60);
      // (No longer mirrored into Apple Health — keeps the Health ask simple.)
      const res = await apiRequest("POST", "/api/me/contemplation-sessions", {
        durationSeconds: secs,
        occurredAt: start.toISOString(),
      });
      return { res, start, secs };
    },
    // Optimistically reflect the sit in the caches the page reads from, so it
    // shows up the instant the POST returns instead of waiting on the refetch
    // (a plain invalidate sometimes left the history + goal looking unchanged
    // until a manual page refresh). refreshContemplation then reconciles.
    onSuccess: ({ res, start, secs }) => {
      const id = (res as { id?: number } | undefined)?.id ?? Date.now();
      const endIso = new Date(start.getTime() + secs * 1000).toISOString();
      queryClient.setQueryData<Session[]>(
        ["/api/me/contemplation-sessions"],
        (old = []) => [{ id, startedAt: start.toISOString(), endedAt: endIso, durationSeconds: secs }, ...old],
      );
      // Bump today's totals (drives the goal progress + the "today" tile) when
      // the logged sit falls on the local day the stats query is scoped to.
      if (start >= new Date(todaySince)) {
        queryClient.setQueryData<Stats>(
          ["/api/me/contemplation-stats", todaySince.slice(0, 10), tz],
          (s) => {
            if (!s) return s;
            // First sit of today makes it a new distinct day for the week /
            // all-time day counts. The average-per-day tiles divide by these,
            // so leaving them at 0 while seconds jumped flashed a wrong average
            // until the refetch reconciled.
            const newDayToday = s.todayCount === 0;
            return {
              ...s,
              todaySeconds: s.todaySeconds + secs,
              weekSeconds: s.weekSeconds + secs,
              totalSeconds: s.totalSeconds + secs,
              todayCount: s.todayCount + 1,
              weekCount: s.weekCount + 1,
              sessionCount: s.sessionCount + 1,
              todayDays: Math.max(s.todayDays, 1),
              weekDays: newDayToday ? s.weekDays + 1 : s.weekDays,
              totalDays: newDayToday ? s.totalDays + 1 : s.totalDays,
            };
          },
        );
      }
      refreshContemplation();
      setLogOpen(false);
      setLogMinutes("20");
      setLogWhen(localDatetimeValue(new Date()));
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/me/contemplation-sessions/${id}`),
    onSuccess: refreshContemplation,
  });

  // Daily contemplation goal (minutes; 0 = off). Stored with the user's office
  // prefs; setting one turns on a gentle ~7pm reminder on days it's unmet.
  const { data: officePrefs } = useQuery<{ contemplationGoalMinutes: number }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs") as Promise<{ contemplationGoalMinutes: number }>,
    // Always refetch on mount so the goal reflects a change just made in the
    // Customize flow (otherwise a stale 0 from an earlier cache could show).
    staleTime: 0,
    refetchOnMount: "always",
  });
  const goalMinutes = officePrefs?.contemplationGoalMinutes ?? 0;
  const goalMutation = useMutation({
    mutationFn: (minutes: number) =>
      apiRequest("PUT", "/api/me/office-prefs", { contemplationGoalMinutes: minutes }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/office-prefs"] }),
  });

  // Focused "begin" mode — arrived from the home contemplation card (?begin=1).
  // Shows ONLY the choose-your-sit pills (length, Start, Cobreathe); the stats,
  // history, goal card and tabs are hidden so it reads as a single slide.
  const beginMode = (() => {
    try { return new URLSearchParams(window.location.search).get("begin") === "1"; }
    catch { return false; }
  })();

  // The choose-your-sit pills — a length dropdown + Start (tight together), a
  // space, then Cobreathe set apart. Shared by the full page and the immersive
  // begin-mode slide.
  const beginPills = (
    <div>
      <div className="space-y-2.5">
        {/* Length pill — category on the left, chosen value + chevron on the
            right (matches the office welcome chooser). A transparent native
            <select> overlays the pill so a tap opens the iOS picker. */}
        <div className="relative w-full">
          <div className="w-full rounded-full flex items-center justify-between"
            style={{ background: "rgba(9,26,16,0.3)", backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)", border: "1px solid rgba(46,107,64,0.4)", padding: "15px 20px", gap: 12, pointerEvents: "none" }}>
            <span style={{ color: WARM, fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600 }}>{t("contemplation.length_label", { defaultValue: "Length" })}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 500 }}>{t("contemplation.length_minutes", { count: chosenMin, defaultValue: `${chosenMin} minutes` })}</span>
              <span aria-hidden style={{ color: SAGE, fontSize: 15, lineHeight: 1 }}>›</span>
            </span>
          </div>
          <select
            value={String(chosenMin)}
            onChange={(e) => setChosenMin(parseInt(e.target.value, 10))}
            aria-label={t("contemplation.length_label", { defaultValue: "Length" })}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, appearance: "none", WebkitAppearance: "none", border: "none", background: "transparent", color: "transparent", cursor: "pointer" }}
          >
            {Array.from({ length: 12 }, (_, i) => (i + 1) * 5).map((m) => (
              <option key={m} value={String(m)}>
                {t("contemplation.length_minutes", { count: m, defaultValue: `${m} minutes` })}
              </option>
            ))}
          </select>
        </div>

        {/* Start contemplation pill */}
        <button
          type="button"
          onClick={() => start(chosenMin)}
          className="w-full rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{
            background: "rgba(9,26,16,0.3)", backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)",
            color: WARM,
            border: "1px solid rgba(168,197,160,0.45)",
            fontFamily: SPACE_GROTESK,
            fontSize: 16,
            fontWeight: 600,
            padding: "15px",
            cursor: "pointer",
          }}
        >
          {t("contemplation.start_contemplation", { defaultValue: "Start contemplation" })} <span aria-hidden>→</span>
        </button>
      </div>

      {/* View stats — a quiet link under Start that drops the focused slide and
          opens the full page on the Stats tab. Only in the immersive begin
          mode; the full page already carries the History/Stats/Learn tabs. */}
      {beginMode && (
        <div className="flex items-center justify-center gap-3 mt-3.5">
          <button
            type="button"
            onClick={() => { setTab("stats"); setLocation("/contemplation?tab=stats"); }}
            className="text-center transition-opacity active:opacity-70"
            style={{ background: "none", border: "none", color: "rgba(143,175,150,0.85)", fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {t("contemplation.view_stats", { defaultValue: "View stats" })} <span aria-hidden>→</span>
          </button>
          <span aria-hidden style={{ color: "rgba(143,175,150,0.4)" }}>·</span>
          {/* Manual log — open the full page's History tab with the log form
              already expanded, so a sit prayed elsewhere can be recorded
              without first hunting for the History section. */}
          <button
            type="button"
            onClick={() => { setTab("history"); setLogOpen(true); setLocation("/contemplation?tab=history"); }}
            className="text-center transition-opacity active:opacity-70"
            style={{ background: "none", border: "none", color: "rgba(143,175,150,0.85)", fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            {t("contemplation.log_prayer_time", { defaultValue: "Log prayer time" })}
          </button>
        </div>
      )}

      {/* Cobreathe pill — set apart with a space; opens Co-Breathe's intro slide
          (the why + Topic/Length/Location), then Begin leads into the breath. */}
      <Link href="/cobreathe?from=contemplation" onClick={() => primeAudio()} className="block mt-6">
        <div
          className="w-full rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99] flex items-center justify-center gap-2"
          style={{
            background: "rgba(9,26,16,0.3)", backdropFilter: "blur(12.6px)", WebkitBackdropFilter: "blur(12.6px)",
            border: `1px solid rgba(62,124,122,${cobreathe?.done ? 0.5 : 0.4})`,
            color: WARM, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600,
            padding: "15px", cursor: "pointer",
          }}
        >
          <CobreatheGlobe size={18} />
          <span>{t("cobreathe.title", { defaultValue: "Co-Breathe" })}</span>
        </div>
      </Link>
    </div>
  );

  // Immersive full-screen begin slide — green ambient background, no app
  // chrome, content centred. Reads like the office slideshow's contemplation
  // slide. The timer overlay still opens on Start.
  if (beginMode) {
    return (
      <>
        <div
          className="fixed inset-0 flex flex-col items-center justify-center px-8"
          style={{
            background: "#0C1F12", zIndex: 60, overflow: "hidden",
            paddingTop: "calc(var(--safe-top) + 24px)",
            paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          }}
        >
          <AnimatedBackground base="#0C1F12" variant="pronounced" />
          {CONTEMPLATION_LEAF && (
            <>
              <img src={CONTEMPLATION_LEAF} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4, zIndex: 0 }} />
              <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0, background: "linear-gradient(180deg, rgba(8,22,15,0.5) 0%, rgba(8,22,15,0.66) 45%, rgba(8,22,15,0.82) 100%)" }} />
            </>
          )}
          <Link
            href="/dashboard"
            aria-label={t("common.close", { defaultValue: "Close" })}
            className="flex items-center justify-center"
            style={{
              position: "absolute", top: "calc(var(--safe-top) + 16px)", right: 16,
              width: 34, height: 34, borderRadius: 999,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(182,210,188,0.22)",
              color: "rgba(182,210,188,0.72)", fontSize: 16, lineHeight: 1, zIndex: 2,
            }}
          >
            ✕
          </Link>
          <div className="w-full" style={{ maxWidth: 360, position: "relative", zIndex: 1 }}>
            <p className="text-center text-[10px] uppercase tracking-[0.2em] font-semibold mb-3" style={{ color: "rgba(143,175,150,0.55)", fontFamily: SPACE_GROTESK }}>
              🕯️ {t("contemplation.title")}
            </p>
            <p className="text-center text-[20px] leading-[1.5] italic mb-8 px-2" style={{ color: "#E8E4D8", fontFamily: "Georgia, 'Times New Roman', serif" }}>
              {t("contemplation.begin_prompt", { defaultValue: "Choose a length, and settle into silence." })}
            </p>
            {beginPills}
          </div>
        </div>
        <ContemplationTimer
          open={timerOpen}
          startMinutes={startMinutes}
          onClose={(r) => { setTimerOpen(false); setStartMinutes(undefined); if (r?.completed) setLocation("/dashboard"); }}
        />
      </>
    );
  }

  return (
    <Layout>
      <motion.div
        className="max-w-xl mx-auto w-full"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-start gap-3 mb-5">
          <div
            className="text-3xl w-12 h-12 flex items-center justify-center rounded-2xl flex-shrink-0"
            style={{ background: "rgba(62,124,122,0.18)", border: "1px solid rgba(62,124,122,0.35)" }}
          >
            🕯️
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
              {t("contemplation.title")}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: SAGE }}>
              {t("contemplation.subtitle")}
            </p>
          </div>
        </div>

        {beginPills}

        {/* Everything below the pills (goal, stats, history, learn) is hidden
            in the focused begin-mode slide. */}
        {!beginMode && (<>
        <DailyGoalCard
          goalMinutes={goalMinutes}
          todaySeconds={stats?.todaySeconds ?? 0}
          healthMinutesToday={stats?.healthMinutesToday ?? 0}
          onSet={(m) => goalMutation.mutate(m)}
          saving={goalMutation.isPending}
        />

        {/* Section selector — History · Stats · Learn. The Begin card
            leads; these reveal the supporting surfaces below it. */}
        <div
          className="flex rounded-xl p-1 mt-7 mb-5"
          style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)" }}
        >
          {([["history", t("contemplation.history")], ["stats", t("contemplation.stats")], ["learn", t("contemplation.learn")]] as const).map(([key, label]) => {
            const on = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className="flex-1 rounded-lg py-2 text-center transition-colors"
                style={{
                  background: on ? "#2D5E3F" : "transparent",
                  color: on ? WARM : "rgba(143,175,150,0.8)",
                  fontFamily: SPACE_GROTESK,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Stats — cumulative time + average per day, over Today / This
            Week / All Time. */}
        {tab === "stats" && (
          <div>
            <RowLabel>{t("contemplation.cumulative")}</RowLabel>
            <div className="flex gap-3 mb-4">
              {/* Cumulative time = in-app sits (incl. Cobreathe) + external
                  Apple Health mindful minutes for each window. */}
              <StatTile label={t("contemplation.label_today")} value={humanMinutes((stats?.todaySeconds ?? 0) + (stats?.healthMinutesToday ?? 0) * 60)} />
              <StatTile label={t("contemplation.label_this_week")} value={humanMinutes((stats?.weekSeconds ?? 0) + (stats?.healthMinutesWeek ?? 0) * 60)} />
              <StatTile label={t("contemplation.label_all_time")} value={humanMinutes((stats?.totalSeconds ?? 0) + (stats?.healthMinutesTotal ?? 0) * 60)} />
            </div>
            <RowLabel>{t("contemplation.average_per_day")}</RowLabel>
            <div className="flex gap-3">
              <StatTile label={t("contemplation.label_today")} value={avgPerDay(stats?.todaySeconds ?? 0, stats?.todayDays ?? 0)} />
              <StatTile label={t("contemplation.label_this_week")} value={avgPerDay(stats?.weekSeconds ?? 0, stats?.weekDays ?? 0)} />
              <StatTile label={t("contemplation.label_all_time")} value={avgPerDay(stats?.totalSeconds ?? 0, stats?.totalDays ?? 0)} />
            </div>
          </div>
        )}

        {/* Learn — talks, guided sits, and reading. Each opens externally. */}
        {tab === "learn" && (
          <div className="space-y-2">
            <p className="text-[12px] mb-1" style={{ color: "rgba(143,175,150,0.6)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
              {t("contemplation.learn_caption")}
            </p>
            {LEARN_RESOURCES.map((r) => (
              <button
                key={r.url}
                type="button"
                onClick={() => openExternal(r.url)}
                className="w-full text-left rounded-xl px-4 py-3 flex items-center gap-3 transition-opacity hover:opacity-90 active:scale-[0.99]"
                style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)", cursor: "pointer" }}
              >
                <span
                  className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[14px]"
                  style={{ background: "rgba(62,124,122,0.16)", border: "1px solid rgba(62,124,122,0.3)" }}
                  aria-hidden
                >
                  {r.kind === "video" ? "▶" : "📖"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                    {r.title}
                  </p>
                  <p className="text-[12px] truncate" style={{ color: SAGE, margin: "2px 0 0" }}>
                    {r.source}
                  </p>
                </div>
                <span aria-hidden className="shrink-0 text-[13px]" style={{ color: "rgba(143,175,150,0.6)" }}>↗</span>
              </button>
            ))}
          </div>
        )}

        {/* History — every logged sit, newest first. "Log prayer time"
            opens an inline form for sits done away from the app. */}
        {tab === "history" && (
        <div>
          <div className="flex items-center justify-end mb-3">
            <button
              type="button"
              onClick={() => setLogOpen((v) => !v)}
              className="text-[12px] font-semibold rounded-full px-3 py-1.5 transition-opacity hover:opacity-90"
              style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)", color: "#A8C5A0", fontFamily: SPACE_GROTESK, cursor: "pointer" }}
            >
              {logOpen ? t("contemplation.close") : t("contemplation.log_prayer_time")}
            </button>
          </div>

          {logOpen && (
            <div className="rounded-2xl p-4 mb-3" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.22)" }}>
              <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: SAGE, fontFamily: SPACE_GROTESK, margin: "0 0 8px" }}>
                {t("contemplation.how_long")}
              </p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[5, 10, 15, 20].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setLogMinutes(String(m))}
                    className="rounded-lg py-2 text-sm transition-opacity hover:opacity-90"
                    style={{
                      background: Number(logMinutes) === m ? "rgba(46,107,64,0.38)" : "rgba(46,107,64,0.12)",
                      border: `1px solid ${Number(logMinutes) === m ? "rgba(46,107,64,0.7)" : "rgba(46,107,64,0.3)"}`,
                      color: WARM, fontFamily: SPACE_GROTESK, cursor: "pointer",
                    }}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={720}
                  value={logMinutes}
                  onChange={(e) => setLogMinutes(e.target.value)}
                  className="w-20 rounded-lg px-3 py-2 text-sm"
                  style={inputStyle}
                />
                <span className="text-sm" style={{ color: SAGE }}>{t("contemplation.minutes")}</span>
              </div>
              <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: SAGE, fontFamily: SPACE_GROTESK, margin: "0 0 8px" }}>
                {t("contemplation.when")}
              </p>
              <input
                type="datetime-local"
                value={logWhen}
                max={localDatetimeValue(new Date())}
                onChange={(e) => setLogWhen(e.target.value)}
                className="w-full rounded-lg px-3 py-2 mb-4 text-sm"
                style={inputStyle}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => logMutation.mutate()}
                  disabled={logMutation.isPending || (parseInt(logMinutes, 10) || 0) < 1}
                  className="flex-1 rounded-xl py-2.5 text-center transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)", fontFamily: SPACE_GROTESK, fontSize: 15, fontWeight: 600, cursor: "pointer" }}
                >
                  {logMutation.isPending ? t("contemplation.logging") : t("contemplation.log_submit")}
                </button>
                <button
                  type="button"
                  onClick={() => setLogOpen(false)}
                  className="rounded-xl py-2.5 px-4 text-center transition-opacity hover:opacity-90"
                  style={{ color: SAGE, fontFamily: SPACE_GROTESK, fontSize: 15, cursor: "pointer" }}
                >
                  {t("contemplation.cancel")}
                </button>
              </div>
            </div>
          )}

          {sessions.length === 0 && externalHealthSessions.length === 0 ? (
            <p className="text-[13px] text-center py-6" style={{ color: "rgba(143,175,150,0.5)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
              {t("contemplation.no_sessions")}
            </p>
          ) : (
            <div className="space-y-2">
              {/* Recent — Phoebe sits + Apple Health mindful minutes (Calm,
                  Insight Timer, Apple Mindfulness) interleaved in true
                  chronological order (newest first), not grouped by source.
                  Older Phoebe sits collapse into per-day summaries below. */}
              {(() => {
                type Row =
                  | { kind: "health"; ms: number; h: (typeof externalHealthSessions)[number] }
                  | { kind: "sit"; ms: number; s: Session };
                const rows: Row[] = [
                  ...externalHealthSessions.map((h) => ({ kind: "health" as const, ms: h.startMs, h })),
                  ...historyGroups.recent.map((s) => ({
                    kind: "sit" as const,
                    ms: new Date(s.startedAt ?? s.endedAt ?? 0).getTime(),
                    s,
                  })),
                ].sort((a, b) => b.ms - a.ms);
                return rows.map((row) => {
                  if (row.kind === "sit") {
                    return (
                      <SessionRow
                        key={row.s.id}
                        s={row.s}
                        onDelete={() => deleteMutation.mutate(row.s.id)}
                        deleting={deleteMutation.isPending}
                      />
                    );
                  }
                  const h = row.h;
                  const iso = new Date(h.startMs).toISOString();
                  return (
                    <div
                      key={`hk-${h.startMs}`}
                      className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                      style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.20)" }}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                          {formatSessionDate(iso, t, i18n.language)}
                        </p>
                        <p className="text-[12px] mt-0.5 truncate" style={{ color: SAGE, margin: 0 }}>
                          {formatSessionTime(iso)} · 🍎 {h.source || t("contemplation.health_title", { defaultValue: "Apple Health" })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold shrink-0" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                        {humanMinutes(h.minutes * 60)}
                      </span>
                    </div>
                  );
                });
              })()}
              {/* Older — one condensed summary card per day. */}
              {historyGroups.olderDays.map((g) => (
                <div
                  key={g.key}
                  className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                  style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.20)" }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                      {formatSessionDate(g.iso, t)}
                    </p>
                    <p className="text-[12px] mt-0.5" style={{ color: SAGE, margin: 0 }}>
                      {g.count === 1
                        ? t("contemplation.day_one_sit", { defaultValue: "1 sit" })
                        : t("contemplation.day_n_sits", { count: g.count, defaultValue: `${g.count} sits` })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                    {humanMinutes(g.totalSeconds)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
        </>)}
      </motion.div>

      <ContemplationTimer
        open={timerOpen}
        startMinutes={startMinutes}
        onClose={() => { setTimerOpen(false); setStartMinutes(undefined); }}
      />
    </Layout>
  );
}
