import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

// Bottom-of-screen prompt nudging mobile-Safari visitors to download
// the native Phoebe app from the App Store. Apple's Smart App Banner
// (the `apple-itunes-app` meta tag in index.html) covers the thin
// strip case at the top, but iOS only shows that on a fresh visit and
// it's easy to miss; this component is a more deliberate, dismissible
// CTA we surface ourselves.
//
// Gating:
//   1. Visible only on iOS — never inside the Capacitor shell
//      (PhoebeNative.isNative()), never on desktop, never on Android.
//      Android users get no prompt because there's no Android build
//      to point them at yet. Includes Chrome/Firefox on iOS (still iOS
//      under the hood) and in-app browsers.
//   2. Hidden if the viewer is signed in — useAuth resolves to a real
//      user means they have an account already. The prompt is for new
//      visitors evaluating whether to try Phoebe.
//   3. Dismissible — `phoebe:ios-app-prompt-dismissed` localStorage
//      key suppresses subsequent renders. Tapping the Download button
//      also stamps the key (we did our job; don't re-prompt on return).
//   4. Delayed by 1.5s on mount + after auth resolves so it doesn't
//      slam onto the page mid-route-transition or flash before we
//      know whether they're signed in. Slides up from the bottom.

const APP_STORE_URL = "https://apps.apple.com/us/app/phoebe-prayer-together/id6763552921";
const DISMISS_KEY = "phoebe:ios-app-prompt-dismissed";

function isIOSWeb(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  // iOS UA detection — both iPhone/iPad and iPad-on-desktop-mode
  // (which reports Macintosh + touch). The latter is rare on modern
  // iPads but cheap to detect.
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;

  // Skip when we're inside our own native shell — those users already
  // have the app. Chrome on iOS, Firefox on iOS, and in-app browsers
  // (FBAN/FBAV/Instagram) are all fine targets — the goal is "iOS,
  // not in our app".
  const isOurNativeShell = !!(window as { PhoebeNative?: { isNative?: () => boolean } })
    .PhoebeNative?.isNative?.();
  if (isOurNativeShell) return false;

  return true;
}

export function IOSAppDownloadPrompt() {
  const { user, isLoading } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIOSWeb()) return;
    if (isLoading) return; // wait for auth to resolve
    if (user) return; // signed in → not the audience
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch { /* private mode — fall through to show */ }
    const t = window.setTimeout(() => setShow(true), 1500);
    return () => window.clearTimeout(t);
  }, [isLoading, user]);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* non-fatal */ }
  }

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{
        bottom: 0,
        animation: "phoebe-ios-prompt-slide 360ms ease-out",
      }}
      role="dialog"
      aria-label="Download the Phoebe app"
    >
      <style>{`
        @keyframes phoebe-ios-prompt-slide {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className="mx-auto rounded-2xl flex items-stretch gap-3 p-3 max-w-md"
        style={{
          background: "#0F2818",
          border: "1px solid rgba(46,107,64,0.45)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        <img
          src="/favicon.png"
          alt=""
          className="w-12 h-12 rounded-xl shrink-0 self-center object-cover"
          style={{ border: "1px solid rgba(46,107,64,0.35)" }}
        />
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <p
            className="text-[14px] font-semibold leading-tight"
            style={{ color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Get the Phoebe app
          </p>
          <p
            className="text-[12px] mt-0.5 leading-snug"
            style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Daily prayer notifications, smoother slideshow.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              // Mark dismissed once they tap through — we've done our
              // job; if they come back here we don't want to re-prompt.
              try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* non-fatal */ }
            }}
            className="text-[12px] font-semibold rounded-full px-3.5 py-1.5 whitespace-nowrap"
            style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Download
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "rgba(143,175,150,0.55)" }}
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
