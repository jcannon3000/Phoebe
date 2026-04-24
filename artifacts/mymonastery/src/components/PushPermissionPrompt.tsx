import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

/**
 * One-time push-permission nudge for the native iOS shell.
 *
 * The Capacitor `native-shell.ts` listens for the `phoebe:request-push-permission`
 * event: it then calls `PushNotifications.requestPermissions()`, registers
 * with APNs, and POSTs the device token to `/api/push/device-token`. On the
 * plain web build no one listens, so dispatching the event is a silent
 * no-op — safe to fire everywhere.
 *
 * Gating:
 *   1. Only for signed-in users — anonymous visitors don't have a userId
 *      to tie the token to.
 *   2. Only once per install — we stamp localStorage after dispatching.
 *      If the user declines at the iOS system dialog we don't re-prompt;
 *      they can re-enable from Settings → Notifications → Phoebe.
 *   3. After a 2-second delay — lets the dashboard render first so the
 *      permission sheet doesn't stack on top of an empty screen at
 *      launch.
 *
 * This component renders nothing; it only exists to run the effect.
 */
export function PushPermissionPrompt() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Only native shell — web browsers don't need this.
    const isNative = !!(window as { PhoebeNative?: { isNative?: () => boolean } })
      .PhoebeNative?.isNative?.();
    if (!isNative) return;

    // One-shot per device — key is device-scoped, not user-scoped, so
    // signing out and back in as the same user doesn't re-prompt.
    const KEY = "phoebe:push-prompt-asked";
    if (localStorage.getItem(KEY) === "1") return;

    const timer = window.setTimeout(() => {
      try {
        window.dispatchEvent(new Event("phoebe:request-push-permission"));
        localStorage.setItem(KEY, "1");
      } catch {
        // non-fatal; we'll retry on the next launch
      }
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [user]);

  return null;
}
