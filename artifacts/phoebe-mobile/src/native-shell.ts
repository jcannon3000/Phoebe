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

import { Capacitor, registerPlugin } from "@capacitor/core";
import { App } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { Keyboard } from "@capacitor/keyboard";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { Share } from "@capacitor/share";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";
import { Contacts } from "@capacitor-community/contacts";
import { LocalNotifications } from "@capacitor/local-notifications";
import { KeepAwake } from "@capacitor-community/keep-awake";
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
  // Each call is ISOLATED in its own try/catch. setBackgroundColor is
  // Android-only and REJECTS on iOS in Capacitor 7+ — in a single shared
  // try/catch (as before) that rejection aborted the later setOverlaysWebView
  // call, so after the Cap 8 upgrade the bar fell back to its default overlay
  // mode and rendered a mismatched dark strip over the splash. Isolating each
  // call guarantees the iOS-relevant ones (style + overlay) always run.
  try { await StatusBar.setStyle({ style: Style.Dark }); } catch { /* older iOS / mismatch */ }
  try { await StatusBar.setBackgroundColor({ color: "#091A10" }); } catch { /* Android-only; iOS rejects */ }
  // Overlays ON: the WebView renders EDGE-TO-EDGE under a transparent status bar
  // (MainViewController forces webView.frame = view.bounds, since the overlay
  // flag alone didn't extend it), so each screen's OWN background fills the area
  // behind the status bar — it adapts per surface instead of a fixed #091A10
  // strip. The web side pads its chrome with var(--safe-top) =
  // env(safe-area-inset-top) so nothing hides under the notch / Dynamic Island.
  try { await StatusBar.setOverlaysWebView({ overlay: true }); } catch { /* older iOS / mismatch */ }
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
// POST a device token to the backend with retries. The previous version
// fired-and-forgot the request inside an empty catch block, which meant
// every transient failure (401 because the session cookie wasn't ready
// yet, brief network blip, backend redeploy in progress, etc.) silently
// dropped the token forever — and there was no way to ever recover
// because the listener that owned it was single-shot.
/** Which native platform this shell is running on, for token registration.
 *  This used to be hardcoded "ios". On an Android build that made the device
 *  register itself as an iPhone, so the server routed its reminders to APNs,
 *  where an FCM token can never be delivered — every notification would fail
 *  permanently and the token would eventually be retired as dead. The server
 *  accepts "ios" | "android"; anything else would be rejected by its schema,
 *  so fall back to "ios" (the only platform shipped before this). */
function devicePlatform(): "ios" | "android" {
  try {
    const p = (window as unknown as { Capacitor?: { getPlatform?: () => string } })
      .Capacitor?.getPlatform?.();
    return p === "android" ? "android" : "ios";
  } catch {
    return "ios";
  }
}

async function postDeviceToken(token: string): Promise<boolean> {
  const ATTEMPTS = 4;
  const platform = devicePlatform();
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      const res = await fetch(API_BASE + "/api/push/device-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, platform }),
      });
      if (res.ok) {
        // Stamp success so we don't keep re-POSTing the same token on every
        // app resume. The /api/push/device-token endpoint is idempotent,
        // but skipping the network round-trip when we know it landed is
        // free politeness.
        try { localStorage.setItem("phoebe:push-token-registered", token); } catch { /* private mode */ }
        return true;
      }
      // 4xx (except 401) are permanent — don't retry.
      if (res.status >= 400 && res.status < 500 && res.status !== 401) return false;
      // Otherwise (401, 5xx, network) backoff and try again.
    } catch {
      // network error — fall through to backoff
    }
    await new Promise(r => setTimeout(r, 1500 * (i + 1)));
  }
  return false;
}

let pushListenersWired = false;
let pushActionListenerWired = false;

// Tapping a notification can wake the app from a cold start. The OS fires
// `pushNotificationActionPerformed` shortly after launch — if our listener
// is still gated behind `registerForPushIfRequested` (which only runs after
// the web app dispatches `phoebe:request-push-permission`, on a 4s delay
// inside wireLifecycle), the event lands before we're listening and the
// deep link is dropped. Attaching the listener at boot, before any gating,
// guarantees we catch the very first tap of an install-resume.
async function wirePushActionListener() {
  if (pushActionListenerWired) return;
  pushActionListenerWired = true;
  try {
    await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const path = (notification.data as Record<string, string> | undefined)?.["path"];
      // Pre-warm: tell the web app to invalidate its cached server
      // state so the destination page renders fresh data instead of
      // whatever was last fetched. Fires BEFORE the navigation so
      // React Query has a head start on the refetch — by the time
      // the route mounts, the response is usually already in flight.
      window.dispatchEvent(new CustomEvent("phoebe:notification-tap"));
      if (typeof path === "string" && path.startsWith("/")) {
        window.history.pushState({}, "", path);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    });
  } catch {
    // Plugin not available in this environment — non-fatal.
  }
}

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

      // Listeners are wired ONCE per app session. Previously the
      // "registration" listener was added inside this handler AND
      // self-removed after firing — meaning the silent re-register
      // call inside `wireLifecycle` (on app resume) had no listener
      // attached to receive its token. Result: a token rotation or
      // a recovered-from-failure first registration was invisible to
      // us. Now we add the listeners exactly once and leave them up
      // for the lifetime of the app process.
      if (!pushListenersWired) {
        pushListenersWired = true;

        await PushNotifications.addListener("registration", async (token: Token) => {
          // De-dup against localStorage so we don't POST the same
          // token on every resume. If the token rotates (rare — iOS
          // reissue, iCloud restore, app reinstall), the value won't
          // match and we'll POST the new one.
          let lastRegistered: string | null = null;
          try { lastRegistered = localStorage.getItem("phoebe:push-token-registered"); } catch { /* ignore */ }
          if (token.value === lastRegistered) {
            window.dispatchEvent(new CustomEvent("phoebe:push-ready", { detail: { token: token.value } }));
            return;
          }
          const ok = await postDeviceToken(token.value);
          if (ok) {
            window.dispatchEvent(new CustomEvent("phoebe:push-ready", { detail: { token: token.value } }));
          } else {
            // Surface the failure so we can debug with `phoebe:push-error`
            // listeners (and so the localStorage flag in
            // PushPermissionPrompt doesn't trick us into thinking we're
            // done — we'll retry on next app foreground via wireLifecycle).
            window.dispatchEvent(new CustomEvent("phoebe:push-error", { detail: { stage: "post-token" } }));
          }
        });

        await PushNotifications.addListener("registrationError", err => {
          window.dispatchEvent(new CustomEvent("phoebe:push-error", { detail: err }));
        });

        // Silent/background pushes that ask us to REMOVE a delivered banner
        // (e.g. "Join the breath" is withdrawn once fewer than 3 Fellows are
        // still breathing). We don't show anything — just clear the matching
        // thread via the same path /prayer-mode uses. Best-effort: iOS only
        // wakes us for background pushes when it grants execution time.
        await PushNotifications.addListener("pushNotificationReceived", n => {
          const data = (n.data as Record<string, string> | undefined) ?? {};
          if (data["type"] === "cobreathe-live-withdraw") {
            window.dispatchEvent(new CustomEvent("phoebe:clear-notifications", {
              detail: { threadId: data["threadId"] || "cobreathe-live" },
            }));
          }
        });

        // The `pushNotificationActionPerformed` listener is wired at boot
        // by `wirePushActionListener`, not here — see that function for why.

        // Foreground delivery is handled by iOS itself: capacitor.config's
        // PushNotifications.presentationOptions includes "alert", so a push
        // arriving while the app is open shows the system banner like any
        // other. We used to also forward it to the web layer as
        // `phoebe:push-received` for an in-app toast, but that doubled the
        // banner up. The in-app toast (ForegroundPushToast) is now web-only —
        // where a focused tab gets no OS banner — so no native forwarding is
        // needed. Background and locked-screen pushes go straight through APNs.
      }

      await PushNotifications.register();
    } catch (err) {
      window.dispatchEvent(new CustomEvent("phoebe:push-error", { detail: err }));
    }
  };
  window.addEventListener("phoebe:request-push-permission", handler);
}

// ─── Clear delivered notifications from the iOS notification center ────────
// The web app dispatches `phoebe:clear-notifications` with an optional
// `{ threadId: string }` filter. We pull the currently-delivered list and
// remove anything whose APN thread-id matches. Used by /prayer-mode when
// the slideshow finishes — the morning bell ('thread-id': 'bell') has done
// its job, so it shouldn't sit on the lock screen for the rest of the day.
//
// On the web build the @capacitor/push-notifications plugin is a no-op,
// so we wrap each call in a try/catch and let dispatchers fire blindly.
function wireClearNotifications() {
  window.addEventListener("phoebe:clear-notifications", async e => {
    const detail = (e as CustomEvent).detail as { threadId?: string } | undefined;
    const threadId = detail?.threadId;
    try {
      const list = await PushNotifications.getDeliveredNotifications();
      const items = list.notifications ?? [];

      // "prayer-request-N" used to be the per-request thread-id, but
      // it's now collapsed into the shared "prayer-requests" thread
      // so iOS can stack pending asks into one group on the lock
      // screen. The per-request identity lives in `data.prayerRequestId`
      // instead. When a caller asks to clear "prayer-request-42", we
      // extract the 42 and match against that field. Legacy
      // notifications sent before the change still carry the
      // per-request thread-id, so the old match path is kept as a
      // fallback (no-op for new sends, still works for stale
      // pre-deploy banners).
      const requestIdMatch = threadId?.match(/^prayer-request-(\d+)$/);
      const targetRequestId = requestIdMatch ? Number(requestIdMatch[1]) : null;

      // Match against either of the iOS thread fields the plugin
      // surfaces. Different Capacitor versions / iOS releases populate
      // one or the other; matching both is belt-and-suspenders.
      const matches = threadId
        ? items.filter(n => {
            const anyN = n as unknown as Record<string, unknown>;
            const tid =
              (anyN["threadIdentifier"] as string | undefined)
              ?? (anyN["thread-id"] as string | undefined)
              ?? ((anyN["data"] as Record<string, unknown> | undefined)?.["thread-id"] as string | undefined);
            if (tid === threadId) return true;

            // Per-request fallback: when targeting "prayer-request-N",
            // also match notifications whose data carries that id.
            // Covers the new shared-thread layout where one banner
            // amongst N stacked siblings needs to be picked out.
            if (targetRequestId !== null) {
              const data = anyN["data"] as Record<string, unknown> | undefined;
              const idFromData = data?.["prayerRequestId"];
              if (typeof idFromData === "number" && idFromData === targetRequestId) return true;
              if (typeof idFromData === "string" && Number(idFromData) === targetRequestId) return true;

              // Second fallback: match on the deep-link path
              // ("/prayer-requests/N"). Some Capacitor / iOS combos
              // surface the custom userInfo for getDeliveredNotifications()
              // differently than for the tapped-action callback — but the
              // `path` field is the one we already know lands reliably
              // (the deep-link handler reads notification.data.path). So
              // if prayerRequestId didn't make it through, the path
              // usually did. Accept an exact match OR a trailing-segment
              // match so a future query string / origin prefix doesn't
              // break it.
              const pathFromData = data?.["path"];
              if (typeof pathFromData === "string") {
                const want = `/prayer-requests/${targetRequestId}`;
                // split("?") always yields ≥1 element, but noUncheckedIndexedAccess
                // types [0] as possibly-undefined — guard it so it compiles.
                const pathBase = pathFromData.split("?")[0] ?? pathFromData;
                if (pathFromData === want || pathBase.endsWith(want)) {
                  return true;
                }
              }
            }
            return false;
          })
        : items;
      if (matches.length === 0) return;
      await PushNotifications.removeDeliveredNotifications({ notifications: matches });
    } catch {
      // Plugin unavailable (web build) or a transient native error —
      // not fatal; the OS will eventually drop the notification when
      // the user wakes their device or another reminder fires.
    }
  });
}

// ─── Daily-steps notification clears on app open ────────────────────────────
// The "Step goal reached 👟 — N steps today" banner has done its job the moment
// you open the app — the home already shows the goal met, so the lock-screen
// copy is redundant. Clear the delivered "daily-steps" thread on every
// foreground/launch (reusing wireClearNotifications above) so it disappears the
// NEXT time the app is opened, rather than lingering on the lock screen.
function wireStepsNotificationExpiry() {
  const clear = () => {
    window.dispatchEvent(new CustomEvent("phoebe:clear-notifications", { detail: { threadId: "daily-steps" } }));
  };
  clear();
  window.addEventListener("phoebe:appactive", clear);
}

// ─── Prayer-reminder notification clears on app open ────────────────────────
// The morning bell AND the evening nudge are both sent with thread-id "bell"
// (see pushSender.ts). Once the person has opened the app, the reminder has
// done its job — the home already shows their rhythm — so it shouldn't sit on
// the lock screen. Clear the "bell" thread on every foreground/launch so the
// morning (and evening) prayer reminder disappears as soon as the app opens,
// rather than only when the prayer slideshow is finished.
function wirePrayerBellExpiry() {
  const clear = () => {
    window.dispatchEvent(new CustomEvent("phoebe:clear-notifications", { detail: { threadId: "bell" } }));
  };
  clear();
  window.addEventListener("phoebe:appactive", clear);
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

// ─── Print (native) ────────────────────────────────────────────────────────
// WKWebView doesn't implement window.print(), so the web app dispatches
// `phoebe:print` (with an optional { jobName }) and we route it to the native
// PhoebePrint plugin, which presents the iOS print sheet — AirPrint, Save to
// Files as a PDF, or share. Warns and no-ops if the plugin isn't registered.
const PhoebePrint = registerPlugin<{ printPage(options: { jobName?: string }): Promise<{ completed?: boolean }> }>("PhoebePrint");
function wireNativePrint() {
  window.addEventListener("phoebe:print", async e => {
    const detail = (e as CustomEvent).detail as { jobName?: string } | undefined;
    try {
      await PhoebePrint.printPage({ jobName: detail?.jobName });
    } catch (err) {
      console.warn("[PhoebeNative] print failed:", err);
    }
  });
}

// ─── In-app browser (native) ───────────────────────────────────────────────
// Opens an external URL in SFSafariViewController on iOS — keeps the user
// inside Phoebe (back button slides them back to the slideshow rather
// than booting them out to Safari). Web build dispatches the same event
// but its own openExternalLink helper falls back to window.open since
// no listener is attached there.
function wireNativeOpenUrl() {
  window.addEventListener("phoebe:open-url", async e => {
    const detail = (e as CustomEvent).detail as { url?: string } | undefined;
    if (!detail?.url) return;
    try {
      await Browser.open({ url: detail.url });
    } catch {
      // Fall back to a normal navigation if the native sheet fails.
      window.open(detail.url, "_blank");
    }
  });
}

// ─── Haptics ───────────────────────────────────────────────────────────────
// Small, opinionated API: web app dispatches `phoebe:haptic` with
// `{ style: "light" | "medium" | "heavy" | "success" | "warning" | "error"
//          | "celebration" }`.
// Keeps native-shell the only place that knows about ImpactStyle /
// NotificationType.
//
// "celebration" is the lesson-complete moment — when the prayer-list
// slideshow lands on its closing slide. The user wants the haptic
// to feel like ONE LONG smooth vibration that breathes the same
// way the closing chime does (~7s open-fifth pad with a 2.5s
// crescendo, 0.8s hold, 3.7s fade).
//
// Capacitor's Haptics plugin doesn't expose Core Haptics'
// continuous patterns, so we approximate continuity by firing
// impact() at the tightest cadence the Taptic Engine accepts
// without dropping pulses (~50ms). At that rate the engine
// doesn't fully relax between hits and the felt result reads as
// a sustained vibration rather than a string of taps. The
// intensity curve climbs Light → Medium → Heavy through the
// crescendo, holds Heavy at the peak, then falls Heavy →
// Medium → Light through the fade — mirroring the chime's
// amplitude envelope so the buzz feels coupled to the sound.
//
// We track the active interval so a second "celebration" event
// mid-swell cancels the first cleanly instead of stacking.
let celebrationInterval: number | null = null;
let celebrationStartedAt = 0;
function fireCelebrationRumble() {
  // Cancel any in-flight swell from a prior celebration.
  if (celebrationInterval !== null) {
    window.clearInterval(celebrationInterval);
    celebrationInterval = null;
  }

  // Mirrors playOpeningSwell's amplitude envelope (s):
  //   • SWELL_IN  2.5  rising intensity
  //   • HOLD      0.8  peak (Heavy)
  //   • FADE_OUT  3.7  falling intensity
  const SWELL_IN_MS = 2500;
  const HOLD_MS = 800;
  const FADE_OUT_MS = 3700;
  const TOTAL_MS = SWELL_IN_MS + HOLD_MS + FADE_OUT_MS;

  // 50ms cadence — fastest interval where the Taptic Engine still
  // honors each pulse cleanly. Faster than that and pulses get
  // dropped/merged in unpredictable ways; slower and the felt
  // result reads as discrete taps instead of a continuous buzz.
  const TICK_MS = 50;

  // Opening success notification — the recognizable "completion"
  // double-tap that anchors the start of the swell.
  try {
    Haptics.notification({ type: NotificationType.Success });
  } catch { /* non-fatal */ }

  celebrationStartedAt = Date.now();
  const tick = () => {
    const elapsed = Date.now() - celebrationStartedAt;
    if (elapsed >= TOTAL_MS) {
      if (celebrationInterval !== null) {
        window.clearInterval(celebrationInterval);
        celebrationInterval = null;
      }
      return;
    }
    let style: ImpactStyle;
    if (elapsed < SWELL_IN_MS) {
      // Crescendo: Light → Medium → Heavy across 2.5s
      const t = elapsed / SWELL_IN_MS;
      style = t < 0.33 ? ImpactStyle.Light
            : t < 0.66 ? ImpactStyle.Medium
            : ImpactStyle.Heavy;
    } else if (elapsed < SWELL_IN_MS + HOLD_MS) {
      // Peak: Heavy hold
      style = ImpactStyle.Heavy;
    } else {
      // Fade: Heavy → Medium → Light across 3.7s
      const t = (elapsed - SWELL_IN_MS - HOLD_MS) / FADE_OUT_MS;
      style = t < 0.33 ? ImpactStyle.Heavy
            : t < 0.66 ? ImpactStyle.Medium
            : ImpactStyle.Light;
    }
    Haptics.impact({ style }).catch(() => {});
  };

  // Fire the first tick immediately so there's no perceptible
  // gap between the success notification and the rising swell.
  tick();
  celebrationInterval = window.setInterval(tick, TICK_MS);
}

// One long SUSTAINED rumble — a steady Heavy buzz held for ~1.5s with no swell
// (distinct from `celebration`, which crescendos and fades). iOS has no true
// continuous haptic, so we fire Heavy impacts close together; felt as one long
// buzz. Used for the Cobreathe "you kept all twelve breaths" payoff.
let sustainedInterval: number | null = null;
function fireSustainedRumble() {
  if (sustainedInterval !== null) {
    window.clearInterval(sustainedInterval);
    sustainedInterval = null;
  }
  const TOTAL_MS = 1500;
  const TICK_MS = 45;
  const startedAt = Date.now();
  // Open with a success notification so the buzz lands with a clear "done."
  try { Haptics.notification({ type: NotificationType.Success }); } catch { /* non-fatal */ }
  const tick = () => {
    if (Date.now() - startedAt >= TOTAL_MS) {
      if (sustainedInterval !== null) {
        window.clearInterval(sustainedInterval);
        sustainedInterval = null;
      }
      return;
    }
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  };
  tick();
  sustainedInterval = window.setInterval(tick, TICK_MS);
}

// A GENTLE swell — much smoother than `celebration`: no sharp opening "success"
// double-tap, no Heavy jolts, no hard Light→Medium→Heavy steps. Instead a soft
// rise-and-fall felt through DENSITY: uniform Light taps whose spacing eases from
// sparse (150ms) at the edges to dense (55ms) at the peak, on a cosine envelope,
// with a whisper of Medium only at the very top. Used for the Cobreathe "you kept
// all twelve breaths" payoff, which wants to feel like a calm exhale, not a buzz.
let smoothSwellTimer: number | null = null;
function fireSmoothSwell() {
  if (smoothSwellTimer !== null) {
    window.clearTimeout(smoothSwellTimer);
    smoothSwellTimer = null;
  }
  const IN_MS = 1800;   // gentle rise
  const HOLD_MS = 700;  // brief peak
  const OUT_MS = 2200;  // long, soft fall
  const TOTAL_MS = IN_MS + HOLD_MS + OUT_MS;
  const started = Date.now();
  // Cosine-eased amplitude 0→1→0 (no abrupt edges).
  const amplitude = (e: number): number => {
    if (e < IN_MS) return (1 - Math.cos(Math.PI * (e / IN_MS))) / 2;
    if (e < IN_MS + HOLD_MS) return 1;
    const t = Math.min(1, (e - IN_MS - HOLD_MS) / OUT_MS);
    return (1 + Math.cos(Math.PI * t)) / 2;
  };
  const step = () => {
    const e = Date.now() - started;
    if (e >= TOTAL_MS) {
      smoothSwellTimer = null;
      return;
    }
    const a = amplitude(e);
    // Mostly Light; only a touch of Medium right at the crest. No Heavy.
    const style = a > 0.9 ? ImpactStyle.Medium : ImpactStyle.Light;
    Haptics.impact({ style }).catch(() => {});
    // Spacing carries the swell: 150ms (quiet edges) → 55ms (dense peak).
    const interval = 150 - (150 - 55) * a;
    smoothSwellTimer = window.setTimeout(step, interval);
  };
  step();
}

// The genuinely smooth "Co-Breathe" swell, generalized. PREFER native Core
// Haptics (PhoebeAudio.smoothSwell) — a single CONTINUOUS vibration on a
// parabolic intensity envelope — and only fall back to a discrete impact
// approximation on the web / on hardware without Core Haptics, where the native
// path is unavailable and the taps read as a string. This is the one helper all
// of the app's "completion / finishing" haptics now route through, so every
// slideshow close, examen finish, and payoff feels like the same calm exhale.
async function playSmoothSwell(
  opts: { durationMs: number; peak: number; sharpness: number },
  fallback: () => void,
): Promise<void> {
  try {
    const audio = getPhoebeAudio();
    if (audio?.smoothSwell) {
      const res = await audio.smoothSwell(opts);
      if (res?.ok) return; // native swell played — don't also fire the fallback
    }
  } catch { /* fall through to the web approximation */ }
  fallback();
}
// The Cobreathe "all twelve breaths" payoff.
function playBreathCompleteHaptic() {
  void playSmoothSwell({ durationMs: 1300, peak: 1.0, sharpness: 0.3 }, fireSmoothSwell);
}

function wireHaptics() {
  window.addEventListener("phoebe:haptic", e => {
    const detail = (e as CustomEvent).detail as { style?: string; peak?: number; durationMs?: number } | undefined;
    const s = detail?.style ?? "light";
    try {
      switch (s) {
        case "tick": {
          // A single cascade tick — a short smooth swell whose strength (peak)
          // and length (durationMs) the caller controls, so the card cascade can
          // ramp intensity per card and stretch the last one. Web falls back to a
          // discrete impact scaled to the peak.
          const peak = typeof detail?.peak === "number" ? Math.max(0.05, Math.min(1, detail.peak)) : 0.5;
          const durationMs = typeof detail?.durationMs === "number" ? detail.durationMs : 120;
          void playSmoothSwell({ durationMs, peak, sharpness: 0.5 }, () =>
            Haptics.impact({ style: peak >= 0.75 ? ImpactStyle.Heavy : peak >= 0.45 ? ImpactStyle.Medium : ImpactStyle.Light }));
          break;
        }
        case "celebration":
          // Slideshow / lesson close — the big finish. A long, full, smooth
          // swell (native Core Haptics) instead of the old impact-density
          // crescendo; the rumble is the web fallback only.
          void playSmoothSwell({ durationMs: 2400, peak: 1.0, sharpness: 0.25 }, fireCelebrationRumble);
          break;
        case "breath-complete":
          playBreathCompleteHaptic();
          break;
        case "sustained":
          void playSmoothSwell({ durationMs: 1300, peak: 1.0, sharpness: 0.3 }, fireSustainedRumble);
          break;
        case "heavy":
          Haptics.impact({ style: ImpactStyle.Heavy });
          break;
        case "medium":
          Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case "success":
          // A gentle smooth confirmation (e.g. examen / prayer-mode completion)
          // — softer + rounder than the discrete Success double-tap.
          void playSmoothSwell({ durationMs: 650, peak: 0.6, sharpness: 0.45 }, () => Haptics.notification({ type: NotificationType.Success }));
          break;
        case "warning":
          Haptics.notification({ type: NotificationType.Warning });
          break;
        case "error":
          Haptics.notification({ type: NotificationType.Error });
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
      // iOS 18 + @capacitor-community/contacts@7 added a "Limited Access" choice
      // that returns the permission state "limited" — getContacts() still works
      // (returns the user's selected subset), so treat it as granted. The old
      // `=== "granted"` gate (Cap 6 had no "limited") aborted the whole invite
      // flow for anyone who tapped Limited Access.
      const ok = (s: string) => s === "granted" || s === "limited";
      const perm = await Contacts.checkPermissions();
      let granted = ok(perm.contacts);
      if (!granted) {
        const requested = await Contacts.requestPermissions();
        granted = ok(requested.contacts);
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

// ─── Rest-window reminders (BETA) ────────────────────────────────────────────
// The Way of Love's Rest practice can carry a TIME WINDOW ("an event to
// rest" — e.g. Saturday 2:00 PM). The web app dispatches
// `phoebe:schedule-rest-reminders` { days: number[], start: "HH:MM" | null }
// whenever the rest days or window change; we cancel the previous weekly
// schedules and, when a window is set, schedule one gentle repeating weekly
// notification per rest day at the window's start. days uses JS getDay()
// numbering (0 = Sunday); Capacitor's `on.weekday` is 1 = Sunday … 7 = Saturday.
const REST_REMINDER_ID_BASE = 8600; // ids 8600–8606, one per weekday
function wireRestReminders() {
  window.addEventListener("phoebe:schedule-rest-reminders", async e => {
    const detail = (e as CustomEvent).detail as { days?: number[]; start?: string | null } | undefined;
    const days = Array.isArray(detail?.days)
      ? detail.days.filter((d): d is number => typeof d === "number" && d >= 0 && d <= 6)
      : [];
    const start = typeof detail?.start === "string" && /^\d{2}:\d{2}$/.test(detail.start) ? detail.start : null;
    // Always clear the previous weekly schedules first — days/window changes
    // and Clear both land here.
    try {
      await LocalNotifications.cancel({
        notifications: Array.from({ length: 7 }, (_, d) => ({ id: REST_REMINDER_ID_BASE + d })),
      });
    } catch { /* best-effort */ }
    if (!start || days.length === 0) return;
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== "granted") return;
      }
      const [hStr, mStr] = start.split(":");
      const hour = parseInt(hStr ?? "0", 10);
      const minute = parseInt(mStr ?? "0", 10);
      await LocalNotifications.schedule({
        notifications: days.map(d => ({
          id: REST_REMINDER_ID_BASE + d,
          title: "Your rest begins now 🌙",
          body: "The window you set aside for rest is here.",
          schedule: { on: { weekday: d + 1, hour, minute }, repeats: true, allowWhileIdle: true },
          smallIcon: "phoebe_bell",
          iconColor: "#2E6B40",
          threadIdentifier: "rest-window",
        })),
      });
    } catch {
      /* best-effort — web build / permission denied */
    }
  });
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

// ─── Contemplation timer bridge ─────────────────────────────────────────────
// Keeps the screen lit through a silent-prayer sit and delivers the closing
// bell even if the phone gets locked or the app backgrounded mid-sit.
//
//   • phoebe:contemplation-keep-awake / -allow-sleep — toggle
//     UIApplication.isIdleTimerDisabled via the keep-awake plugin, so the
//     screen doesn't auto-lock while the countdown runs (the web
//     navigator.wakeLock the app also calls is unreliable in WKWebView).
//   • phoebe:contemplation-schedule-end { at: ISO } — schedules the closing
//     bell via TWO mechanisms in parallel:
//       1. PhoebeAudio (native plugin) — primary path. Owns an AVAudioSession
//          with .playback category (ignores the silent switch), loops a
//          near-silent buffer to keep iOS honoring our UIBackgroundModes:audio
//          declaration through screen-lock, and fires the bell precisely at
//          the target moment via AVAudioPlayer.play(atTime:). This is what
//          Insight Timer / Calm use to ring while locked even under Focus
//          modes or with the silent switch on.
//       2. LocalNotifications — fallback for the case iOS suspends our
//          process anyway (low-power mode, OS pressure, app crashed mid-sit).
//          Silent switch may still suppress this sound but it's better than
//          nothing.
//   • phoebe:contemplation-cancel-end — cancels both mechanisms (fired
//     when the sit ends in-app so a foregrounded finish doesn't double-bell).
const CONTEMPLATION_BELL_ID = 880_001;
const CONTEMPLATION_BELL_FILE = "PhoebeRising-high.caf";

// Typed handle to the PhoebeAudio native plugin. Falls back to undefined
// on web builds and on iOS bundles that pre-date the plugin (defense in
// depth — a stale TestFlight build shouldn't crash).
function getPhoebeAudio(): {
  prime?: () => Promise<void>;
  playNow?: (opts: { sound: string }) => Promise<void>;
  scheduleBellAt?: (opts: { at: number; sound: string }) => Promise<void>;
  cancelScheduled?: () => Promise<void>;
  scheduleBellNotification?: (opts: { at: number; sound: string }) => Promise<void>;
  cancelBellNotification?: () => Promise<void>;
  smoothSwell?: (opts?: { durationMs?: number; peak?: number; sharpness?: number }) => Promise<{ ok?: boolean }>;
} | undefined {
  const cap = (window as {
    Capacitor?: { Plugins?: Record<string, unknown> };
  }).Capacitor;
  return cap?.Plugins?.["PhoebeAudio"] as ReturnType<typeof getPhoebeAudio>;
}

function wireContemplation() {
  window.addEventListener("phoebe:contemplation-keep-awake", async () => {
    try { await KeepAwake.keepAwake(); } catch { /* unsupported — web wakeLock still tries */ }
    // Prime the native audio session opportunistically when the sit starts.
    // Doing this here (rather than only at schedule-end time) means the
    // session is already .playback by the time the timer ticks, so the
    // first scheduleBellAt call is instant and we shave off any first-use
    // category-switch latency that could swallow the bell.
    try { await getPhoebeAudio()?.prime?.(); } catch { /* best-effort */ }
  });
  window.addEventListener("phoebe:contemplation-allow-sleep", async () => {
    try { await KeepAwake.allowSleep(); } catch { /* non-fatal */ }
  });

  window.addEventListener("phoebe:contemplation-schedule-end", async e => {
    const detail = (e as CustomEvent).detail as { at?: string } | undefined;
    const at = detail?.at ? new Date(detail.at) : null;
    if (!at || Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return;

    // Primary path: native AVAudioPlayer keep-alive + scheduled play. This
    // is the path that survives a locked screen because it doesn't depend
    // on the notification system delivering an audible alert.
    try {
      await getPhoebeAudio()?.scheduleBellAt?.({
        at: at.getTime(),
        sound: CONTEMPLATION_BELL_FILE,
      });
    } catch {
      /* fall through to the LocalNotification fallback */
    }

    // Fallback path: a TIME-SENSITIVE local notification. Scheduled natively
    // (PhoebeAudio.scheduleBellNotification) so we can set interruptionLevel =
    // .timeSensitive — which breaks through Do Not Disturb / Focus. Its audible
    // part still honors the hardware silent switch, but the in-app .playback
    // bell above covers the muted-while-foregrounded case, so together they're
    // a reliable backstop. We still ask for notification permission via the
    // Capacitor plugin (same authorization the native scheduler relies on),
    // then fall back to a plain Capacitor notification if the native plugin is
    // missing (older bundle).
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== "granted") return;
      }
      const audio = getPhoebeAudio();
      if (audio?.scheduleBellNotification) {
        await audio.scheduleBellNotification({ at: at.getTime(), sound: CONTEMPLATION_BELL_FILE });
      } else {
        await LocalNotifications.schedule({
          notifications: [
            {
              id: CONTEMPLATION_BELL_ID,
              title: "Contemplation",
              body: "Your time is complete.",
              schedule: { at, allowWhileIdle: true },
              smallIcon: "phoebe_bell",
              iconColor: "#2E6B40",
              sound: CONTEMPLATION_BELL_FILE,
              // Same thread the AppDelegate force-presents in the foreground, so
              // even this fallback shows a banner during a keep-awake sit.
              threadIdentifier: "contemplation-bell",
            },
          ],
        });
      }
    } catch {
      /* best-effort */
    }
  });

  window.addEventListener("phoebe:contemplation-cancel-end", async () => {
    // Cancel both mechanisms so a foregrounded finish doesn't double-bell
    // (in-app Web Audio bell PLUS the native scheduled bell PLUS the
    // local notification all firing within milliseconds of each other).
    try { await getPhoebeAudio()?.cancelScheduled?.(); } catch { /* best-effort */ }
    try { await getPhoebeAudio()?.cancelBellNotification?.(); } catch { /* best-effort */ }
    try {
      await LocalNotifications.cancel({ notifications: [{ id: CONTEMPLATION_BELL_ID }] });
    } catch {
      /* best-effort */
    }
  });

  // Foreground in-app close bell — when the sit finishes while the app is
  // open, we play the same bell through the native session so the silent
  // switch doesn't mute it. Falls back to whatever the web layer plays.
  window.addEventListener("phoebe:contemplation-play-bell", async e => {
    // The web side picks a voicing: "PhoebeRising-low.caf" for the opening
    // swell, "-high.caf" for the close. Default to the close bell.
    const detail = (e as CustomEvent).detail as { sound?: string } | undefined;
    const sound = detail?.sound ?? CONTEMPLATION_BELL_FILE;
    try { await getPhoebeAudio()?.playNow?.({ sound }); }
    catch { /* best-effort — web layer also plays its synthesized bell */ }
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
  // Dismissing the in-app browser (SFSafariViewController) fires neither
  // appStateChange (the app stayed active under the overlay) nor the WebView's
  // visibilitychange, so emit a dedicated event the web app can act on — e.g.
  // ReflectionReturnRedirect navigating to the in-app reflection page when the
  // reader closes a daily-reflection newsletter. Kept separate from
  // `phoebe:appactive` so it doesn't log a false app-open or rotate tokens.
  void Browser.addListener("browserFinished", () => {
    window.dispatchEvent(new Event("phoebe:browserfinished"));
  });
  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) {
      window.dispatchEvent(new Event("phoebe:appactive"));
      // Silent token refresh — rotates if APNs has issued a new token,
      // and recovers any first-time registration whose POST initially
      // failed (401, network blip, etc.). We dispatch the same event the
      // PushPermissionPrompt does so the registration handler runs its
      // full path: listeners get attached (idempotent guard), register()
      // fires, the token POSTs with retries. Without this, a single
      // failed device-token POST left the user permanently un-pushable
      // until they reinstalled the app.
      PushNotifications.checkPermissions().then(perm => {
        if (perm.receive === "granted") {
          window.dispatchEvent(new Event("phoebe:request-push-permission"));
        }
      }).catch(() => {});
    } else {
      window.dispatchEvent(new Event("phoebe:appinactive"));
    }
  });

  // Run the same recovery once at boot for users whose permission was
  // granted on a previous launch (PushPermissionPrompt won't re-fire
  // because of the localStorage gate). Delay slightly so the session
  // cookie has a chance to land first.
  setTimeout(() => {
    PushNotifications.checkPermissions().then(perm => {
      if (perm.receive === "granted") {
        window.dispatchEvent(new Event("phoebe:request-push-permission"));
      }
    }).catch(() => {});
  }, 4000);
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
      scheduleBell: (bellId: string, hourMin: string, title?: string, body?: string) => void;
      cancelBell: (bellId: string) => void;
      setBiometricLock: (on: boolean) => void;
      updateWidget: (state: {
        bellTime?: string | null;
        nextPracticeName?: string | null;
        // Prayer-rhythm stats for the Lock/Home Screen widget (PhoebeWidget).
        streakDays?: number | null;
        prayedToday?: boolean | null;
        nextOffice?: string | null;
        newPrayersCount?: number | null;
        updatedAt?: string | null;
        // Daily rhythm progress (widget dots + "N of M today").
        doneCount?: number | null;
        totalAnchors?: number | null;
        dots?: number[] | null;
        morningDone?: boolean | null;
        reflectDone?: boolean | null;
        eveningDone?: boolean | null;
        reflectAvailable?: boolean | null;
        // Today's contemplation minutes + the daily goal (0 = no goal) — the
        // lock-screen "Today" widget shows "N/M min" + a progress ring.
        contemplationMin?: number | null;
        contemplationGoalMin?: number | null;
        // Dynamic "what's next" hero (medium widget) — mirrors the home hero.
        heroKind?: string | null;       // "office" | "reflect" | "summary"
        heroEyebrow?: string | null;
        heroTitle?: string | null;
        heroSubtitle?: string | null;
        heroCta?: string | null;        // "" → no button
        heroDeepLink?: string | null;
      }) => void;
      isNative: () => boolean;
      // Synchronous front door for Browser.open. The previous bridge
      // dispatched a `phoebe:open-url` event whose listener then called
      // Browser.open — which dropped the iOS user-gesture context and
      // got blocked. Calling Browser.open directly from the click
      // handler keeps it within the gesture, so SFSafariViewController
      // is allowed to present.
      openInAppBrowser?: (url: string) => Promise<void>;
      // SFSafariViewController with entersReaderIfAvailable — shares Safari's
      // system-wide cookie jar (unlike openInAppBrowser's own WKWebView data
      // store). See lib/openExternal.ts's `reader` option on the web side.
      openReaderView?: (url: string) => Promise<void>;
      // Warm a URL in a background WKWebView so a later openInAppBrowser of the
      // same URL shows the already-loaded page instantly. Best-effort no-op.
      preloadInAppBrowser?: (url: string) => Promise<void>;
      // Set the iOS app-icon badge to a specific count. The default
      // Capacitor stack only updates the badge through APNs pushes,
      // which means the icon can only grow — opening the app clears
      // it to 0 and it stays at 0 until another push arrives.
      // Calling setBadge from the dashboard after computing the live
      // unprayed count keeps the icon honest across opens, amens,
      // and dismissals. No-op on web. Backed by PhoebeBadgePlugin
      // (ios/App/App/PhoebeBadgePlugin.swift).
      setBadge?: (count: number) => Promise<void>;
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
          nextPracticeName: state.nextPracticeName ?? null,
          streakDays: state.streakDays ?? null,
          prayedToday: state.prayedToday ?? null,
          nextOffice: state.nextOffice ?? null,
          newPrayersCount: state.newPrayersCount ?? null,
          doneCount: state.doneCount ?? null,
          totalAnchors: state.totalAnchors ?? null,
          dots: state.dots ?? null,
          morningDone: state.morningDone ?? null,
          reflectDone: state.reflectDone ?? null,
          eveningDone: state.eveningDone ?? null,
          reflectAvailable: state.reflectAvailable ?? null,
          contemplationMin: state.contemplationMin ?? null,
          contemplationGoalMin: state.contemplationGoalMin ?? null,
          updatedAt: state.updatedAt ?? null,
          heroKind: state.heroKind ?? null,
          heroEyebrow: state.heroEyebrow ?? null,
          heroTitle: state.heroTitle ?? null,
          heroSubtitle: state.heroSubtitle ?? null,
          heroCta: state.heroCta ?? null,
          heroDeepLink: state.heroDeepLink ?? null,
        });
        window.localStorage.setItem("phoebe:persist:widget", payload);
        // Belt-and-suspenders: also write directly to Preferences in case
        // the wireDurableStorage interceptor hasn't installed yet (e.g.
        // a very early call during bootstrap).
        Preferences.set({ key: "phoebe:persist:widget", value: payload }).catch(() => {});
        // Write to the shared App Group + refresh the widget via the native
        // plugin — Capacitor Preferences only touches UserDefaults.standard,
        // which the widget extension (a separate process) cannot read.
        const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, { update?: (o: { data: string }) => Promise<void> }> } }).Capacitor;
        cap?.Plugins?.PhoebeWidget?.update?.({ data: payload })?.catch(() => {});
      } catch {
        /* ignore — widget updates are best-effort */
      }
    },
    isNative() {
      return Capacitor.isNativePlatform();
    },
    async openInAppBrowser(url: string) {
      if (!url) return;
      // Prefer the native BibleBrowser plugin (custom WKWebView wrapped
      // in a UINavigationController) — its Done button stays pinned at
      // the top of the screen for the whole reading session, where
      // SFSafariViewController auto-collapses its top toolbar on scroll
      // and hides the only way back to the liturgy. If the plugin
      // isn't registered (older bundle, web build), fall through to
      // the SFSafariViewController path via Browser.open, then to
      // window.open as a last resort.
      try {
        const cap = (window as { Capacitor?: { Plugins?: Record<string, { open?: (opts: { url: string }) => Promise<void> }> } }).Capacitor;
        const biblePlugin = cap?.Plugins?.BibleBrowser;
        if (biblePlugin?.open) {
          await biblePlugin.open({ url });
          return;
        }
      } catch (err) {
        console.warn("[PhoebeNative] BibleBrowser.open failed, falling back:", err);
      }
      try {
        await Browser.open({ url });
      } catch (err) {
        console.error("[PhoebeNative] Browser.open failed:", err);
        try {
          window.open(url, "_blank");
        } catch {
          /* ignore */
        }
      }
    },
    // Open a URL in Safari's READER VIEW (SFSafariViewController with
    // entersReaderIfAvailable) — used for newsletters. The reader-view plugin
    // method emits phoebe:browserfinished on dismiss, so callers can mark the
    // newsletter read only once it's closed. Falls back to the normal in-app
    // browser when the plugin/method isn't present (older bundle, web).
    async openReaderView(url: string) {
      if (!url) return;
      const cap = (window as { Capacitor?: { Plugins?: Record<string, { openReader?: (opts: { url: string }) => Promise<void> }> } }).Capacitor;
      const bible = cap?.Plugins?.BibleBrowser;
      if (bible?.openReader) {
        try { await bible.openReader({ url }); return; }
        catch (err) { console.warn("[PhoebeNative] openReader failed, falling back:", err); }
      }
      await this.openInAppBrowser?.(url);
    },
    async preloadInAppBrowser(url: string) {
      // Best-effort warm: start loading `url` in a background WKWebView so a
      // later openInAppBrowser shows it instantly. No-op if the plugin isn't
      // registered (web build, older bundle) or anything throws.
      if (!url) return;
      try {
        const cap = (window as { Capacitor?: { Plugins?: Record<string, { preload?: (opts: { url: string }) => Promise<void> }> } }).Capacitor;
        await cap?.Plugins?.BibleBrowser?.preload?.({ url });
      } catch {
        /* preload is best-effort */
      }
    },
    async setBadge(count: number) {
      // No-op on web — there is no icon to badge.
      if (!Capacitor.isNativePlatform()) return;
      const clamped = Math.max(0, Math.floor(count));
      try {
        const cap = (window as {
          Capacitor?: {
            Plugins?: Record<string, { setBadge?: (opts: { count: number }) => Promise<void> }>;
          };
        }).Capacitor;
        const plugin = cap?.Plugins?.PhoebeBadge;
        if (plugin?.setBadge) {
          await plugin.setBadge({ count: clamped });
        }
      } catch (err) {
        // Best-effort — badge state isn't critical to app function.
        console.warn("[PhoebeNative] setBadge failed:", err);
      }
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
  wirePushActionListener();
  registerForPushIfRequested();
  wireClearNotifications();
  wireStepsNotificationExpiry();
  wirePrayerBellExpiry();
  wireNativeShare();
  wireNativePrint();
  wireNativeOpenUrl();
  wireHaptics();
  wireContacts();
  wireBiometricLock();
  wireLocalNotifications();
  wireRestReminders();
  wireContemplation();
  wireDurableStorage();
  wireLifecycle();
})();
