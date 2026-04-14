import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LogOut } from "lucide-react";
import { useBetaStatus } from "@/hooks/useDemo";

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
  calendarStatus?: "active" | "pending" | "declined" | "none";
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

  function downloadIcsFile(time: string, tz: string) {
    const [hh, mm] = time.split(":").map(Number);
    const now = new Date();
    // Build DTSTART in the user's timezone as a local time
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const dtStart = `${year}${month}${day}T${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}00`;
    const endMm = mm + 15;
    const endHh = hh + Math.floor(endMm / 60);
    const dtEnd = `${year}${month}${day}T${String(endHh).padStart(2, "0")}${String(endMm % 60).padStart(2, "0")}00`;
    const uid = `daily-bell-${Date.now()}@withphoebe.app`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Phoebe//Daily Bell//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTART;TZID=${tz}:${dtStart}`,
      `DTEND;TZID=${tz}:${dtEnd}`,
      "RRULE:FREQ=DAILY",
      `SUMMARY:🔔 Daily Bell — Phoebe`,
      `DESCRIPTION:Your daily moment to pause and practice.\\nOpen your practices: https://withphoebe.app/bell`,
      `URL:https://withphoebe.app/bell`,
      "BEGIN:VALARM",
      "TRIGGER:PT0M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Daily Bell",
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "daily-bell.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleAddToCalendar() {
    setSaving(true);
    setError(null);
    try {
      await apiRequest("PUT", "/api/bell/preferences", {
        bellEnabled: true,
        dailyBellTime: bellTime,
        timezone,
      });
      // Download the .ics file so it pops up in their calendar app
      downloadIcsFile(bellTime, timezone);
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

function BellPreferences() {
  const queryClient = useQueryClient();
  const [showSetup, setShowSetup] = useState(false);

  const { data, isLoading } = useQuery<BellPrefs>({
    queryKey: ["/api/bell/preferences"],
    queryFn: () => apiRequest("GET", "/api/bell/preferences"),
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

  if (isLoading) {
    return (
      <SettingsCard>
        <div className="h-16 animate-pulse rounded-xl" style={{ background: "rgba(46,107,64,0.08)" }} />
      </SettingsCard>
    );
  }

  const isActive = data?.bellEnabled;

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
            <button
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 flex-shrink-0"
              style={{ color: "#C17F7F", background: "rgba(193,127,127,0.1)", border: "1px solid rgba(193,127,127,0.2)" }}
            >
              {deactivateMutation.isPending ? "Removing..." : "Remove"}
            </button>
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

        {/* Calendar status */}
        {isActive && data?.calendarStatus && data.calendarStatus !== "none" && (
          <div className="mt-3 flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: data.calendarStatus === "active" ? "#4A9E6A"
                  : data.calendarStatus === "pending" ? "#C4A94D"
                  : "#C17F7F",
              }}
            />
            <p className="text-[11px]" style={{ color: "#8FAF96" }}>
              {data.calendarStatus === "active" && "Active on your calendar"}
              {data.calendarStatus === "pending" && "Calendar invite sent — accept it in your email"}
              {data.calendarStatus === "declined" && "You declined the invite — remove and reactivate"}
            </p>
          </div>
        )}
      </SettingsCard>
    </>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { rawIsBeta } = useBetaStatus();

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
        <SettingsCard>
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0"
              style={{ background: "#1A4A2E", color: "#A8C5A0", border: "1px solid rgba(46,107,64,0.3)" }}
            >
              {user.name?.charAt(0).toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-base" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {user.name}
              </p>
              <p className="text-sm truncate" style={{ color: "#8FAF96" }}>
                {user.email}
              </p>
            </div>
          </div>
        </SettingsCard>

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
        {rawIsBeta ? (
          <BellPreferences />
        ) : (
          <SettingsCard>
            <p className="text-sm" style={{ color: "#8FAF96" }}>
              Notification preferences coming soon.
            </p>
          </SettingsCard>
        )}
        <div className="mb-8" />

        {/* ── Privacy ── */}
        <SectionHeader label="Privacy" />
        <SettingsCard>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            Privacy settings coming soon. 🌱
          </p>
        </SettingsCard>
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
      </div>
    </Layout>
  );
}
