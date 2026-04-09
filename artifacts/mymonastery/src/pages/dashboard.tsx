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

// ─── Category color system ──────────────────────────────────────────────────

type Category = "letters" | "practices" | "gatherings";

const CATEGORY_COLORS: Record<Category, {
  bar: string;
  border: string;
  pulseClass: string;
  barPulseClass: string;
}> = {
  letters: {
    bar: "#8E9E42",
    border: "rgba(142,158,66,0.4)",
    pulseClass: "animate-turn-pulse-letters",
    barPulseClass: "animate-bar-pulse-letters",
  },
  practices: {
    bar: "#2E6B40",
    border: "rgba(46,107,64,0.4)",
    pulseClass: "animate-turn-pulse-practices",
    barPulseClass: "animate-bar-pulse-practices",
  },
  gatherings: {
    bar: "#6FAF85",
    border: "rgba(111,175,133,0.4)",
    pulseClass: "animate-turn-pulse-gatherings",
    barPulseClass: "animate-bar-pulse-gatherings",
  },
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

const PRACTICE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  "intercession": "🙏",
  "contemplative": "🕯️",
  "fasting": "🌿",
  "listening": "🎵",
  "custom": "🌱",
};

// ─── Dashboard item union type ──────────────────────────────────────────────

type DashboardItem =
  | { kind: "letter"; data: Correspondence }
  | { kind: "moment"; data: Moment; nextWindow?: string }
  | { kind: "gathering"; data: any; badge?: string };

// ─── Reusable card sub-components ────────────────────────────────────────────

function BarCard({
  href,
  pulse,
  category = "gatherings",
  children,
}: {
  href: string;
  pulse: boolean;
  category?: Category;
  children: React.ReactNode;
}) {
  const colors = CATEGORY_COLORS[category];
  return (
    <Link href={href} className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${pulse ? colors.pulseClass : ""}`}
        style={{ background: "#0F2818", border: `1px solid ${colors.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
      >
        <div
          className={`w-1 flex-shrink-0 ${pulse ? colors.barPulseClass : ""}`}
          style={{ background: pulse ? undefined : colors.bar }}
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

// ─── Letter card ─────────────────────────────────────────────────────────────

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
    <BarCard key={`${keyPrefix}-${c.id}`} href={`/letters/${c.id}`} pulse={shouldPulse} category="letters">
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

// ─── Moment card ─────────────────────────────────────────────────────────────

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
    <BarCard key={`${keyPrefix}-${m.id}`} href={openHref} pulse={shouldPulse} category="practices">
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

// ─── Gathering card ─────────────────────────────────────────────────────────

function GatheringCard({ r, keyPrefix, badge }: { r: any; keyPrefix: string; badge?: string }) {
  const next = r.nextMeetupDate ? parseISO(r.nextMeetupDate) : null;
  const rhythm = r.rhythm as string | undefined;
  const rhythmLabel = rhythm === "weekly" ? "weekly tradition"
    : rhythm === "biweekly" || rhythm === "fortnightly" ? "biweekly tradition"
    : rhythm === "monthly" ? "monthly tradition"
    : r.frequency ? `${r.frequency} tradition` : "recurring tradition";
  const participants: Array<any> = r.participants ?? [];

  return (
    <BarCard key={`${keyPrefix}-${r.id}`} href={`/ritual/${r.id}`} pulse={false} category="gatherings">
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>🤝 {r.name}</span>
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

// ─── Generic time section (Today / This week / This month) ──────────────────

function TimeSection({
  label,
  items,
  userEmail,
  userName,
  maxItems = 3,
}: {
  label: string;
  items: DashboardItem[];
  userEmail: string;
  userName: string;
  maxItems?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, maxItems);
  const hasMore = items.length > maxItems;

  return (
    <div className="mb-8">
      <SectionHeader label={label} />
      <div className="space-y-3">
        {visible.map((item, i) => {
          switch (item.kind) {
            case "letter":
              return <LetterCard key={`${label}-l-${item.data.id}`} c={item.data} userEmail={userEmail} userName={userName} keyPrefix={label} />;
            case "moment":
              return <MomentCard key={`${label}-m-${item.data.id}`} m={item.data} userEmail={userEmail} keyPrefix={label} nextWindow={item.nextWindow} />;
            case "gathering":
              return <GatheringCard key={`${label}-g-${item.data.id}`} r={item.data} keyPrefix={label} badge={item.badge} />;
          }
        })}
      </div>
      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-4 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: "#A8C5A0" }}
        >
          View all ({items.length}) →
        </button>
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

  // ── Placement + deduplication → three time buckets ────────────────────────

  const { todayItems, weekItems, monthItems, totalCount } = useMemo(() => {
    const allLetters = correspondences ?? [];
    const allMoments = momentsData?.moments ?? [];
    const allGatherings = (rituals ?? []) as any[];
    const userName = user?.name ?? "";

    const totalCount = allLetters.length + allMoments.length + allGatherings.length;

    const todayItems: DashboardItem[] = [];
    const weekItems: DashboardItem[] = [];
    const monthItems: DashboardItem[] = [];

    // ── Letters placement
    for (const c of allLetters) {
      const iWrote = c.currentPeriod.membersWritten.find(m => m.name === userName)?.hasWritten ?? false;
      const hasUnread = c.unreadCount > 0;
      const isDeadline = c.currentPeriod.isLastThreeDays && !iWrote;
      const isOpenTurn = !iWrote && !c.currentPeriod.isLastThreeDays;

      if (isDeadline) {
        todayItems.push({ kind: "letter", data: c });
      } else if (isOpenTurn || hasUnread) {
        weekItems.push({ kind: "letter", data: c });
      } else {
        monthItems.push({ kind: "letter", data: c });
      }
    }

    // ── Moments placement
    for (const m of allMoments) {
      if (m.windowOpen && m.todayPostCount === 0) {
        // Window open, not yet logged → Today
        todayItems.push({ kind: "moment", data: m });
      } else if (m.todayPostCount > 0) {
        // Already logged today → This Week (next occurrence coming up)
        weekItems.push({ kind: "moment", data: m, nextWindow: nextWindowLabel(m) });
      } else {
        // No open window, not logged → This Month
        monthItems.push({ kind: "moment", data: m });
      }
    }

    // ── Gatherings placement
    const endOfWeek = addDays(startOfDay(new Date()), 7);
    for (const r of allGatherings) {
      if (r.nextMeetupDate && isToday(parseISO(r.nextMeetupDate))) {
        todayItems.push({ kind: "gathering", data: r, badge: "Today" });
      } else if (r.nextMeetupDate) {
        const d = parseISO(r.nextMeetupDate);
        if (isBefore(d, endOfWeek) && !isToday(d)) {
          weekItems.push({ kind: "gathering", data: r, badge: format(d, "EEEE") });
        } else {
          monthItems.push({ kind: "gathering", data: r });
        }
      } else {
        monthItems.push({ kind: "gathering", data: r });
      }
    }

    return { todayItems, weekItems, monthItems, totalCount };
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
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            A Place Set Apart for Connection
          </p>
          <p style={{ color: "#F0EDE6", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            {format(new Date(), "EEEE, d MMMM")}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Link
              href="/letters"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
              style={{ background: "rgba(142,158,66,0.15)", color: "#8E9E42", border: "1px solid rgba(142,158,66,0.3)" }}
            >
              📮 Letters
            </Link>
            <Link
              href="/practices"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
              style={{ background: "rgba(46,107,64,0.15)", color: "#4A9E5C", border: "1px solid rgba(46,107,64,0.3)" }}
            >
              🙏 Practices
            </Link>
            <Link
              href="/gatherings"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
              style={{ background: "rgba(111,175,133,0.15)", color: "#6FAF85", border: "1px solid rgba(111,175,133,0.3)" }}
            >
              🤝 Gatherings
            </Link>
          </div>
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
            <TimeSection label="Today" items={todayItems} userEmail={userEmail} userName={userName} />

            {/* 2. This week */}
            <TimeSection label="This week" items={weekItems} userEmail={userEmail} userName={userName} />

            {/* 3. This month */}
            <TimeSection label="This month" items={monthItems} userEmail={userEmail} userName={userName} />

            {/* Empty state */}
            {totalCount === 0 && (
              <div className="rounded-xl p-5 text-center" style={{ background: "transparent", border: "1px dashed rgba(200, 212, 192, 0.25)" }}>
                <p className="text-sm mb-3" style={{ color: "#8FAF96" }}>No practices or gatherings yet. 🌱</p>
                <div className="flex justify-center gap-4">
                  <Link href="/moment/new"><span className="text-sm font-semibold" style={{ color: "#A8C5A0" }}>Start a practice →</span></Link>
                  <Link href="/tradition/new"><span className="text-sm font-semibold" style={{ color: "#A8C5A0" }}>Start a gathering →</span></Link>
                </div>
              </div>
            )}
          </>
        )}

        {/* Prayer Requests */}
        <PrayerSection maxVisible={3} />

        {/* Footer */}
        <p className="text-center text-xs mt-10 mb-4 tracking-wide" style={{ color: "rgba(143, 175, 150, 0.5)" }}>
          Inspired by Monastic Wisdom
        </p>

        <FAB />
      </div>
    </Layout>
  );
}
