import { useState, useEffect, useMemo, useCallback, useRef, isValidElement } from "react";
import { Link, useLocation } from "wouter";
import { Plus, X, Camera } from "lucide-react";
import { LEAF_PHOTOS, HOME_LEAF_PHOTOS, WATER_PHOTOS } from "@/lib/earthPhotos";
import { useHomeTheme } from "@/lib/homeTheme";
import { FROST } from "@/lib/frost";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus, useCommunityAdminToggle } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { ScrollStrip } from "@/components/ScrollStrip";
import { usePodcastPlayer } from "@/components/PodcastPlayer";
import { useFollowedShows, type FollowedShow } from "@/lib/podcastHome";
import { LiturgicalDateHeader } from "@/components/LiturgicalDateHeader";
import { CommunityRuleOfferBeta } from "@/components/CommunityRuleOfferBeta";
import { GuestWelcomeCard } from "@/components/GuestWelcomeCard";
import { DailyProgressBody, rhythmGradientRgb } from "@/components/DailyProgressBody";
import { HomeLearnSection } from "@/components/HomeLearnSection";
import { WeeklyRhythm } from "@/components/WeeklyRhythm";
import { apiRequest } from "@/lib/queryClient";
import { openExternal, openExternalThenMarkRead } from "@/lib/openExternal";
import { getNcmpState, getSideLevel, setSideLevel, getFddMode, getPsalmCycle, OFFICE_PREFS_EVENT, useEffectiveReflectionSource } from "@/lib/officePrefs";
import { hasContemplationSideDoneToday, CONTEMPLATION_SIDE_DONE_EVENT } from "@/lib/contemplationSideDone";
import { CREATION_PRAYER_ENABLED } from "@/lib/creationFlag";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";
import { seedGuestRule } from "@/lib/guestSeed";
import { useGuestMode } from "@/hooks/useGuestMode";
import { isNativeShell } from "@/lib/isNativeShell";
import { isFirstOpen } from "@/lib/firstOpen";
import { shouldShowFirstOpenOnboarding, isFirstOpenOnboardingActive, FIRST_OPEN_ONBOARDING_CLOSED_EVENT } from "@/lib/firstOpenOnboarding";
import { scheduleCascadeHaptics } from "@/lib/cascadeHaptics";
import { useRhythmState } from "@/hooks/useRhythmState";
import {
  CAC_TODAY_URL, CAC_READ_EVENT, hasReadCacToday, recordCacOpened,
  FDD_TODAY_URL, FDD_READ_EVENT, hasReadFddToday, recordFddOpened,
  SSJE_TODAY_URL, SSJE_READ_EVENT, hasReadSsjeToday, recordSsjeOpened,
  PSALMS_READ_EVENT, hasPrayedPsalmsToday,
} from "@/lib/cacReadState";
import { FeedEventCard, type FeedEvent } from "@/components/FeedEventCard";
import { PrayerListComposeBar } from "@/pages/prayer-list";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import { BetaRhythmExtras } from "@/components/BetaRhythmExtras";
import { ParishWeeklyCard } from "@/components/ParishWeeklyCard";
// Office-progress reading + LiturgyMode now live on /prayer-chooser
// (the new dedicated screen) — the dashboard card itself only renders
// the time-of-day eyebrow + CTA copy and links into the chooser.

import { format, isToday, parseISO, addDays, isBefore, startOfDay, startOfWeek, endOfWeek, addWeeks, differenceInCalendarDays } from "date-fns";

// ─── Shared types ─────────────────────────────────────────────────────────────

export type Moment = {
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
  // Set when the intercession is scoped to a prayer feed (e.g. the Anglican
  // Cycle of Prayer / Diocese calendars) instead of a group. The feed object
  // carries its title for the home prayer-list row's eyebrow.
  prayerFeedId?: number | null;
  feed?: { id: number; title: string; slug: string } | null;
  todayPostCount: number;
  // Whether THIS user has prayed/checked-in on this moment today (any
  // moment_post of theirs, incl. a check-in). Unlike todayPostCount — which is
  // the GLOBAL count of everyone's posts — this is the correct "did I pray it"
  // flag for an intercession's done state. Backend: /api/moments → todayILogged.
  myPrayedToday?: boolean;
  windowOpen: boolean;
  isActionableToday: boolean;
  isActionableTomorrow: boolean;
  intercessionTopic?: string | null;
  intercessionFullText?: string | null;
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
    border: "rgba(142,158,66,0.35)",
    bg: "rgba(20,64,42,0.25)",
    pulseClass: "animate-turn-pulse-letters",
    barPulseClass: "animate-bar-pulse-letters",
  },
  practices: {
    bar: "#2E6B40",
    border: "rgba(111,175,133,0.35)",
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

// How many prayers the user will pray THROUGH in their slideshow right now —
// the exact set the office's intercession handoff reads (community
// intercessions + open requests INCLUDING the user's own — the main slideshow
// walks those as "Your prayer"). Reuses the same
// query keys, so it shares React Query's cache (no extra fetches). The office
// card shows this so its "N prayers" matches the slideshow.
function useSlideshowPrayerCount(): number {
  const { data: moments } = useQuery<{ moments: Array<{ templateType?: string | null; group?: { id?: number } | null }> }>({
    queryKey: ["/api/moments"], queryFn: () => apiRequest("GET", "/api/moments"), staleTime: 60_000,
  });
  const { data: circle } = useQuery<{ intentions: Array<{ groupId: number }> }>({
    queryKey: ["/api/groups/me/circle-intentions"], queryFn: () => apiRequest("GET", "/api/groups/me/circle-intentions"), staleTime: 60_000,
  });
  const { data: reqs } = useQuery<Array<{ isAnswered?: boolean; isOwnRequest?: boolean; closedAt?: string | null; kind?: string | null; expiresAt?: string | null }>>({
    queryKey: ["/api/prayer-requests"], queryFn: () => apiRequest("GET", "/api/prayer-requests"), staleTime: 60_000,
  });
  return useMemo(() => {
    const intentionCountByGroup = new Map<number, number>();
    for (const i of (circle?.intentions ?? [])) intentionCountByGroup.set(i.groupId, (intentionCountByGroup.get(i.groupId) ?? 0) + 1);
    let activeIntercessions = 0;
    for (const m of (moments?.moments ?? [])) {
      if (m.templateType !== "intercession") continue;
      const gid = m.group?.id;
      const intentions = gid ? (intentionCountByGroup.get(gid) ?? 0) : 0;
      activeIntercessions += intentions > 0 ? intentions : 1;
    }
    // Include the user's OWN requests — the office's main slideshow walks them
    // as "Your prayer", so leaving them out under-reported the count (showing
    // "3" when the walk-through actually covers all 5).
    const requestsInWalk = (reqs ?? []).filter((r) =>
      !r.isAnswered && !r.closedAt &&
      // Match the office slideshow exactly: it drops the viewer's OWN non-request
      // kinds (life-events, justice) and any expired request, so the count must too.
      !(r.isOwnRequest && r.kind != null && r.kind !== "request") &&
      (!r.expiresAt || new Date(r.expiresAt) > new Date())
    ).length;
    return activeIntercessions + requestsInWalk;
  }, [moments, circle, reqs]);
}

function nextDayLabel(date: Date): string {
  // Mirrors community-detail.tsx#gatheringDayLabel so the same
  // gathering renders the same line on the home dashboard and the
  // community page. Today / Tomorrow / weekday (this week) /
  // "Next Wednesday" (next calendar week, Sun→Sat) /
  // "Wed, Jun 3" for two+ weeks out.
  if (isToday(date)) return "Today";
  const now = new Date();
  const tomorrow = addDays(startOfDay(now), 1);
  if (startOfDay(date).getTime() === tomorrow.getTime()) return "Tomorrow";
  const thisWeekEnd = endOfWeek(now);
  if (date <= thisWeekEnd) return format(date, "EEEE");
  const nextWeekStart = startOfWeek(addWeeks(now, 1));
  const nextWeekEnd = endOfWeek(addWeeks(now, 1));
  if (date >= nextWeekStart && date <= nextWeekEnd) {
    return `Next ${format(date, "EEEE")}`;
  }
  return format(date, "EEE, MMM d");
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
  "custom": "🌱",
};

// ─── Service schedules (e.g. Sunday Services) ───────────────────────────────

export type ServiceTime = { label: string; time: string; location?: string };

export type ServiceSchedule = {
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

export function nextOccurrenceDate(dayOfWeek: number, today: Date = new Date()): Date {
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
export function computeNextGatheringDate(r: {
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

  if (stepDays === 0) return null; // one-time gathering already passed — no future date

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
  | { kind: "moment"; data: Moment; nextWindow?: string }
  | { kind: "gathering"; data: any; badge?: string }
  | { kind: "service"; data: ServiceSchedule; nextDate: Date; isOnDate: boolean }
  // Consolidated view of multiple service schedules on the same
  // weekday — when a user belongs to several communities that all
  // worship on Sunday, one card replaces N cards and surfaces all
  // their times in a single tap.
  | { kind: "services"; schedules: ServiceSchedule[]; nextDate: Date; isOnDate: boolean }
  | { kind: "feed"; data: SubscribedFeed }
  // Fellow "plan" ("How About") — something a fellow shared they're going
  // to. A dated plan surfaces in the timeline as a real event for the host
  // and every fellow the server returns it to. Tap → /events, where the
  // editable "How About" card (edit / RSVP) lives.
  | { kind: "plan"; data: FellowPlanEvent; nextDate: Date };

// One plan from GET /api/fellow-plans (the dated subset that becomes a
// timeline event). Mirrors the Plan shape in FellowPlans.tsx.
type FellowPlanEvent = {
  id: number;
  title: string;
  location: string | null;
  emoji: string | null;
  startsAt: string | null;
  isMine: boolean;
  host: { name: string; avatarUrl: string | null };
  comingCount: number;
  maybeCount: number;
  myRsvp: "coming" | "maybe" | null;
  // Up to 6 faces of fellows who RSVP'd "coming" (from /api/fellow-plans).
  comingPreview?: Array<{ userId: number; name: string; avatarUrl: string | null }>;
};

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
    // "general" | "parish" — a parish feed is one a parish pushes (its events +
    // prayer list); drives the "Parish" badge on the card.
    kind?: string | null;
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
  // OTHER subscribers (not the viewer) who've prayed any of this feed's
  // intercessions in the last 7 days. Server-truth — backs the avatar
  // stack on FeedPrayerCard. Optional for older API builds. Capped at
  // 12 for payload size — use weekPrayerCount for the honest total.
  weekPrayers?: Array<{ id: number; name: string; avatarUrl: string | null }>;
  // Uncapped distinct count of OTHER subscribers who prayed this week.
  // Backs the feed-first hero card's "N prayed this week" line, where
  // the capped weekPrayers.length would understate a popular feed.
  weekPrayerCount?: number;
  // Intercessions in this feed the viewer has NEVER prayed (no
  // check-in on any date). Drives the "X New Prayers" pulsing CTA
  // on the dashboard card. Optional — older API builds omit.
  unprayedCount?: number;
  // Upcoming events the feed manager published (soonest few). Rendered
  // as a compact event row beneath the feed card. Optional — older
  // API builds omit.
  upcomingEvents?: FeedEvent[];
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
          background: bgColor || "rgba(9,26,16, 0.297)",
          backdropFilter: "blur(11.34px)",
          WebkitBackdropFilter: "blur(11.34px)",
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

// ─── Home FAB (everyone) ────────────────────────────────────────────────────
// Universal floating "+" on the home dashboard. Four user-facing options
// (request / life event / justice / prayer-for-other) plus a fifth
// admin-only option (community intercession) shown when the user is an
// admin in any group. Shared visual language with the admin FAB on
// /communities/:slug — same green circle, same expanded-card treatment,
// same animated rotation on tap.

export function HomeAuthoringFAB() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  // Same admin probe HomeFAB() uses below — admin in *any* group earns
  // the community-intercession option. Server enforces nothing yet, so
  // this is a soft gate; we'll harden if it turns out anyone bypasses it.
  const { data: groupsData } = useQuery<{ groups: Array<{ myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
  });
  const isAdminOfAny = (groupsData?.groups ?? []).some(g => g.myRole === "admin" || g.myRole === "hidden_admin");
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="flex flex-col gap-2 mb-1 items-stretch"
          >
            <button
              onClick={() => { setOpen(false); setLocation("/pray-request/new?kind=request"); }}
              className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
              style={{ ...FROST, border: "1px solid rgba(200,212,192,0.28)", minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🙏🏽 {t("home_fab.prayer_request")}</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("home_fab.prayer_request_sub")}</p>
            </button>
            {isAdminOfAny && (
              <button
                onClick={() => { setOpen(false); setLocation("/moment/new?template=intercession"); }}
                className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
                style={{ ...FROST, border: "1px solid rgba(200,212,192,0.28)", minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
              >
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🕯️ {t("home_fab.community_intercession")}</p>
                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("home_fab.community_intercession_sub")}</p>
              </button>
            )}
            {isAdminOfAny && (
              <button
                onClick={() => { setOpen(false); setLocation("/tradition/new"); }}
                className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
                style={{ ...FROST, border: "1px solid rgba(200,212,192,0.28)", minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
              >
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>📅 {t("home_fab.event", { defaultValue: "Event" })}</p>
                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("home_fab.event_sub", { defaultValue: "Put a gathering on your community's calendar." })}</p>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ ...FROST, border: "1px solid rgba(200,212,192,0.35)", color: "#F0EDE6" }}
        aria-label={open ? t("home_fab.close_menu") : t("home_fab.new_prayer")}
      >
        {/* The classic "+" create affordance — rotates 45° into an × when open. */}
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }}>
          <Plus size={26} />
        </motion.div>
      </button>
    </div>
  );
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

function FAB() {
  const { t } = useTranslation();
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
            className="flex flex-col gap-2 mb-1 items-stretch"
          >
            {/* FAB menu shows the three practice templates directly so
                people can jump straight into the sub-flow they want.
                Backgrounds are solid opaque practices-green; category
                identity comes from the border color. */}
            {showAdminMenu && (
              <>
                <button
                  onClick={() => { setOpen(false); setLocation("/moment/new?template=intercession"); }}
                  className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
                  style={{ background: "#193F2A", border: `1px solid ${CATEGORY_COLORS.practices.border}`, minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
                >
                  <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🙏🏽 {t("home_fab.start_group_intercession")}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("home_fab.start_group_intercession_sub")}</p>
                </button>
                <button
                  onClick={() => { setOpen(false); setLocation("/moment/new?template=fasting"); }}
                  className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
                  style={{ background: "#193F2A", border: `1px solid ${CATEGORY_COLORS.practices.border}`, minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
                >
                  <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🌿 {t("home_fab.start_group_fast")}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("home_fab.start_group_fast_sub")}</p>
                </button>
              </>
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
          {open
            ? <X size={24} />
            : <span style={{ fontSize: 22, lineHeight: 1, display: "block" }} aria-hidden>🙏🏽</span>}
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
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  // Inflight PATCH so the Save & close button can await it and we
  // never dismiss with the server still un-saved. `null` = nothing
  // pending. Same pattern as the onboarding ProfilePictureSlide fix.
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !file.type.startsWith("image/")) return;
    setSaveError(null);
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.onerror = () => setSaveError("Couldn't read that image.");
    reader.readAsDataURL(file);
  }

  function applyCrop(dataUrl: string) {
    setUploading(true);
    setSaveError(null);
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
      .finally(() => { setUploading(false); setCropSrc(null); });
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

        {cropSrc && (
          <AvatarCropModal
            src={cropSrc}
            busy={uploading}
            onCancel={() => setCropSrc(null)}
            onConfirm={applyCrop}
          />
        )}

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

// Title on the left, a thin rule filling the rest, and an optional
// right-aligned CTA/status. Exported so other home surfaces (the Way of Love
// home) reuse the exact divider style.
export function SectionHeader({ label, right, onOpen }: { label: string; right?: React.ReactNode; onOpen?: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      {onOpen ? (
        // Tappable header — drills into the section's detail sub-page. The
        // chevron signals there's more (e.g. the Way of Love practice video).
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1.5 transition-opacity hover:opacity-90 active:scale-[0.99]"
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
            {label}
          </h2>
          <span aria-hidden style={{ color: "rgba(143,175,150,0.7)", fontSize: 18, lineHeight: 1 }}>›</span>
        </button>
      ) : (
        <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
          {label}
        </h2>
      )}
      <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
      {right}
    </div>
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
// already includes one (e.g. "Morning Prayer 🌅" + leading template emoji).
function stripTrailingEmoji(s: string): string {
  // eslint-disable-next-line no-misleading-character-class
  return s.replace(/[\s\u200d]*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component})+$/u, "").trim();
}

export function MomentCard({ m, userEmail, keyPrefix, nextWindow }: { m: Moment; userEmail: string; keyPrefix: string; nextWindow?: string }) {
  const [, setLocation] = useLocation();
  const emoji = (m as any).customEmoji || PRACTICE_EMOJI[m.templateType || "custom"] || "🌱";
  // Goal-reached detection — use the backend-stamped timestamp, not the
  // streak comparison. The backend stamps commitmentGoalReachedAt when
  // commitmentSessionsLogged crosses the goal, which is the correct check.
  const sessionsGoalForCard = m.commitmentSessionsGoal ?? m.goalDays ?? null;
  const goalReachedForMe = !!m.commitmentGoalReachedAt;
  // Praying for someone isn't a goal to hit — an intercession shows no
  // goal-reached decoration (the "Goal reached" badge, the "Renew" pill, the
  // "N sessions prayed" flap). The creator still gets a gentle keep-praying
  // prompt via GoalReachedModal, which is worded without streak/goal language.
  const showRenewPill = goalReachedForMe && !!m.isCreator && m.templateType !== "intercession";
  const shouldPulse = showRenewPill
      ? true
      // Intercessions: "still to pray" is per-USER (have *I* prayed it today),
      // not the global post count — otherwise an intercession someone else
      // prayed reads as done for everyone, and ones only I prayed never flip.
      : m.templateType === "intercession"
        ? (m.windowOpen && !m.myPrayedToday)
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
  // Intercessions carry no streak badge — praying for someone isn't a streak.
  // Fasting keeps its group-streak fire.
  const progressLabel = (m.templateType === "fasting")
      ? (effectiveGroupStreak > 0 ? `🔥 ${effectiveGroupStreak}` : null)
      : null;

  // Previously intercessions routed their Pray pill to the standalone
  // /moment/:token/:userToken "Amen" screen — a quick tap page that sat
  // outside the rest of the detail context. The detail page (/moments/:id)
  // now carries the full prayer + community ritual the user wants to land
  // on, so both the card and the Pray pill fall through to openHref.
  const prayHref: string | null = null;

  const openHref = (shouldPulse && isMorningPrayer && m.myUserToken)
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
    isMeatFast ? fastingFlapLines :
    [subtitle, mobileStatusLine, logCountLine]
  )
    .map(s => (s ?? "").trim())
    .filter(s => s.length > 0);
  const desktopFlapLines: string[] = (
    showRenewPill ? renewFlapLines :
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
          {shouldPulse && !showRenewPill ? (
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
          ) : isIntercession && m.myPrayedToday && m.windowOpen ? (
            // Already prayed today — show View pill so they can revisit the circle
            // (per-USER flag: my own check-in, not anyone's post on the moment)
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

export function GatheringCard({
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
  // Video-call gatherings get a "📹 Video call" tag under the time so
  // the row reads as online at a glance — the join link itself lives
  // in the detail modal.
  const isVideoGathering = typeof r.meetingUrl === "string" && !!r.meetingUrl.trim();

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
          background: "rgba(9,26,16, 0.297)",
          backdropFilter: "blur(11.34px)",
          WebkitBackdropFilter: "blur(11.34px)",
          border: "1px solid rgba(111,175,133,0.35)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className={`w-1 flex-shrink-0 ${isToday_ ? colors.barPulseClass : ""}`}
          style={{ background: isToday_ ? undefined : colors.bar }}
        />
        <div className="flex-1 px-4 pt-3 pb-3 min-w-0">
          {/* Row 1: name (left) + community pill (right). */}
          <div className="flex items-start justify-between gap-3">
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

          {/* Row 2: date/time (left) + video call tag (right, when set). */}
          {(timeLabel || isVideoGathering) && (
            <div className="mt-0.5 flex items-baseline justify-between gap-3">
              {timeLabel ? (
                <div className="text-xs font-medium" style={{ color: "#C8D4C0", letterSpacing: "-0.01em" }}>
                  {timeLabel}
                </div>
              ) : <div />}
              {isVideoGathering && (
                <span
                  className="text-[10px] font-medium shrink-0"
                  style={{ color: "rgba(143,175,150,0.85)" }}
                >
                  📹 Video call
                </span>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// A fellow's "How About" plan, rendered as a real timeline event. Same
// chrome as the gathering cards so a plan sits naturally beside gatherings and
// services. Taps through to /events, where the editable card + RSVP live.
function PlanEventCard({ p, keyPrefix }: { p: FellowPlanEvent; keyPrefix: string }) {
  const colors = CATEGORY_COLORS.gatherings;
  let eventDate: Date | null = null;
  try { eventDate = p.startsAt ? parseISO(p.startsAt) : null; } catch { /* ignore */ }
  const isToday_ = eventDate ? isToday(eventDate) : false;
  const timeLabel = eventDate ? `${nextDayLabel(eventDate)} · ${format(eventDate, "h:mm a")}` : null;
  const whereLine = [timeLabel, p.location].filter(Boolean).join(" · ");
  const firstName = p.host.name.trim().split(/\s+/)[0] || p.host.name;
  const planByLine = p.isMine ? "Your plan" : `A plan from ${firstName}`;

  // Compact event card (mirrors a prayer-request row): the host's face with a
  // calendar badge tucked into the corner, a one-line title, and a second line
  // that gently rotates between the when/where and whose plan it is. Tap → the
  // Events page where you can see details / edit / RSVP.
  const lines = whereLine ? [whereLine, planByLine] : [planByLine];
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return;
    const id = setInterval(() => setLineIdx((i) => (i + 1) % lines.length), 11200);
    return () => clearInterval(id);
  }, [lines.length]);
  const sub = lines[lineIdx % lines.length];

  return (
    <Link key={`${keyPrefix}-${p.id}`} href="/events" className="block w-full text-left">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer transition-transform active:scale-[0.99] ${isToday_ ? colors.pulseClass : ""}`}
        style={{
          background: "rgba(9,26,16, 0.297)",
          backdropFilter: "blur(11.34px)",
          WebkitBackdropFilter: "blur(11.34px)",
          border: "1px solid rgba(111,175,133,0.35)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        {/* Thick left accent bar — same format as the prayer-request card. */}
        <div className={`w-1 flex-shrink-0 ${isToday_ ? colors.barPulseClass : ""}`} style={isToday_ ? undefined : { background: colors.bar }} />
        <div className="flex-1 flex items-center gap-3 px-3.5 py-2.5 min-w-0">
        {/* Host face + calendar badge — on the left, like the prayer-request
            avatar. The face stands in for the old leading emoji. */}
        <div className="relative shrink-0" style={{ width: 40, height: 40 }}>
          {p.host.avatarUrl ? (
            <img src={p.host.avatarUrl} alt={p.host.name} className="rounded-full object-cover" style={{ width: 40, height: 40, border: "1px solid rgba(46,107,64,0.4)" }} />
          ) : (
            <div className="rounded-full flex items-center justify-center font-semibold" style={{ width: 40, height: 40, background: "#1A4A2E", color: "#A8C5A0", fontSize: 15 }}>
              {(p.host.name?.trim()?.[0] ?? "·").toUpperCase()}
            </div>
          )}
          <span
            className="absolute flex items-center justify-center rounded-full"
            style={{ right: -3, bottom: -3, width: 19, height: 19, background: "#163A24", border: "2px solid #0E2016", fontSize: 10, lineHeight: 1 }}
            aria-hidden
          >📅</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold truncate" style={{ color: "#F0EDE6" }}>
            {p.title}
          </p>
          <div style={{ height: 16, overflow: "hidden" }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={sub}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="text-[12px] truncate"
                style={{ color: "#A8C5A0" }}
              >{sub}</motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* Who's coming — a couple of faces on the right. */}
        {(p.comingPreview?.length ?? 0) > 0 && (
          <div className="flex items-center shrink-0" aria-hidden>
            {p.comingPreview!.slice(0, 3).map((c, i) => (
              c.avatarUrl ? (
                <img key={c.userId} src={c.avatarUrl} alt={c.name} className="rounded-full object-cover" style={{ width: 22, height: 22, marginLeft: i === 0 ? 0 : -6, border: "1.5px solid #0E2016" }} />
              ) : (
                <span key={c.userId} className="rounded-full inline-flex items-center justify-center font-semibold" style={{ width: 22, height: 22, marginLeft: i === 0 ? 0 : -6, border: "1.5px solid #0E2016", background: "#1A4A2E", color: "#A8C5A0", fontSize: 9 }}>
                  {(c.name?.trim()?.[0] ?? "·").toUpperCase()}
                </span>
              )
            ))}
          </div>
        )}
        </div>
      </motion.div>
    </Link>
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
  // A video-call gathering carries a meetingUrl — its modal shows a
  // "Join video call" button instead of a 📍 location line. (The
  // meetup location for a video gathering is the meeting link itself,
  // so we suppress the raw-URL location line when meetingUrl is set.)
  const meetingUrl = (typeof r.meetingUrl === "string" && r.meetingUrl.trim()) ? r.meetingUrl.trim() : null;
  const locationLabel = meetingUrl ? null : (r.nextMeetupLocation ?? r.location ?? null);
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
            {/* Multi-community gatherings: surface every additional
                community the gathering is visible to, so a member from
                one parish can see "this is also for X". Reads
                enrichRitual's additionalGroups; nothing renders for
                single-community or personal gatherings. */}
            {Array.isArray(r.additionalGroups) && r.additionalGroups.length > 0 && (
              <p className="text-[11px]" style={{ color: "#8FAF96" }}>
                Also visible to:{" "}
                {(r.additionalGroups as Array<{ name: string; emoji: string | null }>)
                  .map((g) => `${g.emoji ? `${g.emoji} ` : ""}${g.name}`)
                  .join(" · ")}
              </p>
            )}
            {timeLabel && (
              <div
                className="rounded-xl px-4 py-3"
                style={{ background: "rgba(111,175,133,0.10)", border: "1px solid rgba(111,175,133,0.2)" }}
              >
                <p className="text-base font-semibold" style={{ color: "#F0EDE6" }}>{timeLabel}</p>
                {locationLabel && (
                  <p className="text-[12px] mt-0.5" style={{ color: "#8FAF96" }}>📍 {locationLabel}</p>
                )}
                {meetingUrl && (
                  <p className="text-[12px] mt-0.5" style={{ color: "#8FAF96" }}>📹 Video call</p>
                )}
              </div>
            )}
            {!timeLabel && locationLabel && (
              <p className="text-sm" style={{ color: "#C8D4C0" }}>📍 {locationLabel}</p>
            )}
            {/* Join button — video-call gatherings only. Opens the
                meeting link in SFSafariViewController on iOS, a new
                tab on web. */}
            {meetingUrl && (
              <button
                type="button"
                onClick={() => openExternal(meetingUrl)}
                className="rounded-xl px-4 py-3 text-center font-semibold text-sm cursor-pointer transition-opacity hover:opacity-90"
                style={{ background: "#2D5E3F", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.6)" }}
              >
                📹 Join video call →
              </button>
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
  // Mirrors the community-detail page's pill: "<Month D> — <trailing>"
  // where trailing is the single service time, or "Tap to See All
  // Service Times" when there's more than one. Same date format
  // (long month + numeric day) and same "All" wording so a parish's
  // home card reads identically to the community-detail card.
  if (schedule.times.length === 0) return null;
  const dateLabel = nextDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const trailing = schedule.times.length === 1
    ? formatServiceTime(schedule.times[0].time)
    : "Tap to See All Service Times";
  return (
    <div className="mt-2 text-xs font-medium" style={{ color: "#F0EDE6", letterSpacing: "-0.01em" }}>
      <span style={{ color: "#C8D4C0" }}>{dateLabel}</span>
      <span style={{ color: "rgba(200,212,192,0.6)" }}> — </span>
      <span>{trailing}</span>
    </div>
  );
}

// ─── Service card ───────────────────────────────────────────────────────────
// A single card on the dashboard representing a community's weekly service
// schedule. Shows group + schedule name and a teaser of the first service
// time. Clicking fires onOpen to reveal every time in the schedule.

export function ServiceCard({
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
  // Default label is "Worship" rather than "{Day} Services" — reads
  // less institutional and works for parishes that aren't on Sundays.
  // Custom names from the schedule still win.
  const title = schedule.name || "Worship";

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
          <div className="flex items-start justify-between gap-3">
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

// ─── Consolidated worship card ──────────────────────────────────────────────
// When a user is in multiple communities that worship the same day,
// we collapse all of their service schedules into ONE card titled
// "Worship". The bottom line reads "See times for your communities."
// The top-right cycles through each community's name with a soft
// fade so the user can see who's included without expanding the card.

function CyclingCommunityLabel({ schedules }: { schedules: ServiceSchedule[] }) {
  const [idx, setIdx] = useState(0);
  // Each community holds for HOLD_MS before the rotation advances.
  // The crossfade itself takes 2*FADE_MS (out + in) and runs inside
  // that hold, so the on-screen settle time per community is ≈
  // HOLD_MS - FADE_MS — 5s hold + 0.9s fade reads as a gentle
  // breathing rotation instead of a flicker.
  const HOLD_MS = 5000;
  const FADE_MS = 900;
  useEffect(() => {
    if (schedules.length <= 1) return;
    const t = setInterval(() => {
      setIdx((i) => (i + 1) % schedules.length);
    }, HOLD_MS);
    return () => clearInterval(t);
  }, [schedules.length]);
  const current = schedules[idx % schedules.length];
  if (!current) return null;
  return (
    <span
      className="text-[10px] font-semibold uppercase shrink-0 mt-1 relative"
      style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}
    >
      {/* AnimatePresence mode="wait" plays the exit animation of the
          outgoing community label fully BEFORE the next one fades in.
          Without it the two would overlap and read as a pop instead
          of a crossfade. easeInOut on the longer 0.9s duration makes
          the rise + fall feel like breathing. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={current.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: FADE_MS / 1000, ease: "easeInOut" }}
          className="inline-block"
        >
          {current.groupEmoji ?? "⛪"} {current.groupName}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export function ConsolidatedServiceCard({
  schedules,
  nextDate,
  isOnDate,
  onOpen,
  keyPrefix,
}: {
  schedules: ServiceSchedule[];
  nextDate: Date;
  isOnDate: boolean;
  onOpen: () => void;
  keyPrefix: string;
}) {
  const colors = CATEGORY_COLORS.gatherings;
  void nextDate;
  return (
    <div
      key={`${keyPrefix}-services-${schedules.map((s) => s.id).join("-")}`}
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
          background: "rgba(9,26,16, 0.297)",
          backdropFilter: "blur(11.34px)",
          WebkitBackdropFilter: "blur(11.34px)",
          border: "1px solid rgba(111,175,133,0.35)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className={`w-1 flex-shrink-0 ${isOnDate ? colors.barPulseClass : ""}`}
          style={{ background: isOnDate ? undefined : colors.bar }}
        />
        <div className="flex-1 px-4 pt-3 pb-3">
          <div className="flex items-start justify-between gap-3">
            <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
              🙌🏽 {DAY_OF_WEEK_NAMES[schedules[0]?.dayOfWeek ?? 0] ?? "Sunday"} Worship
            </span>
            <CyclingCommunityLabel schedules={schedules} />
          </div>
          <p
            className="text-[12px] mt-1"
            style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            See times for your communities →
          </p>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Consolidated worship modal ─────────────────────────────────────────────
// Opened from ConsolidatedServiceCard. Lists every service time in every
// community's schedule, grouped by community.

export function ConsolidatedServiceDetailModal({
  schedules,
  nextDate,
  onClose,
}: {
  schedules: ServiceSchedule[];
  nextDate: Date;
  onClose: () => void;
}) {
  const dayOfWeek = schedules[0]?.dayOfWeek ?? 0;
  const dayName = DAY_OF_WEEK_NAMES[dayOfWeek] ?? "Sunday";
  const dateLabel = isToday(nextDate) ? "Today" : format(nextDate, "EEEE, MMM d");
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
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.55)" }}>
                {schedules.length} {schedules.length === 1 ? "community" : "communities"}
              </p>
              <h2 className="text-xl font-bold mt-1" style={{ color: "#F0EDE6", letterSpacing: "-0.01em" }}>
                {dayName} Worship
              </h2>
              <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>{dateLabel}</p>
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

          <div className="px-5 pb-5 pt-1 flex flex-col gap-5">
            {schedules.map((schedule) => (
              <div key={schedule.id}>
                <Link
                  href={`/communities/${schedule.groupSlug}`}
                  onClick={onClose}
                >
                  <p
                    className="text-[11px] font-semibold uppercase tracking-widest mb-2 transition-opacity hover:opacity-80 cursor-pointer"
                    style={{ color: "rgba(200,212,192,0.7)" }}
                  >
                    {schedule.groupEmoji ?? "⛪"} {schedule.groupName}
                  </p>
                </Link>
                {schedule.location && schedule.location.trim() && (
                  <p className="text-[12px] mb-2" style={{ color: "#C8D4C0" }}>
                    📍 {schedule.location.trim()}
                  </p>
                )}
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
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Prayer-list fallback card ──────────────────────────────────────────────
// Shown in the Today section when nothing else is pending there but the user
// still has prayers queued in their slideshow. Gives them a clear next step
// ("pray for N people") instead of an empty home screen, and surfaces their
// streak in the top-right corner as gentle reinforcement of the habit.

// ── NewPrayerRequestsCard — top-of-home notification-style card ──────────
//
// Surfaces UN-amened prayer requests from the user's community. Acts
// as the in-app mirror of the iOS app icon badge — "you have N
// people asking for prayer." Tapping routes into the slideshow so
// the user can respond one-by-one, clearing the queue.
//
// Replaces the old "🕯️ Daily Prayer List" card as the home anchor.
// That card pushed a daily-ritual model (everyone walks the slideshow
// every morning) which users weren't doing in practice; this one
// reads as "respond to your friends," which is what people are
// already doing on their own.
//
// Hidden when count = 0 — silence is the right state when the queue
// is empty.
function NewPrayerRequestsCard({
  count,
  faces,
}: {
  count: number;
  faces: Array<{ key: string; name: string; avatarUrl: string | null }>;
}) {
  const colors = CATEGORY_COLORS.practices;
  const headline = count === 1
    ? "1 prayer waiting"
    : `${count} prayer requests waiting`;
  return (
    <Link href="/prayer-mode?queue=new" className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative flex rounded-xl overflow-hidden cursor-pointer ${colors.pulseClass}`}
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
        }}
      >
        <div className={`w-1 flex-shrink-0 ${colors.barPulseClass}`} />
        <div className="flex-1 px-4 pt-[17px] pb-[17px]">
          {/* Headline on the LEFT, profile pictures of the request
              authors on the RIGHT, justified to opposite edges of
              the same row. Subtitle ("Tap to respond to your friends")
              removed per user direction — the avatars do the
              "who's asking" work without needing the copy. Only
              entries with a real avatar render. */}
          <div className="flex items-start justify-between gap-3">
            <span
              className="text-base font-semibold"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {headline} 🙏🏽
            </span>
            {(() => {
              const withAvatars = faces.filter((f) => !!f.avatarUrl);
              if (withAvatars.length === 0) return null;
              return (
                <div className="flex items-center -space-x-2 shrink-0">
                  {withAvatars.slice(0, 3).map((f) => (
                    <img
                      key={f.key}
                      src={f.avatarUrl as string}
                      alt={f.name}
                      title={f.name}
                      className="w-6 h-6 rounded-full object-cover shrink-0"
                      style={{ border: "1.5px solid #0F2818" }}
                    />
                  ))}
                </div>
              );
            })()}
          </div>
          <div className="mt-[17px] w-full">
            <div
              className="w-full rounded-xl text-center"
              style={{
                background: "#4A7A5B",
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                padding: "6px 12px",
                border: "1px solid rgba(111,175,133,0.45)",
              }}
            >
              Respond <span aria-hidden>→</span>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ── ContemplationHomeCard — compact "sit in silence" home anchor ──
// A one-line card that taps through to /contemplation (or /cobreathe when the
// user's style is Creation Prayer). Hidden by default; surfaced (and pinnable
// to the top) from the Customize page so someone whose daily rhythm is silent
// prayer can lead with it.
//
// `side` makes this per-side, like the /daily-progress Morning/Evening
// Contemplation cards: each side completes independently (contemplationSideDone
// + the server's cross-device echo), and the evening card stays a quiet
// "later" card until its slot opens at 5 PM (matching the evening office's
// gate) instead of literally being hidden. Defaults to "morning" for the
// generic classic-home / home-beta module slots, which aren't tied to a
// specific side of the day (never evening-gated there).
export function ContemplationHomeCard({ side = "morning", hero = false }: { side?: "morning" | "evening"; hero?: boolean } = {}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const guest = !user;

  // Invalidate contemplation-stats whenever the dashboard becomes visible —
  // covers returning from the contemplation page, switching back from another
  // app, or receiving a new Apple Health sync.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        qc.invalidateQueries({ queryKey: ["/api/me/contemplation-stats"] });
        qc.invalidateQueries({ queryKey: ["/api/me/contemplation-sides-today"] });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [qc]);

  // When a daily contemplation goal is set, show live progress under the title
  // ("8 of 15 min today" / "Goal reached"). Reads the same office-prefs goal +
  // contemplation-stats the Contemplation page uses, so they never disagree.
  // This aggregate stays goal-progress only — it is NOT used for this side's
  // done state below (that's per-side, see contemplationSideDone/sidesToday).
  const { data: prefs } = useQuery<{ contemplationGoalMinutes?: number }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs") as Promise<{ contemplationGoalMinutes?: number }>,
    staleTime: 5 * 60_000,
  });
  const goalMin = prefs?.contemplationGoalMinutes ?? 0;

  const todaySince = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); })();
  const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } })();
  const { data: stats } = useQuery<{ todaySeconds?: number; healthMinutesToday?: number }>({
    queryKey: ["/api/me/contemplation-stats", todaySince.slice(0, 10), tz],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-stats?todaySince=${encodeURIComponent(todaySince)}&tz=${encodeURIComponent(tz)}`) as Promise<{ todaySeconds?: number; healthMinutesToday?: number }>,
    enabled: goalMin > 0,
    staleTime: 60_000,
  });

  // Match the Contemplation card: prayer-only seconds + external Apple Health
  // minutes (Calm / Insight Timer / Apple Mindfulness) the client synced. No
  // live HealthKit read here, so we use the server's stored value.
  const doneMin = Math.floor((stats?.todaySeconds ?? 0) / 60) + (stats?.healthMinutesToday ?? 0);
  const goalMet = goalMin > 0 && doneMin >= goalMin;
  const progressLabel = goalMin <= 0 ? null : goalMet ? "Goal reached 🌿" : `${doneMin} of ${goalMin} min today`;

  // THIS side's own completion — local day-flag OR'd with the server's
  // cross-device echo, exactly like useRhythmState's morning/evening
  // Contemplation cards. Never derived from the shared minutes goal above,
  // so completing one side never flips the other.
  const [localSideDone, setLocalSideDone] = useState(() => hasContemplationSideDoneToday(side));
  useEffect(() => {
    const refresh = () => setLocalSideDone(hasContemplationSideDoneToday(side));
    refresh();
    window.addEventListener(CONTEMPLATION_SIDE_DONE_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(CONTEMPLATION_SIDE_DONE_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [side]);
  const { data: sidesToday } = useQuery<{ morning: boolean; evening: boolean }>({
    queryKey: ["/api/me/contemplation-sides-today", tz],
    queryFn: () => apiRequest("GET", `/api/me/contemplation-sides-today?tz=${encodeURIComponent(tz)}`),
    staleTime: 60_000,
    enabled: !guest,
  });
  const met = localSideDone || !!sidesToday?.[side];

  // Creation Prayer is the breath style for this side — same source of truth
  // as useRhythmState/DailyProgressBody, so the label + destination agree
  // with the /daily-progress cards for the same side.
  const contemplationStyle: "silent" | "cobreathe" = (() => {
    try { return localStorage.getItem("phoebe:contemplation-style") === "cobreathe" ? "cobreathe" : "silent"; } catch { return "silent"; }
  })();
  const isCreation = contemplationStyle === "cobreathe";
  const bothSides = isCreation && getSideLevel("morning") === "reflect-sit" && getSideLevel("evening") === "reflect-sit";
  // Silent style always names the side (matches the /daily-progress cards);
  // Creation Prayer only splits into Morning/Evening when BOTH sides use it.
  const label = isCreation
    ? (bothSides ? (side === "morning" ? "Morning Creation Prayer" : "Evening Creation Prayer") : "Creation Prayer")
    : (side === "morning" ? "Morning Contemplation" : "Evening Contemplation");
  const emoji = isCreation ? "🌍" : "🕯️";
  const href = isCreation ? `/cobreathe?begin=1&side=${side}` : `/contemplation?begin=1&side=${side}`;
  const compactHref = isCreation ? `/cobreathe?side=${side}` : `/contemplation?side=${side}`;

  // Evening stays a quiet "later" card until its slot opens at 5 PM — mirrors
  // the evening office's gate (SLOT_OPEN_HOUR.evening in lib/customAnchors.ts)
  // so Creation Prayer/Contemplation isn't offered as "available" before then.
  const hour = new Date().getHours();
  const later = side === "evening" && !met && hour < 17;

  // Sub-line: the "later" gate wins (evening, not yet 5 PM); then this side's
  // own kept state; then style-specific blurb; goal progress only applies to
  // the silent style (Creation Prayer's blurb never mentions minutes, same
  // rule as the /daily-progress cards).
  const subline = later
    ? "Available from 5 PM"
    : met
      ? (isCreation ? "Kept 🌿" : "Kept 🌿")
      : (isCreation ? "Breathing together with God's creation" : (progressLabel ?? "A few minutes of stillness"));
  const showBar = !isCreation && !later && goalMin > 0 && !met;

  // Hero layout — the big "what's next" card, mirroring the office hero, when
  // Contemplation is set as this side's daily prayer. Same teal palette as the
  // compact card so it reads as the same anchor.
  if (hero) {
    const rgb = "62,124,122";
    const inner = (
      <div
        role={later ? undefined : "button"}
        tabIndex={later ? undefined : 0}
        className={`relative flex rounded-3xl overflow-hidden mb-3 ${later ? "opacity-60" : "cursor-pointer transition-opacity hover:opacity-95 active:scale-[0.99]"}`}
        style={{ background: `rgba(${rgb},0.13)`, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid rgba(${rgb},0.40)` }}
      >
        <div className="w-1.5 flex-shrink-0" style={{ background: `rgba(${rgb},0.85)` }} />
        <div className="flex-1 px-5 py-5">
          <div className="flex items-start gap-3.5">
            <span className="text-[34px] leading-none flex-shrink-0">{emoji}</span>
            <div className="flex-1 min-w-0 overflow-hidden">
              <p className="text-[22px] font-bold leading-tight" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{label}</p>
              <p className="text-[13.5px] mt-1 leading-snug" style={{ color: met ? "#A8C5A0" : "#B6C2A8", fontFamily: "'Space Grotesk', sans-serif" }}>
                {subline}
              </p>
              {showBar && (
                <div className="mt-2.5 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(143,175,150,0.16)", maxWidth: 220 }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((doneMin / goalMin) * 100))}%`, background: `rgba(${rgb},0.85)`, transition: "width 0.3s" }} />
                </div>
              )}
            </div>
            {!later && (
              <div className="flex-shrink-0">
                <span className="inline-flex items-center rounded-full text-[14px] font-semibold px-6 py-2.5" style={{ background: `rgba(${rgb},0.85)`, color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {met ? <><span aria-hidden style={{ opacity: 0.85 }}>✓</span> {isCreation ? "Kept" : "Sit again"}</> : "Begin"} <span aria-hidden className="ml-1">→</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
    return later ? <div className="block">{inner}</div> : <Link href={href} className="block">{inner}</Link>;
  }

  const compactInner = (
    <div
      role={later ? undefined : "button"}
      tabIndex={later ? undefined : 0}
      className={`relative flex rounded-xl overflow-hidden ${later ? "opacity-60" : "cursor-pointer"}`}
      style={{ background: "rgba(62,124,122,0.12)", border: `1px solid rgba(62,124,122,0.35)` }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(62,124,122,0.85)` }} />
      <div className="flex-1 px-4 py-[14px] flex items-center gap-3">
        <span className="text-xl flex-shrink-0" aria-hidden>{emoji}</span>
        <div className="flex-1 min-w-0">
          <p
            className="font-semibold min-w-0 truncate"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2, fontSize: 16 }}
          >
            {label}
          </p>
          <p
            className="truncate"
            style={{ color: met ? "#A8C5A0" : "rgba(143,175,150,0.8)", fontFamily: "'Space Grotesk', sans-serif", margin: "2px 0 0", fontSize: 12 }}
          >
            {subline}
          </p>
          {/* Goal progress bar — matches the Daily Progress page's
              contemplation card so the two views feel of a piece. */}
          {showBar && (
            <div className="mt-2 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(143,175,150,0.16)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, Math.round((doneMin / goalMin) * 100))}%`, background: "rgba(62,124,122,0.85)", transition: "width 0.3s" }}
              />
            </div>
          )}
        </div>
        {!later && (
          <div
            className="rounded-full text-center shrink-0"
            style={{
              background: "rgba(62,124,122,0.85)",
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              padding: "6px 14px",
              border: "1px solid rgba(62,124,122,0.45)",
              whiteSpace: "nowrap",
            }}
          >
            {met ? <>✓ {isCreation ? "Kept" : "Sit again"}</> : "Begin"} <span aria-hidden>→</span>
          </div>
        )}
      </div>
    </div>
  );
  return later ? <div className="block">{compactInner}</div> : <Link href={compactHref} className="block">{compactInner}</Link>;
}

// (StepsHomeCard removed — the Daily steps / Apple Health step-goal feature is
// turned off. No route, no home card, no rhythm dot.)

// ── Compact home anchors for the other daily practices ───────────────
// Same one-line tap-through shape as ContemplationHomeCard. Both default
// to hidden on the home; surfaced + reorderable from the Customize page.
function PracticeHomeCard({
  href, label, cta, tintBg, tintBorder, pillBg, pillBorder, accentBar,
}: {
  href: string; label: string; cta: string;
  tintBg: string; tintBorder: string; pillBg: string; pillBorder: string;
  /** Solid color for the thick left accent bar, matching the event cards. */
  accentBar: string;
}) {
  return (
    <Link href={href} className="block">
      <div
        role="button"
        tabIndex={0}
        className="relative flex rounded-xl overflow-hidden cursor-pointer"
        // Flat card tint — no gradient (the home cards read as flat panels),
        // plus a slightly stronger border. Generic over any tint color.
        style={{ background: tintBg, border: `1px solid ${tintBorder}` }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: accentBar }} />
        <div className="flex-1 px-4 py-[14px] flex items-center justify-between gap-3">
          <p
            className="font-semibold min-w-0 truncate"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2, fontSize: 16 }}
          >
            {label}
          </p>
          <div
            className="rounded-full text-center shrink-0"
            style={{
              background: pillBg,
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              padding: "6px 14px",
              border: `1px solid ${pillBorder}`,
              whiteSpace: "nowrap",
            }}
          >
            {cta} <span aria-hidden>→</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Personal prayer list — opens straight into "pray through your list" (the
// slideshow), the action that counts toward the daily Prayer List practice.
function PrayerListHomeCard() {
  return (
    <PracticeHomeCard
      // Pray through the MAIN community prayer slideshow — which now folds in
      // your own private prayers (isOwnPrayer "Your Prayer" slides) — rather
      // than the separate /intentions pray-through UI.
      href="/prayer-mode?reset=1"
      label="My Prayer List 🕊️"
      cta="Pray"
      tintBg="rgba(96,140,180,0.12)"
      tintBorder="rgba(96,140,180,0.35)"
      pillBg="rgba(96,140,180,0.28)"
      pillBorder="rgba(96,140,180,0.45)"
      accentBar="rgba(96,140,180,0.85)"
    />
  );
}

function ExamenHomeCard({ hero = false }: { hero?: boolean } = {}) {
  // Hero layout — the big "what's next" card, mirroring the office hero, when
  // the Examen is set as this side's daily prayer (usually evening). Same green
  // palette as the compact card so it reads as the same anchor.
  if (hero) {
    const rgb = "90,140,114";
    return (
      <Link href="/examen" className="block">
        <div
          role="button"
          tabIndex={0}
          className="relative flex rounded-3xl overflow-hidden cursor-pointer transition-opacity hover:opacity-95 active:scale-[0.99] mb-3"
          style={{ background: `rgba(${rgb},0.13)`, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid rgba(${rgb},0.40)` }}
        >
          <div className="w-1.5 flex-shrink-0" style={{ background: `rgba(${rgb},0.85)` }} />
          <div className="flex-1 px-5 py-5">
            <div className="flex items-start gap-3.5">
              <span className="text-[34px] leading-none flex-shrink-0">🤔</span>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-[22px] font-bold leading-tight" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>The Examen</p>
                <p className="text-[13.5px] mt-1 leading-snug" style={{ color: "#B6C2A8", fontFamily: "'Space Grotesk', sans-serif" }}>Review the day with God</p>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center rounded-full text-[14px] font-semibold px-6 py-2.5" style={{ background: `rgba(${rgb},0.85)`, color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Begin <span aria-hidden className="ml-1">→</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  }
  return (
    <PracticeHomeCard
      href="/examen"
      label="Ignatian Examen 🤔"
      cta="Begin"
      tintBg="rgba(90,140,114,0.12)"
      tintBorder="rgba(90,140,114,0.35)"
      pillBg="rgba(90,140,114,0.28)"
      pillBorder="rgba(90,140,114,0.45)"
      accentBar="rgba(90,140,114,0.85)"
    />
  );
}

// Guided Prayer (PACT) home card — same shape as ExamenHomeCard, a distinct
// warm rose/terracotta palette so it reads as its own anchor next to Examen's
// green and Contemplation's teal.
function GuidedPrayerHomeCard({ hero = false }: { hero?: boolean } = {}) {
  if (hero) {
    const rgb = "168,108,96";
    return (
      <Link href="/guided-prayer" className="block">
        <div
          role="button"
          tabIndex={0}
          className="relative flex rounded-3xl overflow-hidden cursor-pointer transition-opacity hover:opacity-95 active:scale-[0.99] mb-3"
          style={{ background: `rgba(${rgb},0.13)`, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid rgba(${rgb},0.40)` }}
        >
          <div className="w-1.5 flex-shrink-0" style={{ background: `rgba(${rgb},0.85)` }} />
          <div className="flex-1 px-5 py-5">
            <div className="flex items-start gap-3.5">
              <span className="text-[34px] leading-none flex-shrink-0">🙌</span>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-[22px] font-bold leading-tight" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>Guided Prayer</p>
                <p className="text-[13.5px] mt-1 leading-snug" style={{ color: "#D8C2BA", fontFamily: "'Space Grotesk', sans-serif" }}>Praise, Confession, Thanksgiving, Supplication</p>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center rounded-full text-[14px] font-semibold px-6 py-2.5" style={{ background: `rgba(${rgb},0.85)`, color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Begin <span aria-hidden className="ml-1">→</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  }
  return (
    <PracticeHomeCard
      href="/guided-prayer"
      label="Guided Prayer 🙌"
      cta="Begin"
      tintBg="rgba(168,108,96,0.12)"
      tintBorder="rgba(168,108,96,0.35)"
      pillBg="rgba(168,108,96,0.28)"
      pillBorder="rgba(168,108,96,0.45)"
      accentBar="rgba(168,108,96,0.85)"
    />
  );
}

// Creation Prayer home card — replaces the office card for a side set to
// Creation Prayer. Labels "Morning/Evening Creation Prayer" when BOTH sides are
// Creation Prayer (so the two cards are distinguishable); just "Creation Prayer"
// when it's the only side.
function CreationHomeCard({ side, hero = false }: { side: "morning" | "evening"; hero?: boolean }) {
  const bothCreation = getSideLevel("morning") === "creation" && getSideLevel("evening") === "creation";
  const label = bothCreation ? (side === "morning" ? "Morning Creation Prayer" : "Evening Creation Prayer") : "Creation Prayer";
  const href = `/creation-devotion?mode=creation-${side}&picked=1`;
  const rgb = "76,124,91";
  if (hero) {
    return (
      <Link href={href} className="block">
        <div
          role="button"
          tabIndex={0}
          className="relative flex rounded-3xl overflow-hidden cursor-pointer transition-opacity hover:opacity-95 active:scale-[0.99] mb-3"
          style={{ background: `rgba(${rgb},0.13)`, backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: `1px solid rgba(${rgb},0.40)` }}
        >
          <div className="w-1.5 flex-shrink-0" style={{ background: `rgba(${rgb},0.85)` }} />
          <div className="flex-1 px-5 py-5">
            <div className="flex items-start gap-3.5">
              <span className="text-[34px] leading-none flex-shrink-0">🌱</span>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-[22px] font-bold leading-tight" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>{label}</p>
                <p className="text-[13.5px] mt-1 leading-snug" style={{ color: "#B6C2A8", fontFamily: "'Space Grotesk', sans-serif" }}>The creation Psalter &amp; prayers, with Creation Prayer</p>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center rounded-full text-[14px] font-semibold px-6 py-2.5" style={{ background: `rgba(${rgb},0.85)`, color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Begin <span aria-hidden className="ml-1">→</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  }
  return (
    <PracticeHomeCard
      href={href}
      label={`${label} 🌱`}
      cta="Begin"
      tintBg={`rgba(${rgb},0.12)`}
      tintBorder={`rgba(${rgb},0.35)`}
      pillBg={`rgba(${rgb},0.28)`}
      pillBorder={`rgba(${rgb},0.45)`}
      accentBar={`rgba(${rgb},0.85)`}
    />
  );
}

// CAC Daily Reflection home card. Same visual language as the other
// practice cards but opens externally (SFSafariViewController on iOS)
// instead of navigating to an in-app route. The pill label flips
// between "Read" and "Read again" based on whether the user has
// tapped this card today in their local timezone — see lib/cacReadState.
//
// Listens for `phoebe:cac-read` so multiple instances of the card
// (or the MP closing pill, which writes the same flag) stay in sync
// without a full re-render.
export function CacHomeCard() {
  const [hasRead, setHasRead] = useState(() => hasReadCacToday());
  useEffect(() => {
    const refresh = () => setHasRead(hasReadCacToday());
    window.addEventListener(CAC_READ_EVENT, refresh);
    // Also refresh on tab-focus so opening the link in SFSafariView,
    // reading, and returning flips the card label automatically.
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(CAC_READ_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  // Today's actual meditation title (scraped from the CAC RSS feed). When
  // present it becomes the card's headline and "CAC Daily Reflection"
  // drops to an eyebrow; until it loads we just show the generic label.
  const { data: cacMeta } = useQuery<{ title: string; url: string }>({
    queryKey: ["/api/cac/today-meta"],
    queryFn: () => apiRequest("GET", "/api/cac/today-meta"),
    staleTime: 30 * 60_000,
  });
  const cacTitle = cacMeta?.title ?? "";
  const onClick = () => {
    // Open the meditation, and mark it read only once the reader is CLOSED —
    // so the card's done animation waits until they've X'd out, not the
    // instant they tap in. (Web has no close event, so it marks on open.)
    openExternalThenMarkRead(CAC_TODAY_URL, recordCacOpened, { reader: true });
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="relative flex rounded-xl overflow-hidden cursor-pointer"
      // Brand forest green — keeps the card visually in the same
      // family as the other practice anchors (Gratitude / Examen /
      // Contemplation) rather than reading as an external/foreign
      // surface. Slightly deeper saturation than its siblings so it
      // still reads as distinct when stacked next to them.
      style={{ background: "rgba(46,107,64,0.14)", border: `1px solid rgba(46,107,64,0.40)` }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(46,107,64,0.9)` }} />
      <div className="flex-1 px-4 py-[14px] flex items-center justify-between gap-3">
        {/* flex-1 + min-w-0 (not just min-w-0): the headline is now a long
            nowrap line ("CAC Daily Reflection 🌵"); on iOS Safari a min-w-0-only
            flex item won't shrink under a long nowrap child, so it overflows and
            shoves the shrink-0 button. flex-1 forces a 0 basis so it truncates. */}
        <div className="flex-1 min-w-0">
          {/* Title + subtitle mirrors ContemplationHomeCard: the section name
              is the headline, and today's meditation title sits under it as a
              small muted subtitle (like "8 of 15 min today" on Contemplation). */}
          <p
            className="font-semibold min-w-0 truncate"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2, fontSize: 16 }}
          >
            CAC Daily Reflection 🌵
          </p>
          {cacTitle && (
            <p
              className="truncate"
              style={{ color: "rgba(143,175,150,0.8)", fontFamily: "'Space Grotesk', sans-serif", margin: "2px 0 0", fontSize: 12 }}
            >
              {cacTitle}
            </p>
          )}
        </div>
        <div
          className="rounded-full text-center shrink-0"
          style={{
            background: "rgba(46,107,64,0.30)",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            padding: "6px 14px",
            border: "1px solid rgba(46,107,64,0.50)",
            whiteSpace: "nowrap",
          }}
        >
          {hasRead ? "Read again" : "Read"} <span aria-hidden>→</span>
        </div>
      </div>
    </div>
  );
}

// Podcast show home card — the podcast analogue of a subscribed prayer
// feed (one card per show added to home; see lib/podcastHome). Shows your
// progress through the show's recent episodes and plays the next one you
// haven't opened. "Progress" is approximate: it counts episodes you've
// OPENED (server listen history), not finished, since per-episode
// completion isn't tracked server-side. Tapping the card body opens the
// show; the pill plays the next/continue episode (the player resumes its
// saved position automatically).
type PodcastHomeEpisode = {
  id: string;
  title: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  description: string | null;
  imageUrl: string | null;
};
function PodcastHomeCard({ show }: { show: FollowedShow }) {
  const player = usePodcastPlayer();
  const [, setLocation] = useLocation();

  const { data: showData } = useQuery<{ show: { slug: string; title: string; artwork: string | null }; episodes: PodcastHomeEpisode[] }>({
    queryKey: [`/api/podcasts/show/${show.slug}`],
    queryFn: () => apiRequest("GET", `/api/podcasts/show/${show.slug}`),
    staleTime: 15 * 60_000,
  });
  const { data: me } = useQuery<{ listenedKeys: string[] }>({
    queryKey: ["/api/podcasts/me"],
    queryFn: () => apiRequest("GET", "/api/podcasts/me"),
    staleTime: 60_000,
  });

  const episodes = showData?.episodes ?? [];
  const listened = new Set(me?.listenedKeys ?? []);
  const total = episodes.length;
  const heard = episodes.filter((e) => listened.has(`${show.slug}:${e.id}`)).length;
  const pct = total > 0 ? Math.round((heard / total) * 100) : 0;
  const caughtUp = total > 0 && heard >= total;
  const playable = episodes.filter((e) => !!e.audioUrl);
  // Next = newest episode not yet opened; once caught up, replay the latest.
  const nextEp = playable.find((e) => !listened.has(`${show.slug}:${e.id}`)) ?? playable[0] ?? null;

  // "Continue" episode: a started episode with a meaningful saved
  // position (> 30 s) and not essentially finished (< 95% of duration).
  // localStorage key mirrors PodcastPlayer's posKey helper.
  const posKey = (id: string) => `phoebe:podcast:pos:${show.slug}:${id}`;
  const inProgressEp = (() => {
    for (const e of playable) {
      if (!listened.has(`${show.slug}:${e.id}`)) continue; // not started
      const pos = parseFloat(localStorage.getItem(posKey(e.id)) ?? "0") || 0;
      if (pos < 30) continue; // virtually not started
      if (e.durationSeconds && pos / e.durationSeconds > 0.95) continue; // virtually done
      return e;
    }
    return null;
  })();
  // Prefer resuming in-progress episode over starting the next unheard one.
  const playTarget = inProgressEp ?? nextEp;
  const isContinue = !!inProgressEp;

  const title = showData?.show.title ?? show.title;
  const artwork = showData?.show.artwork ?? show.artwork;
  const progressLabel = total === 0
    ? "Open show →"
    : caughtUp ? `Caught up · ${total} episodes` : `${heard} of ${total} episodes`;

  const open = () => setLocation(`/podcasts/show/${show.slug}`);
  const playNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!playTarget || !playTarget.audioUrl) { open(); return; }
    player.play({
      showSlug: show.slug,
      episodeId: playTarget.id,
      title: playTarget.title,
      audioUrl: playTarget.audioUrl,
      imageUrl: playTarget.imageUrl ?? null,
      showTitle: title,
      showArtwork: artwork,
      durationSeconds: playTarget.durationSeconds,
      publishedAt: playTarget.publishedAt,
      description: playTarget.description,
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(); }}
      className="relative flex rounded-xl overflow-hidden cursor-pointer"
      style={{ background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)", border: "1px solid rgba(46,107,64,0.40)" }}
    >
      <div className="flex-1 px-4 py-[14px] flex items-center gap-3">
        {artwork ? (
          <img src={artwork} alt="" loading="lazy" style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", flexShrink: 0, background: "rgba(143,175,150,0.12)" }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: "rgba(46,107,64,0.30)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }} aria-hidden>🎧</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2, fontSize: 15 }}>
            {title}
          </p>
          <p style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif", margin: "3px 0 0", fontSize: 12 }}>
            {progressLabel}
          </p>
          {total > 0 && (
            <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: "rgba(143,175,150,0.18)" }}>
              <div style={{ height: "100%", width: `${pct}%`, borderRadius: 2, background: "#A8C5A0", transition: "width 0.3s" }} />
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={playNext}
          aria-label={isContinue ? "Continue episode" : caughtUp ? "Replay latest episode" : "Play next episode"}
          className="rounded-full text-center shrink-0 transition-opacity hover:opacity-90"
          style={{ background: "rgba(46,107,64,0.30)", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 500, padding: "6px 14px", border: "1px solid rgba(46,107,64,0.50)", whiteSpace: "nowrap", cursor: "pointer" }}
        >
          {isContinue ? "Continue" : caughtUp ? "Replay" : "Play next"} <span aria-hidden>▶</span>
        </button>
      </div>
    </div>
  );
}

// Forward Day by Day home card. Mirrors CacHomeCard: opens
// prayer.forwardmovement.org/fdd externally (their SPA resolves
// "today" client-side, so the same URL every day works), tracks
// "read today" in localStorage via the fdd-tracker in
// lib/cacReadState, and flips the pill to "Read again" once tapped.
//
// Forward Movement blue (rgba(96,141,209, …)) — FDD's identity color
// across the app (office player, office-close pill, this card). Clearly
// distinct from the brand-forest CAC card next to it.
function FddHomeCard() {
  const [hasRead, setHasRead] = useState(() => hasReadFddToday());
  useEffect(() => {
    const refresh = () => setHasRead(hasReadFddToday());
    window.addEventListener(FDD_READ_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(FDD_READ_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  // "written" (open today's FDD reading) vs "audio" (play the FDD podcast) —
  // chosen in Customize (the fdd-mode step). Refreshes when the pref changes.
  const [mode, setMode] = useState<"written" | "audio">(() => getFddMode());
  useEffect(() => {
    const refresh = () => setMode(getFddMode());
    window.addEventListener(OFFICE_PREFS_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(OFFICE_PREFS_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const player = usePodcastPlayer();
  // Today's FDD audio episode — only fetched when the user takes FDD by audio.
  const { data: episode } = useQuery<{ feedTitle: string | null; title: string | null; audioUrl: string | null; durationSeconds: number | null; publishedAt: string | null; imageUrl: string | null }>({
    queryKey: ["/api/podcast/forward-day-by-day/today"],
    queryFn: () => apiRequest("GET", "/api/podcast/forward-day-by-day/today"),
    enabled: mode === "audio",
    staleTime: 30 * 60_000,
  });
  const onClick = () => {
    if (mode === "audio" && episode?.audioUrl) {
      // Hand today's FDD episode to the global player (same as the office audio).
      player.play({
        showSlug: "forward-day-by-day",
        episodeId: episode.audioUrl,
        title: episode.title,
        audioUrl: episode.audioUrl,
        imageUrl: episode.imageUrl,
        showTitle: episode.feedTitle ?? "Forward Day by Day",
        showArtwork: episode.imageUrl,
        durationSeconds: episode.durationSeconds,
        publishedAt: episode.publishedAt,
        sessionSurface: "fdd-audio",
        showHref: "/podcast/forward-day-by-day",
      });
      // Listening to today's FDD counts as taking it — flip the card to done.
      recordFddOpened();
      return;
    }
    // Written: mark read only once the reader is closed (see CAC card above).
    openExternalThenMarkRead(FDD_TODAY_URL, recordFddOpened, { reader: true });
  };
  const pillLabel = mode === "audio"
    ? (hasRead ? "Listen again" : "Listen")
    : (hasRead ? "Read again" : "Read");
  const titleLabel = mode === "audio" ? "Forward Day by Day 🎧" : "Forward Day by Day 📖";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="relative flex rounded-xl overflow-hidden cursor-pointer"
      style={{ background: "rgba(96,141,209,0.13)", border: `1px solid rgba(96,141,209,0.40)` }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(96,141,209,0.85)` }} />
      <div className="flex-1 px-4 py-[14px] flex items-center justify-between gap-3">
        <p
          className="font-semibold min-w-0 truncate"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2, fontSize: 16 }}
        >
          {titleLabel}
        </p>
        <div
          className="rounded-full text-center shrink-0"
          style={{
            background: "rgba(96,141,209,0.28)",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            padding: "6px 14px",
            border: "1px solid rgba(96,141,209,0.50)",
            whiteSpace: "nowrap",
          }}
        >
          {pillLabel} <span aria-hidden>→</span>
        </div>
      </div>
    </div>
  );
}

// Praying the Psalms home card — replaces the office card for a side set to
// "psalms". Shows today's appointed psalms (per the chosen cycle) and opens the
// /psalms reader. Warm parchment tone, distinct from the blue FDD card.
function PsalmsHomeCard({ side, hero = false, requesterFaces = [], slideshowCount = 0 }: { side: "morning" | "evening"; hero?: boolean; requesterFaces?: Array<{ id: number; name: string; avatarUrl: string }>; slideshowCount?: number }) {
  const { t } = useTranslation();
  const [, goTo] = useLocation();
  const [done, setDone] = useState(() => hasPrayedPsalmsToday(side));
  const [cycle, setCycle] = useState(() => getPsalmCycle());
  useEffect(() => {
    const refresh = () => { setDone(hasPrayedPsalmsToday(side)); setCycle(getPsalmCycle()); };
    window.addEventListener(PSALMS_READ_EVENT, refresh);
    window.addEventListener(OFFICE_PREFS_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(PSALMS_READ_EVENT, refresh);
      window.removeEventListener(OFFICE_PREFS_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const today = new Date().toLocaleDateString("en-CA");
  const { data } = useQuery<{ psalms: Array<{ number: number; raw: string }> }>({
    queryKey: ["/api/psalms/today", cycle, side, today],
    queryFn: () => apiRequest("GET", `/api/psalms/today?cycle=${cycle}&office=${side}&date=${today}`),
    staleTime: 30 * 60_000,
  });
  const refs = (data?.psalms ?? []).map((p) => p.raw);
  // Named for the side, like the office hero — "Morning Psalms" / "Evening Psalms".
  const title = side === "evening" ? "Evening Psalms" : "Morning Psalms";
  const subtitle = refs.length > 0
    ? `Psalm${refs.length > 1 ? "s" : ""} ${refs.join(", ")}`
    : "Today's appointed psalms";
  const onClick = () => goTo(`/psalms?office=${side}&begin=1`);
  // Same colour as the side's office card (green for morning, violet for
  // evening) — not a beige/parchment tone — so it sits with the other rhythm
  // cards rather than standing out.
  const rgb = side === "evening" ? "124,116,196" : "46,107,64";

  // Hero layout — per owner, this is now the SAME shell/chrome as the office
  // hero in PrayerOfficeCard (rounded-3xl card, green accent bar, eyebrow,
  // avatar rail + prayer count, two-pill done state) — only the title and the
  // CTA's destination differ (Psalms, not the office).
  if (hero) {
    const withAvatars = requesterFaces;
    const countCopy = slideshowCount === 0
      ? null
      : `${slideshowCount} prayer${slideshowCount === 1 ? "" : "s"}`;
    return (
      <div
        className="relative flex rounded-3xl overflow-hidden"
        style={{
          background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
          border: "1px solid rgba(200,212,192,0.35)",
        }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: "rgba(46,107,64,0.9)" }} />
        <div className="flex-1 px-4 pt-[20px] pb-[20px]">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest min-w-0 truncate" style={{ color: "rgba(143,175,150,0.55)", margin: 0 }}>
              {t("dashboard.book_of_common_prayer", { defaultValue: "Book of Common Prayer" })}
            </p>
          </div>
          <div className="mt-[4px] flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-2xl font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2 }}>
                {title}
              </p>
              {countCopy && (
                <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif", margin: 0, marginTop: 10 }}>
                  {countCopy}
                </p>
              )}
            </div>
            {withAvatars.length > 0 && (
              <div className="flex items-center -space-x-2 shrink-0">
                {withAvatars.slice(0, 8).map((p) => (
                  <img key={p.id} src={p.avatarUrl} alt={p.name} title={p.name} className="w-6 h-6 rounded-full object-cover" style={{ border: "1.5px solid rgba(12,31,18,0.9)" }} />
                ))}
              </div>
            )}
          </div>
          {done ? (
            <div className="mt-[12px] flex items-stretch gap-2">
              <div aria-label="Prayer completed today" className="flex-1 rounded-xl text-center" style={{ background: "rgba(46,107,64,0.10)", color: "rgba(168,197,160,0.9)", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 500, padding: "7px 12px", border: "1px solid rgba(46,107,64,0.22)" }}>
                Prayer completed <span aria-hidden>✓</span>
              </div>
              <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }} className="flex-1 rounded-xl text-center cursor-pointer" style={{ background: "rgba(46,107,64,0.22)", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 500, padding: "7px 12px", border: "1px solid rgba(46,107,64,0.45)" }}>
                Pray again <span aria-hidden>→</span>
              </div>
            </div>
          ) : (
            <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }} className="mt-[12px] w-full rounded-xl text-center cursor-pointer" style={{ background: "rgba(46,107,64,0.22)", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 500, padding: "7px 12px", border: "1px solid rgba(46,107,64,0.45)" }}>
              Begin prayer <span aria-hidden>→</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="relative flex rounded-xl overflow-hidden cursor-pointer"
      style={{ background: `rgba(${rgb},0.13)`, border: `1px solid rgba(${rgb},0.40)` }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(${rgb},0.85)` }} />
      <div className="flex-1 px-4 py-[14px] flex items-center justify-between gap-3 min-w-0">
        <div className="min-w-0">
          <p className="font-semibold truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2, fontSize: 16 }}>
            {title} 📜
          </p>
          <p className="truncate" style={{ color: "#B6C2A8", fontFamily: "'Space Grotesk', sans-serif", margin: "2px 0 0", fontSize: 12.5 }}>
            {subtitle}
          </p>
        </div>
        <div
          className="rounded-full text-center shrink-0"
          style={{
            background: `rgba(${rgb},0.28)`, color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 500,
            padding: "6px 14px", border: `1px solid rgba(${rgb},0.50)`, whiteSpace: "nowrap",
          }}
        >
          {done ? "Prayed ✓" : "Pray"} <span aria-hidden>→</span>
        </div>
      </div>
    </div>
  );
}

// SSJE Reflections home card. Mirrors CacHomeCard / FddHomeCard: opens
// www.ssje.org/word externally (their page loads today's word
// client-side, so the same URL every day works), tracks "read today"
// in localStorage via the ssje-tracker in lib/cacReadState, and flips
// the pill to "Read again" once tapped.
//
// Warm amber palette (rgba(193,127,36, …)) — matches the SSJE pill in
// the office closing slide so the visual identity is consistent
// across surfaces, and stays distinct from the forest-green CAC card
// and the sea-teal FDD card when all three stack on the home.
function SsjeHomeCard() {
  const [hasRead, setHasRead] = useState(() => hasReadSsjeToday());
  useEffect(() => {
    const refresh = () => setHasRead(hasReadSsjeToday());
    window.addEventListener(SSJE_READ_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(SSJE_READ_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const onClick = () => {
    // Mark read only once the reader is closed (see CAC card above).
    openExternalThenMarkRead(SSJE_TODAY_URL, recordSsjeOpened, { reader: true });
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="relative flex rounded-xl overflow-hidden cursor-pointer"
      style={{ background: "rgba(193,127,36,0.13)", border: `1px solid rgba(193,127,36,0.42)` }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: `rgba(193,127,36,0.85)` }} />
      <div className="flex-1 px-4 py-[14px] flex items-center justify-between gap-3">
        <p
          className="font-semibold min-w-0 truncate"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2, fontSize: 16 }}
        >
          SSJE Reflections ✍🏽
        </p>
        <div
          className="rounded-full text-center shrink-0"
          style={{
            background: "rgba(193,127,36,0.28)",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            padding: "6px 14px",
            border: "1px solid rgba(193,127,36,0.52)",
            whiteSpace: "nowrap",
          }}
        >
          {hasRead ? "Read again" : "Read"} <span aria-hidden>→</span>
        </div>
      </div>
    </div>
  );
}

// National Cathedral Morning Prayer home card — live YouTube
// broadcast Mon–Fri 7:00 AM ET. Self-hides on weekends (the cathedral
// doesn't broadcast Sat/Sun), and the CTA pill flips between
// "Live now" / "Live in N min" / "Watch today's" based on
// getNcmpState() which computes everything in America/New_York so a
// PT user opening at 5 AM local sees the broadcast as "Live in 2 hr"
// rather than the cathedral's wall-clock 7 AM.
//
// Tap navigates to /ncmp/watch (the in-app YouTube iframe wrapper)
// instead of opening the cathedral's /live page in SFSafariView —
// the broadcast plays inline under a Phoebe header. The prayer-
// session log fires on the embed page's mount, so the metrics
// surface ("national-cathedral") stays identical. Server's floor-
// bypass list permits this surface so tap-style logs aren't dropped.
function NcmpHomeCard() {
  const [, setLocation] = useLocation();
  const state = getNcmpState();
  // Weekends + outside the broadcast window with no recording → no
  // card. The customize-home toggle stays on, but the card just
  // disappears from the home until the next broadcast cycle.
  if (!state.show) return null;
  const ctaLabel =
    state.kind === "live"
      ? "Live now"
      : state.kind === "upcoming"
        ? `Live in ${state.minutesUntil} min`
        : "Watch today's";
  const onClick = () => {
    // Navigation only — the embed page handles the prayer-session
    // log on mount. Keeping the side effect inside the destination
    // means we don't double-log when the user retraces via the
    // prayer-chooser or office picker (which now route the same way).
    setLocation("/ncmp/watch");
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="relative flex rounded-xl overflow-hidden cursor-pointer"
      // Slate-blue tint distinguishes it from the brand-forest CAC
      // card and the sea-teal FDD card — three "Read/Watch external"
      // anchors that should be visually separable when stacked.
      style={{ background: "rgba(90,120,180,0.12)", border: "1px solid rgba(90,120,180,0.38)" }}
    >
      <div className="flex-1 px-4 py-[14px] flex items-center justify-between gap-3">
        <p
          className="font-semibold min-w-0 truncate"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2, fontSize: 16 }}
        >
          National Cathedral 📺
        </p>
        <div
          className="rounded-full text-center shrink-0"
          style={{
            background: "rgba(90,120,180,0.28)",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            padding: "6px 14px",
            border: "1px solid rgba(90,120,180,0.48)",
            whiteSpace: "nowrap",
          }}
        >
          {ctaLabel} <span aria-hidden>→</span>
        </div>
      </div>
    </div>
  );
}

// ── HomeDoneSummaryCard — the all-kept hero ──────────────────────────────────
// Shown as the home hero once the day's rhythm is fully kept (morning +
// reflection + evening). A quiet benediction over a community summary: how many
// people prayed with you this week, and how many you prayed for.
function HomeDoneSummaryCard() {
  const { data: prayedWith } = useQuery<{ people: { id: number; name: string; avatarUrl: string | null }[]; total?: number }>({
    queryKey: ["/api/prayer-streak/community-prayed-week"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak/community-prayed-week"),
    staleTime: 5 * 60_000,
  });
  const { data: youPrayed } = useQuery<{ people: Array<{ id: number; name: string | null; avatarUrl: string | null }> }>({
    queryKey: ["/api/prayer-streak/co-prayers-week"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak/co-prayers-week"),
    staleTime: 5 * 60_000,
  });
  const withYou = prayedWith?.total ?? prayedWith?.people?.length ?? 0;
  const youFor = youPrayed?.people?.length ?? 0;
  return (
    <div
      className="relative flex rounded-xl overflow-hidden"
      style={{ background: "rgba(46,107,64,0.14)", border: "1px solid rgba(46,107,64,0.4)" }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: "rgba(110,180,130,0.9)" }} />
      <div className="flex-1 px-5 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "rgba(143,175,150,0.6)", fontFamily: "'Space Grotesk', sans-serif" }}>
          The day is kept 🌿
        </p>
        <p className="text-[15px] leading-relaxed mt-1.5 mb-4" style={{ color: "#F0EDE6", fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}>
          Rest now — the work and the prayer will keep till morning.
        </p>
        <div className="flex gap-3">
          {[
            { n: withYou, label: withYou === 1 ? "prayed with you this week" : "prayed with you this week" },
            { n: youFor, label: youFor === 1 ? "you prayed for this week" : "you prayed for this week" },
          ].map((s, idx) => (
            <div key={idx} className="flex-1 rounded-lg px-3 py-2.5" style={{ background: "rgba(46,107,64,0.16)" }}>
              <p className="font-bold leading-none" style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif", fontSize: 26 }}>{s.n}</p>
              <p className="text-[11.5px] mt-1 leading-snug" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── PrayerOfficeCard — always-visible "pray with your community" anchor ──
//
// The home-screen invitation to pray the appropriate office for the
// time of day. Defaults to the Devotion (the gentler entry point)
// with a small "or pray full Morning/Evening Prayer →" link as
// alternate. Time threshold is noon — same threshold the Daily
// Office picker uses for "today's office."
export function PrayerOfficeCard({ compact = false, forceSide }: { compact?: boolean; forceSide?: "morning" | "evening" } = {}) {
  const { t } = useTranslation();
  // Three time-of-day buckets:
  //   • < 12 → morning  → Morning Devotion (default depth)
  //   • 12–19 → evening → Evening Devotion (default depth)
  //   • ≥ 20 → night   → Compline (default depth)
  // The user's Settings → Default prayer picker still overrides which
  // depth they land on, but the *which-side* split is time-based.
  const hourNow = new Date().getHours();
  // The "what's next" home hero can force which side this card shows (so a
  // morning-prayer hero stays Morning even past noon, until it's done). Falls
  // back to the noon split when unforced.
  const isMorning = forceSide ? forceSide === "morning" : hourNow < 12;
  // Office-streak pill above the CTA. Same data source as before,
  // just the prefs lookup — no longer used to pick a "big" CTA.
  const { data: officePrefs } = useQuery<{
    lastPrayedMorning: "office" | "devotion" | null;
    lastPrayedEvening: "office" | "devotion" | null;
    officeStreak: number;
    defaultPrayerLevel?: "devotion" | "office" | "intercessions";
  }>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs"),
    staleTime: 60_000,
  });
  const officeStreak = officePrefs?.officeStreak ?? 0;
  // "Programmed an office" = the user explicitly chose the daily office as their
  // prayer — either the global default or either per-side level. Everyone
  // without an explicit community pick now gets the Daily Devotion default.
  // Which programmed prayer the user committed to (Rule of Life → Pray):
  //   "office"   → full Morning/Evening Prayer
  //   "devotion" → the shorter Daily Devotion (the default)
  //   null       → community ("Pray Together"), only when explicitly chosen
  const programmedLevel: "office" | "devotion" | null =
    (officePrefs?.defaultPrayerLevel === "office" ||
      getSideLevel("morning") === "office" ||
      getSideLevel("evening") === "office")
      ? "office"
      : (officePrefs?.defaultPrayerLevel === "devotion" ||
          getSideLevel("morning") === "devotion" ||
          getSideLevel("evening") === "devotion")
        ? "devotion"
        : (officePrefs?.defaultPrayerLevel === "intercessions" ||
            getSideLevel("morning") === "intercessions" ||
            getSideLevel("evening") === "intercessions")
          ? null
          : "devotion";
  // "Programmed prayer" (office OR devotion) → the begin-prayer CTA + per-half
  // "prayed today" tracking; community keeps the once-a-day Pray Together flow.
  const programmedOffice = programmedLevel !== null;

  const queryClient = useQueryClient();
  // (Removed) The one-time "switch every non-Devotion user to the Daily Devotion
  // default" migration lived here. That transition (from the retired offices-only
  // / community defaults) is long past, and the new-user default is now Praying
  // the Psalms with an explicit level chosen in Customize. The migration was
  // force-resetting BOTH sides to "devotion" — clobbering the psalms default and
  // people's evening-prayer choices ("evening keeps going back to devotion").

  const { data: communityPrayedData } = useQuery<{ people: { id: number; name: string; avatarUrl: string | null }[]; total?: number }>({
    queryKey: ["/api/prayer-streak/community-prayed-week"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak/community-prayed-week"),
    staleTime: 5 * 60_000,
  });
  const communityPrayed = communityPrayedData?.people ?? [];

  // Eyebrow: office users keep "Book of Common Prayer"; the Pray Together
  // card shows "{N} Requests" (active community prayer requests others have
  // open). The /api/prayer-requests fetch dedupes with the dashboard's own.
  const { data: officeReqData } = useQuery<Array<{ isAnswered?: boolean; isOwnRequest?: boolean; closedAt?: string | null; expiresAt?: string | null; ownerId?: number; ownerName?: string | null; ownerAvatarUrl?: string | null; isAnonymous?: boolean }>>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    staleTime: 60_000,
  });
  const openOfficeReqs = (officeReqData ?? []).filter(
    (r) => !r.isAnswered && !r.isOwnRequest && !r.closedAt && (!r.expiresAt || new Date(r.expiresAt) > new Date()),
  );
  const requestCount = openOfficeReqs.length;
  // The full count of what the office's prayer slideshow will walk through —
  // so the "N prayers" subtitle matches the slideshow, not just open requests.
  const slideshowCount = useSlideshowPrayerCount();
  // Faces of the people ASKING for prayer (open requests), deduped by owner,
  // non-anonymous, with an avatar — shown on the office card in place of the
  // who-prayed rail.
  const requesterFaces: Array<{ id: number; name: string; avatarUrl: string }> = [];
  {
    const seenOwners = new Set<number>();
    for (const r of openOfficeReqs) {
      if (r.isAnonymous || typeof r.ownerId !== "number" || !r.ownerAvatarUrl || seenOwners.has(r.ownerId)) continue;
      seenOwners.add(r.ownerId);
      requesterFaces.push({ id: r.ownerId, name: r.ownerName ?? "", avatarUrl: r.ownerAvatarUrl });
    }
  }
  const eyebrow = programmedOffice
    ? t("dashboard.book_of_common_prayer")
    : requestCount > 0
      ? t("dashboard.requests_count", { count: requestCount })
      : t("dashboard.community_prayer");

  // Authoritative source for "did the user pray today's side?" — server
  // returns the last 7 days of office/devotion completions in the
  // user's tz, split by morning/evening. LocalStorage stays as a
  // sync-immediate fallback (the just-prayed office writes its flag
  // synchronously while the session row needs an API round-trip), but
  // the server query is what catches sessions logged on a different
  // device or after a reinstall — that's the bug where the home CTA
  // sometimes still said "Begin prayer" even after the user had prayed.
  const { data: officeHistory } = useQuery<{ days: Array<{ ymd: string; morning: boolean; evening: boolean }> }>({
    queryKey: ["/api/me/office-history-week"],
    queryFn: () => apiRequest("GET", "/api/me/office-history-week"),
    staleTime: 30_000,
  });

  // "Prayed today" is scoped to the CURRENT half of the day. After
  // noon the CTA flips to "Evening Prayer" — at that boundary the
  // morning's completion flag stops counting, so a user who prayed
  // Morning Prayer sees a fresh "Begin prayer" CTA in the evening
  // until they've prayed an evening office.
  //
  // Two signals are unioned:
  //   • Server office-history-week — authoritative across devices.
  //   • phoebe:office-completed:{mode}:{day} — written by
  //     bcp-daily-office for each of the four office/devotion modes,
  //     synchronous so the dashboard flips before the next fetch.
  // The slideshow-completed flag is intentionally NOT read — it's a
  // separate surface (Community Intercessions) and tapping through it
  // shouldn't suppress the office CTA on either side.
  //
  // Bump a tick on focus + visibility so returning to the dashboard
  // after praying flips the CTA copy without needing a hard refresh
  // (localStorage doesn't fire same-tab storage events).
  const [stateTick, setStateTick] = useState(0);
  useEffect(() => {
    const bump = () => setStateTick((t) => t + 1);
    const onVis = () => { if (document.visibilityState === "visible") bump(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", bump);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", bump);
    };
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _stateTick = stateTick; // reads below depend on this for re-render

  // Per-user: when this side's prayer is Forward Day by Day, the FDD card IS the
  // office card here — it replaces it (only the user who picked FDD; everyone
  // else keeps their office). Morning only. Placed AFTER every hook above so the
  // early return can never make a hook conditional.
  if (getSideLevel(isMorning ? "morning" : "evening") === "fdd") {
    return <FddHomeCard />;
  }
  // Per-user: Praying the Psalms IS this side's prayer → the Psalms card replaces
  // the office card for this user. Same after-all-hooks placement as FDD.
  if (getSideLevel(isMorning ? "morning" : "evening") === "psalms") {
    // A forced side (the home "what's next" / office-hero slot) renders the big
    // hero variant; the compact mini stays small.
    return <PsalmsHomeCard side={isMorning ? "morning" : "evening"} hero={!compact && !!forceSide} requesterFaces={requesterFaces} slideshowCount={slideshowCount} />;
  }
  // Per-user: Contemplation / the Examen IS this side's prayer → its card
  // replaces the office card for this user. Same after-all-hooks placement as
  // FDD/Psalms; the forced (hero) slot renders the big variant.
  if (getSideLevel(isMorning ? "morning" : "evening") === "reflect-sit") {
    return <ContemplationHomeCard side={isMorning ? "morning" : "evening"} hero={!compact && !!forceSide} />;
  }
  if (getSideLevel(isMorning ? "morning" : "evening") === "examen") {
    return <ExamenHomeCard hero={!compact && !!forceSide} />;
  }
  // Per-user: Creation Prayer IS this side's prayer → its card replaces the
  // office card. Labels Morning/Evening Creation Prayer when both sides use it.
  // Hidden behind CREATION_PRAYER_ENABLED — when off, a stale "creation" pref
  // falls through to the normal office card.
  if (CREATION_PRAYER_ENABLED && getSideLevel(isMorning ? "morning" : "evening") === "creation") {
    return <CreationHomeCard side={isMorning ? "morning" : "evening"} hero={!compact && !!forceSide} />;
  }

  const prayedTodayHalf = (() => {
    if (typeof window === "undefined") return false;
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // Server-side: today's entry from the office history (last item
    // of the 7-day window). Check the side that matches the current
    // CTA half-of-day so the morning flag doesn't suppress the
    // evening CTA and vice versa.
    const serverDays = officeHistory?.days ?? [];
    const todayServer = serverDays[serverDays.length - 1];
    if (todayServer && todayServer.ymd === todayKey) {
      if (isMorning && todayServer.morning) return true;
      if (!isMorning && todayServer.evening) return true;
    }
    // Local fallback — synchronous flag the office viewer writes on
    // finish. Catches the moment right after praying before the
    // history query refetches.
    const sideModes = isMorning
      ? ["morning", "morning-devotion"]
      : ["evening", "early-evening-devotion", "compline"];
    try {
      for (const mode of sideModes) {
        if (localStorage.getItem(`phoebe:office-completed:${mode}:${todayKey}`)) return true;
      }
      return false;
    } catch {
      return false;
    }
  })();

  // "Pray Together" (no programmed office) is once a DAY, not split into
  // morning/evening — so it reads as prayed once either side was prayed today.
  const prayedTodayAny = (() => {
    if (typeof window === "undefined") return false;
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const serverDays = officeHistory?.days ?? [];
    const todayServer = serverDays[serverDays.length - 1];
    if (todayServer && todayServer.ymd === todayKey && (todayServer.morning || todayServer.evening)) return true;
    try {
      for (const mode of ["morning", "morning-devotion", "evening", "early-evening-devotion", "compline"]) {
        if (localStorage.getItem(`phoebe:office-completed:${mode}:${todayKey}`)) return true;
      }
      return false;
    } catch {
      return false;
    }
  })();

  const prayedToday = programmedOffice ? prayedTodayHalf : prayedTodayAny;

  // CTA destination respects the user's Settings → Default prayer
  // picker. Three levels:
  //   • devotion      — BCP short form (default; gentle daily rhythm).
  //                     After 8pm this swaps to Compline — the BCP's
  //                     night office, the natural "devotion-shaped"
  //                     close to the day. No separate "Compline
  //                     Devotion" exists; Compline is short on its own.
  //   • office        — full Morning/Evening Prayer (BCP long form).
  //                     After 8pm this also flips to Compline (same
  //                     "the office for this hour" intuition).
  //   • intercessions — community prayer-mode slideshow. Time-of-day
  //                     agnostic — same queue regardless of hour.
  // Within the chosen surface the alternates remain reachable (first-
  // slide pills on the Devotion + Compline, the dashboard's own
  // chooser route at /prayer-chooser, etc.); this just picks the
  // single-tap default. "Pray again" carries ?reset=1 so re-tapping
  // after a completed pass starts fresh rather than resuming — only
  // applies to the office/devotion routes (prayer-mode has its own
  // reset semantics).
  // The home CTA routes through /begin-prayer, the single routing brain
  // shared by the dashboard and the iOS home-screen shortcut. It honors
  // the user's "Default prayer" setting: "ask" (the out-of-box default)
  // opens the prayer chooser — the options screen with the last-prayed
  // depth pinned on top — while a fixed depth (devotion / office /
  // intercessions) drops straight in. Time-of-day buckets and ?reset
  // semantics live there (and per-option inside the chooser), so we
  // don't duplicate that logic on the card anymore.
  // Programmed office → the routing brain (/begin-prayer → their office).
  // Otherwise "Pray Together" opens the community prayer slideshow; re-tapping
  // after a completed pass starts fresh via ?reset=1.
  const ctaHref = programmedOffice
    ? "/begin-prayer"
    : (prayedToday ? "/prayer-mode?reset=1" : "/prayer-mode");
  // Started-but-not-finished today's office on this side → "Continue" (not
  // "Begin"). Mirrors the completed-key check above, reading the office
  // viewer's saved slide position (phoebe:office-progress:<mode>:<day>); the
  // viewer auto-resumes at that slide when re-entered via /begin-prayer.
  const inProgress = !prayedToday && (() => {
    if (typeof window === "undefined") return false;
    const d = new Date();
    const todayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const sideModes = isMorning
      ? ["morning", "morning-devotion"]
      : ["evening", "early-evening-devotion", "compline"];
    try {
      for (const mode of sideModes) {
        if (localStorage.getItem(`phoebe:office-completed:${mode}:${todayKey}`)) continue;
        const raw = localStorage.getItem(`phoebe:office-progress:${mode}:${todayKey}`);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { slideIdx?: number };
        if (typeof parsed.slideIdx === "number" && parsed.slideIdx > 0) return true;
      }
      return false;
    } catch {
      return false;
    }
  })();
  const ctaCopy = inProgress ? "Continue" : "Begin prayer";

  // Compact one-line variant — used when feed-first home promotes a
  // feed to the hero slot and the office becomes a secondary anchor.
  // Mirrors FeedPrayerCard's single-row layout (title + one CTA pill,
  // whole card taps through to /prayer-chooser) so the office reads
  // as the same kind of quieter secondary card the feed is for most
  // people. The full data (streak, community-prayed) is intentionally
  // dropped here — it lives on the full card.
  if (compact) {
    const title = programmedLevel === "devotion"
      ? (isMorning ? "Morning Devotion 🌅" : "Evening Devotion 🌙")
      : programmedLevel === "office"
        ? (isMorning ? "Morning Prayer 🌅" : "Evening Prayer 🌙")
        : "Pray Together 🙏🏽";
    return (
      <Link href={ctaHref} className="block">
        <div
          role="button"
          tabIndex={0}
          className="relative flex rounded-xl overflow-hidden cursor-pointer"
          style={{
            background: "rgba(46,107,64,0.14)",
            border: "1px solid rgba(46,107,64,0.4)",
          }}
        >
          <div className="flex-1 px-4 py-[14px] flex items-center justify-between gap-3">
            <p
              className="font-semibold min-w-0 truncate"
              style={{
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
                margin: 0,
                lineHeight: 1.2,
                fontSize: 16,
              }}
            >
              {title}
            </p>
            <div
              className="rounded-full text-center shrink-0"
              style={{
                background: prayedToday ? "rgba(46,107,64,0.10)" : "rgba(46,107,64,0.28)",
                color: prayedToday ? "rgba(168,197,160,0.9)" : "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                padding: "6px 14px",
                border: prayedToday
                  ? "1px solid rgba(46,107,64,0.22)"
                  : "1px solid rgba(46,107,64,0.45)",
                whiteSpace: "nowrap",
              }}
            >
              {prayedToday ? <>{t("dashboard.completed")} <span aria-hidden>✓</span></> : <>{t("dashboard.begin_prayer")} <span aria-hidden>→</span></>}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div
      className="relative flex rounded-3xl overflow-hidden"
      style={{
        background: "rgba(9,26,16, 0.297)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
        // Match the cascade rhythm cards exactly — same sage outline + 3xl
        // radius — so the hero reads as the same family, not a green-framed
        // outlier. Always full strength; the top progress indicator signals
        // completion, so the card no longer dims itself to mark "not prayed yet".
        border: "1px solid rgba(200,212,192,0.35)",
      }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: "rgba(46,107,64,0.9)" }} />
        <div className="flex-1 px-4 pt-[20px] pb-[20px]">
          <div className="flex items-start justify-between gap-2">
            <p
              className="text-[11px] font-semibold uppercase tracking-widest min-w-0 truncate"
              style={{ color: "rgba(143,175,150,0.55)", margin: 0 }}
            >
              {eyebrow}
            </p>
            {/* Customize pill removed from the hero card per owner — the
                rule-of-life customizer stays reachable from the menu. */}
          </div>
          {/* LEFT  column = title + "N people prayed with you this week"
              RIGHT column = avatar stack only (no copy beside it).
              Same vertical rhythm as the parish-weekly card above.
              Profile pictures only — entries without an avatar are
              filtered out. */}
          {(() => {
            // The avatar rail intentionally only renders people with
            // a profile photo (cleaner visual — initials chips next
            // to a row of real faces felt mismatched). The COUNT
            // text, though, has to reflect everyone who prayed:
            // otherwise a user without an avatar silently drops from
            // the tally, and the displayed number jumps around as
            // pray-ers come and go from the avatar-filtered subset
            // (this is what made the home card read 7 yesterday and
            // 3 today even though more people had prayed in the
            // interim). Use the full list for the count, the
            // filtered list for the rail.
            // Count = everyone who prayed (any way, not just offices) — the
            // server's true total, which can exceed the (capped) people list.
            // The office card surfaces who's ASKING for prayer, not who prayed:
            // the requesters' faces + "N prayer requests".
            const withAvatars = requesterFaces;
            const countCopy = slideshowCount === 0
              ? null
              : t("dashboard.office_requests_sub", { count: slideshowCount, defaultValue: `${slideshowCount} prayer${slideshowCount === 1 ? "" : "s"}` });
            return (
              // Title sits tight to the eyebrow above, with breathing
              // room below before the "N people prayed with you this
              // week" sub line. items-center vertically centers the
              // right-side avatar stack against the title + sub block.
              <div className="mt-[4px] flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p
                    className="text-2xl font-semibold"
                    style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2 }}
                  >
                    {/* Hero card: no morning/evening emoji — the big title carries
                        it on its own (compact cards keep the 🌅/🌙). */}
                    {programmedLevel === "devotion"
                      ? (isMorning ? t("offices.morning_devotion", { defaultValue: "Morning Devotion" }) : t("offices.evening_devotion", { defaultValue: "Evening Devotion" }))
                      : programmedLevel === "office"
                        ? (isMorning ? t("offices.morning_prayer") : t("offices.evening_prayer"))
                        : `${t("dashboard.prayer_list_title", { defaultValue: "Prayer List" })} 🙏🏽`}
                  </p>
                  {countCopy && (
                    <p
                      className="text-[11px]"
                      style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif", margin: 0, marginTop: 10 }}
                    >
                      {countCopy}
                    </p>
                  )}
                </div>
                {withAvatars.length > 0 && (
                  <div className="flex items-center -space-x-2 shrink-0">
                    {/* Show as many faces as fit the card (up from 5); the
                        count line above carries the true total. Capped so the
                        rail can't overflow / crush the title — 6 on the Devotion
                        variant (its longer title + 🌙 leave less room), 8 otherwise. */}
                    {withAvatars.slice(0, programmedLevel === "devotion" ? 6 : 8).map((p) => (
                      <img
                        key={p.id}
                        src={p.avatarUrl as string}
                        alt={p.name}
                        title={p.name}
                        className="w-6 h-6 rounded-full object-cover"
                        style={{ border: "1.5px solid rgba(12,31,18,0.9)" }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
          {prayedToday ? (
            // Two-pill split: a non-tappable "Prayer completed ✓"
            // status on the left, the tappable "Pray again" action on
            // the right. Equal width via flex-1 so the row balances on
            // any phone size. Status pill has the lighter sage fill
            // and no border lift so it reads as a settled win; the
            // action pill keeps the standard sage-accent + arrow.
            <div className="mt-[12px] flex items-stretch gap-2">
              <div
                aria-label="Prayer completed today"
                className="flex-1 rounded-xl text-center"
                style={{
                  background: "rgba(46,107,64,0.10)",
                  color: "rgba(168,197,160,0.9)",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "7px 12px",
                  border: "1px solid rgba(46,107,64,0.22)",
                }}
              >
                Prayer completed <span aria-hidden>✓</span>
              </div>
              <Link href={ctaHref} className="flex-1">
                <div
                  role="button"
                  tabIndex={0}
                  className="rounded-xl text-center cursor-pointer"
                  style={{
                    background: "rgba(46,107,64,0.22)",
                    color: "#F0EDE6",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 13,
                    fontWeight: 500,
                    padding: "7px 12px",
                    border: "1px solid rgba(46,107,64,0.45)",
                  }}
                >
                  Pray again <span aria-hidden>→</span>
                </div>
              </Link>
            </div>
          ) : (
            <Link href={ctaHref}>
              <div
                role="button"
                tabIndex={0}
                className="mt-[12px] w-full rounded-xl text-center cursor-pointer"
                style={{
                  background: "rgba(46,107,64,0.22)",
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  padding: "7px 12px",
                  border: "1px solid rgba(46,107,64,0.45)",
                }}
              >
                {ctaCopy} <span aria-hidden>→</span>
              </div>
            </Link>
          )}
      </div>
    </div>
  );
}

// ── FeedHeroCard — feed-first home's tall primary anchor ──
//
// The big card that takes the office card's slot when a user has
// feed-first home switched on (portal sign-ups default to it). Same
// visual format as PrayerOfficeCard — eyebrow, big title, "N prayed
// this week" sub-line, avatar rail, Begin/Completed CTA — but sourced
// from the featured prayer feed instead of the Daily Office. Tapping
// Begin opens the same /prayer-mode?queue=feed walk the FeedPrayerCard
// uses, so the prayer experience is identical; only the home anchor
// changes shape.
export function FeedHeroCard({ feed: row }: { feed: SubscribedFeed }) {
  const { feed, prayedToday, weekPrayers, weekPrayerCount } = row;
  const upcomingEvents = row.upcomingEvents ?? [];
  const faces = (weekPrayers ?? []).filter((p) => !!p.avatarUrl);
  // Honest total (uncapped) — falls back to the capped array length on
  // older API builds that don't return weekPrayerCount yet.
  const total = weekPrayerCount ?? (weekPrayers?.length ?? 0);
  const countCopy = total === 0
    ? null
    : total === 1
      ? "1 person prayed this week"
      : `${total} people prayed this week`;
  const walkHref = `/prayer-mode?queue=feed&slug=${feed.slug}`;

  return (
    <div
      className="relative flex rounded-xl overflow-hidden"
      style={{
        background: "rgba(46,107,64,0.08)",
        border: "1px solid rgba(46,107,64,0.4)",
      }}
    >
      <div className="flex-1 px-4 pt-[20px] pb-[20px]">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "rgba(143,175,150,0.55)", margin: 0 }}
          >
            Prayer Feed
          </p>
          <Link
            href="/settings"
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full text-center shrink-0 transition-opacity hover:opacity-80"
            style={{
              background: "rgba(46,107,64,0.22)",
              color: "#A8C5A0",
              border: "1px solid rgba(46,107,64,0.4)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            Reminders
          </Link>
        </div>
        <div className="mt-[4px] flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className="text-2xl font-semibold"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.2 }}
            >
              {feed.title} {feed.coverEmoji ?? "🌿"}
            </p>
            {countCopy && (
              <p
                className="text-[11px]"
                style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif", margin: 0, marginTop: 10 }}
              >
                {countCopy}
              </p>
            )}
          </div>
          {faces.length > 0 && (
            <div className="flex items-center -space-x-2 shrink-0">
              {faces.slice(0, 5).map((p) => (
                <img
                  key={p.id}
                  src={p.avatarUrl as string}
                  alt={p.name}
                  title={p.name}
                  className="w-6 h-6 rounded-full object-cover"
                  style={{ border: "1.5px solid rgba(12,31,18,0.9)" }}
                />
              ))}
            </div>
          )}
        </div>
        {prayedToday ? (
          <div className="mt-[12px] flex items-stretch gap-2">
            <div
              aria-label="Prayed today"
              className="flex-1 rounded-xl text-center"
              style={{
                background: "rgba(46,107,64,0.10)",
                color: "rgba(168,197,160,0.9)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                padding: "7px 12px",
                border: "1px solid rgba(46,107,64,0.22)",
              }}
            >
              Prayed today <span aria-hidden>✓</span>
            </div>
            <Link href={walkHref} className="flex-1">
              <div
                role="button"
                tabIndex={0}
                className="rounded-xl text-center cursor-pointer"
                style={{
                  background: "rgba(46,107,64,0.22)",
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  padding: "7px 12px",
                  border: "1px solid rgba(46,107,64,0.45)",
                }}
              >
                Pray again <span aria-hidden>→</span>
              </div>
            </Link>
          </div>
        ) : (
          <Link href={walkHref}>
            <div
              role="button"
              tabIndex={0}
              className="mt-[12px] w-full rounded-xl text-center cursor-pointer"
              style={{
                background: "rgba(46,107,64,0.22)",
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 14,
                fontWeight: 500,
                padding: "7px 12px",
                border: "1px solid rgba(46,107,64,0.45)",
              }}
            >
              Begin praying <span aria-hidden>→</span>
            </div>
          </Link>
        )}
        {upcomingEvents.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {upcomingEvents.slice(0, 2).map((ev) => (
              <FeedEventCard key={ev.id} event={ev} compact />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── FeedPrayerCard — per-subscribed-feed home anchor (beta only) ──
//
// One card per feed the viewer subscribes to, rendered under
// PrayerOfficeCard. Mirrors that card's visual rhythm:
//   • Eyebrow: "Prayer feed"
//   • Title:   the feed's title (with coverEmoji)
//   • Body:    "N people have prayed this week" + a stacked avatar row
//              of OTHER subscribers who've prayed in the rolling 7-day
//              window (server filters out the viewer themselves).
//   • CTA:     "Begin praying →" when the viewer hasn't prayed yet
//              today, or a split "Prayer completed ✓ | Pray again →"
//              once they have. Same conventions as PrayerOfficeCard's
//              CTA so the two cards feel paired.
//
// `prayedToday` is server-truth, computed by /api/prayer-feeds/subscribed
// from moment_posts check-ins against any of the feed's intercessions.
// Tap routes to /prayer-feeds/{slug} where "Pray the full list" lives.
export type { SubscribedFeed };
export function FeedPrayerCard({ feed: row }: { feed: SubscribedFeed }) {
  const { feed, prayedToday, unprayedCount } = row;
  const upcomingEvents = row.upcomingEvents ?? [];
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const newCount = unprayedCount ?? 0;
  // "New prayers" trumps "Prayer completed" — even if the viewer has
  // walked today's deck, a fresh intercession added afterwards still
  // deserves the call-out. The pulse + count CTA only shows when the
  // unprayed count is non-zero; the "View list" + "Completed" pills
  // otherwise behave as before.
  const showsNewCallout = newCount > 0;
  const slidePath = `/prayer-mode?queue=feed&slug=${feed.slug}`;
  const listPath = `/prayer-feeds/${feed.slug}`;
  const cta = showsNewCallout
    ? {
        label: t("dashboard.new_prayers_cta", { count: newCount }),
        href: slidePath,
        emphasized: true,
      }
    : prayedToday
    ? { label: t("dashboard.view_list_short"), href: listPath, emphasized: false }
    : { label: t("dashboard.begin_praying"), href: slidePath, emphasized: false };
  return (
    <div className="flex flex-col gap-2">
    {/* The whole card is tappable → opens the feed detail page. The CTA
        pill keeps its own (sometimes different — slideshow) destination
        and stops propagation so a tap on the pill doesn't also fire the
        card-level navigation. role/tabIndex/onKeyDown make the card
        surface keyboard-operable like a button. */}
    <div
      role="button"
      tabIndex={0}
      onClick={() => setLocation(listPath)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocation(listPath); }
      }}
      className="relative flex rounded-xl overflow-hidden cursor-pointer"
      style={{
        // Slightly lighter than PrayerOfficeCard's 0.08 fill so the two
        // cards read as a paired set without looking like the same row.
        background: "rgba(46,107,64,0.14)",
        // Border becomes a pulsing animation when there's a new
        // intercession to pray — the class wins over the inline color.
        border: "1px solid rgba(46,107,64,0.4)",
      }}
    >
      <div
        className={`flex-1 px-4 py-[14px] flex items-center justify-between gap-3 ${
          showsNewCallout ? "animate-feed-card-pulse rounded-xl" : ""
        }`}
        style={
          showsNewCallout
            ? { border: "1px solid rgba(46,107,64,0.4)", margin: -1 }
            : undefined
        }
      >
        {/* Title sits on a single row with the CTA(s) to the right —
            no avatars, no eyebrow, no subtitle. Smaller than the
            PrayerOfficeCard title so the feed cards read as quieter
            secondary anchors. */}
        <div className="min-w-0">
          {feed.kind === "parish" && (
            <p
              className="uppercase font-semibold"
              style={{ color: "rgba(143,175,150,0.6)", fontFamily: "'Space Grotesk', sans-serif", margin: 0, marginBottom: 2, fontSize: 9, letterSpacing: "0.16em" }}
            >
              ⛪ Parish
            </p>
          )}
          <p
            className="font-semibold min-w-0 truncate"
            style={{
              color: "#F0EDE6",
              fontFamily: "'Space Grotesk', sans-serif",
              margin: 0,
              lineHeight: 1.2,
              fontSize: 16,
            }}
          >
            {feed.title} {feed.coverEmoji ?? "🌿"}
          </p>
        </div>

        {/* Single CTA per state — keeps the card readable on narrow
            mobile widths where the previous "Completed ✓ | Pray again"
            split competed with the feed title for horizontal space.
            States in priority order:
              • new-callout: pulsing "N New Prayers →" pill linking
                straight into the slideshow. Wins over prayedToday
                because a fresh intercession added after today's
                walk still deserves the call-out.
              • prayedToday: "View list →" — the user has prayed it,
                so the next sensible affordance is to read the list,
                not to re-pray. Links to the feed detail page where
                "Pray the full list" lives if they want to re-walk.
              • default: "Begin praying →" linking into the slideshow.
            stopPropagation so the pill's destination wins over the
            card's feed-detail navigation. */}
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); setLocation(cta.href); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              setLocation(cta.href);
            }
          }}
          className="rounded-full text-center cursor-pointer shrink-0"
          style={{
            background: cta.emphasized
              ? "rgba(46,107,64,0.32)"
              : "rgba(46,107,64,0.28)",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 13,
            fontWeight: 500,
            padding: "6px 14px",
            border: cta.emphasized
              ? "1px solid rgba(143,210,160,0.55)"
              : "1px solid rgba(46,107,64,0.45)",
            whiteSpace: "nowrap",
          }}
        >
          {cta.label} <span aria-hidden>→</span>
        </div>
      </div>
    </div>
    {upcomingEvents.length > 0 && upcomingEvents.slice(0, 2).map((ev) => (
      <FeedEventCard key={ev.id} event={ev} compact />
    ))}
    </div>
  );
}

// ── ActiveRequestsCard — your own active asks + amen total + compose ──
//
// Sits under PrayerOfficeCard. Reads the viewer's active prayer
// requests (own + non-answered + non-closed + non-expired) and shows:
//   1. "You have N active prayer request(s)"
//   2. "Prayed M times so far" (sum of amenCountTotal across the
//      requests; the server only populates that field for the owner).
//   3. The same compose bar /prayer-list uses, so they can drop a
//      new ask in two taps.
//
// Empty state (no active own requests): card still renders so the
// compose bar stays visible — a short prompt replaces the count line.
// Lays out flat on the dashboard background — no card wrapper, no
// border, just a section heading + headline + sub + the standard
// compose input. The View pill sits inline with the headline (right
// edge), and the input stretches the full content width since
// nothing's clamping it anymore.
function ActiveRequestsCard({
  activeCount,
}: {
  activeCount: number;
}) {
  const { t } = useTranslation();
  // Per user direction: the headline always asks the open question
  // rather than reporting the user's own count. The count rolls up
  // into the View pill (which deep-links into /my-prayer-requests
  // where the count + state of each ask is visible).
  const headline = t("active_requests.headline");
  // activeCount is part of the public component API but no longer
  // surfaced — the View pill that used to deep-link into
  // /my-prayer-requests was removed per user direction.
  void activeCount;
  return (
    // Flat on the dashboard background — headline + compose.
    <div className="mt-8 px-1">
      <div className="mb-3">
        <p
          className="text-base font-semibold"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}
        >
          {headline}
        </p>
      </div>
      <PrayerListComposeBar />
    </div>
  );
}

// Fires the shared cascade-haptic ramp for a section's cards as they rise in —
// the same tick PrayerListCarousel / TimeSection use, so a section that isn't a
// component of its own (e.g. the "Your prayer requests" cards) still gets a
// haptic per card, continuing the one home-wide cascade. Renders nothing.
function CascadeHapticTrigger({ cascadeFrom, count, splashCleared }: { cascadeFrom: number; count: number; splashCleared: boolean }) {
  const hapted = useRef(false);
  useEffect(() => {
    if (!splashCleared || hapted.current || count <= 0) return;
    // Never tick under cards while the first-open intro is still up.
    if (isFirstOpenOnboardingActive()) return;
    hapted.current = true;
    return scheduleCascadeHaptics(cascadeFrom, count);
  }, [splashCleared, cascadeFrom, count]);
  return null;
}

// ── PrayerListCarousel — vertical Prayer List peek ──────────────────────
//
// Vertical stack of full-width cards, identical layout to RequestCard
// on /prayer-list (avatar | eyebrow + body). Clamped to ~3.5 card rows
// with a bottom fade so the user can see there's more below — same
// pattern SectionShell uses on the prayer-list page. "View all →" in
// the title row links into the full management surface.
type PrayerListCarouselRow = {
  id: number;
  body: string;
  isOwnRequest?: boolean;
  // A purely-private prayer from the viewer's own list (prayer_intentions) —
  // never shared with the community. Renders with a "Private to you" eyebrow
  // and no Amen pill, and taps into the main slideshow (where it rides as a
  // "Your Prayer" slide), not a request detail page.
  isOwnPrayer?: boolean;
  isAnonymous?: boolean;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  // Whether THIS viewer has already amened this request today (their tz).
  // Drives the inline "Amen" → "Amened" button state; resets next day.
  myAmenedToday?: boolean;
  // Community-intercession variant: same card UI (FROM {community} + body +
  // 🙏/✓), but the avatar is the community emoji and a tap opens the prayer
  // slideshow LED by this intercession (focusMoment), never a detail page.
  kind?: "request" | "intercession";
  momentToken?: string | null;
  avatarEmoji?: string | null;
  // When the intercession comes from a subscribed prayer feed (the Anglican
  // Cycle of Prayer, a diocesan calendar, etc.), the feed's title — shown as the
  // eyebrow in place of the generic "Community Intercession".
  feedTitle?: string | null;
};

function PrayerListCarousel({
  requests,
  viewerName,
  viewerAvatarUrl,
  tight = false,
  hideTitle = false,
  cascadeFrom = 0,
}: {
  requests: PrayerListCarouselRow[];
  viewerName: string | null;
  viewerAvatarUrl: string | null;
  /** When true, the section sits closer to whatever's above it.
   *  Set by the dashboard when no upcoming events are rendering so
   *  the carousel doesn't drift to the bottom of an empty page. */
  tight?: boolean;
  /** Hide the "Prayer List" title row — used under the home tab, which
   *  already labels the section, so the title isn't repeated. */
  hideTitle?: boolean;
  /** Global cascade start index — the carousel rows continue the home's
   *  one top-to-bottom cascade (rhythm rows → prayer list → events). */
  cascadeFrom?: number;
}) {
  const { t } = useTranslation();
  // Hold the row cascade + haptics until the app-open splash has faded (native).
  const [splashCleared, setSplashCleared] = useState<boolean>(() => {
    if (!isNativeShell()) return true;
    // The first-open intro renders OVER the home — hold the cascade + haptics
    // until it dissolves so nothing loads/ticks behind the overlay.
    if (shouldShowFirstOpenOnboarding()) return false;
    if (isFirstOpen()) return true; // first launch shows no splash → paint instantly
    try { return sessionStorage.getItem("phoebe:splash-done-once") !== null; } catch { return true; }
  });
  useEffect(() => {
    if (splashCleared) return;
    const clear = () => setSplashCleared(true);
    window.addEventListener("phoebe:splash-done", clear);
    window.addEventListener(FIRST_OPEN_ONBOARDING_CLOSED_EVENT, clear);
    // While the first-open intro is still up (a slow read), keep waiting rather
    // than un-gating the cascade behind it.
    let id = window.setTimeout(function fb() {
      if (isFirstOpenOnboardingActive()) { id = window.setTimeout(fb, 4000); return; }
      clear();
    }, 12000);
    return () => { window.removeEventListener("phoebe:splash-done", clear); window.removeEventListener(FIRST_OPEN_ONBOARDING_CLOSED_EVENT, clear); window.clearTimeout(id); };
  }, [splashCleared]);
  // The cascade runs once the splash has faded, on the SAME timeline as the
  // rhythm cards above (each card's delay is its global cascadeFrom index), so
  // the prayer list flows continuously right after the routine. It must NOT wait
  // on a separate readiness flag — that made the cards pop in as a delayed batch
  // ~2s after the rhythm (which paints from cache well before the flag flips).
  // (The per-row haptic ticks were removed per owner — the prayer list rises
  // in silently; only the rhythm cards above keep the cascade haptics.)
  const cascadeOn = splashCleared;
  // Tapping a prayer card (anywhere, including the 🙏) opens the prayer
  // slideshow focused on that request — and queues the rest of your prayer
  // list — so you actually pray it (and Amen there), rather than a silent
  // one-tap amen on the home.
  if (requests.length === 0) return null;

  // ~7 card rows before the fade. Each card is roughly 72-80px tall with
  // vertical gap (~80px effective); 600px lands around 7 full rows + a half-row
  // peek. Fade gradient sits on top so the partial card reads as "more below"
  // instead of a hard cutoff.
  const CLAMP = 600;
  const overflowing = requests.length > 7;

  const initials = (name: string) =>
    name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

  return (
    <div className={hideTitle ? "mt-1" : tight ? "mt-3" : "mt-6"}>
      {/* Title row mirrors SectionShell on /prayer-list. Under the home tab
          the title is hidden entirely (the tab already names the section). */}
      {hideTitle ? null : (
        // The title fades up with the cascade too (matches the events sections +
        // the Daily-progress headers), so it doesn't pop in ahead of its cards.
        <motion.div
          className="flex items-center gap-3 mb-2"
          initial={{ opacity: 0, y: 8 }}
          animate={splashCleared ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: Math.min(cascadeFrom * 0.1, 1.5) }}
        >
          <h3
            className="text-lg font-semibold"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {t("prayer_list.title")}
          </h3>
          <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
          <Link
            href="/prayer-list"
            className="text-[10px] font-semibold uppercase transition-opacity hover:opacity-80"
            style={{
              color: "rgba(143,175,150,0.55)",
              letterSpacing: "0.12em",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {t("prayer_list_carousel.view_all")}
          </Link>
        </motion.div>
      )}

      <div style={{ position: "relative" }}>
        <div
          className="space-y-2"
          style={
            overflowing
              ? {
                  maxHeight: CLAMP,
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch",
                  paddingBottom: 8,
                }
              : undefined
          }
        >
          {requests.map((req, i) => {
            // Shade each card along the SAME green→violet ramp the practice
            // cards use (rhythmGradientRgb), by its position in the list, so the
            // Prayer List reads as one family with the daily rhythm cards.
            // Keep the Prayer List cards within ~20% of the colour range (a subtle
            // single step), not the full green→dark sweep across just a few cards.
            const rgb = rhythmGradientRgb(i, (requests.length - 1) * 5 + 1);
            const displayName = req.isAnonymous
              ? t("prayer_list_carousel.anonymous")
              : (req.isOwnRequest ? (viewerName ?? t("gratitude.you")) : (req.ownerName ?? t("find_friends.someone")));
            const displayAvatar = req.isAnonymous
              ? null
              : (req.isOwnRequest ? viewerAvatarUrl : (req.ownerAvatarUrl ?? null));
            // A community intercession is labelled as such (it's the
            // community's shared prayer, not a "from {person}" request).
            const eyebrow = req.kind === "intercession"
              ? (req.feedTitle?.trim() || t("prayer_list_carousel.community_intercession", { defaultValue: "Community Intercession" }))
              : req.isOwnPrayer
                ? t("prayer_list_carousel.private_to_you", { defaultValue: "Private to you" })
                : req.isOwnRequest
                  ? t("prayer_list_carousel.your_request")
                  : t("prayer_list_carousel.from_name", { name: displayName });
            const amened = !!req.myAmenedToday;
            // Tapping an UN-prayed card opens the prayer slideshow (walk through
            // the undone requests, praying each). A PRAYED card isn't in that
            // "new" queue anymore — the slideshow filters it out, so a tap there
            // skipped straight to the pause slide. Instead, open its detail page
            // so an already-prayed request always still comes up. The checkbox
            // circle on the right is a quick one-tap "pray".
            return (
              <Link
                key={req.isOwnPrayer ? `p-${req.id}` : req.kind === "intercession" ? `m-${req.id}` : `r-${req.id}`}
                href={
                  req.isOwnPrayer
                    // A private prayer has no community request to focus — open
                    // the main slideshow, where it rides as a "Your Prayer" slide.
                    ? `/prayer-mode?reset=1`
                    : req.kind === "intercession"
                    // A community intercession ALWAYS opens the slideshow (led by
                    // it), prayed or not — never a detail page.
                    ? `/prayer-mode?focusMoment=${encodeURIComponent(req.momentToken ?? "")}`
                    // A request ALWAYS opens the slideshow led by it too — even if
                    // already prayed today (the slideshow now starts ON the
                    // focused request rather than skipping it).
                    : `/prayer-mode?focus=${req.id}`
                }
                className="block"
              >
                <motion.div
                  // Continue the home's one top-to-bottom wave: each card's delay
                  // is its GLOBAL index (cascadeFrom + i), so the prayer list rises
                  // right after the rhythm cards above. Gated on cascadeOn so it
                  // only starts once those are settled — no animating mid-reflow.
                  initial={{ opacity: 0, y: 8 }}
                  animate={cascadeOn ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: Math.min((cascadeFrom + i) * 0.1, 1.4) }}
                  // A "new" (still-unprayed) request pulses its BORDER COLOR like
                  // a today's-event card — replacing the old top-of-home "N
                  // requests waiting" card. Prayed ones rest calm.
                  className={`relative flex rounded-xl overflow-hidden transition-transform active:scale-[0.99] ${amened ? "" : "animate-turn-pulse-practices"}`}
                  style={{
                    background: "rgba(22,46,32, 0.330)", backdropFilter: "blur(11.34px)", WebkitBackdropFilter: "blur(11.34px)",
                    // Shared home-card outline — matches the "+" FAB ring.
                    border: "1px solid rgba(200,212,192,0.35)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
                  }}
                >
                  <div className={`w-1 flex-shrink-0 ${amened ? "" : "animate-bar-pulse-practices"}`} style={amened ? { background: `rgba(${rgb},0.72)` } : undefined} />
                  <div className="flex-1 px-4 pt-3 pb-3">
                    <div className="flex items-center gap-3">
                      {/* LEFT avatar — the requester's own profile picture (mine
                          on my own request, the other person's on theirs). The
                          who-prayed-for-me face stack on the RIGHT is gone; the
                          🙏/✓ pill there is the status indicator. */}
                      {req.avatarEmoji ? (
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
                          style={{ background: "#1A4A2E", border: "1px solid rgba(46,107,64,0.3)" }}
                          aria-hidden
                        >
                          {req.avatarEmoji}
                        </div>
                      ) : displayAvatar ? (
                        <img
                          src={displayAvatar}
                          alt={displayName}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                          style={{ border: "1px solid rgba(46,107,64,0.3)" }}
                        />
                      ) : (
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                          style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                        >
                          {initials(displayName)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-0.5 truncate"
                          style={{ color: "rgba(143,175,150,0.55)" }}
                        >
                          {eyebrow}
                        </p>
                        <p
                          className="text-sm leading-snug line-clamp-2"
                          style={{ color: "#F0EDE6" }}
                        >
                          {req.body}
                        </p>
                      </div>
                      {/* Amen oval — same size as the daily-practice check pills.
                          Not prayed = a 🙏🏽 amen hand; prayed = a ✓. Both are
                          decorative spans — the whole card is a Link, so tapping
                          the 🙏 opens the prayer slideshow on THIS request (and
                          queues the rest of your prayer list) to pray it there,
                          rather than a silent one-tap amen. Shown on your own
                          request too, so you can see whether you've prayed it. */}
                      {!req.isOwnPrayer && (
                        amened ? (
                          <span
                            aria-label={t("prayer_card.amened", { defaultValue: "Prayed" })}
                            className="flex-shrink-0 inline-flex items-center justify-center rounded-full font-semibold"
                            // Same border + color as the daily-practice check pills.
                            style={{
                              height: 30, padding: "0 14px",
                              background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)",
                              color: "rgba(240,237,230,0.85)", fontSize: 14, lineHeight: 1,
                            }}
                          >
                            ✓
                          </span>
                        ) : (
                          <span
                            aria-hidden
                            className="flex-shrink-0 inline-flex items-center justify-center rounded-full"
                            style={{
                              height: 30, padding: "0 13px",
                              background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.45)",
                              fontSize: 15, lineHeight: 1,
                            }}
                          >
                            🙏🏽
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </motion.div>
              </Link>
            );
          })}
        </div>
        {/* Bottom fade — only when overflowing. Same gradient + page bg
            color the /prayer-list SectionShell uses, so the visual
            language of "more below" is identical across surfaces. */}
        {overflowing && (
          <div
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, transparent 20%, #091A10)" }}
          />
        )}
      </div>

      {/* "Pray through the whole list" CTA removed per product direction —
          the New prayer request button below now carries the ghost style it
          used to have. */}
    </div>
  );
}

function PrayerListCard({
  pendingCount,
  streak,
  keyPrefix,
  muted = false,
  prayedToday = false,
  partialRemaining = 0,
  faces,
  gardenPrayedTodayCount = 0,
  newPrayersCount = 0,
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
  // slideshow. Rendered in the top-right corner of line 1
  // (the spot the View list pill used to occupy before it moved
  // to the bottom-row pill pair). Empty array = no avatars shown.
  faces?: Array<{ key: string; name: string; avatarUrl: string | null }>;
  // How many people in the viewer's garden have walked their own
  // slideshow today. When > 0 the subtitle alternates between the
  // primary content and "X people prayed with you today" with a
  // gentle cross-fade.
  gardenPrayedTodayCount?: number;
  // How many open prayer requests from others the viewer hasn't yet
  // amened today. Surfaces as "X new prayers" rotated into the line-2
  // alternation so the user gets a nudge about un-engaged requests
  // even though the home screen no longer carries a Prayer Requests
  // section underneath.
  newPrayersCount?: number;
}) {
  const { t } = useTranslation();
  const colors = CATEGORY_COLORS.practices;
  // "Continue praying" only shows when the user hasn't yet completed
  // today's slideshow. Once they've finished a pass (prayedToday=true),
  // a partially-bailed second pass is just that — a casual re-visit —
  // and the card stays in its restful "Pray again / N prayers prayed
  // today" state instead of nudging them as if they had unfinished
  // work. The earlier behavior surfaced "Continue praying" any time
  // partialRemaining > 0, which read as wrong when the user had
  // explicitly closed the loop earlier in the day.
  const isPartial = partialRemaining > 0 && !prayedToday;
  const primarySubtitle = prayedToday
    ? t("dashboard.prayed_today", { count: pendingCount })
    : isPartial
      ? t("dashboard.more_prayers", { count: partialRemaining })
      : t("dashboard.pending_prayers", { count: pendingCount });
  const gardenSubtitle = gardenPrayedTodayCount > 0
    ? t("dashboard.prayed_with_you_today", { count: gardenPrayedTodayCount })
    : null;
  const newPrayersSubtitle = newPrayersCount > 0
    ? t("dashboard.new_prayers", { count: newPrayersCount })
    : null;
  // Build the rotation list. The primary subtitle is always slot 0;
  // additional slots are appended only when their data exists, so the
  // rotation length matches the number of meaningful messages we have
  // to show. With one slot we don't tick at all (single value, no
  // animation cost); with two or three we cycle every 4s.
  const subtitleSlots = useMemo(() => {
    const slots: Array<{ key: string; text: string }> = [
      { key: "primary", text: primarySubtitle },
    ];
    if (newPrayersSubtitle) slots.push({ key: "new", text: newPrayersSubtitle });
    if (gardenSubtitle) slots.push({ key: "garden", text: gardenSubtitle });
    return slots;
  }, [primarySubtitle, newPrayersSubtitle, gardenSubtitle]);
  const [subtitleIdx, setSubtitleIdx] = useState(0);
  useEffect(() => {
    // Reset to the primary slot whenever the rotation set changes
    // (e.g. an amen tap drops newPrayersCount to 0 and the "new"
    // slot disappears mid-cycle). Without this we'd briefly index
    // out of bounds and render a blank line during the cross-fade.
    setSubtitleIdx(0);
    if (subtitleSlots.length <= 1) return;
    const id = setInterval(() => {
      setSubtitleIdx(i => (i + 1) % subtitleSlots.length);
    }, 4000);
    return () => clearInterval(id);
  }, [subtitleSlots]);
  const safeIdx = subtitleIdx < subtitleSlots.length ? subtitleIdx : 0;
  const activeSlot = subtitleSlots[safeIdx];
  const visibleSubtitle = activeSlot.text;
  const visibleSubtitleKey = activeSlot.key;

  // If the user has already finished today's pass, the CTA reads
  // "Pray again" and they expect a fresh start. Pass ?reset=1 so the
  // slideshow skips its resume-from-last-amen branch and lands on
  // slide 0 (mirroring what tapping a brand-new slideshow does).
  // For a partial session (Continue) we still want resume behavior,
  // so we leave the URL bare in that case.
  const ctaHref = prayedToday ? "/prayer-mode?reset=1" : "/prayer-mode";

  return (
    <Link key={`${keyPrefix}-prayer-list`} href={ctaHref} className="block">
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
          {/* Line 1: title on the left, streak chip on the right.
              Streak sits up here so it reads as the headline metric;
              avatars dropped down to line 2 next to the subtitle so
              the right-edge column reads streak → faces → View list. */}
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-base font-semibold"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              🕯️ {t("dashboard.daily_prayer_list")}
            </span>
            {streak > 0 && (
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

          {/* Line 2: subtitle on the left (cross-fading rotation across
              "X waiting", "X new prayers", and the garden-prayed-with-you
              variant), avatar stack on the right. Streak used to live
              here — it moved up to line 1 to read as the headline. */}
          <div className="mt-1.5 flex items-center justify-between gap-3">
            {/* `flex-1 min-w-0` is load-bearing: the subtitle is
                `absolute inset-0` for the cross-fade, which means it
                contributes 0 intrinsic width. Without flex-1 here the
                subtitle vanishes — that bug shipped briefly. */}
            <div className="relative min-w-0 flex-1" style={{ height: 20 }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={visibleSubtitleKey}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-sm truncate absolute inset-0"
                  style={{
                    color: "#8FAF96",
                    lineHeight: "20px",
                    margin: 0,
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                >
                  {visibleSubtitle}
                </motion.p>
              </AnimatePresence>
            </div>
            {faces && faces.length > 0 && (
              <div className="flex items-center -space-x-2 shrink-0">
                {faces.slice(0, 3).map((f) => (
                  <div
                    key={f.key}
                    title={f.name}
                    className="rounded-full overflow-hidden shrink-0"
                    style={{
                      width: 24, height: 24,
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
                        className="w-full h-full flex items-center justify-center text-[10px] font-semibold"
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
          </div>

          {/* Line 3 — CTA strip.
                Not yet started or partial: a single full-width primary
                  pill ("Pray for your community" / "Continue"). The
                  view-list secondary button is suppressed in this state
                  because the user's job-to-be-done is just "go pray";
                  giving them a sibling action splits attention.
                Done a full pass today (prayedToday): two equal pills
                  side-by-side (Pray again + View list). View list
                  carries the red-dot signal for new requests that
                  haven't been amened yet, since by the time the user
                  has cleared today's pass the surfacing job shifts
                  from "do the thing" to "see what's happening". */}
          {!muted && !prayedToday && (
            <div className="mt-3 w-full">
              <div
                className="w-full rounded-xl text-center"
                style={{
                  background: "#4A7A5B",
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                  padding: "9px 12px",
                  border: "1px solid rgba(111,175,133,0.45)",
                }}
              >
                {isPartial ? t("dashboard.continue_short") : t("dashboard.pray_for_community")}
                <span aria-hidden> →</span>
              </div>
            </div>
          )}
          {!muted && prayedToday && (
            <div className="mt-3 w-full flex gap-2">
              <div
                className="flex-1 rounded-xl text-center"
                style={{
                  background: "rgba(111,175,133,0.22)",
                  color: "#F0EDE6",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                  padding: "7px 12px",
                  border: "1px solid rgba(111,175,133,0.35)",
                }}
              >
                {t("dashboard.pray_again_short")}
                <span aria-hidden> →</span>
              </div>
              <Link
                href="/prayer-list"
                onClick={(e) => e.stopPropagation()}
                className="flex-1 rounded-xl text-center relative"
                style={{
                  background: "rgba(200,212,192,0.08)",
                  color: "#C8D4C0",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: "-0.01em",
                  padding: "7px 12px",
                  border: "1px solid rgba(143,175,150,0.35)",
                  textDecoration: "none",
                }}
              >
                {t("dashboard.view_list_short")}
                <span aria-hidden> →</span>
                {newPrayersCount > 0 && (
                  <span
                    aria-label={`${newPrayersCount} new prayer${newPrayersCount === 1 ? "" : "s"}`}
                    className="absolute"
                    style={{
                      top: 6,
                      right: 8,
                      width: 8,
                      height: 8,
                      borderRadius: 9999,
                      // iOS-notification-dot red. The 1.5px ring
                      // matches the surrounding pill background so
                      // the dot reads as a discrete notification on
                      // top of the button instead of a smear.
                      background: "#E63946",
                      boxShadow: "0 0 0 1.5px rgba(15,40,24,1)",
                    }}
                  />
                )}
              </Link>
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

  // Card layout: feed name is the headline, "N praying" sits underneath,
  // and a "View" pill anchors the right side. The day's entry title and
  // scripture reference are deliberately not surfaced here — they're the
  // payload the user discovers when they tap through. Earlier we put
  // today's entry in the headline ("Rising Ocean Levels") and tucked the
  // feed identity into the subtitle, which read as "an individual
  // intercession" instead of "the climate feed today" and tested as
  // confusing.
  const prayCount = sf.todayEntry?.prayCount ?? 0;
  const subtitle = sf.todayEntry
    ? `${prayCount} ${prayCount === 1 ? "person" : "people"} praying`
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
        <div className="flex-1 px-4 pt-3 pb-3 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold truncate" style={{ color: "#F0EDE6" }}>
                {emoji} {sf.feed.title}
              </p>
              <p className="text-sm mt-0.5 truncate" style={{ color: "#8FAF96", lineHeight: "20px" }}>
                {subtitle}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              View →
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Service detail modal ───────────────────────────────────────────────────
// Full list of every service time in a group's schedule. Opened from
// ServiceCard; dismissed by tapping the backdrop or the close button.

export function ServiceDetailModal({
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
  onOpenConsolidatedServices,
  onOpenGathering,
  trailingCards,
  cascade,
  cascadeFrom = 0,
}: {
  label: string;
  items: DashboardItem[];
  userEmail: string;
  userName: string;
  onOpenService: (schedule: ServiceSchedule, nextDate: Date) => void;
  onOpenConsolidatedServices: (schedules: ServiceSchedule[], nextDate: Date) => void;
  onOpenGathering: (r: any) => void;
  // Extra cards to render after the typed items (e.g. the PrayerListCard
  // when the user already finished today's list and we want to preview
  // tomorrow's). If there are no items and no trailingCards, the section
  // hides itself so empty days stay quiet.
  trailingCards?: React.ReactNode;
  /** Stagger each card in (home event lists) instead of appearing at once. */
  cascade?: boolean;
  cascadeFrom?: number;
}) {
  // Hold the event-card cascade until the app-open splash has faded (native),
  // so the cards rise into view rather than animating behind the splash —
  // matching the rhythm cards in DailyProgressBody. Immediate on web.
  const [splashCleared, setSplashCleared] = useState<boolean>(() => {
    if (!isNativeShell()) return true;
    // Hold the events cascade + haptics behind the first-open intro too.
    if (shouldShowFirstOpenOnboarding()) return false;
    if (isFirstOpen()) return true; // first launch shows no splash → paint instantly
    try { return sessionStorage.getItem("phoebe:splash-done-once") !== null; } catch { return true; }
  });
  useEffect(() => {
    if (splashCleared) return;
    const clear = () => setSplashCleared(true);
    window.addEventListener("phoebe:splash-done", clear);
    window.addEventListener(FIRST_OPEN_ONBOARDING_CLOSED_EVENT, clear);
    let id = window.setTimeout(function fb() {
      if (isFirstOpenOnboardingActive()) { id = window.setTimeout(fb, 4000); return; }
      clear();
    }, 12000);
    return () => { window.removeEventListener("phoebe:splash-done", clear); window.removeEventListener(FIRST_OPEN_ONBOARDING_CLOSED_EVENT, clear); window.clearTimeout(id); };
  }, [splashCleared]);
  const evtHaptedRef = useRef(false);
  useEffect(() => {
    if (!cascade || !splashCleared || evtHaptedRef.current) return;
    if (isFirstOpenOnboardingActive()) return; // never tick behind the intro
    evtHaptedRef.current = true;
    return scheduleCascadeHaptics(cascadeFrom, items.length);
  }, [cascade, splashCleared, cascadeFrom, items.length]);
  if (items.length === 0 && !trailingCards) return null;

  // Render in the input array's order — caller (parent useMemo) has
  // already sorted by chronological time-of-occurrence so a 9am practice
  // lands before the same day's 6:30pm gathering and a Sunday service
  // drops to last when its date is later in the week. Earlier this
  // function bucketed by `kind` (services → gatherings → moments → …),
  // which threw the chronological order out the window.
  // Walk the items in chronological order.
  const renderedNodes: React.ReactNode[] = [];
  for (const item of items) {
    if (item.kind === "service") {
      renderedNodes.push(
        <ServiceCard
          key={`${label}-s-${item.data.id}`}
          schedule={item.data}
          nextDate={item.nextDate}
          isOnDate={item.isOnDate}
          onOpen={() => onOpenService(item.data, item.nextDate)}
          keyPrefix={label}
        />,
      );
    } else if (item.kind === "services") {
      renderedNodes.push(
        <ConsolidatedServiceCard
          key={`${label}-ss-${item.schedules.map((s) => s.id).join("-")}`}
          schedules={item.schedules}
          nextDate={item.nextDate}
          isOnDate={item.isOnDate}
          onOpen={() => onOpenConsolidatedServices(item.schedules, item.nextDate)}
          keyPrefix={label}
        />,
      );
    } else if (item.kind === "gathering") {
      renderedNodes.push(
        <GatheringCard
          key={`${label}-g-${item.data.id}`}
          r={item.data}
          keyPrefix={label}
          badge={item.badge}
          onOpen={() => onOpenGathering(item.data)}
        />,
      );
    } else if (item.kind === "feed") {
      renderedNodes.push(
        <FeedTodayCard
          key={`${label}-f-${item.data.feed.id}`}
          sf={item.data}
          keyPrefix={label}
        />,
      );
    } else if (item.kind === "plan") {
      renderedNodes.push(
        <PlanEventCard
          key={`${label}-p-${item.data.id}`}
          p={item.data}
          keyPrefix={label}
        />,
      );
    } else if (item.kind === "moment") {
      renderedNodes.push(
        <MomentCard
          key={`${label}-m-${item.data.id}`}
          m={item.data}
          userEmail={userEmail}
          keyPrefix={label}
          nextWindow={item.nextWindow}
        />,
      );
    }
  }

  const visibleCardCount = renderedNodes.length + (trailingCards ? 1 : 0);
  const scrollable = visibleCardCount > 3;

  const cards = (
    <div className="space-y-3">
      {cascade
        ? renderedNodes.map((node, idx) => (
            <motion.div
              key={isValidElement(node) && node.key != null ? node.key : idx}
              initial={{ opacity: 0, y: 8 }}
              animate={splashCleared ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: Math.min((cascadeFrom + idx) * 0.1, 1.5) }}
            >
              {node}
            </motion.div>
          ))
        : renderedNodes}
      {trailingCards}
    </div>
  );

  return (
    <div className={scrollable ? "mb-3" : "mb-5"}>
      {/* The section title fades up with the cascade too (visual only — haptics
          are scheduled per card, so titles never buzz). */}
      {cascade ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={splashCleared ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: Math.min(cascadeFrom * 0.1, 1.5) }}
        >
          <SectionHeader label={label} />
        </motion.div>
      ) : (
        <SectionHeader label={label} />
      )}
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
  // Praying for someone isn't a streak/goal to complete — an intercession keeps
  // no "N sessions / try again / streak" framing; it just asks whether to keep
  // holding the person in prayer.
  const isIntercession = moment.templateType === "intercession";

  // An intercession is not a goal you hit or a streak you keep. You chose how
  // long to hold someone in prayer; when that time comes to its end, it simply
  // ends. So this is ONE calm screen — no celebration slide, no page dots, no
  // "sessions / try again" — that says the season of prayer has run its course
  // and asks: keep going, or set it down together?
  if (isIntercession) {
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

          <div className="flex flex-col items-center text-center gap-5">
            <p className="text-4xl">{emoji}</p>
            <h2 className="text-xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              You've held them in prayer.
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
              You and your group have carried{" "}
              <span style={{ color: "#C8D4C0" }}>{moment.name}</span> in prayer for the
              time you set aside. Would you like to keep going, or set it down together?
            </p>

            {memberNames.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
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

            {!deleting ? (
              <div className="w-full flex flex-col gap-2.5 mt-1">
                <button
                  onClick={() => updateGoalMutation.mutate({ commitmentSessionsGoal: null, commitmentTendFreely: true })}
                  disabled={updateGoalMutation.isPending}
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  Keep praying {emoji}
                </button>
                <button
                  onClick={() => setDeleting(true)}
                  disabled={deleteMutation.isPending}
                  className="w-full py-3 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{
                    background: "rgba(46,107,64,0.12)",
                    color: "#A8C5A0",
                    border: "1px solid rgba(46,107,64,0.28)",
                  }}
                >
                  Set this prayer down
                </button>
              </div>
            ) : (
              <div className="w-full rounded-2xl px-4 py-4 mt-1" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.28)" }}>
                <p className="text-sm mb-3 leading-relaxed" style={{ color: "#C8D4C0" }}>
                  This closes the prayer and clears it from your group's list. You can always begin it again.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    {deleteMutation.isPending ? "Setting down…" : "Yes, we're complete"}
                  </button>
                  <button
                    onClick={() => setDeleting(false)}
                    className="flex-1 py-2.5 rounded-xl text-sm"
                    style={{ color: "#8FAF96" }}
                  >
                    Not yet
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const slides = [
    // Slide 0: Celebration — group focused
    <div key="celebrate" className="flex flex-col items-center text-center gap-5">
      <p className="text-4xl">{emoji}</p>
      <h2 className="text-xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        {isIntercession ? "You've held them in prayer." : "Your group kept the rhythm."}
      </h2>
      <p className="text-sm leading-relaxed" style={{ color: "#8FAF96" }}>
        {isIntercession ? (
          <>
            You and your group have carried{" "}
            <span style={{ color: "#C8D4C0" }}>{moment.name}</span> in prayer together.
          </>
        ) : (
          <>
            You set a goal of {goal} {goal === 1 ? "session" : "sessions"} for{" "}
            <span style={{ color: "#C8D4C0" }}>{moment.name}</span>.
            {gStreak > 0
              ? ` Your group built a ${gStreak}-day streak together.`
              : " The commitment is fulfilled."}
          </>
        )}
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

      {isIntercession ? (
        <>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Would you like to keep praying?
          </p>
          <button
            onClick={() => updateGoalMutation.mutate({ commitmentSessionsGoal: null, commitmentTendFreely: true })}
            disabled={updateGoalMutation.isPending}
            className="w-full py-3.5 rounded-2xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "#2D5E3F", color: "#F0EDE6" }}
          >
            Keep praying {emoji}
          </button>
        </>
      ) : gStreak > 0 ? (
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

      {/* "Continue without a goal" is redundant for an intercession — "Keep
          praying" already tends it freely, with no goal. */}
      {!isIntercession && (
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
      )}

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

// Whether the app-open splash has faded (native). Cards gate their fade-up
// cascade on this so the animation plays in front of the user instead of behind
// the splash. Mirrors the per-component logic in PrayerListCarousel /
// TimeSection. Web (no splash) → true immediately.
function useSplashCleared(): boolean {
  const [cleared, setCleared] = useState<boolean>(() => {
    if (!isNativeShell()) return true;
    if (shouldShowFirstOpenOnboarding()) return false; // hold behind the first-open intro
    if (isFirstOpen()) return true; // first launch shows no splash → nothing to wait for
    try { return sessionStorage.getItem("phoebe:splash-done-once") !== null; } catch { return true; }
  });
  useEffect(() => {
    if (cleared) return;
    const clear = () => setCleared(true);
    window.addEventListener("phoebe:splash-done", clear);
    window.addEventListener(FIRST_OPEN_ONBOARDING_CLOSED_EVENT, clear);
    let id = window.setTimeout(function fb() {
      if (isFirstOpenOnboardingActive()) { id = window.setTimeout(fb, 4000); return; }
      clear();
    }, 12000);
    return () => { window.removeEventListener("phoebe:splash-done", clear); window.removeEventListener(FIRST_OPEN_ONBOARDING_CLOSED_EVENT, clear); window.clearTimeout(id); };
  }, [cleared]);
  return cleared;
}

export default function Dashboard({ eventsOnly = false }: { eventsOnly?: boolean } = {}) {
  const { t } = useTranslation();
  // Gate the "Your prayer requests" cards' fade-up on the splash fading, so they
  // cascade in front of the user (not invisibly behind the splash).
  const ownReqSplashCleared = useSplashCleared();
  // Experimental "Water" home theme (super-admin toggle, Settings). When on, the
  // home backdrop is a water photo and Layout lays a blue mix-blend wash over
  // the whole screen (see lib/homeTheme + components/layout.tsx).
  const homeTheme = useHomeTheme();
  const homeBgPhoto = useMemo(
    () => {
      const set = homeTheme === "water" && WATER_PHOTOS.length > 0
        ? WATER_PHOTOS
        : HOME_LEAF_PHOTOS;
      return set.length > 0 ? set[Math.floor(Math.random() * set.length)]! : null;
    },
    [homeTheme],
  );
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  // Guest SHAPE (public close-off, slice 4): true for signed-out guests AND
  // signed-in non-beta/non-admin users when the flag is on — the public home
  // shows no prayer list / composer / events regardless of account data.
  // (The signed-OUT storage branches elsewhere still key on !user.)
  const { isGuest: isGuestShape } = useGuestMode();
  const [filter, setFilter] = useState<"practices" | null>(null);
  // Native vs. web detection. The iOS shell injects `window.PhoebeNative`
  // before the JS bundle runs, so reading it once at mount is safe and
  // avoids a first-paint flash. We use this to show the calendar date
  // above the feast eyebrow on web only — the native app keeps the
  // tighter header since the OS status bar already shows time/date.
  const [isNative] = useState(() => {
    if (typeof window === "undefined") return false;
    const phoebeNative = (window as { PhoebeNative?: { isNative?: () => boolean } }).PhoebeNative;
    return !!phoebeNative?.isNative?.();
  });
  // Service-schedule modal: which schedule (and computed next occurrence) is
  // currently showing its full list of service times.
  const [openService, setOpenService] = useState<{ schedule: ServiceSchedule; nextDate: Date } | null>(null);
  // Consolidated-services modal — multiple worship schedules surfaced
  // as one home card open into a single modal listing every community's
  // times.
  const [openConsolidatedServices, setOpenConsolidatedServices] =
    useState<{ schedules: ServiceSchedule[]; nextDate: Date } | null>(null);
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

  const { isBeta, isLoading: betaLoading } = useBetaStatus();
  // Daily prayer routine is rolled out to everyone: the new home (daily cards
  // split into Next/Done + the prayer list) is now the home for ALL users, not
  // just beta. The Daily Progress page, its header pill, and the rule-of-life
  // Customizer were already open to all. Flip this to false to restore the
  // legacy module home for non-beta users.
  const newHomeForEveryone = true;
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

  // The daily "N prayers waiting for you" popup was removed at the
  // user's request — the always-visible PrayerListCard already covers
  // the invite, and the popup felt like noise on every launch.

  // Local-timezone YYYY-MM-DD. Used to read today's slideshow progress
  // (saved by prayer-mode on advance / X-out) so the PrayerListCard
  // can render "Continue praying / N more prayers" when the user
  // started today's slideshow but didn't finish.
  function todayLocalKey(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // ── "You have a new letter" popup ──────────────────────────────────────
  // Queued behind the daily prayer-invite and the beta-welcome so only one
  // modal is ever visible. Fires when any correspondence returns
  // unreadCount > 0 AND the viewer hasn't already dismissed that particular
  // set this session. Dismiss stores the current set of unread correspondence
  // ids so subsequent visits are quiet until a new one arrives.

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
    // Render instantly from the persisted cache on a warm open, then refresh in
    // the background — staleTime:0 forced a blocking refetch on every open, which
    // is the slowest home call. Detail-page renew/archive already invalidate this
    // key explicitly (see the focus/appactive handlers below), so a short window
    // doesn't hide those edits.
    staleTime: 60_000,
  });

  // Community membership. A brand-new user not in any group sees NO home
  // events — the upcoming schedule comes from the communities you belong to.
  const { data: dashGroupsData } = useQuery<{ groups: Array<{ id: number }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const hasGroup = (dashGroupsData?.groups?.length ?? 0) > 0;

  // ── Daily prayer-slideshow invite ────────────────────────────────────────
  // Declared here, AFTER momentsData, because the effect's dep array reads
  // momentsData and would otherwise blow up on first render with a
  // "Cannot access uninitialized variable" (TDZ).
  type DashPrayerRequest = {
    id: number; isAnswered: boolean; isOwnRequest?: boolean; closedAt?: string | null;
    ownerId?: number; ownerName?: string | null; ownerAvatarUrl?: string | null; isAnonymous?: boolean;
    // Prayer body — rendered in the home-screen Prayer List carousel
    // as a 2-line line-clamped preview.
    body?: string;
    // ISO timestamp the request stops appearing to non-owners. The
    // carousel filters expired-for-others rows defensively (the API
    // already does this server-side, but a stale cache could let one
    // slip through during an hour-long expiry crossing).
    expiresAt?: string | null;
    // True when THIS viewer has tapped Amen on this request today (in
    // their tz). Drives the "X more prayers / Continue praying"
    // partial-progress card state below.
    myAmenedToday?: boolean;
    // True when THIS viewer has *ever* tapped Amen on this request
    // (any day). Drives the "X new prayers" subtitle so a request
    // they engaged with previously doesn't reappear as "new" tomorrow
    // morning when myAmenedToday flips back to false.
    myAmenedEver?: boolean;
    // Total times THIS request has been prayed for (deduped per-user-
    // per-day). Server only populates this for the request's owner.
    // Used by ActiveRequestsCard to roll up "prayed N times" across
    // the viewer's own active requests.
    amenCountTotal?: number | null;
    // Distinct people who have prayed this request (owner-only).
    amenPeopleCount?: number | null;
    // Up to 3 faces of who prayed for THIS request, newest-first (owner-only).
    amenFaces?: Array<{ name: string | null; avatarUrl: string | null }> | null;
  };
  type DashCircleIntention = { id: number; groupId: number };

  const { data: dashPrayerRequests } = useQuery<DashPrayerRequest[]>({
    queryKey: ["/api/prayer-requests"],
    queryFn: () => apiRequest("GET", "/api/prayer-requests"),
    enabled: !!user,
    // Paint INSTANTLY from a synchronous device snapshot (like the splash faces)
    // so the list never sits blank on a cold open — immune to React Query's
    // async rehydration / 5MB-quota eviction / 24h expiry. updatedAt 0 marks it
    // stale so the live refetch below still runs immediately. Keyed by user id so
    // a prior account's list never flashes on a shared device.
    initialData: () => {
      if (!user) return undefined;
      try {
        const raw = localStorage.getItem("phoebe:prayer-list-snapshot");
        if (!raw || raw.length > 300_000) return undefined;
        const parsed = JSON.parse(raw);
        if (parsed && parsed.uid === user.id && Array.isArray(parsed.list)) return parsed.list as DashPrayerRequest[];
      } catch { /* ignore (corrupt / private mode) */ }
      return undefined;
    },
    initialDataUpdatedAt: 0,
    // Always refetch when the home mounts or regains focus, so a prayer prayed
    // anywhere else (the slideshow, a request page) shows as checked here.
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  // Re-save the snapshot whenever the list lands, so next cold open paints it
  // instantly. Size-guarded so a huge list can't blow the localStorage quota.
  useEffect(() => {
    if (!user || !dashPrayerRequests) return;
    try {
      const raw = JSON.stringify({ uid: user.id, list: dashPrayerRequests });
      if (raw.length <= 300_000) localStorage.setItem("phoebe:prayer-list-snapshot", raw);
    } catch { /* ignore (quota / private mode) */ }
  }, [user, dashPrayerRequests]);
  // The home prayer-list carousel rows — the viewer's OWN + others' open prayer
  // requests AND group community intercessions, in one sorted list. Computed
  // ONCE here so the carousel render and the events' cascade base both use the
  // SAME rows and the same count: a single source of truth keeps the cascade
  // smooth across every card type (own request, others' request, intercession)
  // with no gap or overlap at the events boundary.
  const homeCarouselRows = useMemo<PrayerListCarouselRow[]>(() => {
    const requestRows: PrayerListCarouselRow[] = (dashPrayerRequests ?? [])
      .filter((r) => {
        if (r.isAnswered) return false;
        if (r.closedAt) return false;
        if (typeof r.body !== "string" || r.body.length === 0) return false;
        if (r.expiresAt && new Date(r.expiresAt) <= new Date()) return false;
        return true; // own requests included (they show in this same list)
      })
      .map((r) => ({
        id: r.id,
        body: r.body ?? "",
        isOwnRequest: r.isOwnRequest,
        isAnonymous: r.isAnonymous,
        ownerName: r.ownerName ?? null,
        ownerAvatarUrl: r.ownerAvatarUrl ?? null,
        myAmenedToday: r.myAmenedToday,
      }));
    const intercessionRows: PrayerListCarouselRow[] = (momentsData?.moments ?? [])
      // Community (group) intercessions AND subscribed prayer-feed intercessions
      // (e.g. the Anglican Cycle of Prayer / Diocese calendars) — both belong in
      // the home prayer list. Feed ones were previously excluded here (they only
      // had the quieter feed anchor card), so a subscribed feed's daily
      // intercession never showed in the list.
      .filter((m) => m.templateType === "intercession" && m.state !== "archived" && (!!m.group || !!m.prayerFeedId))
      .map((m) => ({
        id: m.id,
        body: (m.intercessionFullText?.trim() || m.intercessionTopic?.trim() || m.intention?.trim() || m.name || ""),
        isOwnRequest: false,
        isAnonymous: false,
        ownerName: m.group?.name ?? m.feed?.title ?? null,
        ownerAvatarUrl: null,
        myAmenedToday: m.myPrayedToday === true,
        kind: "intercession" as const,
        momentToken: m.momentToken,
        avatarEmoji: m.group?.emoji ?? "🙏🏽",
        // Feed-sourced intercessions show the feed's name as their eyebrow.
        feedTitle: m.feed?.title ?? null,
      }));
    // Other people's prayers first: community + prayer-feed intercessions at the
    // top (a feed's daily prayer reads as today's), then other people's requests,
    // then your own requests. Unprayed before prayed within each group (a stable
    // sort keeps the source order otherwise).
    const groupRank = (r: PrayerListCarouselRow): number =>
      (r.isOwnRequest || r.isOwnPrayer) ? 2 : (r.kind === "intercession" ? 0 : 1);
    return [...requestRows, ...intercessionRows].sort((a, b) => {
      const g = groupRank(a) - groupRank(b);
      if (g !== 0) return g;
      return (a.myAmenedToday ? 1 : 0) - (b.myAmenedToday ? 1 : 0);
    });
  }, [dashPrayerRequests, momentsData]);
  // (The own-request card's "who prayed for THIS request" faces now come per-
  // request from /api/prayer-requests (req.amenFaces), so the global
  // prayed-for-me-month query that used to back it here was removed.)
  // Belt-and-suspenders: the home can be restored from the back/forward cache
  // without remounting (Safari bfcache, native back-swipe), which skips
  // refetchOnMount. Re-pull the prayer list whenever the page becomes visible
  // again so amens made elsewhere always show as checked.
  useEffect(() => {
    const refresh = () => { queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] }); };
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("phoebe:appactive", refresh);
    return () => {
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("phoebe:appactive", refresh);
    };
  }, [queryClient]);
  // Circle intentions — shared prayer intentions inside every prayer circle
  // the user belongs to. Each intention is its own prayer (a circle can have
  // many intentions), so we count rows, not circles.
  const { data: dashCircleIntentions } =
    useQuery<{ intentions: DashCircleIntention[] }>({
      queryKey: ["/api/groups/me/circle-intentions"],
      queryFn: () => apiRequest("GET", "/api/groups/me/circle-intentions"),
      enabled: !!user,
    });

  // Communities the viewer is in. One pill per community renders in the
  // category strip above — tapping a pill routes straight to that
  // community's detail page. Replaces the old generic "Communities" pill.
  type DashGroup = { id: number; name: string; slug: string; emoji: string | null; myRole?: string };
  const { data: dashGroups } = useQuery<{ groups: DashGroup[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });
  // Admin of any community → the "New prayer request" pill opens a chooser
  // (request for yourself vs. community intercession) instead of going straight
  // to the personal request composer.
  const isAdminOfAny = (dashGroups?.groups ?? []).some((g) => g.myRole === "admin" || g.myRole === "hidden_admin");
  const [showNewPrayerChoice, setShowNewPrayerChoice] = useState(false);

  // The daily prayer-invite popup logic and its supporting effect were
  // removed at the user's request. dashCircleIntentions /
  // dashPrayerRequests stay because the dashboard cards and the
  // PrayerListCard partial-progress count still consume them.

  // Service schedules — one card per schedule on the dashboard; each schedule
  // can hold many service times but surfaces as a single card. Click the
  // card to see every time in the schedule.
  const { data: serviceSchedulesData } = useQuery<{ schedules: ServiceSchedule[] }>({
    queryKey: ["/api/me/service-schedules"],
    queryFn: () => apiRequest("GET", "/api/me/service-schedules"),
    enabled: !!user,
  });
  const serviceSchedules = serviceSchedulesData?.schedules ?? [];

  // Subscribed prayer feeds. Each row carries the feed plus (optionally)
  // today's entry and whether I've already prayed today, so the
  // dashboard card can render without a second hop. Fetched for any
  // signed-in user — the earlier beta gate was stale (the FeedPrayerCard
  // render is already open to everyone) and feed-first home needs this
  // for portal sign-ups, who aren't necessarily beta. The endpoint
  // returns only the caller's own subscriptions, so it's cheap + safe.
  const { data: subscribedFeedsData } = useQuery<{ subscriptions: SubscribedFeed[] }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    enabled: !!user,
  });
  // phoebe-climate is intentionally excluded from the home-screen feed
  // cards — its content surfaces through the prayer-list slideshow and
  // the dedicated /climate hub. Showing it as a card here added clutter
  // without driving extra engagement.
  const subscribedFeeds = (subscribedFeedsData?.subscriptions ?? []).filter(
    (f) => f.feed.slug !== "phoebe-climate",
  );

  // Feed-first home: when the user has a featured feed (set at signup
  // for portal sign-ups) AND the toggle is on AND that feed is in their
  // subscriptions, it gets the tall hero card in the office card's slot,
  // the office card is hidden, and the feed is dropped from the
  // secondary FeedPrayerCard list below so it isn't doubled.
  const featuredFeed = (user?.feedFirstHome && user?.homeFeedId != null)
    ? subscribedFeeds.find((f) => f.feed.id === user.homeFeedId) ?? null
    : null;
  const secondaryFeeds = featuredFeed
    ? subscribedFeeds.filter((f) => f.feed.id !== featuredFeed.feed.id)
    : subscribedFeeds;

  // ── Home-screen layout (Customize page) ──────────────────────────────
  // The anchor area is an ordered, hideable list of modules. When the
  // user hasn't customized (homeLayout null), we derive a default that
  // preserves today's layout: requests on top, the lead (feed if
  // feed-led, else office), then the rest; Contemplation hidden by
  // default. The first visible office/feeds module is the "primary"
  // anchor — it gets the full office card / the feed hero card.
  const HOME_MODULES = ["office", "feeds", "contemplation", "listening", "reading", "walk", "cobreathe", "prayer-list", "examen", "guided-prayer", "cac", "fdd", "ssje", "ncmp", "podcasts", "requests"] as const;
  type HomeModule = typeof HOME_MODULES[number];
  // The default everyone starts at: prayer requests pinned on top, then
  // community prayers (office) → Listen (contemplation) → Forward Day by Day.
  // Everything else is hidden but addable from Customize.
  const DEFAULT_ORDER: HomeModule[] = ["requests", "office", "contemplation", "fdd", "feeds", "prayer-list", "examen", "guided-prayer", "cac", "ssje", "ncmp", "podcasts"];
  // "feeds" is intentionally NOT hidden by default: the home feeds slot renders
  // nothing until you've subscribed to a prayer feed, so leaving it visible just
  // means a subscribed feed shows up on home automatically (no customizer trip).
  const DEFAULT_HIDDEN = ["reading", "walk", "cobreathe", "prayer-list", "examen", "guided-prayer", "cac", "ssje", "ncmp", "podcasts"];
  // Honor ANY saved layout regardless of its version — bumping the version must
  // NEVER discard the user's customization (that was the "every code change
  // wipes my home / I lose my cards" bug). The order-merge below keeps the
  // user's order + hidden and appends any modules added since they customized,
  // so a code change migrates their layout forward instead of resetting it.
  const savedLayout = user?.homeLayout ?? null;
  // Prayer requests always leads — never hidden. A current-version saved
  // `hidden` set is the source of truth; otherwise the default applies.
  const homeHidden = (() => {
    const s = new Set<string>(savedLayout?.hidden ?? DEFAULT_HIDDEN);
    s.delete("requests");
    return s;
  })();
  const homeOrder: HomeModule[] = (() => {
    const saved = savedLayout?.order ?? null;
    // Keep known keys in saved order, then append any missing modules so
    // a newly-added module always has a place.
    const seen = new Set<string>();
    const out: HomeModule[] = [];
    for (const k of saved ?? DEFAULT_ORDER) {
      if ((HOME_MODULES as readonly string[]).includes(k) && !seen.has(k)) {
        seen.add(k);
        out.push(k as HomeModule);
      }
    }
    for (const k of HOME_MODULES) if (!seen.has(k)) out.push(k);
    // Pin Prayer requests to the front so it always leads. Podcasts is retired
    // from the home — filter it out everywhere so neither a saved layout nor
    // the default order can surface it (the offices keep their own audio; only
    // the Podcasts content module is hidden).
    return ["requests", ...out.filter((k) => k !== "requests" && k !== "podcasts")];
  })();
  // Primary anchor = first visible office/feeds module → full office /
  // feed hero; the other office instance drops to the compact card.
  const primaryAnchor = homeOrder.find(
    (k) => (k === "office" || k === "feeds") && !homeHidden.has(k),
  );

  // ── Dynamic "what's next" hero ─────────────────────────────────────────────
  // For office-led users (not feed-first), the top card follows the day's
  // rhythm instead of always being the office: Morning Prayer → the primary
  // reflection → Evening Prayer, with contemplation always a SEPARATE card.
  //   • before 3pm: morning prayer, then (once prayed) the reflection
  //   • 3pm+:       evening prayer leads — the reflection is hidden until
  //                 evening prayer is done, then it becomes the hero
  //   • all kept:   a community summary (who you prayed with / who prayed
  //                 with you)
  const rhythm = useRhythmState();
  // Once every daily prayer anchor is done, the routine drops off the home and
  // the upcoming-events schedule takes its place (the cards still live on the
  // /daily-progress page). Only flips after the rhythm queries settle.
  const allHabitsDone = rhythm.ready && rhythm.totalAnchors > 0 && rhythm.doneCount >= rhythm.totalAnchors;
  const heroReflectionSource = useEffectiveReflectionSource();
  const dynamicHero = !featuredFeed;
  const reflectKey: HomeModule | null =
    heroReflectionSource === "cac" || heroReflectionSource === "fdd" || heroReflectionSource === "ssje"
      ? (heroReflectionSource as HomeModule)
      : null;
  const reflectAvailable = reflectKey != null && homeOrder.includes(reflectKey) && !homeHidden.has(reflectKey);
  const heroNowHour = new Date().getHours();
  // Evening Prayer only takes over as the hero from 5pm on — before then the
  // afternoon hero stays on the morning office / today's reflection. (Earlier
  // this was 3pm, which surfaced Evening Prayer too early in the day.)
  const heroAfternoon = heroNowHour >= 17;
  type HomeHero =
    | { kind: "office"; side: "morning" | "evening" }
    | { kind: "reflect"; key: HomeModule }
    | { kind: "summary" };
  const homeHero: HomeHero | null = !dynamicHero ? null : (() => {
    // Only anchors the user actually keeps drive the hero. A turned-off office
    // (morning/evening pref "none") or reflection (source "none") never becomes
    // the "what's next" card; with everything kept, the community summary shows.
    // Morning only leads the hero while it's still morning — once it's past noon
    // we don't surface a missed morning office; the hero moves on to reflection /
    // evening (matches Daily progress dropping the morning card in the afternoon).
    const morningPending = rhythm.morningActive && !rhythm.morningDone && heroNowHour < 12;
    const eveningPending = rhythm.eveningActive && !rhythm.eveningDone;
    const reflectPending = rhythm.reflectActive && !rhythm.reflectDone && reflectAvailable;
    if (!morningPending && !eveningPending && !reflectPending) return { kind: "summary" };
    if (!heroAfternoon) {
      if (morningPending) return { kind: "office", side: "morning" };
      if (reflectPending) return { kind: "reflect", key: reflectKey! };
      if (eveningPending) return { kind: "office", side: "evening" };
      return { kind: "summary" };
    }
    if (eveningPending) return { kind: "office", side: "evening" };
    if (reflectPending) return { kind: "reflect", key: reflectKey! };
    if (morningPending) return { kind: "office", side: "morning" };
    return { kind: "summary" };
  })();
  const heroKey: HomeModule | null =
    homeHero?.kind === "office" ? "office" : homeHero?.kind === "reflect" ? homeHero.key : null;
  const heroOfficeSide = homeHero?.kind === "office" ? homeHero.side : undefined;
  // In dynamic-hero mode the reflection only ever appears AS the hero —
  // it never lingers as a list card before it's up or after it's read.
  // (This also covers the 5pm rule: the hero is the office then, so the
  // reflection is hidden until evening prayer is done.)
  const reflectionIsHero = (key: HomeModule) => !dynamicHero || heroKey === key;
  // Whether the office card renders as the big hero (vs the compact one-liner).
  const officeIsHero = dynamicHero ? heroKey === "office" : primaryAnchor === "office";

  // Podcast shows the user has added to home (localStorage-backed). The
  // "podcasts" module expands to one PodcastHomeCard per followed show,
  // mirroring how "feeds" expands to one card per subscribed feed.
  const followedShows = useFollowedShows();

  // Gatherings / traditions the user owns or participates in. Enriched
  // rows already carry `nextMeetupDate`, so bucketing into Today /
  // Tomorrow / This week is the same pattern as service schedules.
  const { data: ritualsData } = useQuery<any[]>({
    queryKey: ["/api/rituals", user?.id],
    queryFn: () => apiRequest("GET", `/api/rituals?ownerId=${user!.id}`),
    enabled: !!user,
  });
  const rituals = ritualsData ?? [];

  // Fellows "How About" plans removed (1:1 social layer gone). Kept as an empty
  // list so the timeline builder below simply weaves in nothing.
  const fellowPlans: FellowPlanEvent[] = [];

  // Prayer-list streak (consecutive days finishing a full slideshow) — used
  // by the Today-empty fallback card to reward the habit.
  const { data: prayerStreakData } = useQuery<{ streak: number; lastPrayedDate: string | null; loggedToday?: boolean; gardenPrayedTodayCount?: number }>({
    queryKey: ["/api/prayer-streak"],
    queryFn: () => apiRequest("GET", "/api/prayer-streak"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const prayerStreak = prayerStreakData?.streak ?? 0;
  const gardenPrayedTodayCount = prayerStreakData?.gardenPrayedTodayCount ?? 0;
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
  // (Reciprocity gate removed — anyone in a community sees their
  // group's prayer requests, regardless of whether they've shared
  // one of their own. Prayer for others is a virtue without
  // precondition; the gate was preventing new joiners from seeing
  // active prayers in groups they'd just joined.)

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
    // Reciprocity gate dropped per user direction — anyone in a
    // community sees their group's prayer requests on the home
    // screen, regardless of whether they've shared one of their own.
    // The "you have to share to see others'" rule was making the
    // home read as empty for new joiners whose group already had
    // active prayers; they couldn't tell whether the silence was
    // theirs or the system's.
    const othersRequests = (dashPrayerRequests ?? []).filter(
      r => !r.isAnswered && !r.isOwnRequest && !r.closedAt,
    ).length;
    return activeIntercessions + othersRequests;
  }, [momentsData, dashCircleIntentions, dashPrayerRequests]);

  // Count of open prayer requests from others that the viewer has
  // never amened. Drives the "X new prayers" subtitle rotation and
  // the red dot on the View list pill. Uses myAmenedEver instead of
  // myAmenedToday so a request the user already engaged with stays
  // "not new" forever — otherwise every prayer reappears as "new"
  // each morning when myAmenedToday resets at midnight in the user's
  // tz, which is the bug they reported. Reciprocity gate dropped —
  // see pendingPrayerCount note above.
  const newPrayersCount = useMemo(() => {
    // ONLY prayer requests count toward the top "X prayer requests
    // waiting" card. Intercessions used to be mixed in here, but
    // they don't drop out of the count cleanly after the slideshow
    // (the moment_posts isCheckin isn't always reflected in
    // myLoggedToday on refetch) — so a user who prayed the
    // slideshow still saw "4 prayer requests waiting" with no way
    // to clear it. Intercessions live on the dashboard via their
    // own surface; the request count card is requests-only.
    return (dashPrayerRequests ?? []).filter(
      r => !r.isAnswered && !r.isOwnRequest && !r.closedAt && !r.myAmenedEver,
    ).length;
  }, [dashPrayerRequests]);

  // Faces stack for the "X prayer requests waiting" card. Lifted to
  // parent scope so we can render the card lower in the page (under
  // events, above the prayer-list carousel) without re-computing.
  type HomeFace = { key: string; name: string; avatarUrl: string | null };
  const homeFaces: HomeFace[] = useMemo(() => {
    const out: HomeFace[] = [];
    const seenSource = new Set<string>();
    const seenIdentity = new Set<string>();
    for (const r of dashPrayerRequests ?? []) {
      if (out.length >= 3) break;
      if (r.isAnswered || r.isOwnRequest || r.closedAt || r.isAnonymous) continue;
      if (r.myAmenedEver) continue;
      const key = `req-${r.ownerId ?? r.id}`;
      if (seenSource.has(key)) continue;
      const name = r.ownerName ?? "Someone";
      const avatarUrl = r.ownerAvatarUrl ?? null;
      const identity = `${name.trim().toLowerCase()}|${avatarUrl ?? ""}`;
      if (seenIdentity.has(identity)) continue;
      seenSource.add(key);
      seenIdentity.add(identity);
      out.push({ key, name, avatarUrl });
    }
    return out;
  }, [dashPrayerRequests]);

  // Active-request count for the viewer's own asks. Used by both the
  // ActiveRequestsCard composer and the "What you've shared" copy.
  const ownActiveCount = useMemo(() => {
    return (dashPrayerRequests ?? []).filter((r) => {
      if (!r.isOwnRequest) return false;
      if (r.isAnswered) return false;
      if (r.closedAt) return false;
      if (r.expiresAt && new Date(r.expiresAt) <= new Date()) return false;
      return true;
    }).length;
  }, [dashPrayerRequests]);

  // Sweep stale lock-screen "X is asking for your prayers" notifications
  // whenever the dashboard data settles. The amen flows already fire a
  // per-request `phoebe:clear-notifications` event the moment the user
  // prays on THIS device — but a user who prayed via a different device,
  // or a request the server marked amened after the original push, can
  // leave the banner orphaned on the lock screen. This effect catches
  // both: any request the server now reports as amenedEver gets a clear
  // dispatched. Native shell removes the matching delivered notification
  // (no-op if it's already gone, no-op on web).
  //
  // We use myAmenedEver, not myAmenedToday, because once a user has
  // prayed for a request (ever), the original "asking for your prayers"
  // ask has been answered — re-summoning it tomorrow as "still asking"
  // would be the same staleness bug.
  useEffect(() => {
    if (!dashPrayerRequests) return;
    for (const r of dashPrayerRequests) {
      if (!r.myAmenedEver) continue;
      try {
        window.dispatchEvent(
          new CustomEvent("phoebe:clear-notifications", {
            detail: { threadId: `prayer-request-${r.id}` },
          })
        );
      } catch { /* non-fatal */ }
    }
  }, [dashPrayerRequests]);

  // Sync the iOS app-icon badge to the live unprayed count whenever
  // the dashboard's data settles. Without this the badge could only
  // grow (via APNs pushes) and never shrink after the user prays —
  // see PhoebeBadgePlugin.swift for why the native layer hands the
  // count over to the web layer. No-op on web (setBadge guards on
  // Capacitor.isNativePlatform internally).
  //
  // Two trigger points:
  //  1. newPrayersCount changes (user prays, data invalidates, count drops).
  //  2. The tab becomes visible again (returning from a push, or
  //     foregrounding the iOS app). APNs may have set the badge while
  //     we were backgrounded; resync to our authoritative count so a
  //     stale push-driven badge doesn't outlive the next foreground.
  useEffect(() => {
    const native = (window as { PhoebeNative?: { setBadge?: (n: number) => Promise<void> } })
      .PhoebeNative;
    if (!native?.setBadge) return;
    const sync = () => {
      native.setBadge?.(newPrayersCount).catch(() => { /* non-fatal */ });
    };
    sync();
    const onVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", sync);
    };
  }, [newPrayersCount]);

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
    // No community → no home events (the schedule is sourced from your groups).
    if (!hasGroup) return { todayItems: [], tomorrowItems: [], weekItems: [], monthItems: [], totalCount: 0 };
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

    // "This week" closes on the upcoming Sunday inclusive. Today and
    // Tomorrow get their own sections; "This week" picks up everything
    // between Tomorrow+1 and the next Sunday's end-of-day. Anything
    // past Sunday — Mondays, Wednesdays, etc. on the *next* week —
    // falls into "Upcoming." (Earlier we had a rolling 7-day window
    // and even a Sun-to-Sun span; both put next-Wed in This week,
    // which read wrong.)
    const _now = new Date();
    const _todayDate = startOfDay(_now);
    const _todayMs = _todayDate.getTime();
    const _oneDayMs = 24 * 60 * 60 * 1000;
    const _dow = _todayDate.getDay(); // 0 = Sunday
    // If today IS Sunday, the "upcoming Sunday" is *next* Sunday so
    // today's items still go into Today, not into a then-empty This-
    // week bucket.
    const _daysToUpcomingSunday = _dow === 0 ? 7 : 7 - _dow;
    const _upcomingSundayMs = _todayMs + _daysToUpcomingSunday * _oneDayMs;
    // End-of-Sunday (start of Monday) is the boundary. Items strictly
    // before this land in This week; items at or after fall into
    // Upcoming.
    const thisWeekEndExclusiveMsTop = _upcomingSundayMs + _oneDayMs;
    const sevenDaysFromToday = new Date(thisWeekEndExclusiveMsTop);

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
      const isIntercession = m.templateType === "intercession";
      const isFasting = m.templateType === "fasting";

      // Intercessions never appear as individual cards on the home
      // dashboard — they live inside the prayer list (slideshow). The
      // PrayerListCard surfaces the aggregated count, so a tap moves
      // through them all together.
      //
      // This applies to feed-scoped intercessions too: climate users
      // see "Phoebe Climate" content via the drawer + /climate hub
      // (which lists every active feed intercession as a card) and via
      // the prayer-list slideshow on /prayer-mode. Surfacing them
      // again as individual dashboard cards was duplicating signal —
      // the same intercession would get counted in the Daily Prayer
      // List AND show as its own card.
      if (isIntercession) continue;

      const userDone = m.todayPostCount > 0;

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
    // The bucket is decided by which calendar date the writing window
    // falls on — evaluated in the viewer's local timezone via
    // differenceInCalendarDays so the math is timezone-correct without
    // any manual UTC fiddling:
    //   - Actionable now (unread / my turn / OPEN / OVERDUE) → Today
    //   - WAITING with window opening today (≤ 0 calendar days)→ Today
    //   - WAITING with window opening tomorrow (1 calendar day)→ Tomorrow
    //   - WAITING with window opening within 7 calendar days  → This week
    //   - WAITING with window opening later                    → This month
    //
    // A letter whose window opens later today is bucketed into Today
    // even though the API may still report turnState="WAITING" until
    // the exact sentAt+7d timestamp ticks past. Surfacing the card on
    // its open day is what users expect; LetterCard's status copy and
    // the writing gate handle the few intra-day hours where the API
    // is still WAITING.
    //
    // ── Letter card visibility ────────────────────────────────────────────
    // Two kinds of letter cards surface here:
    //
    //   • Read prompt — an inbound letter is unread. Stays visible until
    //     the user reads it, regardless of any window.
    //   • Write prompt — it's the user's turn to write next. For
    //     one-to-one dialogues this is restricted to a TIGHT 3-day window
    //     around the writing window opening: the day before it opens, the
    //     day it opens, and the day after. After that the card disappears
    //     even if the letter hasn't been written — reminder push
    //     notifications (see letterWindowSender) take over from there so
    //     the dashboard doesn't accumulate aging "you owe a letter" cards.
    //
    // Small-group correspondences keep the looser "any actionable state
    // → Today" rule because they don't have a single windowOpenDate to
    // bucket against.
    // ── Service schedules placement
    // Next occurrence today → Today. Tomorrow → Tomorrow. Else within
    // the current "Sunday week" (Sunday-aligned boundary computed at
    // the top of this useMemo) → This week. Else → Upcoming. Each
    // schedule is ONE card regardless of how many service times it
    // contains.
    const todayStart = _todayMs;
    const tomorrowStart = todayStart + _oneDayMs;
    const sevenDaysOutMs = thisWeekEndExclusiveMsTop;
    // Group schedules by dayOfWeek first. If a user is in multiple
    // communities that worship the same day (Sunday is the common
    // case), we render ONE consolidated card instead of one per
    // community — the dashboard had 3-4 near-identical worship
    // cards stacked on top of each other for multi-community users,
    // which read as noise.
    const schedulesByDow = new Map<number, ServiceSchedule[]>();
    for (const s of serviceSchedules) {
      if (!s.times.length) continue;
      const arr = schedulesByDow.get(s.dayOfWeek) ?? [];
      arr.push(s);
      schedulesByDow.set(s.dayOfWeek, arr);
    }
    for (const [dow, list] of schedulesByDow.entries()) {
      const next = nextOccurrenceDate(dow);
      const nextMs = next.getTime();
      // Sunday worship doesn't surface on the HOME until Thursday — i.e. only
      // within ~3 days of the service — so the upcoming Sunday doesn't sit on the
      // home all week (Sun–Wed). The dedicated EVENTS page always lists it, so
      // both day-gates below are home-only (skipped when eventsOnly).
      if (!eventsOnly && dow === 0 && nextMs - todayStart > 3 * 24 * 60 * 60 * 1000) continue;
      const isOnDate = nextMs === todayStart;
      // On Sunday itself, the HOME doesn't surface Sunday worship as a "today"
      // event (it leads with the rhythm/podcast instead). The Events page still
      // shows it. Services on other days are unaffected.
      if (!eventsOnly && dow === 0 && isOnDate) continue;
      const item: DashboardItem = list.length === 1
        ? { kind: "service", data: list[0]!, nextDate: next, isOnDate }
        : { kind: "services", schedules: list, nextDate: next, isOnDate };
      if (isOnDate) todayItems.push(item);
      else if (nextMs === tomorrowStart) tomorrowItems.push(item);
      else if (nextMs < sevenDaysOutMs) weekItems.push(item);
      else monthItems.push(item);
    }

    // Prayer feeds (Phoebe Climate, etc.) used to surface as their own
    // dashboard cards. Off the home screen now per user direction —
    // feed content reaches the user through the prayer-list slideshow
    // and the dedicated /climate hub. Surfacing it here was crowding
    // the home with a card that didn't drive engagement on its own.
    // (Deliberately NOT referenced here, and NOT a dependency of this memo:
    // subscribedFeeds is a fresh .filter() array every render, so listing it
    // as a dep re-ran this whole ~380-line bucketing + double sort on every
    // render for a value the body doesn't use.)

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
        // No computable next date — either the gathering is
        // unscheduled (no dayPreference, no planned meetup) OR it
        // was a one-time event that has already passed. We can
        // tell the difference by checking dayPreference: if it
        // exists and is in the past, the event already happened
        // and should disappear from the dashboard instead of
        // ending up in "Upcoming" with no date. Unscheduled
        // gatherings (no dayPreference) still park in monthItems
        // so the creator can finish setup from the card.
        const dp = (r as { dayPreference?: string | null }).dayPreference;
        if (dp) {
          let anchor: Date | null = null;
          try { anchor = parseISO(dp); } catch { /* ignore */ }
          if (anchor && Number.isFinite(anchor.getTime()) && anchor.getTime() < _now.getTime()) {
            continue;
          }
        }
        monthItems.push(item);
        continue;
      }
      // Skip past events entirely — one-time gatherings that have
      // already happened should not appear on the dashboard.
      const nextMs = startOfDay(next).getTime();
      if (nextMs < _todayMs) continue;
      if (nextMs === todayStart) todayItems.push(item);
      else if (nextMs === tomorrowStart) tomorrowItems.push(item);
      else if (nextMs < sevenDaysOutMs) weekItems.push(item);
      else monthItems.push(item);
    }

    // ── Fellow plans placement
    // A dated plan becomes a real timeline event — sitting in Today / This
    // week alongside gatherings and services — for the host AND every fellow
    // the feed returns it to. Shown on BOTH home and the Events page; the
    // Events page also keeps a "Share a plan" composer above the schedule,
    // but the plan itself lives in the calendar, not a separate list.
    for (const p of fellowPlans) {
      if (!p.startsAt) continue; // undated plans show only in the composer surface
      // Own plans are kept too — they fill the "events when the prayer list is
      // done" home slot (and the Events page), so an upcoming plan you made still
      // shows up rather than leaving the spot empty.
      let eventDate: Date | null = null;
      try { eventDate = parseISO(p.startsAt); } catch { /* ignore */ }
      if (!eventDate || !Number.isFinite(eventDate.getTime())) continue;
      const item: DashboardItem = { kind: "plan", data: p, nextDate: eventDate };
      const nextMs = startOfDay(eventDate).getTime();
      if (nextMs < _todayMs) continue;
      if (nextMs === todayStart) todayItems.push(item);
      else if (nextMs === tomorrowStart) tomorrowItems.push(item);
      else if (nextMs < sevenDaysOutMs) weekItems.push(item);
      else monthItems.push(item);
    }

    // Chronological sort for Upcoming / This month so cards line up by next
    // occurrence including time of day — a 9am practice lands before the same
    // day's 6:30pm gathering, and a Sunday service drops to last when its
    // date is later in the week.
    const itemSortMs = (item: DashboardItem): number => {
      if (item.kind === "service" && item.nextDate) {
        const base = startOfDay(item.nextDate).getTime();
        // Optional-chain `times` too: a malformed schedule row (no times array)
        // would otherwise throw inside this comparator, and since it runs in the
        // home useMemo the throw blanks the whole home via the error boundary.
        const hhmm = item.data.times?.[0]?.time;
        if (hhmm) {
          const [hStr, mStr] = hhmm.split(":");
          const h = parseInt(hStr, 10);
          const m = parseInt(mStr, 10);
          if (Number.isFinite(h) && Number.isFinite(m)) {
            return base + (h * 60 + m) * 60 * 1000;
          }
        }
        return base;
      }
      if (item.kind === "gathering") {
        const d = computeNextGatheringDate(item.data);
        return d ? d.getTime() : Number.POSITIVE_INFINITY;
      }
      if (item.kind === "plan") {
        return item.nextDate ? item.nextDate.getTime() : Number.POSITIVE_INFINITY;
      }
      if (item.kind === "moment") {
        const daysAhead = nextWindowDaysAhead(item.data);
        const base = addDays(startOfDay(new Date()), daysAhead).getTime();
        // 9am anchor so morning practices sort before same-day evening
        // gatherings.
        return base + 9 * 60 * 60 * 1000;
      }
      return Number.POSITIVE_INFINITY;
    };
    weekItems.sort((a, b) => itemSortMs(a) - itemSortMs(b));
    monthItems.sort((a, b) => itemSortMs(a) - itemSortMs(b));

    return { todayItems, tomorrowItems, weekItems, monthItems, totalCount };
  }, [momentsData, user, serviceSchedules, rituals, fellowPlans, isBeta, eventsOnly, hasGroup]);

  useEffect(() => {
    // PUBLIC no-login version: guests LIVE here — no bounce to the welcome
    // chooser (which would loop, since it forwards guests to /dashboard).
    if (!authLoading && !user && !PHOEBE_GUEST_ENABLED) setLocation("/");
    // A guest who lands here directly (deep link / restored session), without
    // passing the "/" chooser that normally seeds, still gets the precoded
    // rule — seedGuestRule is a no-op when the device already has one. The
    // ANONYMOUS DEVICE USER counts as a guest: it holds a session cookie, but
    // its rhythm lives on the device.
    if (!authLoading && PHOEBE_GUEST_ENABLED && (!user || user.isAnonymous)) seedGuestRule();
    // New users land on a coherent GIVEN rhythm (Morning Devotion · Forward Day
    // by Day · Evening Devotion) — not a config screen. Onboarding is just the
    // intro + push + photo, then home; they grow into Customize later. LIGHT
    // sessions never take that tour: the public lands STRAIGHT on the seeded
    // home, and the anonymous device user is created without the flag — so
    // without this guard every fresh device would bounce into the account
    // onboarding.
    if (!authLoading && user && !user.onboardingCompleted && !isGuestShape) setLocation("/onboarding");
  }, [user, authLoading, isGuestShape, setLocation]);

  // PUBLIC no-login version (slice 2): with the flag on, a signed-out GUEST
  // renders the home on device-local state — the rhythm cards + prefs are
  // already local-first, and every account surface below (prayer list, faces,
  // events, letters) is gated on `user` / its `enabled: !!user` query.
  // On a genuine first launch of the guest build, render the seeded home
  // immediately instead of blanking through the /api/auth/me round-trip (the
  // visitor can have no session yet, so they're a device-local guest).
  if ((authLoading && !(PHOEBE_GUEST_ENABLED && isFirstOpen())) || (!user && !PHOEBE_GUEST_ENABLED)) return null;

  const userEmail = user?.email ?? "";
  const userName = user?.name ?? "";

  return (
    <Layout bgPhoto={homeBgPhoto} blueShade={homeTheme === "water"}>
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
          The daily "N prayers waiting for you" popup was removed —
          the always-visible PrayerListCard already invites the user. */}

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

      {/* Negative margin cancels most of the Layout <main>'s pb-12 (3rem) so the
          page ends ~20px under the footer instead of a tall empty gap — without
          shrinking every other page's bottom padding. */}
      <div className="dash-shell flex flex-col w-full" style={{ marginBottom: "calc(1.25rem - 3rem)" }}>

        {/* ── Header ── */}
        {/* Calendar date rendered on every surface (was gated to
            non-native; the iOS status bar shows the system clock but
            not the day-of-week, so we want the in-app date visible
            there too). Half the top spacing so "Next" sits higher. */}
        <div className="mb-2" style={{ paddingTop: 2 }}>
          {/* The liturgical day leads the home: calendar date with the feast /
              season beneath (LiturgicalDateHeader's full mode — restored per
              request). The Events surface keeps its own title instead. */}
          {!eventsOnly && (
            <div className="mb-2">
              <LiturgicalDateHeader />
            </div>
          )}
          {/* PUBLIC first-open welcome — a dismissible "begin here" note under
              the date: names the given rhythm and promises the daily
              walk-through. Guests only. */}
          {!eventsOnly && isGuestShape && <GuestWelcomeCard />}
          {/* BETA — the one-time "your community keeps a rule of life" offer:
              new accounts that registered through an invite never saw the
              join-time offer, so the home makes it once (Not now dismisses). */}
          {!eventsOnly && isBeta && <CommunityRuleOfferBeta />}
          {eventsOnly && (
            <p
              className="mb-1"
              style={{
                color: "#F0EDE6",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            >
              {t("dashboard.events_title", { defaultValue: "Events" })}
            </p>
          )}

          {/* Fellows "Plans (How About)" removed — the 1:1 social layer is gone. */}

          {/* Today's Rhythm card moved off the home top: it now lives on the
              slideshow closing slide and on the /daily-progress page (reached
              via the "Daily progress" header pill, whose four dots mirror it).
              The home screen stays focused on praying. */}

          {/* The Way of Love daily/weekly progress strip was removed from the
              home top — that progress now lives in the Way of Love drawer
              (the header pill). */}

          {/* Menu pill strip removed — nav lives in the side Menu. */}

          {/* Home-screen anchors — replaced the single Daily Prayer
              List card per user direction. Two cards now share the
              top spot:
                1. NewPrayerRequestsCard (only when count > 0) — a
                   notification-style "X new prayer requests" tap-
                   target. Routes to the slideshow filtered to just
                   un-amened requests so the user can respond and
                   clear the queue.
                2. PrayerOfficeCard — always visible. Surfaces the
                   liturgy that fits the current time of day
                   (Morning Prayer before noon, Evening Prayer
                   after) with the Devotion as a quieter alternate.
                   Replaces the slideshow-as-daily-ritual model
                   that wasn't working — the daily rhythm is now
                   "respond to your community + pray the office,"
                   not "walk through the slideshow every day." */}
          {/* Beta home: the cards become the daily-progress view — the four
              anchors split into Next / Done plus the streak — in place of the
              standard home modules. */}
          {filter === null && (newHomeForEveryone || isBeta) && !eventsOnly && (
            <div className="mt-0 mb-3">
              {allHabitsDone ? (() => {
                // Day's rhythm is complete — hand the home over to the upcoming
                // schedule. The full Next/Done cards still live on /daily-progress.
                const noEvents = todayItems.length === 0 && tomorrowItems.length === 0 && weekItems.length === 0 && monthItems.length === 0;
                // When you've prayed everyone else's request today, the prayer-list
                // slot BELOW renders the FULL upcoming schedule — so this block must
                // NOT also present events (neither the "Next up" teaser nor a
                // "here's what's coming up" header), or the home shows the schedule
                // twice. We only tease events here while there are still others to
                // pray for (the schedule then sits above the prayer carousel).
                const hasUnprayedOthers = (dashPrayerRequests ?? []).some((r) => !r.isOwnRequest && !r.isAnswered && !r.closedAt && typeof r.body === "string" && r.body.length > 0 && !(r.expiresAt && new Date(r.expiresAt) <= new Date()) && !r.myAmenedToday);
                // The "day is kept" header shows whether or not there are events —
                // it's the blessing on a finished rhythm, not an events label.
                const keptHeader = (
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "rgba(143,175,150,0.55)", fontFamily: "'Space Grotesk', sans-serif" }}>
                      🌿 {t("dashboard.day_kept_eyebrow", { defaultValue: "The day is kept" })}
                    </p>
                    <p className="text-[15px]" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {(noEvents || !hasUnprayedOthers)
                        ? t("dashboard.day_kept_rest_line", { defaultValue: "Rest in it — or sit a while longer." })
                        : t("dashboard.day_kept_events_line", { defaultValue: "Here's what's coming up." })}
                    </p>
                  </div>
                );
                // Nothing coming up → the finished-day view is just the blessing
                // + the day's kept cards (below).
                if (noEvents) {
                  return (
                    <div>
                      <CascadeHapticTrigger cascadeFrom={1} count={1} splashCleared={ownReqSplashCleared} />
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={ownReqSplashCleared ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0 }}>{keptHeader}</motion.div>
                      {/* All cards done, nothing on the calendar → the "Sit again"
                          contemplation card stands on its own, cascading in like
                          the rest of the home (splash-gated + a haptic tick). */}
                      {/* Keep the day's rhythm on the home even when complete —
                          the Next list empties and the Done section holds every
                          kept card (owner). */}
                      <DailyProgressBody showStreak={false} showDone={true} maxUpcoming={7} leadCard={null} renderOfficeHero={(side) => <PrayerOfficeCard forceSide={side} />} />
                      {/* The WEEKLY rhythm stays visible on a kept day — resting
                          in a finished day is exactly when you'd log Bless or
                          Rest. (It self-hides when no weekly practice is on.)
                          Sits ABOVE the Learn band (owner). */}
                      {/* No outer block-fade wrapper — WeeklyRhythm runs its
                          OWN splash-gated per-card cascade; wrapping it would
                          multiply opacities and mask the stagger into one fade.
                          Base delay continues after keptHeader (0) +
                          contemplationAgain (0.1) above. */}
                      <WeeklyRhythm cascadeBaseDelay={0.3} />
                      {/* An in-flight course stays reachable after the day's
                          rhythm is done — the Learn band renders on the
                          finished-day view too, UNDER the weekly practices. */}
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={ownReqSplashCleared ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}><HomeLearnSection /></motion.div>
                    </div>
                  );
                }
                const evtProps = {
                  userEmail, userName,
                  onOpenService: (schedule: ServiceSchedule, nextDate: Date) => setOpenService({ schedule, nextDate }),
                  onOpenConsolidatedServices: (schedules: ServiceSchedule[], nextDate: Date) => setOpenConsolidatedServices({ schedules, nextDate }),
                  onOpenGathering: (r: any) => setOpenGathering(r),
                };
                // Staggered fade-up — each card rises just after the one above,
                // matching the Daily progress page's cascade.
                const enterUp = (i: number) => ({
                  initial: { opacity: 0, y: 10 },
                  // Gate on the splash like the rest of the home cards, so these
                  // cascade in AFTER the opening splash clears (not behind it),
                  // matching the carousel/events stagger + step.
                  animate: ownReqSplashCleared ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
                  transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const, delay: Math.min(i * 0.1, 1.5) },
                });
                // The next THREE events, flattened across the day buckets (already
                // chronological today→month) into a single "Next up" section.
                const isEvt = (it: DashboardItem) => it.kind === "gathering" || it.kind === "service" || it.kind === "services" || it.kind === "plan";
                // Dedup: only tease events here while there are still others to pray
                // for; once prayer is done the prayer-list slot below shows the full
                // schedule, so listing events here too would double them.
                const allEvents = [...todayItems, ...tomorrowItems, ...weekItems, ...monthItems].filter(isEvt);
                const nextThree = hasUnprayedOthers ? allEvents.slice(0, 3) : [];
                // Fewer than three events to look forward to → round out the
                // finished-day view with the "sit again" contemplation card.
                const showSitAgain = allEvents.length < 3;
                void nextThree; void showSitAgain; void evtProps;
                return (
                  <div>
                    <CascadeHapticTrigger cascadeFrom={1} count={1} splashCleared={ownReqSplashCleared} />
                    <motion.div {...enterUp(0)}>{keptHeader}</motion.div>
                    {/* Events live UNDER the prayer requests now (below), not here. */}
                    {/* Keep the completed cards on the home — Done section. */}
                    <DailyProgressBody showStreak={false} showDone={true} maxUpcoming={7} leadCard={null} renderOfficeHero={(side) => <PrayerOfficeCard forceSide={side} />} />
                    {/* Weekly rhythm stays on the kept view, above Learn (see
                        the no-events branch note). */}
                    {/* Bare — WeeklyRhythm owns its per-card cascade (see the
                        no-events branch note); an outer fade would mask it.
                        Continues after keptHeader (0) + contemplationAgain (0.1). */}
                    <WeeklyRhythm cascadeBaseDelay={0.3} />
                    {/* Same finished-day Learn band as the no-events branch,
                        under the weekly practices. */}
                    <motion.div {...enterUp(3)}><HomeLearnSection /></motion.div>
                  </div>
                );
              })() : (
                <>
                {/* A "prayer requests waiting" card leads when there's something
                   to respond to; then the office hero (the same full
                   PrayerOfficeCard all users get) leads the Next list, above
                   Contemplation. */}
                <DailyProgressBody
                  showStreak={false}
                  /* Show the Done section on the home too — the rhythm reads as
                     Next + Done, per product direction. */
                  showDone={true}
                  /* Cap the Next list at 7 cards on the home; the rest live on
                     /daily-progress. */
                  maxUpcoming={7}
                  /* The "N prayer requests waiting" lead card was removed — new
                     requests now announce themselves with a glowing border in
                     the prayer list below instead of a separate top card. */
                  leadCard={null}
                  renderOfficeHero={(side) => <PrayerOfficeCard forceSide={side} />}
                />
                {/* The in-rhythm "Coming up" event teaser was removed — events
                    always sit UNDER the prayer requests (below). */}
                {/* The Way of Love WEEKLY rhythm (Commune · Go · Bless · Rest) —
                    private self-logs, a separate band below the daily spine.
                    Self-hides until the customizer's weekly step enables one.
                    Sits ABOVE the Learn band (owner). cascadeBaseDelay lands it
                    just AFTER the Next→Done cascade above (which caps at 0.7s),
                    so it reads as one continuous home cascade. */}
                <WeeklyRhythm cascadeBaseDelay={0.7} />
                {/* Learn — continue (or start) a course, UNDER the weekly
                    practices: next episode + play + progress. Video courses are
                    web-only; the iOS shell shows only the Way of Love (audio).
                    See HomeLearnSection. */}
                <HomeLearnSection />
                </>
              )}
            </div>
          )}
          {filter === null && !newHomeForEveryone && !isBeta && !betaLoading && !eventsOnly && (() => {
            // Render the home modules in the user's chosen order, skipping
            // hidden ones. Each module returns its content (or null when it
            // has nothing to show); the first non-null gets mt-5, the rest
            // mt-3, so spacing stays even regardless of what's on.
            const renderModule = (key: HomeModule): React.ReactNode => {
              if (homeHidden.has(key)) return null;
              switch (key) {
                case "requests":
                  // The "X new prayer requests" notification card was removed —
                  // new requests glow their border in the prayer list instead.
                  return null;
                case "office":
                  // Hero when it's the "what's next" office (with the forced
                  // side); compact one-liner when something else leads.
                  return <PrayerOfficeCard compact={!officeIsHero} forceSide={officeIsHero ? heroOfficeSide : undefined} />;
                case "feeds": {
                  if (subscribedFeeds.length === 0) return null;
                  // Feed hero only when feeds is the primary anchor AND a
                  // home feed is pinned; otherwise every feed is a card.
                  if (primaryAnchor === "feeds" && featuredFeed) {
                    return (
                      <div className="flex flex-col gap-3">
                        <FeedHeroCard feed={featuredFeed} />
                        {secondaryFeeds.map((row) => (
                          <FeedPrayerCard key={row.feed.id} feed={row} />
                        ))}
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col gap-3">
                      {subscribedFeeds.map((row) => (
                        <FeedPrayerCard key={row.feed.id} feed={row} />
                      ))}
                    </div>
                  );
                }
                case "contemplation":
                  return <ContemplationHomeCard />;
                // Listening is surfaced through the rhythm cards (daily-progress),
                // not as a separate classic-home feed card — like cac/fdd when
                // they're not the reflection hero.
                case "listening":
                  return null;
                case "prayer-list":
                  // Prayer list removed from the home screen (owner) — reachable
                  // from the side menu / deep links instead.
                  return null;
                case "examen":
                  return <ExamenHomeCard />;
                case "guided-prayer":
                  return <GuidedPrayerHomeCard />;
                case "cac":
                  return reflectionIsHero("cac") ? <CacHomeCard /> : null;
                case "fdd":
                  // When FDD is ALSO a side's prayer, the office slot already
                  // renders the FDD card — suppress the reflection one to avoid
                  // a duplicate (matters when a pinned feed disables dynamicHero).
                  if (getSideLevel("morning") === "fdd" || getSideLevel("evening") === "fdd") return null;
                  return reflectionIsHero("fdd") ? <FddHomeCard /> : null;
                case "ssje":
                  return reflectionIsHero("ssje") ? <SsjeHomeCard /> : null;
                case "ncmp":
                  // Self-hides on weekends + outside the broadcast
                  // window; returns null in those cases so the
                  // filter below drops the slot from the layout.
                  return <NcmpHomeCard />;
                case "podcasts": {
                  // One card per show added to home; self-hides when none.
                  if (followedShows.length === 0) return null;
                  return (
                    <div className="flex flex-col gap-3">
                      {followedShows.map((s) => (
                        <PodcastHomeCard key={s.slug} show={s} />
                      ))}
                    </div>
                  );
                }
                default:
                  return null;
              }
            };
            // Lead with the dynamic hero module (right after "requests").
            const displayOrder: HomeModule[] = (!dynamicHero || !heroKey)
              ? homeOrder
              : (() => {
                  const rest = homeOrder.filter((k) => k !== heroKey && k !== "requests");
                  return homeOrder.includes("requests")
                    ? (["requests", heroKey, ...rest] as HomeModule[])
                    : ([heroKey, ...rest] as HomeModule[]);
                })();
            const rendered = displayOrder
              .map((k) => ({ k, node: renderModule(k) }))
              .filter((m) => m.node != null);
            // All kept → a community summary leads; the office card still
            // renders below (compact) so the user can pray again, but the
            // read reflection stays hidden.
            const summaryFirst = dynamicHero && homeHero?.kind === "summary";
            return (
              <>
                {summaryFirst && (
                  <div className="mt-5">
                    <HomeDoneSummaryCard />
                  </div>
                )}
                {rendered.map((m, i) => (
                  <div key={m.k} className={(i === 0 && !summaryFirst) ? "mt-5" : "mt-3"}>
                    {m.node}
                  </div>
                ))}
              </>
            );
          })()}

          {/* Prayer pills removed per product direction — the
              dedicated /my-prayer-requests, /prayers-for-me, and
              /prayer-list surfaces are now reachable from the side
              menu (or via deep links). The home dashboard reads
              cleaner without the secondary pill row sitting between
              the prayer-list card and the request entry input. */}

        </div>

        {/* ── Loading skeleton ── only where the main content area is the
            point (a category filter or the Events page). On the default home
            the daily cards + prayer list handle their own loading, so these
            placeholders just flashed empty cards on every load. */}
        {isLoading && (filter !== null || eventsOnly) && (
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

          // "Coming up" — surfaced ONLY once the whole daily routine is done, so
          // the day's practices lead uninterrupted until then. When every anchor
          // is kept, the single soonest upcoming event (any day) appears in a
          // section between Next and the Prayer List. Hidden whenever any practice
          // remains, or there's no event on the calendar (the buckets are already
          // today→month chronological, so the first event-kind item is soonest).
          const isEventItem = (it: DashboardItem) =>
            it.kind === "gathering" || it.kind === "service" || it.kind === "services" || it.kind === "plan";
          const nextEventItem: DashboardItem | null = allHabitsDone
            ? ([todayItems, tomorrowItems, weekItems, monthItems].map((b) => b.find(isEventItem)).find(Boolean) ?? null)
            : null;

          // The "day is kept" view above already lists the upcoming schedule
          // (Today → Upcoming), so the separate "Coming up" section was removed to
          // avoid showing the same event twice. No bucket dedup needed.
          void nextEventItem;
          const keep = (item: DashboardItem) => byFilter(item);
          const fToday = todayItems.filter(keep);
          const fTomorrow = tomorrowItems.filter(keep);
          const fWeek = weekItems.filter(keep);
          const fMonth = monthItems.filter(keep);
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
                {/* Heart to Heart (one-to-one prayer partners) is hidden for
                    now — the PartnerExchange home card was removed. */}

                {/* Prayer List removed from the home screen (owner) — the
                    requests carousel + "New prayer request" compose no longer
                    lead the home. Still reachable via the side menu / deep
                    links (/prayer-list, /my-prayer-requests, /intentions). */}

                {/* Your prayer requests — the viewer's OWN open requests, with an
                    overlapped stack of the people who've prayed for them lately on
                    the right, plus the "New prayer request" CTA. The header + cards
                    only show when you HAVE an open request; the CTA always shows so
                    you can always start one. Signed-in only, and never in guest
                    SHAPE: the public home carries no prayer-request composer
                    and no community events. */}
                {filter === null && !eventsOnly && !!user && !isGuestShape && (() => {
                  // Events on the home — ONE "Events" section, no time sub-headers
                  // (owner). All upcoming events across today→month, already in
                  // chronological order (the buckets are date-sorted), rendered
                  // under a single "Events" header. Cascades in right after the
                  // rhythm cards (the prayer list that used to sit between them is
                  // gone).
                  const allEvents = [...fToday, ...fTomorrow, ...fWeek, ...fMonth].filter(isEventItem);
                  if (allEvents.length === 0) return null;
                  const evBase = Math.max(0, rhythm.totalAnchors - rhythm.doneCount) + 1;
                  return (
                    <div style={{ marginTop: 20 }}>
                      <TimeSection
                        label={t("dashboard.events_title", { defaultValue: "Events" })}
                        items={allEvents}
                        userEmail={userEmail}
                        userName={userName}
                        onOpenService={(schedule, nextDate) => setOpenService({ schedule, nextDate })}
                        onOpenConsolidatedServices={(schedules, nextDate) => setOpenConsolidatedServices({ schedules, nextDate })}
                        onOpenGathering={(r) => setOpenGathering(r)}
                        cascade
                        cascadeFrom={evBase}
                      />
                    </div>
                  );
                })()}

                {/* Events — the upcoming schedule. Off the default home now;
                    it lives on its own /events page (Menu → Events). Shown when
                    a category filter is active, or in events-only mode. */}
                {(filter !== null || eventsOnly) && (<>
                {/* 1. Today. The daily-prayer anchor card now lives
                    under the feast line up top, so the Today section
                    no longer carries a trailing PrayerListCard — it's
                    just the day's practice/gathering items. */}
                <TimeSection
                  label={t("dashboard.today_section")}
                  items={fToday}
                  userEmail={userEmail}
                  userName={userName}
                  onOpenService={(schedule, nextDate) => setOpenService({ schedule, nextDate })}
                  onOpenConsolidatedServices={(schedules, nextDate) => setOpenConsolidatedServices({ schedules, nextDate })}
                  onOpenGathering={(r) => setOpenGathering(r)}
                />

                {/* 2. Tomorrow. Practice items actionable tomorrow.
                    No longer carries a trailing PrayerListCard — the
                    persistent daily-prayer anchor card at the top of
                    the page covers that. Other card kinds (fasting,
                    practices, etc.) still land here. Empty sections
                    stay hidden. */}
                <TimeSection
                  label={t("dashboard.tomorrow_section")}
                  items={fTomorrow}
                  userEmail={userEmail}
                  userName={userName}
                  onOpenService={(schedule, nextDate) => setOpenService({ schedule, nextDate })}
                  onOpenConsolidatedServices={(schedules, nextDate) => setOpenConsolidatedServices({ schedules, nextDate })}
                  onOpenGathering={(r) => setOpenGathering(r)}
                />

                {/* 3. This week — events from after Tomorrow through
                    end-of-day on the upcoming Sunday. Items past
                    Sunday fall into Upcoming. */}
                <TimeSection label={t("dashboard.this_week_section")} items={fWeek} userEmail={userEmail} userName={userName} onOpenService={(schedule, nextDate) => setOpenService({ schedule, nextDate })} onOpenConsolidatedServices={(schedules, nextDate) => setOpenConsolidatedServices({ schedules, nextDate })} onOpenGathering={(r) => setOpenGathering(r)} />

                {/* 4. Upcoming — everything past the upcoming Sunday. */}
                <TimeSection label={t("dashboard.upcoming_section")} items={fMonth} userEmail={userEmail} userName={userName} onOpenService={(schedule, nextDate) => setOpenService({ schedule, nextDate })} onOpenConsolidatedServices={(schedules, nextDate) => setOpenConsolidatedServices({ schedules, nextDate })} onOpenGathering={(r) => setOpenGathering(r)} />
                </>)}

                {/* Events-only empty state — nothing on the calendar. */}
                {eventsOnly && fToday.length === 0 && fTomorrow.length === 0 && fWeek.length === 0 && fMonth.length === 0 && (
                  <div className="py-16 text-center">
                    <p className="text-4xl mb-3">📅</p>
                    <p className="text-sm" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {t("dashboard.events_empty", { defaultValue: "Nothing on the calendar right now." })}
                    </p>
                  </div>
                )}

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

                {/* Unfiltered empty state — only fires when the user is
                    *truly* empty: no practices, no gatherings, no
                    prayers in their slideshow, no community
                    membership. If any of those is true the page
                    already has a meaningful surface above (the Daily
                    Prayer List card, the community pills, etc.) so a
                    "nothing here" card below them is misleading.
                    A user who's in a community whose members have
                    posted requests was previously seeing this card
                    saying "Start a practice" even though Jeremy's
                    requests were sitting in their slideshow — wrong
                    signal. The "Join a community" path stays for
                    genuinely brand-new users with no context. */}
                {/* The old "Join a community to get started" empty-state was
                    removed per request — we don't push community on a solo user
                    who isn't in one. A fresh user already has their daily rhythm
                    (Morning/Evening + reflection + silence), so there's no truly
                    empty state to fill, and community surfaces stay opt-in. */}
              </motion.div>
            </AnimatePresence>
          );
        })()}

        {/* Prayer Requests bottom section removed — the quick-entry
            input sits under the Daily Prayer List card up top, and
            that card's line-2 subtitle rotates "X new prayers" so
            the user gets a nudge about un-engaged requests without
            needing a second list down here. The dedicated
            /my-prayer-requests, /prayers-for-me, and /prayer-list
            pages remain reachable from the side menu and from the
            "View list" pill on the Daily Prayer List card. */}

        {/* Podcasts rail removed from the home per product direction — shows
            still live at /podcasts and in the side menu. */}

        {/* News is intentionally NOT on the home screen — it lives in the
            side menu (Audio → News & Actions, beta) and at /news. It was
            briefly shown here as a rail; removed per product direction. */}

        {/* Customize pill removed from the home surface per product direction —
            the daily-prayer-habit customizer (/rule-of-life) is still reachable
            from the side menu and the per-office Customize entries. */}

        {/* Footer */}
        <p className="text-center text-xs mt-8 mb-0 tracking-wide" style={{ color: "rgba(143, 175, 150, 0.5)" }}>
          {t("dashboard.inspired_by")}
        </p>
        {/* A quiet "About" pill under the footer line — a small way into the
            About page, mirroring the sign-up screen's About pill. */}
        <div className="flex justify-center mt-3">
          <Link href="/about" className="text-[12px] rounded-full px-4 py-1.5 transition-opacity active:opacity-70" style={{ color: "rgba(143,175,150,0.8)", background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.22)", fontFamily: "'Space Grotesk', sans-serif" }}>
            {t("welcome_public.about_pill", { defaultValue: "About" })}
          </Link>
        </div>

        {/* The home "+" FAB moved into the global bottom nav bar (People · ＋ ·
            Menu) in Layout, so the create entry points now live there. */}
      </div>

      {/* New-prayer chooser (admins) — request for yourself vs. a community
          intercession. */}
      <AnimatePresence>
        {showNewPrayerChoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-5 pb-8 sm:pb-0"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
            onClick={() => setShowNewPrayerChoice(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-sm rounded-2xl p-5"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(143,175,150,0.6)", fontFamily: "'Space Grotesk', sans-serif" }}>
                {t("dashboard.new_prayer_choice_title", { defaultValue: "What would you like to add?" })}
              </p>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => { setShowNewPrayerChoice(false); setLocation("/pray-request/new?kind=request"); }}
                  className="text-left rounded-xl px-4 py-3.5 transition-opacity hover:opacity-90 active:scale-[0.99]"
                  style={{ ...FROST, border: "1px solid rgba(200,212,192,0.28)" }}
                >
                  <p className="text-[15px] font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>🙏🏽 {t("dashboard.choice_personal", { defaultValue: "Prayer request" })}</p>
                  <p className="text-[12.5px] mt-0.5" style={{ color: "#8FAF96" }}>{t("dashboard.choice_personal_sub", { defaultValue: "Ask your community to pray for you." })}</p>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewPrayerChoice(false); setLocation("/moment/new?template=intercession"); }}
                  className="text-left rounded-xl px-4 py-3.5 transition-opacity hover:opacity-90 active:scale-[0.99]"
                  style={{ ...FROST, border: "1px solid rgba(200,212,192,0.28)" }}
                >
                  <p className="text-[15px] font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>🕯️ {t("dashboard.choice_intercession", { defaultValue: "Community intercession" })}</p>
                  <p className="text-[12.5px] mt-0.5" style={{ color: "#8FAF96" }}>{t("dashboard.choice_intercession_sub", { defaultValue: "A prayer the whole community carries together." })}</p>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {openConsolidatedServices && (
        <ConsolidatedServiceDetailModal
          schedules={openConsolidatedServices.schedules}
          nextDate={openConsolidatedServices.nextDate}
          onClose={() => setOpenConsolidatedServices(null)}
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
