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
// Resolved from Google Calendar on the backend. "accepted" is the only
// state that means the invite is actually live on their calendar — every
// other non-"none" value means we need to follow up somehow (send an ICS,
// nudge them to respond, etc).
type InviteStatus =
  | "none"           // no event on file, bell is off
  | "ics-pending"    // bell is on but only an ICS was ever emailed
  | "needsAction"    // event exists, user hasn't RSVPed
  | "accepted"       // live on their calendar ✨
  | "tentative"      // RSVPed "maybe"
  | "declined"       // they said no
  | "stale"          // event still attached but bell disabled
  | "unknown";       // Google API hiccup — retryable

type BellUser = {
  id: number;
  email: string;
  name: string | null;
  bellEnabled: boolean;
  dailyBellTime: string | null;      // "HH:MM" in the user's TZ
  timezone: string | null;            // IANA, e.g. "America/New_York"
  hasCalendarEvent: boolean;          // Google Calendar event attached
  inviteStatus: InviteStatus;         // resolved RSVP state from Google
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
  // Which confirm card is open (or none). One piece of state instead of two
  // booleans so only one dialog is ever visible at a time.
  const [confirmOpen, setConfirmOpen] = useState<null | "new" | "resend">(null);

  const sendInvitesMutation = useMutation<InviteResult>({
    mutationFn: () => apiRequest("POST", "/api/beta/bells/send-invites"),
    onSuccess: (data) => {
      setInviteResult(data);
      setConfirmOpen(null);
      qc.invalidateQueries({ queryKey: ["/api/beta/bells"] });
    },
  });

  // Resend the ICS invite to every user whose bell is on but never landed
  // on their Google Calendar (inviteStatus === "ics-pending"). Same response
  // shape as sendInvitesMutation so we can reuse the result card below.
  const resendIcsMutation = useMutation<InviteResult>({
    mutationFn: () => apiRequest("POST", "/api/beta/bells/resend-ics-invites"),
    onSuccess: (data) => {
      setInviteResult(data);
      setConfirmOpen(null);
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
  // Users whose bell is on but who never accepted a Google Calendar invite —
  // the target set of the "Resend ICS invites" bulk action.
  const icsPendingCount = users.filter(u => u.inviteStatus === "ics-pending").length;

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

        {/* Bulk invite actions — two buttons:
              "new"    → send fresh ICS to users who never had a bell
              "resend" → re-send ICS to users stuck on "ICS sent" status
            Exactly one confirm card shows at a time, and both share the same
            result card below. */}
        {!inviteResult ? (
          confirmOpen === null ? (
            <div className="space-y-2 mb-5">
              <button
                onClick={() => setConfirmOpen("new")}
                disabled={isLoading || summary.totalUsers - summary.bellsActive === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
                style={{
                  background: "rgba(46,107,64,0.18)",
                  border: "1px solid rgba(46,107,64,0.4)",
                  color: "#8FAF96",
                }}
              >
                <Send size={14} />
                Send 7 AM bell invite to {summary.totalUsers - summary.bellsActive} users without a bell
              </button>
              <button
                onClick={() => setConfirmOpen("resend")}
                disabled={isLoading || icsPendingCount === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-opacity disabled:opacity-40"
                style={{
                  background: "rgba(70,100,140,0.12)",
                  border: "1px solid rgba(70,100,140,0.35)",
                  color: "#B5C9E5",
                }}
              >
                <Send size={14} />
                Send Google Calendar invite to {icsPendingCount} {icsPendingCount === 1 ? "user" : "users"} stuck on "ICS sent"
              </button>
            </div>
          ) : confirmOpen === "new" ? (
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
                  onClick={() => setConfirmOpen(null)}
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
          ) : (
            // confirmOpen === "resend"
            <div
              className="rounded-xl px-4 py-4 mb-5"
              style={{ background: "rgba(70,100,140,0.1)", border: "1px solid rgba(70,100,140,0.35)" }}
            >
              <p className="text-sm font-semibold mb-1" style={{ color: "#F0EDE6" }}>
                Resend ICS invite to {icsPendingCount} {icsPendingCount === 1 ? "user" : "users"}?
              </p>
              <p className="text-[12px] mb-3" style={{ color: "rgba(181,201,229,0.85)" }}>
                Target: bells that are on but never landed on a Google Calendar. Each user will receive a fresh .ics invite at their existing bell time. Their saved time and timezone won't change.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => resendIcsMutation.mutate()}
                  disabled={resendIcsMutation.isPending}
                  className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: "#3B5F8A", color: "#F0EDE6" }}
                >
                  {resendIcsMutation.isPending ? "Sending…" : "Resend invites"}
                </button>
                <button
                  onClick={() => setConfirmOpen(null)}
                  disabled={resendIcsMutation.isPending}
                  className="px-4 py-2 rounded-lg text-sm transition-opacity disabled:opacity-50"
                  style={{ color: "rgba(143,175,150,0.7)" }}
                >
                  Cancel
                </button>
              </div>
              {resendIcsMutation.isError && (
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

// ── Per-user invite button ──────────────────────────────────────────────────
// Lets an admin send a 7 AM ICS invite to a single user who hasn't set up
// a bell yet. Hits POST /api/beta/bells/send-invite/:userId.
function SendInviteButton({ userId }: { userId: number }) {
  const qc = useQueryClient();
  const [sent, setSent] = useState<null | { ok: boolean; community: string | null }>(null);
  const mut = useMutation<{ sent: boolean; community: string | null }>({
    mutationFn: () => apiRequest("POST", `/api/beta/bells/send-invite/${userId}`),
    onSuccess: (data) => {
      setSent({ ok: !!data.sent, community: data.community ?? null });
      qc.invalidateQueries({ queryKey: ["/api/beta/bells"] });
    },
  });

  if (sent) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap" style={{ background: "rgba(46,107,64,0.2)", color: "#8FE5A6", border: "1px solid rgba(46,107,64,0.4)" }}>
        ✓ Invite sent
      </span>
    );
  }

  return (
    <button
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap transition-opacity disabled:opacity-50"
      style={{ background: "rgba(46,107,64,0.12)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.3)" }}
    >
      <Send size={10} />
      {mut.isPending ? "Sending…" : "Send invite"}
    </button>
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

// ── Invite chip ────────────────────────────────────────────────────────────
// The bell-status chip tells you whether the notification fired. This one
// tells you whether the invite is actually on their Google calendar — the
// state that controls whether they'll ever see the bell ring in the first
// place. Kept deliberately compact so it sits next to the status chip
// without cluttering the row.
function inviteChipStyle(status: InviteStatus): {
  label: string;
  color: string;
  bg: string;
  border: string;
  title: string;
} | null {
  switch (status) {
    case "accepted":
      return {
        label: "On calendar",
        color: "#8FE5A6",
        bg: "rgba(46,107,64,0.22)",
        border: "rgba(46,107,64,0.5)",
        title: "Invite accepted — event is live on their Google Calendar.",
      };
    case "tentative":
      return {
        label: "Tentative",
        color: "#E5C98F",
        bg: "rgba(140,110,50,0.15)",
        border: "rgba(140,110,50,0.35)",
        title: "Responded Maybe to the calendar invite.",
      };
    case "needsAction":
      return {
        label: "Invited",
        color: "#E5C98F",
        bg: "rgba(140,110,50,0.15)",
        border: "rgba(140,110,50,0.35)",
        title: "Invite delivered to their Google Calendar — awaiting RSVP.",
      };
    case "ics-pending":
      return {
        label: "ICS sent",
        color: "#B5C9E5",
        bg: "rgba(70,100,140,0.15)",
        border: "rgba(70,100,140,0.35)",
        title: "ICS invite emailed; no Google Calendar event attached yet.",
      };
    case "declined":
      return {
        label: "Declined",
        color: "#E59393",
        bg: "rgba(140,60,60,0.15)",
        border: "rgba(140,60,60,0.35)",
        title: "User declined the calendar invite.",
      };
    case "stale":
      return {
        label: "Stale event",
        color: "rgba(200,160,120,0.7)",
        bg: "rgba(120,80,40,0.12)",
        border: "rgba(120,80,40,0.3)",
        title: "Bell is off but a Google Calendar event is still attached.",
      };
    case "unknown":
      return {
        label: "Unknown",
        color: "rgba(200,212,192,0.55)",
        bg: "rgba(143,175,150,0.08)",
        border: "rgba(143,175,150,0.22)",
        title: "Couldn't reach Google Calendar to check invite status.",
      };
    case "none":
    default:
      return null;
  }
}

function BellRow({ user: u }: { user: BellUser }) {
  const displayName = u.name || u.email.split("@")[0];
  const inviteChip = inviteChipStyle(u.inviteStatus);

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
    // Has the user's scheduled bell time already passed today in their
    // local TZ? If no, "never sent" is the expected state — don't flag
    // it as a warning. If yes and still no send, then surface it as
    // amber because the cron should have fired.
    let scheduledTimePassed = false;
    if (u.dailyBellTime && u.timezone) {
      try {
        const m = /^(\d{1,2}):(\d{2})/.exec(u.dailyBellTime);
        if (m) {
          const bellMinutes = parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
          const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: u.timezone,
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }).formatToParts(new Date());
          const hh = parseInt(parts.find(p => p.type === "hour")?.value ?? "0", 10);
          const mm = parseInt(parts.find(p => p.type === "minute")?.value ?? "0", 10);
          const nowMinutes = hh * 60 + mm;
          scheduledTimePassed = nowMinutes >= bellMinutes;
        }
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
    } else if (scheduledTimePassed) {
      // Enabled, never sent, and the bell time already came and went
      // today in their TZ — that's the actual problem case.
      status = {
        label: "Missed today",
        color: "#E5C98F",
        bg: "rgba(140,110,50,0.15)",
        border: "rgba(140,110,50,0.35)",
      };
    } else {
      // Enabled, never sent, but the bell time is still ahead — that's
      // just "waiting for the first ring," not a warning.
      status = {
        label: "Active",
        color: "#A8C5A0",
        bg: "rgba(46,107,64,0.18)",
        border: "rgba(46,107,64,0.4)",
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
              <span
                title={
                  u.inviteStatus === "accepted"
                    ? "Invite accepted — event live on their calendar"
                    : "Google Calendar event attached"
                }
              >
                <CalendarIcon
                  size={12}
                  style={{
                    color:
                      u.inviteStatus === "accepted"
                        ? "#8FE5A6"
                        : "rgba(143,175,150,0.55)",
                  }}
                />
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
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap"
            style={{
              background: status.bg,
              color: status.color,
              border: `1px solid ${status.border}`,
            }}
          >
            {status.label}
          </span>
          {inviteChip && (
            <span
              title={inviteChip.title}
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full whitespace-nowrap"
              style={{
                background: inviteChip.bg,
                color: inviteChip.color,
                border: `1px solid ${inviteChip.border}`,
              }}
            >
              {inviteChip.label}
            </span>
          )}
          {!u.bellEnabled && <SendInviteButton userId={u.id} />}
        </div>
      </div>
    </div>
  );
}
