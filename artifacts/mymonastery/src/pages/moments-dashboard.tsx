import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { milestoneLabel, milestoneProgress } from "@/lib/utils";
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

// ─── Moment Card ─────────────────────────────────────────────────────────────

function MomentCard({ moment }: { moment: MomentData }) {
  const memberNames = moment.members
    .slice(0, 3)
    .map(m => (m.name ?? m.email).split(" ")[0])
    .join(", ");
  const extraMembers = moment.members.length > 3 ? ` +${moment.members.length - 3}` : "";
  const nextWindow = !moment.windowOpen ? nextWindowDate(moment) : null;
  const templateEmoji = TEMPLATE_EMOJI[moment.templateType ?? "custom"] ?? "✨";
  const sessionsGoal = moment.commitmentSessionsGoal ?? null;
  const sessionsLogged = moment.commitmentSessionsLogged ?? 0;
  const tendFreely = moment.commitmentTendFreely ?? false;
  const hasSessionGoal = sessionsGoal !== null && sessionsGoal > 0 && !tendFreely;
  const hasGoal = hasSessionGoal || (moment.goalDays ?? 0) > 0;
  const mLabel = hasSessionGoal
    ? (sessionsLogged >= sessionsGoal ? `🌸 Goal reached!` : `🌿 ${sessionsLogged} of ${sessionsGoal}`)
    : milestoneLabel(moment.currentStreak);
  const mProgress = hasSessionGoal
    ? Math.min(sessionsLogged / sessionsGoal, 1)
    : milestoneProgress(moment.currentStreak);
  const isSpiritual = SPIRITUAL_TEMPLATE_IDS_DASH.has(moment.templateType ?? "");
  const isBcp = BCP_TEMPLATE_IDS_DASH.has(moment.templateType ?? "");
  const bcpPage = moment.templateType === "morning-prayer" ? "75" : "115";
  const isMorning = moment.templateType === "morning-prayer";

  return (
    <Link href={`/moments/${moment.id}`}>
      <motion.div
        whileHover={{ y: -1 }}
        className={`relative flex rounded-2xl overflow-hidden border transition-all duration-200 ${
          moment.windowOpen
            ? isBcp
              ? isMorning
                ? "border-[#C8975A]/60 shadow-[0_0_18px_rgba(200,151,90,0.18)]"
                : "border-[#4A7FB5]/60 shadow-[0_0_18px_rgba(74,127,181,0.18)]"
              : isSpiritual
                ? "border-[#4A7FB5]/60 shadow-[0_0_18px_rgba(74,127,181,0.18)]"
                : "border-[#4A7FB5]/60 shadow-[0_0_18px_rgba(74,127,181,0.18)]"
            : "border-[rgba(74,127,181,0.25)] hover:shadow-md"
        }`}
        style={{ background: "#0F2818" }}
      >
        {/* Left accent bar */}
        <div className={`w-1.5 flex-shrink-0 ${
          moment.windowOpen
            ? isBcp
              ? isMorning ? "bg-[#C8975A] animate-pulse" : "bg-[#4A7FB5] animate-pulse"
              : "bg-[#4A7FB5] animate-pulse"
            : isBcp ? (isMorning ? "bg-[#C8975A]" : "bg-[#4A7FB5]") : "bg-[#4A7FB5]"
        }`} />

        <div className="flex-1 p-4">
          {/* Top row */}
          <div className="flex items-start gap-2 mb-1">
            <span className="text-xl leading-none mt-0.5">{templateEmoji}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-base font-semibold leading-snug" style={{ color: "#F0EDE6" }}>{moment.name}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isBcp && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: "#4A7FB5", background: "rgba(74,127,181,0.12)", border: "1px solid rgba(74,127,181,0.25)" }}>
                      Daily Office
                    </span>
                  )}
                  {moment.windowOpen && (
                    isBcp ? (
                      <span className={`text-[11px] font-bold uppercase tracking-wide ${isMorning ? "text-[#C8975A]" : "text-[#4A7FB5]"}`}>
                        {isMorning ? "Morning 🌅" : "Evening 🌙"}
                      </span>
                    ) : isSpiritual ? (
                      <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#4A7FB5" }}>
                        Practice day 🌿
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold uppercase tracking-wide animate-pulse" style={{ color: "#4A7FB5" }}>
                        Open now
                      </span>
                    )
                  )}
                </div>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>with {memberNames}{extraMembers}</p>
            </div>
          </div>

          {/* BCP page reference */}
          {isBcp && (
            <p className="text-xs font-medium mb-1.5" style={{ color: "#8FAF96" }}>
              📖 Page {bcpPage} · {isMorning ? "Morning Prayer Rite II" : "Evening Prayer Rite II"}
            </p>
          )}

          {/* Intention (skip for BCP — page ref is more useful) */}
          {!isBcp && moment.templateType === "listening" && moment.listeningTitle ? (
            <p className="text-sm mb-2 line-clamp-1" style={{ color: "#A8C5A0" }}>
              {moment.listeningTitle}{moment.listeningArtist ? ` · ${moment.listeningArtist}` : ""}
            </p>
          ) : !isBcp && (
            <p className="text-sm italic font-serif mb-2 line-clamp-1" style={{ color: "rgba(240,237,230,0.65)" }}>"{moment.intention}"</p>
          )}

          {/* Time info */}
          {moment.windowOpen ? (
            isBcp ? (
              <p className="text-sm font-medium mb-2" style={{ color: isMorning ? "#C8975A" : "#4A7FB5" }}>
                {moment.todayPostCount} of {moment.memberCount} prayed today
              </p>
            ) : moment.templateType === "listening" ? (
              <p className="text-sm mb-2 line-clamp-2" style={{ color: "#A8C5A0" }}>
                A {moment.frequency === "daily" ? "daily" : "weekly"} practice of listening to{" "}
                <span className="font-medium">{moment.listeningTitle ?? moment.listeningArtist ?? "music"}</span> together
              </p>
            ) : isSpiritual ? (
              <p className="text-sm font-medium mb-2" style={{ color: "#4A7FB5" }}>
                {moment.todayPostCount} of {moment.memberCount} practiced today
              </p>
            ) : (
              <p className="text-sm font-medium mb-2" style={{ color: "#4A7FB5" }}>
                {moment.minutesLeft} min left · {moment.todayPostCount} of {moment.memberCount} posted
              </p>
            )
          ) : moment.templateType === "listening" ? (
            <p className="text-sm mb-2 line-clamp-2" style={{ color: "#A8C5A0" }}>
              A {moment.frequency === "daily" ? "daily" : "weekly"} practice of listening to{" "}
              <span className="font-medium">{moment.listeningTitle ?? moment.listeningArtist ?? "music"}</span> together
            </p>
          ) : (
            <p className="text-xs mb-2" style={{ color: "rgba(143,175,150,0.7)" }}>
              {isBcp || isSpiritual
                ? nextWindow ? `Next practice: ${format(nextWindow, "EEE")}` : scheduleLabel(moment)
                : nextWindow ? `Next: ${format(nextWindow, "EEE h:mm a")}` : scheduleLabel(moment)
              }
            </p>
          )}

          {/* BCP streak / weeks together */}
          {isBcp ? (
            <div className="flex items-center gap-3">
              {moment.currentStreak > 0 && (
                <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.7)" }}>
                  🌿 {bcpWeeksLabel(moment.currentStreak)}
                </span>
              )}
              {moment.todayPostCount > 0 && moment.memberCount > 1 && (
                <span className="text-[11px]" style={{ color: "rgba(74,127,181,0.8)" }}>
                  · {moment.todayPostCount} of {moment.memberCount} this week
                </span>
              )}
            </div>
          ) : hasGoal ? (
            <div className="mt-1">
              <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.8)" }}>{mLabel}</span>
              <div className="mt-1 w-full h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(74,127,181,0.2)" }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.round(mProgress * 100)}%`, background: "#4A7FB5" }} />
              </div>
            </div>
          ) : (
            moment.currentStreak > 0 && (
              <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.7)" }}>🌿 {moment.currentStreak} in a row</span>
            )
          )}
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
      <div className="pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <Link href="/dashboard" className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>Practices 🙏</h1>
            <p className="text-sm italic mt-1" style={{ color: "#8FAF96" }}>For the distance between gatherings</p>
          </div>
          <Link
            href="/moment/new"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-medium text-sm transition-opacity hover:opacity-80"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            + New
          </Link>
        </div>

        <div className="my-5 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: "#0F2818", border: "1px solid rgba(74,127,181,0.15)" }} />
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
    </Layout>
  );
}
