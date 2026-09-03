import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { isNativeShell } from "@/lib/isNativeShell";
import { checkPushPermission, enablePushNotifications, type PermState } from "@/lib/pushPermission";

// A standing (not one-shot) bottom reminder: whenever notifications are
// currently OFF — never asked, or previously declined — this stays up as an
// ongoing nudge, distinct from PushPermissionPrompt (native, fires the OS
// dialog once automatically, no visible UI) and WebPushPermissionPrompt
// (Android web, asks once then goes quiet forever). Those two get the FIRST
// ask in front of the right person at the right moment; this is the "you
// still haven't turned this on" reminder that keeps showing up until they do.
//
// Dismiss is session-scoped (sessionStorage, not localStorage) — closing it
// quiets it for the rest of this app open, but it returns next launch/day if
// notifications are still off. That's the point: a nag that respects "not
// now" without going silent forever like its one-shot siblings.
const DISMISS_KEY = "phoebe:notif-reminder-dismissed";

export function NotificationReminderBanner() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const [permission, setPermission] = useState<PermState>("unknown");
  const [show, setShow] = useState(false);
  const [working, setWorking] = useState(false);

  // Both of these used to live inline here, and Settings needed the same two —
  // so they moved to lib/pushPermission and this reads from there. One
  // implementation, or the copies drift.
  const checkPermission = checkPushPermission;

  useEffect(() => {
    let cancelled = false;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch { /* private mode — fall through to show */ }

    const evaluate = async () => {
      const perm = await checkPermission();
      if (cancelled) return;
      setPermission(perm);
    };

    const timer = window.setTimeout(() => { void evaluate(); }, 3000);
    // Re-check whenever the app comes back to the foreground — covers
    // "went to Settings and turned it on, then returned" on native, and the
    // analogous tab-refocus case on web.
    const onActive = () => { void evaluate(); };
    const onVisibility = () => { if (document.visibilityState === "visible") onActive(); };
    window.addEventListener("phoebe:appactive", onActive);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("phoebe:appactive", onActive);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    setShow(permission === "denied" || permission === "prompt");
  }, [permission]);

  // Once the OS/browser has already denied notifications, NO API (ours or
  // the browser's) can re-open that native dialog — Notification.
  // requestPermission() just silently resolves back to "denied" with no
  // prompt at all, and the same is true of the native Capacitor bridge.
  // Before this the banner showed the same "Turn on" button either way, so
  // a previously-declined user saw a button that appeared to do nothing.
  // Once we're in that state, stop trying the API and show the manual path
  // instead (Settings → Notifications).
  const [showSettingsHint, setShowSettingsHint] = useState(false);

  async function handleEnable() {
    if (permission === "denied") {
      setShowSettingsHint((v) => !v);
      return;
    }
    setWorking(true);
    try {
      // Requests permission, and on native also registers with APNs/FCM and
      // posts the device token — "Turning on…" stays disabled until the OS
      // dialog has actually been answered (its result arrives as an event),
      // not until the request was merely fired.
      setPermission(await enablePushNotifications());
    } catch (err) {
      console.warn("[notif-reminder] enable failed:", err);
    } finally {
      setWorking(false);
    }
  }

  function dismiss() {
    setShow(false);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* non-fatal */ }
  }

  // A brand-new visitor sees the overview deck before ever reaching home —
  // don't compete for their attention with a notifications ask until they've
  // actually landed on the app.
  if (!show || location === "/overview-deck") return null;
  /**
   * NEVER OVER A DECK'S NAV. The practice slideshows carry their one nav in
   * a fixed pill at the bottom of the screen, and this banner sits in the
   * same place: on the simulator it covered the office deck's Back/Next
   * entirely until dismissed (a "Turn on notifications" ask sitting on top of
   * the only way to pray the office). A deck is also the wrong moment for the
   * ask — the person is mid-practice. Suppressed on every deck route; the
   * banner is standing, so it's there again on the home.
   */
  const DECK_PREFIXES = [
    "/bcp/daily-office", "/prayer-mode", "/begin-prayer", "/guided-prayer", "/psalms",
    "/examen", "/vts-reading", "/contemplation", "/cobreathe", "/compline",
    "/lectio", "/visio", "/listening", "/icon-prayer", "/spirituals", "/creation",
  ];
  const path = location.split("?")[0] ?? location;
  if (DECK_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  return (
    <div
      className="mx-auto w-full rounded-2xl flex items-stretch gap-3 p-3 max-w-md"
      style={{
        background: "#0F2818",
        border: "1px solid rgba(46,107,64,0.45)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        animation: "phoebe-notif-reminder-slide 360ms ease-out",
        pointerEvents: "auto",
      }}
      role="dialog"
      aria-label={t("notif_reminder.aria_label", { defaultValue: "Turn on notifications" })}
    >
      <style>{`
        @keyframes phoebe-notif-reminder-slide {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <span className="text-2xl shrink-0 self-center" aria-hidden>🔔</span>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <p
          className="text-[14px] font-semibold leading-tight"
          style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {t("notif_reminder.title", { defaultValue: "Turn on notifications" })}
        </p>
        <p
          className="text-[12px] mt-0.5 leading-snug"
          style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {permission === "denied" && showSettingsHint
            ? t("notif_reminder.settings_hint", { defaultValue: isNativeShell() ? "Open Settings → Notifications → Phoebe, and turn Allow Notifications on." : "Notifications were turned off in your browser. Open your browser's site settings for this page and allow notifications." })
            : permission === "denied"
              ? t("notif_reminder.denied_body", { defaultValue: "Notifications are off — this has to be turned back on outside the app." })
              : t("notif_reminder.body", { defaultValue: "Remember to turn notifications on to build a daily habit." })}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
        <button
          type="button"
          onClick={handleEnable}
          disabled={working}
          className="text-[12px] font-semibold rounded-full px-3.5 py-1.5 whitespace-nowrap"
          style={{
            background: "#2D5E3F",
            color: "#F0EDE6",
            fontFamily: "'Space Grotesk', sans-serif",
            border: "none",
            cursor: working ? "default" : "pointer",
            opacity: working ? 0.6 : 1,
          }}
        >
          {working
            ? t("notif_reminder.enabling", { defaultValue: "Turning on…" })
            : permission === "denied"
              ? t("notif_reminder.how", { defaultValue: "How?" })
              : t("notif_reminder.enable", { defaultValue: "Turn on" })}
        </button>
        <button
          type="button"
          onClick={dismiss}
          disabled={working}
          className="text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "rgba(143,175,150,0.55)", background: "none", border: "none", cursor: "pointer" }}
        >
          {t("desktop_prompt.not_now", { defaultValue: "Not now" })}
        </button>
      </div>
    </div>
  );
}
