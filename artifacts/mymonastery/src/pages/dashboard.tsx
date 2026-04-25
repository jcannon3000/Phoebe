import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus, useCommunityAdminToggle } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { PrayerSection } from "@/components/prayer-section";
import { ScrollStrip } from "@/components/ScrollStrip";
import { LiturgicalDateHeader } from "@/components/LiturgicalDateHeader";
import { apiRequest } from "@/lib/queryClient";

import { format, isToday, parseISO, addDays, isBefore, startOfDay, startOfWeek, endOfWeek, addWeeks } from "date-fns";

// ─── Shared types ─────────────────────────────────────────────────────────────

type Correspondence = {
  id: number;
  name: string;
  groupType: string;
  unreadCount: number;
  myTurn: boolean;
  turnState?: "WAITING" | "OPEN" | "OVERDUE" | "SENT";
  members: Array<{ name: string | null; email: string }>;
  recentLetters: Array<{ authorName: string; sentAt: string }>;
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
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
  todayPostCount: number;
  windowOpen: boolean;
  isActionableToday: boolean;
  isActionableTomorrow: boolean;
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
  // Fasting stats. weekFastCount/weekGallonsSaved drive the "this week"
  // line; allTimeFastCount/allTimeGallonsSaved drive the "all time" line
  // so the card can show both (meat fasts only for gallons). myLoggedToday
  // flips the third flap line to a "Fasted today ✓" acknowledgment once
  // the viewer has posted a check-in for today's fast window.
  weekFastCount?: number | null;
  weekGallonsSaved?: number | null;
  allTimeFastCount?: number | null;
  allTimeGallonsSaved?: number | null;
  myLoggedToday?: boolean | null;
};

// ─── Category color system ──────────────────────────────────────────────────

type Category = "letters" | "practices" | "gatherings" | "feeds";

const CATEGORY_COLORS: Record<Category, {
  bar: string;
  border: string;
  bg: string;
  pulseClass: string;
  barPulseClass: string;
}> = {
  letters: {
    bar: "#14402A",
    border: "transparent",
    bg: "rgba(20,64,42,0.25)",
    pulseClass: "animate-turn-pulse-letters",
    barPulseClass: "animate-bar-pulse-letters",
  },
  practices: {
    bar: "#2E6B40",
    border: "transparent",
    bg: "rgba(46,107,64,0.15)",
    pulseClass: "animate-turn-pulse-practices",
    barPulseClass: "animate-bar-pulse-practices",
  },
  gatherings: {
    bar: "#6FAF85",
    border: "transparent",
    bg: "rgba(111,175,133,0.15)",
    pulseClass: "animate-turn-pulse-gatherings",
    barPulseClass: "animate-bar-pulse-gatherings",
  },
  // Prayer Feeds — distinct from practices (individual-scale) and
  // gatherings (church-scale); these are cause-scale, a different tone.
  // Cooler dove-blue-green to visually separate without shouting.
  feeds: {
    bar: "#3E7C7A",
    border: "transparent",
    bg: "rgba(62,124,122,0.16)",
    pulseClass: "animate-turn-pulse-practices",
    barPulseClass: "animate-bar-pulse-practices",
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Count prayers-for that will actually make it into the slideshow.
// Mirrors prayer-mode.tsx's filter exactly: drop server-expired AND
// prayers on their final day (daysLeft === 0). The People-page CTA
// uses the same cutoff — a prayer on Day N of N reads "done" there,
// so the slideshow (and therefore the invite popup's count) should
// not include it either. Before this helper was used, the daily
// prayer invite card said "7 prayers waiting" while the actual
// slideshow had 6 slides, which the user flagged directly.
function countActivePrayersFor(prayersFor: Array<{ id: number; expired: boolean; expiresAt: string }> | undefined): number {
  if (!prayersFor) return 0;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let n = 0;
  for (const p of prayersFor) {
    if (p.expired) continue;
    const expires = new Date(p.expiresAt);
    if (Number.isNaN(expires.getTime())) { n++; continue; }
    const expiresDay = new Date(expires.getFullYear(), expires.getMonth(), expires.getDate());
    const daysLeft = Math.max(0, Math.round((expiresDay.getTime() - todayStart.getTime()) / 86400000));
    if (daysLeft > 0) n++;
  }
  return n;
}

function nextDayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  const now = new Date();
  const tomorrow = addDays(startOfDay(now), 1);
  if (startOfDay(date).getTime() === tomorrow.getTime()) return "Tomorrow";
  // Weeks are Sun→Sat (date-fns default with no `weekStartsOn`). If the
  // date falls in the *next* calendar week, prefix with "next" so a
  // Wednesday five days out from Friday reads "next Wednesday" instead
  // of an ambiguous "Wednesday".
  const nextWeekStart = startOfWeek(addWeeks(now, 1));
  const nextWeekEnd = endOfWeek(addWeeks(now, 1));
  if (date >= nextWeekStart && date <= nextWeekEnd) {
    return `Next ${format(date, "EEEE")}`;
  }
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
  "lectio-divina": "📜",
  "custom": "🌱",
};

// ─── Service schedules (e.g. Sunday Services) ───────────────────────────────

type ServiceTime = { label: string; time: string; location?: string };

type ServiceSchedule = {
  id: number;
  groupId: number;
  groupName: string;
  groupSlug: string;
  groupEmoji: string | null;
  name: string;
  // Schedule-level location — single "where" for the whole schedule,
  // cycled through the dashboard card's split-flap line. Optional; per-time
  // locations still win when a given service happens elsewhere.
  location?: string | null;
  dayOfWeek: number; // 0=Sun..6=Sat
  times: ServiceTime[];
};

const DAY_OF_WEEK_NAMES: Record<number, string> = {
  0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday",
};

function nextOccurrenceDate(dayOfWeek: number, today: Date = new Date()): Date {
  const out = startOfDay(today);
  const diff = (dayOfWeek - out.getDay() + 7) % 7;
  return addDays(out, diff);
}

// Compute the next upcoming date/time for a ritual gathering. Prefers the
// server-computed `nextMeetupDate` (from the first planned meetup or the
// streak engine). Falls back to rolling `dayPreference` forward by the
// ritual's rhythm so a freshly created gathering — where the first meetup
// has already passed or hasn't been created yet — still anchors to a
// sensible upcoming slot, the same way ServiceCard renders one.
function computeNextGatheringDate(r: {
  nextMeetupDate?: string | null;
  dayPreference?: string | null;
  rhythm?: string | null;
  frequency?: string | null;
}): Date | null {
  if (r.nextMeetupDate) {
    try { return parseISO(r.nextMeetupDate); } catch { /* fall through */ }
  }
  if (!r.dayPreference) return null;
  // dayPreference is stored as an ISO datetime (first pick from tradition-new).
  let anchor: Date;
  try { anchor = parseISO(r.dayPreference); } catch { return null; }
  if (!Number.isFinite(anchor.getTime())) return null;

  const now = new Date();
  if (anchor.getTime() > now.getTime()) return anchor;

  // Anchor already passed — roll forward by the cadence until it's in the future.
  const cadence = (r.rhythm || r.frequency || "weekly").toLowerCase();
  const stepDays = cadence === "monthly" ? null // handled separately
    : cadence === "biweekly" || cadence === "fortnightly" ? 14
    : cadence === "one-time" || cadence === "once" ? 0
    : 7; // weekly is the default

  if (stepDays === 0) return anchor; // one-time gatherings just stay pinned to their moment

  const out = new Date(anchor);
  if (stepDays === null) {
    // Monthly — bump month by month until we're in the future.
    while (out.getTime() <= now.getTime()) {
      out.setMonth(out.getMonth() + 1);
    }
  } else {
    const diffMs = now.getTime() - out.getTime();
    const periods = Math.ceil(diffMs / (stepDays * 24 * 60 * 60 * 1000));
    out.setDate(out.getDate() + periods * stepDays);
    if (out.getTime() <= now.getTime()) {
      out.setDate(out.getDate() + stepDays);
    }
  }
  return out;
}

function formatServiceTime(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  h = ((h + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}

// ─── Dashboard item union type ──────────────────────────────────────────────

type DashboardItem =
  | { kind: "letter"; data: Correspondence }
  | { kind: "moment"; data: Moment; nextWindow?: string }
  | { kind: "gathering"; data: any; badge?: string }
  | { kind: "service"; data: ServiceSchedule; nextDate: Date; isOnDate: boolean }
  | { kind: "feed"; data: SubscribedFeed };

// Shape returned by GET /api/prayer-feeds/subscribed — one row per feed I
// subscribe to, with the entry (if any) for today already attached.
type SubscribedFeed = {
  feed: {
    id: number;
    slug: string;
    title: string;
    tagline: string | null;
    coverEmoji: string | null;
    subscriberCount: number;
  };
  todayEntry: {
    id: number;
    entryDate: string;
    title: string;
    body: string | null;
    scriptureRef: string | null;
    prayCount: number;
  } | null;
  prayedToday: boolean;
};

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
  const [communityAdminView] = useCommunityAdminToggle();
  const { isBeta } = useBetaStatus();
  const { data: groupsData } = useQuery<{ groups: Array<{ myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });
  const isAdminOfAny = (groupsData?.groups ?? []).some(g => g.myRole === "admin" || g.myRole === "hidden_admin");
  const showAdminMenu = isAdminOfAny && communityAdminView;

  // Only community admins (with admin-view on) see the dashboard FAB.
  // We used to also surface a prayer-feed-only FAB to any beta user, but
  // that leaked the button to pilot viewers who shouldn't be starting
  // anything from the home screen — the FAB is an admin affordance.
  // Beta admins still see the prayer-feed option inside the menu below.
  if (!showAdminMenu) return null;

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
            {showAdminMenu && (
              <>
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
              </>
            )}
            {isBeta && (
              <button
                onClick={() => { setOpen(false); setLocation("/prayer-feeds/new"); }}
                className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
                style={{ background: "#193F2A", border: `1px solid ${CATEGORY_COLORS.practices.border}`, minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
              >
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🕊️ Start a prayer feed</p>
                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>A cause with a new intention every day</p>
              </button>
            )}
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

// ─── Profile-picture prompt (one-shot overlay) ───────────────────────────────
// Shown on the dashboard the first time a user without an avatar lands here
// AFTER having finished onboarding. Mirrors the onboarding slide's look at a
// more compact scale so it feels like the same moment, just carried forward.
// "Skip" and "Upload" both close the prompt permanently — any action implies
// "I've seen this." Users can add a photo anytime from Settings → Account.

function ProfilePicturePrompt({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  // Inflight PATCH so the Save & close button can await it and we
  // never dismiss with the server still un-saved. `null` = nothing
  // pending. Same pattern as the onboarding ProfilePictureSlide fix.
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    setSaveError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 512;
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setUploading(false); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        setPreview(dataUrl);
        pendingSaveRef.current = apiRequest("PATCH", "/api/auth/me/profile", { avatarUrl: dataUrl })
          .then(() => {
            queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) => {
              if (!prev) return prev;
              return { ...prev, avatarUrl: dataUrl };
            });
          })
          .catch((err) => {
            setSaveError(err?.message ?? "Couldn't save your photo. Try again?");
            throw err;
          })
          .finally(() => setUploading(false));
      };
      img.onerror = () => { setUploading(false); setSaveError("Couldn't read that image."); };
      img.src = reader.result as string;
    };
    reader.onerror = () => { setUploading(false); setSaveError("Couldn't read that image."); };
    reader.readAsDataURL(file);
  }

  async function handleSaveAndClose() {
    if (pendingSaveRef.current) {
      try {
        await pendingSaveRef.current;
      } catch {
        // Error already surfaced via saveError; don't dismiss.
        return;
      }
    }
    onDone();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={onDone}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.25 }}
        className="rounded-2xl px-8 pt-7 pb-6 text-center max-w-sm w-full"
        style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)" }}
        onClick={e => e.stopPropagation()}
      >
        <h2
          className="text-lg font-bold mb-2"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Add your face
        </h2>
        <p className="text-sm leading-relaxed mb-6" style={{ color: "#8FAF96" }}>
          A photo helps the people praying with you feel like they're praying with you.
        </p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="relative mx-auto mb-5 block transition-opacity active:opacity-80 disabled:opacity-60"
        >
          {preview ? (
            <img
              src={preview}
              alt="Your photo"
              className="w-24 h-24 rounded-full object-cover"
              style={{ border: "3px solid rgba(46,107,64,0.5)" }}
            />
          ) : (
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold"
              style={{
                background: "#1A4A2E",
                color: "#A8C5A0",
                border: "3px solid rgba(46,107,64,0.35)",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
          )}
          <span
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "#2D5E3F", border: "3px solid #0F2818" }}
          >
            {uploading ? (
              <span className="text-[10px]" style={{ color: "#F0EDE6" }}>…</span>
            ) : (
              <Camera size={14} style={{ color: "#F0EDE6" }} />
            )}
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoSelect}
        />

        {preview ? (
          <button
            onClick={handleSaveAndClose}
            disabled={uploading}
            className="w-full px-6 py-2.5 rounded-full text-sm font-semibold transition-opacity disabled:opacity-60 mb-2"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            {uploading ? "Saving…" : "Save & close"}
          </button>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-6 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 mb-2"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Upload a photo
          </button>
        )}
        {saveError && (
          <p className="text-[11px] mb-2" style={{ color: "#D98C4A" }}>
            {saveError}
          </p>
        )}
        <button
          onClick={onDone}
          className="text-xs transition-opacity hover:opacity-80"
          style={{ color: "rgba(143,175,150,0.55)" }}
        >
          Skip for now — I'll add one later
        </button>
      </motion.div>
    </motion.div>
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
  const [, setLocation] = useLocation();
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

  const lastLetter = c.recentLetters?.[0] ?? null;
  const sentDateLine = lastLetter?.sentAt
    ? `Sent ${format(parseISO(lastLetter.sentAt), "MMM d")}`
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
          // Use an onClick-driven span instead of a nested wouter <Link>.
          // BarCard already wraps its contents in a <Link> (<a>), and nested
          // anchors are invalid HTML — Safari was rendering a phantom second
          // rounded shape behind this pill. Navigating via setLocation keeps
          // the click target inside the outer anchor without creating one.
          <span
            role="button"
            tabIndex={0}
            onClick={(e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              setLocation(`/letters/${c.id}/write`);
            }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                setLocation(`/letters/${c.id}/write`);
              }
            }}
            className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0 cursor-pointer whitespace-nowrap"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Write 🖋️
          </span>
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
  const [, setLocation] = useLocation();
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
  } else if (m.group?.name) {
    // Group-attached practices: show the community name rather than listing
    // individual members. Members come and go; the community is the anchor.
    // Lead with the group emoji so the attribution reads as the circle's
    // own voice on the card's second line.
    subtitle = `${m.group.emoji ? `${m.group.emoji} ` : ""}From ${m.group.name}`;
  } else if (memberNames) subtitle = `with ${memberNames}`;
  else if (m.fastingFrom) subtitle = `Fasting from ${m.fastingFrom}`;

  // Meat fast enrichment — the flap now rotates through three lines that
  // read top-to-bottom: this week's water saved, all time water saved, and
  // either "Next fast on …" when today isn't a fast day or "Fasted today ✓"
  // once the viewer has logged the current fast. The all-time line is what
  // gives the card its long-horizon weight — the number grows forever, so
  // even a single-person community still feels the impact accumulate.
  const meatFastWaterLine = isMeatFast && (m.weekGallonsSaved ?? 0) > 0
    ? `💧 ${(m.weekGallonsSaved ?? 0).toLocaleString()} gallons saved this week`
    : "";
  const meatFastAllTimeLine = isMeatFast && (m.allTimeGallonsSaved ?? 0) > 0
    ? `💧 ${(m.allTimeGallonsSaved ?? 0).toLocaleString()} gallons saved all time`
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

  // Previously intercessions routed their Pray pill to the standalone
  // /moment/:token/:userToken "Amen" screen — a quick tap page that sat
  // outside the rest of the detail context. The detail page (/moments/:id)
  // now carries the full prayer + community ritual the user wants to land
  // on, so both the card and the Pray pill fall through to openHref.
  const prayHref: string | null = null;

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
  // On a fasting day we show the whole-group progress ("N of M fasted
  // today") rather than just the viewer's own status — the card's
  // purpose is communal accountability, not a private "you logged it"
  // chip. On non-fast days we fall back to the "Next fast on …"
  // preview. `nextWindow` is null/empty when today IS the fast day, so
  // its presence is the reliable "is today the day" signal.
  const meatFastTodayCountLine = isMeatFast && !nextWindow && m.memberCount > 0
    ? `${m.todayPostCount} ${m.todayPostCount === 1 ? "person" : "people"} fasted today`
    : "";
  const fastingFlapLines: string[] = isMeatFast
    ? [
        meatFastWaterLine,
        meatFastAllTimeLine,
        meatFastTodayCountLine || meatFastNextLine,
      ]
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
        ) : !isIntercession && !isFasting && m.currentStreak > 0 ? (
          // For intercessions and fasts, the group streak (via progressLabel
          // above) is authoritative — m.currentStreak is a DB field that can
          // be stale (corrupted by double-bloom bugs, or left over from a
          // chain that has since broken). Never fall back to it for those
          // types; a group streak of 0 should render as no badge, not as
          // "3 day streak" from yesterday's stale data.
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
            // Nested <Link> would double-wrap <a>; use setLocation instead so
            // the outer BarCard anchor stays clean (prevents Safari phantom
            // pill artifacts).
            <motion.span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLocation(prayHref ?? openHref);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setLocation(prayHref ?? openHref);
                }
              }}
              className="text-xs font-semibold rounded-full inline-block cursor-pointer"
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
          ) : isIntercession && m.todayPostCount > 0 && m.windowOpen ? (
            // Already prayed today — show View pill so they can revisit the circle
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setLocation(openHref);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setLocation(openHref);
                }
              }}
              className="text-xs font-semibold rounded-full inline-block cursor-pointer"
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

function GatheringCard({
  r,
  keyPrefix,
  badge,
  onOpen,
}: {
  r: any;
  keyPrefix: string;
  badge?: string;
  onOpen: () => void;
}) {
  void badge;
  const next = computeNextGatheringDate(r);
  const isToday_ = next ? isToday(next) : false;

  // Look up the host community so the top-right eyebrow matches
  // ServiceCard ("⛪ Community Name"). Reads from the cached /api/groups
  // query — React Query dedupes, so this doesn't add a fetch.
  const { data: groupsCache } = useQuery<{ groups: Array<{ id: number; name: string; emoji: string | null }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });
  const hostGroup = r.groupId
    ? (groupsCache?.groups ?? []).find((g) => g.id === r.groupId) ?? null
    : null;

  const colors = CATEGORY_COLORS.gatherings;

  // Plain-text subtitle, mirroring ServiceTimesPillRow. Tap opens a
  // modal with the full details (same pattern as ServiceCard); no
  // navigation — feels like a Sunday Services card.
  //
  // We deliberately DON'T show the location on the card — it duplicates
  // the community-name eyebrow in the corner (same physical address) and
  // clutters the row. Location lives in the modal pop-up instead.
  const timeLabel = next ? `${nextDayLabel(next)} · ${format(next, "h:mm a")}` : null;

  return (
    <div
      key={`${keyPrefix}-${r.id}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="block w-full text-left"
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${isToday_ ? colors.pulseClass : ""}`}
        style={{
          background: colors.bg,
          border: "1px solid rgba(111,175,133,0.35)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className={`w-1 flex-shrink-0 ${isToday_ ? colors.barPulseClass : ""}`}
          style={{ background: isToday_ ? undefined : colors.bar }}
        />
        <div className="flex-1 px-4 pt-3 pb-3 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <span className="text-base font-semibold truncate" style={{ color: "#F0EDE6" }}>
              {r.name}
            </span>
            {hostGroup && (
              <span
                className="text-[10px] font-semibold uppercase shrink-0 mt-1"
                style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}
              >
                {hostGroup.emoji ?? "⛪"} {hostGroup.name}
              </span>
            )}
          </div>

          {timeLabel && (
            <div className="mt-2 text-xs font-medium" style={{ color: "#C8D4C0", letterSpacing: "-0.01em" }}>
              {timeLabel}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Gathering detail modal ─────────────────────────────────────────────────
// Mirrors ServiceDetailModal: tapping a gathering card pops this up with
// title, host community, next meetup day/time, location, and description.
// No calendar-style busywork, no route change — just the facts someone
// would want when they glance at the card.

function GatheringDetailModal({ r, onClose }: { r: any; onClose: () => void }) {
  const next = computeNextGatheringDate(r);
  const dateLabel = next
    ? (isToday(next) ? "Today" : format(next, "EEEE, MMM d"))
    : null;
  const timeLabel = next ? format(next, "h:mm a") : null;
  const locationLabel = r.nextMeetupLocation ?? r.location ?? null;
  const description = (r.description ?? r.intention ?? "") as string;

  const { data: groupsCache } = useQuery<{ groups: Array<{ id: number; name: string; emoji: string | null; slug: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });
  const hostGroup = r.groupId
    ? (groupsCache?.groups ?? []).find((g) => g.id === r.groupId) ?? null
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 pt-16"
        style={{ background: "rgba(8,16,10,0.8)" }}
      >
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
          style={{ background: "#0F2618", border: "1px solid rgba(111,175,133,0.25)" }}
        >
          <div className="sticky top-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3" style={{ background: "#0F2618" }}>
            <div className="min-w-0">
              {hostGroup && (
                <Link href={`/communities/${hostGroup.slug}`} onClick={onClose}>
                  <p
                    className="text-[11px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-80 cursor-pointer"
                    style={{ color: "rgba(200,212,192,0.55)" }}
                  >
                    {hostGroup.emoji ?? "⛪"} {hostGroup.name}
                  </p>
                </Link>
              )}
              <h2 className="text-xl font-bold mt-1 break-words" style={{ color: "#F0EDE6", letterSpacing: "-0.01em" }}>
                {r.name}
              </h2>
              {dateLabel && (
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>{dateLabel}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-full p-1.5 transition-opacity hover:opacity-80"
              style={{ background: "rgba(200,212,192,0.08)", color: "#C8D4C0" }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-5 pb-5 pt-1 flex flex-col gap-2">
            {timeLabel && (
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: "rgba(111,175,133,0.10)", border: "1px solid rgba(111,175,133,0.2)" }}
              >
                <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{timeLabel}</p>
                {locationLabel && (
                  <p className="text-[12px] mt-0.5" style={{ color: "#8FAF96" }}>📍 {locationLabel}</p>
                )}
              </div>
            )}
            {!timeLabel && locationLabel && (
              <p className="text-sm" style={{ color: "#C8D4C0" }}>📍 {locationLabel}</p>
            )}
            {description.trim() && (
              <p
                className="text-sm leading-relaxed mt-1"
                style={{ color: "#C8D4C0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                {description}
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Service times pill row ────────────────────────────────────────────────
// Measures actual overflow on the inner pill row and switches to a seamless
// auto-scroll ticker whenever the static row wouldn't fit. We do this at
// runtime rather than using a pill-count threshold because "too many pills"
// depends entirely on the viewport width and the labels the parish chose —
// a 2-pill row with long labels can still overflow a narrow phone, and a
// 5-pill row of bare times can still fit on a wide screen.
//
// Implementation detail: render the static row once in a hidden measurement
// wrapper, compare scrollWidth to clientWidth on mount + resize, then flip
// to the ticker version if the content overflows. The ticker duplicates the
// pill list so the CSS keyframe can translate from 0 to -50% and seam.

function ServiceTimesPillRow({ schedule, nextDate }: { schedule: ServiceSchedule; nextDate: Date }) {
  // Static teaser: "<Month D> — Tap to See All Service Times". Rotating
  // pills and scrollable strips both fought the clickable card wrapper,
  // and a plain line honors the tap target.
  if (schedule.times.length === 0) return null;
  const dateLabel = nextDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return (
    <div className="mt-2 text-xs font-medium" style={{ color: "#F0EDE6", letterSpacing: "-0.01em" }}>
      <span style={{ color: "#C8D4C0" }}>{dateLabel}</span>
      <span style={{ color: "rgba(200,212,192,0.6)" }}> — </span>
      <span>Tap to See All Service Times</span>
    </div>
  );
}

// ─── Service card ───────────────────────────────────────────────────────────
// A single card on the dashboard representing a community's weekly service
// schedule. Shows group + schedule name and a teaser of the first service
// time. Clicking fires onOpen to reveal every time in the schedule.

function ServiceCard({
  schedule,
  nextDate,
  isOnDate,
  onOpen,
  keyPrefix,
}: {
  schedule: ServiceSchedule;
  nextDate: Date;
  isOnDate: boolean;
  onOpen: () => void;
  keyPrefix: string;
}) {
  const colors = CATEGORY_COLORS.gatherings;
  const title = schedule.name || DAY_OF_WEEK_NAMES[schedule.dayOfWeek] + " Services";

  // Layout:
  //   Top row:     🙌🏽 Title            {emoji} Community
  //   Time pills:  [8:00 AM] [10:00 AM] [6:00 PM]      ← one pill per service time
  //   Sub line:    cycles through (date, location) — the community used to
  //                 be in this rotation but now sits in the top-right so the
  //                 sub line stays focused on the *when & where* facts.
  //
  // Title emoji is 🙌🏽 (hands lifted in worship) rather than a church
  // building — the card is about *gathering to worship together*, not
  // about a specific building, and many hosts aren't churches anyway.
  // Card stays minimal: title + pills only. The date is already implied
  // by the section header (Today / Tomorrow / This week), and the
  // address lives inside the ServiceDetailModal that opens on tap. No
  // flap rotation needed anymore.

  return (
    <div
      key={`${keyPrefix}-service-${schedule.id}`}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="block w-full text-left"
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${isOnDate ? colors.pulseClass : ""}`}
        style={{
          background: colors.bg,
          // CATEGORY_COLORS.gatherings.border is "transparent" — which
          // makes the card blend into the dashboard background, same
          // bug the PrayerListCard already worked around. Use the
          // category's accent bar color at reduced opacity so the
          // border reads as a soft gatherings-green without fighting
          // the card's hue.
          border: "1px solid rgba(111,175,133,0.35)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className={`w-1 flex-shrink-0 ${isOnDate ? colors.barPulseClass : ""}`}
          style={{ background: isOnDate ? undefined : colors.bar }}
        />
        <div className="flex-1 px-4 pt-3 pb-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>🙌🏽 {title}</span>
            {/* Top-right: community eyebrow — replaces the old "SERVICE
                TIMES" label. Emoji + name from the schedule's host group
                so the user knows at a glance which community this card
                belongs to. */}
            <span
              className="text-[10px] font-semibold uppercase shrink-0 mt-1"
              style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}
            >
              {schedule.groupEmoji ?? "⛪"} {schedule.groupName}
            </span>
          </div>

          {/* Per-time pill row — each service time renders as its own
              mini-card. We measure actual overflow at runtime (not pill
              count) and switch to an auto-scroll ticker only when the
              static row wouldn't fit on the card's width. That way a
              2-service parish on a narrow phone scrolls if the pills
              overflow, while a 5-service parish on a wide screen still
              renders statically when there's room. */}
          {schedule.times.length > 0 && (
            <ServiceTimesPillRow schedule={schedule} nextDate={nextDate} />
          )}

        </div>
      </motion.div>
    </div>
  );
}

// ─── Prayer-list fallback card ──────────────────────────────────────────────
// Shown in the Today section when nothing else is pending there but the user
// still has prayers queued in their slideshow. Gives them a clear next step
// ("pray for N people") instead of an empty home screen, and surfaces their
// streak in the top-right corner as gentle reinforcement of the habit.

function PrayerListCard({
  pendingCount,
  streak,
  keyPrefix,
  muted = false,
  prayedToday = false,
  partialRemaining = 0,
  faces,
}: {
  pendingCount: number;
  streak: number;
  keyPrefix: string;
  // When true, the card renders without pulse. Used when the user
  // has already finished today.
  muted?: boolean;
  // When true, swap to the restful state: italic serif confirmation
  // in the subtitle slot and "Pray again" in the bottom-right CTA
  // slot instead of "Pray". Card keeps the same dimensions + accent
  // bar + streak chip so the home-screen anchor stays put.
  prayedToday?: boolean;
  // Third state: > 0 when the user prayed SOME of today's slides but
  // not all. Subtitle becomes "{N} more prayers" and CTA flips to
  // "Continue praying". 0 means either fresh (use the default
  // "X waiting" subtitle) or fully done (prayedToday handles that).
  // The slideshow itself opens at the first un-prayed slide so this
  // count matches what they'll see when they tap through.
  partialRemaining?: number;
  // Up to 3 avatars of people whose prayers appear in today's
  // slideshow. Rendered on line 2 before the count text. Empty
  // array = no avatars shown.
  faces?: Array<{ key: string; name: string; avatarUrl: string | null }>;
}) {
  const colors = CATEGORY_COLORS.practices;
  const isPartial = partialRemaining > 0 && !prayedToday;
  const subtitle = isPartial
    ? (partialRemaining === 1 ? "1 more prayer" : `${partialRemaining} more prayers`)
    : (pendingCount === 1 ? "1 prayer waiting for you" : `${pendingCount} prayers waiting for you`);

  return (
    <Link key={`${keyPrefix}-prayer-list`} href="/prayer-mode" className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${muted || prayedToday ? "" : colors.pulseClass}`}
        style={{
          background: colors.bg,
          // Explicit practices-green border — the shared CATEGORY_COLORS
          // border is "transparent", which reads as borderless on the
          // dashboard and makes the prayer-list card visually disappear
          // next to the fasting card (which sets its own border).
          border: "1px solid rgba(46,107,64,0.45)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        {muted || prayedToday ? (
          <div className="w-1 flex-shrink-0" style={{ background: colors.bar }} />
        ) : (
          <div className={`w-1 flex-shrink-0 ${colors.barPulseClass}`} />
        )}
        <div className="flex-1 px-4 pt-3 pb-3">
          {/* Line 1: title + "View list" pill (top-right corner).
              View list takes the user to /prayer-list — the
              management surface for their prayer items. The tap
              on the outer card still routes to /prayer-mode via
              the wrapping Link; View list's stopPropagation
              diverts the tap to the management page. */}
          <div className="flex items-start justify-between gap-2">
            <span
              className="text-base font-semibold"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              🕯️ Daily Prayer List
            </span>
            <Link
              href="/prayer-list"
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase transition-opacity hover:opacity-80"
              style={{
                color: "#C8D4C0",
                background: "rgba(200,212,192,0.08)",
                border: "1px solid rgba(143,175,150,0.35)",
                letterSpacing: "0.08em",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              View list
            </Link>
          </div>

          {/* Line 2: avatar stack + count on the left, streak on
              the right. Avatars are a small face row (up to 3,
              overlapping) of people whose prayers are queued in
              today's slideshow — anchors the count to real people.
              Streak moved off Line 1 to sit aligned with the View
              list pill above it and the CTA below it. */}
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {faces && faces.length > 0 && (
                <div className="flex items-center -space-x-2 shrink-0">
                  {faces.slice(0, 3).map((f) => (
                    <div
                      key={f.key}
                      title={f.name}
                      className="rounded-full overflow-hidden shrink-0"
                      style={{
                        width: 22, height: 22,
                        border: "1.5px solid #0F2818",
                        background: "#1A4A2E",
                      }}
                    >
                      {f.avatarUrl ? (
                        <img
                          src={f.avatarUrl}
                          alt={f.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-[9px] font-semibold"
                          style={{ color: "#A8C5A0" }}
                        >
                          {f.name
                            .split(" ")
                            .slice(0, 2)
                            .map((w) => w[0]?.toUpperCase() ?? "")
                            .join("")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p
                className="text-sm truncate"
                style={{
                  color: "#8FAF96",
                  lineHeight: "20px",
                  margin: 0,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {prayedToday
                  ? (pendingCount === 1 ? "1 prayer prayed today" : `${pendingCount} prayers prayed today`)
                  : subtitle}
              </p>
            </div>
            {streak > 0 && (
              // Pill mirrors the View list chip size so both sit
              // flush to the same right edge of the card.
              <span
                className="shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums"
                style={{
                  color: "#E8A94C",
                  background: "rgba(232,169,76,0.10)",
                  border: "1px solid rgba(232,169,76,0.30)",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
                aria-label={`${streak}-day prayer streak`}
              >
                🔥 {streak}
              </span>
            )}
          </div>

          {/* Line 3: full-width CTA.
                - Not prayed → "Pray →"
                - Prayed    → "Pray again →" (lighter tone so the
                  card still reads 'done' but the option is there)
              The outer Link already wraps the whole card so the
              button itself isn't an extra tap target — it's a
              visible affordance that mirrors the slideshow entry. */}
          {!muted && (
            <div
              className="mt-3 w-full rounded-xl text-center"
              style={{
                background: prayedToday ? "rgba(111,175,133,0.22)" : "#4A7A5B",
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: "-0.01em",
                padding: "7px 16px",
                border: prayedToday
                  ? "1px solid rgba(111,175,133,0.35)"
                  : "1px solid rgba(111,175,133,0.45)",
              }}
            >
              {prayedToday ? "Pray again" : isPartial ? "Continue praying" : "Pray"}
              <span aria-hidden> →</span>
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Prayer-feed today card ─────────────────────────────────────────────────
// Dashboard card for a prayer feed I'm subscribed to. Mirrors ServiceCard's
// left-bar + content layout, using the `feeds` category color. Taps through
// to the feed detail page where Pray is wired up.
//
// Two modes:
//   - todayEntry present: big card announcing today's intention. Pulses if
//     I haven't prayed yet.
//   - no todayEntry: quiet card saying the creator hasn't published today.
//     We still render so the subscription stays visible.

function FeedTodayCard({
  sf,
  keyPrefix,
}: {
  sf: SubscribedFeed;
  keyPrefix: string;
}) {
  const colors = CATEGORY_COLORS.feeds;
  const pulse = !!sf.todayEntry && !sf.prayedToday;
  const href = `/prayer-feeds/${sf.feed.slug}`;
  const emoji = sf.feed.coverEmoji ?? "🕊️";
  const eyebrow = sf.todayEntry
    ? (sf.prayedToday ? "Prayed today" : "Praying today")
    : "Subscribed";
  const title = sf.todayEntry?.title ?? sf.feed.title;
  const subtitle = sf.todayEntry
    ? `${sf.todayEntry.prayCount} ${sf.todayEntry.prayCount === 1 ? "person" : "people"} praying · ${sf.feed.title}`
    : (sf.feed.tagline ?? "No new intention today");

  return (
    <Link
      key={`${keyPrefix}-feed-${sf.feed.id}`}
      href={href}
      className="block"
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow ${pulse ? colors.pulseClass : ""}`}
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className={`w-1 flex-shrink-0 ${pulse ? colors.barPulseClass : ""}`}
          style={{ background: pulse ? undefined : colors.bar }}
        />
        <div className="flex-1 px-4 pt-3 pb-2">
          <div className="flex items-start justify-between gap-2">
            <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
              {emoji} {title}
            </span>
            <span className="text-[10px] font-semibold uppercase shrink-0 mt-1" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
              {eyebrow}
            </span>
          </div>
          <div className="mt-1.5">
            <p className="text-sm" style={{ color: "#8FAF96", lineHeight: "20px", margin: 0 }}>
              {subtitle}
            </p>
            {sf.todayEntry?.scriptureRef && (
              <p className="text-[11px] mt-0.5 italic" style={{ color: "rgba(200,212,192,0.55)", letterSpacing: "0.01em" }}>
                {sf.todayEntry.scriptureRef}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Service detail modal ───────────────────────────────────────────────────
// Full list of every service time in a group's schedule. Opened from
// ServiceCard; dismissed by tapping the backdrop or the close button.

function ServiceDetailModal({
  schedule,
  nextDate,
  onClose,
}: {
  schedule: ServiceSchedule;
  nextDate: Date;
  onClose: () => void;
}) {
  const dayName = DAY_OF_WEEK_NAMES[schedule.dayOfWeek] ?? "Sunday";
  const dateLabel = isToday(nextDate) ? "Today" : format(nextDate, "EEEE, MMM d");
  const title = schedule.name || `${dayName} Services`;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-6 pt-16"
        style={{ background: "rgba(8,16,10,0.8)" }}
      >
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
          style={{ background: "#0F2618", border: "1px solid rgba(111,175,133,0.25)" }}
        >
          <div className="sticky top-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3" style={{ background: "#0F2618" }}>
            <div>
              {/* Community eyebrow — tap to open the community page.
                  Keeps the modal consistent with the rest of the app:
                  every "from {community}" attribution should navigate. */}
              {schedule.groupSlug ? (
                <Link
                  href={`/communities/${schedule.groupSlug}`}
                  onClick={onClose}
                >
                  <p
                    className="text-[11px] font-semibold uppercase tracking-widest transition-opacity hover:opacity-80 cursor-pointer"
                    style={{ color: "rgba(200,212,192,0.55)" }}
                  >
                    {schedule.groupEmoji ?? "⛪"} {schedule.groupName}
                  </p>
                </Link>
              ) : (
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.55)" }}>
                  {schedule.groupEmoji ?? "⛪"} {schedule.groupName}
                </p>
              )}
              <h2 className="text-xl font-bold mt-1" style={{ color: "#F0EDE6", letterSpacing: "-0.01em" }}>
                {title}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>{dateLabel}</p>
              {/* Parish address — moved here from the card so the
                  dashboard stays quiet; surfaces when someone actually
                  wants details. */}
              {schedule.location && schedule.location.trim() && (
                <p className="text-sm mt-1.5" style={{ color: "#C8D4C0" }}>
                  📍 {schedule.location.trim()}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-full p-1.5 transition-opacity hover:opacity-80"
              style={{ background: "rgba(200,212,192,0.08)", color: "#C8D4C0" }}
            >
              <X size={16} />
            </button>
          </div>

          <div className="px-5 pb-5 pt-1">
            {schedule.times.length === 0 ? (
              <p className="text-sm" style={{ color: "#8FAF96" }}>No service times yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {schedule.times.map((t, idx) => (
                  <li
                    key={idx}
                    className="rounded-xl px-4 py-3 flex items-start justify-between gap-3"
                    style={{ background: "rgba(111,175,133,0.10)", border: "1px solid rgba(111,175,133,0.2)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
                        {formatServiceTime(t.time)}
                      </p>
                      {t.label && (
                        <p className="text-[13px] mt-0.5" style={{ color: "#C8D4C0" }}>{t.label}</p>
                      )}
                      {t.location && (
                        <p className="text-[12px] mt-0.5" style={{ color: "#8FAF96" }}>📍 {t.location}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Generic time section (Today / This week / This month) ──────────────────

function TimeSection({
  label,
  items,
  userEmail,
  userName,
  onOpenService,
  onOpenGathering,
  trailingCards,
}: {
  label: string;
  items: DashboardItem[];
  userEmail: string;
  userName: string;
  onOpenService: (schedule: ServiceSchedule, nextDate: Date) => void;
  onOpenGathering: (r: any) => void;
  // Extra cards to render after the typed items (e.g. the PrayerListCard
  // when the user already finished today's list and we want to preview
  // tomorrow's). If there are no items and no trailingCards, the section
  // hides itself so empty days stay quiet.
  trailingCards?: React.ReactNode;
}) {
  if (items.length === 0 && !trailingCards) return null;

  const letterItems = items.filter(i => i.kind === "letter") as Array<Extract<DashboardItem, { kind: "letter" }>>;
  const momentItems = items.filter(i => i.kind === "moment") as Array<Extract<DashboardItem, { kind: "moment" }>>;
  const gatheringItems = items.filter(i => i.kind === "gathering") as Array<Extract<DashboardItem, { kind: "gathering" }>>;
  const serviceItems = items.filter(i => i.kind === "service") as Array<Extract<DashboardItem, { kind: "service" }>>;
  const feedItems = items.filter(i => i.kind === "feed") as Array<Extract<DashboardItem, { kind: "feed" }>>;

  // Letters where it's the user's turn (or there are unread letters) always
  // render as individual cards. Passive letters collapse into a summary
  // card when there are 2+ of them, otherwise they render individually.
  const actionLetters = letterItems.filter(
    i => i.data.unreadCount > 0 || i.data.turnState === "OPEN" || i.data.turnState === "OVERDUE"
  );
  const passiveLetters = letterItems.filter(
    i => !(i.data.unreadCount > 0 || i.data.turnState === "OPEN" || i.data.turnState === "OVERDUE")
  );
  const showPassiveAsSummary = passiveLetters.length >= 2;

  const visibleCardCount =
    momentItems.length +
    actionLetters.length +
    (showPassiveAsSummary ? 1 : passiveLetters.length) +
    serviceItems.length +
    feedItems.length +
    gatheringItems.length +
    (trailingCards ? 1 : 0);
  const scrollable = visibleCardCount > 3;

  const cards = (
    <div className="space-y-3">
      {actionLetters.map((item) => (
        <LetterCard
          key={`${label}-l-${item.data.id}`}
          c={item.data}
          userEmail={userEmail}
          userName={userName}
          keyPrefix={label}
        />
      ))}
      {serviceItems.map((item) => (
        <ServiceCard
          key={`${label}-s-${item.data.id}`}
          schedule={item.data}
          nextDate={item.nextDate}
          isOnDate={item.isOnDate}
          onOpen={() => onOpenService(item.data, item.nextDate)}
          keyPrefix={label}
        />
      ))}
      {gatheringItems.map((item) => (
        <GatheringCard
          key={`${label}-g-${item.data.id}`}
          r={item.data}
          keyPrefix={label}
          badge={item.badge}
          onOpen={() => onOpenGathering(item.data)}
        />
      ))}
      {feedItems.map((item) => (
        <FeedTodayCard
          key={`${label}-f-${item.data.feed.id}`}
          sf={item.data}
          keyPrefix={label}
        />
      ))}
      {momentItems.map((item) => (
        <MomentCard key={`${label}-m-${item.data.id}`} m={item.data} userEmail={userEmail} keyPrefix={label} nextWindow={item.nextWindow} />
      ))}
      {showPassiveAsSummary ? (
        <LetterSummaryCard
          key={`${label}-l-summary`}
          correspondences={passiveLetters.map(i => i.data)}
          userEmail={userEmail}
        />
      ) : (
        passiveLetters.map((item) => (
          <LetterCard
            key={`${label}-l-${item.data.id}`}
            c={item.data}
            userEmail={userEmail}
            userName={userName}
            keyPrefix={label}
          />
        ))
      )}
      {trailingCards}
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
  // Service-schedule modal: which schedule (and computed next occurrence) is
  // currently showing its full list of service times.
  const [openService, setOpenService] = useState<{ schedule: ServiceSchedule; nextDate: Date } | null>(null);
  // Gathering-detail modal: tapping a GatheringCard pops this up instead
  // of navigating to the full ritual page. Same pattern as openService.
  const [openGathering, setOpenGathering] = useState<any | null>(null);
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
    // Intentionally disabled — the one-time pilot welcome was too noisy on
    // first launch. The only auto-popups we keep on the home screen now
    // are (a) the daily "N prayers waiting for you" slideshow invite and
    // (b) engagement-driven popups like the new-letter notice.
    if (isBeta && !betaWelcomeShownRef.current && !localStorage.getItem("phoebe:beta-welcome-seen")) {
      betaWelcomeShownRef.current = true;
      // setBetaWelcomeVisible(true); // disabled
    }
  }, [isBeta]);

  const dismissBetaWelcome = useCallback(() => {
    setBetaWelcomeVisible(false);
    localStorage.setItem("phoebe:beta-welcome-seen", "1");
  }, []);

  // Profile-picture prompt for existing users who finished onboarding before
  // we added the avatar slide. Shown once — any action (upload OR skip) sets
  // the localStorage flag. New users reach this code path with the flag
  // already set by the onboarding slide's completion. Users who re-install
  // or switch browsers will see it once per browser, which is the desired
  // "at least once" behavior: a gentle nudge, never nagging.
  const [profilePicPromptVisible, setProfilePicPromptVisible] = useState(false);
  const profilePicPromptShownRef = useRef(false);
  useEffect(() => {
    // Intentionally disabled — the profile-picture upload prompt was
    // shifted to onboarding only. On the home screen we keep only the
    // prayer-slideshow and engagement popups (new letter, etc).
    if (!user) return;
    if (profilePicPromptShownRef.current) return;
    if (user.avatarUrl) return;
    if (localStorage.getItem("phoebe:profile-pic-prompted") === "1") return;
    if (!user.onboardingCompleted) return;
    if (betaWelcomeVisible) return;
    profilePicPromptShownRef.current = true;
    // setProfilePicPromptVisible(true); // disabled
  }, [user, betaWelcomeVisible]);

  const dismissProfilePicPrompt = useCallback(() => {
    setProfilePicPromptVisible(false);
    localStorage.setItem("phoebe:profile-pic-prompted", "1");
  }, []);

  // Daily prayer-slideshow invite state. The effect that populates it is
  // declared further down, AFTER the momentsData useQuery call — placing it
  // before would read momentsData in the effect's dep array while it's
  // still in the TDZ, crashing the first render.
  const [prayerInviteVisible, setPrayerInviteVisible] = useState(false);
  const [prayerInviteCount, setPrayerInviteCount] = useState(0);

  // Local-timezone YYYY-MM-DD. Used as the once-per-day gate; sent to the
  // server so the stamp follows the account across devices rather than
  // living in each device's localStorage.
  function todayLocalKey(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const dismissPrayerInvite = useCallback(() => {
    setPrayerInviteVisible(false);
    // Account-level stamp happens at show-time; this just hides the modal.
  }, []);

  const beginPrayerInvite = useCallback(() => {
    dismissPrayerInvite();
    setLocation("/prayer-mode");
  }, [dismissPrayerInvite, setLocation]);

  // ── "You have a new letter" popup ──────────────────────────────────────
  // Queued behind the daily prayer-invite and the beta-welcome so only one
  // modal is ever visible. Fires when any correspondence returns
  // unreadCount > 0 AND the viewer hasn't already dismissed that particular
  // set this session. Dismiss stores the current set of unread correspondence
  // ids so subsequent visits are quiet until a new one arrives.
  const [newLetterPopup, setNewLetterPopup] = useState<{
    correspondenceId: number;
    correspondenceName: string;
    fromAuthor: string | null;
    sentAt: string | null;
    totalUnread: number;
  } | null>(null);
  const newLetterHandledThisSessionRef = useRef(false);

  useEffect(() => {
    const reset = () => setFilter(null);
    const setPracticesFilter = () => setFilter("practices");
    window.addEventListener("phoebe:reset-filter", reset);
    // Sidebar's "Practices" nav item dispatches this so it behaves like the
    // dashboard's Practices filter pill even when we're already on /dashboard
    // (wouter doesn't re-mount on a same-path query change).
    window.addEventListener("phoebe:filter-practices", setPracticesFilter);
    return () => {
      window.removeEventListener("phoebe:reset-filter", reset);
      window.removeEventListener("phoebe:filter-practices", setPracticesFilter);
    };
  }, []);

  // Cross-page nav from the sidebar's "Practices" item writes a sessionStorage
  // flag before navigating. Read + clear it on mount.
  useEffect(() => {
    try {
      if (sessionStorage.getItem("phoebe:pending-filter") === "practices") {
        sessionStorage.removeItem("phoebe:pending-filter");
        setFilter("practices");
      }
    } catch { /* ignore */ }
  }, []);

  const { data: momentsData, isLoading: momentsLoading } = useQuery<{ moments: Moment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user,
    // Always refetch when the dashboard mounts so that renew / archive
    // mutations from the detail page are reflected immediately.
    staleTime: 0,
  });

  // ── Daily prayer-slideshow invite ────────────────────────────────────────
  // Declared here, AFTER momentsData, because the effect's dep array reads
  // momentsData and would otherwise blow up on first render with a
  // "Cannot access uninitialized variable" (TDZ).
  type DashPrayerRequest = {
    id: number; isAnswered: boolean; isOwnRequest?: boolean; closedAt?: string | null;
    ownerId?: number; ownerName?: string | null; ownerAvatarUrl?: string | null; isAnonymous?: boolean;
  };
  type DashPrayerFor = {
    id: number; expired: boolean; expiresAt: string;
    recipientEmail?: string; recipientName?: string; recipientAvatarUrl?: string | null;
  };
  type DashCircleIntention = { id: number; groupId: number };

  const { data: dashPrayerRequests, isLoading: dashPrayerRequestsLoading } = useQuery<DashPrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user,
  });
  const { data: dashPrayersFor, isLoading: dashPrayersForLoading } = useQuery<DashPrayerFor[]>({
    queryKey: ["/api/prayers-for/mine"],
    queryFn: () => apiRequest("GET", "/api/prayers-for/mine"),
    enabled: !!user,
  });
  // Circle intentions — shared prayer intentions inside every prayer circle
  // the user belongs to. Each intention is its own prayer (a circle can have
  // many intentions), so we count rows, not circles.
  const { data: dashCircleIntentions, isLoading: dashCircleIntentionsLoading } =
    useQuery<{ intentions: DashCircleIntention[] }>({
      queryKey: ["/api/groups/me/circle-intentions"],
      queryFn: () => apiRequest("GET", "/api/groups/me/circle-intentions"),
      enabled: !!user,
    });

  // Communities the viewer is in. One pill per community renders in the
  // category strip above — tapping a pill routes straight to that
  // community's detail page. Replaces the old generic "Communities" pill.
  type DashGroup = { id: number; name: string; slug: string; emoji: string | null };
  const { data: dashGroups } = useQuery<{ groups: DashGroup[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });

  // In-session latch — even if momentsData refetches and re-runs the effect,
  // we never re-trigger the popup within the same page load.
  const prayerInviteHandledThisSessionRef = useRef(false);

  // Local copy of the prayer-streak query. React Query dedupes by key,
  // so this shares the cache entry with the canonical declaration lower
  // down in the component — no double fetch. We need `loggedToday` here
  // (above the `prayerListDoneToday` computation) to gate the popup.
  const { data: popupStreakData } = useQuery<{ loggedToday?: boolean }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const popupLoggedToday = popupStreakData?.loggedToday ?? false;

  useEffect(() => {
    if (!user) return;
    if (prayerInviteHandledThisSessionRef.current) return;

    // Wait for the beta-welcome popup to be dismissed first so we never
    // stack two modals on top of each other on a new user's very first
    // visit. The ref is NOT set here, so once betaWelcomeVisible flips to
    // false this effect re-runs naturally.
    if (betaWelcomeVisible) return;

    // CRITICAL: wait until every query has finished loading. Previously the
    // effect fired as each query resolved independently — if /prayers-for/mine
    // arrived first with 1 item and /moments was still pending, the count
    // computed as "1" and the popup locked in before the other data arrived.
    // Also wait for popupStreakData so we don't pester someone who already
    // prayed today just because the streak query hadn't resolved yet.
    if (momentsLoading || dashPrayerRequestsLoading || dashPrayersForLoading || dashCircleIntentionsLoading) return;
    if (popupStreakData === undefined) return;

    const today = todayLocalKey();

    // Gate #1 — they've already prayed today. Don't pester. We also accept
    // Authoritative signal is the server's per-viewer loggedToday
    // flag. Previous fallback checked todayPostCount on every
    // intercession, but that's a GLOBAL count — it marked brand-new
    // users as "already prayed" if they'd just joined a community
    // whose intercessions had already been prayed by existing
    // members. Dropped.
    if (popupLoggedToday) {
      prayerInviteHandledThisSessionRef.current = true;
      return;
    }

    // Gate #2 — the popup has already been shown once today (any
    // device). "Once per local calendar day" is the user-level rule:
    // anyone who hasn't done the slideshow today should see this
    // popup exactly one time. We key on the server-stamped local
    // date string rather than a rolling N-hour timestamp so the
    // window matches the user's subjective "today".
    if (user.prayerInviteLastShownDate === today) {
      prayerInviteHandledThisSessionRef.current = true;
      return;
    }

    // A single prayer circle (intercession moment) can hold many intentions —
    // each intention is its own prayer in the slideshow. Count intentions
    // when they exist; only fall back to counting the circle itself for
    // intercession moments that have zero intentions yet (legacy circles
    // still driven by the old single-intention field).
    const circleIntentions = dashCircleIntentions?.intentions ?? [];
    const intentionCountByGroup = new Map<number, number>();
    for (const i of circleIntentions) {
      intentionCountByGroup.set(i.groupId, (intentionCountByGroup.get(i.groupId) ?? 0) + 1);
    }
    let activeIntercessions = 0;
    // `moments` was previously destructured in an earlier refactor step
    // then dropped when the block was trimmed — left this loop referencing
    // an undeclared identifier. A user reported a 'Can't find variable:
    // moments' crash in production. Re-declare from momentsData.
    const moments = momentsData?.moments ?? [];
    for (const m of moments) {
      if (m.templateType !== "intercession") continue;
      const gid = m.group?.id;
      const intentions = gid ? (intentionCountByGroup.get(gid) ?? 0) : 0;
      // Each intention is its own slide; circles with no intentions still
      // count once for the legacy single-topic flow.
      activeIntercessions += intentions > 0 ? intentions : 1;
    }
    // Circles we're in but that aren't surfaced as moments (e.g. the user
    // just joined and hasn't fetched) — don't double-count; skip.
    const othersRequests = (dashPrayerRequests ?? []).filter(
      r => !r.isAnswered && !r.isOwnRequest && !r.closedAt,
    ).length;
    // Match prayer-mode's filter exactly: drop server-expired AND
    // final-day prayers (daysLeft === 0). Previously the dashboard
    // counted every non-expired prayer-for, but the slideshow hides
    // the final-day ones, so the popup claimed "7 prayers waiting"
    // while the user saw 6 slides — the user flagged that directly.
    const activePrayersFor = countActivePrayersFor(dashPrayersFor);
    const total = activeIntercessions + othersRequests + activePrayersFor;

    // Show the invite to anyone who hasn't already prayed today.
    // Previously we additionally required `total > 0` (at least one
    // prayer waiting), which meant a brand-new user in a community
    // with no intercessions silently missed the popup. The user
    // explicitly asked: "anyone who has not gone through their
    // prayer list slideshow today gets a pop up just once". We now
    // show it unconditionally once per calendar day (gate #1 above
    // still suppresses it if they've already prayed).
    const shouldShow = true;

    if (shouldShow) {
      // Stamp BEFORE show (fire-and-forget) so a tab-close / reload
      // before dismiss still prevents a second popup today. We send
      // both the local date (used by the gate above) and let the
      // server derive the timestamp from its own now().
      const nowIso = new Date().toISOString();
      apiRequest("PATCH", "/api/auth/me/prayer-invite-shown", { date: today })
        .then(() => queryClient.setQueryData<typeof user>(["/api/auth/me"], prev =>
          prev ? {
            ...prev,
            prayerInviteLastShownDate: today,
            prayerInviteLastShownAt: nowIso,
          } : prev,
        ))
        .catch(() => { /* best-effort; next load will try again */ });
      prayerInviteHandledThisSessionRef.current = true;
      setPrayerInviteCount(total);
      setPrayerInviteVisible(true);
    }
    // If total === 0 we DON'T stamp — a later visit in the same day with
    // a queued prayer should still get a chance to see the popup.
  }, [user, betaWelcomeVisible, momentsData, momentsLoading, dashPrayerRequests, dashPrayerRequestsLoading, dashPrayersFor, dashPrayersForLoading, dashCircleIntentions, dashCircleIntentionsLoading, queryClient, popupLoggedToday, popupStreakData]);

  // Correspondences — drives both the "you have a new letter" popup and
  // the letter cards mixed into the Today / This week / This month buckets.
  const { data: dashCorrespondences, isLoading: dashCorrespondencesLoading } = useQuery<Correspondence[]>({
    queryKey: ["/api/phoebe/correspondences"],
    queryFn: async () => {
      // Same fallback the LettersPage uses — the route was renamed and some
      // deployments still serve only the legacy path.
      try {
        return await apiRequest("GET", "/api/phoebe/correspondences");
      } catch {
        return await apiRequest("GET", "/api/letters/correspondences");
      }
    },
    enabled: !!user,
  });

  // Service schedules — one card per schedule on the dashboard; each schedule
  // can hold many service times but surfaces as a single card. Click the
  // card to see every time in the schedule.
  const { data: serviceSchedulesData } = useQuery<{ schedules: ServiceSchedule[] }>({
    queryKey: ["/api/me/service-schedules"],
    queryFn: () => apiRequest("GET", "/api/me/service-schedules"),
    enabled: !!user,
  });
  const serviceSchedules = serviceSchedulesData?.schedules ?? [];

  // Subscribed prayer feeds — beta only. Each row carries the feed plus
  // (optionally) today's entry and whether I've already prayed today, so
  // the dashboard card can render without a second hop.
  const { data: subscribedFeedsData } = useQuery<{ subscriptions: SubscribedFeed[] }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    enabled: !!user && isBeta,
  });
  const subscribedFeeds = subscribedFeedsData?.subscriptions ?? [];

  // Gatherings / traditions the user owns or participates in. Enriched
  // rows already carry `nextMeetupDate`, so bucketing into Today /
  // Tomorrow / This week is the same pattern as service schedules.
  const { data: ritualsData } = useQuery<any[]>({
    queryKey: ["/api/rituals", user?.id],
    queryFn: () => apiRequest("GET", `/api/rituals?ownerId=${user!.id}`),
    enabled: !!user,
  });
  const rituals = ritualsData ?? [];

  // Prayer-list streak (consecutive days finishing a full slideshow) — used
  // by the Today-empty fallback card to reward the habit.
  const { data: prayerStreakData } = useQuery<{ streak: number; lastPrayedDate: string | null; loggedToday?: boolean }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const prayerStreak = prayerStreakData?.streak ?? 0;
  // "Have they prayed today?" is now strictly the server's per-viewer
  // loggedToday flag. We used to fall back to "every intercession has
  // todayPostCount > 0", but todayPostCount is the GLOBAL count of
  // posts on that intercession — so a brand-new user who joined a
  // community whose intercessions had already been prayed by other
  // members landed on the dashboard with "Pray again" before they'd
  // prayed a single time. Dropping the fallback. Edge case where the
  // server flag lags is acceptable — one refresh cycle at worst.
  const prayerListDoneToday = prayerStreakData?.loggedToday ?? false;

  // Pending-prayer count — how many prayers are in the user's slideshow
  // right now. Same computation the invite-popup uses, but memoized so the
  // dashboard can show it on a fallback card regardless of whether the
  // popup fires.
  const pendingPrayerCount = useMemo(() => {
    const moments = momentsData?.moments ?? [];
    const circleIntentions = dashCircleIntentions?.intentions ?? [];
    const intentionCountByGroup = new Map<number, number>();
    for (const i of circleIntentions) {
      intentionCountByGroup.set(i.groupId, (intentionCountByGroup.get(i.groupId) ?? 0) + 1);
    }
    let activeIntercessions = 0;
    for (const m of moments) {
      if (m.templateType !== "intercession") continue;
      const gid = m.group?.id;
      const intentions = gid ? (intentionCountByGroup.get(gid) ?? 0) : 0;
      activeIntercessions += intentions > 0 ? intentions : 1;
    }
    const othersRequests = (dashPrayerRequests ?? []).filter(
      r => !r.isAnswered && !r.isOwnRequest && !r.closedAt,
    ).length;
    const activePrayersFor = countActivePrayersFor(dashPrayersFor);
    return activeIntercessions + othersRequests + activePrayersFor;
  }, [momentsData, dashCircleIntentions, dashPrayerRequests, dashPrayersFor]);

  // Detect new unread letters. Runs once per session. The localStorage key
  // stores the *set* of correspondence ids that were already shown unread
  // on last dismiss — a new unread correspondence id (or a previously-read
  // one that has new mail again) re-triggers the popup.
  useEffect(() => {
    if (!user) return;
    if (newLetterHandledThisSessionRef.current) return;
    if (dashCorrespondencesLoading) return;

    const seenIds = (() => {
      try {
        const raw = localStorage.getItem("phoebe:letters-seen-unread-ids");
        if (!raw) return new Set<number>();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set<number>(parsed.filter((n): n is number => typeof n === "number"));
      } catch { /* ignore */ }
      return new Set<number>();
    })();

    const withUnread = (dashCorrespondences ?? []).filter(c => c.unreadCount > 0);
    if (withUnread.length === 0) {
      newLetterHandledThisSessionRef.current = true;
      return;
    }

    // Pick the most recent unread correspondence that hasn't been seen yet.
    // Sort by most recent letter so the popup highlights the newest arrival.
    const unseen = withUnread.filter(c => !seenIds.has(c.id));
    if (unseen.length === 0) {
      newLetterHandledThisSessionRef.current = true;
      return;
    }

    const pickLatestLetter = (c: Correspondence): number => {
      const stamps = (c.recentLetters ?? [])
        .map(p => Date.parse(p.sentAt))
        .filter(ms => Number.isFinite(ms));
      return stamps.length ? Math.max(...stamps) : 0;
    };
    unseen.sort((a, b) => pickLatestLetter(b) - pickLatestLetter(a));
    const primary = unseen[0];
    const latestLetter = (primary.recentLetters ?? [])
      .slice()
      .sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt))[0] ?? null;

    newLetterHandledThisSessionRef.current = true;
    setNewLetterPopup({
      correspondenceId: primary.id,
      correspondenceName: primary.name,
      fromAuthor: latestLetter?.authorName ?? null,
      sentAt: latestLetter?.sentAt ?? null,
      totalUnread: withUnread.reduce((acc, c) => acc + c.unreadCount, 0),
    });
  }, [user, dashCorrespondences, dashCorrespondencesLoading]);

  const dismissNewLetterPopup = useCallback(() => {
    setNewLetterPopup(null);
    try {
      const unreadIds = (dashCorrespondences ?? [])
        .filter(c => c.unreadCount > 0)
        .map(c => c.id);
      localStorage.setItem("phoebe:letters-seen-unread-ids", JSON.stringify(unreadIds));
    } catch { /* ignore quota / private-mode */ }
  }, [dashCorrespondences]);

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

  const { todayItems, tomorrowItems, weekItems, monthItems, totalCount } = useMemo(() => {
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
    const tomorrowItems: DashboardItem[] = [];
    const weekItems: DashboardItem[] = [];
    const monthItems: DashboardItem[] = [];

    // "This week" is a rolling next-7-days window (not a calendar Sun→Sat
    // week). So on Wednesday, "This week" covers Thu–next Wed.
    const sevenDaysFromToday = addDays(startOfDay(new Date()), 7);

    // ── Moments placement
    // isActionableToday → Today section. For beta users, a new Tomorrow
    // bucket catches practices that aren't actionable today but are
    // actionable tomorrow. Everything else goes to This week / This month
    // based on the next occurrence date.
    //
    // Beta-only: intercessions that have already been prayed today are
    // hidden entirely (not just moved to Tomorrow / This week). They
    // "disappear" once completed, matching the "done, quiet for the rest
    // of the day" feel the user asked for.
    // Fasting has its own cadence fields (`fastingDay` etc.) that aren't
    // always reflected in the generic frequency/dayOfWeek used by
    // server-side isActionable. Client-side we recompute for fasts so
    // bucketing is correct regardless of server deploy state.
    const todayDowLocal = new Date().getDay();
    const tomorrowDowLocal = (todayDowLocal + 1) % 7;
    const isFastActionableOnDow = (m: Moment, dow: number): boolean => {
      if (m.templateType !== "fasting") return false;
      if (m.fastingDay) {
        const wanted = DOW_LC[m.fastingDay.toLowerCase()];
        if (wanted !== undefined) return wanted === dow;
      }
      // Fallback: generic dayOfWeek / practiceDays (matches server logic).
      let rawDays: string[] = [];
      try { rawDays = m.practiceDays ? (JSON.parse(m.practiceDays) as string[]) : []; } catch { /* */ }
      if (!rawDays.length && m.dayOfWeek) rawDays = [m.dayOfWeek];
      return rawDays.some(d => {
        const up = d.toUpperCase();
        if (RRULE_DOW[up] !== undefined) return RRULE_DOW[up] === dow;
        return DOW_LC[d.toLowerCase()] === dow;
      });
    };

    for (const m of visibleMoments) {
      const isLectio = m.templateType === "lectio-divina";
      const isIntercession = m.templateType === "intercession";
      const isFasting = m.templateType === "fasting";

      // Intercessions never appear as individual cards on the home
      // dashboard — they live inside the prayer list (slideshow). The
      // PrayerListCard surfaces the aggregated count of prayers waiting,
      // so the user taps once to move through them all. This supersedes
      // the earlier "hide if already prayed today" rule: the intention
      // is that intercessions ONLY exist in the list, not as clutter on
      // the home screen.
      if (isIntercession) continue;

      const userDone = isLectio ? !!m.lectioMyStageDone : m.todayPostCount > 0;

      // Fasting override: decide Today/Tomorrow/elsewhere from the fasting
      // fields directly, ignoring server-side isActionable flags which
      // don't always know about fasting cadence.
      if (isFasting) {
        const fastToday = isFastActionableOnDow(m, todayDowLocal);
        const fastTomorrow = isFastActionableOnDow(m, tomorrowDowLocal);
        // A fast on a fasting day stays in Today for the whole day, even
        // after the user has logged it. The fast itself continues — the
        // card serves as a visible reminder / status strip, not just an
        // action surface. Done state is still reflected inside the card
        // (streak, "fasted today" chip, etc.).
        if (fastToday) {
          todayItems.push({ kind: "moment", data: m });
          continue;
        }
        if (fastTomorrow) {
          tomorrowItems.push({ kind: "moment", data: m, nextWindow: "Tomorrow" });
          continue;
        }
        // Not today/tomorrow — fall through to week/month bucket below.
      } else {
        if (m.isActionableToday && !userDone) {
          todayItems.push({ kind: "moment", data: m });
          continue;
        }

        // Tomorrow bucket. We surface practices that will be actionable
        // tomorrow in their TZ — whether they're done for today or simply
        // not a practice day today. Gives the user a heads-up without
        // waiting for the day to flip.
        if (m.isActionableTomorrow) {
          tomorrowItems.push({ kind: "moment", data: m, nextWindow: "Tomorrow" });
          continue;
        }
      }

      const label = nextWindowLabel(m);
      const daysAhead = nextWindowDaysAhead(m);
      const nextDate = addDays(startOfDay(new Date()), daysAhead);
      if (isBefore(nextDate, sevenDaysFromToday)) {
        weekItems.push({ kind: "moment", data: m, nextWindow: label });
      } else {
        monthItems.push({ kind: "moment", data: m, nextWindow: label });
      }
    }

    // ── Letters placement
    // Only actionable correspondences (unread, my turn, overdue) surface on
    // the dashboard. Letters I'm waiting on the other side for stay parked
    // in /letters — showing them here just creates guilt with no action.
    for (const c of (dashCorrespondences ?? [])) {
      const actionable =
        c.unreadCount > 0 ||
        c.myTurn ||
        c.turnState === "OPEN" ||
        c.turnState === "OVERDUE";
      if (actionable) {
        todayItems.push({ kind: "letter", data: c });
      }
    }

    // ── Service schedules placement
    // Next occurrence today → Today. Within 7 days → This week. Else This
    // month. Each schedule is ONE card regardless of how many service
    // times it contains.
    const todayStart = startOfDay(new Date()).getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const tomorrowStart = todayStart + oneDayMs;
    const sevenDaysOutMs = todayStart + 7 * oneDayMs;
    for (const s of serviceSchedules) {
      if (!s.times.length) continue;
      const next = nextOccurrenceDate(s.dayOfWeek);
      const nextMs = next.getTime();
      const isOnDate = nextMs === todayStart;
      const item: DashboardItem = { kind: "service", data: s, nextDate: next, isOnDate };
      if (isOnDate) todayItems.push(item);
      else if (nextMs === tomorrowStart) tomorrowItems.push(item);
      else if (nextMs < sevenDaysOutMs) weekItems.push(item);
      else monthItems.push(item);
    }

    // ── Prayer feeds placement (beta)
    // Feeds with a published entry for today that I haven't yet prayed → Today.
    // After I pray, the feed quiets down (same pattern as intercessions).
    // Subscribed feeds without a today entry go to This week so the card
    // stays visible but low-priority.
    for (const sf of subscribedFeeds) {
      const item: DashboardItem = { kind: "feed", data: sf };
      if (sf.todayEntry && !sf.prayedToday) {
        todayItems.push(item);
      } else if (!sf.todayEntry) {
        weekItems.push(item);
      }
      // If there's a todayEntry and I already prayed, the card goes quiet
      // for the rest of the day (drop entirely).
    }

    // ── Gatherings / traditions placement
    // Bucket by nextMeetupDate: today → Today, tomorrow → Tomorrow,
    // within 7 days → This week, else → This month. Rituals without a
    // next meetup (unscheduled) still render, parked in This month so
    // the creator can finish setup from the card.
    for (const r of rituals) {
      // Same helper the card uses — server nextMeetupDate first, then
      // dayPreference rolled forward by rhythm. This keeps a freshly
      // created Wednesday Meal out of the This month bucket and into
      // Today / Tomorrow / This week, matching how ServiceCard lands.
      const next = computeNextGatheringDate(r);
      const item: DashboardItem = { kind: "gathering", data: r };
      if (!next) {
        monthItems.push(item);
        continue;
      }
      const nextMs = startOfDay(next).getTime();
      if (nextMs === todayStart) todayItems.push(item);
      else if (nextMs === tomorrowStart) tomorrowItems.push(item);
      else if (nextMs < sevenDaysOutMs) weekItems.push(item);
      else monthItems.push(item);
    }

    return { todayItems, tomorrowItems, weekItems, monthItems, totalCount };
  }, [momentsData, user, dashCorrespondences, serviceSchedules, subscribedFeeds, rituals, isBeta]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
    if (!authLoading && user && !user.onboardingCompleted) setLocation("/onboarding");
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
      {/* Daily prayer-slideshow invite — shown once per calendar day when
          the user has prayers queued up. Takes priority over beta welcome. */}
      <AnimatePresence>
        {prayerInviteVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
            onClick={dismissPrayerInvite}
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
              <p className="text-4xl mb-4">🙏</p>
              <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
                Daily Prayer List
              </p>
              <h2
                className="text-xl font-bold mb-6"
                style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {prayerInviteCount > 0
                  ? `${prayerInviteCount} ${prayerInviteCount === 1 ? "prayer" : "prayers"} waiting for you`
                  : "Time for your daily prayer"}
              </h2>
              <div className="flex flex-col gap-2.5">
                <button
                  onClick={beginPrayerInvite}
                  className="px-6 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  Begin praying →
                </button>
                <button
                  onClick={dismissPrayerInvite}
                  className="px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  Continue to home
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "You have a new letter" popup — queued after the daily prayer-invite
          and the beta-welcome so only one modal ever shows at a time. The
          gate on prayerInviteVisible/betaWelcomeVisible keeps us last in
          line: while either is open, this one waits. */}
      <AnimatePresence>
        {newLetterPopup && !prayerInviteVisible && !betaWelcomeVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
            onClick={dismissNewLetterPopup}
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
              <p className="text-4xl mb-4">📮</p>
              <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
                {newLetterPopup.totalUnread > 1 ? `${newLetterPopup.totalUnread} new letters` : "A new letter"}
              </p>
              <h2
                className="text-xl font-bold mb-4"
                style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {newLetterPopup.fromAuthor
                  ? `From ${newLetterPopup.fromAuthor}`
                  : newLetterPopup.correspondenceName}
              </h2>

              {newLetterPopup.sentAt && (
                <p className="text-[12px] mb-5" style={{ color: "rgba(143,175,150,0.65)" }}>
                  {format(new Date(newLetterPopup.sentAt), "MMM d")}
                </p>
              )}

              <div className="flex flex-col gap-2.5">
                <button
                  onClick={() => {
                    const id = newLetterPopup.correspondenceId;
                    dismissNewLetterPopup();
                    setLocation(`/letters/${id}`);
                  }}
                  className="px-6 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-90"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  Read letter →
                </button>
                <button
                  onClick={dismissNewLetterPopup}
                  className="px-6 py-2.5 text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  Later
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Beta welcome popup — one-time */}
      <AnimatePresence>
        {profilePicPromptVisible && (
          <ProfilePicturePrompt onDone={dismissProfilePicPrompt} />
        )}

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
                Welcome to the pilot
              </h2>
              <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
                You've been added as a pilot user. You now have access to early features as they roll out.
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
        {/* Eyebrow ("A Place Set Apart…") removed per product
            direction — the liturgical date/feast IS the header now.
            Extra bottom margin sits between the feast subtitle and
            the pill strip so the feast has room to breathe. */}
        <div className="mb-8">
          <LiturgicalDateHeader />

          {/* Menu pill strip removed — nav lives in the side Menu. */}

          {/* Persistent daily prayer list card — same PrayerListCard
              used elsewhere, just routed through its `prayedToday`
              variant so the subtitle/CTA adapt. Lives here as the
              home-screen anchor and is filter-gated. */}
          {filter === null && (pendingPrayerCount > 0 || prayerStreak > 0) && (() => {
            // Up to 3 avatars of people whose prayers are in the
            // viewer's slideshow today. Source: non-own open prayer
            // request authors + active prayers-for recipients.
            // Deduped, cap 3.
            type Face = { key: string; name: string; avatarUrl: string | null };
            const faces: Face[] = [];
            const seen = new Set<string>();
            const addFace = (key: string, name: string, avatarUrl: string | null) => {
              if (!key || seen.has(key) || faces.length >= 3) return;
              seen.add(key);
              faces.push({ key, name, avatarUrl });
            };
            for (const r of dashPrayerRequests ?? []) {
              if (r.isAnswered || r.isOwnRequest || r.closedAt || r.isAnonymous) continue;
              const key = `req-${r.ownerId ?? r.id}`;
              addFace(key, r.ownerName ?? "Someone", r.ownerAvatarUrl ?? null);
            }
            for (const p of dashPrayersFor ?? []) {
              if (p.expired) continue;
              const key = `pfor-${p.recipientEmail ?? p.id}`;
              addFace(key, p.recipientName ?? "Someone", p.recipientAvatarUrl ?? null);
            }
            return (
              <div className="mt-5">
                <PrayerListCard
                  pendingCount={pendingPrayerCount}
                  streak={prayerStreak}
                  prayedToday={prayerListDoneToday}
                  faces={faces}
                  keyPrefix="anchor"
                />
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
          const fTomorrow = tomorrowItems.filter(byFilter);
          const fWeek = weekItems.filter(byFilter);
          const fMonth = monthItems.filter(byFilter);
          const filteredEmpty = filter !== null && fToday.length === 0 && fTomorrow.length === 0 && fWeek.length === 0 && fMonth.length === 0;

          return (
            <AnimatePresence mode="wait">
              <motion.div
                key={filter ?? "all"}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                {/* 1. Today. The daily-prayer anchor card now lives
                    under the feast line up top, so the Today section
                    no longer carries a trailing PrayerListCard — it's
                    just the day's practice/gathering items. */}
                <TimeSection
                  label="Today"
                  items={fToday}
                  userEmail={userEmail}
                  userName={userName}
                  onOpenService={(schedule, nextDate) => setOpenService({ schedule, nextDate })}
                  onOpenGathering={(r) => setOpenGathering(r)}
                />

                {/* 2. Tomorrow. Practice items actionable tomorrow.
                    No longer carries a trailing PrayerListCard — the
                    persistent daily-prayer anchor card at the top of
                    the page covers that. Other card kinds (fasting,
                    practices, etc.) still land here. Empty sections
                    stay hidden. */}
                <TimeSection
                  label="Tomorrow"
                  items={fTomorrow}
                  userEmail={userEmail}
                  userName={userName}
                  onOpenService={(schedule, nextDate) => setOpenService({ schedule, nextDate })}
                  onOpenGathering={(r) => setOpenGathering(r)}
                />

                {/* 3. Upcoming (was "This week") */}
                <TimeSection label="Upcoming" items={fWeek} userEmail={userEmail} userName={userName} onOpenService={(schedule, nextDate) => setOpenService({ schedule, nextDate })} onOpenGathering={(r) => setOpenGathering(r)} />

                {/* 4. This month */}
                <TimeSection label="This month" items={fMonth} userEmail={userEmail} userName={userName} onOpenService={(schedule, nextDate) => setOpenService({ schedule, nextDate })} onOpenGathering={(r) => setOpenGathering(r)} />

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

      {openService && (
        <ServiceDetailModal
          schedule={openService.schedule}
          nextDate={openService.nextDate}
          onClose={() => setOpenService(null)}
        />
      )}

      {openGathering && (
        <GatheringDetailModal
          r={openGathering}
          onClose={() => setOpenGathering(null)}
        />
      )}
    </Layout>
  );
}
