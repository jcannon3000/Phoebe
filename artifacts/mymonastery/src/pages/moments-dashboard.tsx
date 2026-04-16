import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(scheduledTime: string): string {
  const [h, m] = scheduledTime.split(":").map(Number);
  return new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const DAY_NAMES: Record<string, string> = {
  MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday",
  FR: "Friday", SA: "Saturday", SU: "Sunday",
};

function scheduleLabel(m: MomentData): string {
  const time = formatTime(m.scheduledTime);
  if (m.frequency === "daily") return `Every day at ${time}`;
  if (m.frequency === "weekly" && m.dayOfWeek) return `Every ${DAY_NAMES[m.dayOfWeek] ?? m.dayOfWeek} at ${time}`;
  if (m.frequency === "weekly") return `Weekly at ${time}`;
  return `Monthly at ${time}`;
}

function nextWindowDate(m: MomentData): Date {
  const now = new Date();
  const [h, mi] = m.scheduledTime.split(":").map(Number);
  if (m.frequency === "daily") {
    const t = new Date(); t.setHours(h, mi, 0, 0);
    if (t > now) return t;
    t.setDate(t.getDate() + 1); return t;
  }
  if (m.frequency === "weekly" && m.dayOfWeek) {
    const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const target = dayMap[m.dayOfWeek] ?? 1;
    const t = new Date(); t.setHours(h, mi, 0, 0);
    let diff = (target - t.getDay() + 7) % 7;
    if (diff === 0 && t <= now) diff = 7;
    t.setDate(t.getDate() + diff); return t;
  }
  const t = new Date(); t.setHours(h, mi, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 30);
  return t;
}

// ─── Types ────────────────────────────────────────────────────────────────────

const TEMPLATE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  morning_prayer: "🌅",
  evening_prayer: "🌙",
  intercession: "🙏🏽",
  breath_together: "🌬️",
  contemplative_sit: "🌿",
  walk_together: "🚶🏽",
  morning_coffee: "☕",
  custom: "✨",
  breath: "🌬️",
  contemplative: "🌿",
  walk: "🚶🏽",
  listening: "🎵",
};

interface MomentData {
  id: number;
  name: string;
  intention: string;
  frequency: string;
  scheduledTime: string;
  dayOfWeek?: string | null;
  currentStreak: number;
  longestStreak: number;
  totalBlooms: number;
  state: string;
  memberCount: number;
  members: { name: string | null; email: string; joined?: boolean }[];
  todayPostCount: number;
  windowOpen: boolean;
  isActionableToday: boolean;
  minutesLeft: number;
  momentToken: string;
  myUserToken: string | null;
  latestWindow: { status: string; postCount: number } | null;
  templateType?: string | null;
  goalDays?: number | null;
  commitmentSessionsGoal?: number | null;
  commitmentSessionsLogged?: number | null;
  commitmentTendFreely?: boolean | null;
  frequencyType?: string | null;
  frequencyDaysPerWeek?: number | null;
  practiceDays?: string | null;
  listeningTitle?: string | null;
  listeningArtist?: string | null;
}

const SPIRITUAL_TEMPLATE_IDS_DASH = new Set(["morning-prayer", "evening-prayer", "intercession", "breath", "contemplative", "walk", "listening", "custom"]);
const BCP_TEMPLATE_IDS_DASH = new Set(["morning-prayer", "evening-prayer"]);

// ─── BCP week tracking helper ─────────────────────────────────────────────────
function bcpWeeksLabel(streak: number): string {
  if (streak < 7) return `${streak} day${streak !== 1 ? "s" : ""} prayed`;
  const weeks = Math.floor(streak / 7);
  return `${weeks} week${weeks !== 1 ? "s" : ""} together`;
}

// ─── Moment Card (matches dashboard BarCard style) ───────────────────────────

const FULL_DAY: Record<string, string> = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };

// Strip trailing emoji so we never double-up when the stored name already has one.
function stripTrailingEmoji(s: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return s.replace(/[\s\u200d]*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component})+$/u, "").trim();
}

function MomentCard({ moment, userEmail }: { moment: MomentData; userEmail: string }) {
  const emoji = TEMPLATE_EMOJI[moment.templateType ?? "custom"] ?? "✨";
  const shouldPulse = moment.windowOpen && moment.todayPostCount === 0;
  const memberNames = moment.members
    .filter(m => m.email !== userEmail)
    .slice(0, 5)
    .map(m => (m.name ?? m.email).split(" ")[0])
    .join(", ");

  const subtitle = memberNames ? `with ${memberNames}` : moment.intention;

  const isIntercession = moment.templateType === "intercession";
  const isMorningPrayer = moment.templateType === "morning-prayer";
  const href = (shouldPulse && isMorningPrayer && moment.myUserToken)
    ? `/morning-prayer/${moment.id}/${moment.myUserToken}`
    : (shouldPulse && isIntercession && moment.momentToken && moment.myUserToken)
    ? `/moment/${moment.momentToken}/${moment.myUserToken}`
    : `/moments/${moment.id}`;

  // For custom intercessions, show the intention ("Prayers for my niece")
  // instead of the generic stored name ("Intercession 🙏🏽"). Matches dashboard.
  const displayName = (() => {
    if (isIntercession && moment.intention) {
      const norm = (s: string) => s.trim().toLowerCase();
      const hasMeaningfulTopic =
        (moment as Record<string, unknown>).intercessionTopic &&
        norm(String((moment as Record<string, unknown>).intercessionTopic)) !== norm(moment.name) &&
        norm(String((moment as Record<string, unknown>).intercessionTopic)) !== norm(moment.intention);
      if (!hasMeaningfulTopic) return moment.intention;
    }
    return stripTrailingEmoji(moment.name);
  })();

  const nextWindow = !moment.windowOpen ? nextWindowDate(moment) : null;
  const freqLabel = moment.frequency === "daily" ? "Daily" : moment.frequency === "monthly" ? "Monthly" : "Weekly";
  const nextDayAbbr = nextWindow ? format(nextWindow, "EEE") : null;
  const nextDayFull = nextDayAbbr ? (FULL_DAY[nextDayAbbr] ?? nextDayAbbr) : null;
  const nextLabel = nextWindow
    ? (moment.frequency === "daily" ? "Tomorrow" : nextDayFull)
    : null;
  const secondLine = shouldPulse ? subtitle : nextLabel ? `${freqLabel} · Next prayer ${nextLabel.toLowerCase()}` : subtitle;

  return (
    <Link href={href} className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${shouldPulse ? "animate-turn-pulse-practices" : ""}`}
        style={{
          background: "#0F2818",
          border: `1px solid rgba(46,107,64,${shouldPulse ? "0.5" : "0.25"})`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className={`w-1 flex-shrink-0 ${shouldPulse ? "animate-bar-pulse-practices" : ""}`}
          style={{ background: shouldPulse ? undefined : "#2E6B40" }}
        />
        <div className="flex-1 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{emoji} {displayName}</span>
            </div>
            {moment.currentStreak > 0 && (
              <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
                {moment.currentStreak} day streak
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <p className="text-sm truncate" style={{ color: "#8FAF96" }}>{secondLine}</p>
            {shouldPulse && (
              <span className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                Pray 🙏🏽
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MomentsDashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest<{ moments: MomentData[] }>("GET", "/api/moments"),
    enabled: !!user,
  });

  // Only group admins get the "+" FAB — creating a practice belongs to the
  // admin role, not general membership.
  const { data: groupsData } = useQuery<{ groups: Array<{ myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });
  const isAdminOfAnyGroup = (groupsData?.groups ?? []).some(g => g.myRole === "admin");

  // On-demand Apple Music check for listening practices where someone hasn't logged
  const amCheckedRef = useRef(false);
  useEffect(() => {
    if (!data || amCheckedRef.current) return;
    amCheckedRef.current = true;
    const listening = (data.moments ?? []).filter(
      m => m.templateType === "listening" && m.todayPostCount < m.memberCount
    );
    if (listening.length === 0) return;
    Promise.all(
      listening.map(m =>
        apiRequest<{ newLogs: number }>("POST", `/api/apple-music/check-now/${m.id}`, {}).catch(() => ({ newLogs: 0 }))
      )
    ).then(results => {
      if (results.some(r => r.newLogs > 0)) {
        qc.invalidateQueries({ queryKey: ["/api/moments"] });
      }
    });
  }, [data, qc]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  const moments: MomentData[] = data?.moments ?? [];

  // ── Time bucket bucketing ─────────────────────────────────────────────────
  // Server-side `isActionableToday` is the single source of truth. This
  // mirrors dashboard.tsx so the home page and /practices agree. We keep the
  // `monthMoments` array for the rendering code below but it stays empty —
  // every practice is either actionable today or upcoming this week.
  const todayMoments: MomentData[] = [];
  const weekMoments: MomentData[] = [];
  const monthMoments: MomentData[] = [];

  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  for (const m of moments) {
    if (m.isActionableToday && m.todayPostCount === 0) {
      todayMoments.push(m);
    } else {
      const next = nextWindowDate(m);
      if (next <= sevenDaysFromNow) {
        weekMoments.push(m);
      } else {
        monthMoments.push(m);
      }
    }
  }

  function SectionHeader({ label }: { label: string }) {
    return (
      <div className="flex items-center gap-3 mb-3 mt-6 first:mt-0">
        <span className="text-xs font-semibold uppercase tracking-widest shrink-0" style={{ color: "rgba(200,212,192,0.45)" }}>
          {label}
        </span>
        <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />
      </div>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-20">
        {/* Header */}
        <div className="mb-2">
          <Link href="/dashboard" className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>Practices 🙏🏽</h1>
          <p className="text-sm italic mt-1" style={{ color: "#8FAF96" }}>For the distance between gatherings</p>
        </div>

        {/* Start a new practice — template shortcuts */}
        <div className="mt-4 mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: "rgba(200,212,192,0.45)" }}>
            Start a new
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "🙏🏽 Group Intercession", template: "intercession" },
              { label: "📜 Lectio Divina", template: "lectio-divina" },
              { label: "🌿 Fast", template: "fasting" },
            ].map((t) => (
              <Link
                key={t.template}
                href={`/moment/new?template=${t.template}`}
                className="inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-opacity hover:opacity-80"
                style={{
                  background: "rgba(46,107,64,0.14)",
                  color: "#6B9E6E",
                  border: "1px solid rgba(46,107,64,0.28)",
                }}
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="my-4 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.15)" }} />
            ))}
          </div>
        ) : moments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="text-4xl mb-4">🌱</div>
            <p className="mb-2 font-medium" style={{ color: "#F0EDE6" }}>No practices yet</p>
            <p className="text-sm mb-8" style={{ color: "#8FAF96" }}>Plant a spiritual practice that you and someone you love do together — even across the distance.</p>
            <Link
              href="/moment/new"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              🌿 Plant your first practice
            </Link>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {todayMoments.length > 0 && (
              <>
                <SectionHeader label="Today" />
                <div className="space-y-3 mb-2">
                  {todayMoments.map(m => <MomentCard key={m.id} moment={m} userEmail={user.email} />)}
                </div>
              </>
            )}
            {weekMoments.length > 0 && (
              <>
                <SectionHeader label="This Week" />
                <div className="space-y-3 mb-2">
                  {weekMoments.map(m => <MomentCard key={m.id} moment={m} userEmail={user.email} />)}
                </div>
              </>
            )}
            {monthMoments.length > 0 && (
              <>
                <SectionHeader label="This Month" />
                <div className="space-y-3">
                  {monthMoments.map(m => <MomentCard key={m.id} moment={m} userEmail={user.email} />)}
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>

      {/* Floating + FAB — admins only */}
      {isAdminOfAnyGroup && (
        <Link
          href="/moment/new"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
          style={{ background: "#1A4A2E", color: "#F0EDE6" }}
          aria-label="New practice"
        >
          <Plus size={24} />
        </Link>
      )}
    </Layout>
  );
}
