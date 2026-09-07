import { apiRequest } from "@/lib/queryClient";

// Shared by WebPushPermissionPrompt (the Android-web one-shot ask) and
// NotificationReminderBanner (the ongoing bottom reminder) — both need the
// exact same "subscribe this browser, tell the server" plumbing.

/**
 * Subscribe to the push service with the server's VAPID public key,
 * then POST the subscription to /api/push/web-subscription so the
 * bell scheduler can reach this browser. Idempotent — calling
 * twice with the same browser is a server-side upsert.
 */
export async function ensureWebPushSubscription(): Promise<void> {
  /**
   * BOUNDED, because `ready` NEVER REJECTS.
   *
   * If the service worker failed to register — main.tsx only warns — this
   * promise simply never settles, and both callers (the permission card and
   * Settings) await straight through it with their spinner on. The button
   * sits on "Turning on…" for the life of the page and the card cannot be
   * dismissed. Android web is where this bites: it is the platform that
   * actually uses web push, where iOS users get the native one.
   */
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("The notification service didn't start. Reload and try again.")), 10_000)),
  ]);

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await apiRequest<{ publicKey: string }>(
      "GET",
      "/api/push/vapid-public-key",
    );
    // PushManager.subscribe wants BufferSource, not Uint8Array<ArrayBufferLike>.
    // Both are byte-compatible at runtime; cast through unknown to satisfy TS.
    const appServerKey = urlBase64ToUint8Array(publicKey) as unknown as BufferSource;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
  }

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("PushSubscription missing required fields");
  }

  await apiRequest("POST", "/api/push/web-subscription", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    userAgent: navigator.userAgent.slice(0, 500),
  });
}

// VAPID public keys are sent over the wire as base64url; the Push API
// wants a Uint8Array. This is the standard conversion routine
// recommended by the web-push docs — handles both URL-safe and
// padded variants.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

/** Web Push works on Android in any modern browser, and on iOS ONLY once the
 *  site has been added to the Home Screen (standalone display mode) — Safari
 *  doesn't support it for a plain browser tab. Used to decide whether a web
 *  notification reminder can actually do anything before showing one. */
export function webPushCapable(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (!("PushManager" in window)) return false;
  if (typeof Notification === "undefined") return false;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (!isIOS) return true;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
  return !!standalone;
}
