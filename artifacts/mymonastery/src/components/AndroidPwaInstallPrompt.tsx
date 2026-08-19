import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";
import { isFirstOpen } from "@/lib/firstOpen";

// Android web, first-time visitor only: invite them to install the PWA to
// their home screen. Owner: "for android users if they come to it for the
// first time, after they go through the slideshow, it invites them to
// install the web app on their home screen."
//
// (The literal first-open intro SLIDESHOW was retired earlier — new users
// land straight on the seeded home, see lib/firstOpenOnboarding.ts. This
// fires once that first landing has settled, the closest current
// equivalent to "after the slideshow": first open, home reached, isn't
// already installed.)
//
// Chrome on Android fires `beforeinstallprompt` when the page is
// installable; capturing it lets us trigger the REAL native install
// dialog from our own button instead of just linking out to instructions.
// Firefox/other Android browsers never fire it — for those we fall back to
// manual "Add to Home Screen" copy so the banner still does something.
const DISMISS_KEY = "phoebe:android-pwa-prompt-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

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

function isAndroidWeb(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (isNativeShell()) return false;
  if (isStandalone()) return false; // already installed
  return /Android/.test(navigator.userAgent);
}

// Prayer surfaces the banner must never cover — mirrors DesktopAppPrompt.
const QUIET_PREFIXES = ["/bcp", "/prayer-mode", "/rule-of-life", "/cobreathe", "/contemplation", "/psalms", "/overview-deck", "/church-deck"];

export function AndroidPwaInstallPrompt() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const [show, setShow] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!isAndroidWeb()) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  useEffect(() => {
    if (!isAndroidWeb()) return;
    if (isLoading) return;
    // First-time visitor only — isFirstOpen() is module-cached per launch,
    // so calling it here (after OpeningSplash/useSplashCleared already
    // called it) safely reads the SAME result without re-triggering it.
    if (!isFirstOpen()) return;
    if (user && !user.onboardingCompleted) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch { /* private mode — show it */ }
    // Give the first-open landing a beat to settle before the banner slides
    // up — same pacing as DesktopAppPrompt.
    const id = window.setTimeout(() => setShow(true), 4000);
    return () => window.clearTimeout(id);
  }, [user, isLoading]);

  if (!show) return null;
  if (QUIET_PREFIXES.some((p) => location.startsWith(p))) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  };

  const install = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        await deferredPrompt.userChoice;
      } catch { /* user dismissed the native dialog — non-fatal */ }
      setDeferredPrompt(null);
    }
    dismiss();
  };

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4"
      style={{
        bottom: 0,
        paddingTop: "0.75rem",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        animation: "phoebe-android-prompt-slide 360ms ease-out",
      }}
      role="dialog"
      aria-label={t("android_prompt.title", { defaultValue: "Install Phoebe" })}
    >
      <style>{`
        @keyframes phoebe-android-prompt-slide {
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
            {t("android_prompt.title", { defaultValue: "Add Phoebe to your home screen" })}
          </p>
          <p
            className="text-[12px] mt-0.5 leading-snug"
            style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {deferredPrompt
              ? t("android_prompt.body_installable", { defaultValue: "Install Phoebe for quick, full-screen access to your daily rhythm." })
              : t("android_prompt.body_manual", { defaultValue: "Open your browser menu and choose \"Add to Home screen\" for quick, full-screen access." })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
          {deferredPrompt ? (
            <button
              type="button"
              onClick={install}
              className="text-[12px] font-semibold rounded-full px-3.5 py-1.5 whitespace-nowrap"
              style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif", border: "none", cursor: "pointer" }}
            >
              {t("android_prompt.cta_install", { defaultValue: "Install" })}
            </button>
          ) : null}
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
