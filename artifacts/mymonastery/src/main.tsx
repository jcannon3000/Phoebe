import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { recoverFromStaleChunk } from "./lib/staleChunk";
import { installGlobalErrorReporting } from "./lib/reportClientError";
import { preloadSplashPhoto } from "./lib/earthPhotos";
import { isNativeShell } from "./lib/isNativeShell";
// Boot i18next before mounting the tree so the very first render
// reads from the resource tables. Fallback to English if Spanish
// hasn't been activated. Runs as a side-effect import — there's no
// React provider needed; react-i18next reads from the singleton.
import "./i18n";

// Stale-deploy recovery. Our routes are code-split (React.lazy), so a
// browser still running a pre-deploy page can try to import() a chunk
// filename the new deploy has removed. Vite fires `vite:preloadError`
// when that dynamic import fails; reload (network-first nav pulls the
// fresh index + chunks) instead of letting the route silently fail.
// recoverFromStaleChunk() guards against reload loops.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault(); // we handle it ourselves by reloading
  recoverFromStaleChunk("vite:preloadError");
});

// Forward uncaught errors + unhandled promise rejections (the ones that never
// reach a React ErrorBoundary) to our server → Sentry. See lib/reportClientError.
installGlobalErrorReporting();

// Warm the splash/office-load photo before the tree mounts, so the very first
// screen paints WITH its image rather than flashing the background colour and
// swapping the photo in a beat later.
preloadSplashPhoto();

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker in production. Dev mode deliberately
// skips it so Vite's HMR stays the source of truth for assets.
// Rationale for the SW at all: captive-portal / flaky Wi-Fi commonly
// drops the first TLS handshake of the day; a cached shell lets the
// user still load the UI and see a helpful NetworkBanner instead of
// Safari's unactionable "Can't establish secure connection" page.
//
// NEVER inside the native shell. The Capacitor iOS config sets
// `server.iosScheme: "https"` (needed for YouTube embeds to work), which
// means `window.location.protocol === "https:"` is ALSO true inside the
// native app — so this SW was silently registering there too, even though
// its whole rationale (surviving a dropped connection) doesn't apply the
// same way and its shell-HTML cache can outlive an app UPDATE. Capacitor
// ships a fresh JS bundle inside every new binary; there's no reason for
// a cache layer designed for flaky mobile-web Wi-Fi to sit in front of
// it, and every reason it could make an update look like it didn't take —
// exactly the "TestFlight rebuilt but the app still shows old behavior"
// symptom this was found chasing. Checked inside the `load` handler
// (not the outer synchronous condition) so it runs as late as possible,
// after the native shell's bootstrap script has had every chance to set
// `window.PhoebeNative` first.
if (
  "serviceWorker" in navigator &&
  import.meta.env.PROD &&
  window.location.protocol === "https:"
) {
  window.addEventListener("load", () => {
    if (isNativeShell()) {
      // Every earlier native build registered this SW (the bug above), so
      // a device that already has one installed needs it actively torn
      // down — skipping registration from here on doesn't remove what's
      // already sitting in WKWebView's on-disk storage, which normally
      // persists across a TestFlight update. Best-effort; a failure here
      // just means the stale SW lingers one more launch, not a crash.
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => { /* best effort */ });
      if (typeof caches !== "undefined") {
        caches.keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => { /* best effort */ });
      }
      return;
    }
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/service-worker.js`)
      .catch((err) => {
        // Non-fatal — the app still works without the SW, it just
        // won't survive a dropped network.
        console.warn("[sw] registration failed:", err);
      });
  });
}
