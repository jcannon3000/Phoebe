import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { Layout } from "@/components/layout";
import { apiRequest } from "@/lib/queryClient";
import { Bell, BellOff, Calendar as CalendarIcon, Search, Send } from "lucide-react";

// One row per Phoebe account. "Active" means bellEnabled === true AND a
// daily send time is set AND a timezone is resolved — that's the minimum
// for bellSender.ts to actually fire. We surface each piece separately so
// the admin can see why a bell isn't firing (e.g. enabled but no timezone).
type BellUser = {
  id: number;
  email: string;
  name: string | null;
  bellEnabled: boolean;
  dailyBellTime: string | null;      // "HH:MM" in the user's TZ
  timezone: string | null;            // IANA, e.g. "America/New_York"
  hasCalendarEvent: boolean;          // Google Calendar event attached
  lastSentAt: string | null;          // ISO timestamp of the most recent send
  lastSentDate: string | null;        // YYYY-MM-DD in the user's TZ
  createdAt: string;
};

type BellsSummary = {
  totalUsers: number;
  bellsActive: number;
  sentToday: number;
};

type Filter = "all" | "active" | "inactive" | "sent-today" | "never-sent";

// Format "HH:MM 24h" → "7:00 AM" style. Keeps the raw value visible below
// in a muted style so admins can see the stored format too.
function formatTime(t: string | null): string {
  if (!t) return "—";
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return t;
  const hh = parseInt(m[1]!, 10);
  const mm = m[2]!;
  const period = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${mm} ${period}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type InviteResult = {
  attempted: number;
  sent: number;
  failed: number;
  users: Array<{ id: number; email: string; sent: boolean }>;
};

export default function BellsAdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: betaLoading } = useBetaStatus();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const sendInvitesMutation = useMutation<InviteResult>({
    mutationFn: () => apiRequest("POST", "/api/beta/bells/send-invites"),
    onSuccess: (data) => {
      setInviteResult(data);
      setShowConfirm(false);
      qc.invalidateQueries({ queryKey: ["/api/beta/bells"] });
    },
  });

  useEffect(() => {
    if (!authLoading && !user) setLocation("/");
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    if (!authLoading && !betaLoading && user && !isAdmin) {
      setLocation("/dashboard");
    }
  }, [user, authLoading, betaLoading, isAdmin, setLocation]);

  const { data, isLoading } = useQuery<{ users: BellUser[]; summary: BellsSummary }>({
    queryKey: ["/api/beta/bells"],
    queryFn: () => apiRequest("GET", "/api/beta/bells"),
    enabled: !!user && isAdmin,
    refetchOnWindowFocus: true,
    // A minute is plenty — the bell sender runs on a cron on the server, so
    // this page is viewing recent state, not live-updating every second.
    staleTime: 60_000,
  });

  const users = data?.users ?? [];
  const summary = data?.summary ?? { totalUsers: 0, bellsActive: 0, sentToday: 0 };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (q) {
        const hay = `${u.name ?? ""} ${u.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filter === "active" && !u.bellEnabled) return false;
      if (filter === "inactive" && u.bellEnabled) return false;
      if (filter === "sent-today") {
        if (!u.lastSentAt || !u.timezone || !u.lastSentDate) return false;
        try {
          const today = new Intl.DateTimeFormat("en-CA", { timeZone: u.timezone })
            .format(new Date());
          if (u.lastSentDate !== today) return false;
        } catch {
          return false;
        }
      }
      if (filter === "never-sent" && u.lastSentAt) return false;
      return true;
    });
  }, [users, search, filter]);

  if (authLoading || betaLoading || !user || !isAdmin) return null;

  const filterButton = (key: Filter, label: string, count?: number) => {
    const active = filter === key;
    return (
      <button
        key={key}
        onClick={() => setFilter(key)}
        className="px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors"
        style={{
          background: active ? "#2D5E3F" : "rgba(46,107,64,0.12)",
          color: active ? "#F0EDE6" : "#8FAF96",
          border: active ? "1px solid #2D5E3F" : "1px solid rgba(46,107,64,0.3)",
        }}
      >
        {label}
        {typeof count === "number" && (
          <span className="ml-1.5 opacity-70">{count}</span>
        )}
      </button>
    );
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto w-full">
        <div className="mb-6">
          <button
            onClick={() => setLocation("/dashboard")}
            className="text-xs mb-3 flex items-center gap-1 transition-opacity hover:opacity-70"
            style={{ color: "#8FAF96" }}
          >
            ← Dashboard
          </button>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
              Daily Bells
            </h1>
            <span className="text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(46,107,64,0.25)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.4)" }}>
              Admin
            </span>
          </div>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Who has the daily bell enabled, at what time, and whether it fired today.
          </p>
        </div>

        <div className="h-px mb-5" style={{ background: "rgba(200,212,192,0.12)" }} />

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          <SummaryTile label="Total users" value={summary.totalUsers} />
          <SummaryTile label="Bells active" value={summary.bellsActive} highlight />
          <SummaryTile label="Sent today" value={summary.sentToday} />
        </div>

        {/* Bulk invite action */}
        {!inviteResult ? (
          !showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              disabled={isLoading || summary.totalUsers - summary.bellsActive === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold mb-5 transition-opacity disabled:opacity-40"
              style={{
                background: "rgba(46,107,64,0.18)",
                border: "1px solid rgba(46,107,64,0.4)",
                color: "#8FAF96",
              }}
            >
              <Send size={14} />
              Send 7 AM bell invite to {summary.totalUsers - summary.bellsActive} users without a bell
            </button>
          ) : (
            <div
              className="rounded-xl px-4 py-4 mb-5"
              style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.35)" }}
            >
              <p className="text-sm font-semibold mb-1" style={{ color: "#F0EDE6" }}>
                Send 7 AM bell invite to {summary.totalUsers - summary.bellsActive} users?
              </p>
              <p className="text-[12px] mb-3" style={{ color: "rgba(143,175,150,0.8)" }}>
                Each user will receive a calendar invite (.ics) for a daily 7 AM bell and their bell will be enabled going forward.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => sendInvitesMutation.mutate()}
                  disabled={sendInvitesMutation.isPending}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: "#2D5E3F", color: "#F0EDE6" }}
                >
                  {sendInvitesMutation.isPending ? "Sending…" : "Send invites"}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={sendInvitesMutation.isPending}
                  className="px-4 py-2 rounded-lg text-sm transition-opacity disabled:opacity-50"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  Cancel
                </button>
              </div>
              {sendInvitesMutation.isError && (
                <p className="text-xs mt-2" style={{ color: "#E5A08F" }}>Something went wrong. Check the server logs.</p>
              )}
            </div>
          )
        ) : (
          <div
            className="rounded-xl px-4 py-4 mb-5"
            style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.35)" }}
          >
            <p className="text-sm font-semibold mb-1" style={{ color: "#8FE5A6" }}>
              ✓ Invites sent
            </p>
            <p className="text-[12px] mb-2" style={{ color: "rgba(143,175,150,0.8)" }}>
              {inviteResult.sent} of {inviteResult.attempted} invites delivered
              {inviteResult.failed > 0 && ` · ${inviteResult.failed} failed`}
            </p>
            {inviteResult.failed > 0 && (
              <div className="mb-2">
                <p className="text-[11px] mb-1" style={{ color: "rgba(143,175,150,0.6)" }}>Failed:</p>
                {inviteResult.users.filter(u => !u.sent).map(u => (
                  <p key={u.id} className="text-[11px]" style={{ color: "rgba(229,160,143,0.8)" }}>{u.email}</p>
                ))}
              </div>
            )}
            <button
              onClick={() => setInviteResult(null)}
              className="text-[11px] underline"
              style={{ color: "rgba(143,175,150,0.55)" }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Search + filter chips */}
        <div className="mb-4">
          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "rgba(143,175,150,0.5)" }}
            />
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#2E6B40]/40 focus:border-[#2E6B40] outline-none bg-transparent text-sm"
              style={{ color: "#F0EDE6" }}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
            {filterButton("all", "All", users.length)}
            {filterButton("active", "Active", summary.bellsActive)}
            {filterButton("inactive", "Inactive", summary.totalUsers - summary.bellsActive)}
            {filterButton("sent-today", "Sent today", summary.sentToday)}
            {filterButton("never-sent", "Never sent")}
          </div>
        </div>

        {/* User list */}
        {isLoading ? (
          <p className="text-sm text-center py-6" style={{ color: "rgba(143,175,150,0.5)" }}>
            Loading bells…
          </p>
        ) : filteredUsers.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "rgba(143,175,150,0.5)" }}>
            No users match.
          </p>
        ) : (
          <div className="space-y-1.5">
            {filteredUsers.map(u => (
              <BellRow key={u.id} user={u} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function SummaryTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className="rounded-xl px-3 py-3"
      style={{
        background: highlight ? "rgba(46,107,64,0.18)" : "rgba(46,107,64,0.06)",
        border: `1px solid rgba(46,107,64,${highlight ? 0.4 : 0.18})`,
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(200,212,192,0.5)" }}>
        {label}
      </p>
      <p className="text-xl font-bold mt-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </p>
    </div>
  );
}

function BellRow({ user: u }: { user: BellUser }) {
  const displayName = u.name || u.email.split("@")[0];

  // Derive a single status tag that captures the whole pipeline:
  //   active + fired today  → green pulse
  //   active + never fired  → amber (configured but silent)
  //   active + stale        → blue (fired, but not today)
  //   inactive              → muted (off)
  let status: { label: string; color: string; bg: string; border: string };
  if (!u.bellEnabled) {
    status = {
      label: "Off",
      color: "rgba(143,175,150,0.55)",
      bg: "rgba(46,107,64,0.05)",
      border: "rgba(46,107,64,0.15)",
    };
  } else {
    let firedToday = false;
    if (u.lastSentAt && u.timezone && u.lastSentDate) {
      try {
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: u.timezone })
          .format(new Date());
        firedToday = u.lastSentDate === today;
      } catch { /* leave false */ }
    }
    if (firedToday) {
      status = {
        label: "Fired today",
        color: "#8FE5A6",
        bg: "rgba(46,107,64,0.25)",
        border: "rgba(46,107,64,0.5)",
      };
    } else if (u.lastSentAt) {
      status = {
        label: `Last ${relativeTime(u.lastSentAt)}`,
        color: "#B5C9E5",
        bg: "rgba(70,100,140,0.15)",
        border: "rgba(70,100,140,0.35)",
      };
    } else {
      status = {
        label: "Active · never sent",
        color: "#E5C98F",
        bg: "rgba(140,110,50,0.15)",
        border: "rgba(140,110,50,0.35)",
      };
    }
  }

  return (
    <div
      className="px-4 py-3 rounded-xl"
      style={{ background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.2)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {u.bellEnabled ? (
              <Bell size={14} style={{ color: "#8FAF96" }} />
            ) : (
              <BellOff size={14} style={{ color: "rgba(143,175,150,0.35)" }} />
            )}
            <p className="text-sm font-medium truncate" style={{ color: "#F0EDE6" }}>
              {displayName}
            </p>
            {u.hasCalendarEvent && (
              <span title="Google Calendar event attached">
                <CalendarIcon size={12} style={{ color: "rgba(143,175,150,0.55)" }} />
              </span>
            )}
          </div>
          <p className="text-[11px] truncate mt-0.5" style={{ color: "rgba(143,175,150,0.55)" }}>
            {u.email}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
            <span className="text-[11px]" style={{ color: "rgba(200,212,192,0.7)" }}>
              {formatTime(u.dailyBellTime)}
            </span>
            <span className="text-[10px]" style={{ color: "rgba(143,175,150,0.4)" }}>
              {u.timezone ?? "no timezone set"}
            </span>
          </div>
        </div>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap shrink-0"
          style={{
            background: status.bg,
            color: status.color,
            border: `1px solid ${status.border}`,
          }}
        >
          {status.label}
        </span>
      </div>
    </div>
  );
}
