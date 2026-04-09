import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useListRituals } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout";
import { PrayerSection } from "@/components/prayer-section";
import { apiRequest } from "@/lib/queryClient";
import { format, isToday, parseISO, addDays, isBefore, startOfDay } from "date-fns";

// ─── Shared types ─────────────────────────────────────────────────────────────

type Correspondence = {
  id: number;
  name: string;
  groupType: string;
  unreadCount: number;
  members: Array<{ name: string | null; email: string; homeCity: string | null }>;
  recentPostmarks: Array<{ authorName: string; city: string; sentAt: string }>;
  currentPeriod: {
    periodNumber: number;
    periodLabel: string;
    hasWrittenThisPeriod: boolean;
    isLastThreeDays: boolean;
    membersWritten: Array<{ name: string; hasWritten: boolean }>;
  };
};

type Moment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  currentStreak: number;
  totalBlooms: number;
  state: string;
  memberCount: number;
  members: Array<{ name: string; email: string }>;
  todayPostCount: number;
  windowOpen: boolean;
  intercessionTopic?: string | null;
  fastingFrom?: string | null;
  myUserToken: string | null;
  momentToken: string | null;
  frequency: string;
  dayOfWeek: string | null;
  practiceDays: string | null;
  timeOfDay: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nextDayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  const tomorrow = addDays(startOfDay(new Date()), 1);
  if (startOfDay(date).getTime() === tomorrow.getTime()) return "Tomorrow";
  return format(date, "EEEE");
}

const DOW_LC: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
const RRULE_DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DAY_NAMES: Record<number, string> = { 0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday" };

function nextWindowLabel(m: Pick<Moment, "frequency" | "dayOfWeek" | "practiceDays" | "timeOfDay">): string {
  if (m.frequency === "daily") return "Tomorrow";
  if (m.frequency === "monthly") return "Next month";
  // weekly — find next matching day
  let rawDays: string[] = [];
  try { rawDays = m.practiceDays ? (JSON.parse(m.practiceDays) as string[]) : []; } catch { /* */ }
  if (!rawDays.length && m.dayOfWeek) rawDays = [m.dayOfWeek];
  const today = new Date().getDay();
  for (let i = 1; i <= 7; i++) {
    const check = (today + i) % 7;
    const match = rawDays.some(d => {
      const up = d.toUpperCase();
      if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === check;
      return DOW_LC[d.toLowerCase()] === check;
    });
    if (match) return i === 1 ? "Tomorrow" : DAY_NAMES[check] ?? "Next week";
  }
  return "Next week";
}

const CARD_BASE = "background: #0F2818; border: 1px solid rgba(200, 212, 192, 0.25); box-shadow: 0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)";

const PRACTICE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  "intercession": "🙏",
  "contemplative": "🕯️",
  "fasting": "🌿",
  "listening": "🎵",
  "custom": "🌱",
};

// ─── Reusable card sub-components ────────────────────────────────────────────

// The bar-style card used everywhere (left accent strip, optional pulse)
function BarCard({
  href,
  pulse,
  children,
}: {
  href: string;
  pulse: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${pulse ? "animate-turn-pulse" : ""}`}
        style={{ background: "#0F2818", border: "1px solid rgba(200, 212, 192, 0.25)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
      >
        <div
          className={`w-1 flex-shrink-0 ${pulse ? "animate-bar-pulse" : ""}`}
          style={{ background: pulse ? undefined : "#5C8A5F" }}
        />
        <div className="flex-1 px-4 py-3">
          {children}
        </div>
      </motion.div>
    </Link>
  );
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

function FAB() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2 mb-1"
          >
            <button
              onClick={() => { setOpen(false); setLocation("/moment/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#0F2818", border: "1px solid rgba(200,212,192,0.25)", minWidth: 220, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🌱 Start a practice</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>Letters, prayer, fasting & more</p>
            </button>
            <button
              onClick={() => { setOpen(false); setLocation("/tradition/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#0F2818", border: "1px solid rgba(200,212,192,0.25)", minWidth: 220, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🕯️ Start a gathering</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>Meet together regularly</p>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "#1A4A2E", color: "#F0EDE6" }}
      >
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
          {open ? <X size={24} /> : <Plus size={24} />}
        </motion.div>
      </button>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
    </div>
  );
}

// ─── Letter card (reused in Today, This week, and Practices) ─────────────────

function LetterCard({
  c,
  userEmail,
  userName,
  keyPrefix,
}: {
  c: Correspondence;
  userEmail: string;
  userName: string;
  keyPrefix: string;
}) {
  const isOneToOne = c.groupType === "one_to_one";
  const otherMembers = c.members
    .filter(m => m.email !== userEmail)
    .map(m => m.name || m.email.split("@")[0])
    .join(", ");
  const displayName = (c.name?.replace(/^Letters with\b/, "Dialogue with")) ||
    (isOneToOne ? `Dialogue with ${otherMembers}` : `Sharing with ${otherMembers}`);

  const iWrote = c.currentPeriod.membersWritten.find(m => m.name === userName)?.hasWritten ?? false;
  const theyWrote = c.currentPeriod.membersWritten.find(m => m.name !== userName)?.hasWritten ?? false;
  const hasUnread = c.unreadCount > 0;
  const needsWrite = !iWrote;
  const shouldPulse = needsWrite || hasUnread;

  let statusText = "";
  let statusColor = "#8FAF96";
  if (hasUnread) {
    statusText = `${otherMembers} wrote 🌿`;
    statusColor = "#F0EDE6";
  } else if (iWrote && !theyWrote) {
    statusText = isOneToOne ? `Waiting for ${otherMembers}... 🌿` : `Your update is in 🌿`;
    statusColor = "#8FAF96";
  } else if (needsWrite) {
    statusText = isOneToOne ? `Your turn to write 🖋️` : `Share your update 🖋️`;
    statusColor = "#F0EDE6";
  } else {
    statusText = "All written 🌿";
    statusColor = "#8FAF96";
  }

  return (
    <BarCard key={`${keyPrefix}-${c.id}`} href={`/letters/${c.id}`} pulse={shouldPulse}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
            📮 {displayName}
          </span>
          {hasUnread && (
            <span className="ml-2 inline-block w-2 h-2 rounded-full align-middle" style={{ background: "#C8D4C0" }} />
          )}
        </div>
        <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
          {isOneToOne ? `Letter ${c.currentPeriod.periodNumber}` : `Week ${c.currentPeriod.periodNumber}`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <p className="text-sm font-medium" style={{ color: statusColor }}>{statusText}</p>
        {needsWrite && (
          <Link href={`/letters/${c.id}/write`} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <span className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
              Write 🖋️
            </span>
          </Link>
        )}
      </div>
    </BarCard>
  );
}

// ─── Moment card (reused in Today and Practices) ──────────────────────────────

function MomentCard({ m, userEmail, keyPrefix, nextWindow }: { m: Moment; userEmail: string; keyPrefix: string; nextWindow?: string }) {
  const emoji = PRACTICE_EMOJI[m.templateType || "custom"] || "🌱";
  const shouldPulse = m.windowOpen && m.todayPostCount === 0;
  const memberNames = m.members
    .filter(p => p.email !== userEmail)
    .map(p => p.name || p.email.split("@")[0])
    .slice(0, 5)
    .join(", ");

  let subtitle = "";
  if (memberNames) subtitle = `with ${memberNames}`;
  else if (m.fastingFrom) subtitle = `Fasting from ${m.fastingFrom}`;

  const isMorningPrayer = m.templateType === "morning-prayer";
  const isIntercession = m.templateType === "intercession";
  const openHref = (shouldPulse && isMorningPrayer && m.myUserToken)
    ? `/morning-prayer/${m.id}/${m.myUserToken}`
    : (shouldPulse && isIntercession && m.momentToken && m.myUserToken)
    ? `/moment/${m.momentToken}/${m.myUserToken}`
    : `/moments/${m.id}`;

  return (
    <BarCard key={`${keyPrefix}-${m.id}`} href={openHref} pulse={shouldPulse}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{emoji} {m.name}</span>
        </div>
        {m.currentStreak > 0 && (
          <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
            {m.currentStreak} day streak
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5">
        <p className="text-sm" style={{ color: "#8FAF96" }}>{subtitle || m.intention}</p>
        {m.windowOpen && m.todayPostCount === 0 && (
          <span className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
            Open
          </span>
        )}
        {nextWindow && (
          <span className="text-xs shrink-0" style={{ color: "#8FAF96" }}>Next Prayer {nextWindow}</span>
        )}
        {!nextWindow && m.todayPostCount > 0 && (
          <span className="text-xs shrink-0" style={{ color: "#8FAF96" }}>{m.todayPostCount} today 🌿</span>
        )}
      </div>
    </BarCard>
  );
}

// ─── Gathering card (reused in Today, This week, Gatherings) ─────────────────

function GatheringCard({ r, keyPrefix, badge }: { r: any; keyPrefix: string; badge?: string }) {
  const next = r.nextMeetupDate ? parseISO(r.nextMeetupDate) : null;
  const rhythm = r.rhythm as string | undefined;
  const rhythmLabel = rhythm === "weekly" ? "weekly tradition"
    : rhythm === "biweekly" || rhythm === "fortnightly" ? "biweekly tradition"
    : rhythm === "monthly" ? "monthly tradition"
    : r.frequency ? `${r.frequency} tradition` : "recurring tradition";
  const participants: Array<any> = r.participants ?? [];

  return (
    <BarCard key={`${keyPrefix}-${r.id}`} href={`/ritual/${r.id}`} pulse={false}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{r.name}</span>
        {badge ? (
          <span className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0" style={{ background: "rgba(45,94,63,0.4)", color: "#A8C5A0", border: "1px solid rgba(168,197,160,0.3)" }}>
            {badge}
          </span>
        ) : (
          <span className="text-[11px] shrink-0" style={{ color: "#8FAF96" }}>{rhythmLabel}</span>
        )}
      </div>
      {participants.length > 0 && (
        <p className="text-sm mb-1" style={{ color: "#8FAF96" }}>
          with {participants.slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ")}
          {participants.length > 3 && ` +${participants.length - 3}`}
        </p>
      )}
      {next && (
        <p className="text-sm" style={{ color: "#8FAF96" }}>
          {badge ? format(next, "h:mm a") : `${nextDayLabel(next)} · ${format(next, "h:mm a")}`}
          {r.location && <> · {r.location}</>}
        </p>
      )}
      {r.intercessionIntention && (
        <p className="text-xs mt-1" style={{ color: "#8FAF96" }}>🙏 Praying for {r.intercessionIntention}</p>
      )}
      {r.fastingDescription && (
        <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>🌿 Fasting together</p>
      )}
    </BarCard>
  );
}

// ─── Today Section ────────────────────────────────────────────────────────────

function TodaySection({
  letters, moments, gatherings, userEmail, userName,
}: {
  letters: Correspondence[]; moments: Moment[]; gatherings: any[]; userEmail: string; userName: string;
}) {
  if (letters.length === 0 && moments.length === 0 && gatherings.length === 0) return null;
  return (
    <div className="mb-8">
      <SectionHeader label="Today" />
      <div className="space-y-6">
        {letters.map(c => <LetterCard key={`today-l-${c.id}`} c={c} userEmail={userEmail} userName={userName} keyPrefix="today" />)}
        {moments.map(m => <MomentCard key={`today-m-${m.id}`} m={m} userEmail={userEmail} keyPrefix="today" />)}
        {gatherings.map(r => <GatheringCard key={`today-g-${r.id}`} r={r} keyPrefix="today" badge="Today" />)}
      </div>
    </div>
  );
}

// ─── This Week Section ────────────────────────────────────────────────────────

function ThisWeekSection({
  letters, moments, gatherings, userEmail, userName,
}: {
  letters: Correspondence[]; moments: Moment[]; gatherings: any[]; userEmail: string; userName: string;
}) {
  if (letters.length === 0 && moments.length === 0 && gatherings.length === 0) return null;
  return (
    <div className="mb-8">
      <SectionHeader label="This week" />
      <div className="space-y-6">
        {letters.map(c => <LetterCard key={`week-l-${c.id}`} c={c} userEmail={userEmail} userName={userName} keyPrefix="week" />)}
        {moments.map(m => <MomentCard key={`week-m-${m.id}`} m={m} userEmail={userEmail} keyPrefix="week" nextWindow={nextWindowLabel(m)} />)}
        {gatherings.map(r => (
          <GatheringCard key={`week-g-${r.id}`} r={r} keyPrefix="week" badge={format(parseISO(r.nextMeetupDate), "EEEE")} />
        ))}
      </div>
    </div>
  );
}

// ─── Practices Section (letters + moments merged) ─────────────────────────────

function PracticesSection({
  letters, moments, userEmail, userName,
}: {
  letters: Correspondence[]; moments: Moment[]; userEmail: string; userName: string;
}) {
  const hasAny = letters.length > 0 || moments.length > 0;

  return (
    <div className="mb-8">
      <SectionHeader label="Practices 🕯️" />
      {!hasAny ? (
        <div className="rounded-xl p-5 text-center" style={{ background: "transparent", border: "1px dashed rgba(200, 212, 192, 0.25)" }}>
          <p className="text-sm mb-3" style={{ color: "#8FAF96" }}>No practices yet. Start one. 🌱</p>
          <Link href="/moment/new">
            <span className="text-sm font-semibold" style={{ color: "#A8C5A0" }}>Start a practice →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {letters.map(c => <LetterCard key={`practices-l-${c.id}`} c={c} userEmail={userEmail} userName={userName} keyPrefix="practices" />)}
          {moments.map(m => <MomentCard key={`practices-m-${m.id}`} m={m} userEmail={userEmail} keyPrefix="practices" />)}
        </div>
      )}
    </div>
  );
}

// ─── Gatherings Section ───────────────────────────────────────────────────────

function GatheringsSection({ gatherings }: { gatherings: any[] }) {
  return (
    <div className="mb-4">
      <SectionHeader label="Gatherings 🤝" />
      {gatherings.length === 0 ? (
        <div className="rounded-xl p-5 text-center" style={{ background: "transparent", border: "1px dashed rgba(200, 212, 192, 0.25)" }}>
          <p className="text-sm mb-3" style={{ color: "#8FAF96" }}>No gatherings yet. Start one.</p>
          <Link href="/tradition/new">
            <span className="text-sm font-semibold" style={{ color: "#A8C5A0" }}>Start a gathering →</span>
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {gatherings.map(r => <GatheringCard key={`g-${r.id}`} r={r} keyPrefix="g" />)}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();

  const { data: correspondences, isLoading: lettersLoading } = useQuery<Correspondence[]>({
    queryKey: ["/api/letters/correspondences"],
    queryFn: () => apiRequest("GET", "/api/letters/correspondences"),
    enabled: !!user,
  });

  const { data: momentsData, isLoading: momentsLoading } = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
  });

  const { data: rituals, isLoading: ritualsLoading } = useListRituals({ ownerId: user?.id });

  const isLoading = lettersLoading || momentsLoading || ritualsLoading;

  // ── Placement + deduplication ─────────────────────────────────────────────

  const {
    todayLetters, todayMoments, todayGatherings,
    weekLetters, weekMoments, weekGatherings,
    practicesLetters, practicesMoments,
    filteredGatherings,
    totalCount,
  } = useMemo(() => {
    const allLetters = correspondences ?? [];
    const allMoments = momentsData?.moments ?? [];
    const allGatherings = (rituals ?? []) as any[];
    const userEmail = user?.email ?? "";
    const userName = user?.name ?? "";

    const totalCount = allLetters.length + allMoments.length + allGatherings.length;

    // ── Letters: Today = deadline (isLastThreeDays && not yet written)
    //            This week = window open (not yet written) or unread
    //            Practices = everything else
    const todayLetters: Correspondence[] = [];
    const weekLetters: Correspondence[] = [];
    const practicesLetters: Correspondence[] = [];

    for (const c of allLetters) {
      const iWrote = c.currentPeriod.membersWritten.find(m => m.name === userName)?.hasWritten ?? false;
      const hasUnread = c.unreadCount > 0;
      const isDeadline = c.currentPeriod.isLastThreeDays && !iWrote;
      const isOpenTurn = !iWrote && !c.currentPeriod.isLastThreeDays;

      if (isDeadline) {
        todayLetters.push(c);
      } else if (isOpenTurn || hasUnread) {
        weekLetters.push(c);
      } else {
        practicesLetters.push(c);
      }
    }

    // ── Moments: Today = window open & not yet logged
    //            This week = logged today (next window tomorrow/later)
    //            Practices = not open, not logged today
    const todayMoments = allMoments.filter(m => m.windowOpen && m.todayPostCount === 0);
    const todayMomentIds = new Set(todayMoments.map(m => m.id));
    const weekMoments = allMoments.filter(m => !todayMomentIds.has(m.id) && m.todayPostCount > 0);
    const weekMomentIds = new Set(weekMoments.map(m => m.id));
    const practicesMoments = allMoments.filter(m => !todayMomentIds.has(m.id) && !weekMomentIds.has(m.id));

    // ── Gatherings: Today = today; This week = next 7 days; Gatherings = rest
    const endOfWeek = addDays(startOfDay(new Date()), 7);
    const todayGatherings = allGatherings.filter(r => r.nextMeetupDate && isToday(parseISO(r.nextMeetupDate)));
    const todayGatheringIds = new Set(todayGatherings.map(r => r.id));
    const weekGatherings = allGatherings.filter(r => {
      if (!r.nextMeetupDate || todayGatheringIds.has(r.id)) return false;
      const d = parseISO(r.nextMeetupDate);
      return isBefore(d, endOfWeek) && !isToday(d);
    });
    const weekGatheringIds = new Set(weekGatherings.map(r => r.id));
    const filteredGatherings = allGatherings.filter(r => !todayGatheringIds.has(r.id) && !weekGatheringIds.has(r.id));

    return {
      todayLetters, todayMoments, todayGatherings,
      weekLetters, weekMoments, weekGatherings,
      practicesLetters, practicesMoments,
      filteredGatherings,
      totalCount,
    };
  }, [correspondences, momentsData, rituals, user]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  const userEmail = user.email;
  const userName = user.name ?? "";

  return (
    <Layout>
      <div className="flex flex-col w-full pb-36">

        {/* ── Header ── */}
        <div className="mb-6">
          <p style={{ color: "#F0EDE6", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            {format(new Date(), "EEEE, d MMMM")}
          </p>
          {totalCount > 0 && (
            <p style={{ color: "#8FAF96", fontSize: "13px", fontWeight: 400 }}>
              {totalCount} {totalCount === 1 ? "thing" : "things"} happening this week
            </p>
          )}
        </div>

        {/* ── Loading skeleton ── */}
        {isLoading && (
          <div className="space-y-6 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            ))}
          </div>
        )}

        {!isLoading && (
          <>
            {/* 1. Today */}
            <TodaySection
              letters={todayLetters}
              moments={todayMoments}
              gatherings={todayGatherings}
              userEmail={userEmail}
              userName={userName}
            />

            {/* 2. This week */}
            <ThisWeekSection
              letters={weekLetters}
              moments={weekMoments}
              gatherings={weekGatherings}
              userEmail={userEmail}
              userName={userName}
            />

            {/* 3. Practices (letters + moments) */}
            <PracticesSection
              letters={practicesLetters}
              moments={practicesMoments}
              userEmail={userEmail}
              userName={userName}
            />

            {/* 4. Gatherings */}
            <GatheringsSection gatherings={filteredGatherings} />
          </>
        )}

        {/* Prayer Requests */}
        <PrayerSection />

        {/* Footer */}
        <p className="text-center text-xs mt-10 mb-4 tracking-wide" style={{ color: "rgba(143, 175, 150, 0.5)" }}>
          A Sanctuary for Fellowship Inspired by Monastic Wisdom
        </p>

        <FAB />
      </div>
    </Layout>
  );
}
