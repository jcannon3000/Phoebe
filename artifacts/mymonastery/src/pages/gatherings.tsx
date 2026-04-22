import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Calendar, ExternalLink, MapPin, Users, ChevronRight, X, Link2 } from "lucide-react";
import {
  parseISO, format, isToday, isTomorrow,
  startOfDay, addDays, differenceInCalendarDays,
} from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useListRituals } from "@workspace/api-client-react";
import { useCommunityAdminToggle } from "@/hooks/useDemo";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalSub {
  id: number;
  name: string;
  url: string;
  colorHex: string | null;
}

interface ICalEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  description: string | null;
  url: string | null;
  subscriptionId: number;
  calendarName: string;
  colorHex: string | null;
}

interface TimelineEvent {
  key: string;
  kind: "phoebe" | "ical" | "service";
  date: Date;
  startStr: string;
  endStr?: string;
  title: string;
  subtitle?: string;
  location?: string | null;
  href?: string;
  url?: string | null;
  colorHex?: string | null;
  participants?: string;
  allDay?: boolean;
}

// Mirror of the dashboard's ServiceSchedule type — kept narrow to just
// what the timeline needs. One schedule expands to one timeline entry
// per service time on its next occurrence.
interface GatheringsServiceSchedule {
  id: number;
  name: string | null;
  dayOfWeek: number; // 0 = Sunday
  groupName: string;
  groupSlug: string;
  groupEmoji: string | null;
  location: string | null;
  times: Array<{ time: string; label: string | null; location: string | null }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateGroupLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  const days = differenceInCalendarDays(d, startOfDay(new Date()));
  if (days < 7) return format(d, "EEEE");
  if (days < 14) return `Next ${format(d, "EEEE")}`;
  return format(d, "MMMM d");
}

function timeStr(iso: string, allDay: boolean): string {
  if (allDay) return "All day";
  try { return format(parseISO(iso), "h:mm a"); } catch { return ""; }
}

// Format an "HH:mm" time (as stored on service schedules) to "8:00 AM".
// The whole-day anchor differs from timeStr above which expects an ISO.
function formatHHMM(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  h = ((h + 11) % 12) + 1;
  return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}

function rhythmLabel(r: any): string {
  const rhythm = r.rhythm as string | undefined;
  if (rhythm === "weekly") return "Weekly";
  if (rhythm === "fortnightly") return "Every 2 weeks";
  if (rhythm === "monthly") return "Monthly";
  return r.frequency ?? "Recurring";
}

// ─── Add Calendar Sheet ───────────────────────────────────────────────────────

function AddCalendarSheet({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/gatherings/calendars", { url, name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gatherings/calendars"] });
      qc.invalidateQueries({ queryKey: ["/api/gatherings/calendar-events"] });
      onAdded();
      onClose();
    },
    onError: async (err: any) => {
      const msg = err?.message ?? "Could not add that calendar.";
      setError(msg);
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "tween", duration: 0.28, ease: "easeOut" }}
        className="w-full max-w-lg rounded-t-3xl px-6 pt-6 pb-10"
        style={{ background: "#0A1C12", border: "1px solid rgba(46,107,64,0.2)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Add a public calendar
          </h2>
          <button onClick={onClose} style={{ color: "#8FAF96" }}><X size={18} /></button>
        </div>

        <p className="text-sm mb-5" style={{ color: "#8FAF96" }}>
          Paste a Google Calendar link, an iCal (.ics) URL, or a{" "}
          <span style={{ color: "#A8C5A0" }}>webcal://</span> link. The calendar must be public.
        </p>

        {/* How to get the link */}
        <div
          className="rounded-xl px-4 py-3 mb-5 text-xs space-y-1"
          style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.15)", color: "#8FAF96" }}
        >
          <p className="font-semibold" style={{ color: "#A8C5A0" }}>How to find your Google Calendar link:</p>
          <p>1. Open Google Calendar → Settings → select your calendar</p>
          <p>2. Scroll to "Integrate calendar"</p>
          <p>3. Copy the <strong>Public address in iCal format</strong></p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
              Calendar URL
            </label>
            <input
              type="url"
              value={url}
              onChange={e => { setUrl(e.target.value); setError(""); }}
              placeholder="https://calendar.google.com/calendar/ical/..."
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{
                background: "rgba(46,107,64,0.08)",
                border: "1px solid rgba(46,107,64,0.2)",
                color: "#F0EDE6",
              }}
              autoFocus
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: "rgba(143,175,150,0.6)" }}>
              Name <span style={{ opacity: 0.5 }}>(optional — auto-detected)</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. St. John's Parish"
              className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
              style={{
                background: "rgba(46,107,64,0.08)",
                border: "1px solid rgba(46,107,64,0.2)",
                color: "#F0EDE6",
              }}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs mt-3" style={{ color: "#C47A65" }}>{error}</p>
        )}

        <button
          onClick={() => mutation.mutate()}
          disabled={!url.trim() || mutation.isPending}
          className="w-full mt-5 py-3.5 rounded-2xl font-semibold text-sm disabled:opacity-40 transition-opacity hover:opacity-90"
          style={{ background: "#2D5E3F", color: "#F0EDE6" }}
        >
          {mutation.isPending ? "Checking…" : "Add calendar"}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GatheringsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data: rituals, isLoading: ritualsLoading } = useListRituals({ ownerId: user?.id });

  const { data: subs = [] } = useQuery<CalSub[]>({
    queryKey: ["/api/gatherings/calendars"],
    queryFn: () => apiRequest("GET", "/api/gatherings/calendars"),
    enabled: !!user,
  });

  const { data: icalEvents = [], isLoading: icalLoading } = useQuery<ICalEvent[]>({
    queryKey: ["/api/gatherings/calendar-events"],
    queryFn: () => apiRequest("GET", "/api/gatherings/calendar-events"),
    enabled: !!user && subs.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Community service schedules — the Sunday-services cards on the
  // dashboard. Previously only surfaced there; now also in the unified
  // Gatherings timeline so "every event from every community I'm in"
  // is readable in one place.
  const { data: serviceSchedulesData } = useQuery<{ schedules: GatheringsServiceSchedule[] }>({
    queryKey: ["/api/me/service-schedules"],
    queryFn: () => apiRequest("GET", "/api/me/service-schedules"),
    enabled: !!user,
    staleTime: 60_000,
  });
  const serviceSchedules = serviceSchedulesData?.schedules ?? [];

  // Only group admins get the "+" FAB — starting a gathering belongs to the
  // admin role, not general membership.
  const { data: groupsData } = useQuery<{ groups: Array<{ myRole: string }> }>({
    queryKey: ["/api/groups"],
    queryFn: () => apiRequest("GET", "/api/groups"),
    enabled: !!user,
  });
  const [communityAdminView] = useCommunityAdminToggle();
  const isAdminOfAnyGroup = communityAdminView && (groupsData?.groups ?? []).some(g => g.myRole === "admin" || g.myRole === "hidden_admin");

  const removeSub = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/gatherings/calendars/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gatherings/calendars"] });
      qc.invalidateQueries({ queryKey: ["/api/gatherings/calendar-events"] });
    },
  });

  if (!user) { setLocation("/"); return null; }

  const isLoading = ritualsLoading || (subs.length > 0 && icalLoading);

  // ── Build unified timeline ─────────────────────────────────────────────────
  const events: TimelineEvent[] = [];

  for (const r of rituals ?? []) {
    const next = (r as any).nextMeetupDate ? parseISO((r as any).nextMeetupDate) : null;
    const parts = ((r.participants ?? []) as any[])
      .slice(0, 3).map((p: any) => (p.name || p.email || "").split(" ")[0]);
    const extra = Math.max(0, ((r.participants ?? []) as any[]).length - 3);
    events.push({
      key: `phoebe-${r.id}`,
      kind: "phoebe",
      date: next ?? addDays(new Date(), 99),
      startStr: next ? timeStr((r as any).nextMeetupDate, false) : rhythmLabel(r),
      title: r.name,
      subtitle: rhythmLabel(r),
      location: r.location,
      href: `/ritual/${r.id}`,
      participants: parts.length > 0
        ? parts.join(", ") + (extra > 0 ? ` +${extra}` : "")
        : undefined,
    });
  }

  for (const ev of icalEvents) {
    if (!ev.start) continue;
    const date = parseISO(ev.start.length === 10 ? ev.start + "T00:00:00" : ev.start);
    events.push({
      key: `ical-${ev.subscriptionId}-${ev.uid}`,
      kind: "ical",
      date,
      startStr: timeStr(ev.start, ev.allDay),
      endStr: ev.end && !ev.allDay ? timeStr(ev.end, false) : undefined,
      title: ev.title,
      subtitle: ev.calendarName,
      location: ev.location,
      url: ev.url,
      colorHex: ev.colorHex,
      allDay: ev.allDay,
    });
  }

  // Community service schedules — each schedule expands into one entry
  // per service time on its next occurrence. "Sunday 8am", "Sunday
  // 10am", "Sunday 5pm" read as three separate rows on the timeline so
  // a user can see every service their community is offering.
  for (const s of serviceSchedules) {
    if (!s.times.length) continue;
    const next = (() => {
      const d = startOfDay(new Date());
      const diff = (s.dayOfWeek - d.getDay() + 7) % 7;
      return addDays(d, diff);
    })();
    const scheduleName = s.name || "Sunday Services";
    for (const t of s.times) {
      // Parse the HH:mm into a Date anchored on `next` so sorting and
      // "Today / Tomorrow" grouping works the same as iCal events.
      const [hStr, mStr] = t.time.split(":");
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      const when = new Date(next);
      if (Number.isFinite(h) && Number.isFinite(m)) when.setHours(h, m, 0, 0);
      events.push({
        key: `service-${s.id}-${t.time}`,
        kind: "service",
        date: when,
        startStr: formatHHMM(t.time),
        title: t.label ? `${scheduleName} · ${t.label}` : scheduleName,
        subtitle: `${s.groupEmoji ?? "⛪"} ${s.groupName}`,
        location: t.location || s.location,
        href: `/communities/${s.groupSlug}`,
      });
    }
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Group by calendar date
  const grouped: { label: string; date: Date; items: TimelineEvent[] }[] = [];
  for (const ev of events) {
    const dayStr = format(ev.date, "yyyy-MM-dd");
    const last = grouped[grouped.length - 1];
    if (last && format(last.date, "yyyy-MM-dd") === dayStr) {
      last.items.push(ev);
    } else {
      grouped.push({ label: dateGroupLabel(ev.date), date: ev.date, items: [ev] });
    }
  }

  const PREVIEW_GROUPS = 5;
  const visibleGroups = showAll ? grouped : grouped.slice(0, PREVIEW_GROUPS);
  const hasMore = !showAll && grouped.length > PREVIEW_GROUPS;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full pb-28">

        {/* ── Header ── */}
        <div className="mb-5">
          <Link href="/dashboard" className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70" style={{ color: "#8FAF96" }}>
            ← Dashboard
          </Link>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                Gatherings
              </h1>
              <p className="text-sm mt-1" style={{ color: "#8FAF96" }}>
                Your community, meeting with intention.
              </p>
            </div>
            <Link href="/tradition/new">
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: "rgba(46,107,64,0.18)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}
              >
                <Plus size={12} /> New
              </button>
            </Link>
          </div>
        </div>

        {/* ── Subscribed calendars ── */}
        {subs.length > 0 && (
          <div className="mb-5 space-y-1.5">
            {subs.map(sub => (
              <div
                key={sub.id}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl gap-3"
                style={{ background: "rgba(15,40,24,0.7)", border: "1px solid rgba(46,107,64,0.15)" }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: sub.colorHex ?? "#4A9E84" }}
                  />
                  <span className="text-sm truncate" style={{ color: "#C8D4C0" }}>{sub.name}</span>
                </div>
                <button
                  onClick={() => removeSub.mutate(sub.id)}
                  className="shrink-0 transition-opacity hover:opacity-70"
                  style={{ color: "rgba(143,175,150,0.4)" }}
                  aria-label="Remove calendar"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Calendar subscriptions are managed by group admins in the group's
            settings — not here. We still render `subs` above so users can see
            what's feeding their gatherings view, but there's no add CTA. */}
        <div className="h-px mb-5" style={{ background: "rgba(200,212,192,0.1)" }} />

        {/* ── Loading ── */}
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "#0F2818" }} />
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!isLoading && events.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center text-center py-14"
          >
            <div className="text-5xl mb-5">📅</div>
            <p className="text-base font-semibold mb-1" style={{ color: "#F0EDE6" }}>Nothing coming up yet.</p>
            <p className="text-sm mb-6" style={{ color: "#8FAF96" }}>
              Start a gathering to see it here.
            </p>
            {isAdminOfAnyGroup && (
              <div className="flex gap-3 flex-wrap justify-center">
                <Link href="/tradition/new">
                  <button className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                    Start a gathering
                  </button>
                </Link>
              </div>
            )}
          </motion.div>
        )}

        {/* ── Timeline ── */}
        {!isLoading && grouped.length > 0 && (
          <div className="space-y-6">
            <AnimatePresence>
              {visibleGroups.map((group, gi) => (
                <motion.div
                  key={`${group.label}-${gi}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.04 }}
                >
                  {/* Day header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="shrink-0">
                      <p
                        className="text-xs font-bold uppercase tracking-widest"
                        style={{ color: isToday(group.date) ? "#6FAF85" : "rgba(200,212,192,0.45)" }}
                      >
                        {group.label}
                      </p>
                      {differenceInCalendarDays(group.date, new Date()) >= 7 && (
                        <p className="text-[10px]" style={{ color: "rgba(143,175,150,0.4)" }}>
                          {format(group.date, "EEE, MMM d")}
                        </p>
                      )}
                    </div>
                    <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.1)" }} />
                  </div>

                  <div className="space-y-2.5">
                    {group.items.map(ev => <EventCard key={ev.key} event={ev} />)}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {hasMore && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
                style={{ background: "rgba(46,107,64,0.1)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.15)" }}
              >
                Show all upcoming <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* FAB — admins only */}
      {isAdminOfAnyGroup && (
        <Link
          href="/tradition/new"
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
          style={{ background: "#1A4A2E", color: "#F0EDE6" }}
          aria-label="New gathering"
        >
          <Plus size={24} />
        </Link>
      )}

      {/* Add calendar sheet */}
      <AnimatePresence>
        {showAddSheet && (
          <AddCalendarSheet
            onClose={() => setShowAddSheet(false)}
            onAdded={() => setShowAll(true)}
          />
        )}
      </AnimatePresence>
    </Layout>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: TimelineEvent }) {
  const accent = event.kind === "ical"
    ? (event.colorHex ?? "#4A9E84")
    : "#5C8A5F";

  const inner = (
    <div
      className="relative flex rounded-xl overflow-hidden transition-all hover:brightness-110"
      style={{
        background: event.kind === "ical" ? "rgba(10,28,18,0.7)" : "#0F2818",
        border: `1px solid ${event.kind === "ical" ? "rgba(74,158,132,0.2)" : "rgba(92,138,95,0.28)"}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <div className="w-1 shrink-0" style={{ background: accent }} />
      <div className="flex-1 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: "rgba(143,175,150,0.7)" }}>
                {event.startStr}{event.endStr && ` – ${event.endStr}`}
              </span>
              {event.kind === "ical" && (
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(74,158,132,0.1)", color: "rgba(111,175,133,0.65)", border: "1px solid rgba(74,158,132,0.15)" }}
                >
                  {event.subtitle ?? "Calendar"}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>{event.title}</p>
            {event.kind === "phoebe" && event.subtitle && (
              <p className="text-xs mt-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>{event.subtitle}</p>
            )}
            {event.location && (
              <div className="flex items-center gap-1 mt-1.5">
                <MapPin size={10} style={{ color: "rgba(143,175,150,0.5)" }} />
                <span className="text-[11px] truncate" style={{ color: "rgba(143,175,150,0.6)" }}>{event.location}</span>
              </div>
            )}
            {event.participants && (
              <div className="flex items-center gap-1 mt-1.5">
                <Users size={10} style={{ color: "rgba(143,175,150,0.5)" }} />
                <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)" }}>{event.participants}</span>
              </div>
            )}
          </div>
          <div className="shrink-0 mt-1">
            {event.kind === "ical" && event.url
              ? <ExternalLink size={13} style={{ color: "rgba(143,175,150,0.3)" }} />
              : <ChevronRight size={14} style={{ color: "rgba(143,175,150,0.3)" }} />
            }
          </div>
        </div>
      </div>
    </div>
  );

  if (event.href) return <Link href={event.href}>{inner}</Link>;
  if (event.url) return <a href={event.url} target="_blank" rel="noopener noreferrer">{inner}</a>;
  return inner;
}
