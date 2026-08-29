import { useState, useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Layout } from "@/components/layout";
import { useAuth, useLogout } from "@/hooks/useAuth";
import { checkPushPermission, enablePushNotifications, type PermState } from "@/lib/pushPermission";
import { usePilotMode } from "@/hooks/usePilotMode";
import { useEntitlements } from "@/hooks/useEntitlements";
import { useGuestMode } from "@/hooks/useGuestMode";
import { usePrayerRequestsEnabled } from "@/hooks/usePrayerRequests";
import { unmuteUser, type MutedPerson } from "@/lib/mutes";
import { pushRoutineConfig } from "@/lib/routineSync";
import { notificationsSupportedHere } from "@/lib/notifSupport";
import { getEnabledWeekly, setEnabledWeekly, WEEKLY_ENABLED_EVENT, WEEKLY_PRACTICES_ENABLED, type WeeklyKind } from "@/lib/weeklyRhythm";
import { useBetaStatus } from "@/hooks/useDemo";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";
import { LogOut, Camera, Pencil, Trash2, Download } from "lucide-react";
import { AvatarCropModal } from "@/components/AvatarCropModal";
import {
  useOfficePrefs,
  useEffectiveReflectionSource,
  setReflectionSource,
  setIncludeGratitudeSlide,
  setOfficeAudioSource,
  type ReflectionSource,
  type OfficeAudioSource,
} from "@/lib/officePrefs";
import { resetRoutineToDefault } from "@/lib/resetRoutine";


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
type DefaultPrayerLevel = "ask" | "devotion" | "office" | "intercessions" | "reflect-sit";
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
  // "gentle" (default) = one reminder per side. "nudge" = also send a
  // follow-up ~3h later if that side's office/practice still isn't done.
  notificationStyle?: "gentle" | "nudge";
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
/**
 * Device-level permission, and the one control that can actually change it.
 *
 * Owner: "in the settings, if they don't have notifications on in the device
 * they're working on, a button that says turn on notifications, that does the
 * system prompt."
 *
 * The master switch above is Phoebe's OWN preference — it can be ON while the
 * OS is refusing every push, which is the state that produces "I turned
 * reminders on and nothing arrives". This row is about the OS, and it only
 * appears when the OS is the thing standing in the way.
 *
 * DENIED gets a different row, not a disabled button: iOS shows its
 * permission dialog exactly once, so after a refusal nothing in the app can
 * re-ask, and a button that silently does nothing is worse than a sentence
 * saying where to go.
 */
function DevicePermissionRow() {
  const { t } = useTranslation();
  const [perm, setPerm] = useState<PermState>("unknown");
  const [working, setWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const read = () => { void checkPushPermission().then((p) => { if (!cancelled) setPerm(p); }); };
    read();
    // Re-read on return from the OS settings app — someone who leaves to allow
    // notifications should come back to a row that knows.
    const onVis = () => { if (document.visibilityState === "visible") read(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVis); };
  }, []);

  // "unknown" means we couldn't ask (an older shell, a browser with no push at
  // all). Offering to fix something we can't see the state of would be a
  // button that does nothing, so stay quiet — same for granted.
  if (perm === "granted" || perm === "unknown") return null;

  if (perm === "denied") {
    return (
      <div
        className="w-full mt-3 py-3 px-3.5 rounded-xl"
        style={{ background: "rgba(46,107,64,0.12)", border: "1px solid rgba(46,107,64,0.3)" }}
      >
        <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
          {t("settings.notif_device_off", { defaultValue: "Notifications are off for Phoebe on this device" })}
        </p>
        <p className="text-[12.5px]" style={{ color: "#8FAF96", margin: "4px 0 0", lineHeight: 1.5 }}>
          {t("settings.notif_device_denied_sub", { defaultValue: "This one has to be turned back on outside the app — open your device's Settings, find Phoebe, and allow Notifications." })}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={working}
      onClick={async () => {
        setWorking(true);
        try { setPerm(await enablePushNotifications()); } finally { setWorking(false); }
      }}
      className="w-full mt-3 py-2.5 rounded-xl text-[14px]"
      style={{
        background: "rgba(46,107,64,0.18)",
        border: "1px solid rgba(46,107,64,0.4)",
        color: "#F0EDE6",
        fontFamily: "'Space Grotesk', sans-serif",
        cursor: working ? "default" : "pointer",
        opacity: working ? 0.7 : 1,
      }}
    >
      {working
        ? t("settings.notif_device_turning_on", { defaultValue: "Turning on…" })
        : t("settings.notif_device_turn_on", { defaultValue: "Turn on notifications" })}
    </button>
  );
}

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
      const res = (await apiRequest("POST", "/api/push/test")) as {
        tokenCount: number; attempted: number; succeeded: number;
        deviceSucceeded?: number; webSucceeded?: number;
        schedulerLastRunAgoMin: number | null;
      } | null;
      // Scheduled reminders (morning/evening prayer) come from a 15-min cron.
      // If it hasn't ticked recently, those won't fire even when push works.
      const sched = res?.schedulerLastRunAgoMin;
      const schedNote = sched == null
        ? " Reminder scheduler: not detected yet — check back in a few minutes."
        : sched <= 20
          ? ` Reminder scheduler: running (last tick ${sched} min ago) ✓`
          : ` Reminder scheduler: last ran ${sched} min ago — may be stalled.`;
      // Report WHICH device answered. "Sent — check your lock screen" used to
      // fire on any success at all, so a desktop browser's web-push
      // subscription could report cheerful success while this phone's APNs
      // token was dead — the exact false-negative that sent a real
      // "reminders are broken" report chasing iOS Focus modes.
      const deviceOk = (res?.deviceSucceeded ?? res?.succeeded ?? 0) > 0;
      const webOnly = !deviceOk && (res?.webSucceeded ?? 0) > 0;
      if (!res || res.tokenCount === 0) {
        setTestMsg(t("settings.notif_test_no_device", { defaultValue: "No device is registered yet. Allow notifications for Phoebe in your phone's Settings, reopen the app, then try again." }));
      } else if (webOnly) {
        setTestMsg(t("settings.notif_test_web_only", { defaultValue: "Delivered to a browser you're signed in to — but NOT to this device. This device's notification registration has expired; reinstall or update the app, then allow notifications when asked." }) + schedNote);
      } else if (deviceOk) {
        setTestMsg(t("settings.notif_test_sent", { defaultValue: "Sent — check your lock screen. Your reminders will arrive the same way." }) + schedNote);
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

      {/* The OS's own permission — above the test button on purpose: when the
          device is refusing push, allowing it is the step that has to happen
          first, and a test sent before it can only report failure. */}
      <DevicePermissionRow />

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
// Weekly practices — the Way of Love weekly rhythm (Commune · Go · Bless · Rest).
// One On/Off control: it's ALL FOUR or nothing (owner). Available to everyone,
// including light users — reads/writes the local `phoebe:weekly-practices` set
// (all four kinds when on, empty when off) that the home "This week" band reads.
const WEEKLY_ALL: WeeklyKind[] = ["commune", "go", "bless", "rest"];
function WeeklyPracticesSettings() {
  const { t } = useTranslation();
  const [on, setOn] = useState<boolean>(() => getEnabledWeekly().length > 0);
  useEffect(() => {
    const sync = () => setOn(getEnabledWeekly().length > 0);
    window.addEventListener(WEEKLY_ENABLED_EVENT, sync);
    return () => window.removeEventListener(WEEKLY_ENABLED_EVENT, sync);
  }, []);
  const set = (next: boolean) => {
    setEnabledWeekly(next ? WEEKLY_ALL : []);
    setOn(next);
  };
  const options: Array<{ value: boolean; label: string; sub: string }> = [
    { value: true, label: t("settings.weekly_on", { defaultValue: "Weekly practices on" }), sub: t("settings.weekly_on_sub", { defaultValue: "Commune · Go · Bless · Rest — a quiet weekly band on your home you tap to log. Private; no sharing, no streak." }) },
    { value: false, label: t("settings.weekly_off", { defaultValue: "Weekly practices off" }), sub: t("settings.weekly_off_sub", { defaultValue: "The “This week” band is hidden. Your daily rhythm is unaffected." }) },
  ];
  return (
    <>
      <SectionHeader label={t("settings.weekly_practices", { defaultValue: "Weekly practices" })} />
      <SettingsCard>
        {options.map((opt, i) => {
          const isSelected = on === opt.value;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => set(opt.value)}
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
                <p className="text-[12px] mt-0.5" style={{ color: "rgba(143,175,150,0.7)", fontFamily: "'Space Grotesk', sans-serif", margin: 0, lineHeight: 1.4 }}>
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
  // Pilot's rhythm builder is /pilot/build (the full /rule-of-life customizer
  // isn't pilot-reachable and exposes trimmed controls).
  const { isPilot } = usePilotMode();
  return (
    <>
      <SectionHeader label="Your daily prayer habit" />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        {isPilot
          ? "Shape your morning and evening prayer, your reflections, and your daily silence."
          : "Choose what \"Begin prayer\" opens, how the office reads, the confession, the closing reflection, and more."}
      </p>
      <Link
        href={isPilot ? "/pilot/build" : "/rule-of-life"}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[14px] font-semibold transition-opacity hover:opacity-90"
        style={{
          background: "rgba(46,107,64,0.22)",
          color: "#C8D4C0",
          border: "1px solid rgba(46,107,64,0.4)",
          fontFamily: "'Space Grotesk', sans-serif",
        }}
      >
        <span aria-hidden>⚙️</span>
        Shape your rule of life
        <span aria-hidden>→</span>
      </Link>
    </>
  );
}

// ── Reset routine to default ──────────────────────────────────────────────
// Wipes the customized rule (office method/slots/reflection, custom practices,
// home layout, contemplation goal, weekly practices) and re-seeds the precoded
// default. Daily completion logs are kept. Two-tap confirm; a real account also
// resets its server copy so the default holds across devices.
function ResetRoutineSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const realUser = !!user && !user.isAnonymous;
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resetRoutineToDefault({ realUser, applyAuth: (u) => qc.setQueryData(["/api/auth/me"], u) });
    } catch { /* still land on the fresh home below */ }
    // Full reload onto the home so every view re-hydrates from the reset state.
    window.location.href = "/dashboard";
  };
  return (
    <>
      <SectionHeader label="Reset routine to default" />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        Start over with the standard daily rhythm — Morning &amp; Evening Prayer, Forward Day by Day, and five minutes of silence. Your custom practices and any changes are cleared; what you&rsquo;ve already prayed stays.
      </p>
      <SettingsCard>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full text-left py-2.5"
            style={{ background: "transparent", cursor: "pointer" }}
          >
            <p className="text-[14px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: 0 }}>
              Reset routine to default
            </p>
          </button>
        ) : (
          <div className="py-1.5">
            <p className="text-[13px]" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", margin: "2px 0 10px" }}>
              This clears your custom practices and any changes to your rhythm. Reset to the standard routine?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={run}
                className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold"
                style={{ background: "rgba(46,107,64,0.85)", border: "1px solid rgba(46,107,64,0.6)", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
              >
                {busy ? "Resetting…" : "Reset"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="flex-1 py-2.5 rounded-xl text-[14px]"
                style={{ background: "transparent", border: "1px solid rgba(200,212,192,0.2)", color: "rgba(143,175,150,0.9)", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </SettingsCard>
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

      <SettingsCard>
        <p className="text-[12px] font-semibold mb-2" style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}>
          {t("settings.notification_style_label", { defaultValue: "Notification style" })}
        </p>
        {([
          { value: "gentle" as const, label: t("settings.notification_style_gentle", { defaultValue: "Gentle" }), sub: t("settings.notification_style_gentle_sub", { defaultValue: "One reminder per side — no chasing." }) },
          { value: "nudge" as const, label: t("settings.notification_style_nudge", { defaultValue: "Nudge" }), sub: t("settings.notification_style_nudge_sub", { defaultValue: "Also send a follow-up ~3 hours later if you haven't prayed yet." }) },
        ]).map((opt, i) => {
          const isSelected = (data?.notificationStyle ?? "gentle") === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => save.mutate({ notificationStyle: opt.value })}
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
                <p className="text-[12px]" style={{ color: "#8FAF96", margin: "2px 0 0" }}>
                  {opt.sub}
                </p>
              </div>
            </button>
          );
        })}
      </SettingsCard>

      {/* The daily contemplation goal lives on the Contemplation page; the
          Confession of Sin toggle and the weekly review live in the office
          customizer ("customize slideshow") — not duplicated here. */}
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
    { value: "gregory", label: "Gregorian", sub: "The Daily Office sung in plainchant.", emoji: "🎵" },
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

// The header's "Daily progress ●●●●○○○" dots pill can be turned off for a
// quieter top bar. Stored client-side (localStorage); the header reads the same
// key and re-checks on the "phoebe:prefs-changed" event we fire below, so the
// pill appears/disappears immediately without a reload.
const HIDE_DP_PILL_KEY = "phoebe:hide-daily-progress-pill";
// Row-labeling mode for that same weekly grid: Morning/Contemplative/
// Evening Practice (default), or the Way of Love's Turn/Learn/Pray framing
// of the SAME three rows — same dots, same history, different lens on what
// each row means. Defaults ON (true) — unset or "1" reads as
// Morning/Contemplative/Evening; only an explicit "0" (the user toggled it
// off) reads as Turn/Learn/Pray. Read by WayOfLoveTurnLearnPray.tsx via the
// same key/helpers as the toggles above.
// The "Done" section on home (kept cards, below Next) — preset ON; read by
// dashboard.tsx via the same key/helpers as the toggles above.
export const HIDE_DONE_KEY = "phoebe:hide-home-done";
// Read by native-shell.ts's `phoebe:haptic` listener — the one place every
// haptic in the app arrives. Stored "off" rather than "on" so the absent key
// means haptics work, which is the shipped default.
export const HAPTICS_OFF_KEY = "phoebe:haptics-off";

// ── Muted people ─────────────────────────────────────────────────────────
// The read side (filtering a muter's garden + push fan-out) lives in
// garden.ts/prayer.ts and never went anywhere; this is purely the
// management surface — see the actual mute action on prayer-request-
// detail.tsx (muting someone happens from their prayer request, same as
// before). Empty state is expected/normal, not an error.
function MutedPeopleSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ muted: MutedPerson[] }>({
    queryKey: ["/api/mutes/mine"],
    queryFn: () => apiRequest("GET", "/api/mutes/mine"),
  });
  const muted = data?.muted ?? [];
  const unmuteMut = useMutation({
    mutationFn: (userId: number) => unmuteUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/mutes/mine"] }),
  });

  return (
    <>
      <SectionHeader label="Muted people" />
      <p className="text-[13px] mb-3" style={{ color: "rgba(143,175,150,0.8)", fontFamily: "Georgia, serif", fontStyle: "italic" }}>
        Their prayer requests stop appearing to you — muting is quiet, they're never told.
      </p>
      <SettingsCard>
        {isLoading ? (
          <p className="text-sm" style={{ color: "#8FAF96" }}>Loading…</p>
        ) : muted.length === 0 ? (
          <p className="text-sm" style={{ color: "#8FAF96" }}>You haven't muted anyone.</p>
        ) : (
          muted.map((m, i) => (
            <div
              key={m.userId}
              className="w-full flex items-center gap-3 py-2.5"
              style={{ borderTop: i === 0 ? "none" : "1px solid rgba(200,212,192,0.12)" }}
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt={m.name ?? ""} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0" style={{ background: "#1A4A2E", color: "#A8C5A0" }}>
                  {(m.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                </div>
              )}
              <p className="text-sm flex-1 min-w-0 truncate" style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}>
                {m.name ?? "Someone"}
              </p>
              <button
                type="button"
                onClick={() => unmuteMut.mutate(m.userId)}
                disabled={unmuteMut.isPending}
                className="text-[12px] font-semibold px-3 py-1.5 rounded-full flex-shrink-0 disabled:opacity-40"
                style={{ color: "#8FAF96", border: "1px solid rgba(143,175,150,0.3)", background: "none", cursor: "pointer" }}
              >
                Unmute
              </button>
            </div>
          ))
        )}
      </SettingsCard>
    </>
  );
}

function HomeDisplaySettings() {
  const entitlements = useEntitlements();
  const { user } = useAuth();
  const [hidden, setHidden] = useState<boolean>(() => readLsBool(HIDE_DP_PILL_KEY));
  const shown = !hidden;
  const toggle = () => {
    const nextHidden = shown; // currently shown → hide it (and vice-versa)
    setHidden(nextHidden);
    writeLsBool(HIDE_DP_PILL_KEY, nextHidden);
    try { window.dispatchEvent(new Event("phoebe:prefs-changed")); } catch { /* web no-op */ }
  };

  // Preset ON (readLsBool defaults false/"not hidden" when the key has
  // never been written), matching "on, but you can turn them off".
  const [doneHidden, setDoneHidden] = useState<boolean>(() => readLsBool(HIDE_DONE_KEY));
  const [hapticsOff, setHapticsOff] = useState<boolean>(() => readLsBool(HAPTICS_OFF_KEY));
  const hapticsOn = !hapticsOff;
  const toggleHaptics = () => {
    const nextOff = hapticsOn;
    setHapticsOff(nextOff);
    writeLsBool(HAPTICS_OFF_KEY, nextOff);
    try { window.dispatchEvent(new Event("phoebe:prefs-changed")); } catch { /* web no-op */ }
  };
  const doneShown = !doneHidden;
  const toggleDone = () => {
    const nextHidden = doneShown;
    setDoneHidden(nextHidden);
    writeLsBool(HIDE_DONE_KEY, nextHidden);
    try { window.dispatchEvent(new Event("phoebe:prefs-changed")); } catch { /* web no-op */ }
  };

  return (
    <>
      <SectionHeader label="Home display" />

      <SettingsCard>
        <button
          onClick={toggle}
          className="w-full flex items-center justify-between"
        >
          <div className="text-left">
            <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>
              Daily Progress dots
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
              The little row of rhythm dots in the header. Turn it off for a quieter top bar.
            </p>
          </div>
          <div
            className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${shown ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}
          >
            <div
              className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${shown ? "left-[21px]" : "left-[3px]"}`}
              style={{ background: "#F0EDE6" }}
            />
          </div>
        </button>


        <div className="h-px my-3" style={{ background: "rgba(200,212,192,0.15)" }} />

        <button
          onClick={toggleDone}
          className="w-full flex items-center justify-between"
        >
          <div className="text-left">
            <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>
              Done cards
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
              Show what you've already kept today on home, below what's next.
            </p>
          </div>
          <div
            className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${doneShown ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}
          >
            <div
              className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${doneShown ? "left-[21px]" : "left-[3px]"}`}
              style={{ background: "#F0EDE6" }}
            />
          </div>
        </button>
      </SettingsCard>

      <div className="mb-8" />

      {/* Haptics — its own section: it isn't a display setting, and it's the
          kind of thing people go looking for by name. The switch is read by
          native-shell's single `phoebe:haptic` listener (HAPTICS_OFF_KEY),
          which is where all eleven dispatching surfaces arrive — so this
          silences the cascade, the breath, the office close and every button
          at once, and stays right for whatever fires one next. */}
      <SectionHeader label="Haptics" />

      <SettingsCard>
        <button
          onClick={toggleHaptics}
          className="w-full flex items-center justify-between"
        >
          <div className="text-left">
            <p className="text-sm font-medium" style={{ color: "#F0EDE6" }}>
              Haptics
            </p>
            <p className="text-xs mt-0.5" style={{ color: "#8FAF96" }}>
              The gentle taps and swells when a practice is kept. Turn them off for a silent app.
            </p>
          </div>
          <div
            className={`w-10 h-[22px] rounded-full transition-colors relative flex-shrink-0 ml-3 ${hapticsOn ? "bg-[#2D5E3F]" : "bg-[#1A4A2E]"}`}
          >
            <div
              className={`absolute top-[3px] w-[16px] h-[16px] rounded-full shadow-sm transition-transform ${hapticsOn ? "left-[21px]" : "left-[3px]"}`}
              style={{ background: "#F0EDE6" }}
            />
          </div>
        </button>
      </SettingsCard>

      <div className="mb-8" />
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
  // Source image being cropped (data URL) — set from a file pick or from
  // re-cropping the current avatar; cleared when the modal closes.
  const [cropSrc, setCropSrc] = useState<string | null>(null);

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

  // Pick a file → open the crop/zoom modal. The actual upload happens once the
  // user adjusts and confirms in applyCrop().
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.onerror = () => alert("Could not read this image. Try a different one.");
    reader.readAsDataURL(file);
  }

  function applyCrop(dataUrl: string) {
    setUploading(true);
    profileMutation.mutate({ avatarUrl: dataUrl }, {
      onSettled: () => { setUploading(false); setCropSrc(null); },
    });
  }

  if (!user) return null;

  const hasAvatar = !!user.avatarUrl;

  return (
    <SettingsCard>
      {cropSrc && (
        <AvatarCropModal
          src={cropSrc}
          busy={uploading}
          onCancel={() => setCropSrc(null)}
          onConfirm={applyCrop}
        />
      )}
      <div className="flex items-center gap-4">
        {/* Avatar with upload overlay */}
        <div className="relative flex-shrink-0">
          {hasAvatar ? (
            <img
              src={user.avatarUrl!}
              alt={user.name}
              onClick={() => setCropSrc(user.avatarUrl!)}
              title="Reposition or zoom your photo"
              className="w-16 h-16 rounded-full object-cover cursor-pointer"
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
  // PUBLIC no-login version: the light settings page. `isGuest` (the shape —
  // any non-pilot session) drops the community-facing rows: Language (the
  // Spanish beta is a full-app rollout), Muted People, and
  // Emails. `accountless` (signed in only as the anonymous device user)
  // additionally drops every account affordance — profile editing, Sign out,
  // Export, Delete — there's no account to manage: just the rhythm,
  // reminders, and legal.
  const { isGuest } = useGuestMode();
  const prayerRequestsEnabled = usePrayerRequestsEnabled();
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

  // The "Show when I'm here" presence feature was removed. Turn it off for any
  // user who still has it on (once — onSuccess flips the cached flag false, so
  // this won't re-fire).
  useEffect(() => {
    if (user?.showPresence) presenceToggle.mutate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.showPresence]);

  // Settings is for signed-up accounts only. Not-signed-up viewers — logged out
  // (session gone/expired) or the anonymous device user — have nothing to
  // configure here, so send them home rather than strand them on the blank
  // `return null` below. (The menu hides the Settings entry for them too.)
  useEffect(() => {
    if (!isLoading && (!user || user.isAnonymous)) setLocation("/");
  }, [isLoading, user, setLocation]);

  if (isLoading || !user || user.isAnonymous) return null;
  const accountless = !!user.isAnonymous;

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

        {/* Each section is wrapped in a uniform mb-8 so the gaps between them
            are even — no ad-hoc trailing spacers. */}

        {/* ── Account — hidden while the session has no real account (the
              anonymous device user has nothing to edit here). ── */}
        {!accountless && (
        <div className="mb-8">
          <SectionHeader label={t("settings.account")} />
          <AccountSection />
        </div>
        )}

        {/* ── Default prayer depth — what the home "Begin prayer" CTA opens. ── */}
        <div className="mb-8">
          <DefaultPrayerLevelSettings />
        </div>

        {/* ── Muted people — only relevant once prayer requests are visible
              at all. Owner: "we need the mute features in settings back" —
              the read side (filtering a muter's garden/push fan-out) had
              stayed in place the whole time; only the write side (actually
              muting someone) had been removed, along with the settings row
              to manage it. ── */}
        {prayerRequestsEnabled && (
          <div className="mb-8">
            <MutedPeopleSettings />
          </div>
        )}

        {/* ── Home display — header daily-progress dots on/off ── */}
        <div className="mb-8">
          <HomeDisplaySettings />
        </div>

        {/* ── Weekly practices on/off (all four or nothing) ──
            Globally off for now (owner) — hide the whole section so it's not a
            dead control. Returns when WEEKLY_PRACTICES_ENABLED flips back on. */}
        {WEEKLY_PRACTICES_ENABLED && (
          <div className="mb-8">
            <WeeklyPracticesSettings />
          </div>
        )}

        {/* ── Reset routine to default ── */}
        <div className="mb-8">
          <ResetRoutineSettings />
        </div>

        {/* ── Office reminders — only where a push can actually arrive (the
              iOS shell, or Android mobile web). Desktop / iOS-Safari web get
              no notification UI at all. ── */}
        {notificationsSupportedHere() && (
        <div className="mb-8">
          <OfficeReminderSettings />
        </div>
        )}

        {/* Language settings removed — the app is English-only. */}

        {/* ── Offices-only extras (tier-gated) ── */}
        {user.accessTier === "offices-only" && (
          <div className="mb-8">
            <OfficesOnlyExtras />
          </div>
        )}

        {/* ── Notifications master switch — same platform rule as reminders. ── */}
        {notificationsSupportedHere() && (
        <div className="mb-8">
          <NotificationsSettings />
        </div>
        )}

        {/* ── Email opt-in/out — full app only; the public version sends the
              light user no emails (the anonymous address isn't real anyway). ── */}
        {!isGuest && (
        <div className="mb-8">
          <EmailSettings />
        </div>
        )}

        {/* ── Sign out — only when there's a real account to sign out of. ── */}
        {!accountless && (
        <button
          onClick={() => { logout(); setLocation("/"); }}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: "rgba(200,212,192,0.06)", color: "#8FAF96", border: "1px solid rgba(46,107,64,0.18)" }}
        >
          <LogOut size={15} />
          {t("settings.sign_out")}
        </button>
        )}

        {/* ── Export my data ──
            GDPR right-to-portability. Downloads a JSON blob of every row
            the database holds tied to this user. Auth material (password
            hash, OAuth tokens) is redacted server-side. */}
        {!accountless && (
        <div className="mt-8">
          <ExportDataSection />
        </div>
        )}

        {/* ── Delete account ──
            Required by Apple Guideline 5.1.1(v) for App Store distribution:
            any app that creates accounts must offer in-app deletion. Also
            a legitimate privacy affordance for web users. Gated behind a
            confirm step (type your email) to prevent accidents. */}
        {!accountless && (
        <div className="mt-4">
          <DeleteAccountSection email={user.email} />
        </div>
        )}

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
      // The export is JSON TEXT. Read it as text and build the Blob ourselves —
      // on iOS the CapacitorHttp-patched fetch drops/garbles res.blob()'s binary
      // body (the same bug fixed for splash avatars), which produced a corrupt
      // export file. Reading text avoids the binary path entirely.
      const text = await res.text();
      const blob = new Blob([text], { type: "application/json" });
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
