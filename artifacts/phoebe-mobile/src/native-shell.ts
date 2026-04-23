// Phoebe Mobile — native shell bootstrap.
//
// This file is compiled into a single IIFE and injected into the
// mymonastery production bundle's index.html as the *first* <script>
// (see scripts/compose-www.mjs). It runs before React mounts, wires up
// every Capacitor plugin Phoebe cares about, and then quietly hands
// control to the normal web app.
//
// Design rules followed here:
//   1. ZERO changes to mymonastery source. If the native shell needs to
//      talk to the web app, it uses `window.addEventListener` + custom
//      events, NOT direct imports.
//   2. Every plugin call is wrapped in try/catch. A broken native bridge
//      must never prevent the web app from loading — the user should
//      always at least get what they'd get on mobile Safari.
//   3. No-ops on web. We detect `window.Capacitor?.isNativePlatform()`
//      and skip native-only code paths, so this same file would work
//      even if it somehow got loaded in a browser.

import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import { Preferences } from "@capacitor/preferences";
import { Contacts } from "@capacitor-community/contacts";
import { SignInWithApple, type SignInWithAppleResponse } from "@capacitor-community/apple-sign-in";
import { LocalNotifications } from "@capacitor/local-notifications";
import { NativeBiometric, BiometryType } from "@capgo/capacitor-native-biometric";

// ─── API base URL ──────────────────────────────────────────────────────────
// The bundled web app talks to the Phoebe API by relative paths (`/api/...`)
// when it runs at withphoebe.app — but in Capacitor the WebView serves the
// app from `capacitor://localhost`, so relative fetches go nowhere. We
// intercept window.fetch and rewrite /api/* calls to the production API
// origin. Override via `PhoebeNative.setApiBaseUrl()` for staging.
const DEFAULT_API_BASE = "https://withphoebe.app";
let API_BASE = DEFAULT_API_BASE;

function installApiFetchInterceptor() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      if (typeof input === "string" && input.startsWith("/api/")) {
        return originalFetch(API_BASE + input, { credentials: "include", ...init });
      }
      if (input instanceof Request && input.url.startsWith("/api/")) {
        const rewritten = new Request(API_BASE + new URL(input.url, "http://_").pathname + new URL(input.url, "http://_").search, input);
        return originalFetch(rewritten, init);
      }
    } catch {
      // Fall through to the untouched fetch on any URL-parsing oddity.
    }
    return originalFetch(input, init);
  };
}

// ─── Status bar & safe area ────────────────────────────────────────────────
// The web CSS reads `env(safe-area-inset-*)` variables; WKWebView sets
// those automatically when `viewport-fit=cover` is in the meta tag
// (mymonastery's index.html already has `maximum-scale=1` — we inject
// `viewport-fit=cover` in compose-www.mjs). Here we only need to style
// the status bar content to match Phoebe's dark palette.
async function configureStatusBar() {
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#091A10" });
    // Overlays are off so the status bar has its own solid strip — easier
    // to align with safe-area CSS than a translucent bar that shifts on
    // scroll.
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // Non-fatal — older iOS versions or plugin mismatch.
  }
}

// ─── Splash screen ─────────────────────────────────────────────────────────
// We keep the splash up until the web app signals it's ready. mymonastery
// doesn't know about us, so we dispatch our own "ready" heuristic: the
// first requestAnimationFrame after DOMContentLoaded + a short settling
// delay. That's plenty for the React app's initial paint; longer waits
// just make the app feel sluggish.
function scheduleSplashHide() {
  const hide = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        SplashScreen.hide({ fadeOutDuration: 180 }).catch(() => {});
      }, 60);
    });
  };
  if (document.readyState === "complete" || document.readyState === "interactive") {
    hide();
  } else {
    document.addEventListener("DOMContentLoaded", hide, { once: true });
  }
}

// ─── Keyboard behavior ─────────────────────────────────────────────────────
// We set `Keyboard.setResizeMode: "none"` in capacitor.config so the
// WebView doesn't fight our layout. Instead we expose the keyboard height
// as a CSS custom property `--kb-inset` that inputs can use in their
// own padding-bottom calculations. Far more predictable.
function wireKeyboardInsets() {
  const setKb = (h: number) => {
    document.documentElement.style.setProperty("--kb-inset", `${h}px`);
  };
  Keyboard.addListener("keyboardWillShow", info => setKb(info.keyboardHeight));
  Keyboard.addListener("keyboardDidShow", info => setKb(info.keyboardHeight));
  Keyboard.addListener("keyboardWillHide", () => setKb(0));
  Keyboard.addListener("keyboardDidHide", () => setKb(0));
}

// ─── Hardware back button + swipe-back routing ─────────────────────────────
// iOS doesn't have an Android-style hardware back button, but
// `@capacitor/app` still emits `backButton` for WKWebView swipe-back
// gestures we want to honor. We translate those into browser history.back()
// so Wouter can react.
function wireBackGesture() {
  App.addListener("backButton", ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      // At the root of the history stack — give the user haptic confirmation
      // that we heard the gesture but chose to stay. Minimizing the app
      // instead would surprise users.
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
  });
}

// ─── Deep links ────────────────────────────────────────────────────────────
// Universal links (`https://withphoebe.app/communities/join/...`) land as
// `appUrlOpen` events. We extract the path+search and tell Wouter to route
// there by dispatching a popstate with the new URL. The web app's existing
// routing logic then takes over — no deep-link handler needs to live in
// mymonastery.
function wireDeepLinks() {
  App.addListener("appUrlOpen", ({ url }) => {
    try {
      const u = new URL(url);
      const target = u.pathname + u.search + u.hash;
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      // Malformed URL — nothing we can do, let the OS swallow it.
    }
  });
}

// ─── Push notifications ────────────────────────────────────────────────────
// We register ONLY when the web app explicitly asks — typically from the
// bell-setup flow. The event bridge is a simple window event: dispatch
// `phoebe:request-push-permission` and we'll handle the permission dance,
// POST the device token to /api/push/device-token, and fire
// `phoebe:push-ready` on success.
async function registerForPushIfRequested() {
  const handler = async () => {
    try {
      const perm = await PushNotifications.checkPermissions();
      let granted = perm.receive === "granted";
      if (!granted) {
        const requested = await PushNotifications.requestPermissions();
        granted = requested.receive === "granted";
      }
      if (!granted) {
        window.dispatchEvent(new CustomEvent("phoebe:push-denied"));
        return;
      }
      // Listen for the APNs token that will arrive via the "registration"
      // event after register() fires. Only one-shot; we tear down after
      // the first token lands to avoid duplicate POSTs on app resume.
      const tokenListener = await PushNotifications.addListener("registration", async (token: Token) => {
        try {
          await fetch(API_BASE + "/api/push/device-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token: token.value, platform: "ios" }),
          });
          window.dispatchEvent(new CustomEvent("phoebe:push-ready", { detail: { token: token.value } }));
        } catch {
          // Network error sending the token — we'll retry next app launch
          // via the `appStateChange` → active handler below.
        }
        tokenListener.remove();
      });
      await PushNotifications.addListener("registrationError", err => {
        window.dispatchEvent(new CustomEvent("phoebe:push-error", { detail: err }));
      });
      // Tapping a notification in Notification Center deep-links into the
      // app. The payload carries a `path` for us to route to.
      await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
        const path = (notification.data as Record<string, string> | undefined)?.["path"];
        if (typeof path === "string" && path.startsWith("/")) {
          window.history.pushState({}, "", path);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
      });
      await PushNotifications.register();
    } catch (err) {
      window.dispatchEvent(new CustomEvent("phoebe:push-error", { detail: err }));
    }
  };
  window.addEventListener("phoebe:request-push-permission", handler);
}

// ─── Share sheet (native) ──────────────────────────────────────────────────
// The web app can invoke the native share sheet by dispatching
// `phoebe:share` with `{ title, text, url }`. We fall back silently if
// sharing fails (user cancelled, etc.).
function wireNativeShare() {
  window.addEventListener("phoebe:share", async e => {
    const detail = (e as CustomEvent).detail as { title?: string; text?: string; url?: string } | undefined;
    if (!detail) return;
    try {
      await Share.share({
        title: detail.title,
        text: detail.text,
        url: detail.url,
        dialogTitle: "Share with…",
      });
    } catch {
      // User cancelled or share unavailable — no action needed.
    }
  });
}

// ─── Haptics ───────────────────────────────────────────────────────────────
// Small, opinionated API: web app dispatches `phoebe:haptic` with
// `{ style: "light" | "medium" | "heavy" | "success" | "warning" | "error" }`.
// Keeps native-shell the only place that knows about ImpactStyle.
function wireHaptics() {
  window.addEventListener("phoebe:haptic", e => {
    const detail = (e as CustomEvent).detail as { style?: string } | undefined;
    const s = detail?.style ?? "light";
    try {
      switch (s) {
        case "heavy":
          Haptics.impact({ style: ImpactStyle.Heavy });
          break;
        case "medium":
          Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case "success":
        case "warning":
        case "error":
          // Notification haptic styles — fall through to a distinct impact
          // so we still feel different. Finer patterns can be added later
          // once we settle on a haptic vocabulary.
          Haptics.impact({ style: ImpactStyle.Medium });
          break;
        default:
          Haptics.impact({ style: ImpactStyle.Light });
      }
    } catch {
      // Non-fatal — some older devices don't support haptics.
    }
  });
}

// ─── Native contacts (Partiful-style "invite from contacts") ───────────────
// The web app dispatches `phoebe:request-contacts` (with an optional
// `{ reason: string }` detail for logging) and we:
//   1. Check/request the iOS contacts permission.
//   2. Read the device address book (names + emails + phones only — no
//      photos, birthdays, or postal addresses, even though the plugin
//      supports them).
//   3. Dispatch `phoebe:contacts-ready` with a sanitized payload, OR
//      `phoebe:contacts-denied` on permission rejection, OR
//      `phoebe:contacts-error` on anything else.
// Contacts NEVER leave the device automatically — the web app decides
// what to do with them (typically: render a local picker, and only POST
// the ones the user actually taps "invite" on).
type PhoebeContact = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
};

async function readDeviceContacts(): Promise<PhoebeContact[]> {
  const { contacts } = await Contacts.getContacts({
    projection: {
      name: true,
      emails: true,
      phones: true,
    },
  });
  const out: PhoebeContact[] = [];
  for (const c of contacts ?? []) {
    const display =
      c.name?.display?.trim() ||
      [c.name?.given, c.name?.family].filter(Boolean).join(" ").trim();
    if (!display) continue;
    const emails = (c.emails ?? [])
      .map((e) => (e.address ?? "").trim().toLowerCase())
      .filter((e) => e.length > 0 && /.+@.+\..+/.test(e));
    const phones = (c.phones ?? [])
      .map((p) => (p.number ?? "").replace(/[^\d+]/g, ""))
      .filter((p) => p.length >= 7);
    // Skip contacts with no way to reach them digitally — the invite flow
    // has nowhere to send a link.
    if (emails.length === 0 && phones.length === 0) continue;
    out.push({
      id: c.contactId ?? display,
      name: display,
      emails,
      phones,
    });
  }
  return out;
}

function wireContacts() {
  window.addEventListener("phoebe:request-contacts", async () => {
    try {
      const perm = await Contacts.checkPermissions();
      let granted = perm.contacts === "granted";
      if (!granted) {
        const requested = await Contacts.requestPermissions();
        granted = requested.contacts === "granted";
      }
      if (!granted) {
        window.dispatchEvent(new CustomEvent("phoebe:contacts-denied"));
        return;
      }
      const contacts = await readDeviceContacts();
      window.dispatchEvent(
        new CustomEvent("phoebe:contacts-ready", { detail: { contacts } })
      );
    } catch (err) {
      window.dispatchEvent(
        new CustomEvent("phoebe:contacts-error", { detail: err })
      );
    }
  });
}

// ─── Sign in with Apple ────────────────────────────────────────────────────
// Mandatory under Apple Guideline 4.8 because Phoebe offers Google SSO.
// The web app dispatches `phoebe:request-apple-signin` (typically from the
// injected SIWA button on the login page) and we:
//   1. Generate a per-login nonce (prevents token replay).
//   2. Open the native Apple sheet via the community plugin.
//   3. POST the returned identity token to /api/auth/apple/native.
//   4. On success, reload the web view so the session cookie is picked up.
function randomNonce(): string {
  // 128 bits of entropy is plenty for a one-shot nonce.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

async function runAppleSignIn(): Promise<void> {
  const nonce = randomNonce();
  let response: SignInWithAppleResponse;
  try {
    response = await SignInWithApple.authorize({
      // `clientId` is the iOS bundle ID for native SIWA (no Services ID).
      clientId: "app.withphoebe.mobile",
      // The plugin types require `redirectURI` even though native iOS
      // SIWA doesn't actually round-trip through a browser redirect
      // (it's a web-flow concept). We pass a placeholder that matches
      // our universal link; iOS ignores it in the native sheet.
      redirectURI: "https://withphoebe.app/auth/apple/callback",
      // Request BOTH email + name. Apple only honors `name` on the very
      // first authorization for a given Apple ID on this bundle — if the
      // user has signed in before on another install we only get email.
      scopes: "email name",
      // Required by the plugin; we use the same value as nonce so the
      // server can correlate the round-trip.
      state: nonce,
      nonce,
    });
  } catch (err) {
    window.dispatchEvent(new CustomEvent("phoebe:apple-signin-error", { detail: err }));
    return;
  }

  const identityToken = response.response?.identityToken;
  if (!identityToken) {
    window.dispatchEvent(new CustomEvent("phoebe:apple-signin-error", { detail: "no_identity_token" }));
    return;
  }

  const name = response.response?.givenName || response.response?.familyName
    ? {
        givenName: response.response?.givenName ?? undefined,
        familyName: response.response?.familyName ?? undefined,
      }
    : undefined;

  try {
    const res = await fetch(API_BASE + "/api/auth/apple/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ identityToken, nonce, name }),
    });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      window.dispatchEvent(new CustomEvent("phoebe:apple-signin-error", { detail }));
      return;
    }
    const body = await res.json();
    window.dispatchEvent(new CustomEvent("phoebe:apple-signin-ready", { detail: body }));
    // Reload the web view so the cookie becomes active and the web app
    // re-queries /api/users/me as the authenticated user.
    window.location.href = "/dashboard";
  } catch (err) {
    window.dispatchEvent(new CustomEvent("phoebe:apple-signin-error", { detail: err }));
  }
}

function wireAppleSignIn() {
  window.addEventListener("phoebe:request-apple-signin", () => {
    runAppleSignIn();
  });
}

// ─── SIWA button injector ──────────────────────────────────────────────────
// The web login page lives at /? and has a "Continue with Google" button.
// Apple requires SIWA to be at LEAST as prominent as the third-party SSO
// options when the app offers any of them — so on native iOS only, we
// inject a matching "Sign in with Apple" button right next to the Google
// one. We do this by observing the DOM because we don't know when the
// login page will render (Wouter-routed SPA). Once placed, we don't
// re-inject.
function injectSiwaButton() {
  const INJECTED_ATTR = "data-phoebe-siwa-injected";
  const tryInject = () => {
    // Only on the login-like routes. `/` is the marketing/login page;
    // `/signin` and `/login` are hypothetical future aliases.
    const path = window.location.pathname;
    if (!(path === "/" || path === "/signin" || path === "/login")) return;

    // Find the Google button. We look for any button/link whose text mentions
    // "Google" — robust to copy changes as long as the brand name stays.
    const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, a")).filter(el => {
      const txt = (el.textContent ?? "").toLowerCase();
      return txt.includes("google") && !el.hasAttribute(INJECTED_ATTR);
    });
    const googleBtn = candidates[0];
    if (!googleBtn) return;
    // Avoid double-injection.
    if (document.querySelector(`[${INJECTED_ATTR}="siwa"]`)) return;

    const appleBtn = document.createElement("button");
    appleBtn.type = "button";
    appleBtn.setAttribute(INJECTED_ATTR, "siwa");
    appleBtn.textContent = "\uF8FF  Sign in with Apple";
    // Styling: copy the Google button's computed class list so it visually
    // matches its neighbor. Inline fallback for font/colors if class copy
    // doesn't survive a Tailwind rebuild.
    appleBtn.className = googleBtn.className;
    appleBtn.style.cssText = `
      background: #000;
      color: #fff;
      border: 1px solid #000;
      font-family: -apple-system, 'SF Pro Text', system-ui, sans-serif;
      font-weight: 500;
      letter-spacing: 0.01em;
    `;
    appleBtn.addEventListener("click", () => {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      window.dispatchEvent(new Event("phoebe:request-apple-signin"));
    });
    // Insert after the Google button.
    googleBtn.parentElement?.insertBefore(appleBtn, googleBtn.nextSibling);
  };

  // Try once on bootstrap and again on route changes.
  tryInject();
  const mo = new MutationObserver(() => tryInject());
  mo.observe(document.body, { childList: true, subtree: true });
  window.addEventListener("popstate", tryInject);
}

// ─── Biometric re-auth on app resume ───────────────────────────────────────
// Adds a lock-after-idle layer on top of Phoebe's cookie session. The web
// app writes `phoebe:persist:biometricLock = "on"` to enable (mirrored to
// Preferences so it survives WebView cache purges). Once on, returning to
// the app after 5+ minutes inactive prompts Face ID / Touch ID before
// revealing the UI. Graceful fallback: if no biometry is enrolled, we
// skip the prompt rather than locking the user out.
const BIO_LOCK_KEY = "phoebe:persist:biometricLock";
const BIO_UNLOCK_TS = "phoebe:bioUnlockedAt";
const BIO_GRACE_MS = 5 * 60 * 1000;

function biometricLockEnabled(): boolean {
  try {
    return window.localStorage.getItem(BIO_LOCK_KEY) === "on";
  } catch {
    return false;
  }
}

function markBiometricUnlocked() {
  try {
    window.localStorage.setItem(BIO_UNLOCK_TS, String(Date.now()));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

async function runBiometricCheck(): Promise<boolean> {
  // Capability probe: no enrolled biometry → don't block.
  const { isAvailable, biometryType } = await NativeBiometric.isAvailable().catch(() => ({
    isAvailable: false,
    biometryType: BiometryType.NONE,
  }));
  if (!isAvailable) return true;
  void biometryType;
  try {
    await NativeBiometric.verifyIdentity({
      reason: "Unlock Phoebe",
      title: "Phoebe",
      subtitle: "Your prayer life, kept private.",
      description: "Use Face ID or Touch ID to continue.",
    });
    return true;
  } catch {
    return false;
  }
}

function showBioOverlay(): () => void {
  // Dim the WebView with an absolute-positioned element. Removed when the
  // user verifies.
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2147483647;
    background: #091A10;
    display: flex; align-items: center; justify-content: center;
    color: #8FAF96; font-family: system-ui, sans-serif; font-size: 14px;
  `;
  overlay.textContent = "Unlocking…";
  document.documentElement.appendChild(overlay);
  return () => overlay.remove();
}

async function enforceBiometricLockOnResume() {
  if (!biometricLockEnabled()) return;
  let lastUnlock = 0;
  try {
    lastUnlock = Number(window.localStorage.getItem(BIO_UNLOCK_TS) ?? "0");
  } catch {
    /* ignore */
  }
  if (Date.now() - lastUnlock < BIO_GRACE_MS) return;

  const hideOverlay = showBioOverlay();
  const ok = await runBiometricCheck();
  if (ok) {
    markBiometricUnlocked();
    hideOverlay();
  } else {
    // Bail back to login-like experience by reloading to /.
    // The server session may still be valid, but the lock is about
    // device-level confirmation, not auth.
    window.location.href = "/";
    hideOverlay();
  }
}

function wireBiometricLock() {
  // Check once on cold start.
  enforceBiometricLockOnResume();
  // And on every resume.
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) enforceBiometricLockOnResume();
  });
}

// ─── Local notifications (offline-capable bell reminders) ──────────────────
// Server push requires the device to be online AND have push permission.
// Local notifications fire from the device's own scheduler and keep
// working on a plane, with cell data off, etc. The web app dispatches
// `phoebe:schedule-bell { hourMin: "HH:MM", bellId: string, title?, body? }`
// and we schedule a repeating daily local notification. Dispatch
// `phoebe:cancel-bell { bellId }` to remove it.
function bellIdToNumeric(bellId: string): number {
  // LocalNotifications.schedule uses a numeric ID per notification. We
  // hash the string bellId into an int32 so the same logical bell always
  // reschedules onto the same slot (upsert semantics).
  let h = 5381;
  for (let i = 0; i < bellId.length; i++) {
    h = ((h * 33) ^ bellId.charCodeAt(i)) | 0;
  }
  // Keep positive & within 31 bits to be safe across iOS plugins.
  return Math.abs(h) & 0x7fffffff;
}

function wireLocalNotifications() {
  // Make sure permission is at least asked for once when scheduling.
  window.addEventListener("phoebe:schedule-bell", async e => {
    const detail = (e as CustomEvent).detail as
      | { hourMin: string; bellId: string; title?: string; body?: string }
      | undefined;
    if (!detail) return;
    const m = /^(\d{1,2}):(\d{2})$/.exec(detail.hourMin);
    if (!m) return;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (!(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59)) return;

    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== "granted") {
          window.dispatchEvent(new CustomEvent("phoebe:bell-denied"));
          return;
        }
      }
      const id = bellIdToNumeric(detail.bellId);
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: detail.title ?? "Phoebe",
            body: detail.body ?? "A gentle bell.",
            // `on: { hour, minute }` tells Capacitor to fire daily at that
            // wall-clock time in the device's local TZ. The plugin handles
            // DST automatically.
            schedule: { on: { hour, minute }, allowWhileIdle: true, repeats: true },
            smallIcon: "phoebe_bell",
            iconColor: "#2E6B40",
            sound: undefined,
          },
        ],
      });
      window.dispatchEvent(new CustomEvent("phoebe:bell-scheduled", { detail: { bellId: detail.bellId, id } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent("phoebe:bell-error", { detail: err }));
    }
  });

  window.addEventListener("phoebe:cancel-bell", async e => {
    const detail = (e as CustomEvent).detail as { bellId: string } | undefined;
    if (!detail) return;
    try {
      const id = bellIdToNumeric(detail.bellId);
      await LocalNotifications.cancel({ notifications: [{ id }] });
      window.dispatchEvent(new CustomEvent("phoebe:bell-cancelled", { detail: { bellId: detail.bellId } }));
    } catch {
      /* best-effort */
    }
  });
}

// ─── Persisted storage bridge ──────────────────────────────────────────────
// Capacitor Preferences is more reliable than localStorage inside a
// WKWebView cold start on iOS. The web app still uses localStorage; we
// mirror key writes into Preferences so the data survives uncommon edge
// cases (WebKit cache purge, app reinstall with iCloud restore). Keys
// prefixed `phoebe:persist:` are mirrored; everything else stays
// localStorage-only.
function wireDurableStorage() {
  const PREFIX = "phoebe:persist:";
  const origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key: string, value: string) {
    origSet.call(this, key, value);
    if (this === window.localStorage && key.startsWith(PREFIX)) {
      Preferences.set({ key, value }).catch(() => {});
    }
  };
  // On startup, rehydrate mirrored keys from Preferences back into
  // localStorage — belt-and-suspenders for the edge cases above.
  Preferences.keys().then(({ keys }) => {
    for (const k of keys) {
      if (!k.startsWith(PREFIX)) continue;
      Preferences.get({ key: k }).then(({ value }) => {
        if (value != null && window.localStorage.getItem(k) == null) {
          window.localStorage.setItem(k, value);
        }
      });
    }
  }).catch(() => {});
}

// ─── App lifecycle ─────────────────────────────────────────────────────────
// When the user returns to the app, re-register push (the OS sometimes
// rotates tokens) and broadcast an `appactive` event the web app can use
// to refetch state (e.g. the dashboard's "Today" section).
function wireLifecycle() {
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      window.dispatchEvent(new Event("phoebe:appactive"));
      // Silent token refresh — rotates if APNs has issued a new token.
      PushNotifications.checkPermissions().then(perm => {
        if (perm.receive === "granted") {
          PushNotifications.register().catch(() => {});
        }
      }).catch(() => {});
    } else {
      window.dispatchEvent(new Event("phoebe:appinactive"));
    }
  });
}

// ─── Public API on window.PhoebeNative ─────────────────────────────────────
// Escape hatch for debugging from Safari Web Inspector on a tethered
// device — and a place for the web app (if we ever do opt in) to call
// native features explicitly without going through events.
declare global {
  interface Window {
    PhoebeNative?: {
      setApiBaseUrl: (url: string) => void;
      triggerHaptic: (style: string) => void;
      requestPushPermission: () => void;
      requestContacts: () => void;
      requestAppleSignIn: () => void;
      scheduleBell: (bellId: string, hourMin: string, title?: string, body?: string) => void;
      cancelBell: (bellId: string) => void;
      setBiometricLock: (on: boolean) => void;
      updateWidget: (state: {
        bellTime?: string | null;
        lectioStage?: string | null;
        lectioPrompt?: string | null;
        nextPracticeName?: string | null;
      }) => void;
      isNative: () => boolean;
    };
  }
}

function exposePublicApi() {
  window.PhoebeNative = {
    setApiBaseUrl(url: string) {
      if (typeof url === "string" && url.length > 0) API_BASE = url.replace(/\/+$/, "");
    },
    triggerHaptic(style: string) {
      window.dispatchEvent(new CustomEvent("phoebe:haptic", { detail: { style } }));
    },
    requestPushPermission() {
      window.dispatchEvent(new Event("phoebe:request-push-permission"));
    },
    requestContacts() {
      window.dispatchEvent(new Event("phoebe:request-contacts"));
    },
    requestAppleSignIn() {
      window.dispatchEvent(new Event("phoebe:request-apple-signin"));
    },
    scheduleBell(bellId: string, hourMin: string, title?: string, body?: string) {
      window.dispatchEvent(
        new CustomEvent("phoebe:schedule-bell", { detail: { bellId, hourMin, title, body } })
      );
    },
    cancelBell(bellId: string) {
      window.dispatchEvent(
        new CustomEvent("phoebe:cancel-bell", { detail: { bellId } })
      );
    },
    setBiometricLock(on: boolean) {
      try {
        window.localStorage.setItem(BIO_LOCK_KEY, on ? "on" : "off");
        if (on) markBiometricUnlocked();
      } catch {
        /* ignore */
      }
    },
    updateWidget(state) {
      // Serialize to the shared App Group key so PhoebeWidget (Swift side)
      // can read it. The `phoebe:persist:widget` prefix means
      // wireDurableStorage() will mirror this into Capacitor Preferences
      // automatically — and once the user adds a Swift UserDefaults(suiteName:)
      // shim in PhoebeWidget.swift, the widget shows the data. On web the
      // write is a no-op localStorage entry, which doesn't hurt anything.
      try {
        const payload = JSON.stringify({
          bellTime: state.bellTime ?? null,
          lectioStage: state.lectioStage ?? null,
          lectioPrompt: state.lectioPrompt ?? null,
          nextPracticeName: state.nextPracticeName ?? null,
        });
        window.localStorage.setItem("phoebe:persist:widget", payload);
        // Belt-and-suspenders: also write directly to Preferences in case
        // the wireDurableStorage interceptor hasn't installed yet (e.g.
        // a very early call during bootstrap).
        Preferences.set({ key: "phoebe:persist:widget", value: payload }).catch(() => {});
      } catch {
        /* ignore — widget updates are best-effort */
      }
    },
    isNative() {
      return Capacitor.isNativePlatform();
    },
  };
}

// ─── Bootstrap ─────────────────────────────────────────────────────────────
(function bootstrap() {
  // Web build safety: if this file somehow gets loaded in a regular
  // browser (wrong cap.config, dev accident), bail out cleanly. The web
  // app renders unchanged.
  if (!Capacitor.isNativePlatform()) {
    exposePublicApi();
    return;
  }

  exposePublicApi();
  installApiFetchInterceptor();
  configureStatusBar();
  scheduleSplashHide();
  wireKeyboardInsets();
  wireBackGesture();
  wireDeepLinks();
  registerForPushIfRequested();
  wireNativeShare();
  wireHaptics();
  wireContacts();
  wireAppleSignIn();
  injectSiwaButton();
  wireBiometricLock();
  wireLocalNotifications();
  wireDurableStorage();
  wireLifecycle();
})();
