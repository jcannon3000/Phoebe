import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { useBetaStatus } from "@/hooks/useDemo";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";
import { appleHealthAvailable, requestMindfulAuthorization, getMindfulMinutesToday, openHealthApp } from "@/lib/appleHealth";
import i18n from "@/i18n";
import { LogOut, Camera, Pencil, Trash2, Download } from "lucide-react";
import {
  useOfficePrefs,
  useEffectiveReflectionSource,
  setReflectionSource,
  setIncludeGratitudeSlide,
  setOfficeAudioSource,
  type ReflectionSource,
  type OfficeAudioSource,
} from "@/lib/officePrefs";


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
      className="rounded-xl px-5 py-4 mb-3 tap-shrink"
      style={{ background: "rgba(46,107,64,0.10)", border: "1px solid rgba(46,107,64,0.18)" }}
    >
      {children}
    </div>
  );
}

// ─── Apple Health (iOS native shell only) ─────────────────────────────────
//
// Connect + status for the Mindful Minutes sync, so meditation kept in other
// apps (Calm, Insight Timer, Apple Mindfulness) counts toward the
// contemplation goal. The Contemplation goal card has the same connect
// button, but it hides once the user has been through the prompt — and
// HealthKit shows its permission sheet exactly ONCE per app. So if someone
// dismissed or denied it there, Settings is the recovery path: re-trigger
// the request (no-op if already answered) and deep-link into the Health app,
// where read access is actually granted after the fact (Profile → Apps →
// Phoebe → allow Mindfulness). Renders nothing on the web.
function AppleHealthSettings() {
  const { t } = useTranslation();
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState<boolean>(() => {
    try { return localStorage.getItem("phoebe:health-connected") === "1"; } catch { return false; }
  });
  // Same query key as the contemplation goal card + the Layout sync hook, so
  // all three share one HealthKit read. excludeOwn → external minutes only.
  const day = new Date().toLocaleDateString("en-CA");
  const healthQ = useQuery<{ minutes: number; sessions: number } | null>({
    queryKey: ["apple-health-mindful-external", day],
    queryFn: () => getMindfulMinutesToday(true),
    enabled: appleHealthAvailable(),
    staleTime: 5 * 60_000,
  });

  if (!appleHealthAvailable()) return null;
  const minutes = healthQ.data?.minutes ?? 0;
  // Minutes flowing in = access works, even if they never tapped our button
  // (e.g. granted directly in the Health app).
  const looksConnected = connected || minutes > 0;

  const connect = async () => {
    setConnecting(true);
    try {
      await requestMindfulAuthorization();
      try { localStorage.setItem("phoebe:health-connected", "1"); } catch { /* private mode */ }
      setConnected(true);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <>
      <SectionHeader label={t("settings.apple_health", { defaultValue: "Apple Health" })} />
      <div className="mb-3 space-y-1">
        <p className="text-[13px]" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
          📥 {t("settings.apple_health_read_blurb", { defaultValue: "Read — count meditation from Calm, Insight Timer, or Apple Mindfulness toward your daily contemplation goal." })}
        </p>
        <p className="text-[13px]" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
          📤 {t("settings.apple_health_write_blurb", { defaultValue: "Write — save your Phoebe sits to Apple Health as Mindful Minutes." })}
        </p>
      </div>
      <SettingsCard>
        {looksConnected ? (
          <>
            <div className="flex items-center gap-2.5 py-1">
              <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>🍎</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {minutes > 0
                    ? t("settings.apple_health_today", { count: minutes, defaultValue: `${minutes} mindful min from other apps today` })
                    : t("settings.apple_health_none", { defaultValue: "Connected — no outside mindful minutes today" })}
                </p>
                <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                  {t("settings.apple_health_manage", { defaultValue: "Missing minutes? Allow Mindfulness for Phoebe in the Health app (Profile → Apps)." })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { void openHealthApp(); }}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-left mt-1"
              style={{ borderTop: "1px solid rgba(200,212,192,0.12)", background: "transparent", cursor: "pointer" }}
            >
              <p className="text-[14px]" style={{ color: "#A8C5A0", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                {t("settings.apple_health_open", { defaultValue: "Open the Health app" })}
              </p>
              <span aria-hidden style={{ color: "#8FAF96", fontSize: 15 }}>↗</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => { void connect(); }}
            disabled={connecting}
            className="w-full flex items-center gap-2.5 py-1.5 text-left disabled:opacity-50"
            style={{ background: "transparent", cursor: "pointer" }}
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1 }}>🍎</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="text-[14px] font-semibold" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                {connecting
                  ? t("settings.apple_health_connecting", { defaultValue: "Connecting…" })
                  : t("settings.apple_health_connect", { defaultValue: "Connect Apple Health" })}
              </p>
              <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                {t("settings.apple_health_connect_sub", { defaultValue: "iOS will ask to read and write Mindful Minutes" })}
              </p>
            </div>
            <span aria-hidden style={{ color: "#8FAF96", fontSize: 16 }}>›</span>
          </button>
        )}
      </SettingsCard>
    </>
  );
}


// ─── Office reminder settings ───────────────────────────────────────────
//
// Per-user prefs for the daily morning + evening office reminder push.
// Each side picks none / Office (full Daily Prayer) / Devotion (BCP
// short form). Saves on every change — reads as a setting, not a
// form. Backed by /api/me/office-prefs which writes to the
// parish_office_* user columns under the hood.
type OfficePref = "none" | "office" | "devotion";
// Default prayer level — Settings picker decides which depth the
// home-screen office card's CTA jumps to. Mirrors the server-side
// allowlist in /api/me/office-prefs (PUT).
type DefaultPrayerLevel = "ask" | "devotion" | "office" | "intercessions" | "reflect-sit" | "journal";
type OfficePrefs = {
  morning: OfficePref;
  evening: OfficePref;
  morningTime: string | null;
  eveningTime: string | null;
  showConfession?: boolean;
  defaultPrayerLevel?: DefaultPrayerLevel;
  // Daily contemplation goal (minutes; 0 = off) + whether the ~7pm "haven't
  // hit your goal" nudge is on. Shares the office-prefs query/mutation.
  contemplationGoalMinutes?: number;
  contemplationReminderEnabled?: boolean;
  // Sunday-evening weekly Way of Love review reminder (opt-out).
  weeklyReviewReminder?: boolean;
  // Opt-in (default off) to attach a coarse (~1 mile) location when you tap
  // Amen, which powers other people's "places I've been prayed for" map.
  sharePrayLocation?: boolean;
};

// Small inline row used by OfficeReminderSettings. Renders a labeled
// HH:MM picker that fires `onChange` on every commit so the parent
// can persist it through the office-prefs mutation. Hidden when the
// side's pref is "none" (the parent decides; this just renders).
function ReminderTimeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-2.5"
      style={{ borderTop: "1px solid rgba(200,212,192,0.12)" }}
    >
      <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
        {label}
      </p>
      <input
        type="time"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^\d{2}:\d{2}$/.test(v)) onChange(v);
        }}
        className="text-[14px] rounded-md px-2 py-1"
        style={{
          background: "rgba(15,40,24,0.6)",
          border: "1px solid rgba(46,107,64,0.4)",
          color: "#F0EDE6",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      />
    </div>
  );
}

// (The feed-first-home picker that used to live here moved to the
// dedicated /customize-home page — the same control now sits next to
// the reorder / show-hide handles for the rest of the home modules so
// every home-screen knob lives in one place. The server endpoint
// (PUT /api/me/feed-first-home) is unchanged; only the surface is.)

// Language toggle — open to EVERYONE, labeled "Beta" in the UI. Phoebe is
// rolling out a Spanish locale incrementally: the i18n scaffolding + the
// common keys are translated today, and more surfaces gain Spanish coverage as
// we wire `t()` through each view (missing keys fall back to English at render
// time). The toggle persists to `users.locale` via PATCH /api/auth/me/locale
// and switches i18next + localStorage immediately so the UI flips without
// waiting for the /me refetch.
function LanguageSettings() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (locale: "en" | "es") =>
      apiRequest("PATCH", "/api/auth/me/locale", { locale }),
    onSuccess: (_data, locale) => {
      // Flip the language in-memory + on disk immediately. LocaleSync will
      // also reconcile when /api/auth/me refetches, but doing it here
      // keeps the settings card responsive — the radio fills, the rest of
      // the visible UI re-renders in the new language on the next tick.
      try { localStorage.setItem("phoebe:locale", locale); } catch { /* private mode */ }
      void i18n.changeLanguage(locale);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const current: "en" | "es" = user?.locale ?? "en";
  const options: Array<{ value: "en" | "es"; label: string; sub: string }> = [
    { value: "en", label: t("settings.language_english"), sub: t("settings.language_english_sub") },
    { value: "es", label: t("settings.language_spanish"), sub: t("settings.language_subtitle") },
  ];

  return (
    <>
      <SectionHeader label={t("settings.language")} />
      <p
        className="text-[13px] mb-3"
        style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}
      >
        <span
          className="not-italic text-[9px] font-semibold uppercase rounded-full px-2 py-0.5 mr-1.5 align-middle"
          style={{ background: "rgba(46,107,64,0.25)", color: "#A8C5A0", letterSpacing: "0.1em", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Beta
        </span>
        {t("settings.language_blurb")}
      </p>
      <SettingsCard>
        {options.map((opt, i) => {
          const isSelected = current === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => save.mutate(opt.value)}
              disabled={save.isPending}
              className="w-full flex items-center gap-3 py-2.5 text-left disabled:opacity-50"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
                background: "transparent",
                cursor: save.isPending ? "wait" : "pointer",
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label}
                </p>
                {opt.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {opt.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </SettingsCard>
    </>
  );
}

function WeeklyDigestSettings() {
  const { isBeta } = useBetaStatus();
  const queryClient = useQueryClient();
  const { data } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/me/weekly-digest-pref"],
    queryFn: () => apiRequest("GET", "/api/me/weekly-digest-pref") as Promise<{ enabled: boolean }>,
    enabled: isBeta,
  });
  const save = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("PUT", "/api/me/weekly-digest-pref", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/weekly-digest-pref"] }),
  });

  if (!isBeta) return null;
  const enabled = data?.enabled ?? true;

  const options: Array<{ value: boolean; label: string; sub: string }> = [
    { value: true, label: "Tuesday evenings", sub: "When something new lands on your feeds" },
    { value: false, label: "Off", sub: "" },
  ];

  return (
    <>
      <SectionHeader label="Weekly digest" />
      <p
        className="text-[13px] mb-3"
        style={{
          color: "rgba(143,175,150,0.8)",
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
        }}
      >
        A Tuesday-evening summary of what's new on the prayer feeds you follow — a push, an email, and a slideshow that walks them.
      </p>
      <SettingsCard>
        {options.map((opt, i) => {
          const isSelected = enabled === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => save.mutate(opt.value)}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  className="text-[14px]"
                  style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}
                >
                  {opt.label}
                </p>
                {opt.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {opt.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </SettingsCard>
    </>
  );
}

// Master notifications switch. The single on/off that gates every push
// (server-side, in sendPushToUser) — bell, reminders, digest, prayers
// for you, words of comfort. Reads pushEnabled off /auth/me; saves via
// PUT /api/me/notifications-pref and re-reads auth so the granular
// sections below still show their own state.
function NotificationsSettings() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("PUT", "/api/me/notifications-pref", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });
  const enabled = user?.pushEnabled ?? true;

  // "Send a test notification" — the fastest way to tell whether reminders will
  // actually arrive. It registers the device first (the native shell handles
  // the event; no-op on web), then asks the server to push to this user's
  // tokens and reports back exactly where the chain breaks.
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const sendTest = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      try { window.dispatchEvent(new Event("phoebe:request-push-permission")); } catch { /* web no-op */ }
      await new Promise((r) => setTimeout(r, 1200)); // let registration land
      const res = (await apiRequest("POST", "/api/push/test")) as { tokenCount: number; attempted: number; succeeded: number } | null;
      if (!res || res.tokenCount === 0) {
        setTestMsg(t("settings.notif_test_no_device", { defaultValue: "No device is registered yet. Allow notifications for Phoebe in your phone's Settings, reopen the app, then try again." }));
      } else if (res.succeeded > 0) {
        setTestMsg(t("settings.notif_test_sent", { defaultValue: "Sent — check your lock screen. Your reminders will arrive the same way." }));
      } else {
        setTestMsg(t("settings.notif_test_failed", { defaultValue: "Your device is registered, but delivery failed. The notification server may still need its push keys configured." }));
      }
    } catch {
      setTestMsg(t("settings.notif_test_error", { defaultValue: "Couldn't send a test just now — try again in a moment." }));
    } finally {
      setTesting(false);
    }
  };
  const options: Array<{ value: boolean; label: string; sub: string }> = [
    { value: true, label: t("settings.notif_on"), sub: t("settings.notif_on_sub") },
    { value: false, label: t("settings.notif_off"), sub: t("settings.notif_off_sub") },
  ];
  return (
    <>
      <SectionHeader label={t("settings.notifications")} />
      <p
        className="text-[13px] mb-3"
        style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}
      >
        {t("settings.notif_blurb")}
      </p>
      <SettingsCard>
        {options.map((opt, i) => {
          const isSelected = enabled === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => save.mutate(opt.value)}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{ borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)", background: "transparent", cursor: "pointer" }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label}
                </p>
                {opt.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {opt.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </SettingsCard>

      {/* Test notification — verify the whole pipeline (token + APNs) in one tap. */}
      <button
        type="button"
        onClick={sendTest}
        disabled={testing || !enabled}
        className="w-full mt-3 py-2.5 rounded-xl text-[14px]"
        style={{
          background: "rgba(46,107,64,0.18)",
          border: "1px solid rgba(46,107,64,0.4)",
          color: enabled ? "#F0EDE6" : "rgba(143,175,150,0.5)",
          fontFamily: "'Space Grotesk', sans-serif",
          cursor: testing || !enabled ? "default" : "pointer",
          opacity: testing ? 0.7 : 1,
        }}
      >
        {testing
          ? t("settings.notif_test_sending", { defaultValue: "Sending…" })
          : t("settings.notif_test_button", { defaultValue: "Send a test notification" })}
      </button>
      {!enabled && (
        <p className="text-[12px] mt-2" style={{ color: "rgba(143,175,150,0.6)" }}>
          {t("settings.notif_test_off_hint", { defaultValue: "Turn notifications on above to send a test." })}
        </p>
      )}
      {testMsg && (
        <p className="text-[12.5px] mt-2" style={{ color: "#8FAF96", lineHeight: 1.5 }}>
          {testMsg}
        </p>
      )}
    </>
  );
}

// ── EmailSettings ──────────────────────────────────────────────────────────
// Master opt-in/out for non-essential EMAIL — newsletters, the weekly
// prayer-feed digest, announcements, and community prayer-invite prompts.
// Reads emailEnabled off /auth/me; saves via PATCH /api/auth/me/email-enabled.
// The in-app twin of the "Unsubscribe" link at the bottom of every bulk email
// (both flip users.email_enabled). Transactional mail — password resets, magic
// links — is never affected.
function EmailSettings() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (emailEnabled: boolean) => apiRequest("PATCH", "/api/auth/me/email-enabled", { emailEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });
  const enabled = user?.emailEnabled ?? true;
  const options: Array<{ value: boolean; label: string; sub: string }> = [
    { value: true, label: t("settings.email_on", { defaultValue: "Occasional emails on" }), sub: t("settings.email_on_sub", { defaultValue: "Newsletters, the weekly prayer-feed digest, and community prompts." }) },
    { value: false, label: t("settings.email_off", { defaultValue: "Unsubscribe from emails" }), sub: t("settings.email_off_sub", { defaultValue: "Stops non-essential email. Account & security emails still arrive." }) },
  ];
  return (
    <>
      <SectionHeader label={t("settings.emails", { defaultValue: "Emails" })} />
      <p
        className="text-[13px] mb-3"
        style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}
      >
        {t("settings.email_blurb", { defaultValue: "Choose whether Phoebe sends you occasional emails. You can also unsubscribe from the link at the bottom of any email." })}
      </p>
      <SettingsCard>
        {options.map((opt, i) => {
          const isSelected = enabled === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => save.mutate(opt.value)}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{ borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)", background: "transparent", cursor: "pointer" }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label}
                </p>
                {opt.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {opt.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </SettingsCard>
    </>
  );
}

// ── DefaultPrayerLevelSettings ─────────────────────────────────────────────
// Three-way radio for which depth the home-screen office card's "Begin
// prayer" CTA drops the user into. Mirrors the visual rhythm of the
// OfficeReminderSettings options below. Shares the same /api/me/office-prefs
// endpoint so the picker save is a single round-trip with the rest of
// the office prefs.
// The full default-prayer + office-shape settings now live in the dedicated
// office customizer ("customize slideshow", /bcp/daily-office/settings). This
// page just links there with a single pill so there's one home for all the
// office knobs rather than two diverging copies.
function DefaultPrayerLevelSettings() {
  return (
    <>
      <SectionHeader label="Your daily prayer habit" />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        Choose what "Begin prayer" opens, how the office reads, the confession, the closing reflection, and more.
      </p>
      <Link
        href="/bcp/daily-office/settings"
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[14px] font-semibold transition-opacity hover:opacity-90"
        style={{
          background: "rgba(46,107,64,0.22)",
          color: "#C8D4C0",
          border: "1px solid rgba(46,107,64,0.4)",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        <span aria-hidden>⚙️</span>
        Customize your daily prayer habit
        <span aria-hidden>→</span>
      </Link>
    </>
  );
}

function OfficeReminderSettings() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { data } = useQuery<OfficePrefs>({
    queryKey: ["/api/me/office-prefs"],
    queryFn: () => apiRequest("GET", "/api/me/office-prefs") as Promise<OfficePrefs>,
  });
  const save = useMutation({
    mutationFn: (patch: Partial<OfficePrefs>) =>
      apiRequest("PUT", "/api/me/office-prefs", patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/me/office-prefs"] }),
  });


  const morning = data?.morning ?? "none";
  const evening = data?.evening ?? "none";
  // Default placeholders so the time picker has a sensible starting
  // value when the user first turns a side on. Stored values (when
  // present) override these.
  const DEFAULT_MORNING = "07:00";
  const DEFAULT_EVENING = "18:00";
  const morningTime = data?.morningTime ?? DEFAULT_MORNING;
  const eveningTime = data?.eveningTime ?? DEFAULT_EVENING;

  // On/off only — the reminder opens whatever the user set as their default
  // prayer (begin-prayer routes by level + time of day), so we don't pick an
  // office here. "office" is just the stored "on" sentinel; any non-"none"
  // value (incl. legacy "devotion") reads as on.
  const morningOptions: Array<{ value: OfficePref; label: string; sub: string }> = [
    { value: "none", label: t("settings.no_reminder"), sub: "" },
    { value: "office", label: t("settings.notify_each_morning", { defaultValue: "Notify me each morning" }), sub: t("settings.notify_opens_default", { defaultValue: "Opens your default prayer" }) },
  ];
  const eveningOptions: Array<{ value: OfficePref; label: string; sub: string }> = [
    { value: "none", label: t("settings.no_reminder"), sub: "" },
    { value: "office", label: t("settings.notify_each_evening", { defaultValue: "Notify me each evening" }), sub: t("settings.notify_opens_default", { defaultValue: "Opens your default prayer" }) },
  ];

  return (
    <>
      <SectionHeader label={t("settings.daily_reminders")} />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        {t("settings.daily_reminders_blurb")}
      </p>
      <SettingsCard>
        <p className="text-[12px] font-semibold mb-2" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
          {t("offices.in_the_morning")}
        </p>
        {morningOptions.map((opt, i) => {
          // The "on" option is selected for ANY non-"none" pref (covers
          // legacy "devotion" values that now just mean "on").
          const isSelected = opt.value === "none" ? morning === "none" : morning !== "none";
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => save.mutate({ morning: opt.value })}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label}
                </p>
                {opt.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {opt.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        {morning !== "none" && (
          <ReminderTimeRow
            label={t("settings.reminder_time")}
            value={morningTime}
            onChange={(time) => save.mutate({ morningTime: time })}
          />
        )}
      </SettingsCard>
      <SettingsCard>
        <p className="text-[12px] font-semibold mb-2" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
          {t("offices.in_the_evening")}
        </p>
        {eveningOptions.map((opt, i) => {
          const isSelected = opt.value === "none" ? evening === "none" : evening !== "none";
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => save.mutate({ evening: opt.value })}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${isSelected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: isSelected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label}
                </p>
                {opt.sub && (
                  <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                    {opt.sub}
                  </p>
                )}
              </div>
            </button>
          );
        })}
        {evening !== "none" && (
          <ReminderTimeRow
            label={t("settings.reminder_time")}
            value={eveningTime}
            onChange={(time) => save.mutate({ eveningTime: time })}
          />
        )}
      </SettingsCard>

      {/* The daily contemplation goal lives on the Contemplation page; the
          Confession of Sin toggle and the weekly review live in the office
          customizer ("customize slideshow") — not duplicated here. */}
      <AppleHealthSettings />
    </>
  );
}

// ─── Office close-up extras ────────────────────────────────────────────────
//
// Three independent toggles that shape how Morning + Evening Prayer
// end. All localStorage-backed (see lib/officePrefs.ts) — these are
// per-device preferences, not yet worth a server column.
//
//   • Read CAC reflection at the close — adds a "🌅 Read CAC
//     reflection →" pill on the office closing slide. Opens today's
//     CAC daily meditation externally + marks it read so the home
//     screen's CAC card flips to "Read again."
//   • Read Forward Day by Day at the close — sibling toggle pointing
//     at Forward Movement's prayer.forwardmovement.org/fdd. Both can
//     be on; both pills appear stacked on the closing slide.
//   • Include a gratitude slide — splices a "Personal Thanksgiving"
//     slide in before the closing on both Morning and Evening Prayer.
//     A contemplative prompt; not interactive (the dedicated
//     /gratitude surface is where journal entries live).
// Default tradition for the read-aloud (audio) office. Forward Movement
// = the US 1979 BCP offices; Church of England = Common Worship Morning/
// Evening Prayer. The audio-office player can also switch this live; this
// just sets the default it opens with.
function OfficeAudioSourceSettings() {
  const { officeAudioSource } = useOfficePrefs();
  const options: Array<{ value: OfficeAudioSource; label: string; sub: string; emoji: string }> = [
    { value: "forward-movement", label: "Forward Movement", sub: "The US 1979 Book of Common Prayer offices, read aloud.", emoji: "📖" },
    { value: "church-of-england", label: "Church of England", sub: "Common Worship Morning & Evening Prayer.", emoji: "⛪" },
  ];
  return (
    <>
      <SectionHeader label="Listen to the office" />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        Choose which tradition the read-aloud Morning and Evening Prayer plays by default. You can also switch it any time while listening.
      </p>
      <SettingsCard>
        {options.map((opt, i) => {
          const selected = officeAudioSource === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setOfficeAudioSource(opt.value)}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                background: "transparent",
                cursor: "pointer",
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${selected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: selected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label} <span>{opt.emoji}</span>
                </p>
                <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                  {opt.sub}
                </p>
              </div>
            </button>
          );
        })}
      </SettingsCard>
    </>
  );
}

function OfficeCloseExtrasSettings() {
  const prefs = useOfficePrefs();
  // The radio reflects the EFFECTIVE source (explicit pick → visible
  // home card → FDD default), so what's highlighted always matches the
  // pill the user actually gets. Tapping an option makes it explicit.
  const effectiveSource = useEffectiveReflectionSource();
  const options: Array<{ value: ReflectionSource; label: string; sub: string; emoji: string }> = [
    { value: "cac", label: "CAC Daily Reflection", sub: "From the Center for Action & Contemplation.", emoji: "🌅" },
    { value: "fdd", label: "Forward Day by Day", sub: "From Forward Movement.", emoji: "📖" },
    { value: "ssje", label: "SSJE Reflections", sub: "From the Society of Saint John the Evangelist.", emoji: "✍🏽" },
    { value: "none", label: "No reflection", sub: "No pill at the close.", emoji: "—" },
  ];
  return (
    <>
      <SectionHeader label="After the office" />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        Pick one daily reflection to read at the close of Morning and Evening Prayer. A single pill on the last slide opens today's reading. If you don't choose here, Phoebe follows whichever reflection you've added to your home screen, or Forward Day by Day.
      </p>
      <SettingsCard>
        {options.map((opt, i) => {
          const selected = effectiveSource === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setReflectionSource(opt.value)}
              className="w-full flex items-center gap-3 py-2.5 text-left"
              style={{
                background: "transparent",
                cursor: "pointer",
                borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)",
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  border: `2px solid ${selected ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
                  background: selected ? "#A8C5A0" : "transparent",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
                  {opt.label} {opt.emoji !== "—" && <span>{opt.emoji}</span>}
                </p>
                <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                  {opt.sub}
                </p>
              </div>
            </button>
          );
        })}
      </SettingsCard>

      <SectionHeader label="Gratitude in the office" />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        Add a moment to name what you're grateful for, before the office closes.
      </p>
      <SettingsCard>
        <button
          type="button"
          onClick={() => setIncludeGratitudeSlide(!prefs.includeGratitudeSlide)}
          className="w-full flex items-center gap-3 py-2.5 text-left"
          style={{ background: "transparent", cursor: "pointer" }}
        >
          <div
            style={{
              width: 18, height: 18, borderRadius: "50%",
              border: `2px solid ${prefs.includeGratitudeSlide ? "#A8C5A0" : "rgba(143,175,150,0.4)"}`,
              background: prefs.includeGratitudeSlide ? "#A8C5A0" : "transparent",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
              Include a gratitude slide 🌾
            </p>
            <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
              {prefs.includeGratitudeSlide
                ? "Shown before the closing slide, in both Morning and Evening Prayer."
                : "The office closes straight from the General Thanksgiving."}
            </p>
          </div>
        </button>
      </SettingsCard>
    </>
  );
}

// ─── Muted People ───────────────────────────────────────────────────────────

type MutedUser = { userId: number; name: string; email: string };

// Each row is ~52px tall; show 3.5 rows = ~182px
const PREVIEW_HEIGHT = 182;

// ─── Offices-only extras ─────────────────────────────────────────────
// Tier-specific settings card that only appears for users whose
// account is `offices-only`. Surfaces:
//   1. "Daily feed reminder" — a once-a-day reminder push toggle.
//      Stored client-side (localStorage) for now; the server-side
//      push delivery job that consumes it is a follow-up. Surfacing
//      the toggle now means the preference is captured the moment a
//      user is interested.
// The old "Hide offices on home" toggle that used to live here is gone
// — the server-backed feed-first-home picker (now on /customize-home,
// alongside the rest of the home-module controls) is the single control
// for what leads the home. Keeping both meant a creation-feed sign-up
// saw the office hidden by feed_first_home while this localStorage
// toggle still read "off," which was contradictory.
// The toggle below read/writes localStorage on render so it always
// reflects the current persisted state.
const FEED_REMINDER_LS_KEY = "phoebe:offices-only:feed-reminder-enabled";

function readLsBool(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeLsBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* private mode / quota — non-fatal */
  }
}

function OfficesOnlyExtras() {
  // Fetch the viewer's first subscribed feed so the reminder
  // toggle's label can mention that feed by name ("Daily reminder
  // for 🌿 Phoebe Climate") instead of a generic "your feed".
  // Falls back to "your prayer feed" if the user isn't subscribed
  // to anything yet — the toggle still works, the label is just
  // less specific.
  type SubscribedFeed = { feed: { slug: string; title: string; coverEmoji: string | null } };
  const { data } = useQuery<{ subscriptions: SubscribedFeed[] }>({
    queryKey: ["/api/prayer-feeds/subscribed"],
    queryFn: () => apiRequest("GET", "/api/prayer-feeds/subscribed"),
    staleTime: 60_000,
  });
  const firstFeed = data?.subscriptions?.[0]?.feed ?? null;
  const feedLabel = firstFeed
    ? `${firstFeed.coverEmoji ?? "🌿"} ${firstFeed.title}`
    : "your prayer feed";

  const [feedReminder, setFeedReminder] = useState<boolean>(() =>
    readLsBool(FEED_REMINDER_LS_KEY),
  );

  const toggleFeedReminder = () => {
    const next = !feedReminder;
    setFeedReminder(next);
    writeLsBool(FEED_REMINDER_LS_KEY, next);
  };

  return (
    <>
      <SectionHeader label="Phoebe home" />

      <SettingsCard>
        <button
          onClick={toggleFeedReminder}
          className="w-full flex items-center justify-between"
        >
          <div className="text-left">
            <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>
              Daily reminder for {feedLabel}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
              A gentle once-a-day nudge to pray your feed.
            </p>
          </div>
          <div
            className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${feedReminder ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}
          >
            <div
              className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${feedReminder ? "left-[21px]" : "left-[3px]"}`}
              style={{ background: "#F0EDE6" }}
            />
          </div>
        </button>
      </SettingsCard>

      <div className="mb-8" />
    </>
  );
}

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

// ─── Phone number section ──────────────────────────────────────────────────
// One-line form: input + Save (or Remove if already set). On submit,
// POSTs the raw display string to /api/users/me/phone — server
// normalizes + hashes. We surface friendly server errors (invalid
// format, number already taken) inline.
function PhoneSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Native-only gate. Phone-number entry is a contact-discovery feature
  // and the only way to populate it cleanly is "Use my number from iOS
  // Contacts" — that path doesn't exist on the web build, so showing
  // the form there is just an empty input asking for a number we have
  // no way to verify. Hide the entire section unless we're inside the
  // Capacitor shell.
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    try {
      const phoebeNative = (window as { PhoebeNative?: { isNative?: () => boolean } }).PhoebeNative;
      if (phoebeNative?.isNative?.()) setIsNative(true);
    } catch {
      /* ignore */
    }
  }, []);
  // iOS-Contacts pre-fill state. We let the user verify by attestation:
  // tap "Use my number from iOS Contacts" → we read all contacts → find
  // the entry whose emails include the user's signed-in email → present
  // its phone numbers as one-tap buttons. The number must already exist
  // in the user's own iOS Contacts under their own email, which is much
  // stronger than self-attestation (anyone could type any number, but
  // they can't trivially write to someone else's iOS Contacts).
  const [iosStage, setIosStage] = useState<"idle" | "reading" | "no-native" | "denied" | "no-match" | "error">("idle");
  const [iosCandidates, setIosCandidates] = useState<string[]>([]);
  const [iosErrorMsg, setIosErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: (phone: string) =>
      apiRequest("POST", "/api/users/me/phone", { phone }),
    onSuccess: (data: unknown) => {
      const body = data as { phoneNumber: string };
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, phoneNumber: body.phoneNumber } : prev);
      setEditing(false);
      setError(null);
      // Clear the iOS picker too — we've taken one of its candidates.
      setIosCandidates([]);
      setIosStage("idle");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const friendly = /phone_taken|409/i.test(msg)
        ? "Another account is using this number. Contact support if that's you."
        : /invalid_phone|400/i.test(msg)
          ? "That doesn't look like a valid phone number. Try +1 555 123 4567."
          : "Couldn't save. Tap Save to try again.";
      setError(friendly);
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/users/me/phone"),
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], (prev: typeof user) =>
        prev ? { ...prev, phoneNumber: null } : prev);
      setEditing(false);
      setDraft("");
      setError(null);
    },
  });

  // Wire native contact-event listeners. Mounted while the section is
  // visible; cleaned on unmount. We branch on stage === "reading" so
  // events fired by an unrelated dispatcher elsewhere in the app don't
  // accidentally hijack our UI state.
  useEffect(() => {
    const userEmail = (user?.email ?? "").trim().toLowerCase();

    function handleReady(e: Event) {
      if (iosStage !== "reading") return;
      const detail = (e as CustomEvent).detail as
        | { contacts: Array<{ id: string; name: string; emails: string[]; phones: string[] }> }
        | undefined;
      const contacts = detail?.contacts ?? [];

      const userNameLower = (user?.name ?? "").trim().toLowerCase();
      const contactsWithEmail = contacts.filter((c) =>
        (c.emails ?? []).some((em) => em.trim().toLowerCase() === userEmail),
      );
      const contactsWithName = userNameLower
        ? contacts.filter((c) => (c.name ?? "").trim().toLowerCase() === userNameLower)
        : [];

      // Diagnostic — visible in Safari Web Inspector when tethered.
      // Helps debug "I have my email in my contact card but the matcher
      // says no" reports: usually the plugin returns a smaller address
      // book than the user expects (iCloud sync incomplete, suggested
      // contacts excluded by the plugin, etc.) or the contact has the
      // email but no phone numbers attached to that card.
      console.log("[PhoneSection] iOS contacts read:", {
        total: contacts.length,
        userEmail,
        userName: userNameLower,
        matchedByEmail: contactsWithEmail.length,
        matchedByName: contactsWithName.length,
        sampleEmails: contacts.slice(0, 3).map((c) => ({
          name: c.name,
          emails: c.emails,
          phoneCount: c.phones?.length ?? 0,
        })),
      });

      // Fold phones across any matching cards.
      const phones = new Set<string>();
      const tryAdd = (c: { phones: string[] }) => {
        for (const p of c.phones ?? []) {
          const trimmed = p.trim();
          if (trimmed) phones.add(trimmed);
        }
      };
      for (const c of contactsWithEmail) tryAdd(c);

      // Name-based fallback — if email match found nothing, try the
      // contact whose display name matches the signed-in user. Less
      // precise (multiple "John Smith" entries possible) but catches
      // the common case where the contact card has the user's
      // personal email but not the work email they signed up with.
      if (phones.size === 0) {
        for (const c of contactsWithName) tryAdd(c);
      }

      if (phones.size === 0) {
        setIosStage("no-match");
        return;
      }
      // Earlier flow: render candidates as tap-to-pick buttons, save on
      // tap. New flow: pre-fill the input with the first candidate and
      // open the form so the user just hits Save (or edits first).
      // Avoids the extra UI when there's one obvious answer.
      const list = Array.from(phones);
      const first = list[0] ?? "";
      setDraft(first);
      setEditing(true);
      setIosCandidates([]);
      setIosStage("idle");
    }
    function handleDenied() {
      if (iosStage !== "reading") return;
      setIosStage("denied");
    }
    function handleError(e: Event) {
      if (iosStage !== "reading") return;
      const detail = (e as CustomEvent).detail;
      setIosErrorMsg(detail instanceof Error ? detail.message : "Couldn't read contacts.");
      setIosStage("error");
    }

    window.addEventListener("phoebe:contacts-ready", handleReady);
    window.addEventListener("phoebe:contacts-denied", handleDenied);
    window.addEventListener("phoebe:contacts-error", handleError);
    return () => {
      window.removeEventListener("phoebe:contacts-ready", handleReady);
      window.removeEventListener("phoebe:contacts-denied", handleDenied);
      window.removeEventListener("phoebe:contacts-error", handleError);
    };
  }, [iosStage, user?.email]);

  function pickFromIosContacts() {
    if (!isNativeShell()) {
      setIosStage("no-native");
      return;
    }
    setIosErrorMsg(null);
    setIosCandidates([]);
    setIosStage("reading");
    window.dispatchEvent(new Event("phoebe:request-contacts"));
  }

  const current = user?.phoneNumber ?? null;

  if (!isNative) return null;

  return (
    <SettingsCard>
      <p className="text-sm font-medium mb-1" style={{ color: "#F0EDE6" }}>
        Phone number
      </p>
      <p className="text-xs mb-3" style={{ color: "#8FAF96" }}>
        People who have you in their contacts will be able to find you on
        Phoebe.
      </p>

      {!editing && current && (
        <div className="flex items-center gap-2">
          <span className="text-sm flex-1" style={{ color: "#C8D4C0", fontFamily: "'Space Grotesk', sans-serif" }}>
            {current}
          </span>
          <button
            onClick={() => { setDraft(current); setEditing(true); }}
            className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
            style={{ background: "rgba(46,107,64,0.15)", color: "#A8C5A0" }}
          >
            Change
          </button>
          <button
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ color: "#8FAF96" }}
          >
            Remove
          </button>
        </div>
      )}

      {(editing || !current) && (
        <div className="space-y-3">
          {/* iOS Contacts pre-fill — only meaningful on the native shell.
              The sequencer here is: idle → tap → reading → either we
              get candidates (rendered as pick buttons) or one of the
              error/denied/no-match states. Picking a candidate fires
              saveMutation directly. */}
          <button
            onClick={pickFromIosContacts}
            disabled={iosStage === "reading"}
            className="w-full px-3 py-2.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "rgba(46,107,64,0.18)", color: "#C8D4C0", border: "1px solid rgba(46,107,64,0.35)" }}
          >
            {iosStage === "reading" ? "Reading your contacts…" : "📱 Use my number from iOS Contacts"}
          </button>

          {iosStage === "no-match" && (
            <div className="text-[11px] space-y-1.5" style={{ color: "#8FAF96" }}>
              <p>
                We didn't find a contact with your email ({user?.email}) or
                your name in your iOS Contacts.
              </p>
              <p>
                If you have your own card saved in the Contacts app, make
                sure it includes either {user?.email} or "{user?.name}"
                exactly, plus a phone number — then tap the button again.
                Otherwise just type it below.
              </p>
            </div>
          )}
          {iosStage === "denied" && (
            <p className="text-[11px]" style={{ color: "#C47A65" }}>
              Phoebe doesn't have permission to read your contacts. Open
              Settings → Phoebe → Contacts and turn it on.
            </p>
          )}
          {iosStage === "no-native" && (
            <p className="text-[11px]" style={{ color: "#8FAF96" }}>
              Reading from iOS Contacts only works in the Phoebe app on
              your phone.
            </p>
          )}
          {iosStage === "error" && (
            <p className="text-[11px]" style={{ color: "#C47A65" }}>
              {iosErrorMsg ?? "Couldn't read contacts."}
            </p>
          )}

          {/* Manual entry fallback — separated by a thin divider so the
              two paths read as siblings, not as a primary + footnote. */}
          <div className="flex items-center gap-2 my-1">
            <div className="flex-1 h-px" style={{ background: "rgba(46,107,64,0.2)" }} />
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "rgba(143,175,150,0.4)" }}>or type it</span>
            <div className="flex-1 h-px" style={{ background: "rgba(46,107,64,0.2)" }} />
          </div>

          <input
            type="tel"
            value={editing ? draft : ""}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onFocus={() => { if (!editing) setEditing(true); }}
            placeholder="+1 555 123 4567"
            inputMode="tel"
            autoComplete="tel"
            className="w-full text-sm px-3 py-2.5 rounded-lg outline-none"
            style={{
              color: "#F0EDE6",
              background: "rgba(200,212,192,0.05)",
              border: `1px solid ${error ? "rgba(196,122,101,0.6)" : "rgba(46,107,64,0.3)"}`,
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 16,  // ≥16px to block iOS auto-zoom
            }}
          />
          {error && (
            <p className="text-xs" style={{ color: "#C47A65" }}>{error}</p>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!draft.trim()) { setError("Enter a phone number first."); return; }
                saveMutation.mutate(draft);
              }}
              disabled={!draft.trim() || saveMutation.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ background: "rgba(46,107,64,0.2)", color: "#A8C5A0" }}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </button>
            {editing && current && (
              <button
                onClick={() => { setEditing(false); setDraft(""); setError(null); }}
                className="px-3 py-1.5 rounded-lg text-xs transition-opacity hover:opacity-80"
                style={{ color: "#8FAF96" }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

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

// News & Actions — beta-only. Follow partner ministries to get their new
// stories as a short slide at the close of prayer; the follow toggles
// live on the News & Actions page, which this points to.
function NewsActionsSettings() {
  const { isBeta } = useBetaStatus();
  const [, setLocation] = useLocation();
  if (!isBeta) return null;
  return (
    <>
      <SectionHeader label="News & Actions" />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        Follow ministries to see their latest news at the close of your prayer. Nothing appears until you follow a source.
      </p>
      <SettingsCard>
        <button
          type="button"
          onClick={() => setLocation("/news")}
          className="w-full flex items-center gap-3 py-2.5 text-left"
          style={{ background: "transparent", cursor: "pointer" }}
        >
          <span style={{ fontSize: 18 }}>📰</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
              Manage news sources →
            </p>
            <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
              Follow or unfollow on the News &amp; Actions page.
            </p>
          </div>
        </button>
      </SettingsCard>
    </>
  );
}

// ─── Main Settings Page ─────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
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
            {t("settings.title")} ⚙️
          </h1>
          <p className="text-sm" style={{ color: "#8FAF96" }}>
            {t("settings.page_sub")}
          </p>
        </div>

        {/* ── Account ── */}
        <SectionHeader label={t("settings.account")} />
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

        {/* ── Default prayer depth ──
            Picker for which of the three depths the home-screen
            "Begin prayer" CTA jumps into. Sits right above the
            reminder settings since both groups read as "how you
            engage with the office." */}
        <DefaultPrayerLevelSettings />

        {/* ── Office reminders ── */}
        <OfficeReminderSettings />

        {/* The office close-up extras (after-the-office reflection,
            gratitude slide), the audio tradition, and News & Actions now
            live in the office customizer ("customize slideshow") reached
            from the pill above — not duplicated here. */}

        {/* ── Language ── */}
        <LanguageSettings />

        {/* ── Offices-only extras ──
            Two tier-specific toggles that only render for the
            offices-only access tier:
              • Daily feed reminder — opt-in once-a-day push
                pointing at the user's subscribed prayer feed.
              • Hide offices on home — collapses the Daily Office
                card on the offices-only home so the screen reads
                as "just my feed" for users who don't pray the
                office. Both preferences are read by the offices-
                only home (parish-dashboard) on next paint. */}
        {user.accessTier === "offices-only" && <OfficesOnlyExtras />}

        {/* ── Phone number — used for contact discovery so people who
              already have you in their address book can find you on
              Phoebe. Verification (SMS) isn't live yet, so the form
              warns the user to enter their own real number only. Lives
              lower in the page (below the prayer-related settings)
              since it's a quieter, optional account detail. */}
        <div className="mb-8">
          <PhoneSection />
        </div>

        {/* ── Muted People ── */}
        <MutedPeople />
        <div className="mb-8" />

        {/* ── Notifications master switch — the pause-everything toggle.
            Kept at the bottom of the settings (below the other prefs,
            above the account actions) per direction. ── */}
        <NotificationsSettings />
        <div className="mb-8" />

        {/* ── Email opt-in/out — the email-channel twin of the notifications
            switch + the Unsubscribe link in every bulk email. ── */}
        <EmailSettings />
        <div className="mb-8" />

        {/* ── Sign out ── */}
        <button
          onClick={() => { logout(); setLocation("/"); }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.18)" }}
        >
          <LogOut size={15} />
          {t("settings.sign_out")}
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

        <div className="mt-6 pb-4 text-center flex justify-center gap-5">
          <Link href="/terms">
            <span className="text-xs" style={{ color: "#8FAF96", textDecoration: "underline", cursor: "pointer" }}>
              Terms of Use
            </span>
          </Link>
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
