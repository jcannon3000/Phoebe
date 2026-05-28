import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { ContemplationTimer } from "@/components/ContemplationTimer";
import { getDefaultContemplationMinutes } from "@/lib/officePrefs";
import { openExternal } from "@/lib/openExternal";

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

// Quick-start lengths shown on the Begin card above the full picker.
const QUICK_MINUTES = [5, 10, 20] as const;

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
            aria-label="Remove entry"
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
  const { t } = useTranslation();
  const [timerOpen, setTimerOpen] = useState(false);
  // Set by a quick button (5/10/20) to start that length immediately;
  // left undefined by "Begin contemplation" so the timer shows its
  // full picker.
  const [startMinutes, setStartMinutes] = useState<number | undefined>(undefined);
  const start = (minutes?: number) => {
    setStartMinutes(minutes);
    setTimerOpen(true);
  };
  // Which supporting section shows under the Begin card.
  const [tab, setTab] = useState<"history" | "stats" | "learn">("history");
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

  // Manual-log form state.
  const queryClient = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);
  const [logMinutes, setLogMinutes] = useState(20);
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
    mutationFn: () =>
      apiRequest("POST", "/api/me/contemplation-sessions", {
        durationSeconds: Math.round(logMinutes * 60),
        occurredAt: new Date(logWhen).toISOString(),
      }),
    onSuccess: () => {
      refreshContemplation();
      setLogOpen(false);
      setLogMinutes(20);
      setLogWhen(localDatetimeValue(new Date()));
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/me/contemplation-sessions/${id}`),
    onSuccess: refreshContemplation,
  });

  return (
    <Layout>
      <div className="max-w-xl mx-auto w-full">
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

        {/* Begin card — leads the page. Quick-length buttons up top,
            then the full picker via "Begin contemplation". */}
        <div
          className="rounded-2xl p-4"
          style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)" }}
        >
          <div className="grid grid-cols-3 gap-3 mb-3">
            {QUICK_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => start(m)}
                className="rounded-xl py-3 transition-opacity hover:opacity-90 active:scale-[0.98]"
                style={{
                  background: "rgba(46,107,64,0.20)",
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: WARM, fontFamily: SPACE_GROTESK, fontSize: 16, fontWeight: 600, cursor: "pointer",
                }}
              >
                {m}
                <span className="block text-[11px] font-normal mt-0.5" style={{ color: SAGE }}>{t("contemplation.min")}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => start(getDefaultContemplationMinutes() || undefined)}
            className="w-full rounded-xl py-3.5 text-center transition-opacity hover:opacity-90 active:scale-[0.99]"
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
            {t("contemplation.begin")}
          </button>
        </div>

        <p className="text-[12px] mt-4 text-center" style={{ color: "rgba(143,175,150,0.6)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
          {t("contemplation.caption")}
        </p>

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
              <StatTile label={t("contemplation.label_today")} value={humanMinutes(stats?.todaySeconds ?? 0)} />
              <StatTile label={t("contemplation.label_this_week")} value={humanMinutes(stats?.weekSeconds ?? 0)} />
              <StatTile label={t("contemplation.label_all_time")} value={humanMinutes(stats?.totalSeconds ?? 0)} />
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
                {[5, 10, 15, 20, 30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setLogMinutes(m)}
                    className="rounded-lg py-2 text-sm transition-opacity hover:opacity-90"
                    style={{
                      background: logMinutes === m ? "rgba(46,107,64,0.38)" : "rgba(46,107,64,0.12)",
                      border: `1px solid ${logMinutes === m ? "rgba(46,107,64,0.7)" : "rgba(46,107,64,0.3)"}`,
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
                  min={1}
                  max={720}
                  value={logMinutes}
                  onChange={(e) => setLogMinutes(Math.max(1, Math.min(720, parseInt(e.target.value || "0", 10) || 0)))}
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
                  disabled={logMutation.isPending || logMinutes < 1}
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
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  s={s}
                  onDelete={() => deleteMutation.mutate(s.id)}
                  deleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
        )}
      </div>

      <ContemplationTimer
        open={timerOpen}
        startMinutes={startMinutes}
        onClose={() => { setTimerOpen(false); setStartMinutes(undefined); }}
      />
    </Layout>
  );
}
