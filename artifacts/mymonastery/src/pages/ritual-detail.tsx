import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { format, parseISO, formatDistanceToNow, isPast, addDays, differenceInDays, isFuture } from "date-fns";
import { CheckCircle2, XCircle, Settings, Sprout, Flower2, Plus, UserPlus, X, Copy, Link2, Calendar } from "lucide-react";
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

type Tab = "timeline" | "moments" | "settings";

const LOGGING_ICONS: Record<string, string> = {
  photo: "📷",
  reflection: "✍🏽",
  both: "📷✍🏽",
  checkin: "✅",
};

const STATE_META: Record<string, { label: string; style: string }> = {
  active: { label: "Active", style: "bg-[#1A3D2B] text-[#8FAF96] border-[#2D5E3F]" },
  needs_water: { label: "Needs tending", style: "bg-[#3D2A10] text-[#C47A65] border-[#5A3D18]" },
  dormant: { label: "Dormant", style: "bg-secondary text-muted-foreground border-border" },
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

interface TimeSuggestion {
  id: number;
  suggestedByEmail: string;
  suggestedByName: string | null;
  suggestedTime: string;
  note: string | null;
  createdAt: string;
}

function getStatusMeta(status: string) {
  switch (status) {
    case "on_track":   return { label: "Blooming",      style: "bg-[#1A3D2B] text-[#8FAF96] border-[#2D5E3F]" };
    case "overdue":    return { label: "Needs tending", style: "bg-[#3D2A10] text-[#C47A65] border-[#5A3D18]" };
    default:           return { label: null,             style: "" };
  }
}

export default function RitualDetail() {
  const [, params] = useRoute("/ritual/:id");
  const [, setLocation] = useLocation();
  const ritualId = parseInt(params?.id || "0", 10);
  const { data: ritual, isLoading } = useGetRitual(ritualId);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();

  const deleteMutation = useDeleteRitual();
  const updateMutation = useUpdateRitual();

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
  const [editAllowMemberInvites, setEditAllowMemberInvites] = useState(true);

  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [calendarSynced, setCalendarSynced] = useState(false);
  const [loggingId, setLoggingId] = useState<number | null>(null);
  const [rsvp, setRsvp] = useState<"going" | "not-going" | null>(null);

  // ── Invite sheet state ─────────────────────────────────────────────────────
  const [showInviteSheet, setShowInviteSheet] = useState(false);
  const [inviteEmailInput, setInviteEmailInput] = useState("");
  const [inviteQueue, setInviteQueue] = useState<Array<{ name: string; email: string }>>([]);
  const [inviteConnections, setInviteConnections] = useState<Array<{ name: string; email: string }>>([]);
  const [invitedEmails, setInvitedEmails] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // ── Calendar sync state ────────────────────────────────────────────────────
  const [calSyncNotifs, setCalSyncNotifs] = useState<Array<{ name: string; email: string }>>([]);
  const [calSyncedEmails, setCalSyncedEmails] = useState<Set<string>>(new Set());
  const [declinedEmails, setDeclinedEmails] = useState<Set<string>>(new Set());

  // ── Suggest time state (non-creator members) ───────────────────────────────
  const [showSuggestTime, setShowSuggestTime] = useState(false);
  const [suggestDateTime, setSuggestDateTime] = useState("");
  const [suggestNote, setSuggestNote] = useState("");
  const [suggestSent, setSuggestSent] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (ritual && !isEditing) {
      setEditName(ritual.name);
      setEditIntention(ritual.intention || "");
      // allowMemberInvites is not in the generated Ritual type; read via cast.
      const ami = (ritual as unknown as { allowMemberInvites?: boolean }).allowMemberInvites;
      setEditAllowMemberInvites(ami ?? true);
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
      toast({ variant: "destructive", title: "Could not load timeline" });
    } finally {
      setTimelineLoading(false);
    }
  }, [ritualId]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  // Load RSVP preference from localStorage when meetup changes
  useEffect(() => {
    if (timeline?.upcoming?.id) {
      const stored = localStorage.getItem(`rsvp-meetup-${timeline.upcoming.id}`);
      setRsvp((stored as "going" | "not-going" | null) ?? null);
    }
  }, [timeline?.upcoming?.id]);

  const handleRsvp = (choice: "going" | "not-going") => {
    if (!timeline?.upcoming?.id) return;
    localStorage.setItem(`rsvp-meetup-${timeline.upcoming.id}`, choice);
    setRsvp(choice);
  };

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
        ? "Gathering logged. Your tradition grows stronger. 🌱"
        : "Noted — it happens. Phoebe will keep watch.";
      toast({ title: msg });
      await fetchTimeline();
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals`] });
    } catch {
      toast({ variant: "destructive", title: "Could not log gathering" });
    } finally {
      setLoggingId(null);
    }
  };

  // Calendar sync removed — no longer needed

  // ── Invite sheet: fetch connections when opened ───────────────────────────
  useEffect(() => {
    if (!showInviteSheet || !ritualId) return;
    fetch(`/api/rituals/${ritualId}/connections`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data: { connections: Array<{ name: string; email: string }> } | null) => {
        if (data) setInviteConnections(data.connections);
      })
      .catch(() => null);
  }, [showInviteSheet, ritualId]);

  const joinLink = `${window.location.origin}/join/${(ritual as any)?.scheduleToken ?? ""}`;

  const handleAddEmailToQueue = () => {
    const email = inviteEmailInput.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (inviteQueue.some(p => p.email.toLowerCase() === email.toLowerCase())) return;
    setInviteQueue(prev => [...prev, { name: email.split("@")[0], email }]);
    setInviteEmailInput("");
  };

  const handleRemoveFromQueue = (email: string) => {
    setInviteQueue(prev => prev.filter(p => p.email !== email));
  };

  const handleQuickInvite = async (name: string, email: string) => {
    if (invitedEmails.has(email.toLowerCase())) return;
    try {
      const res = await fetch(`/api/rituals/${ritualId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ participants: [{ name, email }] }),
      });
      if (res.ok) {
        setInvitedEmails(prev => new Set([...prev, email.toLowerCase()]));
        queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
      }
    } catch { /* ignore */ }
  };

  const handleSendInvites = async () => {
    const all = [...inviteQueue];
    if (all.length === 0) { setShowInviteSheet(false); return; }
    setInviting(true);
    try {
      const res = await fetch(`/api/rituals/${ritualId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ participants: all }),
      });
      if (res.ok) {
        const data: { added: Array<{ name: string; email: string }> } = await res.json();
        const newEmails = new Set(data.added.map(p => p.email.toLowerCase()));
        setInvitedEmails(prev => new Set([...prev, ...newEmails]));
        setInviteQueue([]);
        setShowInviteSheet(false);
        toast({ title: `${data.added.length} invitation${data.added.length !== 1 ? "s" : ""} sent 🌱` });
        queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
      }
    } catch {
      toast({ variant: "destructive", title: "Could not send invitations" });
    } finally {
      setInviting(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const handleSaveSettings = async () => {
    try {
      // allowMemberInvites isn't in the generated schema yet — send via
      // apiRequest directly so the backend can pick it up from req.body.
      await apiRequest("PUT", `/api/rituals/${ritualId}`, {
        name: editName,
        intention: editIntention,
        allowMemberInvites: editAllowMemberInvites,
      });
      setIsEditing(false);
      toast({ title: "Changes saved" });
      queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] });
    } catch {
      toast({ variant: "destructive", title: "Could not save changes" });
    }
  };

  // ── Calendar restore ────────────────────────────────────────────────────────
  const restoreCalendarMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/rituals/${ritualId}/restore-calendar`, {}),
    onSuccess: () => {
      toast({ title: "Calendar event restored 🗓️" });
      fetchTimeline();
    },
    onError: () => toast({ variant: "destructive", title: "Could not restore calendar event" }),
  });

  // ── Time suggestions (creator view) ────────────────────────────────────────
  const isOwner = !!(ritual && user && ritual.ownerId === user.id);

  const { data: suggestionsData, refetch: refetchSuggestions } = useQuery<{ suggestions: TimeSuggestion[] }>({
    queryKey: [`/api/rituals/${ritualId}/suggestions`],
    queryFn: () => apiRequest("GET", `/api/rituals/${ritualId}/suggestions`),
    enabled: isOwner && activeTab === "timeline",
  });

  const suggestTimeMutation = useMutation({
    mutationFn: (payload: { suggestedTime: string; note?: string }) =>
      apiRequest("POST", `/api/rituals/${ritualId}/suggest-time`, payload),
    onSuccess: () => {
      setSuggestSent(true);
      setShowSuggestTime(false);
      setSuggestDateTime("");
      setSuggestNote("");
    },
    onError: () => toast({ variant: "destructive", title: "Could not send suggestion" }),
  });

  const dismissSuggestionMutation = useMutation({
    mutationFn: (suggestionId: number) =>
      apiRequest("DELETE", `/api/rituals/${ritualId}/suggestions/${suggestionId}`, {}),
    onSuccess: () => refetchSuggestions(),
  });

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

  if (!ritual) return <Layout><div className="pt-20 text-center text-muted-foreground">Tradition not found.</div></Layout>;

  const statusMeta = getStatusMeta(ritual.status);
  const upcomingDate = timeline?.upcoming ? new Date(timeline.upcoming.scheduledDate) : null;
  const upcomingIsPast = upcomingDate ? isPast(upcomingDate) : false;

  // ── Rhythm health ────────────────────────────────────────────────────────────
  const lastCompletedMeetup = timeline?.past.find(m => m.status === "completed") ?? null;
  const isOneTime = ritual.frequency === "once";
  const rhythmDays = ritual.frequency === "biweekly" ? 14 : ritual.frequency === "monthly" ? 30 : 7;
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
                  {ritual.frequency === "once"
                    ? "One-time"
                    : ritual.frequency === "biweekly"
                    ? "Biweekly"
                    : ritual.frequency.charAt(0).toUpperCase() + ritual.frequency.slice(1)}
                </span>
                {(ritual as any).createdAt && (
                  <span className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
                    Together since {format(parseISO((ritual as any).createdAt), "MMMM yyyy")}
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
                  ritual.frequency === "biweekly" ? "biweekly" :
                  ritual.frequency === "weekly" ? "weekly" :
                  ritual.frequency === "monthly" ? "monthly" :
                  ritual.frequency;
                const timesMet = (timeline?.past ?? []).filter(m => m.status === "completed").length;
                const metLabel =
                  timesMet === 0 ? "not met yet" :
                  timesMet === 1 ? "met 1 time" :
                  `met ${timesMet} times`;
                return (
                  <p className="mt-1.5 text-xs" style={{ color: "rgba(143,175,150,0.65)" }}>
                    {isOnce ? "A one-time gathering" : `A ${freqWord} tradition`} · {metLabel}
                  </p>
                );
              })()}
              {timeline?.location && (
                <p className="mt-2 text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>📍 {timeline.location}</p>
              )}
            </div>

            {/* Member names + Add people */}
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <div className="flex flex-wrap items-center gap-1.5">
                {ritual.participants.slice(0, 3).map((p, i) => {
                  const isPending = invitedEmails.has(p.email.toLowerCase()) || false;
                  return (
                    <Link
                      key={i}
                      href={`/people/${encodeURIComponent(p.email)}`}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:bg-[#4A6741]/10"
                      style={{
                        border: "1px solid rgba(46,107,64,0.35)",
                        background: isPending ? "rgba(200,212,192,0.08)" : "rgba(74,103,65,0.12)",
                        color: isPending ? "#8FAF96" : "#C8D4C0",
                      }}
                      title={p.email}
                    >
                      {p.name || p.email.split("@")[0]}
                    </Link>
                  );
                })}
                {ritual.participants.length > 3 && (
                  <span className="text-xs font-medium px-2 py-1.5 rounded-full" style={{ color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}>
                    +{ritual.participants.length - 3} more
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowInviteSheet(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:bg-[#4A6741]/5"
                style={{ border: "1px solid rgba(46,107,64,0.35)", color: "#8FAF96", fontSize: "13px" }}
              >
                <UserPlus size={12} />
                Add people
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-full mb-5" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.35)", boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)" }}>
          {[
            { id: "timeline", label: "🤝🏽 Gatherings" },
            { id: "moments", label: "🙏🏽 Practices" },
            { id: "settings", label: "About" },
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
                    No gatherings logged yet. Start with one and build from there.
                  </p>
                  {!nextDueDate && (
                    <p className="text-sm mt-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
                      {ritual.frequency === "once"
                        ? "Pick a date and place to make this gathering real."
                        : `Commit to a ${ritual.frequency} rhythm by scheduling your first gathering.`}
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
                      <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{m.name} was added from your calendar</p>
                      <p className="text-xs" style={{ color: "#8FAF96" }}>They've been added to {ritual.name}.</p>
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
                    <p className="text-sm font-medium" style={{ color: "#C47A65" }}>Your calendar event was removed</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(196,122,101,0.7)" }}>Phoebe can restore it to your Google Calendar.</p>
                  </div>
                  <button
                    onClick={() => restoreCalendarMutation.mutate()}
                    disabled={restoreCalendarMutation.isPending}
                    className="shrink-0 text-xs font-medium rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
                    style={{ color: "#C47A65", border: "1px solid rgba(196,122,101,0.4)" }}
                  >
                    {restoreCalendarMutation.isPending ? "Restoring…" : "Restore"}
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
                  {/* Per-meetup location (falls back to tradition-level for legacy data) */}
                  {(timeline.upcoming.location ?? timeline.location) && (
                    <p className="text-sm mt-2" style={{ color: "#8FAF96" }}>
                      {timeline.upcoming.location ?? timeline.location}
                    </p>
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
                          Confirmed in Google Calendar
                        </a>
                      ) : (
                        <p className="text-sm" style={{ color: "#8FAF96" }}>
                          Time confirmed
                        </p>
                      )}
                      {calendarSynced && (
                        <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.55)" }}>
                          Synced
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mb-4">
                      <p className="text-sm" style={{ color: "#8FAF96" }}>
                        Waiting for everyone to respond
                      </p>
                      <p className="text-xs mt-1" style={{ color: "rgba(143,175,150,0.55)" }}>
                        Members can respond via their invite link.
                      </p>
                    </div>
                  )}

                  {/* Bottom action zone */}
                  {upcomingIsPast ? (
                    <div className="space-y-3">
                      <p className="text-sm" style={{ color: "#8FAF96" }}>
                        Did you gather?
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleLog(timeline.upcoming!.id, "skipped")}
                          disabled={loggingId !== null}
                          className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-50"
                        >
                          Life got in the way
                        </button>
                        <button
                          onClick={() => handleLog(timeline.upcoming!.id, "completed")}
                          disabled={loggingId !== null}
                          className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 shadow-sm transition-all disabled:opacity-50"
                        >
                          {loggingId ? "Logging…" : "We gathered ✓"}
                        </button>
                      </div>
                      {isOwner && (
                        <div className="pt-2 flex justify-end">
                          <Link
                            href={`/ritual/${ritualId}/schedule`}
                            className="text-sm hover:underline"
                            style={{ color: "#8FAF96" }}
                          >
                            Reschedule
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : timeline.confirmedTime ? (
                    /* Fixed future event — RSVP */
                    <div>
                      <p className="text-sm mb-2.5" style={{ color: "#8FAF96" }}>Will you be there?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRsvp("going")}
                          className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            rsvp === "going"
                              ? "bg-[#6B8F71] border-[#6B8F71] text-white shadow-sm"
                              : "border-border text-muted-foreground hover:border-[#6B8F71]/60 hover:text-[#6B8F71]"
                          }`}
                        >
                          I'll be there ✓
                        </button>
                        <button
                          onClick={() => handleRsvp("not-going")}
                          className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                            rsvp === "not-going"
                              ? "border-destructive/50 text-destructive"
                              : "border-border text-muted-foreground hover:border-destructive/40 hover:text-destructive"
                          }`}
                          style={rsvp === "not-going" ? { background: "rgba(196,122,101,0.12)" } : {}}
                        >
                          I can't make it
                        </button>
                      </div>
                      {rsvp && (
                        <p className="text-xs text-center mt-2" style={{ color: "rgba(143,175,150,0.6)" }}>
                          {rsvp === "going" ? "See you there" : "Noted. We'll keep meeting."}
                        </p>
                      )}
                      {isOwner && (
                        <div className="pt-4 flex justify-end">
                          <Link
                            href={`/ritual/${ritualId}/schedule`}
                            className="text-sm hover:underline"
                            style={{ color: "#8FAF96" }}
                          >
                            Reschedule
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Flexible pending event */
                    isOwner && (
                      <div className="flex items-center justify-end gap-5">
                        <Link
                          href={`/ritual/${ritualId}/schedule`}
                          className="text-sm hover:underline"
                          style={{ color: "#8FAF96" }}
                        >
                          Change options
                        </Link>
                        <Link
                          href={`/ritual/${ritualId}/schedule`}
                          className="text-sm hover:underline"
                          style={{ color: "#8FAF96" }}
                        >
                          Reschedule
                        </Link>
                      </div>
                    )
                  )}
                </div>
              ) : (
                /* No gathering scheduled yet */
                isOwner ? (
                  <div className="rounded-2xl p-6 text-center" style={{ background: "#0F2818", border: isRhythmOverdue ? "1px dashed rgba(196,122,101,0.4)" : "1px dashed rgba(46,107,64,0.3)" }}>
                    <div className="text-3xl mb-3">{isRhythmOverdue ? "🕯️" : "🤝🏽"}</div>
                    <p className="font-semibold mb-1" style={{ fontSize: "17px", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      {isRhythmOverdue ? "It's time to find a time" : "No gathering scheduled yet"}
                    </p>
                    <p className="mx-auto mb-5" style={{ fontSize: "14px", color: "#8FAF96", maxWidth: "280px" }}>
                      {isRhythmOverdue
                        ? `You're past your ${ritual.frequency} rhythm. Propose a few options and let everyone weigh in.`
                        : "Propose a few times and let your people respond. Phoebe will send calendar invites once you confirm."}
                    </p>
                    <Link
                      href={`/ritual/${ritualId}/schedule`}
                      className="inline-flex items-center gap-2 rounded-full font-medium transition-colors hover:opacity-90"
                      style={{ background: "#2D5E3F", color: "#F0EDE6", padding: "12px 24px", fontSize: "15px" }}
                    >
                      Find a time →
                    </Link>
                  </div>
                ) : (
                  <div className="rounded-2xl p-6 text-center" style={{ background: "#0F2818", border: "1px dashed rgba(46,107,64,0.3)" }}>
                    <div className="text-3xl mb-3">🤝🏽</div>
                    <p className="font-semibold mb-1" style={{ fontSize: "17px", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                      No gathering scheduled yet
                    </p>
                    <p className="mx-auto" style={{ fontSize: "14px", color: "#8FAF96", maxWidth: "280px" }}>
                      The organizer will schedule the next gathering soon.
                    </p>
                  </div>
                )
              )}

              {/* Suggest a time — non-owner members */}
              {!isOwner && ritual && (
                <div className="rounded-2xl p-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.2)" }}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>Propose a time</p>
                    {suggestSent && (
                      <span className="text-xs" style={{ color: "#6B8F71" }}>Sent ✓</span>
                    )}
                  </div>
                  <p className="text-xs mb-3" style={{ color: "#8FAF96" }}>
                    Let {ritual.name.split(" ")[0] || "the organizer"} know when you're free — they'll see your suggestion.
                  </p>
                  {showSuggestTime ? (
                    <div className="space-y-2">
                      <input
                        type="datetime-local"
                        value={suggestDateTime}
                        onChange={e => setSuggestDateTime(e.target.value)}
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                      />
                      <input
                        type="text"
                        value={suggestNote}
                        onChange={e => setSuggestNote(e.target.value)}
                        placeholder="Add a note (optional)"
                        className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setShowSuggestTime(false); setSuggestDateTime(""); setSuggestNote(""); }}
                          className="flex-1 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (!suggestDateTime) return;
                            suggestTimeMutation.mutate({
                              suggestedTime: new Date(suggestDateTime).toISOString(),
                              note: suggestNote.trim() || undefined,
                            });
                          }}
                          disabled={!suggestDateTime || suggestTimeMutation.isPending}
                          className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {suggestTimeMutation.isPending ? "Sending…" : "Send suggestion"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowSuggestTime(true); setSuggestSent(false); }}
                      className="w-full py-2 rounded-xl border border-dashed border-primary/40 text-sm text-primary hover:bg-primary/5 transition-colors"
                    >
                      + Suggest a time
                    </button>
                  )}
                </div>
              )}

              {/* Time suggestions — owner only */}
              {isOwner && suggestionsData && suggestionsData.suggestions.length > 0 && (
                <div className="rounded-2xl p-4" style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.2)" }}>
                  <p className="text-sm font-semibold mb-3" style={{ color: "#F0EDE6" }}>
                    When your people are free
                  </p>
                  <div className="space-y-3">
                    {suggestionsData.suggestions.map(s => (
                      <div key={s.id} className="flex items-start gap-3 pb-3 border-b border-border/50 last:border-0 last:pb-0">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
                          {(s.suggestedByName ?? s.suggestedByEmail).charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">
                            {s.suggestedByName ?? s.suggestedByEmail}
                          </p>
                          <p className="text-sm text-foreground mt-0.5">
                            {new Date(s.suggestedTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                            {" · "}
                            {new Date(s.suggestedTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </p>
                          {s.note && <p className="text-xs text-muted-foreground mt-0.5 italic">"{s.note}"</p>}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Link
                            href={`/ritual/${ritualId}/schedule`}
                            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                          >
                            Use this
                          </Link>
                          <button
                            onClick={() => dismissSuggestionMutation.mutate(s.id)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Past gatherings */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                    history
                  </h2>
                  <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
                </div>
                {(!timeline || timeline.past.length === 0) ? (
                  <p className="text-center py-8" style={{ fontSize: "14px", color: "#8FAF96" }}>
                    Your history will grow here.
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
                                    {daysBetween} days since previous
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
                                {meetup.status === "completed" ? "Gathered ✓" : "Missed"}
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
                  <p className="font-semibold text-foreground">Start a shared practice</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    A recurring practice everyone in this tradition commits to together.
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 ml-4 group-hover:bg-primary/20 transition-colors">
                  <Plus size={18} className="text-primary" />
                </div>
              </Link>

              {/* Streak rule note */}
              <p className="text-xs text-muted-foreground italic text-center px-4">
                The streak blooms when at least two of you practice together.
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
                  <p className="font-medium text-foreground mb-1">No shared practices yet</p>
                  <p className="text-sm text-muted-foreground">Start a shared practice to begin.</p>
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
                              Window open now
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-[var(--color-sage)] italic leading-relaxed line-clamp-2">{m.intention}</p>
                      </div>
                      <div className="text-center flex-shrink-0">
                        <p className="text-2xl font-bold text-primary leading-none">{m.currentStreak}</p>
                        <p className="text-xs text-muted-foreground">streak</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{m.frequency} · {timeLabel}</span>
                      <span>{m.totalBlooms} bloom{m.totalBlooms !== 1 ? "s" : ""} · {m.goalDays}-day goal</span>
                    </div>

                    {m.windowOpen && (
                      <div className="pt-3 border-t border-border/50">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {m.todayPostCount >= 2
                              ? `🌸 ${m.todayPostCount} showed up — this window counts`
                              : m.todayPostCount === 1
                              ? "🌿 1 person showed up — waiting for more"
                              : "No one has shown up yet today"}
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
                <label className="block text-sm font-medium mb-2 text-foreground">Gathering Name</label>
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
                <label className="block text-sm font-medium mb-2 text-foreground">Intention</label>
                {isEditing ? (
                  <textarea
                    value={editIntention}
                    onChange={(e) => setEditIntention(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border focus:border-primary focus:ring-1 focus:ring-primary outline-none min-h-[100px] bg-background"
                  />
                ) : (
                  <div className="px-4 py-3 rounded-xl bg-background border border-transparent min-h-[100px] whitespace-pre-wrap text-muted-foreground italic text-sm">
                    {ritual.intention || "No intention set yet."}
                  </div>
                )}
              </div>

              {/* Invite permissions toggle — owner only */}
              {isOwner && (
                <div className="pt-4 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">Members can invite</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Allow any member to invite new people</p>
                    </div>
                    <button
                      onClick={() => {
                        const next = !editAllowMemberInvites;
                        setEditAllowMemberInvites(next);
                        // Save immediately — no need to enter full edit mode for a toggle
                        apiRequest("PUT", `/api/rituals/${ritualId}`, {
                          name: editName,
                          intention: editIntention,
                          allowMemberInvites: next,
                        })
                          .then(() => queryClient.invalidateQueries({ queryKey: [`/api/rituals/${ritualId}`] }))
                          .catch(() => {
                            setEditAllowMemberInvites(!next); // revert on failure
                            toast({ variant: "destructive", title: "Could not save setting" });
                          });
                      }}
                      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
                      style={{
                        background: editAllowMemberInvites ? "rgba(74,103,65,0.7)" : "rgba(255,255,255,0.12)",
                        border: "1px solid rgba(46,107,64,0.4)",
                      }}
                    >
                      <span
                        className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform"
                        style={{ transform: editAllowMemberInvites ? "translateX(22px)" : "translateX(3px)" }}
                      />
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-border flex justify-between items-center">
                {isEditing ? (
                  <>
                    <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                    <button
                      onClick={handleSaveSettings}
                      disabled={updateMutation.isPending}
                      className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                      Save Changes
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-2 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-secondary/80 transition-colors"
                  >
                    Edit Details
                  </button>
                )}
              </div>

              {/* Members — owner always sees this; non-owners see it when allowMemberInvites is on */}
              {(user?.id === ritual.ownerId || editAllowMemberInvites) && (
                <div className="pt-6 border-t border-border/40">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-foreground">Members</h3>
                    <button
                      onClick={() => setShowInviteSheet(true)}
                      className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
                      style={{ background: "rgba(74,103,65,0.18)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.35)" }}
                    >
                      + Add people
                    </button>
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
                              <p className="text-sm text-foreground truncate">{p.name}{isMe ? " (you)" : ""}</p>
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
                                  {removingPending ? "Removing…" : "Confirm"}
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
                                onClick={() => setRemovingEmail(p.email)}
                                className="shrink-0 ml-2 text-xs text-muted-foreground/50 hover:text-rose-500 transition-colors px-2 py-1"
                                title={`Remove ${p.name}`}
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
                  <h3 className="font-medium mb-2" style={{ color: "#8FAF96" }}>Archive this gathering</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    This will archive the gathering and remove it from your dashboard.
                  </p>
                  <button
                    onClick={() => {
                      if (window.confirm("Are you sure you want to archive this gathering?")) {
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
                    Archive gathering
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Invite bottom sheet ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showInviteSheet && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowInviteSheet(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-background rounded-t-3xl z-50 max-h-[85vh] overflow-y-auto"
            >
              <div className="px-6 pt-5 pb-8 max-w-lg mx-auto">
                {/* Handle */}
                <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5" />

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold">Invite to {ritual.name} 🌱</h2>
                  <button onClick={() => setShowInviteSheet(false)} className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    <X size={16} />
                  </button>
                </div>

                {/* Section 1: Existing connections */}
                {inviteConnections.length > 0 && (
                  <div className="mb-6">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Already in Phoebe with you</p>
                    <div className="space-y-2">
                      {inviteConnections.map(c => {
                        const already = ritual.participants.some(p => p.email.toLowerCase() === c.email.toLowerCase());
                        const justInvited = invitedEmails.has(c.email.toLowerCase());
                        return (
                          <div key={c.email} className="flex items-center gap-3 p-3 rounded-2xl bg-secondary/50">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">
                              {c.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                            </div>
                            {already ? (
                              <span className="text-xs text-muted-foreground whitespace-nowrap">Already here ✓</span>
                            ) : justInvited ? (
                              <span className="text-xs text-[#4a6b50] font-medium whitespace-nowrap">Invited ✓</span>
                            ) : (
                              <button
                                onClick={() => handleQuickInvite(c.name, c.email)}
                                className="text-xs font-medium text-[#4a6b50] border border-[#6B8F71]/50 rounded-full px-3 py-1 hover:bg-[#6B8F71]/10 transition-colors whitespace-nowrap"
                              >
                                Invite →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Section 2: Email invite */}
                <div className="mb-6">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Invite someone new</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={inviteEmailInput}
                      onChange={e => setInviteEmailInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddEmailToQueue()}
                      placeholder="name@example.com"
                      className="flex-1 px-4 py-2.5 rounded-2xl border border-border focus:border-[#6B8F71] outline-none bg-secondary/30 text-sm"
                    />
                    <button
                      onClick={handleAddEmailToQueue}
                      className="px-4 py-2.5 rounded-2xl bg-[#6B8F71] text-white text-sm font-medium hover:bg-[#5a7a60] transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {inviteQueue.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {inviteQueue.map(p => (
                        <span key={p.email} className="flex items-center gap-1.5 px-3 py-1 bg-[#6B8F71]/10 border border-[#6B8F71]/30 rounded-full text-sm text-[#4a6b50]">
                          {p.email}
                          <button onClick={() => handleRemoveFromQueue(p.email)} className="text-[#4a6b50]/50 hover:text-[#4a6b50]">
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 3: Share link */}
                <div className="mb-8">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Or share a link</p>
                  <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-2xl">
                    <Link2 size={14} className="text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-muted-foreground truncate flex-1">{joinLink}</span>
                    <button
                      onClick={handleCopyLink}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-background border border-border text-xs font-medium hover:bg-secondary transition-colors flex-shrink-0"
                    >
                      <Copy size={12} />
                      {copiedLink ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                {/* Send invites button */}
                <button
                  onClick={handleSendInvites}
                  disabled={inviting || inviteQueue.length === 0}
                  className="w-full py-4 bg-[#6B8F71] text-white rounded-2xl font-semibold text-base hover:bg-[#5a7a60] transition-all disabled:opacity-50"
                >
                  {inviting ? "Sending…" : `Send invites 🌱${inviteQueue.length > 0 ? ` (${inviteQueue.length})` : ""}`}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Layout>
  );
}
