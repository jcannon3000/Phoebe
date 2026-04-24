import type { CapacitorConfig } from "@capacitor/cli";
import { KeyboardResize, KeyboardStyle } from "@capacitor/keyboard";

// Capacitor configuration for Phoebe Mobile.
//
// Architecture note: `webDir` is `www/`, populated at build time by
// `scripts/compose-www.mjs`, which copies the production mymonastery build
// (`artifacts/mymonastery/dist/public/`) and then injects our native-shell
// bootstrap <script> into index.html. The mymonastery source is never
// modified — it stays the single source of truth for UI. Phoebe Mobile adds
// *only* the native shell (push registration, haptics, safe-area wiring,
// keyboard behavior, deep-link handlers, Sign in with Apple).
const config: CapacitorConfig = {
  appId: "app.withphoebe.mobile",
  appName: "Phoebe",
  webDir: "www",
  // iOS-specific configuration. We deliberately do NOT set `server.url` —
  // that would turn this into a thin web-view pointing at withphoebe.app,
  // which is the pattern Apple rejects under Guideline 4.2. Instead we ship
  // the bundled mymonastery build and only hit the API for data.
  ios: {
    // Allow http://localhost only if a dev server is running; prod uses
    // the bundled assets served from the app bundle via capacitor://.
    contentInset: "never",
    // WKWebView's default is grey; Phoebe's dark theme needs a matching
    // background so there's no flash between splash teardown and app
    // hydration.
    backgroundColor: "#091A10",
    // Scrolling physics: WKWebView momentum is on by default; keep it.
    scrollEnabled: true,
    // Limits JS engine to the stricter Safari behavior so what works in
    // Capacitor also works in Safari-on-iOS — no surprise regressions when
    // we copy bug reports between the two.
    limitsNavigationsToAppBoundDomains: true,
    // Handle the hardware swipe-back gesture natively instead of letting
    // the WebView swallow it.
    // (Wired up in Swift via WKUIDelegate; kept here as a documented intent.)
  },
  plugins: {
    // Route window.fetch through the native HTTP stack so cross-origin
    // requests to withphoebe.app use NSHTTPCookieStorage instead of
    // WKWebView's third-party-cookie-blocked jar. Without this, the login
    // cookie set by /api/auth/login on `withphoebe.app` is never sent back
    // on /api/auth/me from `capacitor://localhost`, and auth fails silently.
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
    SplashScreen: {
      // We want a short splash so the app feels snappy. Our native shell
      // hides the splash as soon as the React app has mounted and signaled
      // readiness (see src/native-shell.ts). The "launch" image in the
      // Xcode project is the actual first paint — this is just insurance.
      launchShowDuration: 500,
      launchAutoHide: false,       // We hide it manually on app-ready
      backgroundColor: "#091A10",
      showSpinner: false,
      iosSpinnerStyle: "small",
      splashFullScreen: true,
      splashImmersive: false,
    },
    PushNotifications: {
      // "true" on iOS causes a permission prompt the moment we call
      // register(). We defer registration until the user opts in via the
      // bell-setup UI so the prompt lands in-context (higher opt-in rate).
      presentationOptions: ["badge", "sound", "alert"],
    },
    Keyboard: {
      // "none" means the webview doesn't resize when the keyboard appears;
      // instead we use env(keyboard-inset-height) + safe-area insets in
      // CSS to pad inputs. This avoids the classic Capacitor quirk where
      // the webview resize fight with Flexbox layouts causes jank.
      resize: KeyboardResize.None,
      resizeOnFullScreen: true,
      style: KeyboardStyle.Dark,
    },
    LocalNotifications: {
      // A muted bell icon that matches Phoebe's palette. Referenced at
      // notification-schedule time via `icon: "phoebe_bell"`.
      iconColor: "#2E6B40",
    },
    Contacts: {
      // iOS Info.plist key written by `cap sync` for contact access.
      // Shown in the system permission prompt when the user taps
      // "Invite from contacts" — has to explain WHY we need the data
      // or Apple rejects the app under 5.1.1. Keep the wording honest:
      // we only read names + emails, only when the user asks, only to
      // suggest people to invite; we never upload the full address book.
      iosNSContactsUsageDescription:
        "Phoebe uses your contacts only to suggest people to invite to your prayer circles. Contacts stay on your device unless you choose to invite someone.",
    },
    NativeBiometric: {
      // Shown by iOS the first time Phoebe calls verifyIdentity (e.g. after
      // the user opts into "Lock Phoebe with Face ID" in account settings).
      // Keep it honest: Face ID isn't a second factor for a server auth,
      // it's a device-level re-confirmation that protects prayer intentions
      // from whoever else picks up an unlocked phone.
      iosNSFaceIDUsageDescription:
        "Phoebe uses Face ID so only you can open your prayer intentions, even if your phone is already unlocked.",
    },
    Preferences: {
      // Point Capacitor Preferences at the shared App Group on iOS so the
      // Home Screen widget (which reads UserDefaults(suiteName: ...)) sees
      // the same data the web app writes via `PhoebeNative.updateWidget`.
      // Requires the App Group entitlement to be enabled on BOTH the
      // App target and the PhoebeWidget target in Xcode — the README
      // walks through that. Harmless on Android (ignored).
      group: "group.app.withphoebe.mobile",
    },
  },
  // Universal link domains. When `apple-app-site-association` is served
  // at https://withphoebe.app/.well-known/apple-app-site-association with
  // this app's Team ID + bundle ID, tapping a Phoebe link anywhere on iOS
  // opens the app instead of Safari. The deep-link handler in
  // src/native-shell.ts routes the path into Wouter.
  server: {
    // Setting androidScheme keeps the local scheme consistent; iOS uses
    // `capacitor://localhost` by default so we don't override it.
    androidScheme: "https",
  },
};

export default config;
