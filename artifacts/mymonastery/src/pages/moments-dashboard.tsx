import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO, addDays, startOfDay, isToday, isBefore } from "date-fns";

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
  intercession: "🙏",
  breath_together: "🌬️",
  contemplative_sit: "🌿",
  walk_together: "🚶",
  morning_coffee: "☕",
  custom: "✨",
  breath: "🌬️",
  contemplative: "🌿",
  walk: "🚶",
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
  members: { name: string | null; email: string }[];
  todayPostCount: number;
  windowOpen: boolean;
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

function MomentCard({ moment }: { moment: MomentData }) {
  const emoji = TEMPLATE_EMOJI[moment.templateType ?? "custom"] ?? "✨";
  const shouldPulse = moment.windowOpen && moment.todayPostCount === 0;
  const memberNames = moment.members
    .filter(m => m.email !== undefined)
    .slice(0, 5)
    .map(m => (m.name ?? m.email).split(" ")[0])
    .join(", ");

  const subtitle = memberNames ? `with ${memberNames}` : moment.intention;

  const isMorningPrayer = moment.templateType === "morning-prayer";
  const isIntercession = moment.templateType === "intercession";
  const href = (shouldPulse && isMorningPrayer && moment.myUserToken)
    ? `/morning-prayer/${moment.id}/${moment.myUserToken}`
    : (shouldPulse && isIntercession && moment.momentToken && moment.myUserToken)
    ? `/moment/${moment.momentToken}/${moment.myUserToken}`
    : `/moments/${moment.id}`;

  const nextWindow = !moment.windowOpen ? nextWindowDate(moment) : null;
  const nextLabel = nextWindow
    ? (moment.frequency === "daily" ? "Tomorrow" : format(nextWindow, "EEE"))
    : null;

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
              <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{emoji} {moment.name}</span>
            </div>
            {moment.currentStreak > 0 && (
              <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
                {moment.currentStreak} day streak
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <p className="text-sm" style={{ color: "#8FAF96" }}>{subtitle}</p>
            {shouldPulse && (
              <span className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                Open
              </span>
            )}
            {!shouldPulse && moment.todayPostCount > 0 && nextLabel && (
              <span className="text-xs shrink-0" style={{ color: "#8FAF96" }}>Next Prayer {nextLabel}</span>
            )}
            {!shouldPulse && moment.todayPostCount === 0 && nextLabel && (
              <span className="text-xs shrink-0" style={{ color: "#8FAF96" }}>{nextLabel}</span>
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
  const endOfWeek = addDays(startOfDay(new Date()), 7);
  const todayMoments: MomentData[] = [];
  const weekMoments: MomentData[] = [];
  const monthMoments: MomentData[] = [];

  for (const m of moments) {
    if (m.windowOpen) {
      todayMoments.push(m);
    } else {
      const next = nextWindowDate(m);
      if (isToday(next)) {
        todayMoments.push(m);
      } else if (isBefore(next, endOfWeek)) {
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
          <h1 className="text-2xl font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>Practices 🙏</h1>
          <p className="text-sm italic mt-1" style={{ color: "#8FAF96" }}>For the distance between gatherings</p>
        </div>

        <div className="my-5 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />

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
                  {todayMoments.map(m => <MomentCard key={m.id} moment={m} />)}
                </div>
              </>
            )}
            {weekMoments.length > 0 && (
              <>
                <SectionHeader label="This Week" />
                <div className="space-y-3 mb-2">
                  {weekMoments.map(m => <MomentCard key={m.id} moment={m} />)}
                </div>
              </>
            )}
            {monthMoments.length > 0 && (
              <>
                <SectionHeader label="This Month" />
                <div className="space-y-3">
                  {monthMoments.map(m => <MomentCard key={m.id} moment={m} />)}
                </div>
              </>
            )}
          </motion.div>
        )}
      </div>

      {/* Floating + FAB */}
      <Link
        href="/moment/new"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "#1A4A2E", color: "#F0EDE6" }}
        aria-label="New practice"
      >
        <Plus size={24} />
      </Link>
    </Layout>
  );
}
