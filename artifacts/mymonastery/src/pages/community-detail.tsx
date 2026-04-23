import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation, useSearch, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
// Communities are now available to all users
import { Layout } from "@/components/layout";
import { ScrollStrip } from "@/components/ScrollStrip";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Users, MessageCircle, X, Settings, Copy, Check, RefreshCw, Sparkles, Heart, Search as SearchIcon } from "lucide-react";
import { useCommunityAdminToggle, useBetaStatus } from "@/hooks/useDemo";
import { usePeople, type PersonSummary } from "@/hooks/usePeople";

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
};
// Shape of an entry in GET /api/groups/:slug/focus. `subject` is populated
// when focusType === "person"; the other types carry their subject in
// `subjectText`. The "addedBy" string lets us show attribution and hide
// the delete button for non-authors (admins see it on every row).
type FocusEntry = {
  id: number;
  focusType: "person" | "situation" | "cause" | "custom";
  subject: { userId: number; name: string | null; avatarUrl: string | null } | null;
  subjectText: string | null;
  notes: string | null;
  addedBy: { name: string | null; email: string } | null;
  createdAt: string;
};
type Member = {
  id: number; name: string | null; email: string; role: string; joinedAt: string | null; pending?: boolean; avatarUrl?: string | null;
};
type PrayerRequest = {
  id: number; body: string; ownerName: string | null; wordCount: number;
  isOwnRequest: boolean; isAnonymous: boolean; createdAt: string;
};
type Practice = {
  id: number; name: string; templateType: string | null; intention: string; momentToken: string;
};
type Gathering = {
  id: number; name: string; description: string | null; template: string | null;
};
type Announcement = {
  id: number; title: string | null; content: string; authorName: string; createdAt: string;
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

// Shape of the moments returned by /api/moments — we only consume the
// fields we render on the community home feed. Keeps this page decoupled
// from the dashboard's much larger internal Moment type.
type CommunityMoment = {
  id: number;
  name: string;
  templateType: string | null;
  intention: string;
  intercessionTopic?: string | null;
  todayPostCount: number;
  memberCount: number;
  windowOpen: boolean;
  myUserToken: string | null;
  momentToken: string | null;
  commitmentSessionsGoal?: number | null;
  commitmentSessionsLogged?: number | null;
  computedSessionsLogged?: number;
  goalDays?: number | null;
  group?: { id: number; name: string; slug: string; emoji: string | null } | null;
  // Moments attached to multiple communities expose the extras here.
  // Primary group stays on `group`; additionalGroups is the rest.
  additionalGroups?: Array<{ id: number; name: string; slug: string; emoji: string | null }>;
  members: Array<{ name: string; email: string }>;
};

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

const DOW_NAMES: Array<{ value: number; label: string }> = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

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
      setTimes(schedule.times.map(t => ({ label: t.label ?? "", time: t.time, location: t.location ?? "" })));
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
        .filter(t => /^\d{1,2}:\d{2}$/.test(t.time))
        .map(t => ({
          label: t.label.trim(),
          time: t.time,
          ...(t.location.trim() ? { location: t.location.trim() } : {}),
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

  const dayLabel = DOW_NAMES.find(d => d.value === (schedule?.dayOfWeek ?? 0))?.label ?? "Sunday";

  // Non-editing view — hide entirely when there's nothing to show and the
  // user can't edit. Admins see the empty-state "add" button.
  if (!editing) {
    if (!schedule && !isAdmin) return null;
    return (
      <div className="mb-4 rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.25)" }}>
        <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.55)" }}>
              {dayLabel} schedule
            </p>
            <p className="text-base font-semibold mt-0.5" style={{ color: "#F0EDE6" }}>
              ⛪ {schedule?.name ?? "Sunday Services"}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 text-[11px] font-semibold uppercase tracking-widest px-3 py-1.5 rounded-full"
              style={{ background: "rgba(111,175,133,0.18)", color: "#C8D4C0", border: "1px solid rgba(111,175,133,0.3)" }}
            >
              {schedule ? "Edit" : "Add"}
            </button>
          )}
        </div>
        {schedule && schedule.times.length > 0 ? (
          <ul className="px-4 pb-3 flex flex-col gap-1.5">
            {schedule.times.map((t, i) => (
              <li key={i} className="text-sm flex items-baseline justify-between gap-3" style={{ color: "#C8D4C0" }}>
                <span className="tabular-nums font-semibold" style={{ color: "#F0EDE6", minWidth: 84 }}>
                  {formatHM12(t.time)}
                </span>
                <span className="flex-1 truncate">
                  {t.label || "Service"}
                  {t.location ? <span style={{ color: "#8FAF96" }}> · 📍 {t.location}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 pb-3 text-sm" style={{ color: "#8FAF96" }}>
            {isAdmin ? "No service times yet. Tap Add to create the schedule." : "No service times yet."}
          </p>
        )}
      </div>
    );
  }

  // Editing view — admin only; guarded above via `isAdmin` check on entry.
  return (
    <div className="mb-4 rounded-xl p-4" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>Service schedule</p>
        <button onClick={() => setEditing(false)} aria-label="Close">
          <X size={16} style={{ color: "#8FAF96" }} />
        </button>
      </div>
      <label className="block text-[11px] font-semibold uppercase mb-1" style={{ color: "rgba(200,212,192,0.55)", letterSpacing: "0.08em" }}>
        Name
      </label>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        className="w-full px-3 py-2 mb-3 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
        style={{ color: "#F0EDE6" }}
      />
      <label className="block text-[11px] font-semibold uppercase mb-1" style={{ color: "rgba(200,212,192,0.55)", letterSpacing: "0.08em" }}>
        Location
      </label>
      <input
        type="text"
        value={location}
        onChange={e => setLocation(e.target.value)}
        placeholder="e.g. Phoebe Chapel · 12 Elm St"
        className="w-full px-3 py-2 mb-3 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
        style={{ color: "#F0EDE6" }}
      />
      <label className="block text-[11px] font-semibold uppercase mb-1" style={{ color: "rgba(200,212,192,0.55)", letterSpacing: "0.08em" }}>
        Day of week
      </label>
      <select
        value={dow}
        onChange={e => setDow(parseInt(e.target.value, 10))}
        className="w-full px-3 py-2 mb-3 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
        style={{ color: "#F0EDE6", background: "#091A10" }}
      >
        {DOW_NAMES.map(d => (
          <option key={d.value} value={d.value}>{d.label}</option>
        ))}
      </select>
      <label className="block text-[11px] font-semibold uppercase mb-1" style={{ color: "rgba(200,212,192,0.55)", letterSpacing: "0.08em" }}>
        Service times
      </label>
      <div className="flex flex-col gap-2 mb-2">
        {times.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="time"
              value={t.time}
              onChange={e => {
                const v = e.target.value;
                setTimes(prev => prev.map((row, idx) => idx === i ? { ...row, time: v } : row));
              }}
              className="px-2 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm tabular-nums"
              style={{ color: "#F0EDE6", minWidth: 110 }}
            />
            <input
              type="text"
              value={t.label}
              onChange={e => {
                const v = e.target.value;
                setTimes(prev => prev.map((row, idx) => idx === i ? { ...row, label: v } : row));
              }}
              placeholder="Label (optional)"
              className="flex-1 min-w-0 px-2 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
            />
            <button
              type="button"
              onClick={() => setTimes(prev => prev.filter((_, idx) => idx !== i))}
              aria-label="Remove time"
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
        <Plus size={12} /> Add time
      </button>
      <div className="flex items-center gap-3">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || times.length === 0}
          className="px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="text-xs"
          style={{ color: "#9a9390" }}
        >
          Cancel
        </button>
        {schedule && (
          <button
            onClick={() => {
              if (confirm("Delete the service schedule?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            className="ml-auto text-xs"
            style={{ color: "#C47A65" }}
          >
            {deleteMutation.isPending ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Service-time pill row ────────────────────────────────────────────────
// One pill per service time, rendered on a single line. When the row
// overflows the container width (narrow phone + many times) we switch to
// an auto-scroll ticker so the pills stay legible instead of wrapping or
// clipping. Mirrors the dashboard's ServiceTimesPillRow verbatim so the
// card looks identical to the one on the home screen.
function ServiceTimesPillRow({ schedule }: { schedule: ServiceScheduleRecord }) {
  // Static "<Month D> — Tap to See All Service Times" teaser.
  if (schedule.times.length === 0) return null;
  const now = new Date();
  const diff = (schedule.dayOfWeek - now.getDay() + 7) % 7;
  const nextDate = new Date(now);
  nextDate.setDate(now.getDate() + diff);
  const dateLabel = nextDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  return (
    <div className="mt-2 text-xs font-medium" style={{ color: "#F0EDE6", letterSpacing: "-0.01em" }}>
      <span style={{ color: "#C8D4C0" }}>{dateLabel}</span>
      <span style={{ color: "rgba(200,212,192,0.6)" }}> — </span>
      <span>Tap to See All Service Times</span>
    </div>
  );
}

// ─── Community home — Sunday Service card ──────────────────────────────────
// Pill-based card that mirrors the home dashboard's `ServiceCard` visual so
// the community home tab reads as a scoped sibling of the main home screen.
// Fetches the same `/api/groups/:slug/service-schedule` endpoint the
// Gatherings tab uses. Renders nothing when the community hasn't set up a
// schedule yet — keeps the home tab quiet for new communities.
function CommunityServiceHomeCard({
  slug,
  groupName,
  groupEmoji,
  onOpen,
}: {
  slug: string;
  groupName: string;
  groupEmoji: string | null;
  onOpen: () => void;
}) {
  const { data } = useQuery<{ schedule: ServiceScheduleRecord | null; canEdit: boolean }>({
    queryKey: ["/api/groups", slug, "service-schedule"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/service-schedule`),
    enabled: !!slug,
  });
  const schedule = data?.schedule ?? null;
  if (!schedule || schedule.times.length === 0) return null;

  const dayLabel = DOW_NAMES.find(d => d.value === schedule.dayOfWeek)?.label ?? "Sunday";
  const title = schedule.name || `${dayLabel} Services`;

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: "#C8D4C0" }}>
        Gatherings
      </p>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
        className="block w-full text-left cursor-pointer"
      >
        <div
          className="relative flex rounded-xl overflow-hidden"
          style={{
            // `gatherings` category palette: bar #6FAF85, bg rgba(111,175,133,0.15)
            background: "rgba(111,175,133,0.15)",
            border: "1px solid rgba(111,175,133,0.35)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)",
          }}
        >
          <div className="w-1 flex-shrink-0" style={{ background: "#6FAF85" }} />
          <div className="flex-1 px-4 pt-3 pb-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-base font-semibold" style={{ color: "#F0EDE6" }}>
                🙌🏽 {title}
              </span>
              {/* Top-right eyebrow — matches the dashboard card, which puts
                  the community's emoji + name here. Same slot, same look,
                  even though the user is already inside that community. */}
              <span
                className="text-[10px] font-semibold uppercase shrink-0 mt-1"
                style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}
              >
                {groupEmoji ?? "⛪"} {groupName}
              </span>
            </div>

            {/* Pills — single-line with runtime overflow detection, same as
                the dashboard. Long rows auto-scroll instead of wrapping. */}
            <ServiceTimesPillRow schedule={schedule} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Community home — "Prayed this week" ticker ────────────────────────────
// Scrolls through every member who has prayed an intercession, checked in on
// a practice, or amened a prayer request in the last 7 days. Data comes from
// /api/groups/:slug/prayer-activity. Quiet (nothing rendered) when no one has
// prayed this week yet so the tab stays clean for new communities.
type PrayerActivityUser = {
  userId: number;
  name: string;
  avatarUrl: string | null;
  lastPrayedAt: string;
};

function PrayedThisWeekTicker({ slug }: { slug: string }) {
  const { data } = useQuery<{ users: PrayerActivityUser[] }>({
    queryKey: ["/api/groups", slug, "prayer-activity"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/prayer-activity`),
    enabled: !!slug,
  });
  // Dedupe server-side payload by userId as a belt-and-suspenders guard.
  // The server already dedupes, but a stale client-side duplicate would
  // show the same face twice — user flagged this explicitly.
  const users = useMemo(() => {
    const seen = new Set<number>();
    const out: PrayerActivityUser[] = [];
    for (const u of data?.users ?? []) {
      if (seen.has(u.userId)) continue;
      seen.add(u.userId);
      out.push(u);
    }
    return out;
  }, [data?.users]);

  // Overflow-driven ticker: measure the intrinsic width of the pill row
  // against the visible row width. If the pills fit, render them once
  // statically (no animation, no duplication). Only when they overflow
  // do we double + animate — earlier everyone saw a scrolling ticker
  // with a duplicated list, which made a two-person community look
  // like four.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [ticker, setTicker] = useState(false);
  useEffect(() => {
    const measure = () => {
      if (!containerRef.current || !contentRef.current) return;
      const overflow = contentRef.current.scrollWidth > containerRef.current.clientWidth + 1;
      setTicker(overflow);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);
    if (ro && contentRef.current) ro.observe(contentRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [users.length]);

  if (users.length === 0) return null;

  const renderPill = (u: PrayerActivityUser, key: string) => {
    const first = (u.name ?? "").split(/\s+/)[0] || "Friend";
    return (
      <div
        key={key}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full shrink-0"
        style={{
          background: "rgba(46,107,64,0.15)",
          border: "1px solid rgba(46,107,64,0.28)",
        }}
      >
        {u.avatarUrl ? (
          <img
            src={u.avatarUrl}
            alt={u.name}
            className="w-5 h-5 rounded-full object-cover shrink-0"
            style={{ border: "1px solid rgba(46,107,64,0.3)" }}
          />
        ) : (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
            style={{ background: "#1A4A2E", color: "#A8C5A0" }}
          >
            {(u.name ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: "#F0EDE6" }}>
          {first} prayed 🙏
        </span>
      </div>
    );
  };

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: "#C8D4C0" }}>
        Prayed This Week
      </p>
      <div
        ref={containerRef}
        className={`relative rounded-xl ${ticker ? "overflow-x-auto no-scrollbar" : "overflow-hidden"}`}
        style={{
          background: "rgba(46,107,64,0.08)",
          border: "1px solid rgba(46,107,64,0.2)",
          maskImage: ticker ? "linear-gradient(to right, black 0%, black 88%, transparent 100%)" : undefined,
          WebkitMaskImage: ticker ? "linear-gradient(to right, black 0%, black 88%, transparent 100%)" : undefined,
        }}
      >
        <div
          ref={contentRef}
          className="py-3"
          style={
            ticker
              ? {
                  display: "flex",
                  gap: 10,
                  width: "max-content",
                  paddingLeft: 12,
                  paddingRight: 40,
                }
              : {
                  display: "flex",
                  gap: 10,
                  paddingLeft: 12,
                  paddingRight: 12,
                  flexWrap: "nowrap",
                }
          }
        >
          {users.map((u) => renderPill(u, String(u.userId)))}
        </div>
      </div>
    </div>
  );
}

// ─── Community prayer compose bar ────────────────────────────────────────
// Mirrors the /prayer-list compose bar, but scoped to this community —
// posts directly to `POST /api/groups/:slug/prayer-requests`. Sits at
// the bottom of the community home tab so sharing a request feels just
// as immediate as the app-wide compose. No "for me / for someone else"
// popup here — inside a community the submission is always "share
// with this community", which matches how the existing Prayer Wall tab
// compose already behaves.

function CommunityPrayerComposeBar({ slug, groupName }: { slug: string; groupName: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState(false);

  const createRequest = useMutation({
    mutationFn: (body: string) =>
      apiRequest("POST", `/api/groups/${slug}/prayer-requests`, { body }),
    onSuccess: () => {
      setValue("");
      setSaved(true);
      // Auto-fade the confirmation so the bar returns to its idle state.
      setTimeout(() => setSaved(false), 2400);
      // Invalidate BOTH feeds:
      //   • the community's wall (still used by the Prayer Wall tab)
      //   • the global garden (now what the Home tab reads) so the new
      //     post appears on the home feed without a page refresh.
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "prayer-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prayer-requests"] });
    },
  });

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || createRequest.isPending) return;
    createRequest.mutate(trimmed);
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="Share a prayer... 🌿"
          maxLength={1000}
          disabled={createRequest.isPending}
          className="flex-1 text-sm px-4 py-2.5 rounded-xl border placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#8FAF96]/40 focus:border-[#8FAF96] transition-all"
          style={{ backgroundColor: "#091A10", borderColor: "rgba(46,107,64,0.3)", color: "#F0EDE6", fontFamily: FONT }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || createRequest.isPending}
          className="px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          style={{ backgroundColor: "#2D5E3F", color: "#F0EDE6" }}
        >
          🙏🏽
        </button>
      </div>
      <AnimatePresence>
        {saved && (
          <motion.p
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-xs mt-2"
            style={{ color: "#A8C5A0", fontFamily: FONT }}
          >
            ✓ Shared with {groupName}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CommunityDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const communitiesEnabled = true;
  const queryClient = useQueryClient();

  // Allow deep-linking to a specific tab via `?tab=members` etc. — lets
  // Community Settings "Edit Members" drop the viewer straight on the list.
  const search = useSearch();
  const initialTab = (() => {
    const t = new URLSearchParams(search).get("tab");
    return (["home", "prayer", "practices", "gatherings", "announcements", "members"] as const)
      .find((k) => k === t) ?? "home";
  })();
  const [activeTab, setActiveTab] = useState<"home" | "prayer" | "practices" | "gatherings" | "announcements" | "members">(initialTab);

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
  const [newPrayer, setNewPrayer] = useState("");
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("");
  const [newAnnouncementContent, setNewAnnouncementContent] = useState("");
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  // ── Prayer Circle — "Praying today" add form state ────────────────────
  // Members can add what they are carrying in prayer today. The form is
  // collapsed by default; when `showFocusForm` is true we reveal a type
  // chooser + subject input. Only shown on circle groups.
  const [showFocusForm, setShowFocusForm] = useState(false);
  const [focusType, setFocusType] = useState<"situation" | "cause" | "custom">("situation");
  const [focusSubject, setFocusSubject] = useState("");
  // ── Invite-by-email form (Members tab) ─────────────────────────────────
  // Pilot-admin affordance — lets a community admin type an email + optional
  // name and add the person directly, without having to share the community
  // invite link. Hidden for non-pilot admins (they still see the invite-link
  // modal) and for regular members.
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  // Role the admin wants to assign when adding a new member. Toggle in the
  // add-member panel; "hidden_admin" only shows for pilot (beta) users.
  const [pendingRole, setPendingRole] = useState<"member" | "admin" | "hidden_admin">("member");

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  const { data: groupData } = useQuery<{ group: Group; myRole: string; members: Member[]; intentions?: Intention[] }>({
    queryKey: ["/api/groups", slug],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}`),
    enabled: !!user && !!slug,
  });

  const { data: prayerData } = useQuery<{ requests: PrayerRequest[] }>({
    queryKey: ["/api/groups", slug, "prayer-requests"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/prayer-requests`),
    enabled: !!user && !!slug && activeTab === "prayer",
  });

  const { data: practicesData } = useQuery<{ practices: Practice[] }>({
    queryKey: ["/api/groups", slug, "practices"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/practices`),
    enabled: !!user && !!slug && activeTab === "practices",
  });

  const { data: gatheringsData } = useQuery<{ gatherings: Gathering[] }>({
    queryKey: ["/api/groups", slug, "gatherings"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/gatherings`),
    enabled: !!user && !!slug && activeTab === "gatherings",
  });

  const { data: announcementsData } = useQuery<{ announcements: Announcement[] }>({
    queryKey: ["/api/groups", slug, "announcements"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/announcements`),
    enabled: !!user && !!slug && (activeTab === "announcements" || activeTab === "home"),
  });

  // Home-feed data: pull the rich moments list + this community's prayer
  // requests so the front page can render a dashboard-style mix of
  // intercessions, practices, and prayer requests — scoped to this group.
  const { data: momentsData } = useQuery<{ moments: CommunityMoment[] }>({
    queryKey: ["/api/moments"],
    queryFn: () => apiRequest("GET", "/api/moments"),
    enabled: !!user && activeTab === "home",
  });
  // Community home is scoped to THIS community's members only — the
  // backend endpoint filters to (group_id = this group) OR (owner is a
  // joined member of this community). Earlier we routed this to the
  // global /api/prayer-requests feed which leaked prayers from every
  // community the viewer was in (Marcus showed up on Heavenly Rest even
  // though he isn't a member). Back to community-scoped.
  const { data: homePrayerData } = useQuery<{ requests: PrayerRequest[] }>({
    queryKey: ["/api/groups", slug, "prayer-requests"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/prayer-requests`),
    enabled: !!user && !!slug && activeTab === "home",
  });

  // Today's prayer focus — only fetched once we know this is a circle group.
  // Server returns an empty list for non-circles, but we still gate the
  // query so the network request only fires where it's meaningful.
  const isCircle = !!groupData?.group?.isPrayerCircle;
  const { data: focusData } = useQuery<{ date: string | null; focus: FocusEntry[] }>({
    queryKey: ["/api/groups", slug, "focus"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/focus`),
    enabled: !!user && !!slug && isCircle && activeTab === "home",
  });

  // Pull the service schedule at the parent level too (React Query
  // dedupes by key with the one inside CommunityServiceHomeCard, so no
  // extra network call) — the "nothing here yet" guard below needs to
  // know whether a Sunday Service card will render before it decides
  // to paint the empty-state message. Previously the empty-state fired
  // even though a Gatherings card was plainly visible on the page.
  const { data: serviceScheduleData } = useQuery<{ schedule: ServiceScheduleRecord | null; canEdit: boolean }>({
    queryKey: ["/api/groups", slug, "service-schedule"],
    queryFn: () => apiRequest("GET", `/api/groups/${slug}/service-schedule`),
    enabled: !!user && !!slug && activeTab === "home",
  });
  const hasServiceSchedule = !!serviceScheduleData?.schedule && serviceScheduleData.schedule.times.length > 0;

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

  const prayerMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/prayer-requests`, { body: newPrayer }),
    onSuccess: () => {
      setNewPrayer("");
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "prayer-requests"] });
    },
  });

  const announcementMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/groups/${slug}/announcements`, {
      title: newAnnouncementTitle || undefined,
      content: newAnnouncementContent,
    }),
    onSuccess: () => {
      setNewAnnouncementTitle("");
      setNewAnnouncementContent("");
      setShowAnnouncementForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug, "announcements"] });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: number) => apiRequest("DELETE", `/api/groups/${slug}/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
    },
  });

  // Pilot-admin "add member directly" mutation. The backend endpoint sets
  // `joinedAt: new Date()` so the person shows up as a full member right
  // away — no invite-email roundtrip, no pending-state purgatory.
  // `role` is optional — the server defaults to "member" and gates
  // "hidden_admin" behind the acting admin being a pilot user.
  const addMemberMutation = useMutation({
    mutationFn: (person: { name?: string; email: string; role?: "member" | "admin" | "hidden_admin" }) =>
      apiRequest("POST", `/api/groups/${slug}/members`, { people: [person] }),
    onSuccess: () => {
      setInviteName("");
      setInviteEmail("");
      setInviteError("");
      queryClient.invalidateQueries({ queryKey: ["/api/groups", slug] });
    },
    onError: (err: any) => {
      setInviteError(err?.message || "Couldn't add that member. Please try again.");
    },
  });

  // Change a member's role between member / admin / hidden_admin. The
  // server enforces the pilot gate on anything touching hidden_admin and
  // blocks demoting the last admin, so the client can stay naive about
  // those guardrails — it just shows an error toast on failure.
  const changeRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: "member" | "admin" | "hidden_admin" }) =>
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
      let msg = err?.message || "Couldn't change that role. Please try again.";
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
  // Pilot (beta) flag — used to gate admin-only invite-by-email form on the
  // Members tab. A community admin who is also a pilot user gets the form;
  // non-pilot admins still have the shareable invite-link modal.
  const { isBeta } = useBetaStatus();

  if (authLoading || !user) return null;
  if (!groupData) return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full text-center py-20">
        <p className="text-sm" style={{ color: "#8FAF96" }}>Loading...</p>
      </div>
    </Layout>
  );

  const { group, myRole, members } = groupData;
  // Hidden admins have full admin powers — same gate as real admins. The
  // only difference is that they're filtered from the roster for non-admin
  // viewers (server-side, so the list never even hits the client).
  const isAdmin = (myRole === "admin" || myRole === "hidden_admin") && communityAdminView;
  // "Can invite by email" = admin of this community AND viewing as a pilot
  // user. Non-pilot admins still get the shareable invite-link modal; this
  // unlocks the direct-add form on the Members tab.
  const canInviteByEmail = isAdmin && isBeta;

  const tabs = [
    { key: "home" as const, label: "Home", emoji: "🏡" },
    { key: "gatherings" as const, label: "Gatherings", emoji: "🤝🏽" },
    { key: "announcements" as const, label: "Announcements", emoji: "📮" },
    { key: "members" as const, label: "Members", emoji: "👥" },
  ];

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
            ← Communities
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
                  const joinedCount = members.filter(m => m.joinedAt !== null && m.role !== "hidden_admin").length;
                  return `${joinedCount} ${joinedCount === 1 ? "member" : "members"}`;
                })()}
              </p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setLocation(`/communities/${slug}/settings`)}
                className="p-2 rounded-xl"
                style={{ background: "rgba(46,107,64,0.15)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.25)" }}
                title="Community settings"
              >
                <Settings size={15} />
              </button>
              <button
                onClick={() => setShowInvite(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                <Plus size={14} /> Invite
              </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Prayer Circle intentions ──────────────────────────────────
            For circle groups, surface every active intention as its own card
            above the regular community content. Each card leads with the
            prayer itself (serif voice for sacred phrases) and optionally
            includes scripture / situation / person context below. A single
            closing note marks the whole stack as circle-beta. Legacy circles
            whose intentions still live on groups.intention are rendered as
            one synthetic card (id=0 from the server fallback). */}
        {group.isPrayerCircle && (groupData.intentions?.length ?? 0) > 0 && (
          <div className="mb-5">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-2 px-1"
              style={{ color: "rgba(200,212,192,0.55)" }}
            >
              Group intentions
            </p>
            {/* Compact intention cards — smaller than the earlier
                "We pray" serif block. Keeps the italic voice for the
                prayer text but shrinks padding + font so multiple
                intentions read as a stack, not as headline slabs. */}
            <div className="flex flex-col gap-1.5">
              {groupData.intentions!.map((intn) => (
                <div
                  key={intn.id}
                  className="rounded-xl px-3 py-2"
                  style={{
                    background: "rgba(46,107,64,0.08)",
                    border: "1px solid rgba(46,107,64,0.22)",
                  }}
                >
                  <p
                    className="text-sm italic leading-snug"
                    style={{
                      color: "#F0EDE6",
                      fontFamily: "var(--font-serif, 'Playfair Display'), Georgia, serif",
                    }}
                  >
                    {intn.title}
                  </p>
                  {intn.description && (
                    <p className="text-xs leading-relaxed mt-1" style={{ color: "rgba(200,212,192,0.75)" }}>
                      {intn.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
              return `${totalCount} new arrivals`;
            }
            if (newMembers.length > 0) {
              if (newMembers.length === 1) {
                const m = newMembers[0];
                const first = (m.name ?? "").split(/\s+/)[0] || "Someone";
                return `${first} joined ${group.name}`;
              }
              return `${newMembers.length} new members joined`;
            }
            if (newPrayers.length === 1) return "A new prayer request";
            return `${newPrayers.length} new prayer requests`;
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
              style={{ background: "rgba(9,26,16,0.85)", backdropFilter: "blur(4px)" }}
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
                      Something new
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
                      {newMembers.length === 1 ? "New member" : "New members"}
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
                              {m.name || "A new friend"}
                            </p>
                            <p className="text-[11px]" style={{ color: "#8FAF96" }}>
                              joined {new Date(m.joinedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </p>
                          </div>
                        </div>
                      ))}
                      {newMembers.length > 5 && (
                        <p className="text-[11px] text-center pt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
                          + {newMembers.length - 5} more
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* New prayer requests list */}
                {newPrayers.length > 0 && (
                  <div className="px-5 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(200,212,192,0.55)" }}>
                      {newPrayers.length === 1 ? "New prayer request" : "New prayer requests"}
                    </p>
                    <div className="space-y-1.5">
                      {newPrayers.slice(0, 3).map(p => (
                        <div
                          key={p.id}
                          className="px-3 py-2 rounded-lg"
                          style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}
                        >
                          <p className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: "rgba(200,212,192,0.45)" }}>
                            From {p.isAnonymous ? "Someone" : (p.ownerName ?? "A member")}
                          </p>
                          <p className="text-sm leading-relaxed line-clamp-2" style={{ color: "#F0EDE6", fontFamily: FONT }}>
                            {p.body}
                          </p>
                        </div>
                      ))}
                      {newPrayers.length > 3 && (
                        <p className="text-[11px] text-center pt-1" style={{ color: "rgba(143,175,150,0.6)" }}>
                          + {newPrayers.length - 3} more on the Prayer Wall
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
                        setActiveTab("prayer");
                        dismiss();
                      }}
                      className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                      style={{ background: "rgba(46,107,64,0.2)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.4)" }}
                    >
                      See prayers
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
                      See members
                    </button>
                  )}
                  <button
                    onClick={dismiss}
                    className="flex-1 py-2.5 rounded-lg text-xs font-semibold"
                    style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                  >
                    Got it
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
          const inviteUrl = group.inviteToken
            ? `${window.location.origin}/communities/join/${group.slug}/${group.inviteToken}`
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
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>Share invite link</p>
                <button onClick={() => { setShowInvite(false); setLinkCopied(false); }}>
                  <X size={16} style={{ color: "#8FAF96" }} />
                </button>
              </div>

              <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.75)" }}>
                Anyone with this link can join {group.name}. If it's shared too widely, rotate it below.
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
                      title="Copy to clipboard"
                    >
                      {linkCopied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      if (window.confirm("Rotate the invite link? The current URL will stop working immediately.")) {
                        rotateInviteMutation.mutate();
                      }
                    }}
                    disabled={rotateInviteMutation.isPending}
                    className="w-full py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                    style={{ background: "rgba(46,107,64,0.15)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}
                  >
                    <RefreshCw size={12} /> {rotateInviteMutation.isPending ? "Rotating…" : "Rotate link"}
                  </button>
                </>
              ) : (
                <p className="text-xs" style={{ color: "rgba(143,175,150,0.55)" }}>
                  Invite link not available.
                </p>
              )}
            </div>
          );
        })()}

        {/* Tabs — user-scrollable horizontal strip */}
        <ScrollStrip className="mb-5" contentStyle={{ gap: 8 }}>
            {tabs.map((t, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(t.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0"
                style={{
                  background: activeTab === t.key ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.1)",
                  color: activeTab === t.key ? "#F0EDE6" : "#8FAF96",
                  border: `1px solid ${activeTab === t.key ? "rgba(46,107,64,0.55)" : "rgba(46,107,64,0.2)"}`,
                }}
              >
                <span>{t.emoji}</span> {t.label}
              </button>
            ))}
        </ScrollStrip>

        {/* ─── Home ─── Dashboard-style feed filtered to this community.
             A moment counts as "this community's" if either:
               - its primary group matches the slug, OR
               - it was attached post-creation via moment_groups and
                 that junction row points here (surfaced in the
                 /api/moments payload as `additionalGroups`).
             Before this filter was widened, adding a second community
             to an intercession silently failed to show up on that
             community's home tab. */}
        {activeTab === "home" && (() => {
          const communityMoments = (momentsData?.moments ?? []).filter(
            (m) => m.group?.slug === slug
              || (m.additionalGroups ?? []).some(g => g.slug === slug),
          );
          const intercessions = communityMoments.filter((m) => m.templateType === "intercession");
          const otherPractices = communityMoments.filter((m) => m.templateType !== "intercession");
          // Show every active prayer request on the home tab — no slice.
          // Previously clamped to 3 with a "See all →" to the Prayer Wall
          // tab, but users kept missing requests because the list was
          // buried between announcements and the nothingYet empty-state.
          const recentPrayers = homePrayerData?.requests ?? [];
          const recentAnnouncements = (announcementsData?.announcements ?? []).slice(0, 2);

          const stripEmoji = (s: string) =>
            // eslint-disable-next-line no-misleading-character-class
            s.replace(/[\s\u200d]*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component})+$/u, "").trim();

          const renderMomentCard = (m: CommunityMoment, emoji: string) => {
            // Intercessions are now group-scoped, not people-scoped —
            // show which communities this practice is shared with
            // instead of listing individual members. We're already on
            // this community's page, so skip our own group in the list
            // and only surface OTHER groups it's also in (if any).
            const allGroups = [
              ...(m.group ? [m.group] : []),
              ...(m.additionalGroups ?? []),
            ];
            const otherGroups = allGroups
              .filter((g) => g.slug !== slug)
              .map((g) => `${g.emoji ?? "🏘️"} ${g.name}`);
            const alsoSharedLabel =
              otherGroups.length === 0
                ? null
                : otherGroups.length === 1
                  ? `Also shared with ${otherGroups[0]}`
                  : `Also shared with ${otherGroups.slice(0, 2).join(", ")}${otherGroups.length > 2 ? ` +${otherGroups.length - 2}` : ""}`;
            const goal = m.commitmentSessionsGoal ?? (m.goalDays && m.goalDays > 0 && m.goalDays < 365 ? m.goalDays : null);
            const logged = m.computedSessionsLogged ?? (m.commitmentSessionsLogged ?? 0);
            const progressLabel = goal ? `${logged}/${goal} days` : null;
            // Always land on the deep detail page — /moments/:id — which now
            // carries the full prayer + community ritual. Earlier we routed
            // window-open intercessions to the tiny /moment/:token/:userToken
            // Amen page, but that flattens the experience and contradicts the
            // home dashboard + prayer-list behaviour. The detail page already
            // surfaces a "Pray now" affordance when the window is open.
            const href = `/moments/${m.id}`;
            const prayedToday = m.todayPostCount > 0;
            const cardTitle = stripEmoji(m.intercessionTopic || m.intention || m.name);

            return (
              <Link key={m.id} href={href} className="block">
                <div
                  className="relative flex rounded-xl overflow-hidden"
                  style={{
                    background: "rgba(46,107,64,0.15)",
                    border: `1px solid ${m.windowOpen && !prayedToday ? "rgba(46,107,64,0.5)" : "rgba(46,107,64,0.25)"}`,
                  }}
                >
                  <div className="w-1 flex-shrink-0" style={{ background: m.windowOpen ? "#2E6B40" : "rgba(46,107,64,0.3)" }} />
                  <div className="flex-1 px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>
                        {emoji} {cardTitle}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {progressLabel && (
                          <span className="text-[10px] font-semibold uppercase" style={{ color: "#C8D4C0", letterSpacing: "0.08em" }}>
                            {progressLabel}
                          </span>
                        )}
                        {m.windowOpen && !prayedToday && (
                          <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                            Pray now
                          </span>
                        )}
                        {prayedToday && (
                          <span className="text-[10px]" style={{ color: "#8FAF96" }}>Prayed today 🌿</span>
                        )}
                        {!m.windowOpen && !prayedToday && (
                          <span className="text-[10px]" style={{ color: "rgba(143,175,150,0.4)" }}>Not today</span>
                        )}
                      </div>
                    </div>
                    {alsoSharedLabel && (
                      <p className="text-[11px] mt-0.5 truncate" style={{ color: "#8FAF96" }}>{alsoSharedLabel}</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          };

          const nothingYet =
            intercessions.length === 0 &&
            otherPractices.length === 0 &&
            recentPrayers.length === 0 &&
            recentAnnouncements.length === 0 &&
            // A visible Sunday Service card is plenty to fill the page —
            // earlier we printed "nothing here yet" right under it, which
            // the user flagged as wrong ("cause there is something there").
            !hasServiceSchedule &&
            // On circle groups, a populated "Praying today" list also counts
            // as "something here" so the dead-end empty-state doesn't shout
            // over the intention + focus the member just came to see.
            !(group.isPrayerCircle && (focusData?.focus.length ?? 0) > 0);

          const focusEntries = focusData?.focus ?? [];
          const currentUserEmail = user.email;

          return (
            <div className="space-y-6">
              {/* ── Praying today — only rendered for circle groups ────────
                  Lists every focus added for today (in the viewer's tz).
                  Members can add via the "+ Add" button; entries are
                  removable by the adder or any admin. We keep this above
                  intercessions/practices so it reads as the heartbeat of a
                  prayer circle. */}
              {group.isPrayerCircle && (
                <div>
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#C8D4C0" }}>
                      Praying Today
                    </p>
                    {!showFocusForm && (
                      <button
                        onClick={() => setShowFocusForm(true)}
                        className="text-[11px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-80"
                        style={{ color: "#A8C5A0" }}
                      >
                        <Plus size={12} /> Add
                      </button>
                    )}
                  </div>

                  {showFocusForm && (
                    <div
                      className="rounded-xl p-3 mb-3"
                      style={{ background: "rgba(46,107,64,0.1)", border: "1px solid rgba(46,107,64,0.28)" }}
                    >
                      <div className="flex gap-1.5 mb-2">
                        {(["situation", "cause", "custom"] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setFocusType(t)}
                            className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full transition-all"
                            style={{
                              background: focusType === t ? "rgba(46,107,64,0.35)" : "rgba(46,107,64,0.08)",
                              color: focusType === t ? "#F0EDE6" : "#8FAF96",
                              border: `1px solid ${focusType === t ? "rgba(46,107,64,0.5)" : "rgba(46,107,64,0.18)"}`,
                            }}
                          >
                            {t === "situation" ? "Situation" : t === "cause" ? "Cause" : "Other"}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={focusSubject}
                        onChange={e => setFocusSubject(e.target.value)}
                        placeholder={
                          focusType === "situation"
                            ? "A situation or event we're holding in prayer…"
                            : focusType === "cause"
                              ? "A cause we're lifting up…"
                              : "What are we praying for?"
                        }
                        maxLength={280}
                        className="w-full px-3 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm mb-2"
                        style={{ color: "#F0EDE6", fontFamily: FONT }}
                        onKeyDown={e => {
                          if (e.key === "Enter" && focusSubject.trim()) addFocusMutation.mutate();
                        }}
                      />
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => { setShowFocusForm(false); setFocusSubject(""); }}
                          className="text-[11px] px-3 py-1.5 rounded-lg"
                          style={{ color: "#8FAF96" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => addFocusMutation.mutate()}
                          disabled={!focusSubject.trim() || addFocusMutation.isPending}
                          className="text-[11px] font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
                          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                        >
                          {addFocusMutation.isPending ? "Adding…" : "Add"}
                        </button>
                      </div>
                    </div>
                  )}

                  {focusEntries.length === 0 ? (
                    <p className="text-[12px] italic text-center py-3" style={{ color: "rgba(143,175,150,0.55)" }}>
                      Nothing named yet today. Be the first to bring something to the circle.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {focusEntries.map(f => {
                        const isAdder = f.addedBy?.email === currentUserEmail;
                        const canDelete = isAdder || isAdmin;
                        const label = f.focusType === "situation"
                          ? "Situation"
                          : f.focusType === "cause"
                            ? "Cause"
                            : f.focusType === "person"
                              ? "Person"
                              : null;
                        const subjectLine = f.subject
                          ? (f.subject.name || "A friend")
                          : (f.subjectText || "");
                        return (
                          <div
                            key={f.id}
                            className="flex rounded-xl overflow-hidden"
                            style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}
                          >
                            <div className="w-1 shrink-0" style={{ background: "#E8B872" }} />
                            <div className="flex-1 flex items-center gap-3 px-4 py-3 min-w-0">
                              {f.subject?.avatarUrl ? (
                                <img
                                  src={f.subject.avatarUrl}
                                  alt={f.subject.name ?? ""}
                                  className="w-8 h-8 rounded-full object-cover shrink-0"
                                  style={{ border: "1px solid rgba(46,107,64,0.4)" }}
                                />
                              ) : f.focusType === "person" ? (
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                  style={{ background: "#1A4A2E", color: "#A8C5A0" }}
                                >
                                  {(f.subject?.name ?? f.subjectText ?? "?").charAt(0).toUpperCase()}
                                </div>
                              ) : (
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                                  style={{ background: "rgba(232,184,114,0.15)", border: "1px solid rgba(232,184,114,0.3)" }}
                                >
                                  <Heart size={14} style={{ color: "#E8B872" }} />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                {label && (
                                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: "rgba(200,212,192,0.5)" }}>
                                    {label}
                                  </p>
                                )}
                                <p className="text-sm leading-snug truncate" style={{ color: "#F0EDE6", fontFamily: FONT }}>
                                  {subjectLine}
                                </p>
                                {f.addedBy && (
                                  <p className="text-[11px] mt-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
                                    added by {isAdder ? "you" : (f.addedBy.name || f.addedBy.email.split("@")[0])}
                                  </p>
                                )}
                              </div>
                              {canDelete && (
                                <button
                                  onClick={() => {
                                    if (window.confirm("Remove this from today's prayer?")) {
                                      removeFocusMutation.mutate(f.id);
                                    }
                                  }}
                                  disabled={removeFocusMutation.isPending}
                                  className="shrink-0 p-1 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
                                  title="Remove"
                                >
                                  <X size={14} style={{ color: "rgba(143,175,150,0.55)" }} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Who-prayed-this-week ticker — scrolls through every
                  community member who has prayed an intercession or amened
                  a prayer request in the last 7 days. Kept just below the
                  optional "Praying Today" list (circle groups) and above
                  Intercessions so it reads as "here's the pulse of the
                  community." Dormant (nothing rendered) when no one has
                  prayed this week yet. */}
              {/* PrayedThisWeekTicker intentionally not rendered right
                  now — user asked to take the section out while we
                  work through the dedupe + motion behaviour. The
                  component is still defined above so re-enabling is a
                  one-line change. */}
              {null}

              {/* Gatherings — Sunday Service card. Uses the same pill-
                  based visual as the home dashboard's ServiceCard so the
                  community page reads as a scoped sibling of the main
                  home screen. Quiet (nothing rendered) when the community
                  hasn't set up a schedule yet. */}
              <CommunityServiceHomeCard
                slug={slug!}
                groupName={group.name}
                groupEmoji={group.emoji}
                onOpen={() => setActiveTab("gatherings")}
              />

              {/* Intercessions — the most prayed-through surface, shown first */}
              {intercessions.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: "#C8D4C0" }}>
                    Intercessions
                  </p>
                  <div className="space-y-2">
                    {intercessions.map((m) => renderMomentCard(m, "🙏🏽"))}
                  </div>
                </div>
              )}

              {/* Other practices — fasts, lectio, morning prayer, etc. */}
              {otherPractices.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: "#C8D4C0" }}>
                    Practices
                  </p>
                  <div className="space-y-2">
                    {otherPractices.map((m) => renderMomentCard(m, "🌿"))}
                  </div>
                </div>
              )}

              {/* Prayer Requests — unified section combining the compose
                  bar + the full list of active requests from any member
                  of this community. Always visible for members so a
                  drop-by can post without hunting for a tab, and the
                  list appears right next to the composer so new posts
                  show up in context. */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em]" style={{ color: "#C8D4C0" }}>
                    Prayer Requests
                  </h2>
                  <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.15)" }} />
                </div>
                <CommunityPrayerComposeBar slug={slug!} groupName={group.name} />
                {recentPrayers.length > 0 && (
                  <div className="space-y-2 mt-4">
                    {recentPrayers.map((r) => (
                      <div key={r.id} className="flex rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                        <div className="w-1 shrink-0" style={{ background: "#8FAF96" }} />
                        <div className="flex-1 px-4 py-3">
                          <p className="text-[10px] font-medium uppercase tracking-widest mb-0.5" style={{ color: "rgba(200,212,192,0.45)" }}>
                            {r.isOwnRequest ? "Your request" : `From ${r.isAnonymous ? "Someone" : r.ownerName}`}
                          </p>
                          <p className="text-sm leading-relaxed" style={{ color: "#F0EDE6", fontFamily: FONT }}>
                            {r.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Announcements — a small pinned section */}
              {recentAnnouncements.length > 0 && (
                <div>
                  <div className="flex items-baseline justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: "#C8D4C0" }}>
                      Announcements
                    </p>
                    <button
                      onClick={() => setActiveTab("announcements")}
                      className="text-[11px] font-medium transition-opacity hover:opacity-80"
                      style={{ color: "#A8C5A0" }}
                    >
                      See all →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {recentAnnouncements.map((a) => (
                      <div key={a.id} className="rounded-xl px-4 py-3" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                        {a.title && (
                          <p className="text-sm font-semibold mb-1" style={{ color: "#F0EDE6" }}>{a.title}</p>
                        )}
                        <p className="text-sm leading-relaxed line-clamp-2" style={{ color: "#C8D4C0" }}>
                          {a.content}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {nothingYet && (
                <p className="text-sm text-center py-10" style={{ color: "rgba(143,175,150,0.5)" }}>
                  Nothing here yet.{isAdmin ? " Start a practice, gathering, or announcement from the tabs above." : ""}
                </p>
              )}
              {/* Compose + list now live in the unified Prayer Requests
                  section above, next to the intercession cards. The
                  old bottom-of-home compose was removed once they
                  merged. */}
            </div>
          );
        })()}

        {/* ─── Prayer Wall ─── */}
        {activeTab === "prayer" && (
          <div>
            {/* New prayer input */}
            <div className="flex gap-2 mb-5">
              <input
                type="text"
                value={newPrayer}
                onChange={e => setNewPrayer(e.target.value)}
                placeholder="Share a prayer request..."
                maxLength={1000}
                className="flex-1 px-4 py-2.5 rounded-xl border border-[#2E6B40]/30 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
                style={{ color: "#F0EDE6" }}
                onKeyDown={e => { if (e.key === "Enter" && newPrayer.trim()) prayerMutation.mutate(); }}
              />
              <button
                onClick={() => prayerMutation.mutate()}
                disabled={!newPrayer.trim() || prayerMutation.isPending}
                className="px-3 py-2.5 rounded-xl text-sm disabled:opacity-40"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                🙏🏽
              </button>
            </div>

            {(prayerData?.requests ?? []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                No prayer requests yet. Be the first to share.
              </p>
            ) : (
              <div className="space-y-2">
                {prayerData!.requests.map(r => (
                  <div key={r.id} className="flex rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                    <div className="w-1 shrink-0" style={{ background: "#8FAF96" }} />
                    <div className="flex-1 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-widest mb-0.5" style={{ color: "rgba(200,212,192,0.45)" }}>
                            From {r.isAnonymous ? "Someone" : r.ownerName}
                          </p>
                          <p className="text-sm leading-relaxed" style={{ color: "#F0EDE6", fontFamily: FONT }}>
                            {r.body}
                          </p>
                        </div>
                        {r.wordCount > 0 && (
                          <div className="flex items-center gap-1 shrink-0 mt-1" style={{ color: "rgba(143,175,150,0.45)" }}>
                            <span className="text-[10px] tabular-nums">{r.wordCount}</span>
                            <MessageCircle size={12} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Practices ─── */}
        {activeTab === "practices" && (
          <div>
            {isAdmin && (
              <Link href="/moment/new" className="block mb-4">
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(46,107,64,0.15)", border: "1px dashed rgba(46,107,64,0.3)", color: "#8FAF96" }}>
                  <Plus size={16} /> Create a practice for this community
                </div>
              </Link>
            )}
            {(practicesData?.practices ?? []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                No practices yet.{isAdmin ? " Create one above." : ""}
              </p>
            ) : (
              <div className="space-y-2">
                {practicesData!.practices.map(p => (
                  <Link key={p.id} href={`/moments/${p.id}`} className="block">
                    <div className="flex rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                      <div className="w-1 shrink-0" style={{ background: "#5C8A5F" }} />
                      <div className="flex-1 px-4 py-3">
                        <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{p.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>{p.intention}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Gatherings ─── */}
        {activeTab === "gatherings" && (
          <div>
            <ServicesSection slug={slug!} isAdmin={isAdmin} />
            {isAdmin && (
              <Link href={`/tradition/new?community=${slug}`} className="block mb-4">
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm" style={{ background: "rgba(46,107,64,0.15)", border: "1px dashed rgba(46,107,64,0.3)", color: "#8FAF96" }}>
                  <Plus size={16} /> Create a gathering for this community
                </div>
              </Link>
            )}
            {(gatheringsData?.gatherings ?? []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                No gatherings yet.{isAdmin ? " Create one above." : ""}
              </p>
            ) : (
              <div className="space-y-2">
                {gatheringsData!.gatherings.map(g => (
                  <Link key={g.id} href={`/ritual/${g.id}`} className="block">
                    <div className="flex rounded-xl overflow-hidden" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                      <div className="w-1 shrink-0" style={{ background: "#6FAF85" }} />
                      <div className="flex-1 px-4 py-3">
                        <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>{g.name}</p>
                        {g.description && <p className="text-xs mt-0.5 truncate" style={{ color: "#8FAF96" }}>{g.description}</p>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Announcements ─── */}
        {activeTab === "announcements" && (
          <div>
            {isAdmin && !showAnnouncementForm && (
              <button
                onClick={() => setShowAnnouncementForm(true)}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-sm mb-4"
                style={{ background: "rgba(46,107,64,0.15)", border: "1px dashed rgba(46,107,64,0.3)", color: "#8FAF96" }}
              >
                <Plus size={16} /> Post an announcement
              </button>
            )}
            {isAdmin && showAnnouncementForm && (
              <div className="mb-4 rounded-xl p-4" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>New Announcement</p>
                  <button onClick={() => setShowAnnouncementForm(false)}><X size={16} style={{ color: "#8FAF96" }} /></button>
                </div>
                <input
                  type="text"
                  value={newAnnouncementTitle}
                  onChange={e => setNewAnnouncementTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm mb-2"
                  style={{ color: "#F0EDE6" }}
                />
                <textarea
                  value={newAnnouncementContent}
                  onChange={e => setNewAnnouncementContent(e.target.value)}
                  placeholder="Write your announcement..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm resize-none mb-2"
                  style={{ color: "#F0EDE6" }}
                />
                <button
                  onClick={() => announcementMutation.mutate()}
                  disabled={!newAnnouncementContent.trim() || announcementMutation.isPending}
                  className="px-5 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {announcementMutation.isPending ? "Posting..." : "Post"}
                </button>
              </div>
            )}
            {(announcementsData?.announcements ?? []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "rgba(143,175,150,0.5)" }}>
                No announcements yet.
              </p>
            ) : (
              <div className="space-y-3">
                {announcementsData!.announcements.map(a => (
                  <div key={a.id} className="rounded-xl px-4 py-3" style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.25)" }}>
                    {a.title && (
                      <p className="text-sm font-semibold mb-1" style={{ color: "#F0EDE6" }}>{a.title}</p>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#C8D4C0" }}>
                      {a.content}
                    </p>
                    <p className="text-[10px] mt-2" style={{ color: "rgba(143,175,150,0.45)" }}>
                      {a.authorName} · {new Date(a.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Members ─── */}
        {activeTab === "members" && (() => {
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
          // Simple email validation — used by the free-email fallback in
          // the member picker (for inviting someone not yet in the viewer's
          // fellowship). Server still validates.
          const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

          const memberEmails = new Set(members.map(m => m.email.toLowerCase()));

          const addPerson = (person: { name?: string; email: string }, role?: "member" | "admin" | "hidden_admin") => {
            const email = person.email.trim().toLowerCase();
            if (!isValidEmail(email)) {
              setInviteError("Please enter a valid email.");
              return;
            }
            if (memberEmails.has(email)) {
              setInviteError("That person is already in this community.");
              return;
            }
            setInviteError("");
            addMemberMutation.mutate({
              email,
              name: person.name?.trim() || undefined,
              role: role ?? pendingRole,
            });
          };

          return (
          <div>
            {/* Pilot-admin "add directly" block — bypasses the invite-link
                flow. Appears at the top of the members tab, above the
                roster. Non-pilot admins still see the shareable invite-link
                modal from the header; regular members don't see this at all. */}
            {canInviteByEmail && user && (
              <MemberPicker
                groupName={group.name}
                ownerId={user.id}
                memberEmails={memberEmails}
                inviteName={inviteName}
                inviteEmail={inviteEmail}
                inviteError={inviteError}
                pendingRole={pendingRole}
                isBeta={isBeta}
                isPending={addMemberMutation.isPending}
                setInviteName={setInviteName}
                setInviteEmail={setInviteEmail}
                setInviteError={setInviteError}
                setPendingRole={setPendingRole}
                onPick={(person) => addPerson(person)}
              />
            )}

            <div className="space-y-1.5">
              {members.filter(m => m.joinedAt !== null).map(m => {
                const isSelf = m.email.toLowerCase() === (user.email ?? "").toLowerCase();
                const isHiddenAdmin = m.role === "hidden_admin";
                const isRoleAdmin = m.role === "admin";
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
                  <Link href={`/people/${encodeURIComponent(m.email)}`} className="flex-1 min-w-0">
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
                          Admin
                        </span>
                      )}
                      {isHiddenAdmin && (
                        // Amber tag only shown to admins (the server filters
                        // hidden admins from non-admin rosters so this row
                        // never reaches a regular member anyway).
                        <span
                          className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(193,127,36,0.18)", color: "#E8B872", border: "1px solid rgba(193,127,36,0.35)" }}
                          title="Invisible member with admin access (pilot-designated)"
                        >
                          Hidden admin
                        </span>
                      )}
                      {isRecentlyJoined(m.joinedAt) && (
                        // Amber accent — matches the "praying for you" card on People,
                        // the other place where we quietly surface "something new".
                        <span
                          className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(193,127,36,0.18)", color: "#E8B872", border: "1px solid rgba(193,127,36,0.35)" }}
                          title={`Joined ${new Date(m.joinedAt!).toLocaleDateString()}`}
                        >
                          New
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{m.email}</p>
                  </Link>
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
                          {changingThisRow ? "…" : "Make admin"}
                        </button>
                      )}
                      {!isSelf && isRoleAdmin && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (window.confirm(`Demote ${m.name || m.email} back to a regular member?`)) {
                              changeRoleMutation.mutate({ memberId: m.id, role: "member" });
                            }
                          }}
                          disabled={changingThisRow}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "rgba(143,175,150,0.75)", border: "1px solid rgba(143,175,150,0.2)" }}
                        >
                          {changingThisRow ? "…" : "Demote"}
                        </button>
                      )}
                      {/* Pilot-only hidden-admin toggle — works on SELF too,
                          so pilots can self-designate. Server pilot-gates
                          it regardless. */}
                      {isBeta && !isHiddenAdmin && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const who = isSelf ? "yourself" : (m.name || m.email);
                            const msg = isSelf
                              ? "Make yourself a hidden admin? You'll keep admin powers but disappear from the roster for regular members."
                              : `Make ${who} a hidden admin? They'll gain admin powers but won't appear in the roster for regular members.`;
                            if (window.confirm(msg)) {
                              changeRoleMutation.mutate({ memberId: m.id, role: "hidden_admin" });
                            }
                          }}
                          disabled={changingThisRow}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "#E8B872", background: "rgba(193,127,36,0.1)", border: "1px solid rgba(193,127,36,0.3)" }}
                          title="Pilot-only"
                        >
                          {changingThisRow ? "…" : "Hidden"}
                        </button>
                      )}
                      {isBeta && isHiddenAdmin && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const who = isSelf ? "yourself" : (m.name || m.email);
                            const msg = isSelf
                              ? "Reveal yourself as a regular member? You'll show up in the roster and lose admin powers."
                              : `Reveal ${who} as a regular member? They'll appear in the roster and lose admin powers.`;
                            if (window.confirm(msg)) {
                              changeRoleMutation.mutate({ memberId: m.id, role: "member" });
                            }
                          }}
                          disabled={changingThisRow}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "#E8B872", background: "rgba(193,127,36,0.1)", border: "1px solid rgba(193,127,36,0.3)" }}
                        >
                          {changingThisRow ? "…" : "Reveal"}
                        </button>
                      )}
                      {!isSelf && (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const label = m.name || m.email;
                            if (window.confirm(`Remove ${label} from ${group.name}? They'll lose access to every practice attached to this community.`)) {
                              removeMemberMutation.mutate(m.id);
                            }
                          }}
                          disabled={removeMemberMutation.isPending}
                          className="text-[10px] px-2 py-1 rounded-lg disabled:opacity-40"
                          style={{ color: "rgba(143,175,150,0.5)", border: "1px solid rgba(143,175,150,0.2)" }}
                        >
                          Remove
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
                      Pending Invites
                    </p>
                    <div className="space-y-1">
                      {groupData!.members.filter(m => !m.joinedAt).map(m => (
                        <div key={m.id} className="flex items-center justify-between px-4 py-2 rounded-xl" style={{ background: "rgba(46,107,64,0.05)" }}>
                          <p className="text-xs truncate mr-2" style={{ color: "rgba(143,175,150,0.55)" }}>
                            {m.name || m.email}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] italic" style={{ color: "rgba(143,175,150,0.35)" }}>pending</span>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const label = m.name || m.email;
                                if (window.confirm(`Cancel the invite for ${label}?`)) {
                                  removeMemberMutation.mutate(m.id);
                                }
                              }}
                              disabled={removeMemberMutation.isPending}
                              className="text-[10px] px-2 py-0.5 rounded-lg disabled:opacity-40"
                              style={{ color: "rgba(143,175,150,0.5)", border: "1px solid rgba(143,175,150,0.2)" }}
                            >
                              Cancel
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

    </Layout>
  );
}

// ─── Member picker ───────────────────────────────────────────────────────
// Typeahead-backed add-member panel for pilot admins. Pulls the viewer's
// fellowship from /api/people (via usePeople), filters locally on typing,
// and hides anyone already in this community. If the admin wants to
// invite someone outside their fellowship, the "Add by email" fallback
// at the bottom accepts a free email + optional name.
//
// Role selection lives at the top as a segmented control. "Hidden admin"
// only shows for pilot (beta) viewers — for everyone else, adding defaults
// to "member" with an optional admin toggle.
function MemberPicker({
  groupName,
  ownerId,
  memberEmails,
  inviteName,
  inviteEmail,
  inviteError,
  pendingRole,
  isBeta,
  isPending,
  setInviteName,
  setInviteEmail,
  setInviteError,
  setPendingRole,
  onPick,
}: {
  groupName: string;
  ownerId: number;
  memberEmails: Set<string>;
  inviteName: string;
  inviteEmail: string;
  inviteError: string;
  pendingRole: "member" | "admin" | "hidden_admin";
  isBeta: boolean;
  isPending: boolean;
  setInviteName: (v: string) => void;
  setInviteEmail: (v: string) => void;
  setInviteError: (v: string) => void;
  setPendingRole: (v: "member" | "admin" | "hidden_admin") => void;
  onPick: (person: { name?: string; email: string }) => void;
}) {
  const [q, setQ] = useState("");
  const { data: people = [], isLoading } = usePeople(ownerId);

  // Candidates = people in the viewer's fellowship who are NOT already in
  // this community, filtered live by the search string. We keep already-
  // joined people out of the dropdown entirely so the admin isn't tempted
  // to re-add them.
  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (p: PersonSummary) =>
      !needle ||
      p.name.toLowerCase().includes(needle) ||
      p.email.toLowerCase().includes(needle);
    return people
      .filter(p => !memberEmails.has(p.email.toLowerCase()))
      .filter(match);
  }, [people, q, memberEmails]);

  // The free-email fallback only shows when the admin typed something
  // that looks like an email and it doesn't match an existing candidate.
  // Keeps the UI quiet while they're just browsing their fellowship.
  const trimmed = q.trim();
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const matchesCandidate = candidates.some(p => p.email.toLowerCase() === trimmed.toLowerCase());
  const showEmailFallback = looksLikeEmail && !matchesCandidate;

  const roleLabel = (r: "member" | "admin" | "hidden_admin") =>
    r === "admin" ? "Admin" : r === "hidden_admin" ? "Hidden admin" : "Member";

  return (
    <div
      className="mb-4 rounded-xl p-4"
      style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>Add member</p>
        <span
          className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
          style={{ background: "rgba(232,184,114,0.15)", color: "#E8B872", border: "1px solid rgba(232,184,114,0.35)", letterSpacing: "0.08em" }}
        >
          Pilot
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: "rgba(143,175,150,0.75)" }}>
        Add someone to {groupName} directly. Type to search your fellowship,
        or enter an email to invite someone new.
      </p>

      {/* Role segmented control. Server-enforced — the "hidden_admin"
          option is still only honored when the acting admin is a pilot,
          so a non-pilot manipulating the DOM would still be rejected. */}
      <div className="flex items-center gap-1 mb-3">
        {(isBeta
          ? (["member", "admin", "hidden_admin"] as const)
          : (["member", "admin"] as const)
        ).map(r => {
          const active = pendingRole === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setPendingRole(r)}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-opacity"
              style={{
                background: active
                  ? (r === "hidden_admin" ? "rgba(193,127,36,0.25)" : "rgba(46,107,64,0.35)")
                  : "transparent",
                color: active
                  ? (r === "hidden_admin" ? "#E8B872" : "#F0EDE6")
                  : "rgba(200,212,192,0.6)",
                border: `1px solid ${active
                  ? (r === "hidden_admin" ? "rgba(193,127,36,0.5)" : "rgba(46,107,64,0.5)")
                  : "rgba(46,107,64,0.25)"}`,
              }}
            >
              {roleLabel(r)}
            </button>
          );
        })}
      </div>

      {/* Search / typeahead */}
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 mb-2"
        style={{ background: "#091A10", border: "1px solid rgba(46,107,64,0.3)" }}
      >
        <SearchIcon size={14} style={{ color: "#8FAF96" }} />
        <input
          type="text"
          value={q}
          onChange={(e) => { setQ(e.target.value); setInviteError(""); }}
          placeholder="Search by name or email…"
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: "#F0EDE6" }}
        />
      </div>

      {inviteError && (
        <p className="text-xs mb-2" style={{ color: "#C47A65" }}>{inviteError}</p>
      )}

      {/* Candidate list — clamped to ~4 rows so the form doesn't explode. */}
      <div
        className="space-y-1 mb-2"
        style={{ maxHeight: 220, overflowY: "auto" }}
      >
        {isLoading && (
          <p className="text-xs italic" style={{ color: "rgba(143,175,150,0.55)" }}>Loading your fellowship…</p>
        )}
        {!isLoading && candidates.length === 0 && !showEmailFallback && (
          <p className="text-xs italic" style={{ color: "rgba(143,175,150,0.55)" }}>
            {q.trim()
              ? "No one in your fellowship matches. Type their email below to invite directly."
              : "Everyone in your fellowship is already here."}
          </p>
        )}
        {!isLoading && candidates.map(p => (
          <button
            key={p.email}
            type="button"
            onClick={() => onPick({ name: p.name, email: p.email })}
            disabled={isPending}
            className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors disabled:opacity-40"
            style={{ background: "rgba(9,26,16,0.6)", border: "1px solid rgba(46,107,64,0.25)" }}
          >
            {p.avatarUrl ? (
              <img src={p.avatarUrl} alt={p.name} className="w-7 h-7 rounded-full object-cover shrink-0" style={{ border: "1px solid rgba(46,107,64,0.3)" }} />
            ) : (
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>
                {p.name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("")}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate" style={{ color: "#F0EDE6" }}>{p.name}</p>
              <p className="text-[10px] truncate" style={{ color: "rgba(143,175,150,0.65)" }}>{p.email}</p>
            </div>
            <span className="text-[10px] shrink-0" style={{ color: "rgba(168,197,160,0.75)" }}>
              Add {roleLabel(pendingRole).toLowerCase()}
            </span>
          </button>
        ))}
      </div>

      {/* Free-email fallback. Optional name + the typed email. Lets the
          admin invite someone who isn't in their fellowship yet. */}
      {showEmailFallback && (
        <div
          className="rounded-lg p-3 mt-2"
          style={{ background: "rgba(9,26,16,0.4)", border: "1px dashed rgba(46,107,64,0.35)" }}
        >
          <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "rgba(143,175,150,0.55)" }}>
            Not in your fellowship yet
          </p>
          <input
            type="text"
            value={inviteName}
            onChange={e => { setInviteName(e.target.value); setInviteError(""); }}
            placeholder="Name (optional)"
            className="w-full px-3 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm mb-2"
            style={{ color: "#F0EDE6" }}
          />
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail || trimmed}
              onChange={e => { setInviteEmail(e.target.value); setInviteError(""); }}
              placeholder="Email"
              className="flex-1 px-3 py-2 rounded-lg border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
            />
            <button
              onClick={() => onPick({
                email: (inviteEmail || trimmed).trim(),
                name: inviteName.trim() || undefined,
              })}
              disabled={isPending || !(inviteEmail || trimmed).trim()}
              className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 shrink-0"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              {isPending ? "Adding…" : `Add ${roleLabel(pendingRole).toLowerCase()}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
