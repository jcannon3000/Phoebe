import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
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
  myTurn: boolean;
  turnState?: "WAITING" | "OPEN" | "OVERDUE" | "SENT";
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
  myStreak: number;
  groupStreak?: number;
  totalBlooms: number;
  state: string;
  memberCount: number;
  members: Array<{ name: string; email: string; joined?: boolean }>;
  todayPostCount: number;
  windowOpen: boolean;
  isActionableToday: boolean;
  intercessionTopic?: string | null;
  fastingType?: string | null;
  fastingFrom?: string | null;
  fastingDay?: string | null;
  goalDays?: number | null;
  commitmentSessionsGoal?: number | null;
  commitmentSessionsLogged?: number | null;
  computedSessionsLogged?: number;
  commitmentGoalReachedAt?: string | null;
  isCreator?: boolean;
  myUserToken: string | null;
  momentToken: string | null;
  frequency: string;
  dayOfWeek: string | null;
  practiceDays: string | null;
  timeOfDay: string | null;
  // Lectio-specific enrichment (only populated for lectio-divina moments)
  lectioSundayName?: string | null;
  lectioGospelReference?: string | null;
  lectioGospelText?: string | null;
  lectioResponseCount?: number | null;
  lectioMyStageDone?: boolean | null;
  lectioCurrentStageLabel?: string | null;
  lectioNextStageLabel?: string | null;
  // Most recent past window where someone actually prayed. Used by the
  // dashboard card flap to replace "0 of 2 have prayed today" with
  // "2 prayed Wednesday" on off-days.
  lastWindowDate?: string | null;
  lastWindowPostCount?: number | null;
  // Fasting weekly stats (meat fasts)
  weekFastCount?: number | null;
  weekGallonsSaved?: number | null;
};

// ─── Category color system ──────────────────────────────────────────────────

type Category = "letters" | "practices" | "gatherings";

const CATEGORY_COLORS: Record<Category, {
  bar: string;
  border: string;
  bg: string;
  pulseClass: string;
  barPulseClass: string;
}> = {
  letters: {
    bar: "#14402A",
    border: "rgba(20,64,42,0.5)",
    bg: "rgba(20,64,42,0.25)",
    pulseClass: "animate-turn-pulse-letters",
    barPulseClass: "animate-bar-pulse-letters",
  },
  practices: {
    bar: "#2E6B40",
    border: "rgba(46,107,64,0.4)",
    bg: "rgba(46,107,64,0.15)",
    pulseClass: "animate-turn-pulse-practices",
    barPulseClass: "animate-bar-pulse-practices",
  },
  gatherings: {
    bar: "#6FAF85",
    border: "rgba(111,175,133,0.4)",
    bg: "rgba(111,175,133,0.15)",
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

function nextWindowDaysAhead(m: Pick<Moment, "frequency" | "dayOfWeek" | "practiceDays">): number {
  if (m.frequency === "daily") return 1;
  if (m.frequency === "monthly") return 30;
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
    if (match) return i;
  }
  return 7;
}

const PRACTICE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  "intercession": "🙏🏽",
  "contemplative": "🕯️",
  "fasting": "🌿",
  "listening": "🎵",
  "lectio-divina": "📜",
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
  borderColor,
  barColor,
  bgColor,
  children,
}: {
  href: string;
  pulse: boolean;
  category?: Category;
  borderColor?: string;
  barColor?: string;
  bgColor?: string;
  children: React.ReactNode;
}) {
  const colors = CATEGORY_COLORS[category];
  return (
    <Link href={href} className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${pulse ? colors.pulseClass : ""}`}
        style={{
          background: bgColor || colors.bg,
          border: `1px solid ${borderColor || colors.border}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className={`w-1 flex-shrink-0 ${pulse ? colors.barPulseClass : ""}`}
          style={{ background: pulse ? undefined : (barColor || colors.bar) }}
        />
        <div className="flex-1 px-4 pt-3 pb-2">
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
            {/* FAB menu shows the three practice templates directly so
                people can jump straight into the sub-flow they want.
                Backgrounds are solid opaque practices-green; category
                identity comes from the border color. */}
            <button
              onClick={() => { setOpen(false); setLocation("/moment/new?template=lectio-divina"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#193F2A", border: `1px solid ${CATEGORY_COLORS.practices.border}`, minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>📜 Start a Lectio Divina group</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>Read Sunday's gospel together, unhurried</p>
            </button>
            <button
              onClick={() => { setOpen(false); setLocation("/moment/new?template=intercession"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#193F2A", border: `1px solid ${CATEGORY_COLORS.practices.border}`, minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🙏🏽 Start a group intercession</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>Build a rhythm of prayer together</p>
            </button>
            <button
              onClick={() => { setOpen(false); setLocation("/moment/new?template=fasting"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#193F2A", border: `1px solid ${CATEGORY_COLORS.practices.border}`, minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🌿 Start a group fast</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>Keep a shared discipline on the same day</p>
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
    <div className="flex items-center gap-3 mb-2">
      <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
    </div>
  );
}

// ─── Letter summary card (multiple letters collapsed) ────────────────────────

function LetterSummaryCard({
  correspondences,
  userEmail,
}: {
  correspondences: Correspondence[];
  userEmail: string;
}) {
  const otherNames = correspondences.map(c =>
    (c.members.find(m => m.email !== userEmail)?.name ?? "Someone").split(" ")[0]
  );
  const title = otherNames.length === 2
    ? `Dialogues with ${otherNames[0]} & ${otherNames[1]}`
    : `Dialogues with ${otherNames.length} people`;

  const anyNeedWrite = correspondences.some(c => {
    const ts = c.turnState;
    return c.groupType === "one_to_one"
      ? (ts === "OPEN" || ts === "OVERDUE")
      : !(c.currentPeriod.membersWritten.find(m => m.email === userEmail)?.hasWritten ?? false);
  });
  const anyUnread = correspondences.some(c => c.unreadCount > 0);
  const shouldPulse = anyNeedWrite || anyUnread;

  const statusText = anyUnread
    ? "New letters waiting 📮"
    : anyNeedWrite
    ? "Your turn to write 🖋️"
    : "Waiting for others to respond";

  return (
    <BarCard href="/letters" pulse={shouldPulse} category="letters">
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
          📮 {title}
        </span>
        <span className="text-[10px] font-semibold uppercase shrink-0 mt-1" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
          View All
        </span>
      </div>
      <div className="mt-1.5">
        <p className="text-sm" style={{ color: "#8FAF96", height: 20, lineHeight: "20px", margin: 0 }}>
          {statusText}
        </p>
      </div>
    </BarCard>
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
  const displayName = isOneToOne && otherMembers
    ? `Dialogue with ${otherMembers}`
    : (c.name?.replace(/^Letters with\b/, "Dialogue with")) || `Sharing with ${otherMembers}`;

  const ts = c.turnState;
  const hasUnread = c.unreadCount > 0;

  // For one-to-one: drive everything from the state machine
  const needsWrite = isOneToOne
    ? (ts === "OPEN" || ts === "OVERDUE")
    : !(c.currentPeriod.membersWritten.find(m => m.name === userName)?.hasWritten ?? false);
  const theyWrote = isOneToOne
    ? false // not used for one-to-one status
    : (c.currentPeriod.membersWritten.find(m => m.name !== userName)?.hasWritten ?? false);
  const iWrote = isOneToOne ? !needsWrite : !needsWrite;
  const shouldPulse = needsWrite || hasUnread;

  let statusText = "";
  if (hasUnread) {
    statusText = `${otherMembers} wrote 🌿`;
  } else if (isOneToOne) {
    if (ts === "OVERDUE") statusText = `Overdue · write when you're ready 🌿`;
    else if (ts === "OPEN") statusText = `Your turn to write 🖋️`;
    else statusText = `Waiting for ${otherMembers}`;
  } else if (iWrote && !theyWrote) {
    statusText = `Your update is in 🌿`;
  } else if (needsWrite) {
    statusText = `Share your update 🖋️`;
  } else {
    statusText = "All written 🌿";
  }

  const lastPostmark = c.recentPostmarks?.[0] ?? null;
  const sentDateLine = lastPostmark?.sentAt
    ? `Sent ${format(parseISO(lastPostmark.sentAt), "MMM d")}`
    : null;
  const flapLines = [statusText, ...(sentDateLine ? [sentDateLine] : [])].filter(Boolean);

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
        <SplitFlapLine lines={flapLines} />
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

// ─── Ticker-style subtitle line ──────────────────────────────────────────────

const SPLIT_FLAP_CSS = `
.sf-root { position: relative; width: 100%; height: 20px; overflow: hidden; }
.sf-line { position: absolute; left: 0; right: 0; top: 0; height: 20px; line-height: 20px; font-size: 14px; color: #8FAF96; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; will-change: opacity; }
@keyframes sf-line-out {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes sf-line-in {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
.sf-line-out { animation: sf-line-out 200ms ease-in forwards; }
.sf-line-in  { animation: sf-line-in 250ms ease-out forwards; }
`;

type FlapPhase = "show" | "out" | "blank" | "in";

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 768px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

// Simple "Renew 🌿" pill — sends the user to the detail page where the
// full renew modal lives (with length presets).
function RenewPill({ momentId }: { momentId: number }) {
  const [, setLocation] = useLocation();
  const handleRenew = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocation(`/moments/${momentId}?renew=1`);
  };
  return (
    <motion.span
      onClick={handleRenew}
      className="text-xs font-semibold rounded-full inline-flex items-center justify-center cursor-pointer"
      style={{ background: "#2D5E3F", color: "#F0EDE6", whiteSpace: "nowrap", padding: "4px 14px", lineHeight: "20px" }}
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    >
      Renew 🌿
    </motion.span>
  );
}

function SplitFlapLine({ lines }: { lines: string[] }) {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<FlapPhase>("show");

  // Reset when the set of lines changes (e.g. different card, or content updated)
  useEffect(() => {
    setIdx(0);
    setPhase("show");
  }, [lines.join("|")]);

  // Phase machine: show (4000ms) → out (200ms) → blank (140ms) → in (260ms) → show
  useEffect(() => {
    if (lines.length <= 1) return;
    let delay: number;
    if (phase === "show") delay = 4000;
    else if (phase === "out") delay = 200;
    else if (phase === "blank") delay = 140;
    else delay = 260; // "in"

    const t = setTimeout(() => {
      if (phase === "show") setPhase("out");
      else if (phase === "out") setPhase("blank");
      else if (phase === "blank") {
        setIdx(i => (i + 1) % lines.length);
        setPhase("in");
      } else {
        setPhase("show");
      }
    }, delay);

    return () => clearTimeout(t);
  }, [phase, lines.length]);

  if (lines.length === 0) return null;

  if (lines.length === 1) {
    return (
      <p className="text-sm" style={{ color: "#8FAF96", height: 20, lineHeight: "20px", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {lines[0]}
      </p>
    );
  }

  const text = lines[idx] ?? "";
  const visible = phase !== "blank";
  const animClass = phase === "out" ? "sf-line-out" : phase === "in" ? "sf-line-in" : "";

  return (
    <div className="sf-root">
      <style>{SPLIT_FLAP_CSS}</style>
      {visible && (
        <div className={`sf-line ${animClass}`}>{text}</div>
      )}
    </div>
  );
}

// ─── Moment card ─────────────────────────────────────────────────────────────

// Strip a trailing emoji (or run of emoji-ish chars) from a moment title so
// we never show the same glyph on both sides when the user's stored name
// already includes one (e.g. "Lectio Divina 📜" + leading template emoji).
function stripTrailingEmoji(s: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return s.replace(/[\s\u200d]*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component})+$/u, "").trim();
}

function MomentCard({ m, userEmail, keyPrefix, nextWindow }: { m: Moment; userEmail: string; keyPrefix: string; nextWindow?: string }) {
  const emoji = (m as any).customEmoji || PRACTICE_EMOJI[m.templateType || "custom"] || "🌱";
  // Lectio uses its per-user stage-done flag instead of todayPostCount since
  // reflections don't write to moment_posts. When the user is "caught up"
  // (has already submitted the current stage's reflection), the card still
  // shows a CTA — just labeled "Responses" instead of "Reflect 📜" — so
  // they can jump back in to see what others heard.
  const isLectio = m.templateType === "lectio-divina";
  const isLectioCaughtUp = isLectio && !!m.lectioMyStageDone;
  // Goal-reached detection — use the backend-stamped timestamp, not the
  // streak comparison. The backend stamps commitmentGoalReachedAt when
  // commitmentSessionsLogged crosses the goal, which is the correct check.
  const sessionsGoalForCard = m.commitmentSessionsGoal ?? m.goalDays ?? null;
  const goalReachedForMe = !isLectio && !!m.commitmentGoalReachedAt;
  const showRenewPill = goalReachedForMe && !!m.isCreator;
  const shouldPulse = isLectio
    ? !isLectioCaughtUp
    : showRenewPill
      ? true
      : (m.windowOpen && m.todayPostCount === 0);
  const isDesktop = useIsDesktop();
  const otherMembers = m.members.filter(p => p.email !== userEmail);
  const memberNames = otherMembers
    .map(p => {
      const full = p.name || p.email.split("@")[0];
      return otherMembers.length >= 2 ? full.split(" ")[0] : full;
    })
    .slice(0, 5)
    .join(", ");

  const isIntercession = m.templateType === "intercession";
  const isMorningPrayer = m.templateType === "morning-prayer";

  // Keep the emoji on one side only. Template emoji goes on the left; strip
  // any trailing emoji that's already in the stored name.
  // For custom intercessions (no meaningful topic), use the intention as the
  // title — same logic as the prayer page ("Prayers for my niece" not "Intercession").
  const displayName = (() => {
    if (isIntercession && m.intention) {
      const norm2 = (s: string) => s.trim().toLowerCase();
      const hasMeaningfulTopic =
        m.intercessionTopic &&
        norm2(m.intercessionTopic) !== norm2(m.name) &&
        norm2(m.intercessionTopic) !== norm2(m.intention);
      if (!hasMeaningfulTopic) return m.intention;
    }
    return stripTrailingEmoji(m.name);
  })();

  let subtitle = "";
  const isFasting = m.templateType === "fasting";
  const isMeatFast = isFasting && m.fastingType === "meat";
  if (isFasting && m.fastingDay) {
    const dayCapitalized = m.fastingDay.charAt(0).toUpperCase() + m.fastingDay.slice(1);
    subtitle = `Every ${dayCapitalized}`;
  } else if (memberNames) subtitle = `with ${memberNames}`;
  else if (m.fastingFrom) subtitle = `Fasting from ${m.fastingFrom}`;

  // Meat fast enrichment — water savings and weekly participation
  const meatFastWaterLine = isMeatFast && (m.weekGallonsSaved ?? 0) > 0
    ? `💧 ${(m.weekGallonsSaved ?? 0).toLocaleString()} gallons saved this week`
    : "";
  const meatFastParticipationLine = isMeatFast && (m.weekFastCount ?? 0) > 0
    ? `${m.weekFastCount} ${m.weekFastCount === 1 ? "person" : "people"} fasted this week`
    : "";

  // Never repeat the card title as a fallback — also strip leading emoji + "For "
  const norm = (s: string) => s.trim().toLowerCase().replace(/^(for\s+)/i, "");
  const nameNorm = norm(m.name);
  const safeIntention = (m.intention && norm(m.intention) !== nameNorm) ? m.intention : null;
  const safeIntercessionTopic = (m.intercessionTopic && norm(m.intercessionTopic) !== nameNorm) ? m.intercessionTopic : null;

  // Progress badge — for intercession/fasting show group streak (fire emoji).
  // Uses the computed groupStreak (from actual window data) not currentStreak
  // which can be corrupted by double-bloom or goal resets.
  const effectiveGroupStreak = m.groupStreak ?? m.currentStreak;
  const progressLabel = isLectio
    ? (m.lectioCurrentStageLabel ?? null)
    : (isIntercession || m.templateType === "fasting")
      ? (effectiveGroupStreak > 0 ? `🔥 ${effectiveGroupStreak}` : null)
      : null;

  const prayHref = isIntercession
    ? (m.momentToken && m.myUserToken ? `/moment/${m.momentToken}/${m.myUserToken}` : `/moments/${m.id}`)
    : null;

  const openHref = (isLectio && m.momentToken && m.myUserToken)
    ? `/lectio/${m.momentToken}/${m.myUserToken}`
    : (shouldPulse && isMorningPrayer && m.myUserToken)
    ? `/morning-prayer/${m.id}/${m.myUserToken}`
    : `/moments/${m.id}`;

  // Cycling subtitle lines.
  //   Mobile: participants → next prayer → log count (no right-side status)
  //   Desktop: participants → log count → intention (status stays on the right)
  // Any empty line is skipped entirely so we never flip to nothing.
  //
  // The "log count" line is context-sensitive so we don't sit on a card
  // that reads "0 of 2 have prayed today" on a Tuesday when the practice
  // only runs Mon/Wed/Fri:
  //   • If today IS a practice day (no upcoming nextWindow) and there
  //     are members → "X of Y have prayed today"
  //   • Otherwise, if anyone has prayed in a past window → "N prayed
  //     Wednesday" / "N prayed yesterday" / "N prayed last time"
  //   • Otherwise (first week, never prayed) → empty, so the flap cycles
  //     through just the two remaining lines.
  const logCountLine = (() => {
    if (!nextWindow && m.memberCount > 0) {
      // Today is a practice day — show live progress toward the group bloom.
      return `${m.todayPostCount} of ${m.memberCount} have prayed today`;
    }
    const lastCount = m.lastWindowPostCount ?? 0;
    if (lastCount > 0 && m.lastWindowDate) {
      const whenLabel = (() => {
        // lastWindowDate is an ISO date string like "2026-04-09"; parse
        // as a local date (parseISO handles this) and compare to today.
        const d = parseISO(m.lastWindowDate);
        const today = startOfDay(new Date());
        const that = startOfDay(d);
        const diffDays = Math.round((today.getTime() - that.getTime()) / 86_400_000);
        if (diffDays <= 0) return "today";       // shouldn't happen — guarded above
        if (diffDays === 1) return "yesterday";
        if (diffDays < 7) return format(d, "EEEE"); // "Wednesday"
        return "last time";
      })();
      const noun = lastCount === 1 ? "person" : "people";
      // For weekday labels we say "prayed Wednesday"; for "yesterday" and
      // "last time" we keep the same grammar. Drop the noun when the
      // label is a weekday so it reads tighter: "2 prayed Wednesday".
      const sameForAll = whenLabel === "yesterday" || whenLabel === "last time"
        ? `${lastCount} ${noun} prayed ${whenLabel}`
        : `${lastCount} prayed ${whenLabel}`;
      return sameForAll;
    }
    return "";
  })();
  const intentionLine = safeIntention ? `For ${safeIntention}` : "";
  const freqLabel = m.frequency === "daily" ? "Daily" : m.frequency === "monthly" ? "Monthly" : "Weekly";
  const nextPrayerLine = nextWindow ? `${freqLabel} · Next prayer ${nextWindow.toLowerCase()}` : "";
  const todayCountLine = !nextWindow && m.todayPostCount > 0 ? `${m.todayPostCount} today 🌿` : "";
  const mobileStatusLine = nextPrayerLine || todayCountLine;
  const desktopStatusText = nextWindow
    ? `${freqLabel} · Next Prayer ${nextWindow}`
    : !nextWindow && m.todayPostCount > 0
    ? `${m.todayPostCount} today 🌿`
    : "";
  // Lectio cycles through three lines: who you're with → when the next
  // reflection day is (Mon/Wed/Fri, the three reflection days — so on
  // Friday the next is Monday, not Sunday) → the gospel reference.
  const lectioFlapLines: string[] = isLectio
    ? (() => {
        const whoLine = subtitle;
        const verseLine = m.lectioGospelReference || "";
        const nextLine = m.lectioNextStageLabel
          ? `Next reflection ${m.lectioNextStageLabel}`
          : "";
        return [whoLine, nextLine, verseLine];
      })()
    : [];
  // Goal-reached flap: cycle between participants and the goal length completed.
  // Uses "days" for daily practices, "sessions" otherwise. The number reflects
  // whatever goal length the user originally set.
  const goalUnit = m.frequency === "daily" ? "days" : "sessions";
  const goalLengthLine = showRenewPill && sessionsGoalForCard
    ? `${sessionsGoalForCard} ${goalUnit} prayed 🌸`
    : "";
  const renewFlapLines: string[] = showRenewPill
    ? [subtitle, goalLengthLine]
    : [];

  // Meat fast cards: top-right shows the rhythm as a plural weekday
  // ("Wednesdays") and the left flap leads with "Next fast on Wednesday".
  const fastingDayCapitalized = isMeatFast && m.fastingDay
    ? m.fastingDay.charAt(0).toUpperCase() + m.fastingDay.slice(1)
    : "";
  const fastingDayPlural = fastingDayCapitalized ? `${fastingDayCapitalized}s` : "";
  const meatFastNextLine = isMeatFast && nextWindow
    ? `Next fast on ${nextWindow}`
    : "";
  const fastingFlapLines: string[] = isMeatFast
    ? [meatFastWaterLine, meatFastParticipationLine, meatFastNextLine]
    : [];

  const mobileFlapLines: string[] = (
    showRenewPill ? renewFlapLines :
    isLectio ? lectioFlapLines :
    isMeatFast ? fastingFlapLines :
    [subtitle, mobileStatusLine, logCountLine]
  )
    .map(s => (s ?? "").trim())
    .filter(s => s.length > 0);
  const desktopFlapLines: string[] = (
    showRenewPill ? renewFlapLines :
    isLectio ? lectioFlapLines :
    isMeatFast ? fastingFlapLines :
    [subtitle, logCountLine, intentionLine]
  )
    .map(s => (s ?? "").trim())
    .filter(s => s.length > 0);
  const flapLines = isDesktop ? desktopFlapLines : mobileFlapLines;

  return (
    <BarCard
      key={`${keyPrefix}-${m.id}`}
      href={openHref}
      pulse={shouldPulse}
      category="practices"
      {...(isMeatFast ? {
        borderColor: "rgba(100,160,210,0.45)",
        barColor: "#5A9BC7",
        bgColor: "rgba(70,130,190,0.12)",
      } : {})}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{emoji} {displayName}</span>
        </div>
        {showRenewPill ? (
          <span
            className="text-[10px] font-semibold uppercase shrink-0"
            style={{ color: "#C8D4C0", letterSpacing: "0.08em", marginTop: "1px" }}
          >
            Goal reached
          </span>
        ) : isMeatFast && fastingDayPlural ? (
          <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em", marginTop: "1px" }}>
            {fastingDayPlural}
          </span>
        ) : progressLabel ? (
          <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em", marginTop: "1px" }}>
            {progressLabel}
          </span>
        ) : m.currentStreak > 0 ? (
          <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em", marginTop: "1px" }}>
            {m.currentStreak} day streak
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-4 mt-px -mr-2">
        <div className="min-w-0 flex-1">
          {shouldPulse && !isLectio && !showRenewPill ? (
            subtitle ? (
              <p className="text-sm" style={{ color: "#8FAF96", height: 20, lineHeight: "20px", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {subtitle}
              </p>
            ) : null
          ) : (
            <SplitFlapLine lines={flapLines} />
          )}
          {isIntercession && safeIntercessionTopic && (
            <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(143,175,150,0.7)" }}>
              🙏🏽 {safeIntercessionTopic}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center self-center">
          {showRenewPill ? (
            <RenewPill momentId={m.id} />
          ) : isLectio ? (
            // Lectio always shows a pill: "Reflect 📜" when there's something
            // to do this stage, "Responses" once the user has submitted.
            <motion.span
              className="text-xs font-semibold rounded-full inline-block"
              style={{
                background: "#2D5E3F",
                color: "#F0EDE6",
                padding: "4px 14px",
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                lineHeight: "20px",
              }}
              animate={isLectioCaughtUp ? undefined : { scale: [1, 1.05, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            >
              {isLectioCaughtUp ? "Responses" : "Reflect 📜"}
            </motion.span>
          ) : shouldPulse ? (
            <Link
              href={prayHref ?? openHref}
              onClick={(e) => e.stopPropagation()}
            >
              <motion.span
                className="text-xs font-semibold rounded-full inline-block"
                style={{
                  background: "#2D5E3F",
                  color: "#F0EDE6",
                  padding: "4px 14px",
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                  lineHeight: "20px",
                }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              >
                {isFasting ? "Log 🌿" : isIntercession ? "Pray 🙏🏽" : isMorningPrayer ? "Open 📖" : "Log 🌿"}
              </motion.span>
            </Link>
          ) : isIntercession && m.todayPostCount > 0 && m.windowOpen ? (
            // Already prayed today — show View pill so they can revisit the circle
            <Link href={openHref} onClick={(e) => e.stopPropagation()}>
              <span
                className="text-xs font-semibold rounded-full inline-block"
                style={{
                  background: "rgba(46,107,64,0.18)",
                  color: "#C8D4C0",
                  border: "1px solid rgba(46,107,64,0.35)",
                  padding: "4px 14px",
                  letterSpacing: "0.01em",
                  whiteSpace: "nowrap",
                  lineHeight: "20px",
                }}
              >
                View
              </span>
            </Link>
          ) : (
            isDesktop && !isMeatFast && desktopStatusText && (
              <span className="text-xs" style={{ color: "#8FAF96" }}>{desktopStatusText}</span>
            )
          )}
        </div>
      </div>
    </BarCard>
  );
}

// ─── Gathering card ─────────────────────────────────────────────────────────

function GatheringCard({ r, keyPrefix, badge }: { r: any; keyPrefix: string; badge?: string }) {
  const next = r.nextMeetupDate ? parseISO(r.nextMeetupDate) : null;
  const isToday_ = next ? isToday(next) : false;
  const rhythm = r.rhythm as string | undefined;
  const rhythmLabel = rhythm === "weekly" ? "Weekly tradition"
    : rhythm === "biweekly" || rhythm === "fortnightly" ? "Biweekly tradition"
    : rhythm === "monthly" ? "Monthly tradition"
    : rhythm === "one-time" ? "One-time gathering"
    : r.frequency ? `${r.frequency} tradition` : "Recurring tradition";
  const participants: Array<any> = r.participants ?? [];
  // Pick an emoji that matches how the gathering was created. Template wins
  // over practice flags when set; intercession/fasting still override the
  // generic handshake for legacy gatherings without a stored template.
  const templateEmoji: Record<string, string> = {
    coffee: "☕",
    meal: "🍽️",
    walk: "🚶🏽",
    book_club: "📚",
    custom: "🌿",
  };
  const gatheringEmoji = (r.template && templateEmoji[r.template])
    ? templateEmoji[r.template]
    : r.intercessionIntention ? "🙏🏽"
    : r.fastingDescription ? "✦"
    : "🤝🏽";

  // Check confirmation status — if 2+ participants haven't confirmed
  const unconfirmed = participants.filter((p: any) => p.status === "pending" || p.status === "invited");
  const waitingForConfirmation = unconfirmed.length >= 2;

  // Build the 2nd-line flap: cycle between Participants, Next Date, Location.
  // Each line is optional — skip entries that aren't known yet.
  const flapLines: string[] = [];

  if (participants.length > 0) {
    const fullNames = participants
      .slice(0, 3)
      .map((p: any) => (p.name || p.email || "").trim())
      .filter(Boolean)
      .join(", ");
    const extra = participants.length > 3 ? ` +${participants.length - 3}` : "";
    if (fullNames) flapLines.push(`with ${fullNames}${extra}`);
  }

  if (next) {
    flapLines.push(`${nextDayLabel(next)} · ${format(next, "h:mm a")}`);
  } else if (waitingForConfirmation) {
    flapLines.push("Waiting for confirmation");
  }

  // Prefer the upcoming meetup's location; fall back to the tradition-level
  // location (legacy data) so old rituals still show something.
  const meetupLocation = r.nextMeetupLocation ?? r.location;
  if (meetupLocation) {
    flapLines.push(`📍 ${meetupLocation}`);
  }

  return (
    <BarCard key={`${keyPrefix}-${r.id}`} href={`/ritual/${r.id}`} pulse={isToday_} category="gatherings">
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{gatheringEmoji} {r.name}</span>
        <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
          {rhythmLabel}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 mt-px -mr-2">
        <div className="min-w-0 flex-1">
          <SplitFlapLine lines={flapLines} />
        </div>
        <div className="shrink-0 flex items-center self-center">
          <span
            className="text-xs font-semibold rounded-full inline-block"
            style={{
              background: "#2D5E3F",
              color: "#F0EDE6",
              padding: "4px 14px",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
              lineHeight: "20px",
            }}
          >
            View
          </span>
        </div>
      </div>
    </BarCard>
  );
}

// ─── Generic time section (Today / This week / This month) ──────────────────

function TimeSection({
  label,
  items,
  userEmail,
  userName,
}: {
  label: string;
  items: DashboardItem[];
  userEmail: string;
  userName: string;
}) {
  if (items.length === 0) return null;

  const letterItems = items.filter(i => i.kind === "letter") as Array<Extract<DashboardItem, { kind: "letter" }>>;
  const momentItems = items.filter(i => i.kind === "moment") as Array<Extract<DashboardItem, { kind: "moment" }>>;
  const gatheringItems = items.filter(i => i.kind === "gathering") as Array<Extract<DashboardItem, { kind: "gathering" }>>;

  // Letters where it's the user's turn always show as individual cards.
  // Passive letters (waiting/sent) collapse into a summary when there are 2+.
  const actionLetters = letterItems.filter(i => i.data.turnState === "OPEN" || i.data.turnState === "OVERDUE");
  const passiveLetters = letterItems.filter(i => i.data.turnState !== "OPEN" && i.data.turnState !== "OVERDUE");

  // Dashboard shows practices only — letters + gatherings live in the menu.
  const visibleCardCount = momentItems.length;
  const scrollable = visibleCardCount > 3;

  const cards = (
    <div className="space-y-3">
      {momentItems.map((item) => (
        <MomentCard key={`${label}-m-${item.data.id}`} m={item.data} userEmail={userEmail} keyPrefix={label} nextWindow={item.nextWindow} />
      ))}
    </div>
  );

  return (
    <div className={scrollable ? "mb-3" : "mb-5"}>
      <SectionHeader label={label} />
      {scrollable ? (
        <div className="relative">
          <div
            className="overflow-y-auto pr-1"
            style={{ maxHeight: "310px", scrollbarWidth: "none" }}
          >
            {cards}
            {/* Bottom padding so last card isn't flush against the fade */}
            <div className="h-4" />
          </div>
          {/* Fade out at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent 20%, #091A10)" }}
          />
        </div>
      ) : (
        cards
      )}
    </div>
  );
}

// ─── Goal Reached Celebration Modal ─────────────────────────────────────────

function GoalReachedModal({
  moment,
  onDismiss,
}: {
  moment: Moment;
  onDismiss: () => void;
}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [slide, setSlide] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const goal = moment.commitmentSessionsGoal ?? moment.goalDays ?? 0;
  const hasStreak = (moment.myStreak ?? 0) >= goal && goal > 0;

  // Next tier: if they hit their goal with a streak, suggest doubling or a
  // meaningful jump. If no streak, suggest trying the same goal again.
  const nextGoal = hasStreak
    ? (goal <= 3 ? 7 : goal <= 7 ? 14 : goal <= 14 ? 30 : goal * 2)
    : goal;

  const updateGoalMutation = useMutation({
    mutationFn: (data: object) => apiRequest("PATCH", `/api/moments/${moment.id}/goal`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      onDismiss();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/moments/${moment.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
      onDismiss();
    },
  });

  const memberNames = moment.members
    .map(p => p.name || p.email.split("@")[0])
    .slice(0, 5);

  const gStreak = moment.groupStreak ?? moment.currentStreak;
  const emoji = (moment as any).customEmoji
    || (moment.templateType === "intercession" ? "🙏🏽"
    : moment.templateType === "fasting" ? "🌿"
    : "🌸");

  const slides = [
    // Slide 0: Celebration — group focused
    <div key="celebrate" className="flex flex-col items-center text-center gap-5">
      <p className="text-4xl">{emoji}</p>
      <h2 className="text-xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        Your group kept the rhythm.
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
        You set a goal of {goal} {goal === 1 ? "session" : "sessions"} for{" "}
        <span style={{ color: "#C8D4C0" }}>{moment.name}</span>.
        {gStreak > 0
          ? ` Your group built a ${gStreak}-day streak together.`
          : " The commitment is fulfilled."}
      </p>
      {memberNames.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 mt-1">
          {memberNames.map((name, i) => (
            <span
              key={i}
              className="text-xs px-3 py-1.5 rounded-full"
              style={{ background: "rgba(46,107,64,0.2)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>,

    // Slide 1: What next
    <div key="next" className="flex flex-col items-center text-center gap-4">
      <h2 className="text-lg font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        What would you like to do?
      </h2>

      {gStreak > 0 ? (
        <>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Your group has a {gStreak}-day streak. Keep it going?
          </p>
          <button
            onClick={() => updateGoalMutation.mutate({ commitmentSessionsGoal: nextGoal, commitmentTendFreely: false })}
            disabled={updateGoalMutation.isPending}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Continue to {nextGoal} sessions {emoji}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            The goal is met. Would you like to try again?
          </p>
          <button
            onClick={() => updateGoalMutation.mutate({ commitmentSessionsGoal: nextGoal, commitmentTendFreely: false })}
            disabled={updateGoalMutation.isPending}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Try again — {nextGoal} sessions {emoji}
          </button>
        </>
      )}

      <button
        onClick={() => updateGoalMutation.mutate({ commitmentSessionsGoal: null, commitmentTendFreely: true })}
        disabled={updateGoalMutation.isPending}
        className="w-full py-3 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{
          background: "rgba(46,107,64,0.15)",
          color: "#A8C5A0",
          border: "1px solid rgba(46,107,64,0.3)",
        }}
      >
        Continue without a goal
      </button>

      <button
        onClick={() => setDeleting(true)}
        disabled={deleteMutation.isPending}
        className="text-xs italic transition-opacity hover:opacity-70 disabled:opacity-40 mt-2"
        style={{ color: "rgba(143,175,150,0.5)" }}
      >
        Discontinue this practice
      </button>

      {deleting && (
        <div className="w-full rounded-xl px-4 py-3 mt-1" style={{ background: "rgba(193,127,36,0.12)", border: "1px solid rgba(193,127,36,0.3)" }}>
          <p className="text-sm mb-3" style={{ color: "#E8B878" }}>
            This will permanently delete the practice and its history.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="flex-1 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: "rgba(193,127,36,0.25)", color: "#E8B878", border: "1px solid rgba(193,127,36,0.4)" }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setDeleting(false)}
              className="flex-1 py-2 rounded-xl text-sm"
              style={{ color: "#8FAF96" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>,
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full mx-6 rounded-3xl px-6 py-8 relative"
        style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", maxWidth: 420 }}
      >
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full"
          style={{ color: "rgba(200,212,192,0.4)", background: "rgba(200,212,192,0.06)" }}
        >
          <X size={16} />
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={slide}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {slides[slide]}
          </motion.div>
        </AnimatePresence>

        {slide < slides.length - 1 && (
          <button
            onClick={() => setSlide(s => s + 1)}
            className="mt-6 w-full py-3 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Continue
          </button>
        )}

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-4">
          {slides.map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ background: i === slide ? "#8FAF96" : "rgba(143,175,150,0.2)" }}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [filter, setFilter] = useState<"practices" | null>(null);
  // Goal popup: creator-only, persisted in localStorage, once per day, max 2 days.
  const [goalDismissed, setGoalDismissed] = useState<Set<number>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("phoebe:goal-dismissed") || "{}") as Record<string, string[]>;
      const today = new Date().toISOString().slice(0, 10);
      const dismissed = new Set<number>();
      for (const [id, dates] of Object.entries(stored)) {
        // Dismissed today, or already shown on 2+ different days
        if (dates.includes(today) || dates.length >= 2) dismissed.add(Number(id));
      }
      return dismissed;
    } catch { return new Set<number>(); }
  });
  const dismissGoal = useCallback((id: number) => {
    setGoalDismissed(prev => new Set([...prev, id]));
    try {
      const stored = JSON.parse(localStorage.getItem("phoebe:goal-dismissed") || "{}") as Record<string, string[]>;
      const today = new Date().toISOString().slice(0, 10);
      const dates = stored[String(id)] || [];
      if (!dates.includes(today)) dates.push(today);
      stored[String(id)] = dates;
      localStorage.setItem("phoebe:goal-dismissed", JSON.stringify(stored));
    } catch { /* ignore */ }
  }, []);

  const queryClient = useQueryClient();
  const { isBeta } = useBetaStatus();
  const [betaWelcomeVisible, setBetaWelcomeVisible] = useState(false);
  const betaWelcomeShownRef = useRef(false);

  useEffect(() => {
    if (isBeta && !betaWelcomeShownRef.current && !localStorage.getItem("phoebe:beta-welcome-seen")) {
      betaWelcomeShownRef.current = true;
      setBetaWelcomeVisible(true);
    }
  }, [isBeta]);

  const dismissBetaWelcome = useCallback(() => {
    setBetaWelcomeVisible(false);
    localStorage.setItem("phoebe:beta-welcome-seen", "1");
  }, []);

  useEffect(() => {
    const reset = () => setFilter(null);
    window.addEventListener("phoebe:reset-filter", reset);
    return () => window.removeEventListener("phoebe:reset-filter", reset);
  }, []);

  const { data: momentsData, isLoading: momentsLoading } = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
    // Always refetch when the dashboard mounts so that renew / archive
    // mutations from the detail page are reflected immediately.
    staleTime: 0,
  });

  const isLoading = momentsLoading;

  // ── Goal-reached celebration — creator only, max 2 days, once per day
  const goalReachedMoment = useMemo(() => {
    if (!momentsData?.moments) return null;
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return momentsData.moments.find((m) => {
      if (!m.isCreator) return false;               // creator only
      if (goalDismissed.has(m.id)) return false;     // already dismissed today or 2+ days
      if (!m.commitmentGoalReachedAt) return false;
      const reachedAt = new Date(m.commitmentGoalReachedAt).getTime();
      return now - reachedAt < twoDaysMs;
    }) ?? null;
  }, [momentsData, goalDismissed]);

  // ── Placement + deduplication → three time buckets ────────────────────────

  const { todayItems, weekItems, monthItems, totalCount } = useMemo(() => {
    const allMoments = momentsData?.moments ?? [];

    // Hide practices whose creator reached the goal more than two days ago
    // and hasn't renewed — the calendar cleanup has already torn down the
    // reminders, so keeping the card around just creates clutter. We only
    // hide when we have a confirmed commitmentGoalReachedAt older than two
    // days: the UI's "goal reached" look is driven by myStreak, but the
    // backend only stamps commitmentGoalReachedAt when commitmentSessionsLogged
    // crosses the commitment goal, and for intercession those two counters
    // can diverge. Falling back to "hide" there would make the card vanish
    // the instant the pill lights up, which is the opposite of what we want.
    const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const visibleMoments = allMoments.filter((m) => {
      if (!m.isCreator) return true;
      if (!m.commitmentGoalReachedAt) return true;
      const reachedAt = new Date(m.commitmentGoalReachedAt).getTime();
      return nowMs - reachedAt < twoDaysMs;
    });

    const totalCount = visibleMoments.length;

    const todayItems: DashboardItem[] = [];
    const weekItems: DashboardItem[] = [];
    const monthItems: DashboardItem[] = [];

    // "This week" is a rolling next-7-days window (not a calendar Sun→Sat
    // week). So on Wednesday, "This week" covers Thu–next Wed.
    const sevenDaysFromToday = addDays(startOfDay(new Date()), 7);

    // ── Moments placement
    // isActionableToday → Today section. Otherwise bucket by next window date:
    // if the next occurrence falls within the next 7 days it goes to
    // "This week"; otherwise it goes to "This month".
    for (const m of visibleMoments) {
      const isLectio = m.templateType === "lectio-divina";
      const userDone = isLectio ? !!m.lectioMyStageDone : m.todayPostCount > 0;
      if (m.isActionableToday && !userDone) {
        todayItems.push({ kind: "moment", data: m });
      } else {
        const label = nextWindowLabel(m);
        const daysAhead = nextWindowDaysAhead(m);
        const nextDate = addDays(startOfDay(new Date()), daysAhead);
        if (isBefore(nextDate, sevenDaysFromToday)) {
          weekItems.push({ kind: "moment", data: m, nextWindow: label });
        } else {
          monthItems.push({ kind: "moment", data: m, nextWindow: label });
        }
      }
    }

    return { todayItems, weekItems, monthItems, totalCount };
  }, [momentsData, user]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  if (authLoading || !user) return null;

  const userEmail = user.email;
  const userName = user.name ?? "";

  return (
    <Layout>
      <style>{`
        @media (min-width: 768px) {
          .dash-shell {
            max-width: 56rem;
            margin-left: auto;
            margin-right: auto;
          }
        }
      `}</style>
      {/* Beta welcome popup — one-time */}
      <AnimatePresence>
        {betaWelcomeVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={dismissBetaWelcome}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl px-8 py-8 text-center max-w-sm w-full"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)" }}
              onClick={e => e.stopPropagation()}
            >
              <p className="text-4xl mb-4">🧰</p>
              <h2
                className="text-lg font-bold mb-2"
                style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Welcome to the beta
              </h2>
              <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                You've been added as a beta user. You now have access to early features as they roll out.
              </p>
              <button
                onClick={dismissBetaWelcome}
                className="px-8 py-2.5 rounded-full text-sm font-medium transition-opacity hover:opacity-90"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="dash-shell flex flex-col w-full pb-36">

        {/* ── Header ── */}
        <div className="mb-6">
          <p className="text-[11px] tracking-widest uppercase mb-1" style={{ color: "rgba(143,175,150,0.5)" }}>
            A Place Set Apart for Connection
          </p>
          <p style={{ color: "#F0EDE6", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em" }}>
            {format(new Date(), "EEEE, d MMMM")}
          </p>
          {(() => {
            type Pill = {
              label: string;
              href?: string;
              filterKey?: "letters" | "practices" | "gatherings";
              fg: string;
              bg: string;
              border: string;
            };
            const pillStyle = (p: Pill) => ({
              background: p.bg, color: p.fg, border: `1px solid ${p.border}`,
            });
            const pillClass = "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap transition-opacity hover:opacity-80";
            const renderPill = (p: Pill, key: string | number) => {
              if (p.filterKey) {
                const fk = p.filterKey;
                return (
                  <button key={key} type="button"
                    onClick={() => setFilter(prev => prev === fk ? null : fk)}
                    className={pillClass}
                    style={pillStyle(p)}
                  >
                    {p.label}
                    {filter === fk && <span style={{ opacity: 0.7, fontSize: "0.85em", lineHeight: 1 }}>×</span>}
                  </button>
                );
              }
              return (
                <Link key={key} href={p.href!} className={pillClass} style={pillStyle(p)}>
                  {p.label}
                </Link>
              );
            };

            const PILLS: Pill[] = [
              { label: "🙏🏽 Practices",    filterKey: "practices", fg: "#6B9E6E", bg: "rgba(107,158,110,0.14)", border: "rgba(107,158,110,0.28)" },
              { label: "🕯️ Prayer List",  href: "/prayer-list",  fg: "#7A9E7D", bg: "rgba(122,158,125,0.14)", border: "rgba(122,158,125,0.28)" },
              { label: "📖 BCP Prayers",  href: "/bcp/intercessions", fg: "#89A88C", bg: "rgba(137,168,140,0.14)", border: "rgba(137,168,140,0.28)" },
              { label: "👥 People",       href: "/people",       fg: "#8FAF96", bg: "rgba(143,175,150,0.14)", border: "rgba(143,175,150,0.28)" },
              { label: "🏘️ Communities",  href: "/communities",  fg: "#6FAF85", bg: "rgba(111,175,133,0.12)", border: "rgba(111,175,133,0.25)" },
            ];

            // When a filter is active, collapse to just the active pill with ×
            if (filter !== null) {
              const activePill = PILLS.find(p => p.filterKey === filter);
              if (activePill) {
                return (
                  <div className="flex items-center gap-2 mt-2">
                    {renderPill(activePill, "active")}
                  </div>
                );
              }
            }

            return (
              <div className="mt-2 overflow-hidden relative" style={{ maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)" }}>
                <style>{`@keyframes dash-pills { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
                <div style={{ display: "flex", gap: 8, width: "max-content", animation: "dash-pills 20s linear infinite" }}>
                  {[...PILLS, ...PILLS].map((p, i) => renderPill(p, i))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Loading skeleton ── */}
        {isLoading && (
          <div className="space-y-6 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            ))}
          </div>
        )}

        {!isLoading && (() => {
          const byFilter = (item: DashboardItem) => {
            if (filter === "practices") return item.kind === "moment";
            return true;
          };
          const fToday = todayItems.filter(byFilter);
          const fWeek = weekItems.filter(byFilter);
          const fMonth = monthItems.filter(byFilter);
          const filteredEmpty = filter !== null && fToday.length === 0 && fWeek.length === 0 && fMonth.length === 0;

          return (
            <AnimatePresence mode="wait">
              <motion.div
                key={filter ?? "all"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* 1. Today */}
                <TimeSection label="Today" items={fToday} userEmail={userEmail} userName={userName} />

                {/* 2. This week */}
                <TimeSection label="This week" items={fWeek} userEmail={userEmail} userName={userName} />

                {/* 3. This month */}
                <TimeSection label="This month" items={fMonth} userEmail={userEmail} userName={userName} />

                {/* Filtered empty state */}
                {filteredEmpty && (() => {
                  const emptyConfig = {
                    practices: { href: "/moment/new", text: "No practices yet. Start one. →" },
                  } as const;
                  const cfg = emptyConfig[filter!];
                  return (
                    <div className="py-12 text-center">
                      <Link
                        href={cfg.href}
                        className="text-sm transition-opacity hover:opacity-80"
                        style={{ color: "#8FAF96", fontSize: 14 }}
                      >
                        {cfg.text}
                      </Link>
                    </div>
                  );
                })()}

                {/* Unfiltered empty state */}
                {filter === null && totalCount === 0 && (
                  <div className="rounded-xl p-5 text-center" style={{ background: "transparent", border: "1px dashed rgba(200, 212, 192, 0.25)" }}>
                    <p className="text-sm mb-3" style={{ color: "#8FAF96" }}>No practices or gatherings yet. 🌱</p>
                    <div className="flex justify-center gap-4">
                      <Link href="/moment/new"><span className="text-sm font-semibold" style={{ color: "#A8C5A0" }}>Start a practice →</span></Link>
                      <Link href="/tradition/new"><span className="text-sm font-semibold" style={{ color: "#A8C5A0" }}>Start a gathering →</span></Link>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          );
        })()}

        {/* Prayer Requests — hidden when filter active.
            No extra wrapper margin: the previous TimeSection's mb-8 already
            provides the section-to-section gap, matching how This month sits
            below This week. */}
        {filter === null && <PrayerSection maxVisible={3} />}

        {/* Footer */}
        <p className="text-center text-xs mt-10 mb-4 tracking-wide" style={{ color: "rgba(143, 175, 150, 0.5)" }}>
          Inspired by Monastic Wisdom
        </p>
        <div className="flex justify-center mb-4">
          <button
            onClick={() => setLocation("/church-deck")}
            className="px-5 py-2 rounded-full text-xs font-medium tracking-wide transition-opacity hover:opacity-100"
            style={{
              background: "rgba(200,212,192,0.06)",
              border: "1px solid rgba(200,212,192,0.18)",
              color: "rgba(200,212,192,0.7)",
            }}
          >
            About
          </button>
        </div>

        <FAB />
      </div>

      {/* Goal-reached celebration popup */}
      <AnimatePresence>
        {goalReachedMoment && (
          <GoalReachedModal
            key={goalReachedMoment.id}
            moment={goalReachedMoment}
            onDismiss={() => dismissGoal(goalReachedMoment.id)}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}
