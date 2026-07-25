import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useRoute, useLocation, Link } from "wouter";
import { format, parseISO, formatDistanceToNow, isPast, addDays, differenceInDays, isFuture } from "date-fns";
import { CheckCircle2, XCircle, Settings, Sprout, Flower2, Plus, X, Copy, Link2, Calendar } from "lucide-react";
import { clsx } from "clsx";
import {
  useGetRitual,
  useUpdateRitual,
  useDeleteRitual,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { StreakBadge } from "@/components/StreakBadge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { isNativeShell } from "@/lib/isNativeShell";

type Tab = "timeline" | "moments" | "settings";

const LOGGING_ICONS: Record<string, string> = {
  photo: "📷",
  reflection: "✍🏽",
  both: "📷✍🏽",
  checkin: "✅",
};

const STATE_META_STYLE: Record<string, string> = {
  active: "bg-[#1A3D2B] text-[#8FAF96] border-[#2D5E3F]",
  needs_water: "bg-[#3D2A10] text-[#C47A65] border-[#5A3D18]",
  dormant: "bg-secondary text-muted-foreground border-border",
};

type SharedMoment = {
  id: number;
  name: string;
  intention: string;
  loggingType: string;
  reflectionPrompt: string | null;
  frequency: string;
  scheduledTime: string;
  goalDays: number;
  currentStreak: number;
  longestStreak: number;
  totalBlooms: number;
  state: string;
  momentToken: string;
  latestWindow: { status: string; windowDate: string } | null;
  todayPostCount: number;
  windowOpen: boolean;
};

interface TimelineMeetup {
  id: number;
  scheduledDate: string;
  status: string;
  googleCalendarEventId: string | null;
  notes: string | null;
  location: string | null;
}

interface TimelineData {
  upcoming: TimelineMeetup | null;
  past: TimelineMeetup[];
  location: string | null;
  confirmedTime: string | null;
  calendarEventMissing?: boolean;
}

function getStatusMeta(status: string) {
  switch (status) {
    case "on_track":   return { label: "Blooming",      style: "bg-[#1A3D2B] text-[#8FAF96] border-[#2D5E3F]" };
    case "overdue":    return { label: "Needs tending", style: "bg-[#3D2A10] text-[#C47A65] border-[#5A3D18]" };
    default:           return { label: null,             style: "" };
  }
}

export default function RitualDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/ritual/:id");
  const [, setLocation] = useLocation();
  const ritualId = parseInt(params?.id || "0", 10);
  const { data: ritual, isLoading } = useGetRitual(ritualId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const deleteMutation = useDeleteRitual();
  const updateMutation = useUpdateRitual();

  const STATE_META: Record<string, { label: string; style: string }> = {
    active: { label: t("ritual_detail.state_active"), style: STATE_META_STYLE.active },
    needs_water: { label: t("ritual_detail.state_needs_tending"), style: STATE_META_STYLE.needs_water },
    dormant: { label: t("ritual_detail.state_dormant"), style: STATE_META_STYLE.dormant },
  };

  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [removingPending, setRemovingPending] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>("timeline");
  const [isEditing, setIsEditing] = useState(false);

  const { data: momentsData, isLoading: momentsLoading } = useQuery<{ moments: SharedMoment[] }>({
    queryKey: [`/api/rituals/${ritualId}/moments`],
    queryFn: () => apiRequest("GET", `/api/rituals/${ritualId}/moments`),
    enabled: activeTab === "moments" && !!ritualId,
  });
  const [editName, setEditName] = useState("");
  const [editIntention, setEditIntention] = useState("");

  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [calendarSynced, setCalendarSynced] = useState(false);
  const [loggingId, setLoggingId] = useState<number | null>(null);

  const [copiedLink, setCopiedLink] = useState(false);

  // ── Calendar sync state ────────────────────────────────────────────────────
  const [calSyncNotifs, setCalSyncNotifs] = useState<Array<{ name: string; email: string }>>([]);
  const [calSyncedEmails, setCalSyncedEmails] = useState<Set<string>>(new Set());
  const [declinedEmails, setDeclinedEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (ritual && !isEditing) {
      setEditName(ritual.name);
      setEditIntention(ritual.intention || "");
    }
  }, [ritual, isEditing]);

  const fetchTimeline = useCallback(async () => {
    if (!ritualId) return;
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/rituals/${ritualId}/timeline`, { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const data: TimelineData = await res.json();
        const prevDate = timeline?.upcoming?.scheduledDate;
        const newDate = data.upcoming?.scheduledDate;
        if (prevDate && newDate && prevDate !== newDate) setCalendarSynced(true);
        setTimeline(data);
      }
    } catch {
      toast({ variant: "destructive", title: t("ritual_detail.toast_timeline_error") });
    } finally {
      setTimelineLoading(false);
    }
  }, [ritualId]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  const handleLog = async (meetupId: number, status: "completed" | "skipped") => {
    setLoggingId(meetupId);
    try {
      const res = await fetch(`/api/rituals/${ritualId}/meetups/${meetupId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to log");
      const msg = status === "completed"
        ? t("ritual_detail.toast_logged_completed")
        : t("ritual_detail.toast_logged_skipped");
      toast({ title: msg });
      await fetchTimeline();
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals`] });
    } catch {
      toast({ variant: "destructive", title: t("ritual_detail.toast_log_error") });
    } finally {
      setLoggingId(null);
    }
  };

  // Calendar sync removed — no longer needed

  // Inside Capacitor `window.location.origin` is `capacitor://localhost`,
  // so a link copied from the iOS app would be unfollowable. Pin to the
  // public host on native; Universal Links carry the tap back into the app.
  const linkOrigin = isNativeShell() ? "https://withphoebe.app" : window.location.origin;
  const joinLink = `${linkOrigin}/join/${(ritual as any)?.scheduleToken ?? ""}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleSaveSettings = async () => {
    try {
      await apiRequest("PUT", `/api/rituals/${ritualId}`, {
        name: editName,
        intention: editIntention,
      });
      setIsEditing(false);
      toast({ title: t("ritual_detail.toast_changes_saved") });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
    } catch {
      toast({ variant: "destructive", title: t("ritual_detail.toast_save_error") });
    }
  };

  // ── Calendar restore ────────────────────────────────────────────────────────
  const restoreCalendarMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/rituals/${ritualId}/restore-calendar`, {}),
    onSuccess: () => {
      toast({ title: t("ritual_detail.toast_calendar_restored") });
      fetchTimeline();
    },
    onError: () => toast({ variant: "destructive", title: t("ritual_detail.toast_calendar_restore_error") }),
  });

  // ── Set / change the meeting time (owner only) ─────────────────────────────
  // Replaces the old guest-facing scheduling-poll page: the organizer picks a
  // single time directly, no invite link, no responses to collect.
  const [showSetTime, setShowSetTime] = useState(false);
  const [setTimeValue, setSetTimeValue] = useState("");
  const confirmTimeMutation = useMutation({
    mutationFn: (confirmedTime: string) =>
      apiRequest("POST", `/api/rituals/${ritualId}/confirm-time`, { confirmedTime }),
    onSuccess: () => {
      setShowSetTime(false);
      setSetTimeValue("");
      fetchTimeline();
    },
    onError: () => toast({ variant: "destructive", title: t("ritual_detail.toast_save_error") }),
  });

  const isOwner = !!(ritual && user && ritual.ownerId === user.id);

  if (isLoading) {
    return (
      <Layout>
        <div className="animate-pulse space-y-5 max-w-3xl mx-auto w-full pt-8">
          <div className="h-36 rounded-2xl" style={{ background: "#0F2818" }} />
          <div className="h-64 rounded-2xl" style={{ background: "#0F2818" }} />
          <div className="h-48 rounded-2xl" style={{ background: "#0F2818" }} />
        </div>
      </Layout>
    );
  }

  if (!ritual) return <Layout><div className="pt-20 text-center text-muted-foreground">{t("ritual_detail.not_found")}</div></Layout>;

  const statusMeta = getStatusMeta(ritual.status);
  const upcomingDate = timeline?.upcoming ? new Date(timeline.upcoming.scheduledDate) : null;
  const upcomingIsPast = upcomingDate ? isPast(upcomingDate) : false;

  // ── Rhythm health ────────────────────────────────────────────────────────────
  const lastCompletedMeetup = timeline?.past.find(m => m.status === "completed") ?? null;
  const isOneTime = ritual.frequency === "once";
  const rhythmDays = ritual.frequency === "biweekly" ? 14 : ritual.frequency === "monthly" ? 30 : 7;
  // Video-call gathering — carries a meetingUrl instead of a physical
  // place. `meetingUrl` isn't in the generated api-client type yet, so
  // we read it off the row with a cast (same pattern the file already
  // uses for `description`). When set, location lines are suppressed
  // in favour of a "Join video call" button.
  const meetingUrl = (() => {
    const raw = (ritual as { meetingUrl?: string | null }).meetingUrl;
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
  })();
  // One-time gatherings have no recurring rhythm to fall behind, so we
  // never compute a "next due" date for them.
  const nextDueDate = !isOneTime && lastCompletedMeetup
    ? addDays(parseISO(lastCompletedMeetup.scheduledDate), rhythmDays)
    : null;
  const daysUntilDue = nextDueDate ? differenceInDays(nextDueDate, new Date()) : null;
  const isRhythmOverdue = !isOneTime && daysUntilDue !== null && daysUntilDue < 0;
  // Dots: up to 5 past cycles + 1 upcoming slot
  const pastDots = (timeline?.past ?? []).slice(0, 5).map(m =>
    m.status === "completed" ? "completed" as const : "missed" as const
  );
  const rhythmDots: ("completed" | "missed" | "upcoming")[] =
    [...pastDots, "upcoming" as const].slice(0, 6);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full pb-16">

        {/* Header */}
        <div className="rounded-2xl p-5 md:p-6 mb-5" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}>
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Rhythm + since */}
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs font-medium px-3 py-1 rounded-full" style={{ border: "1px solid rgba(46,107,64,0.3)", color: "#8FAF96" }}>
                  {(() => {
                    const freq = ritual.frequency as string;
                    if (freq === "once") return t("ritual_detail.freq_once");
                    if (freq === "biweekly") return t("ritual_detail.freq_biweekly");
                    if (freq === "weekly") return t("ritual_detail.freq_weekly");
                    if (freq === "monthly") return t("ritual_detail.freq_monthly");
                    return freq.charAt(0).toUpperCase() + freq.slice(1);
                  })()}
                </span>
                {(ritual as any).createdAt && (
                  <span className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
                    {t("ritual_detail.together_since", { date: format(parseISO((ritual as any).createdAt), "MMMM yyyy") })}
                  </span>
                )}
              </div>

              <h1 className="font-bold leading-tight break-words" style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "26px", color: "#F0EDE6" }}>{ritual.name}</h1>
              {(ritual.intention || (ritual as any).description) && (
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "#C8D4C0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                >
                  {ritual.intention || (ritual as any).description}
                </p>
              )}
              {(() => {
                const isOnce = ritual.frequency === "once";
                const freqWord =
                  ritual.frequency === "biweekly" ? t("ritual_detail.freq_word_biweekly") :
                  ritual.frequency === "weekly" ? t("ritual_detail.freq_word_weekly") :
                  ritual.frequency === "monthly" ? t("ritual_detail.freq_word_monthly") :
                  ritual.frequency;
                const timesMet = (timeline?.past ?? []).filter(m => m.status === "completed").length;
                const metLabel =
                  timesMet === 0 ? t("ritual_detail.met_none") :
                  t("ritual_detail.met_count", { count: timesMet });
                return (
                  <p className="mt-1.5 text-xs" style={{ color: "rgba(143,175,150,0.65)" }}>
                    {isOnce ? t("ritual_detail.subtitle_one_time") : t("ritual_detail.subtitle_tradition", { freq: freqWord })} · {metLabel}
                  </p>
                );
              })()}
              {timeline?.location && !meetingUrl && (
                <p className="mt-2 text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>📍 {timeline.location}</p>
              )}
              {meetingUrl && (
                <p className="mt-2 text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>📹 {t("ritual_detail.video_call")}</p>
              )}
            </div>

            {/* Member names + Add people */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <div className="flex flex-wrap items-center gap-1.5">
                {ritual.participants.slice(0, 3).map((p, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{
                      border: "1px solid rgba(46,107,64,0.35)",
                      background: "rgba(74,103,65,0.12)",
                      color: "#C8D4C0",
                    }}
                    title={p.email}
                  >
                    {p.name || p.email.split("@")[0]}
                  </span>
                ))}
                {ritual.participants.length > 3 && (
                  <span className="text-xs font-medium px-2 py-1.5 rounded-full" style={{ color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}>
                    {t("ritual_detail.more_count", { count: ritual.participants.length - 3 })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-full mb-5" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}>
          {[
            { id: "timeline", label: "🤝🏽 " + t("ritual_detail.tab_gatherings") },
            { id: "moments", label: "🙏🏽 " + t("ritual_detail.tab_practices") },
            { id: "settings", label: t("ritual_detail.tab_about") },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className="flex-1 py-2 px-3 rounded-full transition-all"
              style={{
                fontSize: "14px",
                fontWeight: activeTab === tab.id ? 500 : 400,
                background: activeTab === tab.id ? "#1A3D2B" : "transparent",
                color: activeTab === tab.id ? "#F0EDE6" : "#8FAF96",
                boxShadow: activeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === "timeline" && (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {/* ── Rhythm Health ──────────────────────────────────────── */}
              {/* Only show when there's no upcoming gathering AND no history —
                  i.e. when the user truly has nothing scheduled. Once a
                  gathering exists (pending, confirmed, or past) the empty
                  state becomes a contradiction, so we hide the whole card. */}
              {!timelineLoading && !timeline?.upcoming && (timeline?.past.length ?? 0) === 0 && (
                <div className="rounded-2xl px-5 py-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.2)" }}>
                  <p className="text-sm" style={{ color: "#8FAF96" }}>
                    {t("ritual_detail.empty_no_gatherings")}
                  </p>
                  {!nextDueDate && (
                    <p className="text-sm mt-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
                      {ritual.frequency === "once"
                        ? t("ritual_detail.empty_once_hint")
                        : t("ritual_detail.empty_recurring_hint", { freq: ritual.frequency })}
                    </p>
                  )}
                </div>
              )}

              {/* Calendar sync notifications */}
              <AnimatePresence>
                {calSyncNotifs.map((m, i) => (
                  <motion.div
                    key={m.email}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={() => setCalSyncNotifs(prev => prev.filter(n => n.email !== m.email))}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer"
                    style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)" }}
                  >
                    <span className="text-xl">🌱</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{t("ritual_detail.calsync_added", { name: m.name })}</p>
                      <p className="text-xs" style={{ color: "#8FAF96" }}>{t("ritual_detail.calsync_added_detail", { name: ritual.name })}</p>
                    </div>
                    <X size={14} className="text-[#4a6b50]/50 flex-shrink-0" />
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Calendar event removed banner — owner only */}
              {isOwner && timeline?.calendarEventMissing && (
                <div className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: "rgba(196,122,101,0.1)", border: "1px solid rgba(196,122,101,0.3)" }}>
                  <span className="text-lg shrink-0">📅</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: "#C47A65" }}>{t("ritual_detail.calendar_removed_title")}</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(196,122,101,0.7)" }}>{t("ritual_detail.calendar_removed_detail")}</p>
                  </div>
                  <button
                    onClick={() => restoreCalendarMutation.mutate()}
                    disabled={restoreCalendarMutation.isPending}
                    className="shrink-0 text-xs font-medium rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
                    style={{ color: "#C47A65", border: "1px solid rgba(196,122,101,0.4)" }}
                  >
                    {restoreCalendarMutation.isPending ? t("ritual_detail.restoring") : t("ritual_detail.restore")}
                  </button>
                </div>
              )}

              {/* Upcoming gathering */}
              {timelineLoading ? (
                <div className="h-40 rounded-2xl animate-pulse" style={{ background: "#0F2818" }} />
              ) : timeline?.upcoming ? (
                <div className="rounded-2xl p-6" style={{ background: "#0F2818", border: timeline.confirmedTime ? "1px solid rgba(46,107,64,0.35)" : "1px dashed rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}>
                  {/* Date hero */}
                  <p className="text-3xl font-semibold leading-tight" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {format(parseISO(timeline.upcoming.scheduledDate), "EEEE, d MMMM")}
                  </p>
                  <p className="text-lg mt-1" style={{ color: "#C8D4C0" }}>
                    {format(parseISO(timeline.upcoming.scheduledDate), "h:mm a")}
                    {!upcomingIsPast && timeline.confirmedTime && (
                      <span className="text-sm ml-2" style={{ color: "rgba(143,175,150,0.55)" }}>
                        · {formatDistanceToNow(parseISO(timeline.upcoming.scheduledDate), { addSuffix: true })}
                      </span>
                    )}
                  </p>
                  {/* Per-meetup location (falls back to tradition-level
                      for legacy data). Suppressed for video-call
                      gatherings — the meetup location for those is the
                      meeting link itself, surfaced as a Join button. */}
                  {!meetingUrl && (timeline.upcoming.location ?? timeline.location) && (
                    <p className="text-sm mt-2" style={{ color: "#8FAF96" }}>
                      {timeline.upcoming.location ?? timeline.location}
                    </p>
                  )}
                  {meetingUrl && (
                    <button
                      type="button"
                      onClick={() => openExternal(meetingUrl)}
                      className="mt-3 w-full rounded-xl px-4 py-3 text-center font-semibold text-sm cursor-pointer transition-opacity hover:opacity-90"
                      style={{ background: "#2D5E3F", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.6)" }}
                    >
                      📹 {t("ritual_detail.join_video_call")}
                    </button>
                  )}

                  {/* Divider */}
                  <div className="my-5 h-px" style={{ background: "rgba(200,212,192,0.12)" }} />

                  {/* Status as muted text */}
                  {timeline.confirmedTime ? (
                    <div className="mb-4">
                      {timeline.upcoming.googleCalendarEventId ? (
                        <a
                          href="https://calendar.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm hover:underline"
                          style={{ color: "#8FAF96" }}
                        >
                          {t("ritual_detail.confirmed_in_google")}
                        </a>
                      ) : (
                        <p className="text-sm" style={{ color: "#8FAF96" }}>
                          {t("ritual_detail.time_confirmed")}
                        </p>
                      )}
                      {calendarSynced && (
                        <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.55)" }}>
                          {t("ritual_detail.synced")}
                        </p>
                      )}
                    </div>
                  ) : isOwner ? (
                    <div className="mb-4">
                      <p className="text-sm" style={{ color: "#8FAF96" }}>
                        {t("ritual_detail.no_time_set", { defaultValue: "No time set yet." })}
                      </p>
                    </div>
                  ) : null}

                  {/* Bottom action zone */}
                  {upcomingIsPast ? (
                    <div className="space-y-3">
                      <p className="text-sm" style={{ color: "#8FAF96" }}>
                        {t("ritual_detail.did_you_gather")}
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleLog(timeline.upcoming!.id, "skipped")}
                          disabled={loggingId !== null}
                          className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-50"
                        >
                          {t("ritual_detail.life_got_in_way")}
                        </button>
                        <button
                          onClick={() => handleLog(timeline.upcoming!.id, "completed")}
                          disabled={loggingId !== null}
                          className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50"
                        >
                          {loggingId ? t("ritual_detail.logging") : t("ritual_detail.we_gathered")}
                        </button>
                      </div>
                      {isOwner && (
                        <div className="pt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setShowSetTime(true)}
                            className="text-sm hover:underline"
                            style={{ color: "#8FAF96" }}
                          >
                            {t("ritual_detail.reschedule")}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Confirmed or pending future event */
                    isOwner && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowSetTime(true)}
                          className="text-sm hover:underline"
                          style={{ color: "#8FAF96" }}
                        >
                          {timeline.confirmedTime ? t("ritual_detail.reschedule") : t("ritual_detail.set_a_time", { defaultValue: "Set a time" })}
                        </button>
                      </div>
                    )
                  )}

                  {/* Set/change time — inline, owner only. Replaces the old
                      guest-facing scheduling-poll page. */}
                  {isOwner && showSetTime && (
                    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid rgba(200,212,192,0.12)" }}>
                      <input
                        type="datetime-local"
                        value={setTimeValue}
                        onChange={e => setSetTimeValue(e.target.value)}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowSetTime(false); setSetTimeValue(""); }}
                          className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {t("ritual_detail.cancel")}
                        </button>
                        <button
                          onClick={() => {
                            if (!setTimeValue) return;
                            confirmTimeMutation.mutate(new Date(setTimeValue).toISOString());
                          }}
                          disabled={!setTimeValue || confirmTimeMutation.isPending}
                          className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {confirmTimeMutation.isPending ? t("ritual_detail.sending") : t("ritual_detail.save", { defaultValue: "Save" })}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* No gathering scheduled yet */
                isOwner ? (
                  <div className="rounded-2xl p-6 text-center" style={{ background: "#0F2818", border: isRhythmOverdue ? "1px dashed rgba(196,122,101,0.4)" : "1px dashed rgba(46,107,64,0.3)" }}>
                    <div className="text-3xl mb-3">{isRhythmOverdue ? "🕯️" : "🤝🏽"}</div>
                    <p className="font-semibold mb-1" style={{ fontSize: "17px", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {isRhythmOverdue ? t("ritual_detail.time_to_find_time") : t("ritual_detail.no_gathering_yet")}
                    </p>
                    <p className="mx-auto mb-5" style={{ fontSize: "14px", color: "#8FAF96", maxWidth: "280px" }}>
                      {isRhythmOverdue
                        ? t("ritual_detail.overdue_owner_hint", { freq: ritual.frequency })
                        : t("ritual_detail.propose_times_hint")}
                    </p>
                    {showSetTime ? (
                      <div className="space-y-2 text-left">
                        <input
                          type="datetime-local"
                          value={setTimeValue}
                          onChange={e => setSetTimeValue(e.target.value)}
                          className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowSetTime(false); setSetTimeValue(""); }}
                            className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {t("ritual_detail.cancel")}
                          </button>
                          <button
                            onClick={() => {
                              if (!setTimeValue) return;
                              confirmTimeMutation.mutate(new Date(setTimeValue).toISOString());
                            }}
                            disabled={!setTimeValue || confirmTimeMutation.isPending}
                            className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                          >
                            {confirmTimeMutation.isPending ? t("ritual_detail.sending") : t("ritual_detail.save", { defaultValue: "Save" })}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowSetTime(true)}
                        className="inline-flex items-center gap-2 rounded-full font-medium transition-colors hover:opacity-90"
                        style={{ background: "#2D5E3F", color: "#F0EDE6", padding: "12px 24px", fontSize: "15px" }}
                      >
                        {t("ritual_detail.find_a_time")}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl p-6 text-center" style={{ background: "#0F2818", border: "1px dashed rgba(46,107,64,0.3)" }}>
                    <div className="text-3xl mb-3">🤝🏽</div>
                    <p className="font-semibold mb-1" style={{ fontSize: "17px", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {t("ritual_detail.no_gathering_yet")}
                    </p>
                    <p className="mx-auto" style={{ fontSize: "14px", color: "#8FAF96", maxWidth: "280px" }}>
                      {t("ritual_detail.organizer_will_schedule")}
                    </p>
                  </div>
                )
              )}

              {/* Past gatherings */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {t("ritual_detail.history")}
                  </h2>
                  <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
                </div>
                {(!timeline || timeline.past.length === 0) ? (
                  <p className="text-center py-8" style={{ fontSize: "14px", color: "#8FAF96" }}>
                    {t("ritual_detail.history_will_grow")}
                  </p>
                ) : (
                  <div className="relative space-y-4">
                    <div className="absolute left-5 top-0 bottom-0 w-px" style={{ background: "linear-gradient(to bottom, transparent, rgba(46,107,64,0.45), transparent)" }} />
                    {timeline.past.map((meetup, idx) => {
                      const prevMeetup = timeline.past[idx + 1] ?? null;
                      const daysBetween = prevMeetup && meetup.status === "completed" && prevMeetup.status === "completed"
                        ? differenceInDays(parseISO(meetup.scheduledDate), parseISO(prevMeetup.scheduledDate))
                        : null;
                      return (
                        <div key={meetup.id} className="flex items-start gap-4 pl-1">
                          <div className="relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 shadow-sm mt-1" style={{ borderColor: "rgba(46,107,64,0.2)", background: "#0F2818" }}>
                            {meetup.status === "completed" ? (
                              <CheckCircle2 size={16} style={{ color: "#4A9E84" }} />
                            ) : (
                              <XCircle size={16} style={{ color: "rgba(143,175,150,0.4)" }} />
                            )}
                          </div>
                          <div className="flex-1 rounded-2xl p-4 min-w-0" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.25)" }}>
                            <div className="flex items-start justify-between flex-wrap gap-2">
                              <div>
                                <p className="font-medium text-sm" style={{ color: "#F0EDE6" }}>
                                  {format(parseISO(meetup.scheduledDate), "EEEE, d MMMM")}
                                </p>
                                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                                  {format(parseISO(meetup.scheduledDate), "h:mm a · yyyy")}
                                </p>
                                {daysBetween !== null && (
                                  <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.45)" }}>
                                    {t("ritual_detail.days_since_previous", { count: daysBetween })}
                                  </p>
                                )}
                              </div>
                              <span
                                className="text-xs px-2.5 py-0.5 rounded-full font-medium shrink-0"
                                style={meetup.status === "completed"
                                  ? { background: "rgba(74,158,132,0.08)", color: "#4A9E84", border: "1px solid rgba(74,158,132,0.2)" }
                                  : { background: "rgba(92,122,95,0.05)", color: "rgba(143,175,150,0.5)", border: "1px solid rgba(46,107,64,0.15)" }
                                }
                              >
                                {meetup.status === "completed" ? t("ritual_detail.gathered") : t("ritual_detail.missed")}
                              </span>
                            </div>
                            {meetup.notes && (
                              <p className="text-sm mt-2 italic" style={{ color: "#8FAF96" }}>{meetup.notes}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "moments" && (
            <motion.div
              key="moments"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Start shared practice CTA */}
              <Link
                href={`/moment/new?ritualId=${ritualId}`}
                className="flex items-center justify-between p-5 rounded-2xl transition-colors group"
                style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
              >
                <div>
                  <p className="font-semibold text-foreground">{t("ritual_detail.start_shared_practice")}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {t("ritual_detail.shared_practice_desc")}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 ml-4 group-hover:bg-primary/20 transition-colors">
                  <Plus size={18} className="text-primary" />
                </div>
              </Link>

              {/* Streak rule note */}
              <p className="text-xs text-muted-foreground italic text-center px-4">
                {t("ritual_detail.streak_rule_note")}
              </p>

              {/* Moments list */}
              {momentsLoading && (
                <div className="space-y-3">
                  {[1, 2].map(i => <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: "#0F2818" }} />)}
                </div>
              )}

              {!momentsLoading && momentsData && momentsData.moments.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">🌿</div>
                  <p className="font-medium text-foreground mb-1">{t("ritual_detail.no_practices_yet")}</p>
                  <p className="text-sm text-muted-foreground">{t("ritual_detail.no_practices_hint")}</p>
                </div>
              )}

              {!momentsLoading && momentsData?.moments.map((m: SharedMoment) => {
                const stateMeta = STATE_META[m.state] ?? STATE_META.active;
                const loggingIcon = LOGGING_ICONS[m.loggingType] ?? "🌿";
                const [hh, mm] = m.scheduledTime.split(":").map(Number);
                const timeLabel = new Date(0, 0, 0, hh, mm).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

                return (
                  <div key={m.id} className="rounded-2xl p-5 space-y-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-lg">{loggingIcon}</span>
                          <h3 className="font-semibold text-foreground">{m.name}</h3>
                          <span className={clsx("text-xs px-2 py-0.5 rounded-full border font-medium", stateMeta.style)}>
                            {stateMeta.label}
                          </span>
                          {m.windowOpen && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium animate-pulse" style={{ background: "rgba(196,122,101,0.1)", border: "1px solid rgba(196,122,101,0.3)", color: "#C47A65" }}>
                              {t("ritual_detail.window_open_now")}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--color-sage)] italic leading-relaxed line-clamp-2">{m.intention}</p>
                      </div>
                      <div className="text-center flex-shrink-0">
                        <p className="text-2xl font-bold text-primary leading-none">{m.currentStreak}</p>
                        <p className="text-xs text-muted-foreground">{t("ritual_detail.streak")}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{m.frequency} · {timeLabel}</span>
                      <span>{t("ritual_detail.blooms_count", { count: m.totalBlooms })} · {t("ritual_detail.goal_days", { count: m.goalDays })}</span>
                    </div>

                    {m.windowOpen && (
                      <div className="pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {m.todayPostCount >= 2
                              ? "🌸 " + t("ritual_detail.window_counts", { count: m.todayPostCount })
                              : m.todayPostCount === 1
                              ? "🌿 " + t("ritual_detail.window_one_showed_up")
                              : t("ritual_detail.window_none_yet")}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}

          {activeTab === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl p-6 space-y-6"
              style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}
            >
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">{t("ritual_detail.gathering_name_label")}</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none bg-background"
                  />
                ) : (
                  <div className="px-4 py-3 rounded-xl bg-background border border-transparent text-foreground">{ritual.name}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-foreground">{t("ritual_detail.intention_label")}</label>
                {isEditing ? (
                  <textarea
                    value={editIntention}
                    onChange={(e) => setEditIntention(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none min-h-[100px] bg-background"
                  />
                ) : (
                  <div className="px-4 py-3 rounded-xl bg-background border border-transparent min-h-[100px] whitespace-pre-wrap text-muted-foreground italic text-sm">
                    {ritual.intention || t("ritual_detail.no_intention_yet")}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border flex justify-between items-center">
                {isEditing ? (
                  <>
                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">{t("ritual_detail.cancel")}</button>
                    <button
                      onClick={handleSaveSettings}
                      disabled={updateMutation.isPending}
                      className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      {t("ritual_detail.save_changes")}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors"
                  >
                    {t("ritual_detail.edit_details")}
                  </button>
                )}
              </div>

              {/* Members — read-only membership display */}
              {true && (
                <div className="pt-6 border-t border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-foreground">{t("ritual_detail.members")}</h3>
                  </div>
                  <div className="space-y-2">
                    {ritual.participants.map((p: { name: string; email: string }) => {
                      const isMe = p.email.toLowerCase() === user?.email?.toLowerCase();
                      const isRemoving = removingEmail === p.email;
                      return (
                        <div key={p.email} className="flex items-center justify-between py-1.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium shrink-0">
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm text-foreground truncate">{p.name}{isMe ? t("ritual_detail.you_suffix") : ""}</p>
                              <p className="text-xs text-muted-foreground/60 truncate">{p.email}</p>
                            </div>
                          </div>
                          {!isMe && isOwner && (
                            isRemoving ? (
                              <div className="flex items-center gap-2 shrink-0 ml-2">
                                <button
                                  onClick={async () => {
                                    setRemovingPending(true);
                                    try {
                                      await apiRequest("DELETE", `/api/rituals/${ritualId}/participants/${encodeURIComponent(p.email)}`);
                                      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
                                      queryClient.invalidateQueries({ queryKey: ["/api/rituals"] });
                                      setRemovingEmail(null);
                                    } catch { /* ignore */ }
                                    setRemovingPending(false);
                                  }}
                                  disabled={removingPending}
                                  className="text-xs font-medium text-rose-600 hover:text-rose-700 transition-colors"
                                >
                                  {removingPending ? t("ritual_detail.removing") : t("ritual_detail.confirm")}
                                </button>
                                <button
                                  onClick={() => setRemovingEmail(null)}
                                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  {t("ritual_detail.cancel")}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setRemovingEmail(p.email)}
                                className="shrink-0 ml-2 text-xs text-muted-foreground/50 hover:text-rose-500 transition-colors px-2 py-1"
                                title={t("ritual_detail.remove_member", { name: p.name })}
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

              {user?.id === ritual.ownerId && (
                <div className="pt-8 border-t border-border/20">
                  <h3 className="font-medium mb-2" style={{ color: "#8FAF96" }}>{t("ritual_detail.archive_heading")}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {t("ritual_detail.archive_desc")}
                  </p>
                  <button
                    onClick={() => {
                      if (window.confirm(t("ritual_detail.archive_confirm"))) {
                        deleteMutation.mutate({ id: ritualId }, {
                          onSuccess: () => {
                            queryClient.invalidateQueries({ queryKey: [`/api/rituals`] });
                            setLocation("/dashboard");
                          }
                        });
                      }
                    }}
                    className="px-4 py-2 rounded-xl font-medium transition-colors"
                    style={{ background: "rgba(46,107,64,0.12)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.25)" }}
                  >
                    {t("ritual_detail.archive_button")}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </Layout>
  );
}
