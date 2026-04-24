import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LogOut, Camera, Pencil, Check, X, Trash2, Download } from "lucide-react";


function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-lg font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </h2>
      <div className="flex-1 h-px" style={{ background: "rgba(200, 212, 192, 0.15)" }} />
    </div>
  );
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-xl px-5 py-4 mb-3"
      style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.18)" }}
    >
      {children}
    </div>
  );
}

// ─── Common timezone options ────────────────────────────────────────────────

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Phoenix", label: "Arizona (MST)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HST)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Paris (CET)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
];

function formatTimeLabel(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ─── Bell Setup Slideshow ───────────────────────────────────────────────────

interface BellPrefs {
  bellEnabled: boolean;
  dailyBellTime: string;
  timezone: string;
  calendarStatus?: "active" | "pending" | "tentative" | "declined" | "ics-pending" | "none";
}

function BellSetupModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [bellTime, setBellTime] = useState("07:00");
  const [timezone, setTimezone] = useState(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
    catch { return "America/New_York"; }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAddToCalendar() {
    setSaving(true);
    setError(null);
    try {
      await apiRequest("PUT", "/api/bell/preferences", {
        bellEnabled: true,
        dailyBellTime: bellTime,
        timezone,
      });
      onDone();
    } catch (err) {
      console.error("Failed to activate bell:", err);
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  const slides = [
    // Slide 0: Intro — monastic bell theme
    <div key="intro" className="text-center px-2">
      <div className="text-5xl mb-6">🔔</div>
      <h2 className="text-xl font-bold mb-4" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        The Daily Bell
      </h2>
      <p className="text-sm leading-relaxed mx-auto max-w-[280px]" style={{ color: "#8FAF96" }}>
        For centuries, monastic bells have called communities to prayer.
      </p>
      <p className="text-sm mt-4 leading-relaxed mx-auto max-w-[280px]" style={{ color: "#8FAF96" }}>
        Create your bell — a daily calendar reminder that brings all your practices into one moment.
      </p>
    </div>,

    // Slide 1: Pick time — native time input for any time of day
    <div key="time" className="text-center px-2">
      <div className="text-5xl mb-6">🔔</div>
      <h2 className="text-xl font-bold mb-3" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        When should your bell ring?
      </h2>
      <p className="text-sm mb-8 mx-auto max-w-[280px]" style={{ color: "#8FAF96" }}>
        Pick the time you'd like to be called to your practices each day.
      </p>

      <div className="max-w-[240px] mx-auto mb-6">
        <input
          type="time"
          value={bellTime}
          onChange={e => setBellTime(e.target.value)}
          className="w-full px-5 py-4 rounded-2xl border outline-none text-center text-2xl font-semibold cursor-pointer"
          style={{
            background: "rgba(46,107,64,0.12)",
            border: "1px solid rgba(46,107,64,0.3)",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
          }}
        />
      </div>

      <div className="max-w-[240px] mx-auto">
        <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2 text-left" style={{ color: "rgba(200,212,192,0.4)" }}>
          Timezone
        </label>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border outline-none text-sm appearance-none cursor-pointer"
          style={{
            background: "rgba(46,107,64,0.08)",
            border: "1px solid rgba(46,107,64,0.25)",
            color: "#F0EDE6",
          }}
        >
          {TIMEZONE_OPTIONS.map(tz => (
            <option key={tz.value} value={tz.value} style={{ background: "#091A10", color: "#F0EDE6" }}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>
    </div>,

    // Slide 2: Confirm + Add to Calendar
    <div key="confirm" className="text-center px-2">
      <div className="text-5xl mb-6">📅</div>
      <h2 className="text-xl font-bold mb-4" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        Add to your calendar
      </h2>
      <p className="text-sm mb-2 mx-auto max-w-[280px]" style={{ color: "#8FAF96" }}>
        A recurring daily calendar event will remind you at:
      </p>
      <p className="text-2xl font-bold mt-4 mb-1" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
        {formatTimeLabel(bellTime)}
      </p>
      <p className="text-xs mb-6" style={{ color: "rgba(143,175,150,0.5)" }}>
        every day · {TIMEZONE_OPTIONS.find(tz => tz.value === timezone)?.label ?? timezone}
      </p>
      <p className="text-xs mx-auto max-w-[280px] leading-relaxed" style={{ color: "#8FAF96" }}>
        Your individual practice reminders will be replaced with this single bell.
      </p>
      {error && (
        <p className="text-xs mt-4" style={{ color: "#C17F7F" }}>{error}</p>
      )}
    </div>,
  ];

  const isLastSlide = step === slides.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl overflow-hidden"
        style={{ background: "#0D1F14", border: "1px solid rgba(46,107,64,0.25)" }}
      >
        {/* Slide content */}
        <div className="px-6 pt-10 pb-6 min-h-[380px] flex items-center justify-center">
          {slides[step]}
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 pb-4">
          {slides.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-all"
              style={{
                background: i === step ? "#4A9E6A" : "rgba(143,175,150,0.2)",
                transform: i === step ? "scale(1.2)" : "scale(1)",
              }}
            />
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={step === 0 ? onClose : () => setStep(s => s - 1)}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: "#8FAF96", background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>

          {isLastSlide ? (
            <button
              onClick={handleAddToCalendar}
              disabled={saving}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "#4a7c59", color: "#ffffff" }}
            >
              {saving ? "Adding..." : "Add to Calendar"}
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ background: "#4a7c59", color: "#ffffff" }}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bell Preferences (beta only) ──────────────────────────────────────────

function BellChangeTimeModal({ currentTime, currentTimezone, onClose, onSaved }: {
  currentTime: string;
  currentTimezone: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [bellTime, setBellTime] = useState(currentTime);
  const [timezone, setTimezone] = useState(currentTimezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = bellTime !== currentTime || timezone !== currentTimezone;

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await apiRequest("PUT", "/api/bell/preferences", {
        bellEnabled: true,
        dailyBellTime: bellTime,
        timezone,
      });
      onSaved();
    } catch {
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl overflow-hidden"
        style={{ background: "#0D1F14", border: "1px solid rgba(46,107,64,0.25)" }}
      >
        <div className="px-6 pt-10 pb-6 text-center">
          <div className="text-5xl mb-6">🔔</div>
          <h2 className="text-xl font-bold mb-3" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
            Change your bell time
          </h2>
          <p className="text-sm mb-8 mx-auto max-w-[280px]" style={{ color: "#8FAF96" }}>
            Pick the time you'd like to be called to your practices each day.
          </p>

          <div className="max-w-[240px] mx-auto mb-6">
            <input
              type="time"
              value={bellTime}
              onChange={e => setBellTime(e.target.value)}
              className="w-full px-5 py-4 rounded-2xl border outline-none text-center text-2xl font-semibold cursor-pointer"
              style={{
                background: "rgba(46,107,64,0.12)",
                border: "1px solid rgba(46,107,64,0.3)",
                color: "#F0EDE6",
                fontFamily: "'Space Grotesk', sans-serif",
              }}
            />
          </div>

          <div className="max-w-[240px] mx-auto">
            <label className="text-[11px] font-semibold uppercase tracking-widest block mb-2 text-left" style={{ color: "rgba(200,212,192,0.4)" }}>
              Timezone
            </label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border outline-none text-sm appearance-none cursor-pointer"
              style={{
                background: "rgba(46,107,64,0.08)",
                border: "1px solid rgba(46,107,64,0.25)",
                color: "#F0EDE6",
              }}
            >
              {TIMEZONE_OPTIONS.map(tz => (
                <option key={tz.value} value={tz.value} style={{ background: "#091A10", color: "#F0EDE6" }}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs mt-4" style={{ color: "#C17F7F" }}>{error}</p>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: "#8FAF96", background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex-1 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "#4a7c59", color: "#ffffff" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BellPreferences() {
  const queryClient = useQueryClient();
  const [showSetup, setShowSetup] = useState(false);
  const [showChangeTime, setShowChangeTime] = useState(false);

  const { data, isLoading } = useQuery<BellPrefs>({
    queryKey: ["/api/bell/preferences"],
    queryFn: () => apiRequest("GET", "/api/bell/preferences"),
    refetchOnWindowFocus: true,
  });

  const deactivateMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/bell/preferences", {
        bellEnabled: false,
        dailyBellTime: data?.dailyBellTime ?? "07:00",
        timezone: data?.timezone ?? "America/New_York",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bell/preferences"] });
    },
  });

  // PUT /bell/preferences with the existing time — which the server
  // uses to (re)create the calendar invite. Used by the "Resend
  // invite" action when the bell is enabled but the calendar event
  // is pending / tentative / missing.
  const resendMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/bell/preferences", {
        bellEnabled: true,
        dailyBellTime: data?.dailyBellTime ?? "07:00",
        timezone: data?.timezone ?? "America/New_York",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bell/preferences"] });
    },
  });

  // One-shot popup state: fires when the bell is enabled in the DB
  // but the calendar invite isn't actually "active" (pending,
  // tentative, or the event is missing entirely). Lets the user see
  // the issue and resend in one tap. Suppress-on-dismiss is keyed by
  // the status so if it flips to a different issue, we show it again.
  const [issueModalStatus, setIssueModalStatus] = useState<string | null>(null);
  const issueShownRef = useRef(false);

  useEffect(() => {
    if (!data || !data.bellEnabled) return;
    const status = data.calendarStatus ?? "none";
    if (status === "active") return; // all good, no nudge
    if (issueShownRef.current) return;
    const dismissKey = `phoebe:bell-issue-dismissed:${status}`;
    if (localStorage.getItem(dismissKey) === "1") return;
    issueShownRef.current = true;
    setIssueModalStatus(status);
  }, [data]);

  const dismissIssue = () => {
    if (issueModalStatus) {
      localStorage.setItem(`phoebe:bell-issue-dismissed:${issueModalStatus}`, "1");
    }
    setIssueModalStatus(null);
  };

  if (isLoading) {
    return (
      <SettingsCard>
        <div className="h-16 animate-pulse rounded-xl" style={{ background: "rgba(46,107,64,0.08)" }} />
      </SettingsCard>
    );
  }

  const isActive = data?.bellEnabled;
  // "Confirmed" = bell is enabled AND the calendar invite is accepted.
  // Everything else is a broken state the user should see and fix.
  const calendarStatus = data?.calendarStatus ?? "none";
  const isConfirmed = isActive && calendarStatus === "active";
  const hasCalendarIssue = isActive && calendarStatus !== "active";

  return (
    <>
      {showSetup && (
        <BellSetupModal
          onClose={() => setShowSetup(false)}
          onDone={() => {
            setShowSetup(false);
            queryClient.invalidateQueries({ queryKey: ["/api/bell/preferences"] });
          }}
        />
      )}

      {showChangeTime && (
        <BellChangeTimeModal
          currentTime={data?.dailyBellTime ?? "07:00"}
          currentTimezone={data?.timezone ?? "America/New_York"}
          onClose={() => setShowChangeTime(false)}
          onSaved={() => {
            setShowChangeTime(false);
            queryClient.invalidateQueries({ queryKey: ["/api/bell/preferences"] });
          }}
        />
      )}

      <SettingsCard>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>Daily Bell 🔔</p>
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
              {isActive
                ? `Ringing daily at ${formatTimeLabel(data?.dailyBellTime ?? "07:00")}`
                : "A daily calendar reminder for all your practices."}
            </p>
          </div>

          {isActive ? (
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setShowChangeTime(true)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                style={{ color: "#8FAF96", background: "rgba(46,107,64,0.08)", border: "1px solid rgba(46,107,64,0.18)" }}
              >
                Change time
              </button>
              <button
                onClick={() => deactivateMutation.mutate()}
                disabled={deactivateMutation.isPending}
                className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
                style={{ color: "#C17F7F", background: "rgba(193,127,127,0.1)", border: "1px solid rgba(193,127,127,0.2)" }}
              >
                {deactivateMutation.isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSetup(true)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90 flex-shrink-0"
              style={{ background: "#4a7c59", color: "#ffffff" }}
            >
              Activate
            </button>
          )}
        </div>

        {/* Calendar status — green dot + "Active on your calendar" only
            when the invite has actually been accepted. Every other
            state (pending / tentative / missing event) is surfaced as
            a warning line with a Resend action. */}
        {isConfirmed && (
          <div className="mt-3 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#4A9E6A" }} />
            <p className="text-[11px]" style={{ color: "#8FAF96" }}>
              Active on your calendar
            </p>
          </div>
        )}
        {hasCalendarIssue && (
          <div className="mt-3 flex items-start gap-2">
            <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: "#C4A94D" }} />
            <div className="flex-1">
              <p className="text-[11px] leading-snug" style={{ color: "#D8B858" }}>
                {calendarStatus === "pending" && "Calendar invite sent — check your email or calendar and confirm it to be reminded each day."}
                {calendarStatus === "tentative" && "You replied Maybe on the calendar invite. Switch to Accept so the bell rings reliably."}
                {calendarStatus === "ics-pending" && "Calendar invite emailed. Open the message and tap the .ics attachment to add the bell to your calendar."}
                {calendarStatus === "none" && "The bell is on, but we can't find a calendar invite. Resend it below."}
              </p>
              <button
                type="button"
                onClick={() => resendMutation.mutate()}
                disabled={resendMutation.isPending}
                className="mt-1.5 px-3 py-1 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ color: "#F0EDE6", background: "rgba(46,107,64,0.25)", border: "1px solid rgba(46,107,64,0.45)" }}
              >
                {resendMutation.isPending ? "Sending…" : "Resend invite"}
              </button>
            </div>
          </div>
        )}
      </SettingsCard>

      {/* One-shot nudge popup when the bell is misconfigured. Shows
          once per distinct status; dismissal is stored in localStorage
          keyed by status so if the state changes later we'll surface
          the new issue. */}
      {issueModalStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
          onClick={dismissIssue}
        >
          <div
            className="rounded-2xl px-7 pt-7 pb-6 text-center max-w-sm w-full"
            style={{ background: "#0F2818", border: "1px solid rgba(196,169,77,0.45)" }}
            onClick={e => e.stopPropagation()}
          >
            <p className="text-4xl mb-3">🔔</p>
            <h2
              className="text-lg font-bold mb-2"
              style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Your bell isn't ringing yet
            </h2>
            <p className="text-sm leading-relaxed mb-5" style={{ color: "#C8D4C0" }}>
              {issueModalStatus === "pending" &&
                "We sent you a calendar invite. Check your email or calendar and confirm it so the bell can remind you each day."}
              {issueModalStatus === "tentative" &&
                "You replied Maybe on the invite. Switch to Accept so the bell rings on time every day."}
              {issueModalStatus === "none" &&
                "Your bell is turned on, but we can't see a calendar event on your side. Resend the invite to fix it."}
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => { resendMutation.mutate(); dismissIssue(); }}
                disabled={resendMutation.isPending}
                className="px-6 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#2D5E3F", color: "#F0EDE6" }}
              >
                {resendMutation.isPending ? "Sending…" : "Resend invite"}
              </button>
              <button
                type="button"
                onClick={dismissIssue}
                className="text-xs transition-opacity hover:opacity-80"
                style={{ color: "rgba(143,175,150,0.6)" }}
              >
                I'll handle this later
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

// ─── Muted People ───────────────────────────────────────────────────────────

type MutedUser = { userId: number; name: string; email: string };

// Each row is ~52px tall; show 3.5 rows = ~182px
const PREVIEW_HEIGHT = 182;

function MutedPeople() {
  const { data, isLoading } = useQuery<{ muted: MutedUser[] }>({
    queryKey: ["/api/mutes"],
    queryFn: () => apiRequest("GET", "/api/mutes"),
  });

  const muted = data?.muted ?? [];

  return (
    <>
      <SectionHeader label="Muted People" />
      <SettingsCard>
        {isLoading && (
          <p className="text-sm" style={{ color: "#8FAF96" }}>Loading…</p>
        )}
        {!isLoading && muted.length === 0 && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              No one muted.
            </p>
            <Link
              href="/settings/muted"
              className="text-xs font-medium px-3 py-1.5 rounded-full shrink-0 transition-opacity hover:opacity-80"
              style={{ background: "rgba(46,107,64,0.15)", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.25)" }}
            >
              + Add
            </Link>
          </div>
        )}
        {muted.length > 0 && (
          <>
            <div
              className="overflow-y-auto space-y-3"
              style={{ maxHeight: PREVIEW_HEIGHT }}
            >
              {muted.map((m) => (
                <div key={m.userId} className="flex items-center justify-between gap-3 py-0.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>{m.name}</p>
                    <p className="text-xs truncate" style={{ color: "rgba(143,175,150,0.55)" }}>{m.email}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(46,107,64,0.15)" }}>
              <Link
                href="/settings/muted"
                className="text-sm font-medium transition-opacity hover:opacity-80"
                style={{ color: "#A8C5A0" }}
              >
                See all ({muted.length}) →
              </Link>
            </div>
          </>
        )}
      </SettingsCard>
    </>
  );
}

// ─── Account Section (photo + name editing) ────────────────────────────────

function AccountSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [uploading, setUploading] = useState(false);

  const profileMutation = useMutation({
    mutationFn: (data: { name?: string; avatarUrl?: string | null }) =>
      apiRequest("PATCH", "/api/auth/me/profile", data),
    onSuccess: (_data, variables) => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) => {
        if (!prev) return prev;
        const updated = { ...prev };
        if (variables.name) updated.name = variables.name;
        if (variables.avatarUrl !== undefined) updated.avatarUrl = variables.avatarUrl;
        return updated;
      });
      setEditingName(false);
    },
  });

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 512;
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { setUploading(false); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        profileMutation.mutate({ avatarUrl: dataUrl }, {
          onSettled: () => setUploading(false),
        });
      };
      img.onerror = () => {
        alert("Could not process this image. Try a different one.");
        setUploading(false);
      };
      img.src = reader.result as string;
    };
    reader.onerror = () => {
      alert("Could not read this image. Try a different one.");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  }

  if (!user) return null;

  const hasAvatar = !!user.avatarUrl;

  return (
    <SettingsCard>
      <div className="flex items-center gap-4">
        {/* Avatar with upload overlay */}
        <div className="relative flex-shrink-0">
          {hasAvatar ? (
            <img
              src={user.avatarUrl!}
              alt={user.name}
              className="w-16 h-16 rounded-full object-cover"
              style={{ border: "2px solid rgba(46,107,64,0.3)" }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold"
              style={{ background: "#1A4A2E", color: "#A8C5A0", border: "2px solid rgba(46,107,64,0.3)" }}
            >
              {user.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: "#2D5E3F", border: "2px solid #091A10" }}
          >
            {uploading ? (
              <span className="text-[10px]" style={{ color: "#F0EDE6" }}>…</span>
            ) : (
              <Camera size={12} style={{ color: "#F0EDE6" }} />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
        </div>

        {/* Name + email */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  maxLength={50}
                  autoFocus
                  className="flex-1 text-sm font-semibold px-2 py-1.5 rounded-lg outline-none min-w-0"
                  style={{
                    color: "#F0EDE6",
                    background: "rgba(200,212,192,0.05)",
                    border: "1px solid rgba(46,107,64,0.3)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                  onKeyDown={e => {
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  maxLength={50}
                  className="flex-1 text-sm font-semibold px-2 py-1.5 rounded-lg outline-none min-w-0"
                  style={{
                    color: "#F0EDE6",
                    background: "rgba(200,212,192,0.05)",
                    border: "1px solid rgba(46,107,64,0.3)",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                  onKeyDown={e => {
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const full = `${firstName.trim()} ${lastName.trim()}`.trim();
                    if (full) profileMutation.mutate({ name: full });
                  }}
                  disabled={!firstName.trim() || profileMutation.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
                  style={{ background: "rgba(46,107,64,0.2)", color: "#A8C5A0" }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
                  style={{ color: "#8FAF96" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {user.name}
              </p>
              <button
                onClick={() => {
                  const parts = (user.name ?? "").split(" ");
                  setFirstName(parts[0] ?? "");
                  setLastName(parts.slice(1).join(" ") ?? "");
                  setEditingName(true);
                }}
                className="p-1 rounded-lg transition-opacity hover:opacity-80"
                style={{ color: "rgba(143,175,150,0.5)" }}
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
          <p className="text-sm truncate mt-0.5" style={{ color: "#8FAF96" }}>
            {user.email}
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const presenceToggle = useMutation({
    mutationFn: (showPresence: boolean) =>
      apiRequest("PATCH", "/api/auth/me/presence", { showPresence }),
    onSuccess: (_data, showPresence) => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, showPresence } : prev
      );
    },
  });

  if (isLoading || !user) return null;

  return (
    <Layout>
      <div className="flex flex-col w-full max-w-2xl mx-auto pb-24">

        {/* Header */}
        <div className="mb-8">
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Settings ⚙️
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Your account, notifications, and preferences.
          </p>
        </div>

        {/* ── Account ── */}
        <SectionHeader label="Account" />
        <AccountSection />

        {/* ── Presence ── */}
        <div className="mb-8">
          <SettingsCard>
            <button
              onClick={() => presenceToggle.mutate(!user.showPresence)}
              className="w-full flex items-center justify-between"
            >
              <div className="text-left">
                <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>Show when I'm here 🌿</p>
                <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                  Let your people know you're present.
                </p>
              </div>
              <div className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${user.showPresence ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}>
                <div className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${user.showPresence ? "left-[21px]" : "left-[3px]"}`} style={{ background: "#F0EDE6" }} />
              </div>
            </button>
          </SettingsCard>
        </div>

        {/* ── Notifications ── */}
        <SectionHeader label="Notifications" />
        <BellPreferences />
        <div className="mb-8" />

        {/* ── Device (Phoebe Mobile only) ──
            Only rendered when running inside the Capacitor shell. Web users
            don't have Face ID, so showing the toggle would confuse them. */}
        <MobileDeviceSection />

        {/* ── Muted People ── */}
        <MutedPeople />
        <div className="mb-8" />

        {/* ── Sign out ── */}
        <button
          onClick={() => { logout(); setLocation("/"); }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.18)" }}
        >
          <LogOut size={15} />
          Sign out
        </button>

        {/* ── Export my data ──
            GDPR right-to-portability. Downloads a JSON blob of every row
            the database holds tied to this user. Auth material (password
            hash, OAuth tokens) is redacted server-side. */}
        <div className="mt-8">
          <ExportDataSection />
        </div>

        {/* ── Delete account ──
            Required by Apple Guideline 5.1.1(v) for App Store distribution:
            any app that creates accounts must offer in-app deletion. Also
            a legitimate privacy affordance for web users. Gated behind a
            confirm step (type your email) to prevent accidents. */}
        <div className="mt-4">
          <DeleteAccountSection email={user.email} />
        </div>

        <div className="mt-6 pb-4 text-center">
          <Link href="/privacy">
            <span className="text-xs" style={{ color: "#8FAF96", textDecoration: "underline", cursor: "pointer" }}>
              Privacy Policy
            </span>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

// ─── Mobile-only device section ────────────────────────────────────────────
// Renders only inside Phoebe Mobile (Capacitor shell). The "Lock with Face
// ID" toggle flips a localStorage flag that native-shell.ts reads on app
// resume to decide whether to demand a biometric check. The web build
// has no Face ID, so the section is hidden there.
function MobileDeviceSection() {
  const [isNative, setIsNative] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    try {
      const phoebeNative = (window as { PhoebeNative?: { isNative: () => boolean } }).PhoebeNative;
      if (phoebeNative?.isNative?.()) {
        setIsNative(true);
        setLocked(window.localStorage.getItem("phoebe:persist:biometricLock") === "on");
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (!isNative) return null;

  const toggle = () => {
    const next = !locked;
    setLocked(next);
    const phoebeNative = (window as { PhoebeNative?: { setBiometricLock?: (on: boolean) => void } }).PhoebeNative;
    phoebeNative?.setBiometricLock?.(next);
  };

  return (
    <>
      <SectionHeader label="Device" />
      <div className="mb-8">
        <SettingsCard>
          <button
            onClick={toggle}
            className="w-full flex items-center justify-between"
          >
            <div className="text-left">
              <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>Lock with Face ID 🔒</p>
              <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
                Unlock Phoebe with Face ID after 5 minutes away.
              </p>
            </div>
            <div className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${locked ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}>
              <div className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${locked ? "left-[21px]" : "left-[3px]"}`} style={{ background: "#F0EDE6" }} />
            </div>
          </button>
        </SettingsCard>
      </div>
    </>
  );
}

// ─── Export data section ───────────────────────────────────────────────────
// Downloads a JSON file of everything we hold for this user. The server
// streams the payload with a Content-Disposition attachment header; we
// create a blob URL on the client and click an <a download> so the
// browser/iOS Files app saves it. iOS Safari on Capacitor handles
// application/json attachments by showing the native share sheet, which
// lets the user save to Files, mail it, etc.
function ExportDataSection() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/export", { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `phoebe-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        onClick={handleExport}
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
        style={{
          background: "transparent",
          color: "rgba(143,175,150,0.85)",
          border: "1px solid rgba(143,175,150,0.25)",
        }}
      >
        <Download size={13} />
        {pending ? "Preparing your data…" : "Export my data"}
      </button>
      {error && (
        <p className="text-xs mt-2 text-center" style={{ color: "#D97A7A" }}>
          {error}
        </p>
      )}
    </>
  );
}

// ─── Delete account section ────────────────────────────────────────────────
// Two-step UI: a muted destructive button → expanded confirm form with
// email-typing check → calls DELETE /api/users/me. On success, redirect
// to /. The server endpoint enforces the same email check, so this is
// belt-and-suspenders.
function DeleteAccountSection({ email }: { email: string }) {
  const [, setLocation] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users/me", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setLocation("/");
      // Hard reload so every client-side cache clears.
      setTimeout(() => window.location.href = "/", 100);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const canDelete = confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-medium transition-opacity hover:opacity-90"
        style={{
          background: "transparent",
          color: "rgba(217,122,122,0.75)",
          border: "1px solid rgba(217,122,122,0.25)",
        }}
      >
        <Trash2 size={13} />
        Delete account
      </button>
    );
  }

  return (
    <div
      className="rounded-2xl px-5 py-4"
      style={{
        background: "rgba(217,122,122,0.06)",
        border: "1px solid rgba(217,122,122,0.25)",
      }}
    >
      <p className="text-sm font-medium mb-2" style={{ color: "#D97A7A", fontFamily: "'Space Grotesk', sans-serif" }}>
        Delete your account
      </p>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: "rgba(240,237,230,0.75)" }}>
        This permanently removes your account and every prayer, practice, reflection, and invitation you've made in Phoebe. Shared prayer circles you created are not deleted for other members.
      </p>
      <p className="text-xs mb-3 leading-relaxed" style={{ color: "rgba(240,237,230,0.55)" }}>
        This cannot be undone. Calendar events already sent are left in place — remove them from Google Calendar yourself if you like.
      </p>
      <label className="block text-xs mb-1.5" style={{ color: "rgba(143,175,150,0.75)" }}>
        Type <span style={{ color: "#F0EDE6" }}>{email}</span> to confirm:
      </label>
      <input
        type="email"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        value={confirmEmail}
        onChange={(e) => { setConfirmEmail(e.target.value); setError(null); }}
        placeholder={email}
        className="w-full px-3 py-2 rounded-lg text-sm mb-3"
        style={{
          background: "rgba(0,0,0,0.35)",
          color: "#F0EDE6",
          border: "1px solid rgba(217,122,122,0.35)",
          outline: "none",
        }}
      />
      {error && (
        <p className="text-xs mb-3" style={{ color: "#D97A7A" }}>{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => deleteMutation.mutate()}
          disabled={!canDelete || deleteMutation.isPending}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
          style={{
            background: "#8A2A2A",
            color: "#F0EDE6",
            cursor: canDelete && !deleteMutation.isPending ? "pointer" : "not-allowed",
          }}
        >
          {deleteMutation.isPending ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          onClick={() => { setExpanded(false); setConfirmEmail(""); setError(null); }}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-opacity hover:opacity-90"
          style={{
            background: "transparent",
            color: "#8FAF96",
            border: "1px solid rgba(143,175,150,0.3)",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
