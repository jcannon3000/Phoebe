import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Calendar, ExternalLink, MapPin, Users, ChevronRight, Unlink } from "lucide-react";
import {
  parseISO, format, isToday, isTomorrow, isThisWeek,
  startOfDay, addDays, differenceInCalendarDays,
} from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useListRituals } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/layout";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GCalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location: string | null;
  allDay: boolean;
  url: string | null;
  description: string | null;
  calendarName: string | null;
  colorHex: string | null;
}

// Unified event for the timeline
interface TimelineEvent {
  key: string;
  kind: "phoebe" | "gcal";
  date: Date;           // start date (for grouping)
  startStr: string;     // display time
  endStr?: string;
  title: string;
  subtitle?: string;
  location?: string | null;
  href?: string;        // internal nav link
  url?: string | null;  // external link (gcal)
  colorHex?: string | null;
  participants?: string;
  allDay?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dateGroupLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  const days = differenceInCalendarDays(d, startOfDay(new Date()));
  if (days < 7) return format(d, "EEEE"); // e.g. "Wednesday"
  if (days < 14) return `Next ${format(d, "EEEE")}`;
  return format(d, "MMMM d");
}

function timeStr(iso: string, allDay: boolean): string {
  if (allDay) return "All day";
  const d = parseISO(iso);
  return format(d, "h:mm a");
}

function rhythmLabel(r: any): string {
  const rhythm = r.rhythm as string | undefined;
  if (rhythm === "weekly") return "Weekly";
  if (rhythm === "fortnightly") return "Every 2 weeks";
  if (rhythm === "monthly") return "Monthly";
  return r.frequency ?? "Recurring";
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function GatheringsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [showAll, setShowAll] = useState(false);

  const { data: rituals, isLoading: ritualsLoading } = useListRituals({ ownerId: user?.id });

  const { data: gcalEvents, isLoading: gcalLoading } = useQuery<GCalEvent[]>({
    queryKey: ["/api/gatherings/calendar-events"],
    queryFn: () => apiRequest("GET", "/api/gatherings/calendar-events"),
    enabled: !!user?.calendarConnected,
    staleTime: 5 * 60 * 1000,
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/google/calendar/disconnect"),
    onSuccess: () => {
      qc.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, calendarConnected: false } : prev
      );
      qc.removeQueries({ queryKey: ["/api/gatherings/calendar-events"] });
    },
  });

  if (!user) { setLocation("/"); return null; }

  const isLoading = ritualsLoading || (user.calendarConnected && gcalLoading);

  // ── Build unified timeline ─────────────────────────────────────────────────
  const events: TimelineEvent[] = [];

  // Phoebe gatherings
  for (const r of rituals ?? []) {
    const next = (r as any).nextMeetupDate ? parseISO((r as any).nextMeetupDate) : null;
    const parts: string[] = ((r.participants ?? []) as any[])
      .slice(0, 3)
      .map((p: any) => (p.name || p.email || "").split(" ")[0]);
    const extra = ((r.participants ?? []) as any[]).length - 3;

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

  // Google Calendar events
  for (const ev of gcalEvents ?? []) {
    if (!ev.start) continue;
    const date = ev.allDay ? parseISO(ev.start) : parseISO(ev.start);
    events.push({
      key: ev.id,
      kind: "gcal",
      date,
      startStr: timeStr(ev.start, ev.allDay),
      endStr: ev.end && !ev.allDay ? timeStr(ev.end, false) : undefined,
      title: ev.title,
      subtitle: ev.calendarName ?? undefined,
      location: ev.location,
      url: ev.url,
      colorHex: ev.colorHex,
      allDay: ev.allDay,
    });
  }

  // Sort by date, then time
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

  const PREVIEW_GROUPS = 4;
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
            {/* New gathering shortcut */}
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

        {/* ── Google Calendar connect / status ── */}
        {!user.calendarConnected ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-2xl px-5 py-4 flex items-start justify-between gap-4"
            style={{ background: "rgba(15,40,24,0.8)", border: "1px solid rgba(46,107,64,0.2)" }}
          >
            <div className="flex items-start gap-3">
              <Calendar size={18} className="mt-0.5 shrink-0" style={{ color: "#6FAF85" }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "#F0EDE6" }}>Connect Google Calendar</p>
                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                  See all your upcoming events in one place, alongside your Phoebe gatherings.
                </p>
              </div>
            </div>
            <a
              href="/api/auth/google/calendar"
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80 whitespace-nowrap"
              style={{ background: "#2D5E3F", color: "#F0EDE6" }}
            >
              Connect
            </a>
          </motion.div>
        ) : (
          <div className="mb-5 flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "#4CAF70" }} />
              <span className="text-xs" style={{ color: "#8FAF96" }}>Google Calendar connected</span>
            </div>
            <button
              onClick={() => disconnectMutation.mutate()}
              className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
              style={{ color: "rgba(143,175,150,0.5)" }}
            >
              <Unlink size={11} /> Disconnect
            </button>
          </div>
        )}

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
              Start a gathering, or connect your Google Calendar to see everything here.
            </p>
            <div className="flex gap-3 flex-wrap justify-center">
              <Link href="/tradition/new">
                <button className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "#2D5E3F", color: "#F0EDE6" }}>
                  Start a gathering
                </button>
              </Link>
              {!user.calendarConnected && (
                <a href="/api/auth/google/calendar">
                  <button className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "rgba(46,107,64,0.15)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.25)" }}>
                    Connect Calendar
                  </button>
                </a>
              )}
            </div>
          </motion.div>
        )}

        {/* ── Timeline ── */}
        {!isLoading && grouped.length > 0 && (
          <div className="space-y-6">
            <AnimatePresence>
              {visibleGroups.map((group, gi) => (
                <motion.div
                  key={group.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: gi * 0.04 }}
                >
                  {/* Day header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="shrink-0">
                      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: isToday(group.date) ? "#6FAF85" : "rgba(200,212,192,0.45)" }}>
                        {group.label}
                      </p>
                      {!isToday(group.date) && !isTomorrow(group.date) && differenceInCalendarDays(group.date, new Date()) >= 7 && (
                        <p className="text-[10px]" style={{ color: "rgba(143,175,150,0.4)" }}>
                          {format(group.date, "EEE, MMM d")}
                        </p>
                      )}
                    </div>
                    <div className="flex-1 h-px" style={{ background: "rgba(200,212,192,0.1)" }} />
                  </div>

                  {/* Events in this day */}
                  <div className="space-y-2.5 pl-0">
                    {group.items.map(ev => (
                      <EventCard key={ev.key} event={ev} />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {hasMore && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 flex items-center justify-center gap-2"
                style={{ background: "rgba(46,107,64,0.1)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.15)" }}
              >
                Show all {grouped.length} weeks <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <Link
        href="/tradition/new"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
        style={{ background: "#1A4A2E", color: "#F0EDE6" }}
        aria-label="New gathering"
      >
        <Plus size={24} />
      </Link>
    </Layout>
  );
}

// ─── Event Card ───────────────────────────────────────────────────────────────

function EventCard({ event }: { event: TimelineEvent }) {
  const accent = event.kind === "gcal"
    ? (event.colorHex ?? "#4A9E84")
    : "#5C8A5F";

  const inner = (
    <div
      className="relative flex rounded-xl overflow-hidden transition-all"
      style={{
        background: event.kind === "gcal" ? "rgba(10,28,18,0.7)" : "#0F2818",
        border: `1px solid ${event.kind === "gcal" ? "rgba(74,158,132,0.2)" : "rgba(92,138,95,0.28)"}`,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {/* Color bar */}
      <div className="w-1 shrink-0" style={{ background: accent }} />

      <div className="flex-1 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Time */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: "rgba(143,175,150,0.7)" }}>
                {event.startStr}
                {event.endStr && <> – {event.endStr}</>}
              </span>
              {event.kind === "gcal" && (
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(74,158,132,0.12)", color: "rgba(111,175,133,0.7)", border: "1px solid rgba(74,158,132,0.18)" }}
                >
                  Google
                </span>
              )}
            </div>

            {/* Title */}
            <p className="text-sm font-semibold truncate" style={{ color: "#F0EDE6" }}>
              {event.title}
            </p>

            {/* Subtitle / calendar name */}
            {event.subtitle && (
              <p className="text-xs mt-0.5 truncate" style={{ color: "rgba(143,175,150,0.6)" }}>
                {event.subtitle}
              </p>
            )}

            {/* Location */}
            {event.location && (
              <div className="flex items-center gap-1 mt-1.5">
                <MapPin size={10} style={{ color: "rgba(143,175,150,0.5)", flexShrink: 0 }} />
                <span className="text-[11px] truncate" style={{ color: "rgba(143,175,150,0.6)" }}>
                  {event.location}
                </span>
              </div>
            )}

            {/* Participants (Phoebe only) */}
            {event.participants && (
              <div className="flex items-center gap-1 mt-1.5">
                <Users size={10} style={{ color: "rgba(143,175,150,0.5)", flexShrink: 0 }} />
                <span className="text-[11px]" style={{ color: "rgba(143,175,150,0.6)" }}>
                  {event.participants}
                </span>
              </div>
            )}
          </div>

          {/* Arrow / external link */}
          <div className="shrink-0 mt-1">
            {event.kind === "gcal" && event.url
              ? <ExternalLink size={13} style={{ color: "rgba(143,175,150,0.35)" }} />
              : <ChevronRight size={14} style={{ color: "rgba(143,175,150,0.35)" }} />
            }
          </div>
        </div>
      </div>
    </div>
  );

  if (event.href) {
    return <Link href={event.href}>{inner}</Link>;
  }
  if (event.url) {
    return <a href={event.url} target="_blank" rel="noopener noreferrer">{inner}</a>;
  }
  return inner;
}
