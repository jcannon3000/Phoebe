import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { InviteStep } from "@/components/InviteStep";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WindowPost {
  guestName: string | null;
  reflectionText: string | null;
  isCheckin: boolean;
  loggedAt: string | null;
}

interface TodayLog {
  name: string;
  email: string;
  avatarUrl: string | null;
  loggedAt: string | null;
  reflectionText: string | null;
  isCheckin: boolean;
}

interface MomentWindow {
  id: number;
  momentId: number;
  windowDate: string;
  status: string;
  postCount: number;
  closedAt: string | null;
  posts: WindowPost[];
}

interface MomentDetail {
  moment: {
    id: number;
    name: string;
    intention: string;
    frequency: string;
    scheduledTime: string;
    dayOfWeek?: string | null;
    windowMinutes: number;
    goalDays: number;
    currentStreak: number;
    longestStreak: number;
    totalBlooms: number;
    state: string;
    createdAt: string;
    momentToken: string;
    templateType: string | null;
    intercessionTopic: string | null;
    intercessionSource?: string | null;
    intercessionFullText?: string | null;
    timezone?: string | null;
    practiceDays?: string | string[] | null;
    timeOfDay?: string | null;
    contemplativeDurationMinutes?: number | null;
    fastingType?: string | null;
    fastingFrom?: string | null;
    fastingIntention?: string | null;
    fastingFrequency?: string | null;
    fastingDate?: string | null;
    fastingDay?: string | null;
    fastingDayOfMonth?: number | null;
    commitmentDuration?: number | null;
    commitmentEndDate?: string | null;
    commitmentSessionsGoal?: number | null;
    commitmentSessionsLogged?: number | null;
    commitmentGoalTier?: number | null;
    commitmentTendFreely?: boolean | null;
    frequencyDaysPerWeek?: number | null;
  };
  members: { name: string | null; email: string; joined?: boolean; avatarUrl?: string | null }[];
  memberCount: number;
  myStreak: number;
  groupStreak: number;
  groupBest: number;
  computedSessionsLogged: number;
  myUserToken: string | null;
  myPersonalTime: string | null;
  myPersonalTimezone: string | null;
  myGoogleCalendarEventId: string | null;
  windows: MomentWindow[];
  seedPosts: WindowPost[];
  todayPostCount: number;
  windowOpen: boolean;
  minutesLeft: number;
  todayLogs: TodayLog[];
  // 7-day version of todayLogs. `loggedAt` is the most recent post in
  // the last 7 calendar days, null if none.
  weekLogs?: Array<{ name: string; email: string; avatarUrl: string | null; loggedAt: string | null }>;
  isCreator: boolean;
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
  calendarEventMissing?: boolean;
  fastingWaterStats?: {
    my:    { week: number; month: number; allTime: number };
    group: { week: number; month: number; allTime: number };
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(scheduledTime: string): string {
  const [h, m] = scheduledTime.split(":").map(Number);
  return new Date(0, 0, 0, h, m).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const DAY_NAMES: Record<string, string> = {
  MO: "Monday", TU: "Tuesday", WE: "Wednesday", TH: "Thursday",
  FR: "Friday", SA: "Saturday", SU: "Sunday",
};

const DAY_DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const SPIRITUAL_TEMPLATE_IDS = new Set(["morning-prayer", "evening-prayer", "intercession", "contemplative", "fasting", "custom"]);

// ─── Progressive goal ladder ────────────────────────────────────────────────
const GOAL_LADDERS: Record<string, number[]> = {
  daily:  [7, 14, 30, 90],      // 7/week
  "3x":   [12, 18, 36, 72],     // 3x/week
  "2x":   [8, 12, 24, 48],      // 2x/week
  weekly: [4, 8, 12, 24],       // 1x/week
};

function getGoalLadder(frequency: string, daysPerWeek?: number | null): number[] {
  if (frequency === "daily") return GOAL_LADDERS.daily;
  if (daysPerWeek && daysPerWeek >= 3) return GOAL_LADDERS["3x"];
  if (daysPerWeek && daysPerWeek >= 2) return GOAL_LADDERS["2x"];
  return GOAL_LADDERS.weekly;
}

function getNextGoalInLadder(ladder: number[], currentGoal: number): number | null {
  const idx = ladder.indexOf(currentGoal);
  if (idx === -1) {
    // Find the next higher rung
    const next = ladder.find(g => g > currentGoal);
    return next ?? null;
  }
  return idx < ladder.length - 1 ? ladder[idx + 1] : null;
}

function goalLabel(sessions: number, frequency: string): string {
  if (frequency === "daily") return `${sessions} days`;
  return `${sessions} sessions`;
}

function nextGoalCard(nextGoal: number | null, frequency: string): { emoji: string; label: string; sub: string } | null {
  if (!nextGoal) return { emoji: "✨", label: "No end date", sub: "This is just what you do now" };
  if (nextGoal <= 14) return { emoji: "🌿", label: goalLabel(nextGoal, frequency), sub: "Keep the rhythm going" };
  if (nextGoal <= 30) return { emoji: "🌸", label: goalLabel(nextGoal, frequency), sub: "A real season together" };
  if (nextGoal <= 90) return { emoji: "🌳", label: goalLabel(nextGoal, frequency), sub: "Deep roots" };
  return { emoji: "✨", label: goalLabel(nextGoal, frequency), sub: "This is just what you do now" };
}

function parsePracticeDays(raw: string | string[] | null | undefined): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : null; } catch { return null; }
}

const TIME_OF_DAY_FALLBACK: Record<string, string> = {
  "early-morning": "early morning", "morning": "morning", "midday": "midday",
  "afternoon": "afternoon", "late-afternoon": "late afternoon", "evening": "evening", "night": "night",
};

function scheduleLabel(frequency: string, scheduledTime: string, dayOfWeek?: string | null, practiceDays?: string[] | null, timeOfDay?: string | null): string {
  // Old practices stored "00:00" — fall back to time-of-day label if available
  const timeStr = scheduledTime === "00:00" && timeOfDay
    ? TIME_OF_DAY_FALLBACK[timeOfDay] ?? formatTime(scheduledTime)
    : formatTime(scheduledTime);
  const prefix = scheduledTime === "00:00" && timeOfDay ? "" : "at ";
  if (frequency === "daily") return `Every day ${prefix}${timeStr}`;
  if (frequency === "weekly") {
    if (practiceDays && practiceDays.length > 1) {
      const names = practiceDays.map(d => DAY_NAMES[d]?.slice(0, 3) ?? d).join(", ");
      return `${names} ${prefix}${timeStr}`;
    }
    if (dayOfWeek) return `Every ${DAY_NAMES[dayOfWeek] ?? dayOfWeek} ${prefix}${timeStr}`;
    return `Weekly ${prefix}${timeStr}`;
  }
  return `Monthly ${prefix}${timeStr}`;
}

function goalProgress(createdAt: string, goalDays: number): number {
  const created = parseISO(createdAt);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(100, Math.round((daysSince / goalDays) * 100));
}

// Is it currently past the scheduled time today? (client-side, user's local clock)
function isPastScheduledTime(scheduledTime: string): boolean {
  const [h, m] = scheduledTime.split(":").map(Number);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}

// Is today a practice day for this moment?
function isTodayPracticeDay(frequency: string, dayOfWeek?: string | null, practiceDays?: string[] | null): boolean {
  if (frequency === "daily") return true;
  if (frequency === "weekly") {
    const todayDow = new Date().getDay();
    if (practiceDays && practiceDays.length > 0) {
      return practiceDays.some(d => DAY_DOW[d] === todayDow);
    }
    if (dayOfWeek) return DAY_DOW[dayOfWeek] === todayDow;
  }
  return true;
}

// Next practice description — shows actual bell time
function nextPracticeLabel(frequency: string, scheduledTime: string, dayOfWeek?: string | null, practiceDays?: string[] | null, timeOfDay?: string | null): string {
  const timeStr = scheduledTime === "00:00" && timeOfDay
    ? TIME_OF_DAY_FALLBACK[timeOfDay] ?? formatTime(scheduledTime)
    : formatTime(scheduledTime);
  const prefix = scheduledTime === "00:00" && timeOfDay ? "" : "at ";
  const today = new Date().getDay(); // 0=Sun
  const pastTime = isPastScheduledTime(scheduledTime);

  if (frequency === "daily") {
    return pastTime ? `Tomorrow ${prefix}${timeStr}` : `Today ${prefix}${timeStr}`;
  }

  if (frequency === "weekly") {
    const days = practiceDays && practiceDays.length > 0 ? practiceDays : (dayOfWeek ? [dayOfWeek] : []);
    if (days.length === 0) return `Next practice ${prefix}${timeStr}`;

    for (let i = 0; i <= 7; i++) {
      const checkDow = (today + i) % 7;
      const isDayMatch = days.some(d => DAY_DOW[d] === checkDow);
      if (isDayMatch) {
        if (i === 0 && !pastTime) return `Today ${prefix}${timeStr}`;
        if (i === 1 || (i === 0 && pastTime)) return `Tomorrow ${prefix}${timeStr}`;
        const name = Object.keys(DAY_DOW).find(k => DAY_DOW[k] === checkDow);
        return `${name ? DAY_NAMES[name] : "Next"} ${prefix}${timeStr}`;
      }
    }
  }
  return `Next practice ${prefix}${timeStr}`;
}

const STATUS_ICON: Record<string, string> = { bloom: "🌸", solo: "👤", wither: "🥀" };
const STATUS_LABEL: Record<string, string> = { bloom: "Bloomed", solo: "Solo", wither: "Withered" };
const STATUS_COLOR: Record<string, string> = { bloom: "text-[#5C7A5F]", solo: "text-amber-600", wither: "text-rose-400/80" };

// ─── Prayed-this-week ticker ─────────────────────────────────────────────
// Renders the row of "who's prayed this week" avatar pills. Measures the
// content width on mount / resize; only enables the marquee animation
// when the pills actually overflow the container. A short list that
// already fits just sits there statically — no motion, no duplicate
// copy needed for the seam.

function PrayedThisWeekRow({
  logs,
}: {
  logs: Array<{ email: string; name?: string | null; avatarUrl?: string | null }>;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const measure = () => {
      setOverflows(inner.scrollWidth > outer.clientWidth + 4);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [logs, overflows]);

  // Render the real list, and only when it overflows render a second
  // copy for the seamless marquee loop.
  const rendered = logs;

  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
    >
      <p className="text-[10px] font-semibold uppercase text-muted-foreground/70 mb-2" style={{ letterSpacing: "0.12em" }}>
        Prayed this week
      </p>
      <div
        ref={outerRef}
        className={`relative prayed-ticker ${overflows ? "overflow-x-auto no-scrollbar" : "overflow-hidden"}`}
        style={
          overflows
            ? {
                maskImage: "linear-gradient(to right, black 0%, black 88%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, black 0%, black 88%, transparent 100%)",
              }
            : undefined
        }
      >
        <div
          ref={innerRef}
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "nowrap",
            width: overflows ? "max-content" : undefined,
            paddingRight: overflows ? 40 : undefined,
          }}
        >
          {rendered.map((p, i) => (
            <div
              key={`${p.email}-${i}`}
              className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 shrink-0"
              style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.28)" }}
            >
              {p.avatarUrl ? (
                <img
                  src={p.avatarUrl}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold"
                  style={{ background: "rgba(168,197,160,0.2)", color: "#A8C5A0" }}
                >
                  {(p.name || p.email || "?").trim().charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-foreground whitespace-nowrap">
                {p.name || p.email.split("@")[0]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MomentDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const { isBeta } = useBetaStatus();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [seedText, setSeedText] = useState("");
  const [showSeedForm, setShowSeedForm] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invitePeople, setInvitePeople] = useState<{ name: string; email: string }[]>([]);
  // Confirmation for archiving a completed practice via the goal-hit CTA pill
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // Bell editing removed — shared time, editable via Settings > Edit practice
  const [editingPractice, setEditingPractice] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIntention, setEditIntention] = useState("");
  const [editGoalDays, setEditGoalDays] = useState(7);
  const [editScheduledTime, setEditScheduledTime] = useState("");
  const [editEmoji, setEditEmoji] = useState("");

  // Renew / extend-goal modal
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [renewCustom, setRenewCustom] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: [`/api/moments/${id}`],
    queryFn: () => apiRequest<MomentDetail>("GET", `/api/moments/${id}`),
    enabled: !!user && !!id,
    refetchInterval: 30_000,
  });


  const seedMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/moments/${id}/seed-post`, {
      reflectionText: seedText.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      setSeedText("");
      setShowSeedForm(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/moments/${id}/archive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      toast({
        title: "Practice archived 🌸",
        description: "It's tucked away. The history is preserved in your garden.",
      });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't archive",
        description: err.message || "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  const [deleteError, setDeleteError] = useState("");
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/moments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      setDeleteError(err.message || "Failed to delete. Try again.");
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (people: { name: string; email: string }[]) =>
      apiRequest("POST", `/api/moments/${id}/invite`, { people }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      setShowInvite(false);
      setInvitePeople([]);
    },
  });

  const restoreCalendarMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/moments/${id}/restore-calendar`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
    },
  });

  const [calRefreshed, setCalRefreshed] = useState(false);
  const refreshCalendarMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/moments/${id}/refresh-calendar`, {}),
    onSuccess: () => { setCalRefreshed(true); },
  });

  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const removeMemberMutation = useMutation({
    mutationFn: (email: string) =>
      apiRequest("DELETE", `/api/moments/${id}/members/${encodeURIComponent(email)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      setRemovingEmail(null);
    },
  });

  // Bell mutation removed — time is edited via the practice edit form

  const editMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/moments/${id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      setEditingPractice(false);
    },
  });

  // ─── Moment ↔ Group linking (intercessions only) ────────────────────────
  // Groups the moment is shared with. `primary` is the original creator
  // group (stored on sharedMoments.groupId); `additional` are extra groups
  // via the moment_groups junction. The creator can add any group they
  // admin, and can remove any secondary group they admin (primary is
  // never detachable here — archiving the moment is the right move).
  type MomentGroupsData = {
    primary: { id: number; name: string; slug: string; emoji: string | null } | null;
    additional: Array<{ id: number; name: string; slug: string; emoji: string | null }>;
  };
  const { data: momentGroupsData } = useQuery<MomentGroupsData>({
    queryKey: [`/api/moments/${id}/groups`],
    queryFn: () => apiRequest("GET", `/api/moments/${id}/groups`),
    // Always fetch (not just in the edit pane) so the read-only
    // intercession detail view can render every attached community as
    // its own chip. The user reported "there should now be two groups
    // in here" — the primary-only chip was ignoring moment_groups
    // rows entirely.
    enabled: !!user && !!id,
  });

  type MyGroup = { id: number; name: string; slug: string; emoji: string | null; myRole: string };
  const { data: myGroupsData } = useQuery<{ groups: MyGroup[] }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user && editingPractice,
  });

  const attachGroupMutation = useMutation({
    mutationFn: (groupId: number) =>
      apiRequest("POST", `/api/moments/${id}/groups`, { groupId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}/groups`] });
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
    },
    // Surface server errors (403 "must be admin", etc.) — earlier a
    // failed attach silently did nothing which is how the user ended
    // up with "I added a group and it didn't go through".
    onError: (err: any) => {
      let msg = err?.message || "Couldn't share with that community. Please try again.";
      try {
        const parsed = JSON.parse(msg);
        if (parsed && typeof parsed.error === "string") msg = parsed.error;
      } catch { /* not JSON */ }
      window.alert(msg);
    },
  });

  const detachGroupMutation = useMutation({
    mutationFn: (groupId: number) =>
      apiRequest("DELETE", `/api/moments/${id}/groups/${groupId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}/groups`] });
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
    },
    onError: (err: any) => {
      let msg = err?.message || "Couldn't remove that community. Please try again.";
      try {
        const parsed = JSON.parse(msg);
        if (parsed && typeof parsed.error === "string") msg = parsed.error;
      } catch { /* not JSON */ }
      window.alert(msg);
    },
  });

  const updateGoalMutation = useMutation({
    mutationFn: (payload: { commitmentSessionsGoal: number | null; commitmentTendFreely?: boolean }) =>
      apiRequest("PATCH", `/api/moments/${id}/goal`, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [`/api/moments/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/moments"] });
      // Clear, visible confirmation so the user knows the renew went through.
      if (variables.commitmentTendFreely) {
        toast({
          title: "Now ongoing ✨",
          description: "No end date — this is just what you do now.",
        });
      } else if (typeof variables.commitmentSessionsGoal === "number") {
        toast({
          title: "Renewed 🌱",
          description: `New goal set: ${variables.commitmentSessionsGoal} ${variables.commitmentSessionsGoal === 1 ? "session" : "sessions"}. Progress resets.`,
        });
      }
    },
    onError: (err: Error) => {
      toast({
        title: "Couldn't save",
        description: err.message || "The renew didn't go through. Try again.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  // Auto-open the renew modal if ?renew=1 is in the URL. The dashboard's
  // "Renew 🌿" CTA pill navigates here with that query param so the full
  // length-picker modal opens immediately. We strip the query afterwards
  // so refreshing the page doesn't keep re-opening the modal.
  useEffect(() => {
    if (typeof window === "undefined" || !data) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("renew") === "1") {
      const currentGoal = data.moment.commitmentSessionsGoal ?? 7;
      setRenewCustom(String(currentGoal));
      setRenewModalOpen(true);
      params.delete("renew");
      const next = params.toString();
      window.history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
    }
  }, [data]);

  // Silently sync calendar event titles for custom intercessions.
  // Runs once when the page loads so existing events get the correct intention title.
  useEffect(() => {
    if (!data) return;
    const { moment: m } = data;
    if (m.templateType === "intercession" && m.intercessionSource !== "bcp" && m.intention && id) {
      apiRequest("POST", `/api/moments/${id}/sync-calendar-title`, {}).catch(() => {/* best effort */});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.moment.id]);

  // Lectio Divina no longer has a practice detail page — the practice IS the
  // slideshow at /lectio/:momentToken/:userToken. Any stale link to
  // /moments/:id for a lectio practice redirects straight there.
  useEffect(() => {
    if (data?.moment.templateType === "lectio-divina" && data.moment.momentToken && data.myUserToken) {
      setLocation(`/lectio/${data.moment.momentToken}/${data.myUserToken}`, { replace: true });
    }
  }, [data, setLocation]);

  if (authLoading || !user) return null;

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-3 pt-4">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />)}
        </div>
      </Layout>
    );
  }

  if (!data) return null;
  // Short-circuit for lectio while the useEffect above does the redirect —
  // the generic streak/log/sessions logic below doesn't apply.
  if (data.moment.templateType === "lectio-divina") return null;

  const { moment, members, memberCount, myStreak, myUserToken, myPersonalTime, myPersonalTimezone, windows, seedPosts, todayPostCount, todayLogs, weekLogs, isCreator, group: momentGroup } = data;

  const parsedPracticeDays = parsePracticeDays(moment.practiceDays);
  const isIntercession = moment.templateType === "intercession";
  const isContemplative = moment.templateType === "contemplative";
  const isFasting = moment.templateType === "fasting";
  const isMorningPrayer =
    moment.templateType === "morning_prayer" ||
    moment.templateType === "morning-prayer";
  const isSpiritual = SPIRITUAL_TEMPLATE_IDS.has(moment.templateType ?? "");
  // Use the backend's computed windowOpen for all practices — it checks day-of-week + time window
  const isOpenNow = data.windowOpen;

  // Morning Prayer navigates to slideshow; intercession always accessible; others need window open
  const postUrl = myUserToken
    ? isMorningPrayer
      ? `/morning-prayer/${moment.id}/${myUserToken}`
      : (isIntercession || isOpenNow)
        ? `/moment/${moment.momentToken}/${myUserToken}`
        : null
    : null;

  // Label for action button — context-sensitive
  const actionLabel = isIntercession
    ? "Pray 🙏🏽"
    : isMorningPrayer
      ? "Open Office 📖"
      : "Log 🌿";

  // For custom intercessions, use the intention as the display title.
  // For BCP intercessions, show the topic/name as before.
  const isCustomIntercession = isIntercession && moment.intercessionSource !== "bcp";
  const intercessionDisplayTitle = isCustomIntercession
    ? (moment.intention || moment.intercessionTopic || moment.name)
    : (moment.intercessionTopic ?? moment.name);
  const displayTitle = isCustomIntercession ? intercessionDisplayTitle : moment.name;

  // For non-custom intercessions, still show "Praying for" subtitle if topic differs from name
  const showIntercessionSubtitle = isIntercession && !isCustomIntercession &&
    !!moment.intercessionTopic &&
    moment.intercessionTopic.toLowerCase() !== moment.name.toLowerCase();
  const intentionDisplay = isIntercession
    ? intercessionDisplayTitle
    : moment.intention;

  return (
    <Layout>
      <div className="pb-20 max-w-2xl mx-auto w-full overflow-x-clip">

        {/* Back */}
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mb-5 transition-colors"
        >
          ← Your practices
        </Link>

        {/* Calendar event removed banner — creator only */}
        {isCreator && data.calendarEventMissing && (
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-lg shrink-0">📅</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-800">Your calendar event was removed</p>
              <p className="text-xs text-amber-700/70 mt-0.5">Eleanor can restore it to your Google Calendar.</p>
            </div>
            <button
              onClick={() => restoreCalendarMutation.mutate()}
              disabled={restoreCalendarMutation.isPending}
              className="shrink-0 text-xs font-medium text-amber-800 border border-amber-300 rounded-full px-3 py-1.5 hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              {restoreCalendarMutation.isPending ? "Restoring…" : "Restore"}
            </button>
          </div>
        )}

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold text-foreground mb-1 min-w-0 break-words">{displayTitle}</h1>
            <button
              onClick={() => setShowInvite(true)}
              className="shrink-0 mt-0.5 text-xs font-medium text-[#5C7A5F] border border-[#5C7A5F]/40 rounded-full px-3 py-1.5 hover:bg-[#5C7A5F]/8 transition-colors whitespace-nowrap"
            >
              + Invite 🌿
            </button>
          </div>

          {/* Group badge(s). Multi-group intercessions can be attached
              to several communities — we render every one as its own
              chip so members of any attached community can navigate
              straight to their home. `data.group` is the primary
              attachment; `momentGroupsData.additional` comes from the
              moment_groups junction. */}
          {(data.group || (momentGroupsData?.additional?.length ?? 0) > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {data.group && (
                <a
                  href={`/community/${data.group.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 transition-opacity hover:opacity-80"
                  style={{ background: "rgba(46,107,64,0.15)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.25)" }}
                >
                  {data.group.emoji && <span>{data.group.emoji}</span>}
                  {data.group.name}
                </a>
              )}
              {(momentGroupsData?.additional ?? [])
                .filter(g => g.id !== data.group?.id)
                .map(g => (
                  <a
                    key={g.id}
                    href={`/community/${g.slug}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 transition-opacity hover:opacity-80"
                    style={{ background: "rgba(46,107,64,0.12)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.2)" }}
                  >
                    {g.emoji && <span>{g.emoji}</span>}
                    {g.name}
                  </a>
                ))}
            </div>
          )}

          {/* Intercession: "Praying for" subtitle for BCP only; custom uses intention as h1 */}
          {showIntercessionSubtitle ? (
            <p className="text-sm text-[#5C7A5F] mb-1.5">
              Praying for: {intentionDisplay}
            </p>
          ) : !isIntercession && moment.intention ? (
            <p className="text-sm text-muted-foreground italic mb-1.5">"{moment.intention}"</p>
          ) : null}

          {/* Intercessions suppress the schedule label — the card's
              focus is the prayer itself, not when it's scheduled, and
              the Pray CTA already makes today's action obvious. Other
              practice types (morning prayer, fasting, etc.) still show
              the schedule because it's informative to them. */}
          {!isIntercession && (
            <p className="text-xs text-muted-foreground">
              {scheduleLabel(moment.frequency, moment.scheduledTime, moment.dayOfWeek, parsedPracticeDays, moment.timeOfDay)}
            </p>
          )}

          {/* Bell removed — logging window is ±2 hours around scheduled time */}

          {/* Member names as tappable links + together count.
              When the practice is attached to a community, we hide the
              member roll entirely — the community chip above is already
              the anchor, and listing members becomes noisy.
              Intercessions also hide it: the "Prayed this week" pill
              row in the stats card below already lists members by name. */}
          {members.length > 0 && !momentGroup && !isIntercession && (() => {
            const togetherCount = windows.filter(w => w.postCount >= 2).length;
            const isPrayer = ["intercession", "morning-prayer", "evening-prayer"].includes(moment.templateType ?? "");
            const togetherVerb = isPrayer ? "prayed" : "practiced";
            const MAX = 4;
            const shown = members.length <= MAX ? members : members.slice(0, MAX - 1);
            const extra = members.length > MAX ? members.length - (MAX - 1) : 0;
            return (
              <div className="mt-2 space-y-0.5">
                <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                  {shown.map((m, i) => (
                    <span key={m.email} className="inline-flex items-center gap-0.5">
                      <Link
                        href={`/people/${encodeURIComponent(m.email)}`}
                        className="text-sm transition-colors text-muted-foreground/70 hover:text-primary"
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      >
                        {(m.name ?? m.email).split(" ")[0]}
                      </Link>
                      {(i < shown.length - 1 || extra > 0) && <span className="text-muted-foreground/40"> ·</span>}
                    </span>
                  ))}
                  {extra > 0 && <span className="text-sm text-muted-foreground/50">+{extra} more</span>}
                </div>
                <p className="text-xs text-muted-foreground/50">
                  🫱🏻‍🫲🏾 {togetherCount} {togetherCount === 1 ? "time" : "times"} {togetherVerb} together
                </p>
              </div>
            );
          })()}
        </div>

        {/* Contemplative Prayer — duration card */}
        {isContemplative && moment.contemplativeDurationMinutes && (
          <div className="mb-5 bg-[#F5F0FF] border border-[#8B7CF6]/25 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-2xl">🕯️</span>
            <div>
              <p className="text-sm font-semibold text-[#5B4B9A]">
                {moment.contemplativeDurationMinutes} minutes of silence together
              </p>
              <p className="text-xs text-[#5B4B9A]/70 mt-0.5">Everyone sits for the same length, wherever they are</p>
            </div>
          </div>
        )}

        {/* Fasting — rhythm card + water impact */}
        {isFasting && (() => {
          const isMeatFast = moment.fastingType === "meat";
          const dayLabel = moment.fastingDay
            ? `Every ${moment.fastingDay.charAt(0).toUpperCase() + moment.fastingDay.slice(1)}`
            : moment.fastingFrequency === "specific" && moment.fastingDate
              ? new Date(moment.fastingDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
              : "";
          const createdDate = moment.createdAt ? new Date(moment.createdAt) : null;
          const sinceLabel = createdDate
            ? `Together since ${createdDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`
            : null;

          // Water impact numbers (meat fast = ~400 gal/person/day)
          const totalSessions = data?.computedSessionsLogged ?? (moment.commitmentSessionsLogged ?? 0);
          const GALLONS_PER_FAST = 400;
          const totalGallons = totalSessions * GALLONS_PER_FAST;
          const myGallons = myStreak * GALLONS_PER_FAST;

          // Human-scale equivalences
          function gallonLabel(g: number) {
            if (g >= 1_000_000) return `${(g / 1_000_000).toFixed(1)}M`;
            if (g >= 1_000) return `${(g / 1_000).toFixed(1)}K`;
            return g.toLocaleString();
          }
          // 1 person uses ~80 gal/day for all needs; 1 gallon = ~3.8 L drinking
          const peopleOneDayDrinking = Math.round(totalGallons / 0.5); // 0.5 gal = daily drinking water
          const bathtubs = Math.round(totalGallons / 35);

          return (
            <div className="mb-5 space-y-3">
              {/* Rhythm + since */}
              <div className="rounded-2xl px-4 py-3" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                {dayLabel && (
                  <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>
                    📅 {dayLabel}
                  </p>
                )}
                {moment.fastingIntention && (
                  <p className="text-[13px] italic mt-1 leading-relaxed" style={{ color: "rgba(200,212,192,0.7)", fontFamily: "Georgia, 'Times New Roman', serif" }}>
                    {moment.fastingIntention}
                  </p>
                )}
                {sinceLabel && (
                  <p className="text-xs mt-2" style={{ color: "rgba(143,175,150,0.55)" }}>{sinceLabel}</p>
                )}
              </div>

              {/* Water conservation impact — meat fast only */}
              {isMeatFast && (
                <div className="rounded-2xl px-5 py-4 space-y-4" style={{ background: "#0A1F12", border: "1px solid rgba(46,107,64,0.35)" }}>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: "rgba(200,212,192,0.45)" }}>
                      Conserving Water Together
                    </p>

                    {totalSessions === 0 ? (
                      <div>
                        <p className="text-sm" style={{ color: "#8FAF96" }}>
                          Every meat-free fast day saves an estimated <span style={{ color: "#A8C5A0", fontWeight: 600 }}>400 gallons</span> of water per person — the water embedded in producing a typical day's meat.
                        </p>
                        <p className="text-xs mt-2" style={{ color: "rgba(143,175,150,0.5)" }}>
                          Log your first fast day to see your group's running impact.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Hero number */}
                        <div className="flex items-end gap-2 mb-1">
                          <span className="text-4xl font-bold tabular-nums" style={{ color: "#F0EDE6", letterSpacing: "-0.03em" }}>
                            {gallonLabel(totalGallons)}
                          </span>
                          <span className="text-base mb-1" style={{ color: "#8FAF96" }}>gallons saved</span>
                        </div>
                        <p className="text-xs mb-4" style={{ color: "rgba(143,175,150,0.5)" }}>
                          {totalSessions} fast {totalSessions === 1 ? "day" : "days"} × 400 gal per person
                        </p>

                        {/* Equivalences */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.18)" }}>
                            <p className="text-base font-bold" style={{ color: "#A8C5A0" }}>{peopleOneDayDrinking.toLocaleString()}</p>
                            <p className="text-[10px] mt-0.5 leading-snug" style={{ color: "rgba(143,175,150,0.55)" }}>days of drinking water for one person</p>
                          </div>
                          <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.18)" }}>
                            <p className="text-base font-bold" style={{ color: "#A8C5A0" }}>{bathtubs > 0 ? bathtubs.toLocaleString() : "<1"}</p>
                            <p className="text-[10px] mt-0.5 leading-snug" style={{ color: "rgba(143,175,150,0.55)" }}>bathtubs of water spared</p>
                          </div>
                        </div>

                        {/* My contribution */}
                        {myGallons > 0 && (
                          <p className="text-xs mt-3 pt-3 border-t" style={{ color: "rgba(143,175,150,0.5)", borderColor: "rgba(46,107,64,0.15)" }}>
                            Your streak of {myStreak} → <span style={{ color: "#8FAF96" }}>{myGallons.toLocaleString()} gallons</span> saved by you
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}


        {/* Open Now Banner — only when actually open (morning prayer is always accessible).
            Intercession: when the viewer has already prayed today, the
            banner drops the call-to-action copy and just shows "N has
            prayed" — they've done their part, no need to be prompted. */}
        {(() => {
          const viewerPrayedToday = isIntercession && !!(todayLogs ?? []).find(
            l => l.email.toLowerCase() === (user?.email ?? "").toLowerCase() && !!l.loggedAt
          );
          const prayedTodayCount = (todayLogs ?? []).filter(l => !!l.loggedAt).length;
          const headline = isMorningPrayer
            ? "📖 Morning Prayer · Today's office"
            : isIntercession
              ? (viewerPrayedToday
                  ? (prayedTodayCount === 1 ? "1 has prayed" : `${prayedTodayCount} have prayed`)
                  : "🙏🏽 Open today · Pray together")
              : "🌿 Open today";
          const subline = isMorningPrayer
            ? `${todayPostCount} of ${memberCount} have prayed`
            : isIntercession
              ? (viewerPrayedToday
                  // Viewer has prayed — headline already carries the count,
                  // so the subline can be gentler / encouraging.
                  ? "You've prayed today 🌿"
                  : (prayedTodayCount === 1 ? "1 has prayed" : `${prayedTodayCount} have prayed`))
              : `${todayPostCount} of ${memberCount} logged`;
          return (isOpenNow || isMorningPrayer) ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-center justify-between rounded-2xl px-4 py-3"
            style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)" }}
          >
            <div>
              <p className="text-sm font-semibold" style={{ color: "#C8D4C0" }}>{headline}</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{subline}</p>
            </div>
            {postUrl && (
              <Link href={postUrl}>
                <span className="text-sm font-semibold rounded-full px-4 py-2 whitespace-nowrap transition-colors"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                  {actionLabel}
                </span>
              </Link>
            )}
          </motion.div>
        ) : (
          /* Not open: next-practice card */
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 rounded-2xl px-4 py-4 flex items-center justify-between"
            style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-0.5">
                Next {isIntercession ? "prayer" : "practice"}
              </p>
              <p className="text-base font-semibold text-foreground capitalize">
                {nextPracticeLabel(moment.frequency, moment.scheduledTime, moment.dayOfWeek, parsedPracticeDays, moment.timeOfDay)}
              </p>
            </div>
            {isIntercession && postUrl ? (
              <Link href={postUrl}>
                <span className="shrink-0 text-sm font-medium text-[#5C7A5F] border border-[#5C7A5F]/40 rounded-full px-4 py-2 hover:bg-[#5C7A5F]/5 transition-colors cursor-pointer whitespace-nowrap">
                  Pray 🙏🏽
                </span>
              </Link>
            ) : (
              <span className="text-2xl" aria-hidden>🌿</span>
            )}
          </motion.div>
        );
        })()}

        {/* Full intercession prayer text — for custom intercessions we show
            the prayer body above the streak/prayed-today card so the reader's
            eye lands on the prayer itself first, not the numbers. Matches the
            serif/italic style used on the prayer-mode slide so the text reads
            like a liturgy rather than a note. */}
        {isIntercession && moment.intercessionFullText && moment.intercessionFullText.trim().length > 0 && (
          <div
            className="mb-5 rounded-2xl px-5 py-4"
            style={{
              background: "rgba(46,107,64,0.12)",
              border: "1px solid rgba(46,107,64,0.25)",
            }}
          >
            <p
              className="italic whitespace-pre-wrap text-[15px] leading-[1.55]"
              style={{
                color: "#C8D4C0",
                fontFamily: "Georgia, 'Times New Roman', serif",
              }}
            >
              {moment.intercessionFullText}
            </p>
          </div>
        )}

        {/* Stats grid — water impact for fasting, streaks for everything else */}
        {(() => {
          // Use API-computed group streak from actual window bloom data —
          // avoids corrupted currentStreak/longestStreak DB fields.
          const groupStreak = data?.groupStreak ?? 0;
          const groupBest = data?.groupBest ?? groupStreak;
          const displayMyStreak = myStreak > 0 ? myStreak : (todayPostCount >= 1 ? 1 : 0);

          if (isFasting) {
            // For fasting, show water conservation grid
            const GALLONS_PER_FAST = 400;
            const ws = data?.fastingWaterStats;

            function gLabel(n: number) {
              if (!n) return "0";
              if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
              if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
              return n.toLocaleString();
            }

            const rows: { label: string; myKey: "week" | "month" | "allTime"; grpKey: "week" | "month" | "allTime" }[] = [
              { label: "This Week",  myKey: "week",    grpKey: "week"    },
              { label: "This Month", myKey: "month",   grpKey: "month"   },
              { label: "All Time",   myKey: "allTime", grpKey: "allTime" },
            ];

            return (
              <div className="mb-6">
                <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "rgba(200,212,192,0.4)" }}>
                  Conserving Water Together
                </p>
                {/* Column headers */}
                <div className="grid grid-cols-3 gap-2 mb-1">
                  <div />
                  <p className="text-[10px] text-center font-semibold uppercase tracking-wider" style={{ color: "rgba(200,212,192,0.45)" }}>You</p>
                  <p className="text-[10px] text-center font-semibold uppercase tracking-wider" style={{ color: "rgba(200,212,192,0.45)" }}>Group</p>
                </div>
                <div className="space-y-2">
                  {rows.map(({ label, myKey, grpKey }) => {
                    const myGal   = (ws?.my[myKey]    ?? 0) * GALLONS_PER_FAST;
                    const grpGal  = (ws?.group[grpKey] ?? 0) * GALLONS_PER_FAST;
                    return (
                      <div key={label} className="grid grid-cols-3 gap-2 items-center">
                        <p className="text-[11px] font-medium" style={{ color: "rgba(200,212,192,0.55)" }}>{label}</p>
                        <div className="rounded-xl px-2 py-2 text-center" style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.18)" }}>
                          <p className="text-sm font-bold tabular-nums" style={{ color: "#A8C5A0" }}>{gLabel(myGal)}</p>
                        </div>
                        <div className="rounded-xl px-2 py-2 text-center" style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.15)" }}>
                          <p className="text-sm font-bold tabular-nums" style={{ color: "#8FAF96" }}>{gLabel(grpGal)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          // Intercession: unified view — two streak boxes (Your / Group)
          // with inline label-number layout, plus a horizontally-scrolling
          // pill row of members who've prayed this week.
          if (isIntercession) {
            const prayedWeekLogs = (weekLogs ?? []).filter(l => !!l.loggedAt);
            return (
              <div className="mb-6">
                {/* Two-up streak boxes — number + emoji on top row,
                    label on bottom row. Your streak pairs with 🔥 (the
                    viewer's own consecutive-days fire), Group streak
                    with 🙏🏽 (communal prayer). Centered so the number
                    reads as the headline of the box. */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div
                    className="rounded-2xl px-4 py-4 text-center"
                    style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
                  >
                    <p className="text-2xl font-bold text-foreground tabular-nums leading-none">
                      {myStreak ?? 0} <span aria-hidden>🔥</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">Your streak</p>
                  </div>
                  <div
                    className="rounded-2xl px-4 py-4 text-center"
                    style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}
                  >
                    <p className="text-2xl font-bold text-foreground tabular-nums leading-none">
                      {groupStreak} <span aria-hidden>🙏🏽</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">Group streak</p>
                  </div>
                </div>

                {/* Prayed this week — auto-scrolling ticker ONLY when
                    the pills overflow the container width. If the row
                    fits, render once statically with no animation. The
                    duplicated copy + translate-to-(-50%) seam trick
                    only kicks in when we've measured real overflow. */}
                {prayedWeekLogs.length > 0 ? (
                  <PrayedThisWeekRow logs={prayedWeekLogs} />
                ) : (
                  <p className="text-xs text-muted-foreground italic">No one has prayed this week yet.</p>
                )}
              </div>
            );
          }

          return (
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="rounded-2xl p-4 text-center" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                <p className="text-2xl font-bold text-foreground">{displayMyStreak}</p>
                <p className="text-xs text-muted-foreground mt-1">🙏🏽 Your streak</p>
              </div>
              <div className="rounded-2xl p-4 text-center" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                <p className="text-2xl font-bold text-foreground">{groupStreak}</p>
                <p className="text-xs text-muted-foreground mt-1">🔥 Group streak</p>
              </div>
              <div className="rounded-2xl p-4 text-center" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                <p className="text-2xl font-bold text-foreground">{groupBest}</p>
                <p className="text-xs text-muted-foreground mt-1">⭐ Group best</p>
              </div>
            </div>
          );
        })()}

        {/* Progressive Goal Display — for intercessions we suppress the
            in-progress bar (the daily prayer card above already surfaces
            the rhythm), but the goal-reached branch is allowed through so
            creators can still renew. */}
        {(() => {
          const sessionsGoal = moment.commitmentSessionsGoal ?? null;
          // Use API-computed session count from window bloom data — the DB
          // field commitmentSessionsLogged may be inflated by double-bloom bugs.
          const sessionsLogged = data?.computedSessionsLogged ?? (moment.commitmentSessionsLogged ?? 0);
          const tendFreely = moment.commitmentTendFreely ?? false;
          const goalReached = !!sessionsGoal && sessionsLogged >= sessionsGoal;
          // Intercessions skip every branch except the celebration / renew
          // block — that's the only state where the creator needs this
          // surface, and rendering progress bars here would double up with
          // the daily prayer card.
          if (isIntercession && !goalReached) return null;
          const freq = moment.frequency;
          const daysPerWeek = moment.frequencyDaysPerWeek ?? null;
          const ladder = getGoalLadder(freq, daysPerWeek);
          const unitLabel = freq === "daily" ? "day" : "session";
          const unitLabelPlural = freq === "daily" ? "days" : "sessions";

          // Tend freely — minimal display
          if (tendFreely) {
            return (
              <div className="mb-6 text-center py-3">
                <p className="text-sm text-muted-foreground italic" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                  🌿 Tending freely · {sessionsLogged} {unitLabelPlural} together so far
                </p>
              </div>
            );
          }

          // No goal set (legacy practice or BCP without sessions goal)
          if (!sessionsGoal) {
            // Fall back to old goalDays display if available
            const dur = moment.commitmentDuration ?? moment.goalDays ?? 0;
            if (dur === 0) return null;
            const daysDone = Math.min(data?.groupStreak ?? 0, dur);
            const progressPct = dur > 0 ? Math.min(100, (daysDone / dur) * 100) : 0;
            return (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                    {dur}-day commitment
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {progressPct >= 100 ? "🌾 Complete" : progressPct < 50 ? "Taking root" : "Growing"}
                  </span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                  <motion.div className="h-full bg-[#5C7A5F] rounded-full"
                    initial={{ width: 0 }} animate={{ width: `${daysDone > 0 ? Math.max(progressPct, 3) : 0}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{daysDone} day{daysDone === 1 ? "" : "s"} together so far</p>
              </div>
            );
          }

          const goalHit = sessionsLogged >= sessionsGoal;
          const myGoalHit = (myStreak ?? 0) >= sessionsGoal;
          const almostThere = !goalHit && !myGoalHit && (sessionsGoal - sessionsLogged) <= 3;
          const remaining = Math.max(0, sessionsGoal - sessionsLogged);
          const progressPct = Math.min(100, (sessionsLogged / sessionsGoal) * 100);

          // Goal hit — celebration state + next goal nudge (creator) / progress (non-creator)
          if (goalHit) {
            const nextGoal = getNextGoalInLadder(ladder, sessionsGoal);
            const card = nextGoalCard(nextGoal, freq);
            const isOngoing = !nextGoal;
            const effectiveGroupStreak = data?.groupStreak ?? 0;

            return (
              <div className="mb-6">
                {/* Celebration — shown to everyone */}
                <div className="text-center py-4 mb-4">
                  <p className="text-3xl mb-2">🌸</p>
                  <p className="text-lg font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                    Your group kept the rhythm — {sessionsLogged} {unitLabelPlural} together.
                  </p>
                  {effectiveGroupStreak > 0 && (
                    <p className="text-sm text-[#A8C5A0] font-medium mt-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                      🔥 {effectiveGroupStreak}-{unitLabel} group streak
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground italic mt-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                    That's not nothing. That's a real thing you built.
                  </p>
                </div>

                {/* Creator gets renewal controls */}
                {isCreator && card && (
                  <div className="rounded-2xl p-5 mb-3" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                    <p className="text-sm font-medium text-muted-foreground mb-3" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                      Ready to go further? 🌿
                    </p>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{card.emoji}</span>
                      <div>
                        <p className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                          {card.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{card.sub}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => updateGoalMutation.mutate({
                        commitmentSessionsGoal: isOngoing ? null : nextGoal,
                        commitmentTendFreely: isOngoing,
                      })}
                      disabled={updateGoalMutation.isPending}
                      className="w-full py-3 rounded-xl bg-[#5C7A5F] text-white font-semibold text-sm transition-all hover:bg-[#5a7a60] disabled:opacity-50"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      {updateGoalMutation.isPending ? "Setting..."
                        : isOngoing ? "Keep going ✨"
                        : `Set this as your next goal 🌿`}
                    </button>
                    <button
                      onClick={() => { setRenewCustom(String(sessionsGoal)); setRenewModalOpen(true); }}
                      className="w-full mt-2 py-2 text-xs text-[#5C7A5F] hover:text-[#3f5a44] transition-colors font-medium"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      Renew with a different length 🌱
                    </button>
                    {!isOngoing && (
                      <button
                        onClick={() => updateGoalMutation.mutate({ commitmentSessionsGoal: null, commitmentTendFreely: true })}
                        className="w-full mt-2 py-2 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        Tend freely for now ✨
                      </button>
                    )}

                    {/* Archive — we're done here (creator only, two-step confirm) */}
                    {!showArchiveConfirm ? (
                      <button
                        onClick={() => setShowArchiveConfirm(true)}
                        className="w-full mt-2 py-2 text-xs text-muted-foreground/60 hover:text-amber-700 transition-colors"
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        Archive — we're done here 🌸
                      </button>
                    ) : (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
                      >
                        <p className="text-xs font-semibold text-amber-800 mb-1">
                          Archive "{moment.name}"?
                        </p>
                        <p className="text-[11px] text-amber-700/80 mb-3 leading-snug">
                          This closes the practice for the whole group. History and reflections are preserved. You can always start a new one.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => archiveMutation.mutate()}
                            disabled={archiveMutation.isPending}
                            className="text-xs font-semibold text-white bg-amber-600 rounded-full px-4 py-2 hover:bg-amber-700 transition-colors disabled:opacity-50"
                          >
                            {archiveMutation.isPending ? "Archiving…" : "Yes, archive it"}
                          </button>
                          <button
                            onClick={() => setShowArchiveConfirm(false)}
                            className="text-xs text-amber-700 px-2 py-2 hover:text-amber-900 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Non-creator: just show progress indicator */}
                {!isCreator && (
                  <div className="rounded-2xl p-5 mb-3 text-center" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                    <p className="text-sm text-muted-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                      🌿 Goal complete · waiting for the group leader to set the next step
                    </p>
                  </div>
                )}
              </div>
            );
          }

          // Active goal — progress bar
          const barColor = myGoalHit ? "#5C7A5F" : almostThere ? "#C17F24" : "#5C7A5F";
          const myProgressPct = Math.min(100, ((myStreak ?? 0) / sessionsGoal) * 100);
          const displayPct = myGoalHit ? 100 : progressPct;
          return (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  {goalLabel(sessionsGoal, freq)} goal
                </span>
                <span className={`text-xs ${myGoalHit ? "text-[#5C7A5F] font-semibold" : almostThere ? "text-[#C17F24] font-medium" : "text-muted-foreground"}`}>
                  {myGoalHit ? "Goal reached 🌸" : almostThere ? "Almost there 🌸" : `${remaining} to go 🌿`}
                </span>
              </div>
              <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${almostThere && !myGoalHit ? "animate-[goal-pulse_2s_ease-in-out_infinite]" : ""}`}
                  style={{ backgroundColor: barColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(myGoalHit ? myProgressPct : sessionsLogged > 0 ? Math.max(displayPct, 3) : 0)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              {myGoalHit ? (
                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    You showed up {myStreak ?? sessionsGoal} {unitLabelPlural}. 🌸
                  </p>
                  {isCreator && (
                    <button
                      onClick={() => { setRenewCustom(String(sessionsGoal)); setRenewModalOpen(true); }}
                      className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#5C7A5F] text-white hover:bg-[#5a7a60] transition-colors"
                      style={{ fontFamily: "Space Grotesk, sans-serif" }}
                    >
                      Renew 🌱
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1.5">
                  {sessionsLogged} of {sessionsGoal} {unitLabelPlural} · {remaining} to go 🌿
                </p>
              )}
            </div>
          );
        })()}

        {/* ── LOG TIMELINE ───────────────────────────────────────────────────
            Suppressed for intercessions. The "Prayed this week" pill row
            in the stats card above captures who's been active; a full
            timeline becomes duplicative and crowds the page. */}
        {!isIntercession && <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Log Timeline</span>
            <div className="flex-1 h-px" style={{ background: "rgba(46,107,64,0.35)" }} />
          </div>

          {/* TODAY — per-member status (only on practice days).
              We intentionally hide members who haven't prayed yet — this is a
              log of what *has* happened, not a checklist of who's lagging. */}
          {isTodayPracticeDay(moment.frequency, moment.dayOfWeek, parsedPracticeDays) && (() => {
            const prayedToday = todayLogs.filter(l => !!l.loggedAt);
            if (prayedToday.length === 0) return null;
            return (
              <div className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Today</p>
                <div className="rounded-2xl divide-y divide-[rgba(46,107,64,0.15)] overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                  {prayedToday.map((log, i) => {
                    const firstName = (log.name || log.email || "?").split(" ")[0];
                    const initials = (log.name || log.email || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                    const loggedTime = new Date(log.loggedAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-3">
                        {/* Avatar */}
                        {log.avatarUrl ? (
                          <img src={log.avatarUrl} alt={firstName} className="w-8 h-8 rounded-full object-cover shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
                        ) : (
                          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold bg-[#5C7A5F]/15 text-[#4a6b50]">
                            {initials}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground/90">{firstName}</p>
                          {log.reflectionText && (
                            <p className="text-xs text-muted-foreground italic truncate">
                              {`"${log.reflectionText}"`}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-[#5C7A5F] font-medium">
                            {isFasting
                              ? "Fasting · all day"
                              : ["intercession", "morning-prayer", "evening-prayer"].includes(moment.templateType ?? "")
                              ? `Prayed · ${loggedTime}`
                              : isContemplative
                              ? `In silence · ${loggedTime}`
                              : `Practiced · ${loggedTime}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* RECENT — last 5 windows with at least one post, excluding today */}
          {(() => {
            const todayStr = new Date().toISOString().slice(0, 10);
            const recentWindows = [...windows]
              .filter(w => w.posts.length > 0 && w.windowDate !== todayStr)
              .sort((a, b) => b.windowDate.localeCompare(a.windowDate))
              .slice(0, 5);
            const todayWindow = windows.find(w => w.windowDate === todayStr);
            const todayHasPosts = todayWindow && todayWindow.posts.length > 0;
            if (recentWindows.length === 0 && !todayHasPosts) return (
              <p className="text-xs text-muted-foreground/50 italic text-center py-4">
                No practice sessions yet — be the first to log 🌿
              </p>
            );
            if (recentWindows.length === 0) return null;
            return (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">Recent</p>
                <div className="space-y-3">
                  {recentWindows.map(win => {
                    const date = parseISO(win.windowDate);
                    const today = new Date().toISOString().slice(0, 10);
                    const dateLabel = win.windowDate === today ? "Today" : format(date, "EEE, MMM d");
                    return (
                      <div key={win.id} className="rounded-2xl overflow-hidden" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                        <div className="flex items-center justify-between px-4 pt-3 pb-2" style={{ borderBottom: "1px solid rgba(46,107,64,0.15)" }}>
                          <p className="text-xs font-semibold text-foreground/70">{dateLabel}</p>
                          <span className="text-xs text-muted-foreground/50">
                            {STATUS_ICON[win.status] ?? ""} {STATUS_LABEL[win.status] ?? win.status}
                          </span>
                        </div>
                        <div className="divide-y divide-border/20">
                          {win.posts.map((post, i) => {
                            const firstName = (post.guestName ?? "Someone").split(" ")[0];
                            const loggedTime = post.loggedAt
                              ? new Date(post.loggedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()
                              : null;
                            return (
                              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                                <p className="text-xs font-semibold text-foreground/70 shrink-0 mt-0.5 w-16 truncate">{firstName}</p>
                                <div className="flex-1 min-w-0">
                                  {post.reflectionText ? (
                                    <p className="text-xs text-muted-foreground italic line-clamp-2">
                                      {`"${post.reflectionText}"`}
                                    </p>
                                  ) : post.isCheckin ? (
                                    <p className="text-xs text-muted-foreground">
                                      {isFasting
                                        ? "✓ fasted"
                                        : ["intercession", "morning-prayer", "evening-prayer"].includes(moment.templateType ?? "")
                                        ? "✓ prayed"
                                        : isContemplative
                                        ? "✓ sat"
                                        : "✓ practiced"}
                                    </p>
                                  ) : null}
                                </div>
                                {loggedTime && (
                                  <p className="text-[11px] text-muted-foreground/40 shrink-0">{loggedTime}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>}

        {/* ── Settings section — always visible on mobile ──────────────────── */}
        <div className="border-t border-border/30 pt-5">
          <button
            onClick={() => setShowManage(m => !m)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 px-1 -mx-1 rounded-lg"
          >
            <span>⚙️</span>
            <span className="font-medium">Settings</span>
            <span className="text-xs opacity-50">{showManage ? "▲" : "▼"}</span>
          </button>

          {showManage && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="mt-4 space-y-3"
            >
              {/* Edit practice — creator only */}
              {isCreator && !editingPractice && (
                <div className="flex items-start justify-between rounded-2xl px-5 py-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                  <div>
                    <p className="text-sm font-medium text-foreground">Edit practice</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Change name, intention, or goal.</p>
                  </div>
                  <button
                    onClick={() => {
                      setEditName(moment.name);
                      setEditIntention(moment.intention ?? "");
                      setEditGoalDays(moment.goalDays);
                      setEditScheduledTime(moment.scheduledTime);
                      setEditEmoji((moment as any).customEmoji ?? "");
                      setEditingPractice(true);
                    }}
                    className="shrink-0 ml-4 text-xs font-medium text-[#5C7A5F] border border-[#5C7A5F]/40 rounded-full px-4 py-2 hover:bg-[#5C7A5F]/8 transition-colors min-h-[36px]"
                  >
                    Edit
                  </button>
                </div>
              )}
              {isCreator && editingPractice && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl px-5 py-4 space-y-4"
                  style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.25)" }}
                >

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">{isIntercession ? "Title" : "Name"}</label>
                    <input
                      type="text"
                      value={isCustomIntercession ? editIntention : editName}
                      onChange={e => isCustomIntercession ? setEditIntention(e.target.value) : setEditName(e.target.value)}
                      maxLength={100}
                      className="w-full rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C7A5F]/20"
                      style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
                    />
                  </div>
                  {isCustomIntercession && moment.intercessionFullText ? (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Prayer</label>
                      <div
                        className="rounded-xl px-3 py-2 text-sm italic leading-relaxed"
                        style={{ background: "rgba(46,107,64,0.06)", border: "1px solid rgba(46,107,64,0.15)", color: "#8FAF96" }}
                      >
                        {moment.intercessionFullText}
                      </div>
                    </div>
                  ) : !isIntercession ? (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Intention</label>
                      <textarea
                        value={editIntention}
                        onChange={e => setEditIntention(e.target.value)}
                        maxLength={500}
                        rows={2}
                        className="w-full rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#5C7A5F]/20"
                        style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
                      />
                    </div>
                  ) : null}
                  {isIntercession && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Emoji</label>
                      <div className="flex flex-wrap gap-2">
                        {["🙏🏽", "✝️", "🕊️", "💚", "🌿", "🕯️", "📖", "❤️", "🙌🏽", "☦️", "⛪", "🌹"].map(e => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => setEditEmoji(editEmoji === e ? "" : e)}
                            className="text-2xl w-10 h-10 rounded-xl flex items-center justify-center transition-all"
                            style={{
                              background: editEmoji === e ? "rgba(92,122,95,0.3)" : "transparent",
                              border: editEmoji === e ? "1.5px solid rgba(92,122,95,0.6)" : "1.5px solid transparent",
                            }}
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Shown on dashboard cards. Tap again to clear.</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Goal (days)</label>
                    <input
                      type="number"
                      value={editGoalDays}
                      onChange={e => setEditGoalDays(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))}
                      min={0}
                      max={365}
                      className="w-24 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C7A5F]/20"
                      style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
                    />
                  </div>
                  {!isFasting && !isIntercession && (
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Scheduled time</label>
                      <input
                        type="time"
                        value={editScheduledTime}
                        onChange={e => setEditScheduledTime(e.target.value)}
                        className="rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5C7A5F]/20"
                        style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.25)", color: "#F0EDE6" }}
                      />
                      <p className="text-xs text-muted-foreground mt-1">Everyone can log any time that day. 🌿</p>
                    </div>
                  )}

                  {/* Share with groups — intercessions only. The primary
                      group is pinned; additional groups can be added or
                      removed. Adding a group pulls every joined member of
                      that community in as a participant (server-side).
                      Only groups the viewer is an admin of can be attached. */}
                  {isIntercession && (() => {
                    const primary = momentGroupsData?.primary ?? null;
                    const additional = momentGroupsData?.additional ?? [];
                    const linkedIds = new Set([
                      ...(primary ? [primary.id] : []),
                      ...additional.map(g => g.id),
                    ]);
                    const addableGroups = (myGroupsData?.groups ?? []).filter(g =>
                      !linkedIds.has(g.id) && (g.myRole === "admin" || g.myRole === "hidden_admin")
                    );
                    const attaching = attachGroupMutation.isPending ? attachGroupMutation.variables : null;
                    const detaching = detachGroupMutation.isPending ? detachGroupMutation.variables : null;
                    return (
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-2">Share with</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {primary && (
                            <span
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                              style={{
                                background: "rgba(46,107,64,0.18)",
                                border: "1px solid rgba(46,107,64,0.35)",
                                color: "#C8D4C0",
                              }}
                              title="Primary community — can't be detached here; archive the practice instead."
                            >
                              {primary.emoji ?? "🏘️"} {primary.name}
                            </span>
                          )}
                          {additional.map(g => (
                            <span
                              key={g.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                              style={{
                                background: "rgba(46,107,64,0.12)",
                                border: "1px solid rgba(46,107,64,0.28)",
                                color: "#C8D4C0",
                              }}
                            >
                              {g.emoji ?? "🏘️"} {g.name}
                              <button
                                type="button"
                                onClick={() => detachGroupMutation.mutate(g.id)}
                                disabled={detachGroupMutation.isPending}
                                className="-mr-1 hover:opacity-100 transition-opacity"
                                style={{ opacity: detaching === g.id ? 0.4 : 0.6 }}
                                title="Remove from this community"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          {!primary && additional.length === 0 && (
                            <span className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
                              Not shared with any community yet.
                            </span>
                          )}
                        </div>

                        {addableGroups.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {addableGroups.map(g => (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => attachGroupMutation.mutate(g.id)}
                                disabled={attachGroupMutation.isPending}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-40"
                                style={{
                                  background: "transparent",
                                  border: "1px dashed rgba(143,175,150,0.45)",
                                  color: "#A8C5A0",
                                }}
                              >
                                {attaching === g.id ? "Adding…" : `+ ${g.emoji ?? "🏘️"} ${g.name}`}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs" style={{ color: "rgba(143,175,150,0.45)" }}>
                            {myGroupsData ? "No other communities you admin to add." : "Loading communities…"}
                          </p>
                        )}
                        <p className="text-xs mt-2" style={{ color: "rgba(143,175,150,0.45)" }}>
                          Adding a community brings its members in as participants.
                        </p>
                      </div>
                    );
                  })()}

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        const payload: Record<string, unknown> = {};
                        if (editName.trim() && editName !== moment.name) payload.name = editName.trim();
                        if (editIntention !== (moment.intention ?? "")) payload.intention = editIntention;
                        if (editGoalDays !== moment.goalDays) {
                          payload.goalDays = editGoalDays;
                          payload.commitmentSessionsGoal = editGoalDays;
                        }
                        if (editScheduledTime && editScheduledTime !== moment.scheduledTime) payload.scheduledTime = editScheduledTime;
                        if (editEmoji !== ((moment as any).customEmoji ?? "")) payload.customEmoji = editEmoji || null;
                        if (Object.keys(payload).length > 0) {
                          editMutation.mutate(payload);
                        } else {
                          setEditingPractice(false);
                        }
                      }}
                      disabled={editMutation.isPending || !editName.trim()}
                      className="text-sm font-semibold text-white bg-[#5C7A5F] rounded-full px-5 py-2.5 hover:bg-[#5a7d60] transition-colors disabled:opacity-50"
                    >
                      {editMutation.isPending ? "Saving…" : "Save changes"}
                    </button>
                    <button
                      onClick={() => setEditingPractice(false)}
                      className="text-sm text-muted-foreground px-3 py-2.5 hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Members — creator can remove. Hidden entirely for
                  group-scoped practices: the roster is the community
                  membership, edited on the community page, not here.
                  Showing (and letting the creator edit) a parallel
                  list was confusing and let the two sources of truth
                  drift apart. */}
              {isCreator && !momentGroup && members.length > 1 && (
                <div className="rounded-2xl px-5 py-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                  <p className="text-sm font-medium text-foreground mb-3">Members</p>
                  <div className="space-y-2">
                    {members.map(m => {
                      const isMe = m.email.toLowerCase() === user?.email?.toLowerCase();
                      const isRemoving = removingEmail === m.email;
                      return (
                        <div key={m.email} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {m.avatarUrl ? (
                              <img src={m.avatarUrl} alt={m.name ?? ""} className="w-7 h-7 rounded-full object-cover shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
                            ) : (
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>
                                {(m.name ?? m.email).charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm text-foreground truncate">{m.name ?? m.email}{isMe ? " (you)" : ""}</p>
                                {!isMe && m.joined === false && (
                                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground/70">
                                    Invited
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground/60 truncate">{m.email}</p>
                            </div>
                          </div>
                          {!isMe && (
                            isRemoving ? (
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <button
                                  onClick={() => removeMemberMutation.mutate(m.email)}
                                  disabled={removeMemberMutation.isPending}
                                  className="text-xs font-medium text-rose-600 hover:text-rose-700 transition-colors"
                                >
                                  {removeMemberMutation.isPending ? "Removing…" : "Confirm"}
                                </button>
                                <button
                                  onClick={() => setRemovingEmail(null)}
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setRemovingEmail(m.email)}
                                className="shrink-0 ml-2 text-xs text-muted-foreground/50 hover:text-rose-500 transition-colors px-2 py-1"
                                title={`Remove ${m.name ?? m.email}`}
                              >
                                ✕
                              </button>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Invite permissions toggle — creator only */}
              {isCreator && (() => {
                const currentAmi = (moment as unknown as { allowMemberInvites?: boolean }).allowMemberInvites ?? true;
                return (
                  <div className="flex items-center justify-between rounded-2xl px-5 py-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                    <div>
                      <p className="text-sm font-medium text-foreground">Members can invite</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Allow any member to invite new people</p>
                    </div>
                    <button
                      onClick={() => {
                        editMutation.mutate({ allowMemberInvites: !currentAmi });
                      }}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ml-4"
                      style={{
                        background: currentAmi ? "rgba(92,122,95,0.7)" : "rgba(0,0,0,0.12)",
                        border: "1px solid rgba(92,122,95,0.4)",
                      }}
                    >
                      <span
                        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                        style={{ transform: currentAmi ? "translateX(22px)" : "translateX(3px)" }}
                      />
                    </button>
                  </div>
                );
              })()}

              {/* Non-creator: Leave only */}
              {!isCreator && (
                <>
                  {!showLeaveConfirm ? (
                    <div className="flex items-start justify-between rounded-2xl px-5 py-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                      <div>
                        <p className="text-sm font-medium text-foreground">Leave this practice</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Removes it from your garden. History is preserved.</p>
                      </div>
                      <button
                        onClick={() => setShowLeaveConfirm(true)}
                        className="shrink-0 ml-4 text-xs font-medium text-amber-700 border border-amber-300/60 rounded-full px-4 py-2 hover:bg-amber-50 transition-colors min-h-[36px]"
                      >
                        Leave
                      </button>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4"
                    >
                      <p className="text-sm font-semibold text-amber-800 mb-1">Leave "{moment.name}"?</p>
                      <p className="text-xs text-amber-700/80 mb-4">
                        You'll no longer receive reminders or appear in this practice. You can always be re-invited.
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => archiveMutation.mutate()}
                          disabled={archiveMutation.isPending}
                          className="text-sm font-semibold text-white bg-amber-600 rounded-full px-5 py-2.5 hover:bg-amber-700 transition-colors disabled:opacity-50"
                        >
                          {archiveMutation.isPending ? "Leaving…" : "Yes, leave it"}
                        </button>
                        <button
                          onClick={() => setShowLeaveConfirm(false)}
                          className="text-sm text-amber-700 px-3 py-2.5 hover:text-amber-900 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </>
              )}

              {/* Creator: Delete */}
              {isCreator && (
                <>
                  {!showDeleteConfirm ? (
                    <div className="flex items-start justify-between rounded-2xl px-5 py-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.3)" }}>
                      <div>
                        <p className="text-sm font-medium text-foreground">Delete this practice</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Permanently removes it for everyone. Cannot be undone.</p>
                      </div>
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="shrink-0 ml-4 text-xs font-medium text-rose-600 border border-rose-300/60 rounded-full px-4 py-2 hover:bg-rose-50 transition-colors min-h-[36px]"
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-4"
                    >
                      <p className="text-sm font-semibold text-rose-800 mb-1">Delete "{moment.name}"?</p>
                      <p className="text-xs text-rose-700/80 mb-4">
                        This cannot be undone. All history, streaks, and reflections will be permanently removed for everyone.
                      </p>
                      {deleteError && (
                        <p className="text-xs text-rose-700 bg-rose-100 rounded-lg px-3 py-2 mb-3">{deleteError}</p>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={() => { setDeleteError(""); deleteMutation.mutate(); }}
                          disabled={deleteMutation.isPending}
                          className="text-sm font-semibold text-white bg-rose-600 rounded-full px-5 py-2.5 hover:bg-rose-700 transition-colors disabled:opacity-50"
                        >
                          {deleteMutation.isPending ? "Deleting…" : "Yes, delete it"}
                        </button>
                        <button
                          onClick={() => { setShowDeleteConfirm(false); setDeleteError(""); }}
                          className="text-sm text-rose-700 px-3 py-2.5 hover:text-rose-900 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </div>

      </div>

      {/* ── Invite Sheet ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {renewModalOpen && (
          <>
            <motion.div
              key="renew-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setRenewModalOpen(false)}
            />
            <motion.div
              key="renew-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="px-5 pt-4 pb-8">
                <div className="w-10 h-1 bg-border/60 rounded-full mx-auto mb-4" />
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold text-foreground">Renew {moment.name}</h2>
                  <button
                    onClick={() => setRenewModalOpen(false)}
                    className="text-muted-foreground hover:text-foreground text-xl leading-none p-1"
                  >
                    ×
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-5">
                  Pick a new length — progress resets and the rhythm continues.
                </p>

                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
                  Presets
                </p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {[3, 7, 14, 30, 90].map((n) => {
                    const isActive = renewCustom === String(n);
                    return (
                      <button
                        key={n}
                        onClick={() => setRenewCustom(String(n))}
                        className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                          isActive
                            ? "bg-[#5C7A5F] text-white"
                            : "bg-secondary text-foreground hover:bg-secondary/80"
                        }`}
                        style={{ fontFamily: "Space Grotesk, sans-serif" }}
                      >
                        {n} {moment.frequency === "daily" ? "days" : "sessions"}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setRenewCustom("ongoing")}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                      renewCustom === "ongoing"
                        ? "bg-[#5C7A5F] text-white"
                        : "bg-secondary text-foreground hover:bg-secondary/80"
                    }`}
                    style={{ fontFamily: "Space Grotesk, sans-serif" }}
                  >
                    Ongoing ✨
                  </button>
                </div>

                {renewCustom !== "ongoing" && (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
                      Custom length
                    </p>
                    <div className="flex items-center gap-2 mb-6">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={renewCustom}
                        onChange={(e) => setRenewCustom(e.target.value)}
                        className="flex-1 px-4 py-3 rounded-xl bg-secondary text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#5C7A5F]"
                        placeholder="How many?"
                      />
                      <span className="text-sm text-muted-foreground">
                        {moment.frequency === "daily" ? "days" : "sessions"}
                      </span>
                    </div>
                  </>
                )}

                {renewCustom === "ongoing" && (
                  <p className="text-xs text-muted-foreground italic mb-6" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                    No end date — this is just what you do now. The calendar event keeps going. ✨
                  </p>
                )}

                <button
                  onClick={() => {
                    if (renewCustom === "ongoing") {
                      updateGoalMutation.mutate(
                        { commitmentSessionsGoal: null, commitmentTendFreely: true },
                        { onSuccess: () => setRenewModalOpen(false) }
                      );
                      return;
                    }
                    const n = parseInt(renewCustom, 10);
                    if (!Number.isFinite(n) || n < 1 || n > 365) return;
                    updateGoalMutation.mutate(
                      { commitmentSessionsGoal: n, commitmentTendFreely: false },
                      { onSuccess: () => setRenewModalOpen(false) }
                    );
                  }}
                  disabled={
                    updateGoalMutation.isPending ||
                    (renewCustom !== "ongoing" && (!renewCustom || parseInt(renewCustom, 10) < 1))
                  }
                  className="w-full py-3.5 rounded-2xl text-sm font-semibold bg-[#5C7A5F] text-white hover:bg-[#5a7a60] transition-colors disabled:opacity-50"
                  style={{ fontFamily: "Space Grotesk, sans-serif" }}
                >
                  {updateGoalMutation.isPending
                    ? "Renewing…"
                    : renewCustom === "ongoing"
                      ? "Make it ongoing ✨"
                      : "Renew 🌱"}
                </button>
              </div>
            </motion.div>
          </>
        )}
        {showInvite && (
          <>
            {/* Backdrop */}
            <motion.div
              key="invite-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowInvite(false)}
            />
            {/* Sheet */}
            <motion.div
              key="invite-sheet"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <div className="px-5 pt-4 pb-safe-bottom">
                {/* Handle */}
                <div className="w-10 h-1 bg-border/60 rounded-full mx-auto mb-4" />
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-semibold text-foreground">Invite to practice</h2>
                  <button
                    onClick={() => setShowInvite(false)}
                    className="text-muted-foreground hover:text-foreground text-xl leading-none p-1"
                  >
                    ×
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mb-5">
                  Add people to <span className="font-medium text-foreground">{moment.name}</span>
                </p>

                <InviteStep
                  type="practice"
                  onPeopleChange={setInvitePeople}
                />

                <div className="mt-5 pb-6">
                  <button
                    onClick={() => {
                      if (invitePeople.length > 0) inviteMutation.mutate(invitePeople);
                    }}
                    disabled={invitePeople.length === 0 || inviteMutation.isPending}
                    className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition-colors ${
                      invitePeople.length > 0
                        ? "bg-[#5C7A5F] text-white hover:bg-[#5a7a60]"
                        : "bg-secondary text-muted-foreground cursor-not-allowed"
                    }`}
                  >
                    {inviteMutation.isPending
                      ? "Inviting…"
                      : invitePeople.length === 0
                        ? "Choose someone to invite"
                        : invitePeople.length === 1
                          ? `Invite ${invitePeople[0].name} 🌿`
                          : `Invite ${invitePeople.length} people 🌿`}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Layout>
  );
}
