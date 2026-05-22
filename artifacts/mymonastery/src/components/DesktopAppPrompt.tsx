import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";

// Top-of-screen banner that runs once for desktop visitors after they
// reach the home screen. Phoebe is built for the phone — push
// notifications, the slideshow gestures, the daily rhythm all assume
// a pocket device — so a desktop sign-up should be nudged toward the
// iOS app rather than left to discover this on their own.
//
// Gating mirrors IOSAppDownloadPrompt:
//   1. Desktop only — never on iOS / Android / inside the native shell.
//      The iOS web variant already covers mobile-Safari visitors.
//   2. Signed in + onboarding complete — we wait until they're on the
//      home screen so the banner doesn't crash the sign-up flow.
//   3. Dismissible — phoebe:desktop-app-prompt-dismissed localStorage
//      key suppresses subsequent renders. "Get the app" tap also
//      stamps the key.
//   4. Brief mount delay so it doesn't flash mid route transition.

const APP_STORE_URL = "https://apps.apple.com/us/app/phoebe-prayer-together/id6763552921";
const DISMISS_KEY = "phoebe:desktop-app-prompt-dismissed";

function isDesktopWeb(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;

  // Inside our Capacitor shell → user already has the app.
  if (isNativeShell()) return false;

  const ua = navigator.userAgent;
  // iPad-on-desktop-mode (Macintosh UA + multi-touch) reads as iOS — the
  // IOSAppDownloadPrompt covers it. Exclude here to avoid double-banner.
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) return false;

  // Android also gets handled separately (currently no Android build,
  // so no prompt). Exclude to keep this strictly desktop.
  if (/Android/.test(ua)) return false;

  // Heuristic for "desktop-sized window" — keeps the banner from
  // rendering on a narrow browser column or a small split-screen.
  if (window.innerWidth < 768) return false;

  return true;
}

export function DesktopAppPrompt() {
  const { user, isLoading } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isDesktopWeb()) return;
    if (isLoading) return;
    if (!user) return;
    if (!user.onboardingCompleted) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch { /* private mode — fall through to show */ }
    const t = window.setTimeout(() => setShow(true), 1200);
    return () => window.clearTimeout(t);
  }, [isLoading, user]);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* non-fatal */ }
  }

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4"
      style={{
        top: 0,
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "0.75rem",
        animation: "phoebe-desktop-prompt-slide 360ms ease-out",
      }}
      role="dialog"
      aria-label="Phoebe is best on your phone"
    >
      <style>{`
        @keyframes phoebe-desktop-prompt-slide {
          from { opacity: 0; transform: translateY(-24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className="mx-auto rounded-2xl flex items-stretch gap-3 p-3 max-w-2xl"
        style={{
          background: "#0F2818",
          border: "1px solid rgba(46,107,64,0.45)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.4)",
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
            Phoebe is built for your phone
          </p>
          <p
            className="text-[12px] mt-0.5 leading-snug"
            style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Daily prayer notifications, smoother slideshow — get the iOS app.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* non-fatal */ }
            }}
            className="text-[12px] font-semibold rounded-full px-3.5 py-1.5 whitespace-nowrap"
            style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Get the app →
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
