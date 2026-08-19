import { useState, useEffect, useMemo, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { isNativeShell } from "@/lib/isNativeShell";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { LEAF_PHOTOS } from "@/lib/earthPhotos";
import { pickWideBackground } from "@/lib/wideBackgrounds";
import { CobreatheGlobe } from "@/components/CobreatheGlobe";
import { apiRequest } from "@/lib/queryClient";
import { ContemplationTimer, CONTEMPLATION_PRESENCE_ENABLED, type ContemplationWhatsNext } from "@/components/ContemplationTimer";
import { PracticeIntro } from "@/components/PracticeIntro";
import { hasSeenIntro, markIntroSeen } from "@/lib/practiceIntros";
import { getSideMinutes, getReflectionSource, getSideContemplationExplicit } from "@/lib/officePrefs";
import { attributeContemplationSit } from "@/lib/contemplationSideDone";
import { useAuth } from "@/hooks/useAuth";
import { isDeviceLocalGuest } from "@/lib/guestFlag";
import { getGuestSilenceMinutesToday, GUEST_SILENCE_EVENT } from "@/lib/guestSilenceLog";
import { SilenceLadderCard } from "@/components/SilenceLadderCard";
import { openExternal, openExternalThenMarkRead } from "@/lib/openExternal";
import {
  CAC_TODAY_URL, FDD_TODAY_URL, SSJE_TODAY_URL,
  markCacRead, markFddRead, markSsjeRead,
  hasReadCacToday, hasReadFddToday, hasReadSsjeToday,
} from "@/lib/cacReadState";
import { primeAudio } from "@/lib/amenFeedback";

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

// The daily reflections a sit can hand off into, in display order (FDD first —
// the app default). Used for the ContemplationTimer's closing "what's next"
// card, so a contemplation-heavy rhythm ends on the day's word.
const WHATS_NEXT_REFLECTIONS: Array<{
  key: "fdd" | "cac" | "ssje"; name: string; url: string;
  isReadToday: () => boolean; markRead: () => void;
}> = [
  { key: "fdd", name: "Forward Day by Day", url: FDD_TODAY_URL, isReadToday: hasReadFddToday, markRead: markFddRead },
  { key: "cac", name: "CAC Daily Meditation", url: CAC_TODAY_URL, isReadToday: hasReadCacToday, markRead: markCacRead },
  { key: "ssje", name: "SSJE — Brother, Give Us a Word", url: SSJE_TODAY_URL, isReadToday: hasReadSsjeToday, markRead: markSsjeRead },
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
// Local YYYY-MM-DD (zero-padded) — a stable sort key for grouping older
// history days newest-first.
function ymdLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA");
}

// <input type="datetime-local"> wants LOCAL "YYYY-MM-DDTHH:mm".
function localDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Average per day across the prayer-sit day count from the server.
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

// Daily goal card — set a minutes/day target and see today's progress toward
// it. Setting a goal (> 0) turns on a gentle ~7pm reminder ONLY on days it's
// still unmet (no nudge once the goal is reached). The target is a free field —
// the user types any number of minutes; there are no presets.
function DailyGoalCard({
  goalMinutes, todaySeconds, onSet, saving,
}: {
  goalMinutes: number;
  todaySeconds: number;
  onSet: (m: number) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const hasGoal = goalMinutes > 0;

  // Today's progress = Phoebe's own logged time (the in-app contemplation timer
  // + office sits). No external source folds in.
  const doneMin = Math.floor(todaySeconds / 60);
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

      {showEditor ? (
        <>
          {!hasGoal && (
            <p className="text-[12px]" style={{ color: SAGE, margin: "0 0 12px" }}>
              {t("contemplation.goal_prompt", { defaultValue: "Set how much you'd like to sit each day — Phoebe will help you get there, at your own pace." })}
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
            <span> · 🌍 {t("cobreathe.title", { defaultValue: "Creation Prayer" })}</span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {/* Garden members who were praying at the same moment — faces to
            the left of the duration. A quiet "you weren't alone." Hidden
            while ALL contemplation is private (see the flag in
            ContemplationTimer) — a sit shows no one else's presence. */}
        {CONTEMPLATION_PRESENCE_ENABLED && s.companions && s.companions.length > 0 && (
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
  const { user } = useAuth();
  // Leaf/Wide backdrop, picked once per mount so it rotates to a fresh photo
  // each visit (web uses a Wide photo; native falls back to a bundled leaf).
  const contemplationLeaf = useMemo(() => pickWideBackground() ?? (LEAF_PHOTOS.length > 0 ? LEAF_PHOTOS[Math.floor(Math.random() * LEAF_PHOTOS.length)]! : null), []);
  const [timerOpen, setTimerOpen] = useState(false);
  // First-ever silent sit gets a one-card intro (what silence is, where it comes
  // from, what to do) so a beginner isn't dropped into a blank timer unguided.
  const [silenceIntroDismissed, setSilenceIntroDismissed] = useState(false);

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
      // Seed the picker from the last length chosen, but never default to more
      // than 20 — a stale 60 (e.g. a legacy goal-as-length bug) must not become
      // the standing default. Longer sits remain available in the dropdown.
      if (Number.isFinite(v) && v >= 5 && v <= 20 && v % 5 === 0) return v;
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
        if (Number.isFinite(m) && m >= 1 && m <= 120) {
          // From the home contemplation card (?begin=1): don't skip straight into
          // the timer. Show the chooser slide FIRST (Length / Start / Co-Breathe)
          // with their preset length already selected, so they choose how to sit.
          // A bare ?sit deep-link (no ?begin) still opens the silent timer at once.
          if (params.get("begin") === "1") { setChosenMin(m); }
          else { start(m); return; }
        }
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
  // The closing "what's next" card for a finished sit — the first daily
  // reflection the user follows that they HAVEN'T read yet today, so a
  // contemplation-only rhythm still ends on somewhere to go (the day's word).
  // Falls back to the single effective reflection source when no home layout is
  // saved yet. Null → the summary's button just closes (no extra slide).
  // Attribute a finished sit to a side so the right per-side card ("Morning" /
  // "Evening Contemplation") flips to kept. An explicit ?side= (the side card
  // that launched this) wins; otherwise the sit clears the first still-undone
  // active side (order: morning then evening).
  const attributeSit = () => {
    let explicitSide: "morning" | "evening" | null = null;
    try {
      const s = new URLSearchParams(window.location.search).get("side");
      if (s === "morning" || s === "evening") explicitSide = s;
    } catch { /* ignore */ }
    const mSet = getSideContemplationExplicit("morning");
    const eSet = getSideContemplationExplicit("evening");
    const anyExplicit = mSet !== null || eSet !== null;
    const activeSides = {
      // With an explicit per-side pick, honor it; otherwise (legacy global goal)
      // both sides carry a card, so either can receive the sit.
      morning: anyExplicit ? mSet === true : true,
      evening: anyExplicit ? eSet === true : true,
    };
    // This page IS the silent sit — never the Creation Prayer breath (that's
    // /cobreathe). Tagging the kind keeps a silent sit from ticking a side
    // whose card is styled as Creation Prayer, and vice versa.
    attributeContemplationSit({ explicitSide, activeSides, kind: "silent" });
  };

  const whatsNext: ContemplationWhatsNext | null = (() => {
    const order = user?.homeLayout?.order ?? [];
    const hidden = new Set(user?.homeLayout?.hidden ?? []);
    const followed = WHATS_NEXT_REFLECTIONS.filter((r) => order.includes(r.key) && !hidden.has(r.key));
    const list = followed.length > 0
      ? followed
      : WHATS_NEXT_REFLECTIONS.filter((r) => r.key === getReflectionSource());
    const next = list.find((r) => !r.isReadToday());
    if (!next) return null;
    return {
      emoji: "📖",
      title: next.name,
      sub: t("contemplation.whats_next_reflection_sub", { defaultValue: "Today's reflection" }),
      cta: t("contemplation.whats_next_read", { defaultValue: "Read it" }),
      onGo: () => openExternalThenMarkRead(next.url, next.markRead, { reader: true }),
    };
  })();
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

  // GUESTS (public no-login) can't POST prayer_sessions, so the server stats are
  // empty for them — their sits (silent AND Creation Prayer) live only in the
  // device-local tally the home reads. Fold that tally into today's minutes so
  // the Contemplation page shows the same count as the home. Re-read on the
  // guest-silence event + return-to-app so a just-finished sit lands live.
  const guest = isDeviceLocalGuest(user);
  const [guestSeconds, setGuestSeconds] = useState(() => getGuestSilenceMinutesToday() * 60);
  useEffect(() => {
    if (!guest) return;
    const recheck = () => setGuestSeconds(getGuestSilenceMinutesToday() * 60);
    recheck();
    window.addEventListener(GUEST_SILENCE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    window.addEventListener("pageshow", recheck);
    window.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener(GUEST_SILENCE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
      window.removeEventListener("pageshow", recheck);
      window.removeEventListener("visibilitychange", recheck);
    };
  }, [guest]);
  const todayTotalSeconds = (stats?.todaySeconds ?? 0) + (guest ? guestSeconds : 0);

  // History — every logged sit, newest first.
  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["/api/me/contemplation-sessions"],
    queryFn: () => apiRequest("GET", "/api/me/contemplation-sessions") as Promise<Session[]>,
  });

  // History grouping: today's & yesterday's sits stay as individual cards;
  // every older day collapses into ONE summary card (date + sit count + total
  // minutes). Sessions arrive newest-first, so day groups land newest-first.
  const historyGroups = useMemo(() => {
    const recent: Session[] = [];
    const olderDays: Array<{ key: string; iso: string; ymd: string; totalSeconds: number; count: number }> = [];
    const seen = new Map<string, number>();
    for (const s of sessions) {
      const w = s.startedAt ?? s.endedAt;
      if (!w || dayDiff(w) <= 1) { recent.push(s); continue; }
      const k = dayKey(w);
      let idx = seen.get(k);
      if (idx === undefined) {
        idx = olderDays.length;
        seen.set(k, idx);
        olderDays.push({ key: k, iso: w, ymd: ymdLocal(w), totalSeconds: 0, count: 0 });
      }
      olderDays[idx].totalSeconds += s.durationSeconds ?? 0;
      olderDays[idx].count += 1;
    }
    // Newest day first.
    olderDays.sort((a, b) => (a.ymd < b.ymd ? 1 : a.ymd > b.ymd ? -1 : 0));
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
  // "Grow my silence" ladder — when on, the climb card (SilenceLadderCard,
  // self-fetching + frosted) replaces the manual goal editor.
  const ladderEnabled = !!user?.silenceLadder?.enabled;

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
            style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(46,107,64,0.4)", padding: "15px 20px", gap: 12, pointerEvents: "none" }}>
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
            background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
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
        </div>
      )}
      {/* Manual log — owner: "have it be a pill... goes not to the
          contemplation details page, but goes to its own simple UI page."
          A real pill (not the quiet text link the other two use), its own
          row so it doesn't crowd against View stats. */}
      {beginMode && (
        <div className="flex items-center justify-center mt-3">
          <button
            type="button"
            onClick={() => {
              const s = (() => {
                try { return new URLSearchParams(window.location.search).get("side"); } catch { return null; }
              })();
              setLocation(s === "morning" || s === "evening" ? `/contemplation-log?side=${s}` : "/contemplation-log");
            }}
            className="rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
            style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.4)", color: "#A8C5A0", fontFamily: SPACE_GROTESK, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "10px 20px" }}
          >
            {t("contemplation.log_prayer_time", { defaultValue: "Log Prayer Time" })}
          </button>
        </div>
      )}

      {/* Cobreathe pill — set apart with a space; opens Co-Breathe's intro slide
          (the why + Topic/Length/Location), then Begin leads into the breath. */}
      <Link href="/cobreathe?from=contemplation" onClick={() => primeAudio()} className="block mt-6">
        <div
          className="w-full rounded-full text-center transition-opacity hover:opacity-90 active:scale-[0.99] flex items-center justify-center gap-2"
          style={{
            background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
            border: `1px solid rgba(62,124,122,${cobreathe?.done ? 0.5 : 0.4})`,
            color: WARM, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600,
            padding: "15px", cursor: "pointer",
          }}
        >
          <CobreatheGlobe size={18} />
          <span>{t("cobreathe.title", { defaultValue: "Creation Prayer" })}</span>
        </div>
      </Link>
    </div>
  );

  // Immersive full-screen begin slide — green ambient background, no app
  // chrome, content centred. Reads like the office slideshow's contemplation
  // slide. The timer overlay still opens on Start.
  if (beginMode) {
    // First time in — teach the practice before the blank timer.
    if (!silenceIntroDismissed && !hasSeenIntro("silence")) {
      const dismiss = () => { markIntroSeen("silence"); setSilenceIntroDismissed(true); };
      return <PracticeIntro intro="silence" beginLabel={t("practice_intro.begin_silence", { defaultValue: "Settle into silence" })} onBegin={dismiss} onSkip={dismiss} />;
    }
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
          {contemplationLeaf && (
            <>
              <img src={contemplationLeaf} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.4, zIndex: 0 }} />
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
            {/* The "grow my silence" climb, shown right under the pills so it's
                the first thing you see when opening Contemplation. */}
            <SilenceLadderCard className="mt-4" />
          </div>
        </div>
        <ContemplationTimer
          open={timerOpen}
          startMinutes={startMinutes}
          whatsNext={whatsNext}
          onClose={(r) => { setTimerOpen(false); setStartMinutes(undefined); if (r?.completed) { attributeSit(); setLocation("/dashboard"); } }}
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
        {/* When the "grow my silence" ladder is on it DRIVES the goal, so show
            the climb instead of the manual goal editor. */}
        {ladderEnabled ? (
          <SilenceLadderCard className="mt-4" />
        ) : (
          <DailyGoalCard
            goalMinutes={goalMinutes}
            todaySeconds={todayTotalSeconds}
            onSet={(m) => goalMutation.mutate(m)}
            saving={goalMutation.isPending}
          />
        )}

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
              {/* Cumulative time = in-app sits (incl. Cobreathe) for each window. */}
              <StatTile label={t("contemplation.label_today")} value={humanMinutes(todayTotalSeconds)} />
              <StatTile label={t("contemplation.label_this_week")} value={humanMinutes(stats?.weekSeconds ?? 0)} />
              <StatTile label={t("contemplation.label_all_time")} value={humanMinutes(stats?.totalSeconds ?? 0)} />
            </div>
            <RowLabel>{t("contemplation.average_per_day")}</RowLabel>
            <div className="flex gap-3">
              <StatTile label={t("contemplation.label_today")} value={avgPerDay(todayTotalSeconds, stats?.todayDays ?? 0)} />
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

          {sessions.length === 0 ? (
            <p className="text-[13px] text-center py-6" style={{ color: "rgba(143,175,150,0.5)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
              {t("contemplation.no_sessions")}
            </p>
          ) : (
            <div className="space-y-2">
              {/* Recent — today's & yesterday's sits as individual cards, newest
                  first. Older sits collapse into per-day summaries below. */}
              {historyGroups.recent.map((s) => (
                <SessionRow
                  key={s.id}
                  s={s}
                  onDelete={() => deleteMutation.mutate(s.id)}
                  deleting={deleteMutation.isPending}
                />
              ))}
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

        {/* ── Learn the practice — Fr. Keating's two courses (web only; both
            are YouTube video courses, so the iOS shell doesn't list them). */}
        {!isNativeShell() && (
          <div className="mt-10">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK }}>
                {t("contemplation.learn_heading", { defaultValue: "Learn" })}
              </h3>
              <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
            </div>
            <div className="space-y-2.5">
              <Link href="/centering-prayer" className="block rounded-xl px-4 py-3.5" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.20)" }}>
                <p className="text-sm font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                  {t("contemplation.learn_centering", { defaultValue: "Centering Prayer" })}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: SAGE, margin: 0 }}>
                  {t("contemplation.learn_centering_sub", { defaultValue: "Learn the practice with Fr. Thomas Keating" })}
                </p>
              </Link>
              <Link href="/journey" className="block rounded-xl px-4 py-3.5" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.20)" }}>
                <p className="text-sm font-semibold" style={{ color: WARM, fontFamily: SPACE_GROTESK, margin: 0 }}>
                  {t("contemplation.learn_journey", { defaultValue: "The Spiritual Journey" })}
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: SAGE, margin: 0 }}>
                  {t("contemplation.learn_journey_sub", { defaultValue: "Keating's full contemplative series" })}
                </p>
              </Link>
            </div>
          </div>
        )}
        </>)}
      </motion.div>

      <ContemplationTimer
        open={timerOpen}
        startMinutes={startMinutes}
        whatsNext={whatsNext}
        onClose={(r) => { setTimerOpen(false); setStartMinutes(undefined); if (r?.completed) attributeSit(); }}
      />
    </Layout>
  );
}
