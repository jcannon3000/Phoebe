import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { isNativeShell } from "@/lib/isNativeShell";
import { EARTH_PHOTOS } from "@/lib/earthPhotos";

// ── /invite ───────────────────────────────────────────────────────────────
//
// Where the menu's "Invite" row (shareInvite.ts) points.
//
// On iOS Safari, "the website" isn't the useful thing to show — the App Store
// listing is — so we skip straight there instead of making the visitor find a
// download link themselves. Android/desktop see the page itself, since
// there's no Play Store listing yet to redirect to.
//
// NOTE: this does NOT currently skip people who already have Phoebe. That
// would need /invite in the Universal Links association file
// (phoebe-mobile/assets/apple-app-site-association), which today lists only
// /communities/join/*, /m/*, /lectio/*, /moments/*, /prayer-requests/* and
// /dashboard — and still carries the literal TEAM_ID placeholder, so
// Universal Links don't resolve at all yet. Until that's filled in, an
// existing user who taps an invite link lands on the App Store listing,
// which shows OPEN rather than GET — acceptable, but not the ideal path.
//
// The page NEVER renders blank: we keep the full content mounted under the
// redirect rather than returning null, so a blocked/failed navigation (a
// content blocker, offline, a restrictive in-app WebView) leaves a usable
// page with a tappable App Store link instead of a black screen. See the
// "never return null while gating" invariant in the project's memory.

const APP_STORE_URL = "https://apps.apple.com/us/app/phoebe-prayer-together/id6763552921";
const BG = "#091A10";
const WARM = "#F0EDE6";
const SAGE = "#8FAF96";
const FONT = "'Space Grotesk', system-ui, sans-serif";

function isIOSWeb(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  if (isNativeShell()) return false; // already have the app — never redirect our own shell
  return true;
}

export default function InvitePage() {
  const { t } = useTranslation();
  // Redirect immediately, not on a delay — this page's whole job on iOS is
  // to be a way-station, not a landing experience.
  useState(() => {
    if (isIOSWeb()) window.location.replace(APP_STORE_URL);
    return null;
  });
  useEffect(() => {
    document.title = "You're invited — Phoebe";
  }, []);
  const bgPhoto = useState(() => (EARTH_PHOTOS.length > 0 ? EARTH_PHOTOS[Math.floor(Math.random() * EARTH_PHOTOS.length)]! : null))[0];

  // Deliberately NO `if (redirecting) return null` here. On iOS the navigation
  // above wins long before this paints, so rendering the page costs nothing —
  // but if the redirect is ever blocked (content blocker, offline, a locked-down
  // in-app WebView), the visitor gets this usable page with a tappable App
  // Store link instead of a permanently black screen.
  return (
    <div className="relative min-h-[100dvh] flex flex-col" style={{ background: BG, color: WARM, fontFamily: FONT, isolation: "isolate" }}>
      {bgPhoto && (
        <>
          <img src={bgPhoto} alt="" aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.28, zIndex: -1 }} />
          <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, background: "linear-gradient(180deg, rgba(8,18,12,0.55) 0%, rgba(8,18,12,0.75) 60%, rgba(8,18,12,0.9) 100%)" }} />
        </>
      )}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16 max-w-md mx-auto">
        <p className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-4" style={{ color: "rgba(143,175,150,0.7)" }}>
          {t("invite.eyebrow", { defaultValue: "You're invited" })}
        </p>
        <h1 className="text-[28px] font-semibold leading-tight mb-5">
          {t("invite.title", { defaultValue: "Someone thought you'd want to pray with them" })}
        </h1>
        <p className="text-[15px] leading-relaxed mb-8" style={{ color: SAGE, fontFamily: "Georgia, serif" }}>
          {t("invite.body", {
            defaultValue:
              "Phoebe is a quiet way to keep a daily prayer rhythm — the Book of Common Prayer, contemplation, the Examen — and to share that rhythm with your church community. Someone invited you into their prayer life; Phoebe is how they keep it, and how you can join them in it.",
          })}
        </p>
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noreferrer"
          className="rounded-full px-8 py-3.5 text-sm font-medium tracking-wide transition-opacity hover:opacity-90 active:scale-[0.98] mb-4"
          style={{ background: "#2D5E3F", color: WARM, border: "1px solid rgba(46,107,64,0.7)" }}
        >
          {t("invite.get_the_app", { defaultValue: "Get Phoebe on the App Store" })}
        </a>
        <Link href="/" className="text-[13px] underline" style={{ color: "rgba(143,175,150,0.75)" }}>
          {t("invite.continue_web", { defaultValue: "Continue on the web instead" })}
        </Link>
      </div>
    </div>
  );
}
