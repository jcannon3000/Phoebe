import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { isNativeShell } from "@/lib/isNativeShell";

/**
 * Daily-bell push permission for Android web users.
 *
 * iOS users get the native APNs flow (PushPermissionPrompt + the
 * Capacitor shell). Android web users — anyone on Chrome / Firefox /
 * Edge / Samsung Internet on Android — get this flow instead: a
 * gentle in-app card after sign-in inviting them to enable browser
 * notifications. On accept we register a service-worker push
 * subscription with our VAPID public key and POST it to the server
 * so the bell scheduler can reach them.
 *
 * Why a card instead of an immediate `Notification.requestPermission()`:
 * Chrome's permission dialog is heavy. If the user dismisses it once
 * (clicks "Block" or the X), the site is permanently denied for that
 * origin and the only fix is digging through site settings. So we
 * pre-frame it with our own UI ("Get a daily prayer reminder?") and
 * only call requestPermission() after they tap our "Yes" button —
 * users who say no in our card never see the OS dialog at all.
 *
 * Gating:
 *   1. Only signed-in users.
 *   2. Only on Android web (not iOS, not native Capacitor shell, not
 *      desktop — desktop reminders are out of scope for the daily bell).
 *   3. Only if Notification permission is "default" (not asked yet).
 *      "granted" → already subscribed, "denied" → can't recover here.
 *   4. One-shot per device — stamp localStorage so dismissing it once
 *      doesn't keep the card on the screen at every page load.
 *   5. After a 4-second delay so the dashboard renders first.
 */
export function WebPushPermissionPrompt() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;

    // Skip native Capacitor shell — that path uses APNs.
    if (isNativeShell()) return;

    // Android-only. iOS Safari can technically do Web Push but ONLY
    // for installed PWAs (Add to Home Screen) — most users won't do
    // that, so we don't promise reminders we can't deliver. We point
    // iOS users at the App Store instead via IOSAppDownloadPrompt.
    const ua = navigator.userAgent;
    const isAndroid = /Android/i.test(ua);
    if (!isAndroid) return;

    // Browser must support service workers + Push API. Older
    // browsers (or Brave with shields up) silently lack these.
    if (!("serviceWorker" in navigator)) return;
    if (!("PushManager" in window)) return;
    if (typeof Notification === "undefined") return;

    // "default" means the user hasn't been asked. "granted" means
    // we've already got permission (re-register the subscription
    // silently below). "denied" means we can't recover from in-page.
    if (Notification.permission === "denied") return;

    // One-shot per device unless permission is already granted (in
    // which case we want to silently re-register if the subscription
    // is missing — handles "user cleared site data" case).
    const KEY = "phoebe:web-push-prompt-asked";
    const alreadyAsked = localStorage.getItem(KEY) === "1";

    if (Notification.permission === "granted") {
      // Permission already granted — make sure the server has our
      // current subscription. No prompt UI needed.
      void ensureSubscription().catch(() => { /* non-fatal */ });
      return;
    }

    if (alreadyAsked) return;

    const timer = window.setTimeout(() => setShow(true), 4000);
    return () => window.clearTimeout(timer);
  }, [user]);

  async function handleEnable() {
    setWorking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        // User declined the system dialog. Stamp localStorage so we
        // don't nag again — they can re-enable from browser settings
        // later. Permission state goes to "denied" if they clicked
        // Block; we honor it next session.
        localStorage.setItem("phoebe:web-push-prompt-asked", "1");
        setShow(false);
        return;
      }
      await ensureSubscription();
      localStorage.setItem("phoebe:web-push-prompt-asked", "1");
      setShow(false);
    } catch (err) {
      console.warn("[web-push] enable failed:", err);
      // Don't stamp the dismissal flag on a thrown error — let them
      // try again on next visit if it was a transient failure.
      setShow(false);
    } finally {
      setWorking(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem("phoebe:web-push-prompt-asked", "1");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="web-push-title"
      style={{
        position: "fixed",
        bottom: "max(20px, env(safe-area-inset-bottom))",
        left: 16,
        right: 16,
        maxWidth: 420,
        margin: "0 auto",
        background: "#1A2E1F",
        border: "1px solid rgba(143,175,150,0.3)",
        borderRadius: 16,
        padding: "16px 18px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
        zIndex: 60,
        fontFamily: "'Space Grotesk', sans-serif",
        color: "#F0EDE6",
      }}
    >
      <p
        id="web-push-title"
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "-0.01em",
        }}
      >
        {t("web_push_prompt.title")}
      </p>
      <p
        style={{
          margin: "6px 0 14px",
          fontSize: 13,
          lineHeight: 1.5,
          color: "rgba(200,212,192,0.75)",
        }}
      >
        {t("web_push_prompt.body")}
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={working}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(200,212,192,0.55)",
            fontSize: 13,
            padding: "8px 12px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {t("desktop_prompt.not_now")}
        </button>
        <button
          type="button"
          onClick={handleEnable}
          disabled={working}
          style={{
            background: "#2D5E3F",
            color: "#F0EDE6",
            border: "none",
            borderRadius: 999,
            padding: "8px 18px",
            fontSize: 13,
            fontWeight: 600,
            cursor: working ? "default" : "pointer",
            opacity: working ? 0.6 : 1,
            fontFamily: "inherit",
          }}
        >
          {working ? t("web_push_prompt.enabling") : t("web_push_prompt.enable")}
        </button>
      </div>
    </div>
  );
}

/**
 * Subscribe to the push service with the server's VAPID public key,
 * then POST the subscription to /api/push/web-subscription so the
 * bell scheduler can reach this browser. Idempotent — calling
 * twice with the same browser is a server-side upsert.
 */
async function ensureSubscription(): Promise<void> {
  // Service worker must be active before we can subscribe.
  const reg = await navigator.serviceWorker.ready;

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
