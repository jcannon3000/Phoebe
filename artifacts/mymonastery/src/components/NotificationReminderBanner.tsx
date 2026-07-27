import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isNativeShell } from "@/lib/isNativeShell";
import { ensureWebPushSubscription, webPushCapable } from "@/lib/webPush";

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

type PermState = "granted" | "denied" | "prompt" | "unknown";

// The window.PhoebeNative global augmentation lives in phoebe-mobile's own
// tsconfig project (a separate compile from this one) — same inline-cast
// pattern lib/isNativeShell.ts uses rather than duplicating a declare global.
type PhoebeNativeShape = {
  checkPushPermission?: () => Promise<PermState>;
  requestPushPermission?: () => void;
};
function phoebeNative(): PhoebeNativeShape | undefined {
  return (window as unknown as { PhoebeNative?: PhoebeNativeShape }).PhoebeNative;
}

export function NotificationReminderBanner() {
  const { t } = useTranslation();
  const [permission, setPermission] = useState<PermState>("unknown");
  const [show, setShow] = useState(false);
  const [working, setWorking] = useState(false);

  const checkPermission = async (): Promise<PermState> => {
    if (isNativeShell()) {
      try {
        const result = await phoebeNative()?.checkPushPermission?.();
        return result ?? "unknown";
      } catch {
        return "unknown";
      }
    }
    if (!webPushCapable()) return "granted"; // can't do anything here — don't nag
    return Notification.permission as PermState;
  };

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

  async function handleEnable() {
    setWorking(true);
    try {
      if (isNativeShell()) {
        // Reuses the exact flow PushPermissionPrompt fires — requests
        // permission, registers with APNs/FCM, and POSTs the device token.
        const onReady = () => { setPermission("granted"); cleanup(); };
        const onDenied = () => { setPermission("denied"); cleanup(); };
        const cleanup = () => {
          window.removeEventListener("phoebe:push-ready", onReady);
          window.removeEventListener("phoebe:push-denied", onDenied);
        };
        window.addEventListener("phoebe:push-ready", onReady, { once: true });
        window.addEventListener("phoebe:push-denied", onDenied, { once: true });
        phoebeNative()?.requestPushPermission?.();
        return;
      }
      const permission = await Notification.requestPermission();
      setPermission(permission as PermState);
      if (permission === "granted") {
        await ensureWebPushSubscription().catch(() => { /* non-fatal */ });
      }
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

  if (!show) return null;

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
          {t("notif_reminder.body", { defaultValue: "Remember to turn notifications on to build a daily habit." })}
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
          {working ? t("notif_reminder.enabling", { defaultValue: "Turning on…" }) : t("notif_reminder.enable", { defaultValue: "Turn on" })}
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
