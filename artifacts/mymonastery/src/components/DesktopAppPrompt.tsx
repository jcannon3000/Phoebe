import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { isNativeShell } from "@/lib/isNativeShell";

// Top-of-screen banner that runs once for desktop visitors after they reach the
// home screen — now offering to INSTALL Phoebe as a desktop app (PWA) rather
// than pushing them to the iPhone App Store. Phoebe ships a web manifest + a
// service worker + web push, so a desktop install gives a real windowed app
// with reminders.
//   • Chromium (Chrome/Edge/Brave): we capture `beforeinstallprompt` and the
//     button triggers the native install.
//   • Safari (macOS Sonoma+): no programmatic install, so we show the "Add to
//     Dock" guidance instead.
//   • Already installed (display-mode: standalone) or inside our native shell →
//     never shows.
//
// Gating otherwise mirrors the old prompt: desktop only, signed-in + onboarded,
// dismissible (phoebe:desktop-app-prompt-dismissed), brief mount delay.

const DISMISS_KEY = "phoebe:desktop-app-prompt-dismissed";

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

function isDesktopWeb(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  // Inside our Capacitor shell → user already has the app.
  if (isNativeShell()) return false;
  // Already installed as a standalone app → nothing to offer.
  if (isStandalone()) return false;

  const ua = navigator.userAgent;
  // iPad-on-desktop-mode (Macintosh UA + multi-touch) reads as iOS — the
  // IOSAppDownloadPrompt covers it. Exclude here to avoid a double-banner.
  const isIOS = /iPad|iPhone|iPod/.test(ua)
    || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (isIOS) return false;
  if (/Android/.test(ua)) return false;
  // "Desktop-sized window" heuristic — keeps it off a narrow column.
  if (window.innerWidth < 768) return false;

  return true;
}

export function DesktopAppPrompt() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [location] = useLocation();
  // Never nudge mid-customize — a new user setting up their rhythm shouldn't
  // be interrupted by the install banner.
  const onCustomize = location.includes("rule-of-life");

  // Capture the install opportunity as early as possible (the event can fire
  // before our gating delay), and hide once installed.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep Chrome's own mini-infobar from showing
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setShow(false);
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* non-fatal */ }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (!isDesktopWeb()) return;
    if (isLoading) return;
    if (!user) return;
    if (!user.onboardingCompleted) return;
    if (onCustomize) return; // not during the customize flow
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch { /* private mode — fall through to show */ }
    const id = window.setTimeout(() => setShow(true), 1200);
    return () => window.clearTimeout(id);
  }, [isLoading, user, onCustomize]);

  if (!show || onCustomize) return null;

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* non-fatal */ }
  }

  async function install() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch { /* user dismissed the native sheet — non-fatal */ }
    setDeferred(null);
    dismiss();
  }

  // Safari (and any browser that didn't fire beforeinstallprompt) can't be
  // installed programmatically — guide the user to the browser's own menu.
  const isSafari = /^((?!chrome|android|crios|edg).)*safari/i.test(navigator.userAgent);
  const canInstall = !!deferred;

  return (
    <div
      className="fixed left-0 right-0 z-50 px-4"
      style={{
        top: 0,
        paddingTop: "max(0.75rem, var(--safe-top))",
        paddingBottom: "0.75rem",
        animation: "phoebe-desktop-prompt-slide 360ms ease-out",
      }}
      role="dialog"
      aria-label={t("desktop_prompt.install_title", { defaultValue: "Install Phoebe" })}
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
            {t("desktop_prompt.install_title", { defaultValue: "Install Phoebe on your desktop" })}
          </p>
          <p
            className="text-[12px] mt-0.5 leading-snug"
            style={{ color: "#8FAF96", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {canInstall
              ? t("desktop_prompt.install_body", { defaultValue: "Run Phoebe in its own window, with daily reminders — one click to install." })
              : isSafari
                ? t("desktop_prompt.install_safari", { defaultValue: "In Safari's File menu, choose “Add to Dock” to keep Phoebe a tap away." })
                : t("desktop_prompt.install_generic", { defaultValue: "Use your browser menu (⋮ → Install) to keep Phoebe in its own window." })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0 self-center">
          {canInstall ? (
            <button
              type="button"
              onClick={install}
              className="text-[12px] font-semibold rounded-full px-3.5 py-1.5 whitespace-nowrap"
              style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {t("desktop_prompt.install_cta", { defaultValue: "Install" })}
            </button>
          ) : (
            <button
              type="button"
              onClick={dismiss}
              className="text-[12px] font-semibold rounded-full px-3.5 py-1.5 whitespace-nowrap"
              style={{ background: "#2D5E3F", color: "#F0EDE6", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {t("desktop_prompt.got_it", { defaultValue: "Got it" })}
            </button>
          )}
          <button
            type="button"
            onClick={dismiss}
            className="text-[10px] uppercase tracking-[0.12em]"
            style={{ color: "rgba(143,175,150,0.55)" }}
          >
            {t("desktop_prompt.not_now", { defaultValue: "Not now" })}
          </button>
        </div>
      </div>
    </div>
  );
}
