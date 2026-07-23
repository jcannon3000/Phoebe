import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";
import { PHOEBE_GUEST_ENABLED } from "@/lib/guestFlag";

// Bottom banner for desktop web visitors: GET THE iPHONE APP (owner — the
// bottom banner should be about downloading the iOS app, not installing the
// PWA; the old beforeinstallprompt machinery is gone). Pinned to the bottom
// like the offline banner + the iOS-Safari download prompt. iOS Safari itself
// is covered by IOSAppDownloadPrompt, and Android is excluded (an iOS app is
// no use there). Dismissible once, device-local; hidden inside prayer
// surfaces so it never covers an office.

const APP_STORE_URL = "https://apps.apple.com/us/app/phoebe-prayer-together/id6763552921";
const DISMISS_KEY = "phoebe:ios-app-banner-dismissed";

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function isDesktopWeb(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (isNativeShell()) return false; // already in the app
  if (isStandalone()) return false; // installed PWA — leave it be
  const ua = navigator.userAgent;
  // iOS Safari (incl. iPad-as-desktop) is IOSAppDownloadPrompt's job.
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) return false;
  if (/Android/.test(ua)) return false;
  if (window.innerWidth < 768) return false;
  return true;
}

// Prayer surfaces the banner must never cover.
const QUIET_PREFIXES = ["/bcp", "/prayer-mode", "/rule-of-life", "/cobreathe", "/contemplation", "/psalms"];

export function DesktopAppPrompt() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isDesktopWeb()) return;
    if (isLoading) return;
    // Guests included — the public version's web visitors are exactly who
    // should hear about the app; signed-in users wait for onboarding.
    if (!user && !PHOEBE_GUEST_ENABLED) return;
    if (user && !user.onboardingCompleted) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch { /* private mode — show it */ }
    const id = window.setTimeout(() => setShow(true), 4000);
    return () => window.clearTimeout(id);
  }, [user, isLoading]);

  if (!show) return null;
  if (QUIET_PREFIXES.some((p) => location.startsWith(p))) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4"
      style={{
        // Pinned to the BOTTOM (like the offline banner + the iOS download
        // prompt) so banners never cover the header.
        bottom: 0,
        paddingTop: "0.75rem",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        animation: "phoebe-desktop-prompt-slide 360ms ease-out",
      }}
      role="dialog"
      aria-label={t("desktop_prompt.ios_title", { defaultValue: "Get the Phoebe app" })}
    >
      <style>{`
        @keyframes phoebe-desktop-prompt-slide {
          from { opacity: 0; transform: translateY(24px); }
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
            {t("desktop_prompt.ios_title", { defaultValue: "Phoebe is on iPhone too" })}
          </p>
          <p
            className="text-[12px] mt-0.5 leading-snug"
            style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {t("desktop_prompt.ios_body", { defaultValue: "You're all set here on the web — and Phoebe's on iPhone too, for the offices, silence, and gentle reminders in your pocket." })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="text-[12px] font-semibold rounded-full px-3.5 py-1.5 whitespace-nowrap"
            style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", textDecoration: "none" }}
          >
            {t("desktop_prompt.ios_cta", { defaultValue: "Get the app" })}
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "rgba(143,175,150,0.55)", background: "none", border: "none", cursor: "pointer" }}
          >
            {t("desktop_prompt.dismiss", { defaultValue: "Not now" })}
          </button>
        </div>
      </div>
    </div>
  );
}
