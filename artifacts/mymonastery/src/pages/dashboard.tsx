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
import { format, isToday, parseISO, addDays, isBefore, startOfDay, startOfWeek } from "date-fns";

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
  myStreak: number;
  totalBlooms: number;
  state: string;
  memberCount: number;
  members: Array<{ name: string; email: string }>;
  todayPostCount: number;
  windowOpen: boolean;
  isActionableToday: boolean;
  intercessionTopic?: string | null;
  fastingFrom?: string | null;
  goalDays?: number | null;
  commitmentSessionsGoal?: number | null;
  commitmentSessionsLogged?: number | null;
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

const PRACTICE_EMOJI: Record<string, string> = {
  "morning-prayer": "🌅",
  "evening-prayer": "🌙",
  "intercession": "🙏",
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
        style={{ background: colors.bg, border: `1px solid ${colors.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
      >
        <div
          className={`w-1 flex-shrink-0 ${pulse ? colors.barPulseClass : ""}`}
          style={{ background: pulse ? undefined : colors.bar }}
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
            {/* FAB menu buttons use solid opaque backgrounds so the list
                doesn't bleed through content behind it. Category identity
                comes from the border color. */}
            <button
              onClick={() => { setOpen(false); setLocation("/letters/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#14322C", border: `1px solid ${CATEGORY_COLORS.letters.border}`, minWidth: 220, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>📮 Write a letter</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>Start a new correspondence</p>
            </button>
            <button
              onClick={() => { setOpen(false); setLocation("/moment/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#193F2A", border: `1px solid ${CATEGORY_COLORS.practices.border}`, minWidth: 220, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🙏 Start a practice</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>Prayer, fasting, intercession & more</p>
            </button>
            <button
              onClick={() => { setOpen(false); setLocation("/tradition/new"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ background: "#1E4B32", border: `1px solid ${CATEGORY_COLORS.gatherings.border}`, minWidth: 220, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🤝 Start a gathering</p>
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
  const emoji = PRACTICE_EMOJI[m.templateType || "custom"] || "🌱";
  // Lectio uses its per-user stage-done flag instead of todayPostCount since
  // reflections don't write to moment_posts. When the user is "caught up"
  // (has already submitted the current stage's reflection), the card still
  // shows a CTA — just labeled "Responses" instead of "Reflect 📜" — so
  // they can jump back in to see what others heard.
  const isLectio = m.templateType === "lectio-divina";
  const isLectioCaughtUp = isLectio && !!m.lectioMyStageDone;
  const shouldPulse = isLectio
    ? !isLectioCaughtUp
    : (m.windowOpen && m.todayPostCount === 0);
  const isDesktop = useIsDesktop();
  const memberNames = m.members
    .filter(p => p.email !== userEmail)
    .map(p => p.name || p.email.split("@")[0])
    .slice(0, 5)
    .join(", ");

  const isIntercession = m.templateType === "intercession";
  const isMorningPrayer = m.templateType === "morning-prayer";

  // Keep the emoji on one side only. Template emoji goes on the left; strip
  // any trailing emoji that's already in the stored name.
  const displayName = stripTrailingEmoji(m.name);

  let subtitle = "";
  if (memberNames) subtitle = `with ${memberNames}`;
  else if (m.fastingFrom) subtitle = `Fasting from ${m.fastingFrom}`;

  // Never repeat the card title as a fallback — also strip leading emoji + "For "
  const norm = (s: string) => s.trim().toLowerCase().replace(/^(for\s+)/i, "");
  const nameNorm = norm(m.name);
  const safeIntention = (m.intention && norm(m.intention) !== nameNorm) ? m.intention : null;
  const safeIntercessionTopic = (m.intercessionTopic && norm(m.intercessionTopic) !== nameNorm) ? m.intercessionTopic : null;

  // Progress badge — for intercession/fasting show group streak (fire emoji); blank if 0.
  // For lectio show the current stage label. For other practices, no badge.
  const progressLabel = isLectio
    ? (m.lectioCurrentStageLabel ?? null)
    : (isIntercession || m.templateType === "fasting")
      ? (m.currentStreak > 0 ? `🔥 ${m.currentStreak}` : m.myStreak > 0 ? `🙏 ${m.myStreak}` : null)
      : null;

  const openHref = (isLectio && m.momentToken && m.myUserToken)
    ? `/lectio/${m.momentToken}/${m.myUserToken}`
    : (shouldPulse && isMorningPrayer && m.myUserToken)
    ? `/morning-prayer/${m.id}/${m.myUserToken}`
    : (shouldPulse && isIntercession && m.momentToken && m.myUserToken)
    ? `/moment/${m.momentToken}/${m.myUserToken}`
    : `/moments/${m.id}`;

  // Cycling subtitle lines.
  //   Mobile: participants → next prayer → log count (no right-side status)
  //   Desktop: participants → log count → intention (status stays on the right)
  // Any empty line is skipped entirely so we never flip to nothing.
  const logCountLine =
    m.memberCount > 0
      ? `${m.todayPostCount} of ${m.memberCount} have prayed today`
      : "";
  const intentionLine = safeIntention ? `For: ${safeIntention}` : "";
  const nextPrayerLine = nextWindow ? `Next prayer ${nextWindow.toLowerCase()}` : "";
  const todayCountLine = !nextWindow && m.todayPostCount > 0 ? `${m.todayPostCount} today 🌿` : "";
  const mobileStatusLine = nextPrayerLine || todayCountLine;
  const desktopStatusText = nextWindow
    ? `Next Prayer ${nextWindow}`
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
  const mobileFlapLines: string[] = (isLectio ? lectioFlapLines : [subtitle, mobileStatusLine, logCountLine])
    .map(s => (s ?? "").trim())
    .filter(s => s.length > 0);
  const desktopFlapLines: string[] = (isLectio ? lectioFlapLines : [subtitle, logCountLine, intentionLine])
    .map(s => (s ?? "").trim())
    .filter(s => s.length > 0);
  const flapLines = isDesktop ? desktopFlapLines : mobileFlapLines;

  return (
    <BarCard key={`${keyPrefix}-${m.id}`} href={openHref} pulse={shouldPulse} category="practices">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{emoji} {displayName}</span>
        </div>
        {progressLabel ? (
          <span className="text-[10px] font-semibold uppercase shrink-0 mt-0.5" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
            {progressLabel}
          </span>
        ) : m.currentStreak > 0 ? (
          <span className="text-[10px] font-semibold uppercase shrink-0 mt-0.5" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
            {m.currentStreak} day streak
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-4 mt-0.5 -mr-2">
        <div className="min-w-0 flex-1">
          {shouldPulse && !isLectio ? (
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
              🙏 {safeIntercessionTopic}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center self-center">
          {isLectio ? (
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
              Pray 🙏
            </motion.span>
          ) : (
            isDesktop && desktopStatusText && (
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
  const rhythm = r.rhythm as string | undefined;
  const rhythmLabel = rhythm === "weekly" ? "Weekly tradition"
    : rhythm === "biweekly" || rhythm === "fortnightly" ? "Biweekly tradition"
    : rhythm === "monthly" ? "Monthly tradition"
    : rhythm === "one-time" ? "One-time gathering"
    : r.frequency ? `${r.frequency} tradition` : "Recurring tradition";
  const participants: Array<any> = r.participants ?? [];
  const gatheringEmoji = r.intercessionIntention ? "🙏" : r.fastingDescription ? "✦" : "🤝";

  // Check confirmation status — if 2+ participants haven't confirmed
  const unconfirmed = participants.filter((p: any) => p.status === "pending" || p.status === "invited");
  const waitingForConfirmation = unconfirmed.length >= 2;

  return (
    <BarCard key={`${keyPrefix}-${r.id}`} href={`/ritual/${r.id}`} pulse={false} category="gatherings">
      <div className="flex items-start justify-between gap-2">
        <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{gatheringEmoji} {r.name}</span>
        <span className="text-[10px] font-semibold uppercase shrink-0" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
          {rhythmLabel}
        </span>
      </div>
      <div className="mt-1.5">
        {next ? (
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            {nextDayLabel(next)} · {format(next, "h:mm a")}
          </p>
        ) : waitingForConfirmation ? (
          <p className="text-sm" style={{ color: "rgba(143,175,150,0.7)" }}>
            Waiting for confirmation
          </p>
        ) : null}
        {r.location && (
          <p className="text-xs mt-0.5" style={{ color: "rgba(143,175,150,0.6)" }}>
            📍 {r.location}
          </p>
        )}
      </div>
      {participants.length > 0 && (
        <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
          with {participants.slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]).join(", ")}
          {participants.length > 3 && ` +${participants.length - 3}`}
        </p>
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
}: {
  label: string;
  items: DashboardItem[];
  userEmail: string;
  userName: string;
}) {
  if (items.length === 0) return null;
  const scrollable = items.length > 3;

  const cards = (
    <div className="space-y-3">
      {items.map((item) => {
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
  );

  return (
    <div className="mb-8">
      <SectionHeader label={label} />
      {scrollable ? (
        <div className="relative">
          <div
            className="overflow-y-auto pr-1"
            style={{ maxHeight: "272px", scrollbarWidth: "none" }}
          >
            {cards}
            {/* Bottom padding so last card isn't flush against the fade */}
            <div className="h-4" />
          </div>
          {/* Fade out at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent, #091A10)" }}
          />
        </div>
      ) : (
        cards
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const [filter, setFilter] = useState<"letters" | "practices" | "gatherings" | null>(null);

  useEffect(() => {
    const reset = () => setFilter(null);
    window.addEventListener("phoebe:reset-filter", reset);
    return () => window.removeEventListener("phoebe:reset-filter", reset);
  }, []);

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
    // Server-side `isActionableToday` is now the single source of truth for
    // whether a practice belongs in "Today". It's timezone-aware (uses the
    // practice's own tz, not the browser's), handles lectio-divina's weekday
    // rhythm, and ignores time-of-day bands so all active practices show up
    // on the home screen today. Nothing lands in `monthItems` anymore —
    // practices are either actionable today, already-done today, or upcoming
    // this week.
    for (const m of allMoments) {
      // Lectio reflections don't write to moment_posts, so we use the
      // server-computed `lectioMyStageDone` flag (current user has submitted
      // the current stage's reflection this week) as the "logged" signal.
      const isLectio = m.templateType === "lectio-divina";
      const userDone = isLectio ? !!m.lectioMyStageDone : m.todayPostCount > 0;
      if (m.isActionableToday && !userDone) {
        todayItems.push({ kind: "moment", data: m });
      } else {
        weekItems.push({ kind: "moment", data: m, nextWindow: nextWindowLabel(m) });
      }
    }

    // ── Gatherings placement
    // "This week" is the calendar week Sunday → next Sunday, not a rolling
    // next-7-days window. So on Wednesday, "This week" still includes
    // Thursday/Friday/Saturday of this week, and nothing from next Monday.
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    const nextWeekStart = addDays(weekStart, 7);
    for (const r of allGatherings) {
      if (r.nextMeetupDate && isToday(parseISO(r.nextMeetupDate))) {
        todayItems.push({ kind: "gathering", data: r, badge: "Today" });
      } else if (r.nextMeetupDate) {
        const d = parseISO(r.nextMeetupDate);
        if (isBefore(d, nextWeekStart) && !isToday(d)) {
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
      <style>{`
        @media (min-width: 768px) {
          .dash-shell {
            max-width: 56rem;
            margin-left: auto;
            margin-right: auto;
          }
        }
      `}</style>
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
            const PILLS: Pill[] = [
              { label: "📮 Letters",      filterKey: "letters",   fg: "#5C8A5F", bg: "rgba(92,138,95,0.14)",   border: "rgba(92,138,95,0.28)"   },
              { label: "🙏 Practices",    filterKey: "practices", fg: "#6B9E6E", bg: "rgba(107,158,110,0.14)", border: "rgba(107,158,110,0.28)" },
              { label: "🤝 Gatherings",   filterKey: "gatherings",fg: "#7AAF7D", bg: "rgba(122,175,125,0.14)", border: "rgba(122,175,125,0.28)" },
              { label: "👥 People",       href: "/people",       fg: "#8FAF96", bg: "rgba(143,175,150,0.14)", border: "rgba(143,175,150,0.28)" },
              { label: "🏘️ Communities",  href: "/communities",  fg: "#6FAF85", bg: "rgba(111,175,133,0.12)", border: "rgba(111,175,133,0.25)" },
              { label: "🕯️ Prayer List",  href: "/prayer-list",  fg: "#7A9E7D", bg: "rgba(122,158,125,0.14)", border: "rgba(122,158,125,0.28)" },
              { label: "🙏 Intercessions", href: "/bcp/intercessions", fg: "#89A88C", bg: "rgba(137,168,140,0.14)", border: "rgba(137,168,140,0.28)" },
              { label: "📖 Learn",        href: "/learn",        fg: "#A8C5A0", bg: "rgba(168,197,160,0.12)", border: "rgba(168,197,160,0.28)" },
            ];
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
                  </button>
                );
              }
              return (
                <Link key={key} href={p.href!} className={pillClass} style={pillStyle(p)}>
                  {p.label}
                </Link>
              );
            };
            // When a filter is active: collapse the whole pill row down to
            // just the one active pill with an × to clear the filter.
            if (filter !== null) {
              const activePill = PILLS.find(p => p.filterKey === filter);
              if (activePill) {
                return (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setFilter(null)}
                      className={pillClass}
                      style={pillStyle(activePill)}
                    >
                      {activePill.label}
                      <span style={{ opacity: 0.7, fontSize: "0.85em", lineHeight: 1 }}>×</span>
                    </button>
                  </div>
                );
              }
            }
            return (
              <>
                {/* Scrolling ticker — shown on both mobile and desktop. */}
                <div className="mt-2 overflow-hidden relative" style={{ maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)" }}>
                  <style>{`@keyframes dash-pills { from { transform: translateX(0) } to { transform: translateX(-50%) } }`}</style>
                  <div style={{ display: "flex", gap: 8, width: "max-content", animation: "dash-pills 20s linear infinite" }}>
                    {[...PILLS, ...PILLS].map((p, i) => renderPill(p, i))}
                  </div>
                </div>
              </>
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
            if (filter === "letters") return item.kind === "letter";
            if (filter === "practices") return item.kind === "moment";
            if (filter === "gatherings") return item.kind === "gathering";
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
                    letters:    { href: "/letters/new",   text: "No letters yet. Start one. →"    },
                    practices:  { href: "/moment/new",    text: "No practices yet. Start one. →"  },
                    gatherings: { href: "/tradition/new", text: "No gatherings yet. Start one. →" },
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

        {/* Prayer Requests — hidden when filter active */}
        {filter === null && <PrayerSection maxVisible={3} />}

        {/* Footer */}
        <p className="text-center text-xs mt-10 mb-4 tracking-wide" style={{ color: "rgba(143, 175, 150, 0.5)" }}>
          Inspired by Monastic Wisdom
        </p>

        <FAB />
      </div>
    </Layout>
  );
}
