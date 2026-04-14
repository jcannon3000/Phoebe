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

const TIME_OPTIONS = [
  "05:00", "05:30", "06:00", "06:30", "07:00", "07:30",
  "08:00", "08:30", "09:00", "09:30", "10:00",
];

function formatTimeLabel(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ─── Bell Preferences (beta only) ──────────────────────────────────────────

interface BellPrefs {
  bellEnabled: boolean;
  dailyBellTime: string;
  timezone: string;
}

function BellPreferences() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BellPrefs>({
    queryKey: ["/api/bell/preferences"],
    queryFn: () => apiRequest("GET", "/api/bell/preferences"),
  });

  const [bellEnabled, setBellEnabled] = useState(false);
  const [bellTime, setBellTime] = useState("07:00");
  const [timezone, setTimezone] = useState("America/New_York");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (data && !initialized) {
      setBellEnabled(data.bellEnabled);
      setBellTime(data.dailyBellTime);
      setTimezone(data.timezone);
      setInitialized(true);
    }
  }, [data, initialized]);

  const saveMutation = useMutation({
    mutationFn: (prefs: BellPrefs) =>
      apiRequest("PUT", "/api/bell/preferences", prefs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bell/preferences"] });
    },
  });

  function save(overrides: Partial<BellPrefs> = {}) {
    const prefs = {
      bellEnabled: overrides.bellEnabled ?? bellEnabled,
      dailyBellTime: overrides.dailyBellTime ?? bellTime,
      timezone: overrides.timezone ?? timezone,
    };
    saveMutation.mutate(prefs);
  }

  if (isLoading) {
    return (
      <SettingsCard>
        <div className="h-16 animate-pulse rounded-xl" style={{ background: "rgba(46,107,64,0.08)" }} />
      </SettingsCard>
    );
  }

  return (
    <>
      {/* Enable toggle */}
      <SettingsCard>
        <button
          onClick={() => {
            const next = !bellEnabled;
            setBellEnabled(next);
            save({ bellEnabled: next });
          }}
          className="w-full flex items-center justify-between"
        >
          <div className="text-left">
            <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>Daily Bell 🔔</p>
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
              One email each morning with your practices for the day.
            </p>
          </div>
          <div className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${bellEnabled ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}>
            <div className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${bellEnabled ? "left-[21px]" : "left-[3px]"}`} style={{ background: "#F0EDE6" }} />
          </div>
        </button>
      </SettingsCard>

      {/* Time + timezone pickers (only shown when enabled) */}
      {bellEnabled && (
        <SettingsCard>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
                Bell time
              </label>
              <select
                value={bellTime}
                onChange={e => { setBellTime(e.target.value); save({ dailyBellTime: e.target.value }); }}
                className="w-full px-4 py-2.5 rounded-xl border outline-none text-sm appearance-none cursor-pointer"
                style={{
                  background: "rgba(46,107,64,0.08)",
                  border: "1px solid rgba(46,107,64,0.25)",
                  color: "#F0EDE6",
                }}
              >
                {TIME_OPTIONS.map(t => (
                  <option key={t} value={t} style={{ background: "#091A10", color: "#F0EDE6" }}>
                    {formatTimeLabel(t)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-widest block mb-2" style={{ color: "rgba(200,212,192,0.5)" }}>
                Timezone
              </label>
              <select
                value={timezone}
                onChange={e => { setTimezone(e.target.value); save({ timezone: e.target.value }); }}
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

            {saveMutation.isPending && (
              <p className="text-[11px]" style={{ color: "rgba(143,175,150,0.5)" }}>Saving...</p>
            )}
          </div>
        </SettingsCard>
      )}
    </>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { isBeta } = useBetaStatus();

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
        {isBeta ? (
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
