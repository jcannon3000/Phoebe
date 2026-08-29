import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useLocation, useSearch, Link } from "wouter";
import { parseISO, format, isToday, addDays, startOfDay, startOfWeek, endOfWeek, addWeeks } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
// Communities are now available to all users
import { Layout } from "@/components/layout";
import { ScrollStrip } from "@/components/ScrollStrip";
import { CommunityRuleCard } from "@/components/CommunityRuleCard";
import { CommunitySeasonCard } from "@/components/CommunitySeasonCard";
import { apiRequest } from "@/lib/queryClient";
import { openExternal } from "@/lib/openExternal";
import { isNativeShell } from "@/lib/isNativeShell";
import { Plus, Users, MessageCircle, X, Settings, Copy, Check, RefreshCw, Sparkles, Heart, MessageSquareText, ChevronRight } from "lucide-react";
import { useCommunityAdminToggle, useBetaStatus } from "@/hooks/useDemo";
import { MomentCard, type Moment } from "@/pages/dashboard";

const FONT = "'Space Grotesk', sans-serif";


type Group = {
  id: number; name: string; description: string | null; slug: string; emoji: string | null; createdAt: string;
  // Only present for admin viewers — the shareable community-wide invite
  // token. Used by the "Share invite link" modal.
  inviteToken?: string | null;
  // ── Prayer Circle (beta) ───────────────────────────────────────────────
  // When `isPrayerCircle` is true we surface the stated `intention` above
  // the regular community content and render the "Praying today" section
  // on the Home tab. Non-circle groups leave these null and render exactly
  // as before.
  isPrayerCircle?: boolean;
  intention?: string | null;
  circleDescription?: string | null;
  // ── Contemplation community (beta) ──────────────────────────────────────
  // When `focus === "contemplation"` the Home tab swaps the office/practice
  // feed for a shared contemplation goal + the CAC meditation the community
  // reflects on together. Null on standard, office-shaped communities.
  focus?: string | null;
  contemplationGoalMinutes?: number | null;
};
type Member = {
  id: number; name: string | null; email: string; role: string; joinedAt: string | null; pending?: boolean; avatarUrl?: string | null; isBeta?: boolean;
};
type PrayerRequest = {
  id: number; body: string; ownerName: string | null; ownerAvatarUrl: string | null; wordCount: number;
  isOwnRequest: boolean; isAnonymous: boolean; createdAt: string;
};
type Gathering = {
  id: number; name: string; description: string | null; template: string | null;
  rhythm?: string | null;
  frequency?: string | null;
  dayPreference?: string | null;
  nextMeetupDate?: string | null;
  nextMeetupId?: number | null;
  location?: string | null;
  // Set when the gathering is a video call rather than in-person.
  // Drives the "📹 Video call" tag + "Join video call" button.
  meetingUrl?: string | null;
};
// One intention card in a prayer circle. The GET /api/groups/:slug response
// carries an `intentions` array (non-archived, sorted). We render each as its
// own card on the community home tab and surface them through the daily bell.
type Intention = {
  id: number;
  title: string;
  description: string | null;
  createdByUserId: number;
  createdAt: string;
};


// ─── This community's public prayers ────────────────────────────────────────
// Owner: "add the public prayers of the community — like the prayer list page,
// but just for this community." Reads the same feed the community's prayer
// surfaces already use (/groups/:slug/prayer-requests), which is scoped to the
// group server-side, so nothing outside this community can appear here.
type GroupPrayer = {
  id: number;
  body: string;
  isAnonymous?: boolean | null;
  createdByName?: string | null;
  ownerDisplayName?: string | null;
  createdAt?: string | null;
};
function CommunityPrayersSection({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<{ requests: GroupPrayer[] }>({
    queryKey: [`/api/groups/${slug}/prayer-requests`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/prayer-requests`),
    staleTime: 60_000,
  });
  const prayers = data?.requests ?? [];
  // Hidden only while LOADING. It used to hide when empty too, which meant a
  // community with no prayers yet showed no section at all — indistinguishable
  // from the feature not being there, and the first thing the owner asked was
  // "where are the prayers?". An empty section that names itself is findable;
  // a hidden one is not.
  if (isLoading) return null;
  const nameFor = (p: GroupPrayer) =>
    p.isAnonymous ? t("community_detail.prayer_anon", { defaultValue: "Someone" })
      : (p.ownerDisplayName || p.createdByName || t("community_detail.prayer_anon", { defaultValue: "Someone" }));
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(143,175,150,0.6)", fontFamily: FONT, margin: 0 }}>
        {t("community_detail.prayers_heading", { defaultValue: "🕊️ What we're praying for" })}
      </p>
      {prayers.length === 0 && (
        <p style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, fontSize: 13.5, lineHeight: 1.5, margin: 0, padding: "10px 2px" }}>
          {t("community_detail.prayers_empty", { defaultValue: "No prayers shared here yet. When someone in this community shares one, it appears here for everyone to pray." })}
        </p>
      )}
      {prayers.map((p) => (
        <div
          key={p.id}
          style={{ background: "rgba(9,26,16,0.297)", border: "1px solid rgba(46,107,64,0.38)", borderRadius: 16, padding: "14px 16px" }}
        >
          <p style={{ color: "#F0EDE6", fontFamily: FONT, fontSize: 15, lineHeight: 1.5, margin: 0, whiteSpace: "pre-line" }}>{p.body}</p>
          <p style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, fontSize: 12.5, margin: "6px 0 0" }}>{nameFor(p)}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Events ─────────────────────────────────────────────────────────────────
// Owner: "then have an events section with cards." A community's gatherings,
// soonest first — the server already sorts them that way and computes
// nextMeetupDate, so this only has to render it.
type GroupEvent = {
  id: number;
  name: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  nextMeetupDate?: string | null;
};
function CommunityEventsSection({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [, setLoc] = useLocation();
  const { data, isLoading } = useQuery<{ gatherings: GroupEvent[] }>({
    queryKey: [`/api/groups/${slug}/gatherings`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/gatherings`),
    staleTime: 60_000,
  });
  /**
   * The SERVICE SCHEDULE belongs here too.
   *
   * Reported: "services are not showing." They were — behind the Services
   * tile — but this section read only /gatherings, which is one-off gatherings.
   * For a parish the standing Sunday schedule IS the calendar, so a church with
   * two Sunday services and no gatherings saw "Nothing on the calendar yet"
   * next to a Services tab listing both. Same endpoint the Services tab uses,
   * so the two can't disagree.
   */
  const { data: schedData, isLoading: schedLoading } = useQuery<{ schedule: ServiceScheduleRecord | null }>({
    queryKey: ["/api/groups", slug, "service-schedule"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/service-schedule`),
    staleTime: 60_000,
  });
  const schedule = schedData?.schedule ?? null;
  const events = data?.gatherings ?? [];
  if (isLoading || schedLoading) return null;
  const dayName = dowNames(t).find((d) => d.value === schedule?.dayOfWeek)?.label ?? "";
  const whenLabel = (iso?: string | null) => {
    if (!iso) return t("community_detail.event_no_date", { defaultValue: "No date set" });
    try {
      return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    } catch { return ""; }
  };
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(143,175,150,0.6)", fontFamily: FONT, margin: 0 }}>
        {t("community_detail.events_heading", { defaultValue: "📅 Events" })}
      </p>
      {schedule && (schedule.times?.length ?? 0) > 0 && (
        <div style={{ background: "rgba(9,26,16,0.297)", border: "1px solid rgba(46,107,64,0.38)", borderRadius: 16, padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0, color: "#F0EDE6", fontFamily: FONT, fontSize: 16, fontWeight: 700 }}>
              {schedule.name}
            </span>
            <span style={{ flexShrink: 0, color: "rgba(168,197,160,0.9)", fontFamily: FONT, fontSize: 12.5, fontWeight: 600 }}>
              {dayName}
            </span>
          </div>
          {schedule.times.map((tm, i) => (
            <div key={i} style={{ display: "flex", gap: 12, marginTop: 6 }}>
              <span style={{ color: "#F0EDE6", fontFamily: FONT, fontSize: 13.5, fontWeight: 600, minWidth: 78 }}>{tm.time}</span>
              <span style={{ color: "rgba(143,175,150,0.8)", fontFamily: FONT, fontSize: 13.5 }}>
                {tm.label}{tm.location || schedule.location ? ` · ${tm.location || schedule.location}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
      {events.length === 0 && !schedule && (
        <p style={{ color: "rgba(143,175,150,0.7)", fontFamily: FONT, fontSize: 13.5, lineHeight: 1.5, margin: 0, padding: "10px 2px" }}>
          {t("community_detail.events_empty", { defaultValue: "Nothing on the calendar yet." })}
        </p>
      )}
      {events.map((ev) => (
        <button
          key={ev.id}
          type="button"
          onClick={() => setLoc(`/ritual/${ev.id}`)}
          className="w-full text-left transition-opacity hover:opacity-90"
          style={{ background: "rgba(9,26,16,0.297)", border: "1px solid rgba(46,107,64,0.38)", borderRadius: 16, padding: "14px 16px", cursor: "pointer" }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ flex: 1, minWidth: 0, color: "#F0EDE6", fontFamily: FONT, fontSize: 16, fontWeight: 700 }}>{ev.name}</span>
            <span style={{ flexShrink: 0, color: "rgba(168,197,160,0.9)", fontFamily: FONT, fontSize: 12.5, fontWeight: 600 }}>{whenLabel(ev.nextMeetupDate)}</span>
          </div>
          {(ev.location || ev.description) && (
            <p style={{ color: "rgba(143,175,150,0.72)", fontFamily: FONT, fontSize: 13, lineHeight: 1.45, margin: "6px 0 0" }}>
              {ev.location || ev.description}
            </p>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Service schedule (e.g. Sunday Services) ────────────────────────────────
// One per group. Rendered inside the Gatherings tab: members see a list of
// service times, admins can edit them.

type ServiceTimeRow = { label: string; time: string; location: string };
type ServiceScheduleRecord = {
  id: number;
  groupId: number;
  name: string;
  // Schedule-level location (e.g. "Phoebe Chapel, 12 Elm St"). Shown on
  // the dashboard card's rotating second line; admins set it in the
  // edit form below. Per-time `location` still wins when it's set on a
  // specific service.
  location: string | null;
  dayOfWeek: number;
  times: Array<{ label: string; time: string; location?: string }>;
  updatedAt: string;
};

function dowNames(t: (k: string) => string): Array<{ value: number; label: string }> {
  return [
    { value: 0, label: t("community_detail.day_sunday") },
    { value: 1, label: t("community_detail.day_monday") },
    { value: 2, label: t("community_detail.day_tuesday") },
    { value: 3, label: t("community_detail.day_wednesday") },
    { value: 4, label: t("community_detail.day_thursday") },
    { value: 5, label: t("community_detail.day_friday") },
    { value: 6, label: t("community_detail.day_saturday") },
  ];
}

function formatHM12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  let h = parseInt(m[1], 10);
  const mm = m[2];
  const suffix = h >= 12 ? "PM" : "AM";
  h = ((h + 11) % 12) + 1;
  return `${h}:${mm} ${suffix}`;
}

function ServicesSection({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery<{ schedule: ServiceScheduleRecord | null; canEdit: boolean }>({
    queryKey: ["/api/groups", slug, "service-schedule"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/service-schedule`),
    enabled: !!slug,
  });
  const schedule = data?.schedule ?? null;

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("Sunday Services");
  const [location, setLocation] = useState("");
  const [dow, setDow] = useState(0);
  const [times, setTimes] = useState<ServiceTimeRow[]>([]);

  // Reset form from server state whenever we enter edit mode.
  useEffect(() => {
    if (!editing) return;
    if (schedule) {
      setName(schedule.name);
      setLocation(schedule.location ?? "");
      setDow(schedule.dayOfWeek);
      setTimes(schedule.times.map(row => ({ label: row.label ?? "", time: row.time, location: row.location ?? "" })));
    } else {
      setName("Sunday Services");
      setLocation("");
      setDow(0);
      setTimes([{ label: "", time: "10:00", location: "" }]);
    }
  }, [editing, schedule]);

  const saveMutation = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/groups/${slug}/service-schedule`, {
      name: name.trim() || "Sunday Services",
      // Send empty string as null so the DB clears any previous value.
      location: location.trim().length > 0 ? location.trim() : null,
      dayOfWeek: dow,
      times: times
        .filter(row => /^\d{1,2}:\d{2}$/.test(row.time))
        .map(row => ({
          label: row.label.trim(),
          time: row.time,
          ...(row.location.trim() ? { location: row.location.trim() } : {}),
        })),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/groups", slug, "service-schedule"] });
      qc.invalidateQueries({ queryKey: ["/api/me/service-schedules"] });
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/groups/${slug}/service-schedule`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/groups", slug, "service-schedule"] });
      qc.invalidateQueries({ queryKey: ["/api/me/service-schedules"] });
      setEditing(false);
    },
  });

  const dayLabel = dowNames(t).find(d => d.value === (schedule?.dayOfWeek ?? 0))?.label ?? t("community_detail.day_sunday");

  // Non-editing view — hide entirely when there's nothing to show and the
  // user can't edit. Admins see the empty-state "add" button.
  if (!editing) {
    if (!schedule && !isAdmin) return null;
    return (
      <div className="mb-4 rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)" }}>
        <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.55)" }}>
              {t("community_detail.day_schedule", { day: dayLabel })}
            </p>
            <p className="text-base font-semibold mt-0.5" style={{ color: "#F0EDE6" }}>
              ⛪ {schedule?.name ?? t("community_detail.sunday_services")}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 text-[11px] font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full"
              style={{ background: "rgba(111,175,133,0.18)", color: "#C8D4C0", border: "1px solid rgba(111,175,133,0.3)" }}
            >
              {schedule ? t("community_detail.edit") : t("community_detail.add")}
            </button>
          )}
        </div>
        {schedule && schedule.times.length > 0 ? (
          <ul className="px-4 pb-3 flex flex-col gap-1.5">
            {schedule.times.map((row, i) => (
              <li key={i} className="text-sm flex items-baseline justify-between gap-3" style={{ color: "#C8D4C0" }}>
                <span className="tabular-nums font-semibold" style={{ color: "#F0EDE6", minWidth: 84 }}>
                  {formatHM12(row.time)}
                </span>
                <span className="flex-1 truncate">
                  {row.label || t("community_detail.service")}
                  {row.location ? <span style={{ color: "#8FAF96" }}> · 📍 {row.location}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-3 text-sm" style={{ color: "#8FAF96" }}>
            {isAdmin ? t("community_detail.no_service_times_admin") : t("community_detail.no_service_times")}
          </p>
        )}
      </div>
    );
  }

  // Editing view — admin only; guarded above via `isAdmin` check on entry.
  return (
    <div className="mb-4 rounded-xl p-4" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{t("community_detail.service_schedule")}</p>
        <button onClick={() => setEditing(false)} aria-label={t("community_detail.close")}>
          <X size={16} style={{ color: "#8FAF96" }} />
        </button>
      </div>
      <label className="block text-[11px] font-semibold uppercase mb-1" style={{ color: "rgba(200,212,192,0.55)", letterSpacing: "0.08em" }}>
        {t("community_detail.name")}
      </label>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full px-3 py-2 mb-3 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
        style={{ color: "#F0EDE6" }}
      />
      <label className="block text-[11px] font-semibold uppercase mb-1" style={{ color: "rgba(200,212,192,0.55)", letterSpacing: "0.08em" }}>
        {t("community_detail.location")}
      </label>
      <input
        type="text"
        value={location}
        onChange={e => setLocation(e.target.value)}
        placeholder={t("community_detail.location_placeholder")}
        className="w-full px-3 py-2 mb-3 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
        style={{ color: "#F0EDE6" }}
      />
      <label className="block text-[11px] font-semibold uppercase mb-1" style={{ color: "rgba(200,212,192,0.55)", letterSpacing: "0.08em" }}>
        {t("community_detail.day_of_week")}
      </label>
      <select
        value={dow}
        onChange={e => setDow(parseInt(e.target.value, 10))}
        className="w-full px-3 py-2 mb-3 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
        style={{ color: "#F0EDE6", background: "#091A10" }}
      >
        {dowNames(t).map(d => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>
      <label className="block text-[11px] font-semibold uppercase mb-1" style={{ color: "rgba(200,212,192,0.55)", letterSpacing: "0.08em" }}>
        {t("community_detail.service_times")}
      </label>
      <div className="flex flex-col gap-2 mb-2">
        {times.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              value={row.time}
              onChange={e => {
                const v = e.target.value;
                setTimes(prev => prev.map((r, idx) => idx === i ? { ...r, time: v } : r));
              }}
              className="px-2 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm tabular-nums"
              style={{ color: "#F0EDE6", minWidth: 110 }}
            />
            <input
              type="text"
              value={row.label}
              onChange={e => {
                const v = e.target.value;
                setTimes(prev => prev.map((r, idx) => idx === i ? { ...r, label: v } : r));
              }}
              placeholder={t("community_detail.label_optional")}
              className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
            />
            <button
              type="button"
              onClick={() => setTimes(prev => prev.filter((_, idx) => idx !== i))}
              aria-label={t("community_detail.remove_time")}
              className="shrink-0 rounded-full p-1.5"
              style={{ background: "rgba(200,212,192,0.08)", color: "#C8D4C0" }}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setTimes(prev => [...prev, { label: "", time: "10:00", location: "" }])}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold mb-3"
        style={{ background: "rgba(111,175,133,0.18)", color: "#C8D4C0", border: "1px solid rgba(111,175,133,0.3)" }}
      >
        <Plus size={12} /> {t("community_detail.add_time")}
      </button>
      <div className="flex items-center gap-3">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || times.length === 0}
          className="px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {saveMutation.isPending ? t("community_detail.saving") : t("community_detail.save")}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs"
          style={{ color: "#9a9390" }}
        >
          {t("community_detail.cancel")}
        </button>
        {schedule && (
          <button
            onClick={() => {
              if (confirm(t("community_detail.delete_schedule_confirm"))) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="ml-auto text-xs"
            style={{ color: "#C47A65" }}
          >
            {deleteMutation.isPending ? t("community_detail.deleting") : t("community_detail.delete")}
          </button>
        )}
      </div>
    </div>
  );
}


// Daily-reflection entry card — beta-only. Surfaces today's source
// (CAC Daily Reflection or Forward Day by Day) + how many community
// members have already posted a reflection, and routes to
// /communities/:slug/reflection on tap. When the community hasn't
// picked a source yet, we still render the card for admins (with a
// "Pick a source" sub) so they have a discoverable doorway in;
// non-admin members see nothing until the source is set.
function ReflectionEntryCard({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const today = (() => new Date().toLocaleDateString("en-CA"))();
  const { data } = useQuery<{
    source: "cac" | "fdd" | null;
    memberCount: number;
    isAdmin: boolean;
    reflections: { id: number }[];
  }>({
    queryKey: [`/api/groups/${slug}/reflections`, today],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/reflections?date=${today}`),
  });
  if (!data) return null;
  // Source-off + non-admin viewer → hide the card entirely so the
  // community page doesn't show an empty-looking module to people
  // who can't act on it.
  if (!data.source && !data.isAdmin) return null;

  const sourceLabel = data.source === "fdd"
    ? "Forward Day by Day"
    : data.source === "cac"
      ? "CAC Daily Reflection"
      : null;
  const emoji = data.source === "fdd" ? "📖" : "🌵";
  const count = data.reflections.length;
  return (
    <div
      onClick={() => setLocation(`/communities/${slug}/reflection`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setLocation(`/communities/${slug}/reflection`);
        }
      }}
      className="relative flex rounded-xl overflow-hidden cursor-pointer mb-3"
      style={{
        background: "rgba(46,107,64,0.10)",
        border: "1px solid rgba(46,107,64,0.30)",
      }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: "#5C8A5F" }} />
      <div className="flex-1 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>{emoji}</span>
          <div className="flex-1 min-w-0">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(143,175,150,0.6)" }}
            >
              {t("community_detail.todays_reflection")}
              <span
                className="ml-2 inline-flex items-center px-1.5 py-0 rounded-full text-[8px]"
                style={{
                  background: "rgba(46,107,64,0.25)",
                  color: "#A8C5A0",
                  letterSpacing: "0.1em",
                }}
              >
                {t("community_detail.beta")}
              </span>
            </p>
            <p
              className="text-sm font-semibold mt-0.5"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {sourceLabel ?? t("community_detail.pick_daily_reflection")}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "#8FAF96" }}>
              {data.source
                ? (count === 0
                    ? t("community_detail.no_reflections_today")
                    : t("community_detail.reflections_shared", { count }))
                : t("community_detail.choose_reflection_source")}
            </p>
          </div>
          <span className="text-sm shrink-0" style={{ color: "#8FAF96" }}>→</span>
        </div>
      </div>
    </div>
  );
}

// Sunday-service reflection entry card — beta-only. Pinned to the most
// recent Sunday, the card surfaces "how many of your community have
// reflected this week" and routes to /communities/:slug/sunday-reflection
// on tap. Hidden for non-admin members when the feature isn't enabled;
// admins still see it (with a "Turn on in settings" sub) so they have a
// discoverable way in.
function SundayReflectionEntryCard({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { data } = useQuery<{
    enabled: boolean;
    sunday: string;
    memberCount: number;
    isAdmin: boolean;
    reflections: { id: number }[];
  }>({
    queryKey: [`/api/groups/${slug}/sunday-reflection`],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/sunday-reflection`),
  });
  if (!data) return null;
  if (!data.enabled && !data.isAdmin) return null;
  const count = data.reflections.length;
  return (
    <div
      onClick={() => setLocation(`/communities/${slug}/sunday-reflection`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setLocation(`/communities/${slug}/sunday-reflection`);
        }
      }}
      className="relative flex rounded-xl overflow-hidden cursor-pointer mb-3"
      style={{
        background: "rgba(62,124,122,0.10)",
        border: "1px solid rgba(62,124,122,0.30)",
      }}
    >
      <div className="w-1 flex-shrink-0" style={{ background: "#3E7C7A" }} />
      <div className="flex-1 px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>⛪</span>
          <div className="flex-1 min-w-0">
            <p
              className="text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: "rgba(143,175,150,0.6)" }}
            >
              {t("community_detail.this_sundays_service")}
              <span
                className="ml-2 inline-flex items-center px-1.5 py-0 rounded-full text-[8px]"
                style={{
                  background: "rgba(46,107,64,0.25)",
                  color: "#A8C5A0",
                  letterSpacing: "0.1em",
                }}
              >
                {t("community_detail.beta")}
              </span>
            </p>
            <p
              className="text-sm font-semibold mt-0.5"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {data.enabled ? t("community_detail.reflect_with_community") : t("community_detail.turn_on_sunday_reflections")}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "#8FAF96" }}>
              {data.enabled
                ? (count === 0
                    ? t("community_detail.no_reflections_week")
                    : t("community_detail.reflections_shared_week", { count }))
                : t("community_detail.send_sunday_invitation")}
            </p>
          </div>
          <span className="text-sm shrink-0" style={{ color: "#8FAF96" }}>→</span>
        </div>
      </div>
    </div>
  );
}

// an auto-scroll ticker so the pills stay legible instead of wrapping or
// clipping. Mirrors the dashboard's ServiceTimesPillRow verbatim so the
// card looks identical to the one on the home screen.
// Day-of-week short label for a gathering's upcoming slot, matching the
// dashboard's `nextDayLabel` so the home tab and community tab read the
// same way. Returns "Today" / "Tomorrow" / "Wednesday" etc.
function gatheringDayLabel(date: Date, t: (k: string, opts?: Record<string, unknown>) => string): string {
  if (isToday(date)) return t("community_detail.day_today");
  const now = new Date();
  const tomorrow = addDays(startOfDay(now), 1);
  if (startOfDay(date).getTime() === tomorrow.getTime()) return t("community_detail.day_tomorrow");
  // Weeks are Sun→Sat. If the date falls in *this* week (after today),
  // use the bare weekday — "Friday" reads as "this coming Friday."
  const thisWeekEnd = endOfWeek(now);
  if (date <= thisWeekEnd) {
    return format(date, "EEEE");
  }
  // Next calendar week — prefix with "Next" so a Wednesday five days
  // out from Friday reads "Next Wednesday" rather than ambiguous.
  const nextWeekStart = startOfWeek(addWeeks(now, 1));
  const nextWeekEnd = endOfWeek(addWeeks(now, 1));
  if (date >= nextWeekStart && date <= nextWeekEnd) {
    return t("community_detail.day_next_weekday", { weekday: format(date, "EEEE") });
  }
  // Two or more weeks out — bare weekday is ambiguous (which Wednesday?),
  // so fall back to a short date like "Wed, Jun 3".
  return format(date, "EEE, MMM d");
}

// Mirror of dashboard.tsx#computeNextGatheringDate — keeps the community
// home in lockstep with the user home so the same Wednesday Meal renders
// the same pill in both places.
function computeNextGatheringDate(g: Gathering): Date | null {
  if (g.nextMeetupDate) {
    try { return parseISO(g.nextMeetupDate); } catch { /* fall through */ }
  }
  if (!g.dayPreference) return null;
  let anchor: Date;
  try { anchor = parseISO(g.dayPreference); } catch { return null; }
  if (!Number.isFinite(anchor.getTime())) return null;

  const now = new Date();
  if (anchor.getTime() > now.getTime()) return anchor;

  const cadence = (g.rhythm || g.frequency || "weekly").toLowerCase();
  const stepDays = cadence === "monthly" ? null
    : cadence === "biweekly" || cadence === "fortnightly" ? 14
    : cadence === "one-time" || cadence === "once" ? 0
    : 7;
  if (stepDays === 0) return anchor;

  const out = new Date(anchor);
  if (stepDays === null) {
    while (out.getTime() <= now.getTime()) out.setMonth(out.getMonth() + 1);
  } else {
    const diffMs = now.getTime() - out.getTime();
    const periods = Math.ceil(diffMs / (stepDays * 24 * 60 * 60 * 1000));
    out.setDate(out.getDate() + periods * stepDays);
    if (out.getTime() <= now.getTime()) out.setDate(out.getDate() + stepDays);
  }
  return out;
}

// Sunday Service-style card for a single community gathering. Same palette,
// same accent bar, same time pill as ServiceCard on the home dashboard.
// The eyebrow slot is used for the rhythm label ("Weekly tradition" etc.)
// so the card stays legible even when the title is long.
function CommunityGatheringCard({
  g,
  onOpen,
}: {
  g: Gathering;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  // Inside a community page every gathering already belongs to the
  // community whose name is in the header — a top-right eyebrow with
  // the same community name would render the community's emoji twice.
  // Home dashboard's GatheringCard still uses it, because there the
  // community context isn't implicit.
  //
  // No title emoji prefix either — tradition-new bakes the template
  // emoji into the name when the creator doesn't type a custom one
  // ("🍽️ Meal"). A prefix would double it.

  // Location is intentionally omitted from the card — same reasoning as
  // the home dashboard's GatheringCard: the community eyebrow (or here,
  // the community header) already gives the venue context, and the
  // detail modal carries the full address.
  const next = computeNextGatheringDate(g);
  const timeLabel = next ? `${gatheringDayLabel(next, t)} · ${format(next, "h:mm a")}` : null;
  const isVideoGathering = typeof g.meetingUrl === "string" && !!g.meetingUrl.trim();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="block w-full text-left"
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex rounded-xl overflow-hidden cursor-pointer transition-shadow"
        style={{
          background: "rgba(111,175,133,0.15)",
          border: "1px solid rgba(111,175,133,0.35)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        <div className="w-1 flex-shrink-0" style={{ background: "#6FAF85" }} />
        <div className="flex-1 px-4 pt-3 pb-3 min-w-0">
          <span className="text-base font-semibold truncate block" style={{ color: "#F0EDE6" }}>
            {g.name}
          </span>

          {timeLabel && (
            <div className="mt-2 text-xs font-medium" style={{ color: "#C8D4C0", letterSpacing: "-0.01em" }}>
              {timeLabel}
            </div>
          )}
          {isVideoGathering && (
            <div className="mt-1 text-[11px] font-medium" style={{ color: "rgba(143,175,150,0.85)" }}>
              📹 {t("community_detail.video_call")}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Community gathering detail modal ──────────────────────────────────────
// Mirrors ServiceDetailModal / GatheringDetailModal on the home dashboard:
// tapping a gathering card pops this up with name, next time, location,
// and description. Read-only — admins reach the settings page (manage
// shares, delete) via the gear icon in the top right.
function CommunityGatheringDetailModal({
  g,
  groupName,
  groupEmoji,
  isAdmin,
  onClose,
}: {
  g: Gathering;
  groupName: string;
  groupEmoji: string | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  // Communities the gathering is shared with (for the read-only chips).
  type ShareRow = { id: number; name: string; slug: string; emoji: string | null };
  const shareQ = useQuery<{ primary: ShareRow | null; additional: ShareRow[] }>({
    queryKey: [`/api/rituals/${g.id}/groups`],
    queryFn: () => apiRequest("GET", `/api/rituals/${g.id}/groups`),
  });
  const next = computeNextGatheringDate(g);
  const dateLabel = next
    ? (isToday(next) ? t("community_detail.day_today") : format(next, "EEEE, MMM d"))
    : null;
  const timeLabel = next ? format(next, "h:mm a") : null;
  // Video-call gathering — show a "Join video call" button instead of
  // a location line (the meetup location for a video gathering is the
  // link itself, so the raw-URL location line is suppressed).
  const meetingUrl = (typeof g.meetingUrl === "string" && g.meetingUrl.trim()) ? g.meetingUrl.trim() : null;
  const locationLabel = meetingUrl ? null : (g.location ?? null);
  const description = (g.description ?? "") as string;

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
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.55)" }}>
                {groupEmoji ?? "⛪"} {groupName}
              </p>
              <h2 className="text-xl font-bold mt-1 break-words" style={{ color: "#F0EDE6", letterSpacing: "-0.01em" }}>
                {g.name}
              </h2>
              {dateLabel && (
                <p className="text-sm mt-0.5" style={{ color: "#8FAF96" }}>{dateLabel}</p>
              )}
            </div>
            <div className="shrink-0 flex items-center gap-1.5">
              <button
                onClick={onClose}
                aria-label={t("community_detail.close")}
                className="rounded-full p-1.5 transition-opacity hover:opacity-80"
                style={{ background: "rgba(200,212,192,0.08)", color: "#C8D4C0" }}
              >
                <X size={16} />
              </button>
            </div>
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
                {meetingUrl && (
                  <p className="text-[12px] mt-0.5" style={{ color: "#8FAF96" }}>📹 {t("community_detail.video_call")}</p>
                )}
              </div>
            )}
            {!timeLabel && locationLabel && (
              <p className="text-sm" style={{ color: "#C8D4C0" }}>📍 {locationLabel}</p>
            )}
            {/* Join button — video-call gatherings. Opens the meeting
                link via SFSafariViewController on iOS / a new tab on web. */}
            {meetingUrl && (
              <button
                type="button"
                onClick={() => openExternal(meetingUrl)}
                className="rounded-xl px-4 py-3 text-center font-semibold text-sm cursor-pointer transition-opacity hover:opacity-90"
                style={{ background: "#2D5E3F", color: "#F0EDE6", border: "1px solid rgba(46,107,64,0.6)" }}
              >
                📹 {t("community_detail.join_video_call")}
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

            {/* Read-only "Shared with" chips so any member can see who
                else holds this gathering. Editing happens on the
                settings page (gear icon in the header) — admins only. */}
            {(shareQ.data?.additional?.length ?? 0) > 0 && (
              <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(200,212,192,0.12)" }}>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.14em] mb-2"
                  style={{ color: "rgba(200,212,192,0.55)" }}
                >
                  {t("community_detail.shared_with")}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(shareQ.data?.additional ?? []).map((row) => (
                    <span
                      key={row.id}
                      className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1 rounded-full"
                      style={{
                        background: "rgba(46,107,64,0.18)",
                        border: "1px solid rgba(46,107,64,0.4)",
                        color: "#F0EDE6",
                        fontFamily: FONT,
                      }}
                    >
                      {row.emoji ?? "⛪"} {row.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ServiceTimesPillRow({ schedule }: { schedule: ServiceScheduleRecord }) {
  const { t } = useTranslation();
  // "<Month D> — <time>" when the community only has one service time on
  // their schedule; "<Month D> — Tap to See All Service Times" when there
  // are multiple. Single-service churches were getting an awkward "tap to
  // see all" teaser that promised more than the schedule actually had.
  if (schedule.times.length === 0) return null;
  const now = new Date();
  const diff = (schedule.dayOfWeek - now.getDay() + 7) % 7;
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + diff);
  const dateLabel = nextDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  // Single-service: render the time directly. If a label is present
  // ("Sunday Service", etc.) we omit it in this collapsed home-tab
  // pill so the line stays compact — the dedicated Gatherings tab is
  // where the full label + location shows. Times come back in 24h
  // "HH:MM" form; format with the same `formatHM12` helper the
  // Gatherings list uses so the rendering is consistent.
  const trailing = schedule.times.length === 1
    ? formatHM12(schedule.times[0].time)
    : t("community_detail.tap_to_see_all_times");
  return (
    <div className="mt-2 text-xs font-medium" style={{ color: "#F0EDE6", letterSpacing: "-0.01em" }}>
      <span style={{ color: "#C8D4C0" }}>{dateLabel}</span>
      <span style={{ color: "rgba(200,212,192,0.6)" }}> — </span>
      <span>{trailing}</span>
    </div>
  );
}

export default function CommunityDetailPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const communitiesEnabled = true;
  const queryClient = useQueryClient();

  // Allow deep-linking to a specific tab via `?tab=members` etc. — lets
  // Community Settings "Edit Members" drop the viewer straight on the list.
  const search = useSearch();
  const initialTab = (() => {
    const tabParam = new URLSearchParams(search).get("tab");
    // General groups land on a simple "hub" of tiles (Members · Services)
    // rather than a home-screen clone. Only the surviving sections are
    // deep-linkable; any other ?tab= value falls back to the hub — which now
    // includes the retired "practices" and "involved" tabs (owner), so old
    // links to those land on the hub instead of a blank page.
    return (["hub", "gatherings", "members", "feed"] as const)
      .find((k) => k === tabParam) ?? "hub";
  })();
  const [activeTab, setActiveTab] = useState<"hub" | "prayer" | "gatherings" | "members" | "feed">(initialTab);

  // Strip the legacy `?welcome=1` query param if it's still in the URL
  // (older links). The dedicated post-signup community welcome overlay
  // was removed — the onboarding flow's final "Welcome." fade is the
  // only welcoming moment we need now.
  useEffect(() => {
    if (new URLSearchParams(search).get("welcome") === "1") {
      window.history.replaceState({}, "", `/communities/${slug}`);
    }
  }, [search, slug]);

  const [showInvite, setShowInvite] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // Admin-only floating action button (bottom-right) — moved here from the
  // home dashboard. Lets a community admin start a practice, fast,
  // event, or prayer feed scoped to *this* community.
  const [fabOpen, setFabOpen] = useState(false);
  // ── Prayer Circle — "Praying today" add form state ────────────────────
  // Members can add what they are carrying in prayer today. The form is
  // collapsed by default; when `showFocusForm` is true we reveal a type
  // chooser + subject input. Only shown on circle groups.
  const [showFocusForm, setShowFocusForm] = useState(false);
  const [focusType, setFocusType] = useState<"situation" | "cause" | "custom">("situation");
  const [focusSubject, setFocusSubject] = useState("");
  // ── Gathering details modal ────────────────────────────────────────────
  // Tapping a gathering card opens a lightweight pop-up with time / location /
  // description — same UX pattern as the Sunday Service modal. We do NOT
  // navigate to a dedicated /ritual/:id page.
  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data: groupData } = useQuery<{ group: Group; myRole: string; memberCount?: number; members: Member[]; intentions?: Intention[] }>({
    queryKey: ["/api/groups", slug],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: !!user && !!slug,
  });


  // ── Prayer Feed (beta) — the "standing intercessions" entry point ──────
  // A group's prayer feed is what holds its non-rotating intercessions
  // (the "parish prayer list" experience). Feeds are a beta-only surface
  // today, so this whole section is gated on rawIsBeta below. Reuses the
  // same feed-list endpoint the member-facing feed card would use — there
  // just isn't a member-facing card wired up yet, only this admin entry point.
  const { data: feedData, isLoading: feedLoading } = useQuery<{
    feeds: Array<{ feedId: number; feedSlug: string; feedTitle: string; feedCoverEmoji: string | null; subscriberCount: number }>;
  }>({
    queryKey: ["/api/groups", slug, "prayer-feeds"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/prayer-feeds`),
    enabled: !!user && !!slug && activeTab === "feed",
  });
  const [newFeedTitle, setNewFeedTitle] = useState("");
  const createFeedMutation = useMutation({
    mutationFn: () => apiRequest<{ feed: { slug: string } }>("POST", "/api/prayer-feeds", {
      title: newFeedTitle.trim(),
      initialGroupSlug: slug,
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "prayer-feeds"] });
      setLocation(`/prayer-feeds/${result.feed.slug}/manage`);
    },
  });


  // ── Admin "new arrival" popup ──────────────────────────────────────────
  // Fetches any new-member / new-prayer-request events this admin hasn't
  // acknowledged yet. Shown as a celebratory popup over the page on mount
  // (and on tab refocus, since the query refetches). Exactly once per admin
  // per event is enforced server-side by the ack table.
  const { data: adminNotifs } = useQuery<{
    newMembers: Array<{ id: number; name: string | null; avatarUrl: string | null; joinedAt: string }>;
    newPrayers: Array<{ id: number; body: string; ownerName: string | null; isAnonymous: boolean; createdAt: string }>;
  }>({
    queryKey: ["/api/groups", slug, "admin-notifications"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/admin-notifications`),
    // Enabled only for admins. The server also gates — this just avoids the
    // network round-trip for regular members.
    enabled: !!user && !!slug && (groupData?.myRole === "admin" || groupData?.myRole === "hidden_admin"),
    // Refetch when the admin returns to the tab so a join that happened while
    // they were away pops up the next time they open the community page.
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Within-session dismiss flag — prevents the popup from re-appearing in
  // this tab during the optimistic window before the ack mutation lands.
  const [notifsDismissed, setNotifsDismissed] = useState(false);

  const acknowledgeNotifsMutation = useMutation({
    mutationFn: (events: Array<{ kind: "member_joined" | "prayer_request"; id: number }>) =>
      apiRequest("POST", `/api/groups/${slug}/admin-notifications/acknowledge`, { events }),
    onSuccess: () => {
      // Invalidate so a re-open fetches a clean (empty) list.
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "admin-notifications"] });
    },
  });

  // Rotate the community-wide invite link. After this fires, the previous
  // URL stops working — useful if a link was shared too widely.
  const rotateInviteMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/rotate-invite`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: number) => apiRequest("DELETE", `/api/groups/${slug}/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  // Change a member's role between member / admin / hidden_admin. The
  // server enforces the pilot gate on anything touching hidden_admin and
  // blocks demoting the last admin, so the client can stay naive about
  // those guardrails — it just shows an error toast on failure.
  const changeRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: "follower" | "member" | "admin" | "hidden_admin" }) =>
      apiRequest("PATCH", `/api/groups/${slug}/members/${memberId}/role`, { role }),
    onSuccess: () => {
      // Role changes (especially to/from hidden_admin) affect what
      // shows up on community feeds: prayer requests, garden feed,
      // member count. Nuke every cache that keys on group membership
      // so the UI catches up immediately instead of waiting for a
      // refresh. User flagged: "hidden admin prayer requests are
      // still coming up" — root cause was the prayer-request query
      // staying stale after a role flip.
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "members"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "prayer-activity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/moments"] });
    },
    onError: (err: any) => {
      // apiRequest hands us the raw response text; when the server replies
      // with JSON like `{"error":"..."}` we extract the message so the
      // user sees "Only pilot users can…" instead of a JSON blob.
      let msg = err?.message || t("community_detail.change_role_error");
      try {
        const parsed = JSON.parse(msg);
        if (parsed && typeof parsed.error === "string") msg = parsed.error;
      } catch { /* not JSON — show as-is */ }
      window.alert(msg);
    },
  });

  // ── Prayer Circle focus mutations ─────────────────────────────────────
  // add: submits one of situation/cause/custom with `subjectText`. We don't
  //   (yet) expose a Phoebe-user picker from this form — adding a person by
  //   name shows as "custom" until we wire it through a member search UX.
  // remove: adder or group admin may delete. Server enforces.
  const addFocusMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/focus`, {
      focusType,
      subjectText: focusSubject.trim(),
    }),
    onSuccess: () => {
      setFocusSubject("");
      setShowFocusForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "focus"] });
    },
  });
  const removeFocusMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/groups/${slug}/focus/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "focus"] });
    },
  });

  const [communityAdminView] = useCommunityAdminToggle();
  // rawIsBeta = beta_users membership regardless of the in-app
  // beta-view toggle. We use raw for "this user is actually a pilot"
  // capability checks (e.g. designating hidden admins) so toggling
  // the beta view off doesn't hide the pilot affordances they're
  // allowed to use.
  const { rawIsBeta } = useBetaStatus();

  if (authLoading || !user) return null;
  if (!groupData) return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full text-center py-20">
        <p className="text-sm" style={{ color: "#8FAF96" }}>{t("community_detail.loading")}</p>
      </div>
    </Layout>
  );

  const { group, myRole, members } = groupData;
  // Hidden admins have full admin powers — same gate as real admins. The
  // only difference is that they're filtered from the roster for non-admin
  // viewers (server-side, so the list never even hits the client).
  const isAdmin = (myRole === "admin" || myRole === "hidden_admin") && communityAdminView;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="mb-4">
          <button
            onClick={() => setLocation("/communities")}
            className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            ← {t("community_detail.communities")}
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                {group.emoji && (
                  <span className="text-3xl leading-none">{group.emoji}</span>
                )}
                <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: FONT }}>
                  {group.name}
                </h1>
              </div>
              {group.description && (
                <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>{group.description}</p>
              )}
              <p className="text-xs mt-1.5" style={{ color: "rgba(143,175,150,0.5)" }}>
                {(() => {
                  // Hidden admins are invisible observers — don't count
                  // them in the public roster count, even for admins
                  // looking at their own community. Keeps the headline
                  // honest about how many people the community will
                  // *feel* like it has.
                  // Use the server's anonymous memberCount — a non-admin viewer
                  // no longer receives the individual member rows, so counting
                  // `members` locally would wrongly read 1 (just themselves).
                  const joinedCount = groupData.memberCount
                    ?? members.filter(m => m.joinedAt !== null && m.role !== "hidden_admin").length;
                  return t("community_detail.member_count", { count: joinedCount });
                })()}
              </p>
            </div>
            {/* On the group hub the admin tools live as tiles, so the header
                icons would be redundant there — keep them only inside a
                section. */}
            {isAdmin && activeTab !== "hub" && (
              <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setLocation(`/communities/${slug}/settings`)}
                className="p-2 rounded-xl"
                style={{ background: "rgba(46,107,64,0.15)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.25)" }}
                title={t("community_detail.community_settings")}
              >
                <Settings size={15} />
              </button>
              <button
                onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                <Plus size={14} /> {t("community_detail.invite")}
              </button>
              </div>
            )}
          </div>
        </div>

        {/* Group chat removed from communities per request. */}

        {/* ── What we're praying for ────────────────────────────────────
            Owner: "I wanted them to be the focus of the group... on the main
            page of the group." This is the FIRST thing under the header now —
            it used to sit below the rule-of-life card and the beta pulse/season
            cards, and only rendered for groups that had ticked the Prayer
            Circle box. Both of those are gone: the opt-in no longer exists, so
            any group with intentions leads with them.

            Sizing is a deliberate middle: bigger than the old compact stack
            (which was explicitly shrunk so intentions would NOT read as
            headlines) but still capped, because a community with six
            intentions shouldn't push its own members and services off screen.
            The serif italic voice is kept — these are prayers, not UI labels.

            Admins with an empty list get a doorway into settings; members see
            nothing rather than an empty shell. */}
        {(groupData.intentions?.length ?? 0) > 0 ? (
          <div className="mb-5">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-2 px-1"
              style={{ color: "rgba(200,212,192,0.55)" }}
            >
              {t("community_detail.group_intentions")}
            </p>
            <div className="flex flex-col gap-2">
              {groupData.intentions!.map((intn) => (
                <div
                  key={intn.id}
                  className="rounded-2xl px-4 py-3.5"
                  style={{
                    background: "rgba(46,107,64,0.14)",
                    border: "1px solid rgba(46,107,64,0.34)",
                  }}
                >
                  <p
                    className="italic leading-snug"
                    style={{
                      color: "#F0EDE6",
                      fontFamily: "Georgia, 'Times New Roman', serif",
                      fontSize: "clamp(17px, 4.6vw, 20px)",
                    }}
                  >
                    {intn.title}
                  </p>
                  {intn.description && (
                    <p className="text-[13px] leading-relaxed mt-1.5" style={{ color: "rgba(200,212,192,0.8)" }}>
                      {intn.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {/* The dashed "Add what this community is praying for" prompt is gone
            (owner). It led the page with an empty admin to-do rather than with
            the community, and adding one still lives in Community settings. */}

        {/**
          * THE GROUP'S RULE OF LIFE — the rhythm these people keep together.
          *
          * Owner: "when someone goes to the group, they can publicly see
          * 'Follow <Group name> routine'."
          *
          * This card has existed since the community-rule work and was never
          * rendered here — it only ever appeared on the join-welcome screen
          * and as a one-time home offer, both of which you pass through once.
          * So the rhythm a community keeps had no permanent home on the page
          * that IS the community, and anyone who tapped past the welcome had
          * no way back to it.
          *
          * Not beta-gated, unlike the pulse and season below it: this is the
          * thing a follower came to see. It self-gates instead — no rule and
          * no admin rights renders nothing at all, so a group that keeps no
          * rhythm shows no empty promise of one, and leaders of such a group
          * get the quiet doorway to set one.
          *
          * Above the pulse and the season because it's the standing rhythm and
          * those are commentary on it.
          */}
        <CommunityRuleCard slug={slug!} />

        {/* BETA — the leader's aggregate weekly pulse (never names, floored
            under 4 members) and the community SEASON (the rule kept together
            for a bounded few weeks; leaders start it, everyone checks in). */}
        {rawIsBeta && <CommunitySeasonCard slug={slug} />}

        {/* Beta-only — daily reflection entry (CAC / Forward Day by
            Day). Renders for every joined member of a beta-gated
            community; the page itself handles the "not enabled"
            empty state when the admin hasn't picked a source yet.
            Hidden for admins, who manage these surfaces from settings
            and don't want the member-facing reflection cards cluttering
            their admin view. */}

        {/* Beta-only — Sunday-service reflection entry. Mirrors the
            daily card pattern. Also hidden for admins (see above). */}


        {/* "New arrival" popup — appears over the page for community admins
            when someone has joined or posted a prayer request since the last
            time this admin visited. Dismissing acknowledges the events
            server-side so they won't reappear on any device. */}
        {isAdmin && !notifsDismissed && adminNotifs &&
          (adminNotifs.newMembers.length > 0 || adminNotifs.newPrayers.length > 0) && (() => {
          const newMembers = adminNotifs.newMembers;
          const newPrayers = adminNotifs.newPrayers;
          const totalCount = newMembers.length + newPrayers.length;

          const headline = (() => {
            if (newMembers.length > 0 && newPrayers.length > 0) {
              return t("community_detail.new_arrivals", { count: totalCount });
            }
            if (newMembers.length > 0) {
              if (newMembers.length === 1) {
                const m = newMembers[0];
                const first = (m.name ?? "").split(/\s+/)[0] || t("community_detail.someone");
                return t("community_detail.name_joined", { name: first, group: group.name });
              }
              return t("community_detail.new_members_joined", { count: newMembers.length });
            }
            if (newPrayers.length === 1) return t("community_detail.a_new_prayer_request");
            return t("community_detail.new_prayer_requests", { count: newPrayers.length });
          })();

          const dismiss = () => {
            // Optimistic local dismiss so the popup doesn't linger while
            // the ack request is in flight.
            setNotifsDismissed(true);
            const events = [
              ...newMembers.map(m => ({ kind: "member_joined" as const, id: m.id })),
              ...newPrayers.map(p => ({ kind: "prayer_request" as const, id: p.id })),
            ];
            if (events.length > 0) acknowledgeNotifsMutation.mutate(events);
          };

          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center px-4"
              style={{ background: "rgba(9,26,16, 0.935)", backdropFilter: "blur(4px)" }}
              onClick={dismiss}
            >
              <div
                className="w-full max-w-sm rounded-2xl overflow-hidden"
                style={{ background: "#0F2818", border: "1px solid rgba(46,107,64,0.4)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="px-5 pt-5 pb-3 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Sparkles size={18} style={{ color: "#E8B872" }} />
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: "#C8D4C0" }}>
                      {t("community_detail.something_new")}
                    </p>
                  </div>
                  <h2 className="text-xl font-bold" style={{ color: "#F0EDE6", fontFamily: FONT, letterSpacing: "-0.02em" }}>
                    {headline}
                  </h2>
                </div>

                {/* New members list */}
                {newMembers.length > 0 && (
                  <div className="px-5 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.55)" }}>
                      {newMembers.length === 1 ? t("community_detail.new_member") : t("community_detail.new_members")}
                    </p>
                    <div className="space-y-1.5">
                      {newMembers.slice(0, 5).map(m => (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg"
                          style={{ background: "rgba(46,107,64,0.18)", border: "1px solid rgba(46,107,64,0.3)" }}
                        >
                          {m.avatarUrl ? (
                            <img src={m.avatarUrl} alt={m.name ?? ""} className="w-8 h-8 rounded-full object-cover flex-shrink-0" style={{ border: "1px solid rgba(46,107,64,0.4)" }} />
                          ) : (
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>
                              {(m.name ?? "?").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "#F0EDE6" }}>
                              {m.name || t("community_detail.a_new_friend")}
                            </p>
                            <p className="text-[11px]" style={{ color: "#8FAF96" }}>
                              {t("community_detail.joined_date", { date: new Date(m.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) })}
                            </p>
                          </div>
                        </div>
                      ))}
                      {newMembers.length > 5 && (
                        <p className="text-[11px] text-center pt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
                          {t("community_detail.plus_n_more", { count: newMembers.length - 5 })}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* New prayer requests list */}
                {newPrayers.length > 0 && (
                  <div className="px-5 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.55)" }}>
                      {newPrayers.length === 1 ? t("community_detail.new_prayer_request_label") : t("community_detail.new_prayer_requests_label")}
                    </p>
                    <div className="space-y-1.5">
                      {newPrayers.slice(0, 3).map(p => (
                        <div
                          key={p.id}
                          className="px-3 py-2 rounded-lg"
                          style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}
                        >
                          <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(200,212,192,0.45)" }}>
                            {t("community_detail.from_name", { name: p.isAnonymous ? t("community_detail.someone") : (p.ownerName ?? t("community_detail.a_member")) })}
                          </p>
                          <p className="text-sm leading-relaxed line-clamp-2" style={{ color: "#F0EDE6", fontFamily: FONT }}>
                            {p.body}
                          </p>
                        </div>
                      ))}
                      {newPrayers.length > 3 && (
                        <p className="text-[11px] text-center pt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
                          {t("community_detail.plus_n_more_on_wall", { count: newPrayers.length - 3 })}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="px-5 pb-5 pt-2 flex gap-2">
                  {newPrayers.length > 0 && (
                    <button
                      onClick={() => {
                        // The group Prayer Wall moved off this page — new
                        // prayer requests surface on the home screen now.
                        setLocation("/dashboard");
                        dismiss();
                      }}
                      className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                      style={{ background: "rgba(46,107,64,0.2)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.4)" }}
                    >
                      {t("community_detail.see_prayers")}
                    </button>
                  )}
                  {newMembers.length > 0 && newPrayers.length === 0 && (
                    <button
                      onClick={() => {
                        setActiveTab("members");
                        dismiss();
                      }}
                      className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                      style={{ background: "rgba(46,107,64,0.2)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.4)" }}
                    >
                      {t("community_detail.see_members")}
                    </button>
                  )}
                  <button
                    onClick={dismiss}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    {t("community_detail.got_it")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Share-invite modal — a single URL that anyone can use to join this
            community. Admins can copy or rotate; rotation invalidates the old
            link immediately (useful if it was shared too widely). */}
        {showInvite && (() => {
          // Inside the iOS Capacitor shell, `window.location.origin` is
          // `capacitor://localhost` — useless when shared via SMS. Force
          // the public host so the link clicks into a real browser (or
          // back into the app via Universal Links → applinks:withphoebe.app).
          const linkOrigin = isNativeShell() ? "https://withphoebe.app" : window.location.origin;
          const inviteUrl = group.inviteToken
            ? `${linkOrigin}/communities/join/${group.slug}/${group.inviteToken}`
            : "";
          const copyToClipboard = async () => {
            if (!inviteUrl) return;
            try {
              await navigator.clipboard.writeText(inviteUrl);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            } catch {
              // Clipboard can fail in insecure contexts — surface the URL so
              // the admin can copy it manually from the read-only input.
            }
          };
          return (
            <div className="mb-4 rounded-xl p-4" style={{ background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{t("community_detail.share_invite_link")}</p>
                <button onClick={() => { setShowInvite(false); setLinkCopied(false); }}>
                  <X size={16} style={{ color: "#8FAF96" }} />
                </button>
              </div>

              <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.75)" }}>
                {t("community_detail.invite_link_desc", { name: group.name })}
              </p>

              {inviteUrl ? (
                <>
                  <div className="flex items-stretch gap-2 mb-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteUrl}
                      onFocus={e => e.currentTarget.select()}
                      className="flex-1 px-3 py-2 rounded-lg border border-[#2E6B40]/40 outline-none bg-transparent text-xs font-mono"
                      style={{ color: "#F0EDE6" }}
                    />
                    <button
                      onClick={copyToClipboard}
                      className="px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0"
                      style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                      title={t("community_detail.copy_to_clipboard")}
                    >
                      {linkCopied ? <><Check size={14} /> {t("community_detail.copied")}</> : <><Copy size={14} /> {t("community_detail.copy")}</>}
                    </button>
                  </div>

                  {/* Send via Messages — pops the iOS share sheet (or
                      Messages directly via `sms:`) with a pre-filled
                      invite text. iMessage auto-renders the link preview
                      because withphoebe.app serves Open Graph tags, so
                      the recipient sees a real card, not a bare URL.
                      The phoebe:share event is consumed by the native
                      Capacitor shell; on plain web we fall back to the
                      web Share API, then to a `sms:` URL as last resort. */}
                  <button
                    onClick={() => {
                      const text = t("community_detail.invite_share_text", { name: group.name });
                      const shareDetail = { title: group.name, text, url: inviteUrl };
                      // Native shell path — dispatched event, Capacitor
                      // Share plugin opens the iOS share sheet.
                      window.dispatchEvent(new CustomEvent("phoebe:share", { detail: shareDetail }));
                      // Web fallback — try navigator.share, then sms:.
                      if (isNativeShell()) return;
                      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
                      if (typeof nav.share === "function") {
                        void nav.share(shareDetail).catch(() => {
                          // Cancelled or unsupported — fall through to sms:
                          window.location.href = `sms:?body=${encodeURIComponent(`${text} ${inviteUrl}`)}`;
                        });
                      } else {
                        window.location.href = `sms:?body=${encodeURIComponent(`${text} ${inviteUrl}`)}`;
                      }
                    }}
                    className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 mb-2"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    <MessageSquareText size={14} /> {t("community_detail.send_via_messages")}
                  </button>

                  <button
                    onClick={() => {
                      if (window.confirm(t("community_detail.rotate_link_confirm"))) {
                        rotateInviteMutation.mutate();
                      }
                    }}
                    disabled={rotateInviteMutation.isPending}
                    className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                    style={{ background: "rgba(46,107,64,0.15)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}
                  >
                    <RefreshCw size={12} /> {rotateInviteMutation.isPending ? t("community_detail.rotating") : t("community_detail.rotate_link")}
                  </button>
                </>
              ) : (
                <p className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
                  {t("community_detail.invite_link_unavailable")}
                </p>
              )}
            </div>
          );
        })()}

        {/* Navigation. Groups get a simple hub of tiles — Members · Events ·
            Practices, plus admin tools — and tapping one opens that section
            with a back arrow. The old home-style dashboard is gone (that
            content lives on the home screen). */}
        {activeTab === "hub" ? (
          <div className="mb-5 flex flex-col" style={{ gap: 22 }}>
            <CommunityPrayersSection slug={slug} />
            <CommunityEventsSection slug={slug} />
            <div className="flex flex-col" style={{ gap: 10 }}>
              {([
                // A community is a followed feed — FOLLOWERS (the anonymous
                // default) don't see a roster of each other. But MEMBERS (the
                // smaller, admin-curated tier) ARE visible to everyone, so the
                // Members tile is open to all viewers now; admins additionally
                // get the management controls inside it (see the section below).
                { emoji: "👥", label: t("community_detail.tab_members"), go: () => setActiveTab("members") },
                { emoji: "⛪", label: t("community_detail.tab_services", { defaultValue: "Services" }), go: () => setActiveTab("gatherings") },
              ]).map((tile, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={tile.go}
                  className="w-full transition-opacity hover:opacity-90"
                  style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", background: "rgba(9,26,16,0.297)", border: "1px solid rgba(46,107,64,0.38)", borderRadius: 16, padding: "16px 18px" }}
                >
                  <span aria-hidden style={{ fontSize: 24, lineHeight: 1, flexShrink: 0, width: 28, textAlign: "center" }}>{tile.emoji}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: "#F0EDE6" }}>{tile.label}</span>
                  <span aria-hidden style={{ color: "rgba(143,175,150,0.4)", fontSize: 22, lineHeight: 1, flexShrink: 0 }}>›</span>
                </button>
              ))}
            </div>
            {isAdmin && (
              <div className="flex flex-col" style={{ gap: 10 }}>
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(143,175,150,0.55)", margin: 0 }}>
                  {t("community_detail.admin_tools", { defaultValue: "Admin tools" })}
                </p>
                {([
                  { emoji: "⚙️", label: t("community_detail.community_settings", { defaultValue: "Settings" }), go: () => setLocation(`/communities/${slug}/settings`) },
                  { emoji: "✉️", label: t("community_detail.invite_members", { defaultValue: "Invite members" }), go: () => setShowInvite(true) },
                  // Where the weekly reflection is written, a link is posted,
                  // and the group's inbound newsletter address lives.
                  { emoji: "📝", label: t("community_detail.posts", { defaultValue: "Posts & newsletter" }), go: () => setLocation(`/communities/${slug}/posts`) },
                  // Prayer Feeds are beta-only (server-enforced) — the tile is
                  // gated on rawIsBeta so it doesn't invite a 403 for admins
                  // outside the beta program.
                  ...(rawIsBeta ? [{ emoji: "🕊️", label: t("community_detail.tab_feed", { defaultValue: "Prayer Feed" }), go: () => setActiveTab("feed") }] : []),
                ]).map((tile, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={tile.go}
                    className="w-full transition-opacity hover:opacity-90"
                    style={{ display: "flex", alignItems: "center", gap: 14, textAlign: "left", cursor: "pointer", background: "rgba(9,26,16,0.297)", border: "1px solid rgba(46,107,64,0.38)", borderRadius: 16, padding: "16px 18px" }}
                  >
                    <span aria-hidden style={{ fontSize: 24, lineHeight: 1, flexShrink: 0, width: 28, textAlign: "center" }}>{tile.emoji}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, color: "#F0EDE6" }}>{tile.label}</span>
                    <span aria-hidden style={{ color: "rgba(143,175,150,0.4)", fontSize: 22, lineHeight: 1, flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTab("hub")}
            className="mb-5 flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-70"
            style={{ background: "none", border: "none", color: "#8FAF96", cursor: "pointer", padding: 0 }}
          >
            ← {group.name}
          </button>
        )}

        {/* ─── Gatherings ─── */}
        {activeTab === "gatherings" && (
          <div>
            {/* A community is a followed feed: the schedule shows the read-only
                church service times, not social meetups with attendee lists. */}
            <ServicesSection slug={slug!} isAdmin={isAdmin} />
          </div>
        )}

        {/* ─── Prayer Feed (beta) — standing intercessions entry point ───
            A group's non-rotating intercessions live on a bound prayer feed
            (the "parish prayer list" experience). Most groups don't have one
            yet — this admin-only tab creates one inline (title only) and
            drops straight into the full composer, or, once bound, links
            there directly. Composing/managing entries happens on the
            existing /prayer-feeds/:slug/manage page, not here. */}
        {activeTab === "feed" && isAdmin && (
          <div>
            {feedLoading ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                {t("community_detail.feed_loading", { defaultValue: "Loading…" })}
              </p>
            ) : (feedData?.feeds ?? []).length > 0 ? (
              <div className="space-y-2">
                {feedData!.feeds.map(f => (
                  <Link key={f.feedId} href={`/prayer-feeds/${f.feedSlug}/manage`} className="block">
                    <div className="flex items-center justify-between rounded-xl px-4 py-3.5" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-lg leading-none flex-shrink-0">{f.feedCoverEmoji ?? "🕊️"}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>{f.feedTitle}</p>
                          <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                            {t("community_detail.feed_manage_hint", { defaultValue: "Manage standing intercessions" })}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={16} style={{ color: "rgba(143,175,150,0.4)" }} className="flex-shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-xl px-4 py-4" style={{ background: "rgba(46,107,64,0.08)", border: "1px dashed rgba(46,107,64,0.3)" }}>
                <p className="text-sm mb-3" style={{ color: "#8FAF96" }}>
                  {t("community_detail.feed_empty", { defaultValue: "No prayer feed yet. Create one to give this community a standing list of intercessions members can pray through." })}
                </p>
                <input
                  type="text"
                  value={newFeedTitle}
                  onChange={e => setNewFeedTitle(e.target.value)}
                  placeholder={t("community_detail.feed_title_placeholder", { defaultValue: "e.g. \"St. Mark's Prayer List\"" })}
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm mb-2 focus:outline-none"
                  style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.3)", color: "#F0EDE6" }}
                />
                <button
                  type="button"
                  onClick={() => createFeedMutation.mutate()}
                  disabled={!newFeedTitle.trim() || createFeedMutation.isPending}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {createFeedMutation.isPending
                    ? t("community_detail.feed_creating", { defaultValue: "Creating…" })
                    : t("community_detail.feed_create", { defaultValue: "Create feed" })}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Members: a read-only Member roster for everyone, plus the
            admin-only management view (invite/promote/demote/remove) for
            admins. FOLLOWERS never appear in either — the anonymous crowd
            behind the header's "N members" count. ─── */}
        {activeTab === "members" && !isAdmin && (() => {
          // `members` here is already server-scoped to the viewer's own row
          // plus every member/admin row (never a fellow follower's row, never
          // hidden_admin) — see GET /groups/:slug. Just render it read-only.
          const visible = members.filter(m => m.joinedAt !== null && m.role !== "follower");
          const followerCount = Math.max(0, (groupData.memberCount ?? 0) - visible.length);
          return (
            <div>
              {visible.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.55)" }}>
                  {t("community_detail.no_members_yet", { defaultValue: "No members yet — just followers." })}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {visible.map(m => (
                    <div
                      key={m.id}
                      className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
                      style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)" }}
                    >
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.name || ""} className="w-7 h-7 rounded-full object-cover shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
                      ) : (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>
                          {(m.name || "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                      <p className="text-sm font-medium truncate flex-1" style={{ color: "#F0EDE6" }}>
                        {m.name || t("community_detail.a_member", { defaultValue: "A member" })}
                      </p>
                      {m.role === "admin" && (
                        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0" style={{ background: "rgba(46,107,64,0.3)", color: "#8FAF96" }}>
                          {t("community_detail.role_admin")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {followerCount > 0 && (
                <p className="text-xs text-center mt-4" style={{ color: "rgba(143,175,150,0.5)" }}>
                  {t("community_detail.plus_followers", { count: followerCount, defaultValue: `+ ${followerCount} more following` })}
                </p>
              )}
            </div>
          );
        })()}

        {activeTab === "members" && isAdmin && (() => {
          // "Recently joined" = within the last 7 calendar days. We deliberately
          // use a calendar-day diff so the badge flips off at local midnight
          // on day 8, not 168 hours after the exact join timestamp.
          const sevenDaysAgo = (() => {
            const d = new Date();
            d.setDate(d.getDate() - 7);
            d.setHours(0, 0, 0, 0);
            return d;
          })();
          const isRecentlyJoined = (joinedAt: string | null): boolean => {
            if (!joinedAt) return false;
            return new Date(joinedAt) >= sevenDaysAgo;
          };

          return (
          <div>
            {/* Direct "add member" panel removed 2026-07-25 — the only way
                into a community is the shareable invite link (or requesting
                to join and being accepted). Role management on EXISTING
                rows below is unchanged. */}
            <div className="space-y-1.5">
              {members.filter(m => m.joinedAt !== null).map(m => {
                const isSelf = m.email.toLowerCase() === (user.email ?? "").toLowerCase();
                const isHiddenAdmin = m.role === "hidden_admin";
                const isRoleAdmin = m.role === "admin";
                const isRoleMember = m.role === "member";
                const changingThisRow = changeRoleMutation.isPending && changeRoleMutation.variables?.memberId === m.id;
                return (
                <div
                  key={m.id}
                  className="flex items-center justify-between px-4 py-2.5 rounded-xl"
                  style={{
                    background: isHiddenAdmin ? "rgba(193,127,36,0.08)" : "rgba(46,107,64,0.08)",
                    border: isHiddenAdmin ? "1px solid rgba(193,127,36,0.28)" : "1px solid rgba(46,107,64,0.2)",
                  }}
                >
                  {/* Fellows/person-profile removed 2026-07-23 — the member row
                      is no longer a link to /people/:email (that page is gone). */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt={m.name || m.email} className="w-7 h-7 rounded-full object-cover shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
                      ) : (
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>
                          {(m.name || m.email).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <p className="text-sm font-medium truncate" style={{ color: "#F0EDE6" }}>
                        {m.name || m.email.split("@")[0]}
                      </p>
                      {isRoleAdmin && (
                        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ background: "rgba(46,107,64,0.3)", color: "#8FAF96" }}>
                          {t("community_detail.role_admin")}
                        </span>
                      )}
                      {isRoleMember && (
                        <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ background: "rgba(46,107,64,0.18)", color: "#A8C5A0" }}>
                          {t("community_detail.role_member", { defaultValue: "Member" })}
                        </span>
                      )}
                      {isHiddenAdmin && (
                        // Amber tag only shown to admins (the server filters
                        // hidden admins from non-admin rosters so this row
                        // never reaches a regular member anyway).
                        <span
                          className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(193,127,36,0.18)", color: "#E8B872", border: "1px solid rgba(193,127,36,0.35)" }}
                          title={t("community_detail.hidden_admin_title")}
                        >
                          {t("community_detail.role_hidden_admin")}
                        </span>
                      )}
                      {m.isBeta && (
                        <span
                          className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(193,127,36,0.1)", color: "#E8B872", border: "1px solid rgba(193,127,36,0.3)" }}
                          title={t("community_detail.app_developer_title")}
                        >
                          {t("community_detail.app_developer")}
                        </span>
                      )}
                      {isRecentlyJoined(m.joinedAt) && (
                        // Amber accent — matches the "praying for you" card on People,
                        // the other place where we quietly surface "something new".
                        <span
                          className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(193,127,36,0.18)", color: "#E8B872", border: "1px solid rgba(193,127,36,0.35)" }}
                          title={t("community_detail.joined_title", { date: new Date(m.joinedAt!).toLocaleDateString() })}
                        >
                          {t("community_detail.role_new")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{m.email}</p>
                  </div>
                  {/* Admin-only management controls. Split into two gates:
                      - Peer actions (make-admin / demote / remove) stay
                        `!isSelf`. A member can't change their own
                        membership here — leaving is a separate flow.
                      - Hidden-admin toggle is pilot-gated but *does*
                        work on self, so a pilot can quietly make
                        themselves invisible to the roster without
                        needing a second admin to flip the bit. */}
                  {isAdmin && (
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {/* Follower → Member: the new admin-curated tier. Only
                          shown on follower rows — a member/admin/hidden_admin
                          is already at or above that tier. */}
                      {!isSelf && m.role === "follower" && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            changeRoleMutation.mutate({ memberId: m.id, role: "member" });
                          }}
                          disabled={changingThisRow}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "#A8C5A0", background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}
                        >
                          {changingThisRow ? "…" : t("community_detail.make_member", { defaultValue: "Make member" })}
                        </button>
                      )}
                      {/* Member → Follower: step back down from the curated
                          tier to the anonymous default. */}
                      {!isSelf && isRoleMember && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            changeRoleMutation.mutate({ memberId: m.id, role: "follower" });
                          }}
                          disabled={changingThisRow}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "rgba(143,175,150,0.75)", border: "1px solid rgba(143,175,150,0.2)" }}
                        >
                          {changingThisRow ? "…" : t("community_detail.make_follower", { defaultValue: "→ Follower" })}
                        </button>
                      )}
                      {/* Peer-only: promote/demote. Hidden on self rows. */}
                      {!isSelf && !isRoleAdmin && !isHiddenAdmin && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            changeRoleMutation.mutate({ memberId: m.id, role: "admin" });
                          }}
                          disabled={changingThisRow}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "#A8C5A0", background: "rgba(46,107,64,0.15)", border: "1px solid rgba(46,107,64,0.3)" }}
                        >
                          {changingThisRow ? "…" : t("community_detail.make_admin")}
                        </button>
                      )}
                      {!isSelf && isRoleAdmin && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (window.confirm(t("community_detail.demote_confirm", { name: m.name || m.email }))) {
                              changeRoleMutation.mutate({ memberId: m.id, role: "member" });
                            }
                          }}
                          disabled={changingThisRow}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "rgba(143,175,150,0.75)", border: "1px solid rgba(143,175,150,0.2)" }}
                        >
                          {changingThisRow ? "…" : t("community_detail.demote")}
                        </button>
                      )}
                      {/* Pilot-only hidden-admin toggle — works on SELF too,
                          so pilots can self-designate. Server pilot-gates
                          it regardless. Gated on rawIsBeta (not isBeta)
                          so the option stays visible even when the user
                          has the beta view toggled off. */}
                      {rawIsBeta && !isHiddenAdmin && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const msg = isSelf
                              ? t("community_detail.make_hidden_self_confirm")
                              : t("community_detail.make_hidden_confirm", { name: m.name || m.email });
                            if (window.confirm(msg)) {
                              changeRoleMutation.mutate({ memberId: m.id, role: "hidden_admin" });
                            }
                          }}
                          disabled={changingThisRow}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "#E8B872", background: "rgba(193,127,36,0.1)", border: "1px solid rgba(193,127,36,0.3)" }}
                          title={t("community_detail.pilot_only")}
                        >
                          {changingThisRow ? "…" : t("community_detail.hidden")}
                        </button>
                      )}
                      {rawIsBeta && isHiddenAdmin && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // "Reveal" only flips visibility — keep admin
                            // powers. Demoting all the way to "member"
                            // here surprised admins who only wanted to
                            // come out of hiding. If the goal is to
                            // demote, use the regular role control.
                            const msg = isSelf
                              ? t("community_detail.reveal_self_confirm")
                              : t("community_detail.reveal_confirm", { name: m.name || m.email });
                            if (window.confirm(msg)) {
                              changeRoleMutation.mutate({ memberId: m.id, role: "admin" });
                            }
                          }}
                          disabled={changingThisRow}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "#E8B872", background: "rgba(193,127,36,0.1)", border: "1px solid rgba(193,127,36,0.3)" }}
                        >
                          {changingThisRow ? "…" : t("community_detail.reveal")}
                        </button>
                      )}
                      {!isSelf && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const label = m.name || m.email;
                            if (window.confirm(t("community_detail.remove_member_confirm", { name: label, group: group.name }))) {
                              removeMemberMutation.mutate(m.id);
                            }
                          }}
                          disabled={removeMemberMutation.isPending}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "rgba(143,175,150,0.5)", border: "1px solid rgba(143,175,150,0.2)" }}
                        >
                          {t("community_detail.remove")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* Pending invites */}
            {isAdmin && (
              <div className="mt-4">
                {(groupData?.members ?? []).filter(m => !m.joinedAt).length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.4)" }}>
                      {t("community_detail.pending_invites")}
                    </p>
                    <div className="space-y-1">
                      {groupData!.members.filter(m => !m.joinedAt).map(m => (
                        <div key={m.id} className="flex items-center justify-between px-4 py-2 rounded-xl" style={{ background: "rgba(46,107,64,0.05)" }}>
                          <p className="text-xs truncate mr-2" style={{ color: "rgba(143,175,150,0.55)" }}>
                            {m.name || m.email}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] italic" style={{ color: "rgba(143,175,150,0.35)" }}>{t("community_detail.pending")}</span>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const label = m.name || m.email;
                                if (window.confirm(t("community_detail.cancel_invite_confirm", { name: label }))) {
                                  removeMemberMutation.mutate(m.id);
                                }
                              }}
                              disabled={removeMemberMutation.isPending}
                              className="text-[10px] px-2 py-0.5 rounded-lg disabled:opacity-40"
                              style={{ color: "rgba(143,175,150,0.5)", border: "1px solid rgba(143,175,150,0.2)" }}
                            >
                              {t("community_detail.cancel")}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          );
        })()}
      </div>

      {/* Admin FAB — bottom-right floating "+" that opens a menu of
          authoring entry points scoped to THIS community. Intercession
          / fast jump into /moment/new with a template
          query param; event jumps into /tradition/new with the
          community slug pre-filled. Mirrors the FAB that used to live on the
          home dashboard but always lacked a community context. */}
      {isAdmin && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
          <AnimatePresence>
            {fabOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-2 mb-1"
              >
                <button
                  onClick={() => { setFabOpen(false); setLocation(`/moment/new?template=intercession&community=${slug}`); }}
                  className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
                  style={{ background: "#193F2A", border: "1px solid rgba(46,107,64,0.45)", minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
                >
                  <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🙏🏽 {t("community_detail.fab_intercession_title")}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("community_detail.fab_intercession_sub")}</p>
                </button>
                <button
                  onClick={() => { setFabOpen(false); setLocation(`/moment/new?template=fasting&community=${slug}`); }}
                  className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
                  style={{ background: "#193F2A", border: "1px solid rgba(46,107,64,0.45)", minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
                >
                  <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>🌿 {t("community_detail.fab_fast_title")}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("community_detail.fab_fast_sub")}</p>
                </button>
                <button
                  onClick={() => { setFabOpen(false); setLocation(`/tradition/new?community=${slug}`); }}
                  className="px-4 py-3 rounded-2xl shadow-lg text-left transition-colors"
                  style={{ background: "#193F2A", border: "1px solid rgba(46,107,64,0.45)", minWidth: 240, boxShadow: "0 6px 20px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.35)" }}
                >
                  <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>📅 {t("community_detail.fab_event_title")}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{t("community_detail.fab_event_sub")}</p>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setFabOpen(o => !o)}
            className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
            style={{ background: "#1A4A2E", color: "#F0EDE6" }}
            aria-label={fabOpen ? t("community_detail.close_menu") : t("community_detail.create_new")}
          >
            <motion.div animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ duration: 0.2 }}>
              {fabOpen ? <X size={24} /> : <Plus size={24} />}
            </motion.div>
          </button>
        </div>
      )}
    </Layout>
  );
}
