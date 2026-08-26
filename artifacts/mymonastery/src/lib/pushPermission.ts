/**
 * "Are notifications allowed on THIS device, and can we ask?"
 *
 * ONE implementation, shared by every surface that offers to turn them on —
 * the standing NotificationReminderBanner and Settings → Notifications. The
 * native flow is not obvious (request, then wait for `phoebe:push-ready` /
 * `phoebe:push-denied`, because the OS dialog's answer arrives as an event,
 * not as a return value), and this session already lost an afternoon to a
 * hand-copied mirror drifting from its original — see native-shell's own note
 * on the dropped `backChrome` option. So it lives here once.
 */
import { isNativeShell } from "@/lib/isNativeShell";
import { ensureWebPushSubscription, webPushCapable } from "@/lib/webPush";

export type PermState = "granted" | "denied" | "prompt" | "unknown";

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

/** What the OS currently says. Never prompts, never has a side effect. */
export async function checkPushPermission(): Promise<PermState> {
  if (isNativeShell()) {
    try {
      return (await phoebeNative()?.checkPushPermission?.()) ?? "unknown";
    } catch {
      return "unknown";
    }
  }
  // Nothing we could ask for here — report "granted" so callers don't offer a
  // button that can't do anything.
  if (!webPushCapable()) return "granted";
  // DOM Notification.permission is "default" | "denied" | "granted" — it never
  // returns "prompt". Map "default" (never asked) onto our "prompt", or a
  // caller would only ever see users who explicitly denied and would miss the
  // never-asked majority the offer exists for.
  const raw = Notification.permission;
  return raw === "default" ? "prompt" : (raw as PermState);
}

/**
 * Fire the system permission dialog and resolve with what the person chose.
 *
 * NATIVE: the answer comes back as an event, so this waits for
 * `phoebe:push-ready` (allowed — the shell has also registered with APNs/FCM
 * and posted the device token) or `phoebe:push-denied`. The timeout is not a
 * failure path so much as an escape hatch: if the dialog is dismissed in a way
 * that emits neither, a caller left awaiting forever would sit on a disabled
 * "Turning on…" button with no way out.
 *
 * A "denied" device can't be re-prompted by anyone — iOS only shows that
 * dialog once. Callers must send the person to the OS settings instead; check
 * `checkPushPermission()` first rather than calling this and hoping.
 */
export function enablePushNotifications(timeoutMs = 30_000): Promise<PermState> {
  if (isNativeShell()) {
    return new Promise<PermState>((resolve) => {
      let settled = false;
      const finish = (state: PermState) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("phoebe:push-ready", onReady);
        window.removeEventListener("phoebe:push-denied", onDenied);
        clearTimeout(timer);
        resolve(state);
      };
      const onReady = () => finish("granted");
      const onDenied = () => finish("denied");
      const timer = setTimeout(() => finish("unknown"), timeoutMs);
      window.addEventListener("phoebe:push-ready", onReady, { once: true });
      window.addEventListener("phoebe:push-denied", onDenied, { once: true });
      try {
        phoebeNative()?.requestPushPermission?.();
      } catch {
        finish("unknown");
      }
    });
  }
  return (async () => {
    try {
      const result = (await Notification.requestPermission()) as PermState;
      // Permission alone delivers nothing on the web — the subscription is
      // what the server pushes to.
      if (result === "granted") await ensureWebPushSubscription().catch(() => { /* non-fatal */ });
      return result;
    } catch {
      return "unknown";
    }
  })();
}
